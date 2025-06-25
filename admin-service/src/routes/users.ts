/**
 * User Management Routes
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { UserService } from '@/services/user-service';
import { AuditService } from '@/services/audit-service';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/utils/async-handler';
import { authMiddleware, requirePermission } from '@/middleware/auth';

const router = Router();
const userService = UserService.getInstance();
const auditService = AuditService.getInstance();

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * Get users
 * GET /api/v1/users
 */
router.get('/', [
  requirePermission('users:read'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('role').optional().isString().withMessage('Role must be a string'),
  query('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: errors.array(),
      },
    });
  }

  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const organizationId = (req as any).organizationId;

    const users = await userService.getUsers({
      organizationId,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: search as string,
      role: role as string,
      status: status as string,
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('Failed to get users', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'USERS_FETCH_FAILED',
        message: 'Failed to fetch users',
      },
    });
  }
}));

/**
 * Get user by ID
 * GET /api/v1/users/:id
 */
router.get('/:id', [
  requirePermission('users:read'),
  param('id').isUUID().withMessage('Invalid user ID'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;

    const user = await userService.getUserById(id, organizationId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Failed to get user', {
      userId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'USER_FETCH_FAILED',
        message: 'Failed to fetch user',
      },
    });
  }
}));

/**
 * Create user
 * POST /api/v1/users
 */
router.post('/', [
  requirePermission('users:create'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('firstName').isString().notEmpty().withMessage('First name is required'),
  body('lastName').isString().notEmpty().withMessage('Last name is required'),
  body('role').isString().notEmpty().withMessage('Role is required'),
  body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors.array(),
      },
    });
  }

  try {
    const userData = req.body;
    const organizationId = (req as any).organizationId;
    const currentUserId = (req as any).user.id;

    const user = await userService.createUser({
      ...userData,
      organizationId,
      createdBy: currentUserId,
    });

    // Log audit event
    await auditService.logEvent({
      action: 'user.created',
      userId: currentUserId,
      organizationId,
      resourceId: user.id,
      resourceType: 'user',
      details: {
        email: user.email,
        role: user.role,
      },
    });

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Failed to create user', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'USER_CREATE_FAILED',
        message: 'Failed to create user',
      },
    });
  }
}));

/**
 * Update user
 * PUT /api/v1/users/:id
 */
router.put('/:id', [
  requirePermission('users:update'),
  param('id').isUUID().withMessage('Invalid user ID'),
  body('firstName').optional().isString().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().isString().notEmpty().withMessage('Last name cannot be empty'),
  body('role').optional().isString().notEmpty().withMessage('Role cannot be empty'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;
    const updateData = req.body;
    const organizationId = (req as any).organizationId;
    const currentUserId = (req as any).user.id;

    const user = await userService.updateUser(id, updateData, organizationId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Log audit event
    await auditService.logEvent({
      action: 'user.updated',
      userId: currentUserId,
      organizationId,
      resourceId: id,
      resourceType: 'user',
      details: updateData,
    });

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Failed to update user', {
      userId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'USER_UPDATE_FAILED',
        message: 'Failed to update user',
      },
    });
  }
}));

/**
 * Delete user
 * DELETE /api/v1/users/:id
 */
router.delete('/:id', [
  requirePermission('users:delete'),
  param('id').isUUID().withMessage('Invalid user ID'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;
    const currentUserId = (req as any).user.id;

    const success = await userService.deleteUser(id, organizationId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Log audit event
    await auditService.logEvent({
      action: 'user.deleted',
      userId: currentUserId,
      organizationId,
      resourceId: id,
      resourceType: 'user',
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete user', {
      userId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'USER_DELETE_FAILED',
        message: 'Failed to delete user',
      },
    });
  }
}));

export default router;
