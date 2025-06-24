/**
 * Workflow Service - Main Entry Point
 * Universal AI Customer Service Platform
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/error-handler';
import { authMiddleware } from '@/middleware/auth';
import { rateLimitMiddleware } from '@/middleware/rate-limit';
import { validateMiddleware } from '@/middleware/validation';

// Import routes
import workflowRoutes from '@/routes/workflows';
import executionRoutes from '@/routes/executions';
import templateRoutes from '@/routes/templates';
import healthRoutes from '@/routes/health';

// Import services
import { DatabaseService } from '@/services/database';
import { RedisService } from '@/services/redis';
import { QueueService } from '@/services/queue';
import { WorkflowEngine } from '@/services/workflow-engine';

const app = express();

// Security middleware
app.use(helmet({
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
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Compression and parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (config.env !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
  }));
}

// Rate limiting
app.use(rateLimitMiddleware);

// Health check (no auth required)
app.use('/health', healthRoutes);

// API routes with authentication
app.use('/api/v1/workflows', authMiddleware, workflowRoutes);
app.use('/api/v1/executions', authMiddleware, executionRoutes);
app.use('/api/v1/templates', authMiddleware, templateRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Initialize services
async function initializeServices() {
  try {
    logger.info('Initializing Workflow Service...');

    // Initialize database
    await DatabaseService.initialize();
    logger.info('Database connection established');

    // Initialize Redis
    await RedisService.initialize();
    logger.info('Redis connection established');

    // Initialize queue service
    await QueueService.initialize();
    logger.info('Queue service initialized');

    // Initialize workflow engine
    await WorkflowEngine.initialize();
    logger.info('Workflow engine initialized');

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down Workflow Service...');
  
  try {
    await QueueService.shutdown();
    await RedisService.shutdown();
    await DatabaseService.shutdown();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
async function startServer() {
  await initializeServices();
  
  const server = app.listen(config.port, () => {
    logger.info(`Workflow Service running on port ${config.port}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`Health check: http://localhost:${config.port}/health`);
  });

  return server;
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { app, startServer };
