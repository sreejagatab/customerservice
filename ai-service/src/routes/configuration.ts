/**
 * AI Configuration API Routes
 * RESTful API endpoints for AI model configuration, training data, and prompt templates
 */

import { Router, Request, Response } from 'express';
import { aiConfigurationService } from '@/services/ai-configuration';
import { asyncHandler, validateRequired } from '@/utils/errors';
import { logger } from '@/utils/logger';

const router = Router();

// Model Configuration Endpoints

/**
 * Create model configuration
 * POST /api/v1/ai/config/models
 */
router.post('/models', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    providerId,
    name,
    displayName,
    type,
    isActive,
    configuration,
    capabilities,
    costSettings,
    performanceSettings,
    metadata
  } = req.body;

  validateRequired(req.body, [
    'organizationId',
    'providerId',
    'name',
    'displayName',
    'type',
    'configuration',
    'capabilities',
    'costSettings',
    'performanceSettings'
  ]);

  const id = await aiConfigurationService.createModelConfiguration({
    organizationId,
    providerId,
    name,
    displayName,
    type,
    isActive: isActive ?? true,
    configuration,
    capabilities,
    costSettings,
    performanceSettings,
    metadata: metadata || {},
  });

  res.status(201).json({
    success: true,
    data: { id },
    message: 'Model configuration created successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get model configurations
 * GET /api/v1/ai/config/models
 */
router.get('/models', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, providerId, type, isActive } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const filters: any = {};
  if (providerId) filters.providerId = providerId as string;
  if (type) filters.type = type as string;
  if (isActive !== undefined) filters.isActive = isActive === 'true';

  const configurations = await aiConfigurationService.getModelConfigurations(
    organizationId as string,
    filters
  );

  res.json({
    success: true,
    data: configurations,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get specific model configuration
 * GET /api/v1/ai/config/models/:id
 */
router.get('/models/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const configuration = await aiConfigurationService.getModelConfiguration(id);

  if (!configuration) {
    return res.status(404).json({
      success: false,
      error: { message: 'Model configuration not found' },
    });
  }

  res.json({
    success: true,
    data: configuration,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Update model configuration
 * PUT /api/v1/ai/config/models/:id
 */
router.put('/models/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  await aiConfigurationService.updateModelConfiguration(id, updates);

  res.json({
    success: true,
    message: 'Model configuration updated successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Delete model configuration
 * DELETE /api/v1/ai/config/models/:id
 */
router.delete('/models/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await aiConfigurationService.deleteModelConfiguration(id);

  res.json({
    success: true,
    message: 'Model configuration deleted successfully',
    timestamp: new Date().toISOString(),
  });
}));

// Training Data Endpoints

/**
 * Add training data
 * POST /api/v1/ai/config/training-data
 */
router.post('/training-data', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    type,
    category,
    input,
    expectedOutput,
    metadata,
    isActive
  } = req.body;

  validateRequired(req.body, [
    'organizationId',
    'type',
    'category',
    'input',
    'expectedOutput'
  ]);

  const id = await aiConfigurationService.addTrainingData({
    organizationId,
    type,
    category,
    input,
    expectedOutput,
    metadata: metadata || {},
    isActive: isActive ?? true,
  });

  res.status(201).json({
    success: true,
    data: { id },
    message: 'Training data added successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Bulk add training data
 * POST /api/v1/ai/config/training-data/bulk
 */
router.post('/training-data/bulk', asyncHandler(async (req: Request, res: Response) => {
  const { data } = req.body;

  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({
      success: false,
      error: { message: 'data array is required and cannot be empty' },
    });
  }

  if (data.length > 1000) {
    return res.status(400).json({
      success: false,
      error: { message: 'Maximum 1000 training data entries per bulk operation' },
    });
  }

  const ids = await aiConfigurationService.bulkAddTrainingData(data);

  res.status(201).json({
    success: true,
    data: {
      ids,
      processed: ids.length,
      total: data.length,
    },
    message: 'Training data bulk added successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get training data
 * GET /api/v1/ai/config/training-data
 */
router.get('/training-data', asyncHandler(async (req: Request, res: Response) => {
  const { 
    organizationId, 
    type, 
    category, 
    isActive, 
    limit = 50, 
    offset = 0 
  } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const filters: any = {
    limit: parseInt(limit as string),
    offset: parseInt(offset as string),
  };
  
  if (type) filters.type = type as string;
  if (category) filters.category = category as string;
  if (isActive !== undefined) filters.isActive = isActive === 'true';

  const result = await aiConfigurationService.getTrainingData(
    organizationId as string,
    filters
  );

  res.json({
    success: true,
    data: result.data,
    pagination: {
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
      hasMore: result.total > filters.offset + filters.limit,
    },
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Update training data
 * PUT /api/v1/ai/config/training-data/:id
 */
router.put('/training-data/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  await aiConfigurationService.updateTrainingData(id, updates);

  res.json({
    success: true,
    message: 'Training data updated successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Delete training data
 * DELETE /api/v1/ai/config/training-data/:id
 */
router.delete('/training-data/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await aiConfigurationService.deleteTrainingData(id);

  res.json({
    success: true,
    message: 'Training data deleted successfully',
    timestamp: new Date().toISOString(),
  });
}));

// Prompt Template Endpoints

/**
 * Create prompt template
 * POST /api/v1/ai/config/prompt-templates
 */
router.post('/prompt-templates', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    name,
    description,
    type,
    template,
    variables,
    examples,
    isActive
  } = req.body;

  validateRequired(req.body, [
    'organizationId',
    'name',
    'type',
    'template',
    'variables'
  ]);

  const id = await aiConfigurationService.createPromptTemplate({
    organizationId,
    name,
    description: description || '',
    type,
    template,
    variables: variables || [],
    examples: examples || [],
    isActive: isActive ?? true,
  });

  res.status(201).json({
    success: true,
    data: { id },
    message: 'Prompt template created successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get prompt templates
 * GET /api/v1/ai/config/prompt-templates
 */
router.get('/prompt-templates', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, type, isActive } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const filters: any = {};
  if (type) filters.type = type as string;
  if (isActive !== undefined) filters.isActive = isActive === 'true';

  const templates = await aiConfigurationService.getPromptTemplates(
    organizationId as string,
    filters
  );

  res.json({
    success: true,
    data: templates,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get specific prompt template
 * GET /api/v1/ai/config/prompt-templates/:id
 */
router.get('/prompt-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const template = await aiConfigurationService.getPromptTemplate(id);

  if (!template) {
    return res.status(404).json({
      success: false,
      error: { message: 'Prompt template not found' },
    });
  }

  res.json({
    success: true,
    data: template,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Update prompt template
 * PUT /api/v1/ai/config/prompt-templates/:id
 */
router.put('/prompt-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  await aiConfigurationService.updatePromptTemplate(id, updates);

  res.json({
    success: true,
    message: 'Prompt template updated successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Delete prompt template
 * DELETE /api/v1/ai/config/prompt-templates/:id
 */
router.delete('/prompt-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await aiConfigurationService.deletePromptTemplate(id);

  res.json({
    success: true,
    message: 'Prompt template deleted successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Render prompt template with variables
 * POST /api/v1/ai/config/prompt-templates/:id/render
 */
router.post('/prompt-templates/:id/render', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { variables } = req.body;

  if (!variables || typeof variables !== 'object') {
    return res.status(400).json({
      success: false,
      error: { message: 'variables object is required' },
    });
  }

  const rendered = await aiConfigurationService.renderPromptTemplate(id, variables);

  res.json({
    success: true,
    data: { rendered },
    timestamp: new Date().toISOString(),
  });
}));

// Performance Configuration Endpoints

/**
 * Set performance configuration
 * POST /api/v1/ai/config/performance
 */
router.post('/performance', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    modelId,
    accuracyTargets,
    qualityTargets,
    costTargets,
    alertThresholds
  } = req.body;

  validateRequired(req.body, [
    'organizationId',
    'modelId',
    'accuracyTargets',
    'qualityTargets',
    'costTargets',
    'alertThresholds'
  ]);

  await aiConfigurationService.setPerformanceConfig({
    organizationId,
    modelId,
    accuracyTargets,
    qualityTargets,
    costTargets,
    alertThresholds,
  });

  res.json({
    success: true,
    message: 'Performance configuration set successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get performance configuration
 * GET /api/v1/ai/config/performance
 */
router.get('/performance', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, modelId } = req.query;

  if (!organizationId || !modelId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId and modelId query parameters are required' },
    });
  }

  const config = await aiConfigurationService.getPerformanceConfig(
    organizationId as string,
    modelId as string
  );

  if (!config) {
    return res.status(404).json({
      success: false,
      error: { message: 'Performance configuration not found' },
    });
  }

  res.json({
    success: true,
    data: config,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
