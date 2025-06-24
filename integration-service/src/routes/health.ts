/**
 * Health check routes for Integration Service
 */

import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database';
import { QueueService } from '../services/queue';
import { IntegrationManager } from '../services/integration-manager';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();

// Basic health check
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: config.serviceName,
      version: '1.0.0',
      environment: config.nodeEnv,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    res.status(200).json(health);
  } catch (error: any) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Detailed health check
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const checks = {
      database: false,
      queue: false,
      integrationManager: false,
    };

    // Check database
    try {
      const db = DatabaseService.getInstance();
      checks.database = await db.healthCheck();
    } catch (error) {
      logger.error('Database health check failed:', error);
    }

    // Check queue service
    try {
      const queue = QueueService.getInstance();
      checks.queue = await queue.healthCheck();
    } catch (error) {
      logger.error('Queue health check failed:', error);
    }

    // Check integration manager
    try {
      const manager = IntegrationManager.getInstance();
      const integrationHealth = await manager.healthCheckAll();
      checks.integrationManager = Object.keys(integrationHealth).length === 0 || 
                                  Object.values(integrationHealth).some(healthy => healthy);
    } catch (error) {
      logger.error('Integration manager health check failed:', error);
    }

    const allHealthy = Object.values(checks).every(check => check);
    const status = allHealthy ? 'healthy' : 'degraded';
    const httpStatus = allHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status,
      timestamp: new Date().toISOString(),
      service: config.serviceName,
      checks,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error: any) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Readiness check (for Kubernetes)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if all critical services are ready
    const db = DatabaseService.getInstance();
    const queue = QueueService.getInstance();

    const dbReady = await db.healthCheck();
    const queueReady = await queue.healthCheck();

    if (dbReady && queueReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbReady,
          queue: queueReady,
        },
      });
    }
  } catch (error: any) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Liveness check (for Kubernetes)
router.get('/live', async (req: Request, res: Response) => {
  try {
    // Simple liveness check - just verify the service is running
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error: any) {
    logger.error('Liveness check failed:', error);
    res.status(503).json({
      status: 'dead',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Queue statistics
router.get('/queue-stats', async (req: Request, res: Response) => {
  try {
    const queue = QueueService.getInstance();
    const stats = await queue.getAllQueueStats();

    res.status(200).json({
      timestamp: new Date().toISOString(),
      queues: stats,
    });
  } catch (error) {
    logger.error('Queue stats check failed:', error);
    res.status(500).json({
      error: 'Failed to get queue statistics',
      timestamp: new Date().toISOString(),
    });
  }
});

// Integration statistics
router.get('/integration-stats', async (req: Request, res: Response) => {
  try {
    const manager = IntegrationManager.getInstance();
    const stats = manager.getStats();
    const healthStatus = await manager.healthCheckAll();

    res.status(200).json({
      timestamp: new Date().toISOString(),
      stats,
      health: healthStatus,
    });
  } catch (error) {
    logger.error('Integration stats check failed:', error);
    res.status(500).json({
      error: 'Failed to get integration statistics',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
