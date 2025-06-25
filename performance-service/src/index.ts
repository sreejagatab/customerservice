/**
 * Performance Service - Main Entry Point
 * Provides performance monitoring, optimization, and alerting
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from '@universal-ai-cs/shared';
import { PerformanceOptimizationService } from './services/performance-optimization-service';
import { CDNOptimizationService } from './services/cdn-optimization-service';
import { PerformanceMonitoringService } from './services/performance-monitoring-service';
import { LoadTestingService } from './services/load-testing-service';

// Route imports
import healthRoutes from './routes/health';
import performanceRoutes from './routes/performance';
import monitoringRoutes from './routes/monitoring';
import optimizationRoutes from './routes/optimization';

class PerformanceServiceApp {
  private app: express.Application;
  private performanceOptimization: PerformanceOptimizationService;
  private cdnOptimization: CDNOptimizationService;
  private performanceMonitoring: PerformanceMonitoringService;
  private loadTesting: LoadTestingService;

  constructor() {
    this.app = express();
    this.performanceOptimization = PerformanceOptimizationService.getInstance();
    this.cdnOptimization = CDNOptimizationService.getInstance();
    this.performanceMonitoring = PerformanceMonitoringService.getInstance();
    this.loadTesting = LoadTestingService.getInstance();
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    this.app.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Performance monitoring middleware
    this.app.use(async (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.performanceMonitoring.recordRequest({
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        });
      });
      
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Performance service request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/performance', performanceRoutes);
    this.app.use('/api/v1/monitoring', monitoringRoutes);
    this.app.use('/api/v1/optimization', optimizationRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: 'Performance Service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        features: {
          performanceMonitoring: true,
          performanceOptimization: true,
          cdnOptimization: true,
          loadTesting: true,
          alerting: true,
        },
      });
    });

    // API documentation
    this.app.get('/api-docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Performance Service API',
          version: '1.0.0',
          description: 'Universal AI Customer Service Platform - Performance Service',
        },
        servers: [
          {
            url: `http://localhost:${process.env.PORT || 3009}`,
            description: 'Development server',
          },
        ],
        paths: {
          '/health': {
            get: {
              summary: 'Health check',
              responses: {
                '200': {
                  description: 'Service is healthy',
                },
              },
            },
          },
          '/api/v1/performance/metrics': {
            get: {
              summary: 'Get performance metrics',
              responses: {
                '200': {
                  description: 'Performance metrics data',
                },
              },
            },
          },
          '/api/v1/monitoring/alerts': {
            get: {
              summary: 'Get performance alerts',
              responses: {
                '200': {
                  description: 'List of performance alerts',
                },
              },
            },
          },
        },
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Performance service error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize services
      await this.performanceOptimization.initialize();
      await this.cdnOptimization.initialize();
      await this.performanceMonitoring.initialize();
      await this.loadTesting.initialize();

      const port = process.env.PORT || 3009;
      
      this.app.listen(port, () => {
        logger.info(`Performance Service started on port ${port}`, {
          environment: process.env.NODE_ENV || 'development',
          port,
          features: {
            performanceMonitoring: true,
            performanceOptimization: true,
            cdnOptimization: true,
            loadTesting: true,
          },
        });
      });
    } catch (error) {
      logger.error('Failed to start Performance Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.performanceOptimization.shutdown();
      await this.cdnOptimization.shutdown();
      await this.performanceMonitoring.shutdown();
      await this.loadTesting.shutdown();
      
      logger.info('Performance Service stopped gracefully');
    } catch (error) {
      logger.error('Error stopping Performance Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getServices() {
    return {
      performanceOptimization: this.performanceOptimization,
      cdnOptimization: this.cdnOptimization,
      performanceMonitoring: this.performanceMonitoring,
      loadTesting: this.loadTesting,
    };
  }
}

// Create and start the service
const performanceService = new PerformanceServiceApp();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await performanceService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await performanceService.stop();
  process.exit(0);
});

// Start the service
performanceService.start().catch((error) => {
  logger.error('Failed to start Performance Service', { error });
  process.exit(1);
});

export default performanceService;
