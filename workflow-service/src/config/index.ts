/**
 * Configuration for Workflow Service
 */

import { z } from 'zod';

const configSchema = z.object({
  // Server configuration
  port: z.number().default(3006),
  env: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database configuration
  database: z.object({
    url: z.string(),
    ssl: z.boolean().default(false),
    maxConnections: z.number().default(20),
    idleTimeoutMillis: z.number().default(30000),
    connectionTimeoutMillis: z.number().default(2000),
  }),
  
  // Redis configuration
  redis: z.object({
    url: z.string(),
    maxRetriesPerRequest: z.number().default(3),
    retryDelayOnFailover: z.number().default(100),
    enableOfflineQueue: z.boolean().default(false),
    lazyConnect: z.boolean().default(true),
  }),
  
  // JWT configuration
  jwt: z.object({
    secret: z.string(),
    expiresIn: z.string().default('24h'),
    issuer: z.string().default('universal-ai-cs'),
  }),
  
  // CORS configuration
  cors: z.object({
    origins: z.array(z.string()).default(['http://localhost:5173', 'http://localhost:3000']),
  }),
  
  // Rate limiting
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().default(1000), // requests per window
    standardHeaders: z.boolean().default(true),
    legacyHeaders: z.boolean().default(false),
  }),
  
  // Queue configuration
  queue: z.object({
    defaultJobOptions: z.object({
      removeOnComplete: z.number().default(100),
      removeOnFail: z.number().default(50),
      attempts: z.number().default(3),
      backoff: z.object({
        type: z.string().default('exponential'),
        delay: z.number().default(2000),
      }),
    }),
  }),
  
  // Workflow engine configuration
  workflowEngine: z.object({
    maxConcurrentExecutions: z.number().default(100),
    executionTimeoutMs: z.number().default(300000), // 5 minutes
    maxStepsPerWorkflow: z.number().default(100),
    maxVariablesPerWorkflow: z.number().default(50),
    enableDebugMode: z.boolean().default(false),
  }),
  
  // External service URLs
  services: z.object({
    aiService: z.string().default('http://localhost:3003'),
    integrationService: z.string().default('http://localhost:3002'),
    messageService: z.string().default('http://localhost:3004'),
    notificationService: z.string().default('http://localhost:3007'),
  }),
  
  // Logging configuration
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
    enableConsole: z.boolean().default(true),
    enableFile: z.boolean().default(false),
    filename: z.string().optional(),
  }),
});

const rawConfig = {
  port: parseInt(process.env.PORT || '3006', 10),
  env: process.env.NODE_ENV || 'development',
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/universal_ai_cs',
    ssl: process.env.DATABASE_SSL === 'true',
    maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '2000', 10),
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
    enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
    lazyConnect: process.env.REDIS_LAZY_CONNECT !== 'false',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: process.env.JWT_ISSUER || 'universal-ai-cs',
  },
  
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
    standardHeaders: process.env.RATE_LIMIT_STANDARD_HEADERS !== 'false',
    legacyHeaders: process.env.RATE_LIMIT_LEGACY_HEADERS === 'true',
  },
  
  queue: {
    defaultJobOptions: {
      removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE || '100', 10),
      removeOnFail: parseInt(process.env.QUEUE_REMOVE_ON_FAIL || '50', 10),
      attempts: parseInt(process.env.QUEUE_ATTEMPTS || '3', 10),
      backoff: {
        type: process.env.QUEUE_BACKOFF_TYPE || 'exponential',
        delay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '2000', 10),
      },
    },
  },
  
  workflowEngine: {
    maxConcurrentExecutions: parseInt(process.env.WORKFLOW_MAX_CONCURRENT || '100', 10),
    executionTimeoutMs: parseInt(process.env.WORKFLOW_EXECUTION_TIMEOUT || '300000', 10),
    maxStepsPerWorkflow: parseInt(process.env.WORKFLOW_MAX_STEPS || '100', 10),
    maxVariablesPerWorkflow: parseInt(process.env.WORKFLOW_MAX_VARIABLES || '50', 10),
    enableDebugMode: process.env.WORKFLOW_DEBUG_MODE === 'true',
  },
  
  services: {
    aiService: process.env.AI_SERVICE_URL || 'http://localhost:3003',
    integrationService: process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3002',
    messageService: process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004',
    notificationService: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007',
  },
  
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    format: (process.env.LOG_FORMAT as any) || 'json',
    enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
    enableFile: process.env.LOG_ENABLE_FILE === 'true',
    filename: process.env.LOG_FILENAME,
  },
};

export const config = configSchema.parse(rawConfig);
