/**
 * Health Check Routes
 */

import { Router, Request, Response } from 'express';
import { logger } from '@universal-ai-cs/shared';

const router = Router();

/**
 * Basic health check
 * GET /health
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Partner Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * Detailed health check
 * GET /health/detailed
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Check database connectivity
    let dbHealth = false;
    try {
      // This would check actual database connection
      dbHealth = true;
    } catch (error) {
      logger.error('Database health check failed', { error });
    }

    // Check Redis connectivity
    let redisHealth = false;
    try {
      // This would check actual Redis connection
      redisHealth = true;
    } catch (error) {
      logger.error('Redis health check failed', { error });
    }

    const responseTime = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();
    
    const health = {
      success: true,
      service: 'Partner Service',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      responseTime: `${responseTime}ms`,
      components: {
        database: {
          status: dbHealth ? 'healthy' : 'unhealthy',
        },
        redis: {
          status: redisHealth ? 'healthy' : 'unhealthy',
        },
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        },
      },
      features: {
        partnerPortal: true,
        revenueSharing: true,
        marketplace: true,
        whiteLabelBranding: true,
        commissionCalculation: true,
      },
    };

    // Determine overall status
    const allHealthy = dbHealth && redisHealth;
    
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
      service: 'Partner Service',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * Readiness check
 * GET /health/ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if service is ready to accept requests
    const isReady = true; // This would check actual readiness conditions
    
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
        reason: 'Partner service not ready',
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
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
  });
});

export default router;
