/**
 * Authentication and Authorization Middleware for Admin Service
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { UserService } from '@/services/user-service';
import { RBACService } from '@/services/rbac-service';
import { logger } from '@/utils/logger';
import { UnauthorizedError, ForbiddenError } from '@/utils/errors';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
    permissions: string[];
  };
  organizationId?: string;
}

/**
 * Authentication middleware
 */
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new UnauthorizedError('Authentication token required');
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    if (!decoded || !decoded.userId) {
      throw new UnauthorizedError('Invalid authentication token');
    }

    // Get user details
    const userService = UserService.getInstance();
    const user = await userService.getUserById(decoded.userId);
    
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('User account is not active');
    }

    // Get user permissions
    const rbacService = RBACService.getInstance();
    const permissions = await rbacService.getUserPermissions(user.id, user.organizationId);

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      permissions,
    };

    req.organizationId = user.organizationId;

    next();
  } catch (error) {
    logger.error('Authentication failed', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (error instanceof UnauthorizedError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: 'Authentication failed',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
};

/**
 * Permission-based authorization middleware
 */
export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      if (!req.user.permissions.includes(permission)) {
        throw new ForbiddenError(`Permission '${permission}' required`);
      }

      next();
    } catch (error) {
      logger.error('Authorization failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        permission,
        userPermissions: req.user?.permissions,
        requestId: req.headers['x-request-id'],
      });

      if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_FAILED',
            message: 'Authorization failed',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  };
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (role: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      if (req.user.role !== role) {
        throw new ForbiddenError(`Role '${role}' required`);
      }

      next();
    } catch (error) {
      logger.error('Role authorization failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        userRole: req.user?.role,
        requiredRole: role,
        requestId: req.headers['x-request-id'],
      });

      if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_FAILED',
            message: 'Authorization failed',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  };
};

/**
 * Organization-based authorization middleware
 */
export const requireOrganization = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const organizationId = req.headers['x-organization-id'] as string || req.params.organizationId;
    
    if (!organizationId) {
      throw new ForbiddenError('Organization ID required');
    }

    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    if (req.user.organizationId !== organizationId) {
      throw new ForbiddenError('Access to this organization is not allowed');
    }

    req.organizationId = organizationId;
    next();
  } catch (error) {
    logger.error('Organization authorization failed', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id,
      userOrganizationId: req.user?.organizationId,
      requestedOrganizationId: req.headers['x-organization-id'] || req.params.organizationId,
      requestId: req.headers['x-request-id'],
    });

    if (error instanceof ForbiddenError) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHORIZATION_FAILED',
          message: 'Authorization failed',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
};

/**
 * Extract JWT token from request
 */
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter
  const queryToken = req.query.token as string;
  if (queryToken) {
    return queryToken;
  }

  // Check cookie
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    if (decoded && decoded.userId) {
      // Get user details
      const userService = UserService.getInstance();
      const user = await userService.getUserById(decoded.userId);
      
      if (user && user.status === 'active') {
        // Get user permissions
        const rbacService = RBACService.getInstance();
        const permissions = await rbacService.getUserPermissions(user.id, user.organizationId);

        // Attach user info to request
        req.user = {
          id: user.id,
          email: user.email,
          organizationId: user.organizationId,
          role: user.role,
          permissions,
        };

        req.organizationId = user.organizationId;
      }
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on errors, just continue without user
    logger.debug('Optional authentication failed', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });
    
    next();
  }
};

export default {
  authMiddleware,
  requirePermission,
  requireRole,
  requireOrganization,
  optionalAuth,
};
