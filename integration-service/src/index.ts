/**
 * Integration Service - Universal AI Customer Service Platform
 * 
 * This service handles all third-party integrations including:
 * - Email providers (Gmail, Outlook, SMTP/IMAP)
 * - Chat platforms (Slack, WhatsApp, etc.)
 * - Social media platforms
 * - E-commerce platforms
 * - CRM systems
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { logger } from './utils/logger';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';
import { rateLimiter } from './middleware/rate-limiter';
import { authMiddleware } from './middleware/auth';
import { validateRequest } from './middleware/validation';

// Route imports
import integrationRoutes from './routes/integrations';
import webhookRoutes from './routes/webhooks';
import authRoutes from './routes/auth';
import healthRoutes from './routes/health';

// Services
import { DatabaseService } from './services/database';
import { QueueService } from './services/queue';
import { IntegrationManager } from './services/integration-manager';

class IntegrationService {
  private app: express.Application;
  private server: any;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
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
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Rate limiting
    this.app.use(rateLimiter);
  }

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // Authentication routes (no auth required)
    this.app.use('/auth', authRoutes);

    // Webhook routes (special auth handling)
    this.app.use('/webhooks', webhookRoutes);

    // Protected routes
    this.app.use('/api/v1/integrations', authMiddleware, integrationRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.originalUrl,
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
      await QueueService.initialize();
      logger.info('Queue service initialized');

      // Initialize integration manager
      await IntegrationManager.initialize();
      logger.info('Integration manager initialized');

      // Start server
      this.server = this.app.listen(config.port, () => {
        logger.info(`Integration Service started on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Service: ${config.serviceName}`);
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start Integration Service:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      if (this.server) {
        this.server.close(async () => {
          logger.info('HTTP server closed');

          try {
            // Close database connections
            await DatabaseService.close();
            logger.info('Database connections closed');

            // Close queue connections
            await QueueService.close();
            logger.info('Queue connections closed');

            // Close integration manager
            await IntegrationManager.close();
            logger.info('Integration manager closed');

            logger.info('Graceful shutdown completed');
            process.exit(0);
          } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            process.exit(1);
          }
        });
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start the service
const service = new IntegrationService();
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});

export default IntegrationService;
