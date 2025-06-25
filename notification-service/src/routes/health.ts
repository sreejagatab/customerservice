/**
 * Health Check Routes for Notification Service
 */

import { Router, Request, Response } from 'express';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { NotificationQueueService } from '@/services/notification-queue';
import { emailNotificationService } from '@/providers/email-provider';
import { smsNotificationService } from '@/providers/sms-provider';
import { pushNotificationService } from '@/providers/push-provider';

const router = Router();

/**
 * Basic health check
 * GET /health
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = {
      success: true,
      service: config.serviceName,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      status: 'healthy',
    };

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      service: config.serviceName,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Detailed health check
 * GET /health/detailed
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Check queue service
    const queueService = NotificationQueueService.getInstance();
    const queueHealth = queueService.isConnected();

    // Check notification providers
    const emailHealth = await emailNotificationService.healthCheck();
    const smsHealth = await smsNotificationService.healthCheck();
    const pushHealth = await pushNotificationService.healthCheck();

    // Get memory usage
    const memoryUsage = process.memoryUsage();

    const responseTime = Date.now() - startTime;
    
    const health = {
      success: true,
      service: config.serviceName,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      responseTime: `${responseTime}ms`,
      components: {
        queue: {
          status: queueHealth ? 'healthy' : 'unhealthy',
          connected: queueHealth,
        },
        providers: {
          email: emailHealth,
          sms: smsHealth,
          push: pushHealth,
        },
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        },
      },
      features: {
        email: config.features.emailNotifications,
        sms: config.features.smsNotifications,
        push: config.features.pushNotifications,
        inApp: config.features.inAppNotifications,
        webhook: config.features.webhookNotifications,
        scheduling: config.features.notificationScheduling,
        analytics: config.features.notificationAnalytics,
      },
    };

    // Determine overall status
    const allHealthy = queueHealth && 
      Object.values(emailHealth).every(status => status) &&
      Object.values(smsHealth).every(status => status) &&
      Object.values(pushHealth).every(status => status);

    if (!allHealthy) {
      res.status(503);
    }

    res.json(health);
  } catch (error) {
    logger.error('Detailed health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      service: config.serviceName,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Readiness check
 * GET /health/ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const queueService = NotificationQueueService.getInstance();
    const isReady = queueService.isConnected();

    if (isReady) {
      res.json({
        success: true,
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        success: false,
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Queue service not connected',
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Liveness check
 * GET /health/live
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
