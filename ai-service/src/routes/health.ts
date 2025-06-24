/**
 * Health Check Routes
 * Comprehensive health monitoring for AI Service
 */

import { Router, Request, Response } from 'express';
import { aiProviderManager } from '@/services/ai-provider-manager';
import { DatabaseService } from '@/services/database';
import { AiQueueService } from '@/services/queue';
import { asyncHandler } from '@/utils/errors';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * Basic health check
 * GET /api/v1/health
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    service: 'ai-service',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  };

  res.json(health);
}));

/**
 * Detailed health check
 * GET /api/v1/health/detailed
 */
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check all components
  const [
    databaseHealth,
    queueHealth,
    providersHealth,
    memoryUsage,
  ] = await Promise.allSettled([
    checkDatabaseHealth(),
    checkQueueHealth(),
    checkProvidersHealth(),
    getMemoryUsage(),
  ]);

  const responseTime = Date.now() - startTime;
  
  // Determine overall status
  const components = {
    database: getResultValue(databaseHealth, false),
    queue: getResultValue(queueHealth, false),
    providers: getResultValue(providersHealth, []),
    memory: getResultValue(memoryUsage, {}),
  };

  const isHealthy = components.database.healthy && 
                   components.queue.healthy && 
                   components.providers.some((p: any) => p.healthy);

  const health = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    service: 'ai-service',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    responseTime,
    components,
  };

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(health);
}));

/**
 * Database health check
 * GET /api/v1/health/database
 */
router.get('/database', asyncHandler(async (req: Request, res: Response) => {
  const health = await checkDatabaseHealth();
  const statusCode = health.healthy ? 200 : 503;
  
  res.status(statusCode).json({
    component: 'database',
    ...health,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Queue health check
 * GET /api/v1/health/queue
 */
router.get('/queue', asyncHandler(async (req: Request, res: Response) => {
  const health = await checkQueueHealth();
  const statusCode = health.healthy ? 200 : 503;
  
  res.status(statusCode).json({
    component: 'queue',
    ...health,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * AI Providers health check
 * GET /api/v1/health/providers
 */
router.get('/providers', asyncHandler(async (req: Request, res: Response) => {
  const providers = await checkProvidersHealth();
  const hasHealthyProvider = providers.some(p => p.healthy);
  const statusCode = hasHealthyProvider ? 200 : 503;
  
  res.status(statusCode).json({
    component: 'providers',
    healthy: hasHealthyProvider,
    providers,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Memory usage check
 * GET /api/v1/health/memory
 */
router.get('/memory', asyncHandler(async (req: Request, res: Response) => {
  const memory = getMemoryUsage();
  
  res.json({
    component: 'memory',
    ...memory,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Readiness probe (for Kubernetes)
 * GET /api/v1/health/ready
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Check if all critical components are ready
    const [dbReady, queueReady, providersReady] = await Promise.all([
      DatabaseService.getInstance().healthCheck(),
      checkQueueReadiness(),
      checkProvidersReadiness(),
    ]);

    const isReady = dbReady && queueReady && providersReady;
    
    if (isReady) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * Liveness probe (for Kubernetes)
 * GET /api/v1/health/live
 */
router.get('/live', asyncHandler(async (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}));

// Helper functions

async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  responseTime?: number;
  error?: string;
  stats?: any;
}> {
  const startTime = Date.now();
  
  try {
    const db = DatabaseService.getInstance();
    const isHealthy = await db.healthCheck();
    const responseTime = Date.now() - startTime;
    
    if (isHealthy) {
      const stats = db.getPoolStats();
      return {
        healthy: true,
        responseTime,
        stats,
      };
    } else {
      return {
        healthy: false,
        responseTime,
        error: 'Database health check failed',
      };
    }
  } catch (error) {
    return {
      healthy: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkQueueHealth(): Promise<{
  healthy: boolean;
  stats?: any;
  error?: string;
}> {
  try {
    const queueService = AiQueueService.getInstance();
    
    if (!queueService.isInitialized()) {
      return {
        healthy: false,
        error: 'Queue service not initialized',
      };
    }

    const stats = await queueService.getAllQueueStats();
    
    return {
      healthy: true,
      stats,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkProvidersHealth(): Promise<Array<{
  id: string;
  name: string;
  provider: string;
  healthy: boolean;
  responseTime?: number;
  error?: string;
}>> {
  try {
    const providers = await aiProviderManager.getProviderStatus();
    
    return providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      provider: provider.provider,
      healthy: provider.isHealthy,
      responseTime: provider.metrics?.averageLatency,
      error: provider.isHealthy ? undefined : 'Provider health check failed',
    }));
  } catch (error) {
    return [{
      id: 'unknown',
      name: 'unknown',
      provider: 'unknown',
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    }];
  }
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  const totalMemory = require('os').totalmem();
  const freeMemory = require('os').freemem();
  
  return {
    process: {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
    },
    system: {
      total: Math.round(totalMemory / 1024 / 1024), // MB
      free: Math.round(freeMemory / 1024 / 1024), // MB
      used: Math.round((totalMemory - freeMemory) / 1024 / 1024), // MB
    },
    healthy: usage.heapUsed < (totalMemory * 0.8), // Alert if using >80% of total memory
  };
}

async function checkQueueReadiness(): Promise<boolean> {
  try {
    const queueService = AiQueueService.getInstance();
    return queueService.isInitialized();
  } catch (error) {
    return false;
  }
}

async function checkProvidersReadiness(): Promise<boolean> {
  try {
    return aiProviderManager.isInitialized();
  } catch (error) {
    return false;
  }
}

function getResultValue<T>(result: PromiseSettledResult<T>, defaultValue: T): T {
  return result.status === 'fulfilled' ? result.value : defaultValue;
}

export default router;
