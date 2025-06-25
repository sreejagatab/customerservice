/**
 * Monitoring Service - Main Entry Point
 * Comprehensive monitoring, alerting, and incident response system
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from '@universal-ai-cs/shared';
import { MonitoringService } from './services/monitoring-service';
import { AlertingService } from './services/alerting-service';
import { IncidentResponseService } from './services/incident-response-service';
import { MetricsCollectionService } from './services/metrics-collection-service';

// Route imports
import healthRoutes from './routes/health';
import monitoringRoutes from './routes/monitoring';
import alertsRoutes from './routes/alerts';
import incidentsRoutes from './routes/incidents';
import metricsRoutes from './routes/metrics';

class MonitoringServiceApp {
  private app: express.Application;
  private monitoringService: MonitoringService;
  private alertingService: AlertingService;
  private incidentResponse: IncidentResponseService;
  private metricsCollection: MetricsCollectionService;

  constructor() {
    this.app = express();
    this.monitoringService = MonitoringService.getInstance();
    this.alertingService = AlertingService.getInstance();
    this.incidentResponse = IncidentResponseService.getInstance();
    this.metricsCollection = MetricsCollectionService.getInstance();
    
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

    // Metrics collection middleware
    this.app.use(async (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.metricsCollection.recordMetric({
          service: 'monitoring-service',
          endpoint: req.url,
          method: req.method,
          statusCode: res.statusCode,
          duration,
          timestamp: new Date(),
        });
      });
      
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Monitoring service request', {
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
    this.app.use('/api/v1/monitoring', monitoringRoutes);
    this.app.use('/api/v1/alerts', alertsRoutes);
    this.app.use('/api/v1/incidents', incidentsRoutes);
    this.app.use('/api/v1/metrics', metricsRoutes);

    // Webhook endpoints for external monitoring systems
    this.app.post('/webhooks/prometheus', async (req, res) => {
      try {
        await this.alertingService.handlePrometheusWebhook(req.body);
        res.status(200).send('OK');
      } catch (error) {
        logger.error('Prometheus webhook error', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).send('Webhook error');
      }
    });

    this.app.post('/webhooks/grafana', async (req, res) => {
      try {
        await this.alertingService.handleGrafanaWebhook(req.body);
        res.status(200).send('OK');
      } catch (error) {
        logger.error('Grafana webhook error', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).send('Webhook error');
      }
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: 'Monitoring Service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        features: {
          systemMonitoring: true,
          alerting: true,
          incidentResponse: true,
          metricsCollection: true,
          dashboards: true,
        },
      });
    });

    // API documentation
    this.app.get('/api-docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Monitoring Service API',
          version: '1.0.0',
          description: 'Universal AI Customer Service Platform - Monitoring Service',
        },
        servers: [
          {
            url: `http://localhost:${process.env.PORT || 3011}`,
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
          '/api/v1/monitoring/status': {
            get: {
              summary: 'Get system monitoring status',
              responses: {
                '200': {
                  description: 'System status information',
                },
              },
            },
          },
          '/api/v1/alerts': {
            get: {
              summary: 'Get active alerts',
              responses: {
                '200': {
                  description: 'List of active alerts',
                },
              },
            },
          },
          '/api/v1/incidents': {
            get: {
              summary: 'Get incidents',
              responses: {
                '200': {
                  description: 'List of incidents',
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
      logger.error('Monitoring service error', {
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
      await this.monitoringService.initialize();
      await this.alertingService.initialize();
      await this.incidentResponse.initialize();
      await this.metricsCollection.initialize();

      const port = process.env.PORT || 3011;
      
      this.app.listen(port, () => {
        logger.info(`Monitoring Service started on port ${port}`, {
          environment: process.env.NODE_ENV || 'development',
          port,
          features: {
            systemMonitoring: true,
            alerting: true,
            incidentResponse: true,
            metricsCollection: true,
          },
        });
      });
    } catch (error) {
      logger.error('Failed to start Monitoring Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.monitoringService.shutdown();
      await this.alertingService.shutdown();
      await this.incidentResponse.shutdown();
      await this.metricsCollection.shutdown();
      
      logger.info('Monitoring Service stopped gracefully');
    } catch (error) {
      logger.error('Error stopping Monitoring Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getServices() {
    return {
      monitoringService: this.monitoringService,
      alertingService: this.alertingService,
      incidentResponse: this.incidentResponse,
      metricsCollection: this.metricsCollection,
    };
  }
}

// Create and start the service
const monitoringService = new MonitoringServiceApp();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await monitoringService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await monitoringService.stop();
  process.exit(0);
});

// Start the service
monitoringService.start().catch((error) => {
  logger.error('Failed to start Monitoring Service', { error });
  process.exit(1);
});

export default monitoringService;
