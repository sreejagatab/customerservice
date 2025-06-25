/**
 * Health Check Routes for Admin Service
 */

import { Router, Request, Response } from 'express';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { UserService } from '@/services/user-service';
import { OrganizationService } from '@/services/organization-service';
import { AnalyticsService } from '@/services/analytics-service';

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
    
    // Check core services
    const userService = UserService.getInstance();
    const organizationService = OrganizationService.getInstance();
    const analyticsService = AnalyticsService.getInstance();

    const [
      userServiceHealth,
      organizationServiceHealth,
      analyticsServiceHealth,
    ] = await Promise.allSettled([
      userService.healthCheck(),
      organizationService.healthCheck(),
      analyticsService.healthCheck(),
    ]);

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
        userService: {
          status: userServiceHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: userServiceHealth.status === 'fulfilled' ? userServiceHealth.value : userServiceHealth.reason,
        },
        organizationService: {
          status: organizationServiceHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: organizationServiceHealth.status === 'fulfilled' ? organizationServiceHealth.value : organizationServiceHealth.reason,
        },
        analyticsService: {
          status: analyticsServiceHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: analyticsServiceHealth.status === 'fulfilled' ? analyticsServiceHealth.value : analyticsServiceHealth.reason,
        },
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        },
      },
      features: {
        userRegistration: config.features.userRegistration,
        organizationCreation: config.features.organizationCreation,
        auditLogging: config.features.auditLogging,
        activityMonitoring: config.features.activityMonitoring,
        automatedBackups: config.features.automatedBackups,
        healthMonitoring: config.features.healthMonitoring,
        performanceAnalytics: config.features.performanceAnalytics,
      },
    };

    // Determine overall status
    const allHealthy = [userServiceHealth, organizationServiceHealth, analyticsServiceHealth]
      .every(result => result.status === 'fulfilled');

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
    const userService = UserService.getInstance();
    const organizationService = OrganizationService.getInstance();
    
    const isReady = await userService.isReady() && await organizationService.isReady();

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
        reason: 'Core services not ready',
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

/**
 * Database health check
 * GET /health/database
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const userService = UserService.getInstance();
    const dbHealth = await userService.checkDatabaseHealth();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbHealth,
    });
  } catch (error) {
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Database connection failed',
    });
  }
});

/**
 * System metrics
 * GET /health/metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
      success: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Metrics collection failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Metrics collection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
