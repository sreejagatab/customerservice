/**
 * Billing Service - Main Entry Point
 * Multi-tenant billing system with usage tracking and Stripe integration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from '@universal-ai-cs/shared';
// Service imports will be created
// import { BillingService } from './services/billing-service';
// import { UsageTrackingService } from './services/usage-tracking-service';
// import { SubscriptionService } from './services/subscription-service';
// import { PaymentService } from './services/payment-service';

// Route imports
import healthRoutes from './routes/health';
import billingRoutes from './routes/billing';
import subscriptionRoutes from './routes/subscriptions';
import usageRoutes from './routes/usage';
import paymentRoutes from './routes/payments';

class BillingServiceApp {
  private app: express.Application;
  private billingService: BillingService;
  private usageTracking: UsageTrackingService;
  private subscriptionService: SubscriptionService;
  private paymentService: PaymentService;

  constructor() {
    this.app = express();
    this.billingService = BillingService.getInstance();
    this.usageTracking = UsageTrackingService.getInstance();
    this.subscriptionService = SubscriptionService.getInstance();
    this.paymentService = PaymentService.getInstance();
    
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
          connectSrc: ["'self'", "https://api.stripe.com"],
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

    // Usage tracking middleware
    this.app.use(async (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const tenantId = req.headers['x-tenant-id'] as string;
        
        if (tenantId && req.url.startsWith('/api/')) {
          this.usageTracking.recordUsage({
            organizationId: tenantId,
            service: 'billing-api',
            endpoint: req.url,
            method: req.method,
            duration,
            timestamp: new Date(),
            metadata: {
              statusCode: res.statusCode,
              userAgent: req.get('User-Agent'),
            },
          });
        }
      });
      
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Billing service request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        tenantId: req.headers['x-tenant-id'],
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/billing', billingRoutes);
    this.app.use('/api/v1/subscriptions', subscriptionRoutes);
    this.app.use('/api/v1/usage', usageRoutes);
    this.app.use('/api/v1/payments', paymentRoutes);

    // Stripe webhooks (no auth required)
    this.app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
      try {
        await this.paymentService.handleStripeWebhook(req.body, req.headers['stripe-signature'] as string);
        res.status(200).send('OK');
      } catch (error) {
        logger.error('Stripe webhook error', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).send('Webhook error');
      }
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: 'Billing Service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        features: {
          usageTracking: true,
          subscriptionManagement: true,
          stripeIntegration: true,
          multiTenantBilling: true,
          quotaEnforcement: true,
        },
      });
    });

    // API documentation
    this.app.get('/api-docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Billing Service API',
          version: '1.0.0',
          description: 'Universal AI Customer Service Platform - Billing Service',
        },
        servers: [
          {
            url: `http://localhost:${process.env.PORT || 3010}`,
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
          '/api/v1/billing/invoices': {
            get: {
              summary: 'Get billing invoices',
              responses: {
                '200': {
                  description: 'List of invoices',
                },
              },
            },
          },
          '/api/v1/subscriptions': {
            get: {
              summary: 'Get subscriptions',
              responses: {
                '200': {
                  description: 'List of subscriptions',
                },
              },
            },
          },
          '/api/v1/usage/metrics': {
            get: {
              summary: 'Get usage metrics',
              responses: {
                '200': {
                  description: 'Usage metrics data',
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
      logger.error('Billing service error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        tenantId: req.headers['x-tenant-id'],
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
      await this.billingService.initialize();
      await this.usageTracking.initialize();
      await this.subscriptionService.initialize();
      await this.paymentService.initialize();

      const port = process.env.PORT || 3010;
      
      this.app.listen(port, () => {
        logger.info(`Billing Service started on port ${port}`, {
          environment: process.env.NODE_ENV || 'development',
          port,
          features: {
            usageTracking: true,
            subscriptionManagement: true,
            stripeIntegration: true,
            multiTenantBilling: true,
          },
        });
      });
    } catch (error) {
      logger.error('Failed to start Billing Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.billingService.shutdown();
      await this.usageTracking.shutdown();
      await this.subscriptionService.shutdown();
      await this.paymentService.shutdown();
      
      logger.info('Billing Service stopped gracefully');
    } catch (error) {
      logger.error('Error stopping Billing Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getServices() {
    return {
      billingService: this.billingService,
      usageTracking: this.usageTracking,
      subscriptionService: this.subscriptionService,
      paymentService: this.paymentService,
    };
  }
}

// Create and start the service
const billingService = new BillingServiceApp();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await billingService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await billingService.stop();
  process.exit(0);
});

// Start the service
billingService.start().catch((error) => {
  logger.error('Failed to start Billing Service', { error });
  process.exit(1);
});

export default billingService;
