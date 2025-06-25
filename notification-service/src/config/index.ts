/**
 * Notification Service Configuration
 * Universal AI Customer Service Platform - Notification Engine
 */

import Joi from 'joi';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3005),
  SERVICE_NAME: Joi.string().default('notification-service'),
  
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
  REDIS_DB: Joi.number().default(1),
  
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
  
  // Email configuration (SMTP)
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  SMTP_FROM_NAME: Joi.string().default('Universal AI Customer Service'),
  SMTP_FROM_EMAIL: Joi.string().email().default('noreply@example.com'),
  
  // SendGrid configuration
  SENDGRID_API_KEY: Joi.string().optional(),
  SENDGRID_FROM_EMAIL: Joi.string().email().optional(),
  
  // AWS SES configuration
  AWS_SES_REGION: Joi.string().default('us-east-1'),
  AWS_SES_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: Joi.string().optional(),
  AWS_SES_FROM_EMAIL: Joi.string().email().optional(),
  
  // SMS configuration (Twilio)
  TWILIO_ACCOUNT_SID: Joi.string().optional(),
  TWILIO_AUTH_TOKEN: Joi.string().optional(),
  TWILIO_PHONE_NUMBER: Joi.string().optional(),
  
  // Push notification configuration (Firebase)
  FIREBASE_PROJECT_ID: Joi.string().optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().email().optional(),
  
  // Web Push configuration
  VAPID_PUBLIC_KEY: Joi.string().optional(),
  VAPID_PRIVATE_KEY: Joi.string().optional(),
  VAPID_SUBJECT: Joi.string().email().optional(),
  
  // Notification processing configuration
  NOTIFICATION_BATCH_SIZE: Joi.number().default(50),
  NOTIFICATION_PROCESSING_TIMEOUT: Joi.number().default(30000),
  NOTIFICATION_RETRY_ATTEMPTS: Joi.number().default(3),
  NOTIFICATION_RETRY_DELAY: Joi.number().default(5000),
  
  // Queue configuration
  QUEUE_CONCURRENCY: Joi.number().default(10),
  QUEUE_MAX_ATTEMPTS: Joi.number().default(3),
  QUEUE_BACKOFF_DELAY: Joi.number().default(2000),
  QUEUE_REMOVE_ON_COMPLETE: Joi.number().default(100),
  QUEUE_REMOVE_ON_FAIL: Joi.number().default(50),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(1000),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // External services
  MESSAGE_SERVICE_URL: Joi.string().default('http://localhost:3004'),
  MESSAGE_SERVICE_API_KEY: Joi.string().required(),
  
  // WebSocket configuration
  WEBSOCKET_PORT: Joi.number().default(3006),
  WEBSOCKET_CORS_ORIGIN: Joi.string().default('*'),
  
  // Template configuration
  TEMPLATE_CACHE_TTL: Joi.number().default(3600), // 1 hour
  TEMPLATE_COMPILE_TIMEOUT: Joi.number().default(5000),
  
  // Performance monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9095),
  
  // Security
  CORS_ORIGIN: Joi.string().default('*'),
  TRUST_PROXY: Joi.boolean().default(false),
  ENABLE_REQUEST_LOGGING: Joi.boolean().default(true),
  
  // Feature flags
  ENABLE_EMAIL_NOTIFICATIONS: Joi.boolean().default(true),
  ENABLE_SMS_NOTIFICATIONS: Joi.boolean().default(true),
  ENABLE_PUSH_NOTIFICATIONS: Joi.boolean().default(true),
  ENABLE_IN_APP_NOTIFICATIONS: Joi.boolean().default(true),
  ENABLE_WEBHOOK_NOTIFICATIONS: Joi.boolean().default(true),
  ENABLE_NOTIFICATION_SCHEDULING: Joi.boolean().default(true),
  ENABLE_NOTIFICATION_BATCHING: Joi.boolean().default(true),
  ENABLE_NOTIFICATION_ANALYTICS: Joi.boolean().default(true),
}).unknown();

// Validate configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Notification Service config validation error: ${error.message}`);
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
  
  // Email providers
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      secure: envVars.SMTP_SECURE,
      user: envVars.SMTP_USER,
      password: envVars.SMTP_PASSWORD,
      fromName: envVars.SMTP_FROM_NAME,
      fromEmail: envVars.SMTP_FROM_EMAIL,
    },
    sendgrid: {
      apiKey: envVars.SENDGRID_API_KEY,
      fromEmail: envVars.SENDGRID_FROM_EMAIL,
    },
    awsSes: {
      region: envVars.AWS_SES_REGION,
      accessKeyId: envVars.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: envVars.AWS_SES_SECRET_ACCESS_KEY,
      fromEmail: envVars.AWS_SES_FROM_EMAIL,
    },
  },
  
  // SMS providers
  sms: {
    twilio: {
      accountSid: envVars.TWILIO_ACCOUNT_SID,
      authToken: envVars.TWILIO_AUTH_TOKEN,
      phoneNumber: envVars.TWILIO_PHONE_NUMBER,
    },
  },
  
  // Push notification providers
  push: {
    firebase: {
      projectId: envVars.FIREBASE_PROJECT_ID,
      privateKey: envVars.FIREBASE_PRIVATE_KEY,
      clientEmail: envVars.FIREBASE_CLIENT_EMAIL,
    },
    webPush: {
      vapidPublicKey: envVars.VAPID_PUBLIC_KEY,
      vapidPrivateKey: envVars.VAPID_PRIVATE_KEY,
      vapidSubject: envVars.VAPID_SUBJECT,
    },
  },
  
  // Notification processing
  notificationProcessing: {
    batchSize: envVars.NOTIFICATION_BATCH_SIZE,
    timeout: envVars.NOTIFICATION_PROCESSING_TIMEOUT,
    retryAttempts: envVars.NOTIFICATION_RETRY_ATTEMPTS,
    retryDelay: envVars.NOTIFICATION_RETRY_DELAY,
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
    message: {
      url: envVars.MESSAGE_SERVICE_URL,
      apiKey: envVars.MESSAGE_SERVICE_API_KEY,
    },
  },
  
  // WebSocket
  websocket: {
    port: envVars.WEBSOCKET_PORT,
    corsOrigin: envVars.WEBSOCKET_CORS_ORIGIN,
  },
  
  // Templates
  templates: {
    cacheTtl: envVars.TEMPLATE_CACHE_TTL,
    compileTimeout: envVars.TEMPLATE_COMPILE_TIMEOUT,
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
    emailNotifications: envVars.ENABLE_EMAIL_NOTIFICATIONS,
    smsNotifications: envVars.ENABLE_SMS_NOTIFICATIONS,
    pushNotifications: envVars.ENABLE_PUSH_NOTIFICATIONS,
    inAppNotifications: envVars.ENABLE_IN_APP_NOTIFICATIONS,
    webhookNotifications: envVars.ENABLE_WEBHOOK_NOTIFICATIONS,
    notificationScheduling: envVars.ENABLE_NOTIFICATION_SCHEDULING,
    notificationBatching: envVars.ENABLE_NOTIFICATION_BATCHING,
    notificationAnalytics: envVars.ENABLE_NOTIFICATION_ANALYTICS,
  },
};
