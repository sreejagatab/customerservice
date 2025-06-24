/**
 * Configuration management for Integration Service
 */

import Joi from 'joi';

// Configuration schema validation
const configSchema = Joi.object({
  nodeEnv: Joi.string().valid('development', 'test', 'production').default('development'),
  port: Joi.number().port().default(3003),
  serviceName: Joi.string().default('integration-service'),

  // Database
  databaseUrl: Joi.string().uri().required(),
  redisUrl: Joi.string().uri().required(),

  // JWT
  jwtSecret: Joi.string().min(32).required(),
  jwtExpiresIn: Joi.string().default('24h'),

  // Rate limiting
  rateLimitWindowMs: Joi.number().default(900000), // 15 minutes
  rateLimitMaxRequests: Joi.number().default(100),

  // Google/Gmail
  googleClientId: Joi.string().when('nodeEnv', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  googleClientSecret: Joi.string().when('nodeEnv', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  googleRedirectUri: Joi.string().uri().required(),

  // Microsoft/Outlook
  microsoftClientId: Joi.string().when('nodeEnv', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  microsoftClientSecret: Joi.string().when('nodeEnv', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  microsoftRedirectUri: Joi.string().uri().required(),

  // Webhooks
  webhookSecret: Joi.string().min(32).required(),
  webhookBaseUrl: Joi.string().uri().required(),

  // Queue
  queueRedisUrl: Joi.string().uri().required(),
  queueConcurrency: Joi.number().default(5),
  queueMaxAttempts: Joi.number().default(3),

  // Logging
  logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  logFormat: Joi.string().valid('json', 'simple').default('json'),

  // Health check
  healthCheckTimeout: Joi.number().default(5000),

  // CORS
  corsOrigins: Joi.array().items(Joi.string()).default(['http://localhost:3000']),
});

// Load and validate configuration
const rawConfig = {
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT || '3003', 10),
  serviceName: process.env.SERVICE_NAME,

  // Database
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,

  // JWT
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Google/Gmail
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,

  // Microsoft/Outlook
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI,

  // Webhooks
  webhookSecret: process.env.WEBHOOK_SECRET,
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL,

  // Queue
  queueRedisUrl: process.env.QUEUE_REDIS_URL || process.env.REDIS_URL,
  queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
  queueMaxAttempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL,
  logFormat: process.env.LOG_FORMAT,

  // Health check
  healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),

  // CORS
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
};

const { error, value: validatedConfig } = configSchema.validate(rawConfig, {
  abortEarly: false,
  stripUnknown: true,
});

if (error) {
  throw new Error(`Configuration validation error: ${error.details.map(d => d.message).join(', ')}`);
}

export const config = {
  nodeEnv: validatedConfig.nodeEnv,
  port: validatedConfig.port,
  serviceName: validatedConfig.serviceName,
  isDevelopment: validatedConfig.nodeEnv === 'development',
  isProduction: validatedConfig.nodeEnv === 'production',
  isTest: validatedConfig.nodeEnv === 'test',

  // Database
  database: {
    url: validatedConfig.databaseUrl,
  },

  // Redis
  redis: {
    url: validatedConfig.redisUrl,
  },

  // JWT
  jwt: {
    secret: validatedConfig.jwtSecret,
    expiresIn: validatedConfig.jwtExpiresIn,
  },

  // Rate limiting
  rateLimit: {
    windowMs: validatedConfig.rateLimitWindowMs,
    maxRequests: validatedConfig.rateLimitMaxRequests,
  },

  // Google/Gmail
  google: {
    clientId: validatedConfig.googleClientId,
    clientSecret: validatedConfig.googleClientSecret,
    redirectUri: validatedConfig.googleRedirectUri,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  },

  // Microsoft/Outlook
  microsoft: {
    clientId: validatedConfig.microsoftClientId,
    clientSecret: validatedConfig.microsoftClientSecret,
    redirectUri: validatedConfig.microsoftRedirectUri,
    scopes: [
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/MailboxSettings.Read',
    ],
  },

  // Webhooks
  webhook: {
    secret: validatedConfig.webhookSecret,
    baseUrl: validatedConfig.webhookBaseUrl,
  },

  // Queue
  queue: {
    redisUrl: validatedConfig.queueRedisUrl,
    concurrency: validatedConfig.queueConcurrency,
    maxAttempts: validatedConfig.queueMaxAttempts,
  },

  // Logging
  logging: {
    level: validatedConfig.logLevel,
    format: validatedConfig.logFormat,
  },

  // Health check
  healthCheck: {
    timeout: validatedConfig.healthCheckTimeout,
  },

  // CORS
  cors: {
    origins: validatedConfig.corsOrigins,
  },
};

export default config;
