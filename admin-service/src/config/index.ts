/**
 * Admin Service Configuration
 * Universal AI Customer Service Platform - Administration Engine
 */

import Joi from 'joi';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  SERVICE_NAME: Joi.string().default('admin-service'),
  
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
  REDIS_DB: Joi.number().default(2),
  
  // JWT configuration
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  
  // Password configuration
  PASSWORD_MIN_LENGTH: Joi.number().default(8),
  PASSWORD_REQUIRE_UPPERCASE: Joi.boolean().default(true),
  PASSWORD_REQUIRE_LOWERCASE: Joi.boolean().default(true),
  PASSWORD_REQUIRE_NUMBERS: Joi.boolean().default(true),
  PASSWORD_REQUIRE_SYMBOLS: Joi.boolean().default(true),
  PASSWORD_SALT_ROUNDS: Joi.number().default(12),
  
  // Session configuration
  SESSION_TIMEOUT: Joi.number().default(3600), // 1 hour in seconds
  MAX_LOGIN_ATTEMPTS: Joi.number().default(5),
  LOCKOUT_DURATION: Joi.number().default(900), // 15 minutes in seconds
  
  // File upload configuration
  UPLOAD_MAX_SIZE: Joi.number().default(10485760), // 10MB
  UPLOAD_ALLOWED_TYPES: Joi.string().default('image/jpeg,image/png,image/gif,application/pdf,text/csv'),
  UPLOAD_DESTINATION: Joi.string().default('./uploads'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(1000),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // External services
  MESSAGE_SERVICE_URL: Joi.string().default('http://localhost:3004'),
  MESSAGE_SERVICE_API_KEY: Joi.string().required(),
  NOTIFICATION_SERVICE_URL: Joi.string().default('http://localhost:3005'),
  NOTIFICATION_SERVICE_API_KEY: Joi.string().required(),
  AI_SERVICE_URL: Joi.string().default('http://localhost:3003'),
  AI_SERVICE_API_KEY: Joi.string().required(),
  INTEGRATION_SERVICE_URL: Joi.string().default('http://localhost:3002'),
  INTEGRATION_SERVICE_API_KEY: Joi.string().required(),
  
  // Email configuration for admin notifications
  ADMIN_EMAIL_FROM: Joi.string().email().default('admin@example.com'),
  ADMIN_EMAIL_SMTP_HOST: Joi.string().default('localhost'),
  ADMIN_EMAIL_SMTP_PORT: Joi.number().default(587),
  ADMIN_EMAIL_SMTP_USER: Joi.string().optional(),
  ADMIN_EMAIL_SMTP_PASSWORD: Joi.string().optional(),
  
  // Audit configuration
  AUDIT_RETENTION_DAYS: Joi.number().default(365), // 1 year
  AUDIT_BATCH_SIZE: Joi.number().default(1000),
  
  // Backup configuration
  BACKUP_ENABLED: Joi.boolean().default(true),
  BACKUP_SCHEDULE: Joi.string().default('0 2 * * *'), // Daily at 2 AM
  BACKUP_RETENTION_DAYS: Joi.number().default(30),
  BACKUP_DESTINATION: Joi.string().default('./backups'),
  
  // Performance monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9091),
  
  // Security
  CORS_ORIGIN: Joi.string().default('*'),
  TRUST_PROXY: Joi.boolean().default(false),
  ENABLE_REQUEST_LOGGING: Joi.boolean().default(true),
  ENABLE_SECURITY_HEADERS: Joi.boolean().default(true),
  
  // Feature flags
  ENABLE_USER_REGISTRATION: Joi.boolean().default(false),
  ENABLE_ORGANIZATION_CREATION: Joi.boolean().default(true),
  ENABLE_AUDIT_LOGGING: Joi.boolean().default(true),
  ENABLE_ACTIVITY_MONITORING: Joi.boolean().default(true),
  ENABLE_AUTOMATED_BACKUPS: Joi.boolean().default(true),
  ENABLE_HEALTH_MONITORING: Joi.boolean().default(true),
  ENABLE_PERFORMANCE_ANALYTICS: Joi.boolean().default(true),
  
  // Multi-tenancy
  DEFAULT_ORGANIZATION_PLAN: Joi.string().default('basic'),
  MAX_USERS_PER_ORGANIZATION: Joi.number().default(100),
  MAX_INTEGRATIONS_PER_ORGANIZATION: Joi.number().default(10),
  
  // API versioning
  API_VERSION: Joi.string().default('v1'),
  DEPRECATED_API_VERSIONS: Joi.string().default(''),
}).unknown();

// Validate configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Admin Service config validation error: ${error.message}`);
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
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
  },
  
  // Password policy
  password: {
    minLength: envVars.PASSWORD_MIN_LENGTH,
    requireUppercase: envVars.PASSWORD_REQUIRE_UPPERCASE,
    requireLowercase: envVars.PASSWORD_REQUIRE_LOWERCASE,
    requireNumbers: envVars.PASSWORD_REQUIRE_NUMBERS,
    requireSymbols: envVars.PASSWORD_REQUIRE_SYMBOLS,
    saltRounds: envVars.PASSWORD_SALT_ROUNDS,
  },
  
  // Session
  session: {
    timeout: envVars.SESSION_TIMEOUT,
    maxLoginAttempts: envVars.MAX_LOGIN_ATTEMPTS,
    lockoutDuration: envVars.LOCKOUT_DURATION,
  },
  
  // File upload
  upload: {
    maxSize: envVars.UPLOAD_MAX_SIZE,
    allowedTypes: envVars.UPLOAD_ALLOWED_TYPES.split(','),
    destination: envVars.UPLOAD_DESTINATION,
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
    notification: {
      url: envVars.NOTIFICATION_SERVICE_URL,
      apiKey: envVars.NOTIFICATION_SERVICE_API_KEY,
    },
    ai: {
      url: envVars.AI_SERVICE_URL,
      apiKey: envVars.AI_SERVICE_API_KEY,
    },
    integration: {
      url: envVars.INTEGRATION_SERVICE_URL,
      apiKey: envVars.INTEGRATION_SERVICE_API_KEY,
    },
  },
  
  // Email
  email: {
    from: envVars.ADMIN_EMAIL_FROM,
    smtp: {
      host: envVars.ADMIN_EMAIL_SMTP_HOST,
      port: envVars.ADMIN_EMAIL_SMTP_PORT,
      user: envVars.ADMIN_EMAIL_SMTP_USER,
      password: envVars.ADMIN_EMAIL_SMTP_PASSWORD,
    },
  },
  
  // Audit
  audit: {
    retentionDays: envVars.AUDIT_RETENTION_DAYS,
    batchSize: envVars.AUDIT_BATCH_SIZE,
  },
  
  // Backup
  backup: {
    enabled: envVars.BACKUP_ENABLED,
    schedule: envVars.BACKUP_SCHEDULE,
    retentionDays: envVars.BACKUP_RETENTION_DAYS,
    destination: envVars.BACKUP_DESTINATION,
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
    enableSecurityHeaders: envVars.ENABLE_SECURITY_HEADERS,
  },
  
  // Feature flags
  features: {
    userRegistration: envVars.ENABLE_USER_REGISTRATION,
    organizationCreation: envVars.ENABLE_ORGANIZATION_CREATION,
    auditLogging: envVars.ENABLE_AUDIT_LOGGING,
    activityMonitoring: envVars.ENABLE_ACTIVITY_MONITORING,
    automatedBackups: envVars.ENABLE_AUTOMATED_BACKUPS,
    healthMonitoring: envVars.ENABLE_HEALTH_MONITORING,
    performanceAnalytics: envVars.ENABLE_PERFORMANCE_ANALYTICS,
  },
  
  // Multi-tenancy
  multiTenancy: {
    defaultPlan: envVars.DEFAULT_ORGANIZATION_PLAN,
    maxUsersPerOrganization: envVars.MAX_USERS_PER_ORGANIZATION,
    maxIntegrationsPerOrganization: envVars.MAX_INTEGRATIONS_PER_ORGANIZATION,
  },
  
  // API
  api: {
    version: envVars.API_VERSION,
    deprecatedVersions: envVars.DEPRECATED_API_VERSIONS.split(',').filter(Boolean),
  },
};
