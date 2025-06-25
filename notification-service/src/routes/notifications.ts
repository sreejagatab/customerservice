/**
 * Notification Routes
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { NotificationQueueService, NotificationJob } from '@/services/notification-queue';
import { TemplateService } from '@/services/template-service';
import { PreferenceService } from '@/services/preference-service';
import { AnalyticsService } from '@/services/analytics-service';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();
const queueService = NotificationQueueService.getInstance();
const templateService = TemplateService.getInstance();
const preferenceService = PreferenceService.getInstance();
const analyticsService = AnalyticsService.getInstance();

/**
 * Send notification
 * POST /api/v1/notifications/send
 */
router.post('/send', [
  body('type').isIn(['email', 'sms', 'push', 'in_app', 'webhook']).withMessage('Invalid notification type'),
  body('recipientId').isString().notEmpty().withMessage('Recipient ID is required'),
  body('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  body('data.to').notEmpty().withMessage('Recipient address is required'),
  body('data.content').isString().notEmpty().withMessage('Content is required'),
  body('data.priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Invalid priority'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors.array(),
      },
    });
  }

  try {
    const { type, recipientId, organizationId, data } = req.body;

    // Check user preferences
    const preferences = await preferenceService.getUserPreferences(recipientId, organizationId);
    if (!preferences.channels[type]) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CHANNEL_DISABLED',
          message: `${type} notifications are disabled for this user`,
        },
      });
    }

    // Create notification job
    const notificationJob: NotificationJob = {
      id: uuidv4(),
      type,
      recipientId,
      organizationId,
      data: {
        ...data,
        priority: data.priority || 'normal',
      },
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    };

    // Queue the notification
    const success = await queueService.publishNotification(notificationJob);

    if (success) {
      // Track analytics
      await analyticsService.trackNotificationSent(organizationId, type);

      res.json({
        success: true,
        data: {
          notificationId: notificationJob.id,
          type,
          status: 'queued',
          scheduledAt: notificationJob.scheduledAt,
        },
      });
    } else {
      throw new Error('Failed to queue notification');
    }
  } catch (error) {
    logger.error('Failed to send notification', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'NOTIFICATION_SEND_FAILED',
        message: 'Failed to send notification',
      },
    });
  }
}));

/**
 * Send bulk notifications
 * POST /api/v1/notifications/bulk
 */
router.post('/bulk', [
  body('type').isIn(['email', 'sms', 'push', 'in_app']).withMessage('Invalid notification type'),
  body('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  body('recipients').isArray().withMessage('Recipients must be an array'),
  body('recipients.*.recipientId').isString().notEmpty().withMessage('Recipient ID is required'),
  body('recipients.*.to').notEmpty().withMessage('Recipient address is required'),
  body('data.content').isString().notEmpty().withMessage('Content is required'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors.array(),
      },
    });
  }

  try {
    const { type, organizationId, recipients, data } = req.body;
    const notificationIds: string[] = [];
    const failedRecipients: string[] = [];

    for (const recipient of recipients) {
      try {
        // Check user preferences
        const preferences = await preferenceService.getUserPreferences(recipient.recipientId, organizationId);
        if (!preferences.channels[type]) {
          failedRecipients.push(recipient.recipientId);
          continue;
        }

        // Create notification job
        const notificationJob: NotificationJob = {
          id: uuidv4(),
          type,
          recipientId: recipient.recipientId,
          organizationId,
          data: {
            ...data,
            to: recipient.to,
            priority: data.priority || 'normal',
          },
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date(),
        };

        // Queue the notification
        const success = await queueService.publishNotification(notificationJob);
        
        if (success) {
          notificationIds.push(notificationJob.id);
        } else {
          failedRecipients.push(recipient.recipientId);
        }
      } catch (error) {
        logger.error('Failed to queue bulk notification for recipient', {
          recipientId: recipient.recipientId,
          error: error instanceof Error ? error.message : String(error),
        });
        failedRecipients.push(recipient.recipientId);
      }
    }

    // Track analytics
    await analyticsService.trackBulkNotificationSent(organizationId, type, notificationIds.length);

    res.json({
      success: true,
      data: {
        totalSent: notificationIds.length,
        totalFailed: failedRecipients.length,
        notificationIds,
        failedRecipients,
      },
    });
  } catch (error) {
    logger.error('Failed to send bulk notifications', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'BULK_NOTIFICATION_FAILED',
        message: 'Failed to send bulk notifications',
      },
    });
  }
}));

/**
 * Get notification status
 * GET /api/v1/notifications/:id/status
 */
router.get('/:id/status', [
  param('id').isUUID().withMessage('Invalid notification ID'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid notification ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;
    
    // Get notification status from analytics service
    const status = await analyticsService.getNotificationStatus(id);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      });
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get notification status', {
      notificationId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_FETCH_FAILED',
        message: 'Failed to fetch notification status',
      },
    });
  }
}));

/**
 * Get notification history
 * GET /api/v1/notifications/history
 */
router.get('/history', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['email', 'sms', 'push', 'in_app', 'webhook']).withMessage('Invalid notification type'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: errors.array(),
      },
    });
  }

  try {
    const { organizationId, page = 1, limit = 20, type, recipientId } = req.query;
    
    const history = await analyticsService.getNotificationHistory({
      organizationId: organizationId as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      type: type as string,
      recipientId: recipientId as string,
    });

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.error('Failed to get notification history', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'HISTORY_FETCH_FAILED',
        message: 'Failed to fetch notification history',
      },
    });
  }
}));

export default router;
