/**
 * Webhook handling routes
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/error-handler';
import { webhookRateLimiter } from '../middleware/rate-limiter';
import { validateBody, webhookSchemas } from '../middleware/validation';
import { queueService, JobType } from '../services/queue';
import { integrationRepo } from '../services/database';
import { config } from '../config';
import { webhookLogger, logWebhookEvent } from '../utils/logger';

const router = Router();

// Apply webhook rate limiting to all routes
router.use(webhookRateLimiter);

// Webhook signature verification middleware
const verifyWebhookSignature = (provider: string) => {
  return (req: Request, res: Response, next: Function) => {
    const signature = req.headers['x-hub-signature'] || 
                     req.headers['x-hub-signature-256'] || 
                     req.headers['x-signature'] ||
                     req.headers['signature'];

    if (!signature && config.isProduction) {
      webhookLogger.warn('Webhook received without signature', { provider });
      return res.status(401).json({
        success: false,
        error: 'Webhook signature required',
      });
    }

    // Store signature for later verification in the connector
    req.webhookSignature = signature as string;
    next();
  };
};

// Gmail webhook endpoint
router.post('/gmail',
  verifyWebhookSignature('gmail'),
  validateBody(webhookSchemas.gmailWebhook),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body;
    
    logWebhookEvent('received', 'gmail', {
      messageId: payload.message.messageId,
      publishTime: payload.message.publishTime,
    });

    // Queue webhook processing job
    await queueService.addWebhookJob({
      provider: 'gmail',
      event: 'message_received',
      payload,
      signature: req.webhookSignature,
    });

    // Gmail expects a 200 response
    res.status(200).send('OK');
  })
);

// Microsoft Graph webhook endpoint
router.post('/microsoft',
  verifyWebhookSignature('microsoft'),
  validateBody(webhookSchemas.microsoftWebhook),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body;
    
    logWebhookEvent('received', 'microsoft', {
      subscriptions: payload.value.length,
    });

    // Process each notification
    for (const notification of payload.value) {
      await queueService.addWebhookJob({
        provider: 'microsoft',
        event: notification.changeType,
        payload: notification,
        signature: req.webhookSignature,
      });
    }

    // Microsoft expects a 202 response
    res.status(202).send('Accepted');
  })
);

// Generic webhook endpoint for custom integrations
router.post('/custom/:integrationId',
  asyncHandler(async (req: Request, res: Response) => {
    const { integrationId } = req.params;
    const payload = req.body;

    // Verify integration exists
    const integrationResult = await integrationRepo.getIntegration(integrationId, '');
    if (integrationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    const integration = integrationResult.rows[0];
    
    logWebhookEvent('received', integration.provider, {
      integrationId,
      payloadSize: JSON.stringify(payload).length,
    });

    // Queue webhook processing job
    await queueService.addWebhookJob({
      provider: integration.provider,
      event: 'webhook_received',
      payload,
      signature: req.webhookSignature,
      integrationId,
      organizationId: integration.organization_id,
    });

    res.status(200).json({
      success: true,
      message: 'Webhook received and queued for processing',
    });
  })
);

// Webhook validation endpoint for Microsoft Graph subscriptions
router.post('/microsoft/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const validationToken = req.query.validationToken as string;
    
    if (!validationToken) {
      return res.status(400).json({
        success: false,
        error: 'Validation token required',
      });
    }

    webhookLogger.info('Microsoft webhook validation requested', {
      validationToken: validationToken.substring(0, 10) + '...',
    });

    // Return the validation token as plain text
    res.status(200).type('text/plain').send(validationToken);
  })
);

// Gmail webhook validation endpoint
router.get('/gmail/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const challenge = req.query['hub.challenge'] as string;
    
    if (!challenge) {
      return res.status(400).json({
        success: false,
        error: 'Challenge parameter required',
      });
    }

    webhookLogger.info('Gmail webhook validation requested');

    // Return the challenge
    res.status(200).type('text/plain').send(challenge);
  })
);

// Webhook status endpoint
router.get('/status',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // Get webhook processing statistics
      const queueStats = await queueService.getQueueStats('webhook-processing');
      
      res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          webhookQueue: queueStats,
          supportedProviders: ['gmail', 'microsoft', 'custom'],
          endpoints: {
            gmail: '/webhooks/gmail',
            microsoft: '/webhooks/microsoft',
            custom: '/webhooks/custom/:integrationId',
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get webhook status',
      });
    }
  })
);

// Webhook test endpoint (for development)
router.post('/test/:provider',
  asyncHandler(async (req: Request, res: Response) => {
    if (config.isProduction) {
      return res.status(404).json({
        success: false,
        error: 'Test endpoint not available in production',
      });
    }

    const { provider } = req.params;
    const payload = req.body;

    webhookLogger.info('Test webhook received', { provider });

    // Queue test webhook job
    await queueService.addWebhookJob({
      provider,
      event: 'test_webhook',
      payload,
      signature: 'test-signature',
    });

    res.json({
      success: true,
      message: 'Test webhook queued for processing',
      provider,
    });
  })
);

// Error handler for webhook routes
router.use((error: any, req: Request, res: Response, next: Function) => {
  webhookLogger.error('Webhook processing error:', {
    error: error.message,
    path: req.path,
    method: req.method,
    provider: req.params.provider,
  });

  res.status(500).json({
    success: false,
    error: 'Webhook processing failed',
    timestamp: new Date().toISOString(),
  });
});

// Extend Request interface for webhook signature
declare global {
  namespace Express {
    interface Request {
      webhookSignature?: string;
    }
  }
}

export default router;
