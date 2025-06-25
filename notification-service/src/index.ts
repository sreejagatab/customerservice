/**
 * Notification Service - Main Application Entry Point
 * Universal AI Customer Service Platform - Notification Engine
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config } from '@/config';
import { logger, createRequestLogger } from '@/utils/logger';
import { 
  errorHandler, 
  handleUncaughtException, 
  handleUnhandledRejection 
} from '@/utils/errors';

// Import services
import { NotificationQueueService } from '@/services/notification-queue';
import { TemplateService } from '@/services/template-service';
import { SchedulerService } from '@/services/scheduler-service';
import { PreferenceService } from '@/services/preference-service';
import { AnalyticsService } from '@/services/analytics-service';

// Import providers
import { emailNotificationService } from '@/providers/email-provider';
import { smsNotificationService } from '@/providers/sms-provider';
import { pushNotificationService } from '@/providers/push-provider';

// Import routes
import healthRoutes from '@/routes/health';
import notificationRoutes from '@/routes/notifications';
import templateRoutes from '@/routes/templates';
import analyticsRoutes from '@/routes/analytics';

class NotificationService {
  private app: Application;
  private server: Server | null = null;
  private io: SocketIOServer | null = null;
  private queueService: NotificationQueueService;
  private templateService: TemplateService;
  private schedulerService: SchedulerService;
  private preferenceService: PreferenceService;
  private analyticsService: AnalyticsService;

  constructor() {
    this.app = express();
    this.queueService = NotificationQueueService.getInstance();
    this.templateService = TemplateService.getInstance();
    this.schedulerService = SchedulerService.getInstance();
    this.preferenceService = PreferenceService.getInstance();
    this.analyticsService = AnalyticsService.getInstance();
    
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
        `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.headers['x-request-id'] as string);
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check routes (no authentication required)
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/notifications', notificationRoutes);
    this.app.use('/api/v1/templates', templateRoutes);
    this.app.use('/api/v1/analytics', analyticsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: config.serviceName,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
        features: {
          email: config.features.emailNotifications,
          sms: config.features.smsNotifications,
          push: config.features.pushNotifications,
          inApp: config.features.inAppNotifications,
          webhook: config.features.webhookNotifications,
          scheduling: config.features.notificationScheduling,
          analytics: config.features.notificationAnalytics,
        },
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

  private initializeWebSocket(): void {
    if (!this.server) {
      throw new Error('HTTP server must be initialized before WebSocket');
    }

    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.websocket.corsOrigin === '*' ? true : config.websocket.corsOrigin.split(','),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // WebSocket connection handling
    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        clientIP: socket.handshake.address,
      });

      // Handle client authentication
      socket.on('authenticate', async (data) => {
        try {
          // Implement authentication logic here
          const { token, organizationId } = data;
          
          // Join organization room for targeted notifications
          if (organizationId) {
            socket.join(`org:${organizationId}`);
            logger.info('Client joined organization room', {
              socketId: socket.id,
              organizationId,
            });
          }

          socket.emit('authenticated', { success: true });
        } catch (error) {
          logger.error('WebSocket authentication failed', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
          });
          socket.emit('authentication_error', { error: 'Authentication failed' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason,
        });
      });
    });

    logger.info('WebSocket server initialized');
  }

  private async startQueueProcessors(): Promise<void> {
    try {
      // Start email notification processor
      if (config.features.emailNotifications) {
        await this.queueService.consume(
          NotificationQueueService.QUEUES.EMAIL_NOTIFICATIONS,
          async (job) => {
            await emailNotificationService.sendNotification(job.data);
          },
          { noAck: false }
        );
      }

      // Start SMS notification processor
      if (config.features.smsNotifications) {
        await this.queueService.consume(
          NotificationQueueService.QUEUES.SMS_NOTIFICATIONS,
          async (job) => {
            await smsNotificationService.sendNotification(job.data);
          },
          { noAck: false }
        );
      }

      // Start push notification processor
      if (config.features.pushNotifications) {
        await this.queueService.consume(
          NotificationQueueService.QUEUES.PUSH_NOTIFICATIONS,
          async (job) => {
            await pushNotificationService.sendNotification(job.data);
          },
          { noAck: false }
        );
      }

      // Start in-app notification processor
      if (config.features.inAppNotifications) {
        await this.queueService.consume(
          NotificationQueueService.QUEUES.IN_APP_NOTIFICATIONS,
          async (job) => {
            // Send via WebSocket
            if (this.io) {
              this.io.to(`org:${job.organizationId}`).emit('notification', job.data);
            }
          },
          { noAck: false }
        );
      }

      logger.info('All notification queue processors started successfully');
    } catch (error) {
      logger.error('Failed to start queue processors', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize queue service
      await this.queueService.initialize();
      logger.info('Notification queue service initialized');

      // Initialize template service
      await this.templateService.initialize();
      logger.info('Template service initialized');

      // Initialize scheduler service
      if (config.features.notificationScheduling) {
        await this.schedulerService.initialize();
        logger.info('Scheduler service initialized');
      }

      // Initialize preference service
      await this.preferenceService.initialize();
      logger.info('Preference service initialized');

      // Initialize analytics service
      if (config.features.notificationAnalytics) {
        await this.analyticsService.initialize();
        logger.info('Analytics service initialized');
      }

      // Initialize notification providers
      await emailNotificationService.initialize();
      await smsNotificationService.initialize();
      await pushNotificationService.initialize();
      logger.info('Notification providers initialized');

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
        logger.info('Notification Service started', {
          port: config.port,
          environment: config.nodeEnv,
          service: config.serviceName,
          timestamp: new Date().toISOString(),
        });
      });

      // Initialize WebSocket service
      this.initializeWebSocket();
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
      logger.error('Failed to start Notification Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down Notification Service...');

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

      // Close WebSocket server
      if (this.io) {
        this.io.close();
        logger.info('WebSocket server closed');
      }

      // Close queue service
      await this.queueService.close();
      logger.info('Queue service closed');

      // Close scheduler service
      if (config.features.notificationScheduling) {
        await this.schedulerService.stop();
        logger.info('Scheduler service stopped');
      }

      logger.info('Notification Service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getApp(): Application {
    return this.app;
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }
}

// Create and start the service
const notificationService = new NotificationService();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await notificationService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await notificationService.stop();
  process.exit(0);
});

// Start the service
if (require.main === module) {
  notificationService.start().catch((error) => {
    logger.error('Failed to start service', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export default notificationService;
