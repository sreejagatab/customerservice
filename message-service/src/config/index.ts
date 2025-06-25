/**
 * Message Service Configuration
 * Universal AI Customer Service Platform - Message Processing Engine
 */

import Joi from 'joi';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3004),
  SERVICE_NAME: Joi.string().default('message-service'),
  
  // Database configuration
  DATABASE_URL: Joi.string().required(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().default('universal_ai_cs'),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_POOL_MIN: Joi.number().default(2),
  DB_POOL_MAX: Joi.number().default(20),
  
  // Redis configuration
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_DB: Joi.number().default(0),
  
  // RabbitMQ configuration
  RABBITMQ_URL: Joi.string().default('amqp://localhost:5672'),
  RABBITMQ_HOST: Joi.string().default('localhost'),
  RABBITMQ_PORT: Joi.number().default(5672),
  RABBITMQ_USER: Joi.string().default('guest'),
  RABBITMQ_PASSWORD: Joi.string().default('guest'),
  RABBITMQ_VHOST: Joi.string().default('/'),
  
  // JWT configuration
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  
  // Message processing configuration
  MESSAGE_BATCH_SIZE: Joi.number().default(100),
  MESSAGE_PROCESSING_TIMEOUT: Joi.number().default(30000), // 30 seconds
  MESSAGE_RETRY_ATTEMPTS: Joi.number().default(3),
  MESSAGE_RETRY_DELAY: Joi.number().default(5000), // 5 seconds
  
  // Queue configuration
  QUEUE_CONCURRENCY: Joi.number().default(10),
  QUEUE_MAX_ATTEMPTS: Joi.number().default(3),
  QUEUE_BACKOFF_DELAY: Joi.number().default(2000),
  QUEUE_REMOVE_ON_COMPLETE: Joi.number().default(100),
  QUEUE_REMOVE_ON_FAIL: Joi.number().default(50),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(1000),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // External services
  AI_SERVICE_URL: Joi.string().default('http://localhost:3003'),
  AI_SERVICE_API_KEY: Joi.string().required(),
  INTEGRATION_SERVICE_URL: Joi.string().default('http://localhost:3002'),
  INTEGRATION_SERVICE_API_KEY: Joi.string().required(),
  NOTIFICATION_SERVICE_URL: Joi.string().default('http://localhost:3005'),
  NOTIFICATION_SERVICE_API_KEY: Joi.string().required(),
  
  // Webhook configuration
  WEBHOOK_TIMEOUT: Joi.number().default(10000), // 10 seconds
  WEBHOOK_RETRY_ATTEMPTS: Joi.number().default(3),
  WEBHOOK_RETRY_DELAY: Joi.number().default(1000), // 1 second
  
  // Performance monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9094),
  
  // Security
  CORS_ORIGIN: Joi.string().default('*'),
  TRUST_PROXY: Joi.boolean().default(false),
  ENABLE_REQUEST_LOGGING: Joi.boolean().default(true),
  
  // Feature flags
  ENABLE_MESSAGE_ENCRYPTION: Joi.boolean().default(false),
  ENABLE_MESSAGE_COMPRESSION: Joi.boolean().default(true),
  ENABLE_REAL_TIME_SYNC: Joi.boolean().default(true),
  ENABLE_MESSAGE_DEDUPLICATION: Joi.boolean().default(true),
}).unknown();

// Validate configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Message Service config validation error: ${error.message}`);
}

// Export configuration
export const config = {
  // Server
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
  serviceName: envVars.SERVICE_NAME,
  
  // Database
  database: {
    url: envVars.DATABASE_URL,
    host: envVars.DB_HOST,
    port: envVars.DB_PORT,
    name: envVars.DB_NAME,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
    ssl: envVars.DB_SSL,
    pool: {
      min: envVars.DB_POOL_MIN,
      max: envVars.DB_POOL_MAX,
    },
  },
  
  // Redis
  redis: {
    url: envVars.REDIS_URL,
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    db: envVars.REDIS_DB,
  },
  
  // RabbitMQ
  rabbitmq: {
    url: envVars.RABBITMQ_URL,
    host: envVars.RABBITMQ_HOST,
    port: envVars.RABBITMQ_PORT,
    user: envVars.RABBITMQ_USER,
    password: envVars.RABBITMQ_PASSWORD,
    vhost: envVars.RABBITMQ_VHOST,
  },
  
  // JWT
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
  },
  
  // Message processing
  messageProcessing: {
    batchSize: envVars.MESSAGE_BATCH_SIZE,
    timeout: envVars.MESSAGE_PROCESSING_TIMEOUT,
    retryAttempts: envVars.MESSAGE_RETRY_ATTEMPTS,
    retryDelay: envVars.MESSAGE_RETRY_DELAY,
  },
  
  // Queue
  queue: {
    concurrency: envVars.QUEUE_CONCURRENCY,
    maxAttempts: envVars.QUEUE_MAX_ATTEMPTS,
    backoffDelay: envVars.QUEUE_BACKOFF_DELAY,
    removeOnComplete: envVars.QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: envVars.QUEUE_REMOVE_ON_FAIL,
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL,
    format: envVars.LOG_FORMAT,
  },
  
  // External services
  services: {
    ai: {
      url: envVars.AI_SERVICE_URL,
      apiKey: envVars.AI_SERVICE_API_KEY,
    },
    integration: {
      url: envVars.INTEGRATION_SERVICE_URL,
      apiKey: envVars.INTEGRATION_SERVICE_API_KEY,
    },
    notification: {
      url: envVars.NOTIFICATION_SERVICE_URL,
      apiKey: envVars.NOTIFICATION_SERVICE_API_KEY,
    },
  },
  
  // Webhook
  webhook: {
    timeout: envVars.WEBHOOK_TIMEOUT,
    retryAttempts: envVars.WEBHOOK_RETRY_ATTEMPTS,
    retryDelay: envVars.WEBHOOK_RETRY_DELAY,
  },
  
  // Performance monitoring
  metrics: {
    enabled: envVars.ENABLE_METRICS,
    port: envVars.METRICS_PORT,
  },
  
  // Security
  security: {
    corsOrigin: envVars.CORS_ORIGIN,
    trustProxy: envVars.TRUST_PROXY,
    enableRequestLogging: envVars.ENABLE_REQUEST_LOGGING,
  },
  
  // Feature flags
  features: {
    messageEncryption: envVars.ENABLE_MESSAGE_ENCRYPTION,
    messageCompression: envVars.ENABLE_MESSAGE_COMPRESSION,
    realTimeSync: envVars.ENABLE_REAL_TIME_SYNC,
    messageDeduplication: envVars.ENABLE_MESSAGE_DEDUPLICATION,
  },
};
