/**
 * Workflow Routes
 * Handles CRUD operations for workflows and workflow management
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { WorkflowService } from '@/services/workflow';
import { WorkflowValidationService } from '@/services/workflow-validation';
import { asyncHandler } from '@/utils/async-handler';
import { validateRequest } from '@/middleware/validation';
import { logger } from '@/utils/logger';
import { 
  Workflow, 
  WorkflowStatus, 
  WorkflowTrigger, 
  WorkflowStep, 
  TriggerType,
  StepType 
} from '@universal-ai-cs/shared';

const router = Router();

// Validation schemas
const createWorkflowSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    triggers: z.array(z.object({
      type: z.nativeEnum(TriggerType),
      config: z.record(z.any()),
      conditions: z.array(z.record(z.any())).optional(),
    })),
    steps: z.array(z.object({
      id: z.string(),
      type: z.nativeEnum(StepType),
      name: z.string(),
      config: z.record(z.any()),
      position: z.object({
        x: z.number(),
        y: z.number(),
      }),
      connections: z.array(z.object({
        targetStepId: z.string(),
        condition: z.string().optional(),
      })).optional(),
    })),
    variables: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
      defaultValue: z.any().optional(),
      description: z.string().optional(),
    })).optional(),
    settings: z.object({
      timeout: z.number().optional(),
      retryPolicy: z.object({
        maxRetries: z.number(),
        backoffType: z.enum(['fixed', 'exponential']),
        backoffDelay: z.number(),
      }).optional(),
      errorHandling: z.object({
        onError: z.enum(['stop', 'continue', 'retry']),
        notifyOnError: z.boolean().optional(),
      }).optional(),
    }).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const updateWorkflowSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    status: z.nativeEnum(WorkflowStatus).optional(),
    triggers: z.array(z.any()).optional(),
    steps: z.array(z.any()).optional(),
    variables: z.array(z.any()).optional(),
    settings: z.record(z.any()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

/**
 * Get all workflows for organization
 * GET /api/v1/workflows
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId } = req.user!;
  const { 
    page = 1, 
    limit = 20, 
    status, 
    tags, 
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const filters = {
    status: status as WorkflowStatus,
    tags: tags ? (tags as string).split(',') : undefined,
    search: search as string,
  };

  const pagination = {
    page: parseInt(page as string, 10),
    limit: Math.min(parseInt(limit as string, 10), 100),
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  };

  const result = await WorkflowService.getWorkflows(organizationId, filters, pagination);

  res.json({
    success: true,
    data: result.workflows,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
}));

/**
 * Get workflow by ID
 * GET /api/v1/workflows/:id
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId } = req.user!;
  const { id } = req.params;

  const workflow = await WorkflowService.getWorkflowById(id, organizationId);
  
  if (!workflow) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found',
    });
  }

  res.json({
    success: true,
    data: workflow,
  });
}));

/**
 * Create new workflow
 * POST /api/v1/workflows
 */
router.post('/', 
  validateRequest(createWorkflowSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId, userId } = req.user!;
    const workflowData = req.body;

    // Validate workflow structure
    const validation = await WorkflowValidationService.validateWorkflow({
      ...workflowData,
      organizationId,
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid workflow configuration',
        details: validation.errors,
      });
    }

    const workflow = await WorkflowService.createWorkflow({
      ...workflowData,
      organizationId,
      createdBy: userId,
      status: WorkflowStatus.DRAFT,
    });

    logger.info('Workflow created', {
      workflowId: workflow.id,
      organizationId,
      userId,
      name: workflow.name,
    });

    res.status(201).json({
      success: true,
      data: workflow,
    });
  })
);

/**
 * Update workflow
 * PUT /api/v1/workflows/:id
 */
router.put('/:id',
  validateRequest(updateWorkflowSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId, userId } = req.user!;
    const { id } = req.params;
    const updates = req.body;

    // Check if workflow exists and belongs to organization
    const existingWorkflow = await WorkflowService.getWorkflowById(id, organizationId);
    if (!existingWorkflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    // If updating structure, validate the workflow
    if (updates.triggers || updates.steps || updates.variables) {
      const validation = await WorkflowValidationService.validateWorkflow({
        ...existingWorkflow,
        ...updates,
      });

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid workflow configuration',
          details: validation.errors,
        });
      }
    }

    const workflow = await WorkflowService.updateWorkflow(id, organizationId, updates);

    logger.info('Workflow updated', {
      workflowId: id,
      organizationId,
      userId,
      updates: Object.keys(updates),
    });

    res.json({
      success: true,
      data: workflow,
    });
  })
);

/**
 * Delete workflow
 * DELETE /api/v1/workflows/:id
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, userId } = req.user!;
  const { id } = req.params;

  const deleted = await WorkflowService.deleteWorkflow(id, organizationId);
  
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found',
    });
  }

  logger.info('Workflow deleted', {
    workflowId: id,
    organizationId,
    userId,
  });

  res.json({
    success: true,
    message: 'Workflow deleted successfully',
  });
}));

/**
 * Activate workflow
 * POST /api/v1/workflows/:id/activate
 */
router.post('/:id/activate', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, userId } = req.user!;
  const { id } = req.params;

  const workflow = await WorkflowService.activateWorkflow(id, organizationId);
  
  if (!workflow) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found',
    });
  }

  logger.info('Workflow activated', {
    workflowId: id,
    organizationId,
    userId,
  });

  res.json({
    success: true,
    data: workflow,
    message: 'Workflow activated successfully',
  });
}));

/**
 * Deactivate workflow
 * POST /api/v1/workflows/:id/deactivate
 */
router.post('/:id/deactivate', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, userId } = req.user!;
  const { id } = req.params;

  const workflow = await WorkflowService.deactivateWorkflow(id, organizationId);
  
  if (!workflow) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found',
    });
  }

  logger.info('Workflow deactivated', {
    workflowId: id,
    organizationId,
    userId,
  });

  res.json({
    success: true,
    data: workflow,
    message: 'Workflow deactivated successfully',
  });
}));

export default router;
