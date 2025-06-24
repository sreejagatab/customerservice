import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { ErrorCode } from '@universal-ai-cs/shared';
import { ServiceRegistry } from '../services/service-registry';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: string;
        permissions: string[];
        email: string;
      };
      requestId?: string;
      startTime?: number;
    }
  }
}

export class GatewayMiddleware {
  constructor(
    private serviceRegistry: ServiceRegistry,
    private jwtSecret: string
  ) {}

  /**
   * Add request ID and timing
   */
  requestTracking = (req: Request, res: Response, next: NextFunction): void => {
    req.requestId = req.headers['x-request-id'] as string || 
      Math.random().toString(36).substring(2, 15);
    req.startTime = Date.now();
    
    // Add request ID to response headers
    res.set('X-Request-ID', req.requestId);
    
    next();
  };

  /**
   * Authentication middleware that validates JWT tokens
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Missing or invalid authorization header',
          },
        });
        return;
      }

      const token = authHeader.substring(7);
      
      try {
        // Verify JWT token
        const decoded = jwt.verify(token, this.jwtSecret) as any;
        
        // Validate token with auth service
        const isValid = await this.validateTokenWithAuthService(token);
        if (!isValid) {
          res.status(401).json({
            success: false,
            error: {
              code: ErrorCode.UNAUTHORIZED,
              message: 'Token validation failed',
            },
          });
          return;
        }

        // Attach user info to request
        req.user = {
          id: decoded.sub,
          organizationId: decoded.org,
          role: decoded.role,
          permissions: decoded.permissions || [],
          email: decoded.email,
        };

        next();
      } catch (jwtError) {
        let errorCode = ErrorCode.UNAUTHORIZED;
        let message = 'Authentication failed';

        if (jwtError instanceof jwt.TokenExpiredError) {
          errorCode = ErrorCode.TOKEN_EXPIRED;
          message = 'Token has expired';
        } else if (jwtError instanceof jwt.JsonWebTokenError) {
          errorCode = ErrorCode.INVALID_TOKEN;
          message = 'Invalid token';
        }

        res.status(401).json({
          success: false,
          error: {
            code: errorCode,
            message,
          },
        });
      }
    } catch (error) {
      console.error('Authentication middleware error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        },
      });
    }
  };

  /**
   * Optional authentication - doesn't fail if no token provided
   */
  optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, this.jwtSecret) as any;
        const isValid = await this.validateTokenWithAuthService(token);
        
        if (isValid) {
          req.user = {
            id: decoded.sub,
            organizationId: decoded.org,
            role: decoded.role,
            permissions: decoded.permissions || [],
            email: decoded.email,
          };
        }
      } catch (error) {
        // Ignore authentication errors for optional auth
      }

      next();
    } catch (error) {
      // Ignore errors for optional auth
      next();
    }
  };

  /**
   * Service health check middleware
   */
  serviceHealthCheck = (serviceName: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const service = this.serviceRegistry.getService(serviceName);
      
      if (!service) {
        res.status(503).json({
          success: false,
          error: {
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: `Service ${serviceName} not found`,
          },
        });
        return;
      }

      if (service.status !== 'healthy') {
        res.status(503).json({
          success: false,
          error: {
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: `Service ${serviceName} is not healthy`,
          },
        });
        return;
      }

      next();
    };
  };

  /**
   * Request validation middleware
   */
  validateRequest = (req: Request, res: Response, next: NextFunction): void => {
    // Check content type for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type'];
      
      if (!contentType) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Content-Type header is required',
          },
        });
        return;
      }

      if (!contentType.includes('application/json') && 
          !contentType.includes('multipart/form-data') &&
          !contentType.includes('application/x-www-form-urlencoded')) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Unsupported content type',
          },
        });
        return;
      }
    }

    // Check request size
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
      res.status(413).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request entity too large',
        },
      });
      return;
    }

    next();
  };

  /**
   * CORS middleware
   */
  cors = (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173',
    ];

    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,X-API-Key,X-Request-ID');
    res.header('Access-Control-Expose-Headers', 'X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    next();
  };

  /**
   * Response time middleware
   */
  responseTime = (req: Request, res: Response, next: NextFunction): void => {
    const startTime = req.startTime || Date.now();
    
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      res.set('X-Response-Time', `${responseTime}ms`);
      
      console.log(`${req.method} ${req.path} - ${res.statusCode} - ${responseTime}ms`);
    });

    next();
  };

  /**
   * Error handling middleware
   */
  errorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
    console.error('Gateway error:', error);

    // Don't send error response if headers already sent
    if (res.headersSent) {
      return next(error);
    }

    let statusCode = 500;
    let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    // Handle specific error types
    if (error.type === 'entity.parse.failed') {
      statusCode = 400;
      errorCode = ErrorCode.VALIDATION_ERROR;
      message = 'Invalid JSON in request body';
    } else if (error.type === 'entity.too.large') {
      statusCode = 413;
      errorCode = ErrorCode.VALIDATION_ERROR;
      message = 'Request entity too large';
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
      errorCode = ErrorCode.SERVICE_UNAVAILABLE;
      message = 'Service unavailable';
    } else if (error.code === 'ETIMEDOUT') {
      statusCode = 504;
      errorCode = ErrorCode.TIMEOUT_ERROR;
      message = 'Gateway timeout';
    }

    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
        requestId: req.requestId,
      },
    });
  };

  /**
   * Request logging middleware
   */
  requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const logData = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
    };

    console.log('Incoming request:', JSON.stringify(logData));
    next();
  };

  /**
   * Security headers middleware
   */
  securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    });

    next();
  };

  private async validateTokenWithAuthService(token: string): Promise<boolean> {
    try {
      const authService = this.serviceRegistry.getService('auth-service');
      if (!authService || authService.status !== 'healthy') {
        // If auth service is down, fall back to JWT verification only
        return true;
      }

      const response = await axios.post(
        `${authService.url}/api/v1/auth/validate`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 5000,
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('Token validation error:', error.message);
      return false;
    }
  }
}
