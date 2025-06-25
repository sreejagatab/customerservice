/**
 * Analytics Routes
 */

import { Router, Request, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { AnalyticsService } from '@/services/analytics-service';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();
const analyticsService = AnalyticsService.getInstance();

/**
 * Get notification metrics
 * GET /api/v1/analytics/metrics
 */
router.get('/metrics', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
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
    const { organizationId, startDate, endDate, type } = req.query;
    
    const metrics = await analyticsService.getMetrics({
      organizationId: organizationId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      type: type as string,
    });

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Failed to get notification metrics', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_FETCH_FAILED',
        message: 'Failed to fetch notification metrics',
      },
    });
  }
}));

/**
 * Get delivery rates
 * GET /api/v1/analytics/delivery-rates
 */
router.get('/delivery-rates', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('period').optional().isIn(['hour', 'day', 'week', 'month']).withMessage('Invalid period'),
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
    const { organizationId, period = 'day', type } = req.query;
    
    const deliveryRates = await analyticsService.getDeliveryRates({
      organizationId: organizationId as string,
      period: period as string,
      type: type as string,
    });

    res.json({
      success: true,
      data: deliveryRates,
    });
  } catch (error) {
    logger.error('Failed to get delivery rates', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'DELIVERY_RATES_FETCH_FAILED',
        message: 'Failed to fetch delivery rates',
      },
    });
  }
}));

/**
 * Get engagement metrics
 * GET /api/v1/analytics/engagement
 */
router.get('/engagement', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
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
    const { organizationId, startDate, endDate } = req.query;
    
    const engagement = await analyticsService.getEngagementMetrics({
      organizationId: organizationId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: engagement,
    });
  } catch (error) {
    logger.error('Failed to get engagement metrics', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'ENGAGEMENT_FETCH_FAILED',
        message: 'Failed to fetch engagement metrics',
      },
    });
  }
}));

/**
 * Get real-time dashboard data
 * GET /api/v1/analytics/dashboard
 */
router.get('/dashboard', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
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
    const { organizationId } = req.query;
    
    const dashboard = await analyticsService.getDashboardData(organizationId as string);

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to get dashboard data', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_FETCH_FAILED',
        message: 'Failed to fetch dashboard data',
      },
    });
  }
}));

/**
 * Get top performing templates
 * GET /api/v1/analytics/top-templates
 */
router.get('/top-templates', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('period').optional().isIn(['day', 'week', 'month']).withMessage('Invalid period'),
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
    const { organizationId, limit = 10, period = 'week' } = req.query;
    
    const topTemplates = await analyticsService.getTopPerformingTemplates({
      organizationId: organizationId as string,
      limit: parseInt(limit as string),
      period: period as string,
    });

    res.json({
      success: true,
      data: topTemplates,
    });
  } catch (error) {
    logger.error('Failed to get top performing templates', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TOP_TEMPLATES_FETCH_FAILED',
        message: 'Failed to fetch top performing templates',
      },
    });
  }
}));

/**
 * Get failure analysis
 * GET /api/v1/analytics/failures
 */
router.get('/failures', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
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
    const { organizationId, startDate, endDate, type } = req.query;
    
    const failures = await analyticsService.getFailureAnalysis({
      organizationId: organizationId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      type: type as string,
    });

    res.json({
      success: true,
      data: failures,
    });
  } catch (error) {
    logger.error('Failed to get failure analysis', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'FAILURE_ANALYSIS_FETCH_FAILED',
        message: 'Failed to fetch failure analysis',
      },
    });
  }
}));

export default router;
