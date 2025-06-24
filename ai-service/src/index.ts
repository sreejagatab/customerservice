/**
 * AI Service - Main Application Entry Point
 * Universal AI Customer Service Platform - Phase 3: AI Processing Engine
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { Server } from 'http';

import { config } from '@/config';
import { logger, createRequestLogger } from '@/utils/logger';
import { 
  errorHandler, 
  handleUncaughtException, 
  handleUnhandledRejection 
} from '@/utils/errors';
import { DatabaseService } from '@/services/database';
import { AiQueueService } from '@/services/queue';

// Import routes
import aiRoutes from '@/routes/ai';
import healthRoutes from '@/routes/health';

class AiService {
  private app: Application;
  private server: Server | null = null;

  constructor() {
    this.app = express();
    this.setupGlobalErrorHandlers();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', handleUncaughtException);
    process.on('unhandledRejection', handleUnhandledRejection);
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.security.corsOrigin === '*' 
        ? true 
        : config.security.corsOrigin.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Request-ID',
        'X-Organization-ID',
      ],
    }));

    // Compression
    this.app.use(compression());

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Trust proxy if configured
    if (config.security.trustProxy) {
      this.app.set('trust proxy', true);
    }

    // Request logging
    if (config.nodeEnv !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => {
            logger.info(message.trim(), { source: 'http' });
          },
        },
      }));
    }

    // Custom request logger
    this.app.use(createRequestLogger());

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || 
        `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.headers['x-request-id']);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        service: config.serviceName,
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
      });
    });

    // API routes
    this.app.use('/api/v1/ai', aiRoutes);
    this.app.use('/api/v1/health', healthRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          message: 'Endpoint not found',
          path: req.originalUrl,
          method: req.method,
        },
        timestamp: new Date().toISOString(),
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize database connection
      await DatabaseService.initialize();
      logger.info('Database connection established');

      // Initialize queue service
      await AiQueueService.initialize();
      logger.info('AI Queue service initialized');

      // Initialize AI providers
      const { AiProviderManager } = await import('@/services/ai-provider-manager');
      await AiProviderManager.initialize();
      logger.info('AI providers initialized');

      // Start queue workers
      const { queueWorker } = await import('@/workers/queue-worker');
      await queueWorker.start();
      logger.info('Queue workers started');

      // Start server
      this.server = this.app.listen(config.port, () => {
        logger.info(`AI Service started on port ${config.port}`, {
          service: config.serviceName,
          environment: config.nodeEnv,
          version: process.env.npm_package_version || '1.0.0',
        });
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start AI Service', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down AI Service gracefully...`);
      
      try {
        // Stop accepting new requests
        if (this.server) {
          this.server.close(() => {
            logger.info('HTTP server closed');
          });
        }

        // Stop queue workers
        const { queueWorker } = await import('@/workers/queue-worker');
        await queueWorker.stop();
        logger.info('Queue workers stopped');

        // Close queue service
        await AiQueueService.close();
        logger.info('Queue service closed');

        // Close database connection
        await DatabaseService.close();
        logger.info('Database connection closed');

        logger.info('AI Service shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  public getApp(): Application {
    return this.app;
  }
}

// Start the service
const service = new AiService();
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});

export default AiService;
