/**
 * Admin Service - Main Application Entry Point
 * Universal AI Customer Service Platform - Administrative Management Hub
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

// Import services
import { UserService } from '@/services/user-service';
import { OrganizationService } from '@/services/organization-service';
import { RBACService } from '@/services/rbac-service';
import { AnalyticsService } from '@/services/analytics-service';
import { AuditService } from '@/services/audit-service';
import { HealthMonitoringService } from '@/services/health-monitoring-service';
import { BackupService } from '@/services/backup-service';
import { TenantService } from '@/services/tenant-service';
import { SSOService } from '@/services/sso-service';
import { ComplianceService } from '@/services/compliance-service';
import { FeatureToggleService } from '@/services/feature-toggle-service';

// Import routes
import healthRoutes from '@/routes/health';
import userRoutes from '@/routes/users';
import organizationRoutes from '@/routes/organizations';
import rbacRoutes from '@/routes/rbac';
import analyticsRoutes from '@/routes/analytics';
import auditRoutes from '@/routes/audit';
import tenantRoutes from '@/routes/tenants';
import ssoRoutes from '@/routes/sso';
import complianceRoutes from '@/routes/compliance';
import systemRoutes from '@/routes/system';

class AdminService {
  private app: Application;
  private server: Server | null = null;
  
  // Service instances
  private userService: UserService;
  private organizationService: OrganizationService;
  private rbacService: RBACService;
  private analyticsService: AnalyticsService;
  private auditService: AuditService;
  private healthMonitoringService: HealthMonitoringService;
  private backupService: BackupService;
  private tenantService: TenantService;
  private ssoService: SSOService;
  private complianceService: ComplianceService;
  private featureToggleService: FeatureToggleService;

  constructor() {
    this.app = express();
    
    // Initialize services
    this.userService = UserService.getInstance();
    this.organizationService = OrganizationService.getInstance();
    this.rbacService = RBACService.getInstance();
    this.analyticsService = AnalyticsService.getInstance();
    this.auditService = AuditService.getInstance();
    this.healthMonitoringService = HealthMonitoringService.getInstance();
    this.backupService = BackupService.getInstance();
    this.tenantService = TenantService.getInstance();
    this.ssoService = SSOService.getInstance();
    this.complianceService = ComplianceService.getInstance();
    this.featureToggleService = FeatureToggleService.getInstance();
    
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
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key', 'X-Organization-ID'],
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
        `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.headers['x-request-id'] as string);
      next();
    });

    // Organization context middleware
    this.app.use((req, res, next) => {
      const organizationId = req.headers['x-organization-id'] as string;
      if (organizationId) {
        (req as any).organizationId = organizationId;
      }
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check routes (no authentication required)
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/users', userRoutes);
    this.app.use('/api/v1/organizations', organizationRoutes);
    this.app.use('/api/v1/rbac', rbacRoutes);
    this.app.use('/api/v1/analytics', analyticsRoutes);
    this.app.use('/api/v1/audit', auditRoutes);
    this.app.use('/api/v1/tenants', tenantRoutes);
    this.app.use('/api/v1/sso', ssoRoutes);
    this.app.use('/api/v1/compliance', complianceRoutes);
    this.app.use('/api/v1/system', systemRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: config.serviceName,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
        features: {
          userRegistration: config.features.userRegistration,
          organizationCreation: config.features.organizationCreation,
          auditLogging: config.features.auditLogging,
          activityMonitoring: config.features.activityMonitoring,
          automatedBackups: config.features.automatedBackups,
          healthMonitoring: config.features.healthMonitoring,
          performanceAnalytics: config.features.performanceAnalytics,
        },
        multiTenancy: {
          defaultPlan: config.multiTenancy.defaultPlan,
          maxUsersPerOrganization: config.multiTenancy.maxUsersPerOrganization,
          maxIntegrationsPerOrganization: config.multiTenancy.maxIntegrationsPerOrganization,
        },
      });
    });

    // API documentation
    this.app.get('/api-docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Admin Service API',
          version: '1.0.0',
          description: 'Universal AI Customer Service Platform - Admin Service',
        },
        servers: [
          {
            url: `http://localhost:${config.port}`,
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

  private async initializeServices(): Promise<void> {
    try {
      // Initialize core services
      await this.userService.initialize();
      logger.info('User service initialized');

      await this.organizationService.initialize();
      logger.info('Organization service initialized');

      await this.rbacService.initialize();
      logger.info('RBAC service initialized');

      await this.tenantService.initialize();
      logger.info('Tenant service initialized');

      // Initialize audit service
      if (config.features.auditLogging) {
        await this.auditService.initialize();
        logger.info('Audit service initialized');
      }

      // Initialize analytics service
      if (config.features.performanceAnalytics) {
        await this.analyticsService.initialize();
        logger.info('Analytics service initialized');
      }

      // Initialize health monitoring
      if (config.features.healthMonitoring) {
        await this.healthMonitoringService.initialize();
        logger.info('Health monitoring service initialized');
      }

      // Initialize backup service
      if (config.features.automatedBackups) {
        await this.backupService.initialize();
        logger.info('Backup service initialized');
      }

      // Initialize SSO service
      await this.ssoService.initialize();
      logger.info('SSO service initialized');

      // Initialize compliance service
      await this.complianceService.initialize();
      logger.info('Compliance service initialized');

      // Initialize feature toggle service
      await this.featureToggleService.initialize();
      logger.info('Feature toggle service initialized');

      logger.info('All admin services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize admin services', {
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
        logger.info('Admin Service started', {
          port: config.port,
          environment: config.nodeEnv,
          service: config.serviceName,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${config.port} is already in use`);
        } else {
          logger.error('Server error', { error: error.message });
        }
        process.exit(1);
      });

      // Start background services
      await this.startBackgroundServices();

    } catch (error) {
      logger.error('Failed to start Admin Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  private async startBackgroundServices(): Promise<void> {
    try {
      // Start health monitoring
      if (config.features.healthMonitoring) {
        await this.healthMonitoringService.startMonitoring();
        logger.info('Health monitoring started');
      }

      // Start backup scheduler
      if (config.features.automatedBackups) {
        await this.backupService.startScheduler();
        logger.info('Backup scheduler started');
      }

      // Start analytics aggregation
      if (config.features.performanceAnalytics) {
        await this.analyticsService.startAggregation();
        logger.info('Analytics aggregation started');
      }

      logger.info('All background services started');
    } catch (error) {
      logger.error('Failed to start background services', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down Admin Service...');

    try {
      // Stop background services
      if (config.features.healthMonitoring) {
        await this.healthMonitoringService.stopMonitoring();
        logger.info('Health monitoring stopped');
      }

      if (config.features.automatedBackups) {
        await this.backupService.stopScheduler();
        logger.info('Backup scheduler stopped');
      }

      if (config.features.performanceAnalytics) {
        await this.analyticsService.stopAggregation();
        logger.info('Analytics aggregation stopped');
      }

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

      // Close service connections
      await this.userService.close();
      await this.organizationService.close();
      await this.rbacService.close();
      await this.tenantService.close();

      if (config.features.auditLogging) {
        await this.auditService.close();
      }

      if (config.features.performanceAnalytics) {
        await this.analyticsService.close();
      }

      await this.ssoService.close();
      await this.complianceService.close();
      await this.featureToggleService.close();

      logger.info('Admin Service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getApp(): Application {
    return this.app;
  }

  public getServices() {
    return {
      user: this.userService,
      organization: this.organizationService,
      rbac: this.rbacService,
      analytics: this.analyticsService,
      audit: this.auditService,
      healthMonitoring: this.healthMonitoringService,
      backup: this.backupService,
      tenant: this.tenantService,
      sso: this.ssoService,
      compliance: this.complianceService,
      featureToggle: this.featureToggleService,
    };
  }
}

// Create and start the service
const adminService = new AdminService();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await adminService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await adminService.stop();
  process.exit(0);
});

// Start the service
if (require.main === module) {
  adminService.start().catch((error) => {
    logger.error('Failed to start service', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export default adminService;
