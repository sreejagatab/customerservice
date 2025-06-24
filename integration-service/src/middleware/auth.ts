/**
 * Authentication middleware for Integration Service
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger, authLogger } from '../utils/logger';
import { AuthenticationError, AuthorizationError } from './error-handler';

// Extended Request interface with user information
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
    permissions: string[];
  };
  organizationId?: string;
}

// JWT payload interface
interface JwtPayload {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

// Extract token from request headers
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Support both "Bearer token" and "token" formats
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return authHeader;
};

// Verify JWT token
const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    } else {
      throw new AuthenticationError('Token verification failed');
    }
  }
};

// Main authentication middleware
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    // Verify the token
    const payload = verifyToken(token);

    // Add user information to request
    req.user = {
      id: payload.id,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
      permissions: payload.permissions || [],
    };

    // Add organization ID for easy access
    req.organizationId = payload.organizationId;

    authLogger.debug('User authenticated successfully', {
      userId: payload.id,
      organizationId: payload.organizationId,
      role: payload.role,
    });

    next();
  } catch (error: any) {
    authLogger.warn('Authentication failed', {
      error: error.message,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    next(error);
  }
};

// Optional authentication middleware (doesn't throw if no token)
export const optionalAuthMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const payload = verifyToken(token);
      req.user = {
        id: payload.id,
        email: payload.email,
        organizationId: payload.organizationId,
        role: payload.role,
        permissions: payload.permissions || [],
      };
      req.organizationId = payload.organizationId;
    }

    next();
  } catch (error: any) {
    // Log the error but don't block the request
    authLogger.debug('Optional authentication failed', {
      error: error.message,
      path: req.path,
    });

    next();
  }
};

// Role-based authorization middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      authLogger.warn('Access denied - insufficient role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
      });
      
      return next(new AuthorizationError('Insufficient permissions'));
    }

    next();
  };
};

// Permission-based authorization middleware
export const requirePermission = (requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      authLogger.warn('Access denied - insufficient permissions', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions,
        path: req.path,
      });
      
      return next(new AuthorizationError('Insufficient permissions'));
    }

    next();
  };
};

// Organization ownership middleware
export const requireOrganizationAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new AuthenticationError('Authentication required'));
  }

  // Get organization ID from request params or body
  const requestedOrgId = req.params.organizationId || req.body.organizationId;
  
  if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
    authLogger.warn('Access denied - organization mismatch', {
      userId: req.user.id,
      userOrgId: req.user.organizationId,
      requestedOrgId,
      path: req.path,
    });
    
    return next(new AuthorizationError('Access denied to this organization'));
  }

  next();
};

// Integration ownership middleware
export const requireIntegrationAccess = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const integrationId = req.params.integrationId || req.params.id;
    
    if (!integrationId) {
      return next();
    }

    // TODO: Add database check to verify integration belongs to user's organization
    // This would require importing the database service
    // For now, we'll rely on the organization access check
    
    next();
  } catch (error) {
    next(error);
  }
};

// Admin-only middleware
export const requireAdmin = requireRole(['admin', 'super_admin']);

// Manager or admin middleware
export const requireManager = requireRole(['manager', 'admin', 'super_admin']);

// Service account authentication (for internal service communication)
export const serviceAuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const serviceToken = req.headers['x-service-token'] as string;
  
  if (!serviceToken) {
    return next(new AuthenticationError('Service token required'));
  }

  // TODO: Implement service token validation
  // This could be a shared secret or a special JWT
  
  next();
};

export default authMiddleware;
