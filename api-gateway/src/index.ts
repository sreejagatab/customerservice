import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

// Load environment variables
dotenv.config();

// Import services and middleware
import { ServiceRegistry } from './services/service-registry';
import { ProxyService } from './services/proxy.service';
import { GatewayMiddleware } from './middleware/gateway.middleware';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { ErrorCode } from '@universal-ai-cs/shared';

class ApiGateway {
  private app: express.Application;
  private server: any;
  private serviceRegistry: ServiceRegistry;
  private proxyService: ProxyService;
  private gatewayMiddleware: GatewayMiddleware;
  private rateLimitMiddleware: RateLimitMiddleware;

  constructor() {
    this.app = express();
    this.initializeServices();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.registerServices();
  }

  private initializeServices(): void {
    // Initialize service registry
    this.serviceRegistry = new ServiceRegistry(
      parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000')
    );

    // Initialize proxy service
    this.proxyService = new ProxyService(this.serviceRegistry, {
      timeout: parseInt(process.env.PROXY_TIMEOUT || '30000'),
      retries: parseInt(process.env.PROXY_RETRIES || '3'),
      retryDelay: parseInt(process.env.PROXY_RETRY_DELAY || '1000'),
      circuitBreaker: {
        failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
        resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET || '60000'),
      },
    });

    // Initialize middleware
    this.gatewayMiddleware = new GatewayMiddleware(
      this.serviceRegistry,
      process.env.JWT_SECRET || 'your-secret-key'
    );

    this.rateLimitMiddleware = new RateLimitMiddleware();
  }

  private initializeMiddleware(): void => {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', true);

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    // Compression
    this.app.use(compression());

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Custom middleware
    this.app.use(this.gatewayMiddleware.requestTracking);
    this.app.use(this.gatewayMiddleware.cors);
    this.app.use(this.gatewayMiddleware.securityHeaders);
    this.app.use(this.gatewayMiddleware.responseTime);
    this.app.use(this.gatewayMiddleware.requestLogger);
    this.app.use(this.gatewayMiddleware.validateRequest);

    // Rate limiting
    this.app.use('/api', this.rateLimitMiddleware.createApiLimiter(
      parseInt(process.env.RATE_LIMIT_MAX || '100'),
      parseInt(process.env.RATE_LIMIT_WINDOW || '900000') // 15 minutes
    ));
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const stats = this.serviceRegistry.getStats();
      const proxyMetrics = this.proxyService.getMetrics();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        services: stats,
        proxy: proxyMetrics,
      });
    });

    // Service registry endpoints
    this.app.get('/services', (req, res) => {
      const services = this.serviceRegistry.getAllServices();
      res.json({
        success: true,
        data: services,
      });
    });

    this.app.get('/services/:serviceName/health', async (req, res) => {
      const { serviceName } = req.params;
      const isHealthy = await this.serviceRegistry.checkServiceHealth(serviceName);
      
      res.json({
        success: true,
        data: {
          service: serviceName,
          healthy: isHealthy,
        },
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const serviceStats = this.serviceRegistry.getStats();
      const proxyMetrics = this.proxyService.getMetrics();
      
      res.json({
        success: true,
        data: {
          services: serviceStats,
          proxy: proxyMetrics,
          timestamp: new Date().toISOString(),
        },
      });
    });

    // API Documentation
    if (process.env.NODE_ENV !== 'production') {
      const swaggerOptions = {
        definition: {
          openapi: '3.0.0',
          info: {
            title: 'Universal AI Customer Service API',
            version: '1.0.0',
            description: 'API Gateway for Universal AI Customer Service Platform',
          },
          servers: [
            {
              url: `http://localhost:${process.env.PORT || 3000}`,
              description: 'Development server',
            },
          ],
        },
        apis: ['./src/routes/*.ts'], // Path to the API docs
      };

      const specs = swaggerJsdoc(swaggerOptions);
      this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
    }

    // Dynamic routing based on service registry
    this.app.use('/api/v1/*', async (req, res, next) => {
      const route = this.serviceRegistry.getRoute(req.path, req.method);
      
      if (!route) {
        res.status(404).json({
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Route not found',
          },
        });
        return;
      }

      // Apply authentication if required
      if (route.auth) {
        await this.gatewayMiddleware.authenticate(req, res, (error) => {
          if (error) {
            return next(error);
          }
          this.handleProxyRequest(req, res, route, next);
        });
      } else {
        this.handleProxyRequest(req, res, route, next);
      }
    });

    // 404 handler for all other routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Endpoint not found',
        },
      });
    });
  }

  private async handleProxyRequest(req: express.Request, res: express.Response, route: any, next: express.NextFunction): Promise<void> {
    try {
      // Check service health
      const service = this.serviceRegistry.getService(route.service);
      if (!service || service.status !== 'healthy') {
        res.status(503).json({
          success: false,
          error: {
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: `Service ${route.service} is not available`,
          },
        });
        return;
      }

      // Apply route-specific rate limiting if configured
      if (route.rateLimit) {
        const rateLimiter = this.rateLimitMiddleware.create({
          windowMs: route.rateLimit.windowMs,
          maxRequests: route.rateLimit.maxRequests,
          keyGenerator: (req) => `route:${route.path}:${req.user?.id || req.ip}`,
        });
        
        await new Promise<void>((resolve, reject) => {
          rateLimiter(req, res, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      // Proxy the request
      await this.proxyService.proxyRequest(req, res, route);
    } catch (error) {
      next(error);
    }
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use(this.gatewayMiddleware.errorHandler);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Handle termination signals
    process.on('SIGTERM', () => {
      console.log('SIGTERM received');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received');
      this.gracefulShutdown('SIGINT');
    });
  }

  private registerServices(): void {
    // Register microservices
    const services = [
      {
        id: 'auth-service',
        name: 'auth-service',
        url: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
        health: '/health',
        version: '1.0.0',
      },
      {
        id: 'integration-service',
        name: 'integration-service',
        url: process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3002',
        health: '/health',
        version: '1.0.0',
      },
      {
        id: 'ai-service',
        name: 'ai-service',
        url: process.env.AI_SERVICE_URL || 'http://localhost:3003',
        health: '/health',
        version: '1.0.0',
      },
      {
        id: 'message-service',
        name: 'message-service',
        url: process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004',
        health: '/health',
        version: '1.0.0',
      },
      {
        id: 'workflow-service',
        name: 'workflow-service',
        url: process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3005',
        health: '/health',
        version: '1.0.0',
      },
      {
        id: 'analytics-service',
        name: 'analytics-service',
        url: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3006',
        health: '/health',
        version: '1.0.0',
      },
      {
        id: 'notification-service',
        name: 'notification-service',
        url: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007',
        health: '/health',
        version: '1.0.0',
      },
      {
        id: 'admin-service',
        name: 'admin-service',
        url: process.env.ADMIN_SERVICE_URL || 'http://localhost:3008',
        health: '/health',
        version: '1.0.0',
      },
    ];

    services.forEach(service => {
      this.serviceRegistry.registerService(service);
    });

    console.log(`Registered ${services.length} services`);
  }

  public async start(): Promise<void> {
    try {
      // Start HTTP server
      const port = process.env.PORT || 3000;
      this.server = createServer(this.app);
      
      this.server.listen(port, () => {
        console.log(`API Gateway listening on port ${port}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Health check: http://localhost:${port}/health`);
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`API Documentation: http://localhost:${port}/api-docs`);
        }
      });

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.syscall !== 'listen') {
          throw error;
        }

        switch (error.code) {
          case 'EACCES':
            console.error(`Port ${port} requires elevated privileges`);
            process.exit(1);
            break;
          case 'EADDRINUSE':
            console.error(`Port ${port} is already in use`);
            process.exit(1);
            break;
          default:
            throw error;
        }
      });

      // Perform initial health checks
      await this.serviceRegistry.checkAllServicesHealth();

    } catch (error) {
      console.error('Failed to start API Gateway:', error);
      process.exit(1);
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      if (this.server) {
        this.server.close(() => {
          console.log('HTTP server closed');
        });
      }

      // Stop health checks
      if (this.serviceRegistry) {
        this.serviceRegistry.stopHealthChecks();
        console.log('Service registry stopped');
      }

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Start the gateway if this file is run directly
if (require.main === module) {
  const gateway = new ApiGateway();
  gateway.start();
}

export default ApiGateway;
