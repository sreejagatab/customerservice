import { Request, Response, NextFunction } from 'express';
import { JwtService, TokenPayload } from '../services/jwt.service';
import { UserService } from '../services/user.service';
import { ErrorCode, Permission, UserRole } from '@universal-ai-cs/shared';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: UserRole;
        permissions: string[];
        email: string;
      };
      token?: TokenPayload;
    }
  }
}

export class AuthMiddleware {
  constructor(
    private jwtService: JwtService,
    private userService: UserService
  ) {}

  /**
   * Middleware to authenticate JWT token
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

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Verify token
      const tokenPayload = await this.jwtService.verifyAccessToken(token);
      
      // Get fresh user data
      const user = await this.userService.findById(tokenPayload.sub);
      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'User not found',
          },
        });
        return;
      }

      // Check if user is active
      if (user.status !== 'active') {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'User account is not active',
          },
        });
        return;
      }

      // Attach user and token to request
      req.user = {
        id: user.id,
        organizationId: user.organizationId,
        role: user.role,
        permissions: user.permissions,
        email: user.email,
      };
      req.token = tokenPayload;

      next();
    } catch (error) {
      let errorCode = ErrorCode.UNAUTHORIZED;
      let message = 'Authentication failed';

      if (error instanceof Error) {
        if (error.message === ErrorCode.TOKEN_EXPIRED) {
          errorCode = ErrorCode.TOKEN_EXPIRED;
          message = 'Token has expired';
        } else if (error.message === ErrorCode.INVALID_TOKEN) {
          errorCode = ErrorCode.INVALID_TOKEN;
          message = 'Invalid token';
        }
      }

      res.status(401).json({
        success: false,
        error: {
          code: errorCode,
          message,
        },
      });
    }
  };

  /**
   * Middleware to check if user has required permissions
   */
  authorize = (requiredPermissions: Permission[] | Permission) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      const hasPermission = permissions.some(permission => 
        req.user!.permissions.includes(permission)
      );

      if (!hasPermission) {
        res.status(403).json({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Insufficient permissions',
            details: {
              required: permissions,
              current: req.user.permissions,
            },
          },
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to check if user has required role
   */
  requireRole = (requiredRoles: UserRole[] | UserRole) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
      
      if (!roles.includes(req.user.role)) {
        res.status(403).json({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Insufficient role privileges',
            details: {
              required: roles,
              current: req.user.role,
            },
          },
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to check if user belongs to the same organization
   */
  requireSameOrganization = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
        },
      });
      return;
    }

    const organizationId = req.params.organizationId || req.body.organizationId;
    
    if (organizationId && organizationId !== req.user.organizationId) {
      res.status(403).json({
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Access denied to different organization',
        },
      });
      return;
    }

    next();
  };

  /**
   * Middleware to check if user can access their own resources or has admin privileges
   */
  requireOwnershipOrAdmin = (userIdParam: string = 'userId') => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const targetUserId = req.params[userIdParam] || req.body[userIdParam];
      const isOwner = targetUserId === req.user.id;
      const isAdmin = ['super_admin', 'admin'].includes(req.user.role);

      if (!isOwner && !isAdmin) {
        res.status(403).json({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Access denied - insufficient privileges',
          },
        });
        return;
      }

      next();
    };
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
      const tokenPayload = await this.jwtService.verifyAccessToken(token);
      
      const user = await this.userService.findById(tokenPayload.sub);
      if (user && user.status === 'active') {
        req.user = {
          id: user.id,
          organizationId: user.organizationId,
          role: user.role,
          permissions: user.permissions,
          email: user.email,
        };
        req.token = tokenPayload;
      }

      next();
    } catch (error) {
      // Ignore authentication errors for optional auth
      next();
    }
  };

  /**
   * Middleware to validate API key authentication
   */
  authenticateApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      
      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'API key required',
          },
        });
        return;
      }

      // Validate API key
      const keyData = await this.userService.validateApiKey(apiKey);
      if (!keyData) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Invalid API key',
          },
        });
        return;
      }

      // Get user data
      const user = await this.userService.findById(keyData.userId);
      if (!user || user.status !== 'active') {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'User not found or inactive',
          },
        });
        return;
      }

      // Attach user to request
      req.user = {
        id: user.id,
        organizationId: user.organizationId,
        role: user.role,
        permissions: keyData.permissions.length > 0 ? keyData.permissions : user.permissions,
        email: user.email,
      };

      // Update API key last used
      await this.userService.updateApiKeyLastUsed(keyData.id);

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'API key authentication failed',
        },
      });
    }
  };
}
