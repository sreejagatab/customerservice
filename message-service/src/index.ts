/**
 * Message Service - Main Application Entry Point
 * Universal AI Customer Service Platform - Message Processing Engine
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server } from 'http';

import { config } from '@/config';
import { logger, createRequestLogger } from '@/utils/logger';
import { 
  errorHandler, 
  handleUncaughtException, 
  handleUnhandledRejection 
} from '@/utils/errors';
import { db } from '@/services/database';
import { redis } from '@/services/redis';
import { messageQueue, MessageQueueService } from '@/services/queue';
import { webSocketService } from '@/services/websocket';
import {
  processMessage,
  processAiClassification,
  processMessageAssignment,
  processAutoResponse,
  processWebhookDelivery,
  processMessageDelivery,
  processRetryMessage,
} from '@/processors/message-processors';

// Import routes
import healthRoutes from '@/routes/health';
import messageRoutes from '@/routes/messages';

class MessageService {
  private app: Application;
  private server: Server | null = null;

  constructor() {
    this.app = express();
    this.setupGlobalErrorHandlers();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', handleUncaughtException);
    process.on('unhandledRejection', handleUnhandledRejection);
  }

  private initializeMiddleware(): void {
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
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.security.corsOrigin === '*' ? true : config.security.corsOrigin.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
    }));

    // Compression
    this.app.use(compression());

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Trust proxy if configured
    if (config.security.trustProxy) {
      this.app.set('trust proxy', 1);
    }

    // Request logging
    if (config.security.enableRequestLogging) {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => {
            logger.info(message.trim());
          },
        },
      }));
      this.app.use(createRequestLogger());
    }

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          timestamp: new Date().toISOString(),
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || 
        `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.headers['x-request-id'] as string);
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check routes (no authentication required)
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/messages', messageRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: config.serviceName,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.originalUrl} not found`,
          timestamp: new Date().toISOString(),
        },
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  private async startQueueProcessors(): Promise<void> {
    try {
      // Start message processing queue
      await messageQueue.consume(
        MessageQueueService.QUEUES.MESSAGE_PROCESSING,
        processMessage,
        { noAck: false }
      );

      // Start AI classification queue
      await messageQueue.consume(
        MessageQueueService.QUEUES.AI_PROCESSING,
        processAiClassification,
        { noAck: false }
      );

      // Start message routing queue
      await messageQueue.consume(
        MessageQueueService.QUEUES.MESSAGE_ROUTING,
        processMessageAssignment,
        { noAck: false }
      );

      // Start message delivery queue
      await messageQueue.consume(
        MessageQueueService.QUEUES.MESSAGE_DELIVERY,
        processMessageDelivery,
        { noAck: false }
      );

      // Start webhook delivery queue
      await messageQueue.consume(
        MessageQueueService.QUEUES.WEBHOOK_DELIVERY,
        processWebhookDelivery,
        { noAck: false }
      );

      // Start auto response queue
      await messageQueue.consume(
        MessageQueueService.QUEUES.MESSAGE_RETRY,
        processRetryMessage,
        { noAck: false }
      );

      logger.info('All queue processors started successfully');
    } catch (error) {
      logger.error('Failed to start queue processors', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize database
      await db.initialize();
      logger.info('Database service initialized');

      // Initialize Redis
      await redis.initialize();
      logger.info('Redis service initialized');

      // Initialize message queue
      await messageQueue.initialize();
      logger.info('Message queue service initialized');

      // Start queue processors
      await this.startQueueProcessors();
      logger.info('Queue processors started');

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      // Initialize services
      await this.initializeServices();

      // Start HTTP server
      this.server = this.app.listen(config.port, () => {
        logger.info('Message Service started', {
          port: config.port,
          environment: config.nodeEnv,
          service: config.serviceName,
          timestamp: new Date().toISOString(),
        });
      });

      // Initialize WebSocket service
      webSocketService.initialize(this.server);
      logger.info('WebSocket service initialized');

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${config.port} is already in use`);
        } else {
          logger.error('Server error', { error: error.message });
        }
        process.exit(1);
      });

    } catch (error) {
      logger.error('Failed to start Message Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down Message Service...');

    try {
      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server!.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        logger.info('HTTP server closed');
      }

      // Close database connections
      await db.close();
      logger.info('Database connections closed');

      // Close Redis connection
      await redis.close();
      logger.info('Redis connection closed');

      // Close message queue connection
      await messageQueue.close();
      logger.info('Message queue connection closed');

      // Close WebSocket service
      await webSocketService.close();
      logger.info('WebSocket service closed');

      logger.info('Message Service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getApp(): Application {
    return this.app;
  }
}

// Create and start the service
const messageService = new MessageService();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await messageService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await messageService.stop();
  process.exit(0);
});

// Start the service
if (require.main === module) {
  messageService.start().catch((error) => {
    logger.error('Failed to start service', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export default messageService;
