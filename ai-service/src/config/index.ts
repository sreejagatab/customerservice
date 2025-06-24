/**
 * Configuration for AI Service
 */

import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

// Configuration schema
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3003),
  SERVICE_NAME: Joi.string().default('ai-service'),
  
  // Database configuration
  DATABASE_URL: Joi.string().required(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().default('universal_ai_cs'),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_POOL_MIN: Joi.number().default(2),
  DB_POOL_MAX: Joi.number().default(10),
  
  // Redis configuration
  REDIS_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow(''),
  REDIS_DB: Joi.number().default(0),
  
  // JWT configuration
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  
  // AI Provider API Keys
  OPENAI_API_KEY: Joi.string().allow(''),
  OPENAI_ORG_ID: Joi.string().allow(''),
  ANTHROPIC_API_KEY: Joi.string().allow(''),
  GOOGLE_AI_API_KEY: Joi.string().allow(''),
  AZURE_OPENAI_API_KEY: Joi.string().allow(''),
  AZURE_OPENAI_ENDPOINT: Joi.string().allow(''),
  
  // AI Configuration
  DEFAULT_AI_PROVIDER: Joi.string().valid('openai', 'anthropic', 'google', 'azure_openai').default('openai'),
  AI_REQUEST_TIMEOUT: Joi.number().default(30000),
  AI_MAX_RETRIES: Joi.number().default(3),
  AI_RETRY_DELAY: Joi.number().default(1000),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Queue configuration
  QUEUE_CONCURRENCY: Joi.number().default(5),
  QUEUE_MAX_ATTEMPTS: Joi.number().default(3),
  QUEUE_BACKOFF_DELAY: Joi.number().default(2000),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // Integration Service
  INTEGRATION_SERVICE_URL: Joi.string().default('http://localhost:3002'),
  INTEGRATION_SERVICE_API_KEY: Joi.string().required(),
  
  // Admin Service
  ADMIN_SERVICE_URL: Joi.string().default('http://localhost:3001'),
  
  // Performance monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9090),
  
  // Security
  CORS_ORIGIN: Joi.string().default('*'),
  TRUST_PROXY: Joi.boolean().default(false),
}).unknown();

// Validate configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
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
  
  // JWT
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
  },
  
  // AI Providers
  ai: {
    providers: {
      openai: {
        apiKey: envVars.OPENAI_API_KEY,
        orgId: envVars.OPENAI_ORG_ID,
      },
      anthropic: {
        apiKey: envVars.ANTHROPIC_API_KEY,
      },
      google: {
        apiKey: envVars.GOOGLE_AI_API_KEY,
      },
      azureOpenai: {
        apiKey: envVars.AZURE_OPENAI_API_KEY,
        endpoint: envVars.AZURE_OPENAI_ENDPOINT,
      },
    },
    defaultProvider: envVars.DEFAULT_AI_PROVIDER,
    requestTimeout: envVars.AI_REQUEST_TIMEOUT,
    maxRetries: envVars.AI_MAX_RETRIES,
    retryDelay: envVars.AI_RETRY_DELAY,
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },
  
  // Queue
  queue: {
    concurrency: envVars.QUEUE_CONCURRENCY,
    maxAttempts: envVars.QUEUE_MAX_ATTEMPTS,
    backoffDelay: envVars.QUEUE_BACKOFF_DELAY,
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL,
    format: envVars.LOG_FORMAT,
  },
  
  // External services
  services: {
    integration: {
      url: envVars.INTEGRATION_SERVICE_URL,
      apiKey: envVars.INTEGRATION_SERVICE_API_KEY,
    },
    admin: {
      url: envVars.ADMIN_SERVICE_URL,
    },
  },
  
  // Monitoring
  metrics: {
    enabled: envVars.ENABLE_METRICS,
    port: envVars.METRICS_PORT,
  },
  
  // Security
  security: {
    corsOrigin: envVars.CORS_ORIGIN,
    trustProxy: envVars.TRUST_PROXY,
  },
};

export default config;
