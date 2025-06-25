/**
 * Template Routes
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { TemplateService } from '@/services/template-service';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();
const templateService = TemplateService.getInstance();

/**
 * Get templates
 * GET /api/v1/templates
 */
router.get('/', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('type').optional().isIn(['email', 'sms', 'push', 'in_app']).withMessage('Invalid template type'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
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
    const { organizationId, type, page = 1, limit = 20 } = req.query;
    
    const templates = await templateService.getTemplates({
      organizationId: organizationId as string,
      type: type as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    logger.error('Failed to get templates', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATES_FETCH_FAILED',
        message: 'Failed to fetch templates',
      },
    });
  }
}));

/**
 * Get template by ID
 * GET /api/v1/templates/:id
 */
router.get('/:id', [
  param('id').isString().notEmpty().withMessage('Template ID is required'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid template ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;
    
    const template = await templateService.getTemplate(id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found',
        },
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Failed to get template', {
      templateId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_FETCH_FAILED',
        message: 'Failed to fetch template',
      },
    });
  }
}));

/**
 * Create template
 * POST /api/v1/templates
 */
router.post('/', [
  body('name').isString().notEmpty().withMessage('Template name is required'),
  body('type').isIn(['email', 'sms', 'push', 'in_app']).withMessage('Invalid template type'),
  body('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  body('content').isString().notEmpty().withMessage('Template content is required'),
  body('subject').optional().isString().withMessage('Subject must be a string'),
  body('htmlContent').optional().isString().withMessage('HTML content must be a string'),
  body('variables').optional().isArray().withMessage('Variables must be an array'),
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
    const templateData = req.body;
    
    const template = await templateService.createTemplate(templateData);

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Failed to create template', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_CREATE_FAILED',
        message: 'Failed to create template',
      },
    });
  }
}));

/**
 * Update template
 * PUT /api/v1/templates/:id
 */
router.put('/:id', [
  param('id').isString().notEmpty().withMessage('Template ID is required'),
  body('name').optional().isString().notEmpty().withMessage('Template name cannot be empty'),
  body('content').optional().isString().notEmpty().withMessage('Template content cannot be empty'),
  body('subject').optional().isString().withMessage('Subject must be a string'),
  body('htmlContent').optional().isString().withMessage('HTML content must be a string'),
  body('variables').optional().isArray().withMessage('Variables must be an array'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
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
    
    const template = await templateService.updateTemplate(id, updateData);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found',
        },
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Failed to update template', {
      templateId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_UPDATE_FAILED',
        message: 'Failed to update template',
      },
    });
  }
}));

/**
 * Delete template
 * DELETE /api/v1/templates/:id
 */
router.delete('/:id', [
  param('id').isString().notEmpty().withMessage('Template ID is required'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid template ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;
    
    const success = await templateService.deleteTemplate(id);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found',
        },
      });
    }

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete template', {
      templateId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_DELETE_FAILED',
        message: 'Failed to delete template',
      },
    });
  }
}));

/**
 * Render template
 * POST /api/v1/templates/:id/render
 */
router.post('/:id/render', [
  param('id').isString().notEmpty().withMessage('Template ID is required'),
  body('data').isObject().withMessage('Template data must be an object'),
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
    const { data } = req.body;
    
    const rendered = await templateService.renderTemplate(id, data);
    
    if (!rendered) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found',
        },
      });
    }

    res.json({
      success: true,
      data: rendered,
    });
  } catch (error) {
    logger.error('Failed to render template', {
      templateId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_RENDER_FAILED',
        message: 'Failed to render template',
      },
    });
  }
}));

export default router;
