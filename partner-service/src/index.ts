/**
 * Partner Service - Main Entry Point
 * Handles partner management, white-label branding, and revenue sharing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { Logger } from '../../shared/src/utils/logger';
import { DatabaseService } from '../../shared/src/services/database';
import { TenantContextMiddleware } from '../../shared/src/middleware/tenant-context';
import { PartnerManagementService } from '../../shared/src/services/partner-management';
import { WhiteLabelBrandingService } from '../../shared/src/services/white-label-branding';

// Route imports
import partnerRoutes from './routes/partners';
import brandingRoutes from './routes/branding';
import revenueRoutes from './routes/revenue';
import onboardingRoutes from './routes/onboarding';
import healthRoutes from './routes/health';

class PartnerServiceApp {
  private app: express.Application;
  private logger: Logger;
  private db: DatabaseService;
  private tenantMiddleware: TenantContextMiddleware;
  private partnerService: PartnerManagementService;
  private brandingService: WhiteLabelBrandingService;

  constructor() {
    this.app = express();
    this.logger = new Logger('PartnerService');
    this.initializeDatabase();
    this.initializeServices();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeDatabase(): void {
    this.db = new DatabaseService({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      username: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl
    });
  }

  private initializeServices(): void {
    this.tenantMiddleware = new TenantContextMiddleware(this.db);
    this.partnerService = new PartnerManagementService(this.db);
    this.brandingService = new WhiteLabelBrandingService(this.db, config.uploads.brandingPath);
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
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.cors.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        organizationId: req.headers['x-organization-id']
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // API routes with tenant context
    this.app.use('/api/v1/partners', 
      this.tenantMiddleware.extractTenantContext,
      partnerRoutes(this.partnerService)
    );

    this.app.use('/api/v1/branding', 
      this.tenantMiddleware.extractTenantContext,
      brandingRoutes(this.brandingService)
    );

    this.app.use('/api/v1/revenue', 
      this.tenantMiddleware.extractTenantContext,
      revenueRoutes(this.partnerService)
    );

    this.app.use('/api/v1/onboarding', 
      this.tenantMiddleware.extractTenantContext,
      onboardingRoutes(this.partnerService, this.brandingService)
    );

    // API documentation
    if (config.environment === 'development') {
      const swaggerUi = require('swagger-ui-express');
      const swaggerSpec = require('./swagger');
      this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.originalUrl
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error:', error);

      // Don't leak error details in production
      const isDevelopment = config.environment === 'development';
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: isDevelopment ? error.message : 'An unexpected error occurred',
        ...(isDevelopment && { stack: error.stack })
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, shutting down gracefully');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      this.logger.info('SIGINT received, shutting down gracefully');
      this.shutdown();
    });
  }

  private async shutdown(): Promise<void> {
    try {
      // Close database connections
      await this.db.close();
      
      this.logger.info('Partner service shut down successfully');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await this.db.connect();
      this.logger.info('Database connected successfully');

      // Start server
      const port = config.port;
      this.app.listen(port, () => {
        this.logger.info(`Partner service started on port ${port}`);
        this.logger.info(`Environment: ${config.environment}`);
        this.logger.info(`API Documentation: http://localhost:${port}/api-docs`);
      });
    } catch (error) {
      this.logger.error('Failed to start partner service:', error);
      process.exit(1);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Start the service if this file is run directly
if (require.main === module) {
  const app = new PartnerServiceApp();
  app.start().catch((error) => {
    console.error('Failed to start partner service:', error);
    process.exit(1);
  });
}

export default PartnerServiceApp;
