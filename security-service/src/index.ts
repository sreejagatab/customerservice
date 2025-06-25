/**
 * Security Service - Main Entry Point
 * Provides comprehensive security monitoring, intrusion detection, and vulnerability scanning
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from '@universal-ai-cs/shared';
import { SecurityMonitoringService } from './services/security-monitoring-service';
import { PenetrationTestingService } from './services/penetration-testing-service';
import { VulnerabilityScanner } from './services/vulnerability-scanner';
import { IntrusionDetectionService } from './services/intrusion-detection-service';

// Route imports
import healthRoutes from './routes/health';
import securityRoutes from './routes/security';
import vulnerabilityRoutes from './routes/vulnerabilities';
import complianceRoutes from './routes/compliance';

class SecurityServiceApp {
  private app: express.Application;
  private securityMonitoring: SecurityMonitoringService;
  private penetrationTesting: PenetrationTestingService;
  private vulnerabilityScanner: VulnerabilityScanner;
  private intrusionDetection: IntrusionDetectionService;

  constructor() {
    this.app = express();
    this.securityMonitoring = SecurityMonitoringService.getInstance();
    this.penetrationTesting = PenetrationTestingService.getInstance();
    this.vulnerabilityScanner = VulnerabilityScanner.getInstance();
    this.intrusionDetection = IntrusionDetectionService.getInstance();
    
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
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
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

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Security service request', {
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
    this.app.use('/api/v1/security', securityRoutes);
    this.app.use('/api/v1/vulnerabilities', vulnerabilityRoutes);
    this.app.use('/api/v1/compliance', complianceRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: 'Security Service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        features: {
          securityMonitoring: true,
          vulnerabilityScanning: true,
          intrusionDetection: true,
          penetrationTesting: true,
          complianceChecking: true,
        },
      });
    });

    // API documentation
    this.app.get('/api-docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Security Service API',
          version: '1.0.0',
          description: 'Universal AI Customer Service Platform - Security Service',
        },
        servers: [
          {
            url: `http://localhost:${process.env.PORT || 3008}`,
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
          '/api/v1/security/threats': {
            get: {
              summary: 'Get security threats',
              responses: {
                '200': {
                  description: 'List of security threats',
                },
              },
            },
          },
          '/api/v1/vulnerabilities/scan': {
            post: {
              summary: 'Start vulnerability scan',
              responses: {
                '200': {
                  description: 'Scan started successfully',
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
      logger.error('Security service error', {
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
      await this.securityMonitoring.initialize();
      await this.vulnerabilityScanner.initialize();
      await this.intrusionDetection.initialize();
      await this.penetrationTesting.initialize();

      const port = process.env.PORT || 3008;
      
      this.app.listen(port, () => {
        logger.info(`Security Service started on port ${port}`, {
          environment: process.env.NODE_ENV || 'development',
          port,
          features: {
            securityMonitoring: true,
            vulnerabilityScanning: true,
            intrusionDetection: true,
            penetrationTesting: true,
          },
        });
      });
    } catch (error) {
      logger.error('Failed to start Security Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.securityMonitoring.shutdown();
      await this.vulnerabilityScanner.shutdown();
      await this.intrusionDetection.shutdown();
      await this.penetrationTesting.shutdown();
      
      logger.info('Security Service stopped gracefully');
    } catch (error) {
      logger.error('Error stopping Security Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getServices() {
    return {
      securityMonitoring: this.securityMonitoring,
      vulnerabilityScanner: this.vulnerabilityScanner,
      intrusionDetection: this.intrusionDetection,
      penetrationTesting: this.penetrationTesting,
    };
  }
}

// Create and start the service
const securityService = new SecurityServiceApp();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await securityService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await securityService.stop();
  process.exit(0);
});

// Start the service
securityService.start().catch((error) => {
  logger.error('Failed to start Security Service', { error });
  process.exit(1);
});

export default securityService;
