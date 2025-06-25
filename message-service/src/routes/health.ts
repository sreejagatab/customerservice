/**
 * Health Check Routes for Message Service
 * Provides health status endpoints for monitoring and load balancing
 */

import { Router, Request, Response } from 'express';
import { db } from '@/services/database';
import { redis } from '@/services/redis';
import { config } from '@/config';
import { logHealthCheck } from '@/utils/logger';
import { asyncHandler } from '@/utils/errors';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      details?: any;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      details?: any;
    };
    memory: {
      status: 'healthy' | 'unhealthy';
      usage: {
        used: number;
        total: number;
        percentage: number;
      };
    };
    disk: {
      status: 'healthy' | 'unhealthy';
      usage?: any;
    };
  };
}

// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: config.serviceName,
    version: '1.0.0',
    environment: config.nodeEnv,
    uptime: process.uptime(),
    checks: {
      database: { status: 'healthy' },
      redis: { status: 'healthy' },
      memory: { status: 'healthy', usage: { used: 0, total: 0, percentage: 0 } },
      disk: { status: 'healthy' },
    },
  };

  // Check database
  const dbStart = Date.now();
  try {
    const isDbHealthy = await db.healthCheck();
    const dbResponseTime = Date.now() - dbStart;
    
    healthStatus.checks.database = {
      status: isDbHealthy ? 'healthy' : 'unhealthy',
      responseTime: dbResponseTime,
      details: isDbHealthy ? db.getPoolStats() : undefined,
    };

    if (!isDbHealthy) {
      healthStatus.status = 'unhealthy';
    }

    logHealthCheck('database', isDbHealthy ? 'healthy' : 'unhealthy', {
      responseTime: dbResponseTime,
    });
  } catch (error) {
    healthStatus.checks.database = {
      status: 'unhealthy',
      responseTime: Date.now() - dbStart,
      details: { error: error instanceof Error ? error.message : String(error) },
    };
    healthStatus.status = 'unhealthy';
    
    logHealthCheck('database', 'unhealthy', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    const isRedisHealthy = await redis.healthCheck();
    const redisResponseTime = Date.now() - redisStart;
    
    healthStatus.checks.redis = {
      status: isRedisHealthy ? 'healthy' : 'unhealthy',
      responseTime: redisResponseTime,
      details: { connected: redis.isReady() },
    };

    if (!isRedisHealthy) {
      healthStatus.status = healthStatus.status === 'healthy' ? 'degraded' : 'unhealthy';
    }

    logHealthCheck('redis', isRedisHealthy ? 'healthy' : 'unhealthy', {
      responseTime: redisResponseTime,
    });
  } catch (error) {
    healthStatus.checks.redis = {
      status: 'unhealthy',
      responseTime: Date.now() - redisStart,
      details: { error: error instanceof Error ? error.message : String(error) },
    };
    healthStatus.status = healthStatus.status === 'healthy' ? 'degraded' : 'unhealthy';
    
    logHealthCheck('redis', 'unhealthy', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
  const usedMemory = memoryUsage.heapUsed;
  const memoryPercentage = (usedMemory / totalMemory) * 100;

  healthStatus.checks.memory = {
    status: memoryPercentage > 90 ? 'unhealthy' : 'healthy',
    usage: {
      used: usedMemory,
      total: totalMemory,
      percentage: Math.round(memoryPercentage * 100) / 100,
    },
  };

  if (memoryPercentage > 90) {
    healthStatus.status = healthStatus.status === 'healthy' ? 'degraded' : 'unhealthy';
  }

  // Set appropriate HTTP status code
  const statusCode = healthStatus.status === 'healthy' ? 200 : 
                    healthStatus.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthStatus);
}));

// Liveness probe (simple check)
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    service: config.serviceName,
  });
});

// Readiness probe (checks if service is ready to handle requests)
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Check if database is ready
    const isDbReady = await db.healthCheck();
    
    if (!isDbReady) {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'Database not available',
        timestamp: new Date().toISOString(),
        service: config.serviceName,
      });
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      service: config.serviceName,
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      reason: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      service: config.serviceName,
    });
  }
}));

// Detailed health check with metrics
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  const detailedHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: config.serviceName,
    version: '1.0.0',
    environment: config.nodeEnv,
    uptime: process.uptime(),
    responseTime: 0,
    system: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
    },
    dependencies: {
      database: { status: 'unknown', responseTime: 0 },
      redis: { status: 'unknown', responseTime: 0 },
    },
  };

  // Test database
  const dbStart = Date.now();
  try {
    const isDbHealthy = await db.healthCheck();
    detailedHealth.dependencies.database = {
      status: isDbHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - dbStart,
      ...db.getPoolStats(),
    };
  } catch (error) {
    detailedHealth.dependencies.database = {
      status: 'unhealthy',
      responseTime: Date.now() - dbStart,
      error: error instanceof Error ? error.message : String(error),
    };
    detailedHealth.status = 'unhealthy';
  }

  // Test Redis
  const redisStart = Date.now();
  try {
    const isRedisHealthy = await redis.healthCheck();
    detailedHealth.dependencies.redis = {
      status: isRedisHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - redisStart,
      connected: redis.isReady(),
    };
  } catch (error) {
    detailedHealth.dependencies.redis = {
      status: 'unhealthy',
      responseTime: Date.now() - redisStart,
      error: error instanceof Error ? error.message : String(error),
    };
    if (detailedHealth.status === 'healthy') {
      detailedHealth.status = 'degraded';
    }
  }

  detailedHealth.responseTime = Date.now() - startTime;

  const statusCode = detailedHealth.status === 'healthy' ? 200 : 
                    detailedHealth.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(detailedHealth);
}));

export default router;
