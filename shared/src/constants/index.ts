/**
 * Shared constants for the Universal AI Customer Service Platform
 */

// API Configuration
export const API_CONFIG = {
  VERSION: 'v1',
  BASE_PATH: '/api/v1',
  TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  DEFAULT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  DEFAULT_MAX_REQUESTS: 100,
  BURST_LIMIT: 10,
  AI_REQUESTS_PER_MINUTE: 60,
  INTEGRATION_REQUESTS_PER_SECOND: 10,
} as const;

// Authentication
export const AUTH = {
  JWT_EXPIRES_IN: '24h',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  MFA_CODE_LENGTH: 6,
  MFA_CODE_EXPIRES_IN: 300, // 5 minutes
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
} as const;

// File Upload
export const FILE_UPLOAD = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES_PER_MESSAGE: 5,
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  UPLOAD_PATH: '/uploads',
  TEMP_PATH: '/tmp',
} as const;

// AI Configuration
export const AI_CONFIG = {
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_TOKENS: 2000,
  DEFAULT_TOP_P: 1.0,
  DEFAULT_FREQUENCY_PENALTY: 0.0,
  DEFAULT_PRESENCE_PENALTY: 0.0,
  CONFIDENCE_THRESHOLD: 0.8,
  LOW_CONFIDENCE_THRESHOLD: 0.5,
  MAX_CONTEXT_LENGTH: 8000,
  MAX_CONVERSATION_HISTORY: 10,
  COST_ALERT_THRESHOLD: 100, // USD
  MONTHLY_COST_LIMIT: 1000, // USD
} as const;

// AI Providers
export const AI_PROVIDERS = {
  OPENAI: {
    NAME: 'OpenAI',
    BASE_URL: 'https://api.openai.com/v1',
    MODELS: {
      GPT_4: 'gpt-4',
      GPT_4_TURBO: 'gpt-4-turbo-preview',
      GPT_3_5_TURBO: 'gpt-3.5-turbo',
    },
    RATE_LIMITS: {
      REQUESTS_PER_MINUTE: 3500,
      TOKENS_PER_MINUTE: 90000,
    },
  },
  ANTHROPIC: {
    NAME: 'Anthropic',
    BASE_URL: 'https://api.anthropic.com/v1',
    MODELS: {
      CLAUDE_3_OPUS: 'claude-3-opus-20240229',
      CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
      CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
    },
    RATE_LIMITS: {
      REQUESTS_PER_MINUTE: 1000,
      TOKENS_PER_MINUTE: 40000,
    },
  },
  GOOGLE: {
    NAME: 'Google AI',
    BASE_URL: 'https://generativelanguage.googleapis.com/v1',
    MODELS: {
      GEMINI_PRO: 'gemini-pro',
      GEMINI_PRO_VISION: 'gemini-pro-vision',
    },
    RATE_LIMITS: {
      REQUESTS_PER_MINUTE: 60,
      TOKENS_PER_MINUTE: 32000,
    },
  },
} as const;

// Integration Providers
export const INTEGRATION_PROVIDERS = {
  EMAIL: {
    GMAIL: 'gmail',
    OUTLOOK: 'outlook',
    YAHOO: 'yahoo',
    SMTP: 'smtp',
    IMAP: 'imap',
  },
  CHAT: {
    WHATSAPP: 'whatsapp',
    SLACK: 'slack',
    TELEGRAM: 'telegram',
    FACEBOOK_MESSENGER: 'facebook_messenger',
    DISCORD: 'discord',
  },
  SOCIAL: {
    TWITTER: 'twitter',
    FACEBOOK: 'facebook',
    INSTAGRAM: 'instagram',
    LINKEDIN: 'linkedin',
    TIKTOK: 'tiktok',
  },
  ECOMMERCE: {
    SHOPIFY: 'shopify',
    WOOCOMMERCE: 'woocommerce',
    MAGENTO: 'magento',
    BIGCOMMERCE: 'bigcommerce',
  },
  CRM: {
    SALESFORCE: 'salesforce',
    HUBSPOT: 'hubspot',
    PIPEDRIVE: 'pipedrive',
    ZOHO: 'zoho',
  },
  HELPDESK: {
    ZENDESK: 'zendesk',
    INTERCOM: 'intercom',
    FRESHDESK: 'freshdesk',
    HELPSCOUT: 'helpscout',
  },
} as const;

// Message Processing
export const MESSAGE_PROCESSING = {
  MAX_MESSAGE_LENGTH: 10000,
  MAX_SUBJECT_LENGTH: 255,
  BATCH_SIZE: 100,
  PROCESSING_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 5000, // 5 seconds
  CLASSIFICATION_TIMEOUT: 10000, // 10 seconds
  RESPONSE_GENERATION_TIMEOUT: 15000, // 15 seconds
} as const;

// Conversation Management
export const CONVERSATION = {
  AUTO_CLOSE_AFTER_DAYS: 7,
  INACTIVITY_WARNING_HOURS: 24,
  MAX_TAGS: 10,
  MAX_TAG_LENGTH: 50,
  SLA_RESPONSE_TIME: {
    LOW: 24 * 60 * 60, // 24 hours
    NORMAL: 8 * 60 * 60, // 8 hours
    HIGH: 4 * 60 * 60, // 4 hours
    URGENT: 1 * 60 * 60, // 1 hour
    CRITICAL: 15 * 60, // 15 minutes
  },
  SLA_RESOLUTION_TIME: {
    LOW: 7 * 24 * 60 * 60, // 7 days
    NORMAL: 3 * 24 * 60 * 60, // 3 days
    HIGH: 24 * 60 * 60, // 24 hours
    URGENT: 8 * 60 * 60, // 8 hours
    CRITICAL: 4 * 60 * 60, // 4 hours
  },
} as const;

// Workflow Configuration
export const WORKFLOW = {
  MAX_STEPS: 50,
  MAX_EXECUTION_TIME: 300, // 5 minutes
  MAX_CONCURRENT_EXECUTIONS: 10,
  MAX_RETRY_ATTEMPTS: 3,
  DEFAULT_TIMEOUT: 30, // seconds
  MAX_VARIABLES: 100,
  MAX_VARIABLE_NAME_LENGTH: 50,
  MAX_VARIABLE_VALUE_LENGTH: 1000,
} as const;

// Analytics
export const ANALYTICS = {
  MAX_QUERY_RESULTS: 10000,
  DEFAULT_TIME_RANGE: 30, // days
  MAX_TIME_RANGE: 365, // days
  CACHE_TTL: 300, // 5 minutes
  REAL_TIME_BUFFER_SIZE: 1000,
  BATCH_SIZE: 1000,
  RETENTION_DAYS: {
    EVENTS: 90,
    METRICS: 365,
    LOGS: 30,
  },
} as const;

// Database
export const DATABASE = {
  CONNECTION_POOL_MIN: 2,
  CONNECTION_POOL_MAX: 10,
  CONNECTION_TIMEOUT: 30000,
  QUERY_TIMEOUT: 30000,
  IDLE_TIMEOUT: 300000, // 5 minutes
  MAX_CONNECTIONS: 100,
} as const;

// Redis
export const REDIS = {
  DEFAULT_TTL: 3600, // 1 hour
  SESSION_TTL: 86400, // 24 hours
  CACHE_TTL: 1800, // 30 minutes
  RATE_LIMIT_TTL: 900, // 15 minutes
  MAX_CONNECTIONS: 10,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

// Queue Configuration
export const QUEUE = {
  DEFAULT_PRIORITY: 0,
  HIGH_PRIORITY: 10,
  LOW_PRIORITY: -10,
  MAX_ATTEMPTS: 3,
  BACKOFF_DELAY: 5000, // 5 seconds
  MAX_BACKOFF_DELAY: 60000, // 1 minute
  STALLED_INTERVAL: 30000, // 30 seconds
  MAX_STALLED_COUNT: 1,
} as const;

// Webhook Configuration
export const WEBHOOK = {
  TIMEOUT: 10000, // 10 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000, // 5 seconds
  MAX_PAYLOAD_SIZE: 1024 * 1024, // 1MB
  SIGNATURE_HEADER: 'X-Webhook-Signature',
  TIMESTAMP_HEADER: 'X-Webhook-Timestamp',
  TIMESTAMP_TOLERANCE: 300, // 5 minutes
} as const;

// Health Check
export const HEALTH_CHECK = {
  INTERVAL: 30000, // 30 seconds
  TIMEOUT: 5000, // 5 seconds
  UNHEALTHY_THRESHOLD: 3,
  DEGRADED_THRESHOLD: 2,
} as const;

// Logging
export const LOGGING = {
  LEVELS: ['error', 'warn', 'info', 'debug'] as const,
  DEFAULT_LEVEL: 'info',
  MAX_LOG_SIZE: '10m',
  MAX_LOG_FILES: 5,
  DATE_PATTERN: 'YYYY-MM-DD',
} as const;

// Security
export const SECURITY = {
  BCRYPT_ROUNDS: 12,
  ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  IV_LENGTH: 16,
  TAG_LENGTH: 16,
  CORS_MAX_AGE: 86400, // 24 hours
  HELMET_CONFIG: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  },
} as const;

// Error Codes
export const ERROR_CODES = {
  // Authentication
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // Integration
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  WEBHOOK_VERIFICATION_FAILED: 'WEBHOOK_VERIFICATION_FAILED',
  
  // AI
  AI_PROCESSING_ERROR: 'AI_PROCESSING_ERROR',
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  AI_MODEL_UNAVAILABLE: 'AI_MODEL_UNAVAILABLE',
  
  // System
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// Environment
export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

// Subscription Plans
export const SUBSCRIPTION_PLANS = {
  STARTER: {
    NAME: 'Starter',
    PRICE: 49,
    MAX_USERS: 5,
    MAX_INTEGRATIONS: 5,
    MAX_MESSAGES_PER_MONTH: 1000,
    MAX_AI_REQUESTS_PER_MONTH: 500,
    MAX_WORKFLOWS: 10,
    STORAGE_LIMIT: 1024, // 1GB
  },
  PROFESSIONAL: {
    NAME: 'Professional',
    PRICE: 149,
    MAX_USERS: 25,
    MAX_INTEGRATIONS: 15,
    MAX_MESSAGES_PER_MONTH: 5000,
    MAX_AI_REQUESTS_PER_MONTH: 2500,
    MAX_WORKFLOWS: 50,
    STORAGE_LIMIT: 10240, // 10GB
  },
  ENTERPRISE: {
    NAME: 'Enterprise',
    PRICE: 499,
    MAX_USERS: -1, // Unlimited
    MAX_INTEGRATIONS: -1, // Unlimited
    MAX_MESSAGES_PER_MONTH: 25000,
    MAX_AI_REQUESTS_PER_MONTH: 12500,
    MAX_WORKFLOWS: -1, // Unlimited
    STORAGE_LIMIT: 102400, // 100GB
  },
} as const;
