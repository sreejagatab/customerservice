/**
 * Security Middleware for Universal AI Customer Service Platform
 * Implements comprehensive security controls and monitoring
 */

const crypto = require('crypto');
const validator = require('validator');
const { securityHeaders, rateLimitConfig, inputValidation, corsConfig, monitoringConfig } = require('./security-config');

/**
 * Security Middleware Class
 * Provides enterprise-grade security controls
 */
class SecurityMiddleware {
  constructor() {
    this.failedAttempts = new Map();
    this.suspiciousIPs = new Set();
    this.rateLimitStore = new Map();
  }

  /**
   * Apply security headers
   */
  applySecurityHeaders() {
    return securityHeaders;
  }

  /**
   * Input sanitization and validation middleware
   */
  sanitizeInput() {
    return (req, res, next) => {
      try {
        // Sanitize request body
        if (req.body) {
          req.body = this.sanitizeObject(req.body);
        }

        // Sanitize query parameters
        if (req.query) {
          req.query = this.sanitizeObject(req.query);
        }

        // Sanitize URL parameters
        if (req.params) {
          req.params = this.sanitizeObject(req.params);
        }

        // Validate request size
        const contentLength = parseInt(req.headers['content-length'] || '0');
        if (contentLength > 10 * 1024 * 1024) { // 10MB limit
          return res.status(413).json({
            success: false,
            error: {
              code: 'PAYLOAD_TOO_LARGE',
              message: 'Request payload too large',
            },
          });
        }

        next();
      } catch (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid input data',
          },
        });
      }
    };
  }

  /**
   * Sanitize object recursively
   */
  sanitizeObject(obj, depth = 0) {
    if (depth > inputValidation.parameterLimits.maxObjectDepth) {
      throw new Error('Object depth limit exceeded');
    }

    if (Array.isArray(obj)) {
      if (obj.length > inputValidation.parameterLimits.maxArrayLength) {
        throw new Error('Array length limit exceeded');
      }
      return obj.map(item => this.sanitizeValue(item, depth + 1));
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeValue(value, depth + 1);
      }
      return sanitized;
    }

    return this.sanitizeValue(obj, depth);
  }

  /**
   * Sanitize individual values
   */
  sanitizeValue(value, depth = 0) {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value, depth);
    }

    return value;
  }

  /**
   * Sanitize string values
   */
  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    if (str.length > inputValidation.parameterLimits.maxStringLength) {
      throw new Error('String length limit exceeded');
    }

    // Remove null bytes
    str = str.replace(/\0/g, '');
    
    // Escape HTML entities
    str = validator.escape(str);
    
    // Check for suspicious patterns
    for (const pattern of monitoringConfig.suspiciousPatterns) {
      if (pattern.test(str)) {
        throw new Error('Suspicious input detected');
      }
    }

    return str;
  }

  /**
   * Authentication rate limiting
   */
  authRateLimit() {
    return rateLimitConfig.auth;
  }

  /**
   * API rate limiting
   */
  apiRateLimit() {
    return rateLimitConfig.api;
  }

  /**
   * Global rate limiting
   */
  globalRateLimit() {
    return rateLimitConfig.global;
  }

  /**
   * Failed authentication tracking
   */
  trackFailedAuth() {
    return (req, res, next) => {
      const originalSend = res.send;
      const self = this;

      res.send = function(data) {
        const clientIP = self.getClientIP(req);
        
        // Check if this is a failed authentication
        if (res.statusCode === 401 || res.statusCode === 403) {
          self.recordFailedAttempt(clientIP);
        } else if (res.statusCode === 200 && req.path.includes('/auth/')) {
          // Successful auth - clear failed attempts
          self.clearFailedAttempts(clientIP);
        }

        originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Record failed authentication attempt
   */
  recordFailedAttempt(ip) {
    const attempts = this.failedAttempts.get(ip) || { count: 0, lastAttempt: Date.now() };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    
    this.failedAttempts.set(ip, attempts);

    // Lock IP if too many failed attempts
    if (attempts.count >= monitoringConfig.maxFailedAttempts) {
      this.suspiciousIPs.add(ip);
      
      // Auto-unlock after lockout duration
      setTimeout(() => {
        this.suspiciousIPs.delete(ip);
        this.failedAttempts.delete(ip);
      }, monitoringConfig.lockoutDuration);
    }
  }

  /**
   * Clear failed attempts for IP
   */
  clearFailedAttempts(ip) {
    this.failedAttempts.delete(ip);
    this.suspiciousIPs.delete(ip);
  }

  /**
   * Check if IP is blocked
   */
  checkBlocked() {
    return (req, res, next) => {
      const clientIP = this.getClientIP(req);
      
      if (this.suspiciousIPs.has(clientIP)) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'IP_BLOCKED',
            message: 'IP address temporarily blocked due to suspicious activity',
          },
        });
      }

      next();
    };
  }

  /**
   * Get client IP address
   */
  getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '0.0.0.0';
  }

  /**
   * Request logging for security monitoring
   */
  securityLogger() {
    return (req, res, next) => {
      const startTime = Date.now();
      const clientIP = this.getClientIP(req);
      
      // Log security-relevant requests
      if (this.isSecurityRelevant(req)) {
        console.log(`[SECURITY] ${new Date().toISOString()} - ${req.method} ${req.path} from ${clientIP}`);
      }

      // Monitor response for security events
      const originalSend = res.send;
      res.send = function(data) {
        const duration = Date.now() - startTime;
        
        // Log failed requests
        if (res.statusCode >= 400) {
          console.log(`[SECURITY] ${new Date().toISOString()} - ${res.statusCode} ${req.method} ${req.path} from ${clientIP} (${duration}ms)`);
        }

        originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Check if request is security-relevant
   */
  isSecurityRelevant(req) {
    const securityPaths = ['/auth/', '/admin/', '/api/users/', '/api/organizations/'];
    return securityPaths.some(path => req.path.includes(path)) ||
           req.method === 'DELETE' ||
           req.path.includes('password') ||
           req.path.includes('token');
  }

  /**
   * Content Security Policy violation reporting
   */
  cspReporting() {
    return (req, res, next) => {
      if (req.path === '/csp-report' && req.method === 'POST') {
        console.log(`[CSP VIOLATION] ${new Date().toISOString()}:`, req.body);
        return res.status(204).send();
      }
      next();
    };
  }

  /**
   * Security headers validation
   */
  validateSecurityHeaders() {
    return (req, res, next) => {
      // Check for required security headers in responses
      const originalSend = res.send;
      res.send = function(data) {
        // Ensure security headers are present
        if (!res.get('X-Content-Type-Options')) {
          res.set('X-Content-Type-Options', 'nosniff');
        }
        
        if (!res.get('X-Frame-Options')) {
          res.set('X-Frame-Options', 'DENY');
        }
        
        if (!res.get('X-XSS-Protection')) {
          res.set('X-XSS-Protection', '1; mode=block');
        }

        originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Initialize all security middleware
   */
  initialize(app) {
    // Apply security headers
    app.use(this.applySecurityHeaders());
    
    // Global rate limiting
    app.use(this.globalRateLimit());
    
    // Security logging
    app.use(this.securityLogger());
    
    // Input sanitization
    app.use(this.sanitizeInput());
    
    // Failed auth tracking
    app.use(this.trackFailedAuth());
    
    // IP blocking
    app.use(this.checkBlocked());
    
    // CSP reporting
    app.use(this.cspReporting());
    
    // Security headers validation
    app.use(this.validateSecurityHeaders());
    
    console.log('✅ Security middleware initialized');
  }
}

module.exports = SecurityMiddleware;
