/**
 * Security Configuration for Universal AI Customer Service Platform
 * Implements enterprise-grade security controls and hardening measures
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/**
 * Security Headers Configuration
 * Implements OWASP security headers best practices
 */
const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // unsafe-eval needed for some AI libraries
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://api.anthropic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  
  // Permissions Policy
  permissionsPolicy: {
    features: {
      camera: ['none'],
      microphone: ['none'],
      geolocation: ['none'],
      payment: ['none'],
      usb: ['none'],
    },
  },
  
  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false, // Disabled for AI API compatibility
  
  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy: {
    policy: 'same-origin',
  },
  
  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: 'cross-origin',
  },
});

/**
 * Rate Limiting Configuration
 * Multi-layered rate limiting for different endpoints
 */
const rateLimitConfig = {
  // Global rate limiting
  global: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/metrics';
    },
  }),
  
  // Authentication endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 auth attempts per windowMs
    message: {
      error: 'Too many authentication attempts, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
    skipSuccessfulRequests: true,
  }),
  
  // API endpoints
  api: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 API requests per windowMs
    message: {
      error: 'API rate limit exceeded, please try again later.',
      code: 'API_RATE_LIMIT_EXCEEDED',
    },
  }),
  
  // AI processing endpoints
  ai: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Limit each IP to 30 AI requests per minute
    message: {
      error: 'AI processing rate limit exceeded, please try again later.',
      code: 'AI_RATE_LIMIT_EXCEEDED',
    },
  }),
  
  // File upload endpoints
  upload: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 uploads per minute
    message: {
      error: 'File upload rate limit exceeded, please try again later.',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
    },
  }),
};

/**
 * Input Validation Configuration
 * Comprehensive input validation and sanitization
 */
const inputValidation = {
  // File upload restrictions
  fileUpload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json',
    ],
    maxFiles: 5,
  },
  
  // Request body size limits
  bodyLimits: {
    json: '10mb',
    urlencoded: '10mb',
    raw: '10mb',
    text: '10mb',
  },
  
  // Parameter validation
  parameterLimits: {
    maxStringLength: 10000,
    maxArrayLength: 1000,
    maxObjectDepth: 10,
  },
};

/**
 * CORS Configuration
 * Secure cross-origin resource sharing
 */
const corsConfig = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://app.universalai-cs.com',
      'https://admin.universalai-cs.com',
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
    'X-Organization-ID',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-Rate-Limit-Limit',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
  ],
  maxAge: 86400, // 24 hours
};

/**
 * Session Security Configuration
 */
const sessionConfig = {
  name: 'sessionId',
  secret: process.env.SESSION_SECRET || 'your-super-secret-session-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent XSS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict', // CSRF protection
  },
  rolling: true, // Reset expiration on activity
};

/**
 * JWT Security Configuration
 */
const jwtConfig = {
  algorithm: 'HS256',
  expiresIn: '24h',
  issuer: 'universal-ai-cs',
  audience: 'universal-ai-cs-users',
  clockTolerance: 30, // 30 seconds
  ignoreExpiration: false,
  ignoreNotBefore: false,
};

/**
 * Encryption Configuration
 */
const encryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16,
  saltLength: 32,
  iterations: 100000, // PBKDF2 iterations
};

/**
 * Security Monitoring Configuration
 */
const monitoringConfig = {
  // Failed authentication attempts
  maxFailedAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  
  // Suspicious activity detection
  suspiciousPatterns: [
    /(\b(union|select|insert|delete|update|drop|create|alter|exec|execute)\b)/i,
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ],
  
  // IP reputation checking
  enableIpReputation: true,
  ipReputationThreshold: 0.7,
  
  // Anomaly detection
  enableAnomalyDetection: true,
  anomalyThreshold: 0.8,
};

module.exports = {
  securityHeaders,
  rateLimitConfig,
  inputValidation,
  corsConfig,
  sessionConfig,
  jwtConfig,
  encryptionConfig,
  monitoringConfig,
};
