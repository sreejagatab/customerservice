/**
 * Partner Service Configuration
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server configuration
  port: parseInt(process.env.PARTNER_SERVICE_PORT || '3006', 10),
  environment: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'universal_ai_cs',
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10)
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'partner:',
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10) // 1 hour
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  // CORS configuration
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://app.universalai-cs.com',
      'https://partner.universalai-cs.com'
    ]
  },

  // File upload configuration
  uploads: {
    brandingPath: process.env.UPLOADS_BRANDING_PATH || './uploads/branding',
    maxFileSize: parseInt(process.env.UPLOADS_MAX_FILE_SIZE || '10485760', 10), // 10MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedDocumentTypes: ['application/pdf', 'text/plain', 'application/msword']
  },

  // Email configuration
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    },
    from: {
      name: process.env.EMAIL_FROM_NAME || 'Universal AI Customer Service',
      address: process.env.EMAIL_FROM_ADDRESS || 'noreply@universalai-cs.com'
    },
    templates: {
      partnerWelcome: 'partner-welcome',
      partnerApproval: 'partner-approval',
      revenueReport: 'revenue-report',
      organizationInvite: 'organization-invite'
    }
  },

  // Partner portal configuration
  partnerPortal: {
    baseUrl: process.env.PARTNER_PORTAL_URL || 'https://partner.universalai-cs.com',
    defaultCommissionRate: parseFloat(process.env.DEFAULT_COMMISSION_RATE || '0.20'), // 20%
    defaultSupportTier: process.env.DEFAULT_SUPPORT_TIER || 'standard',
    onboardingSteps: [
      'profile_setup',
      'contract_agreement',
      'branding_configuration',
      'api_access_setup',
      'certification_training',
      'first_organization_setup'
    ]
  },

  // Revenue sharing configuration
  revenueSharing: {
    calculationPeriod: process.env.REVENUE_CALCULATION_PERIOD || 'monthly', // monthly, quarterly
    paymentTerms: process.env.REVENUE_PAYMENT_TERMS || 'net30', // net15, net30, net45
    minimumPayout: parseFloat(process.env.REVENUE_MINIMUM_PAYOUT || '100.00'),
    currency: process.env.REVENUE_CURRENCY || 'USD',
    taxHandling: process.env.REVENUE_TAX_HANDLING || 'partner_responsible' // platform_handles, partner_responsible
  },

  // White-label configuration
  whiteLabel: {
    defaultTheme: process.env.WHITE_LABEL_DEFAULT_THEME || 'professional-blue',
    customDomainEnabled: process.env.WHITE_LABEL_CUSTOM_DOMAIN === 'true',
    sslProvider: process.env.WHITE_LABEL_SSL_PROVIDER || 'letsencrypt', // letsencrypt, cloudflare, custom
    cdnEnabled: process.env.WHITE_LABEL_CDN_ENABLED === 'true',
    cdnProvider: process.env.WHITE_LABEL_CDN_PROVIDER || 'cloudflare'
  },

  // API rate limiting
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    destination: process.env.LOG_DESTINATION || 'console', // console, file, both
    filePath: process.env.LOG_FILE_PATH || './logs/partner-service.log',
    maxFileSize: process.env.LOG_MAX_FILE_SIZE || '10m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10)
  },

  // Monitoring and health checks
  monitoring: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10), // 30 seconds
    metricsEnabled: process.env.METRICS_ENABLED === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    tracingEnabled: process.env.TRACING_ENABLED === 'true',
    tracingEndpoint: process.env.TRACING_ENDPOINT
  },

  // Security configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    sessionSecret: process.env.SESSION_SECRET || 'your-super-secret-session-key',
    csrfEnabled: process.env.CSRF_ENABLED === 'true',
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false'
  },

  // External service integrations
  integrations: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      enabled: process.env.STRIPE_ENABLED === 'true'
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
      enabled: process.env.SENDGRID_ENABLED === 'true'
    },
    slack: {
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channel: process.env.SLACK_CHANNEL || '#partner-notifications',
      enabled: process.env.SLACK_ENABLED === 'true'
    }
  },

  // Feature flags
  features: {
    partnerSelfRegistration: process.env.FEATURE_PARTNER_SELF_REGISTRATION === 'true',
    automaticApproval: process.env.FEATURE_AUTOMATIC_APPROVAL === 'true',
    revenueSharing: process.env.FEATURE_REVENUE_SHARING !== 'false',
    whiteLabelBranding: process.env.FEATURE_WHITE_LABEL_BRANDING !== 'false',
    customDomains: process.env.FEATURE_CUSTOM_DOMAINS === 'true',
    apiMarketplace: process.env.FEATURE_API_MARKETPLACE === 'true'
  }
};

// Validate required configuration
const requiredEnvVars = [
  'DB_HOST',
  'DB_NAME',
  'DB_USERNAME',
  'DB_PASSWORD',
  'JWT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

export default config;
