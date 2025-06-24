/**
 * AI Service API Routes
 * RESTful API endpoints for AI operations and configuration
 */

import { Router, Request, Response } from 'express';
import { aiProviderManager } from '@/services/ai-provider-manager';
import { messageClassificationService } from '@/services/classification';
import { responseGenerationService } from '@/services/response-generation';
import { asyncHandler } from '@/utils/errors';
import { validateRequired } from '@/utils/errors';
import { logger } from '@/utils/logger';
import configurationRoutes from '@/routes/configuration';
import monitoringRoutes from '@/routes/monitoring';

const router = Router();

// Mount configuration routes
router.use('/config', configurationRoutes);

// Mount monitoring routes
router.use('/monitoring', monitoringRoutes);

// AI Processing Endpoints

/**
 * Classify a message
 * POST /api/v1/ai/classify
 */
router.post('/classify', asyncHandler(async (req: Request, res: Response) => {
  const {
    messageId,
    organizationId,
    integrationId,
    messageText,
    messageHtml,
    sender,
    context,
    options
  } = req.body;

  validateRequired(req.body, ['messageId', 'organizationId', 'messageText']);

  const result = await messageClassificationService.classifyMessage({
    messageId,
    organizationId,
    integrationId,
    messageText,
    messageHtml,
    sender,
    context,
    options,
  });

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Generate response
 * POST /api/v1/ai/generate-response
 */
router.post('/generate-response', asyncHandler(async (req: Request, res: Response) => {
  const {
    messageId,
    organizationId,
    integrationId,
    messageText,
    messageHtml,
    classification,
    conversationContext,
    organizationContext,
    options
  } = req.body;

  validateRequired(req.body, [
    'messageId', 
    'organizationId', 
    'messageText', 
    'conversationContext',
    'organizationContext'
  ]);

  const result = await responseGenerationService.generateResponse({
    messageId,
    organizationId,
    integrationId,
    messageText,
    messageHtml,
    classification,
    conversationContext,
    organizationContext,
    options,
  });

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Batch classify messages
 * POST /api/v1/ai/classify-batch
 */
router.post('/classify-batch', asyncHandler(async (req: Request, res: Response) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      success: false,
      error: { message: 'messages array is required and cannot be empty' },
    });
  }

  if (messages.length > 100) {
    return res.status(400).json({
      success: false,
      error: { message: 'Maximum 100 messages per batch' },
    });
  }

  const results = await messageClassificationService.classifyMessages(messages);

  res.json({
    success: true,
    data: {
      results,
      processed: results.length,
      total: messages.length,
    },
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Generate response alternatives
 * POST /api/v1/ai/generate-alternatives
 */
router.post('/generate-alternatives', asyncHandler(async (req: Request, res: Response) => {
  const { count = 3, ...requestData } = req.body;

  validateRequired(req.body, [
    'messageId', 
    'organizationId', 
    'messageText', 
    'conversationContext',
    'organizationContext'
  ]);

  const results = await responseGenerationService.generateResponseAlternatives(
    requestData,
    Math.min(count, 5) // Limit to 5 alternatives
  );

  res.json({
    success: true,
    data: {
      alternatives: results,
      count: results.length,
    },
    timestamp: new Date().toISOString(),
  });
}));

// Provider Management Endpoints

/**
 * Get all AI providers
 * GET /api/v1/ai/providers
 */
router.get('/providers', asyncHandler(async (req: Request, res: Response) => {
  const providers = await aiProviderManager.getProviderStatus();

  res.json({
    success: true,
    data: providers,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Add new AI provider
 * POST /api/v1/ai/providers
 */
router.post('/providers', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    name,
    provider,
    apiKey,
    baseUrl,
    organizationIdentifier,
    rateLimits,
    costConfig,
    features,
    priority,
    models
  } = req.body;

  validateRequired(req.body, [
    'organizationId',
    'name', 
    'provider', 
    'apiKey',
    'rateLimits',
    'costConfig',
    'features'
  ]);

  const providerConfig = {
    id: `${organizationId}-${provider}-${Date.now()}`,
    organizationId,
    name,
    provider,
    apiKey,
    baseUrl,
    organizationIdentifier,
    rateLimits,
    costConfig,
    features,
    priority: priority || 5,
    isActive: true,
    models: models || [],
  };

  await aiProviderManager.addProvider(providerConfig);

  res.status(201).json({
    success: true,
    data: { id: providerConfig.id },
    message: 'Provider added successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Remove AI provider
 * DELETE /api/v1/ai/providers/:id
 */
router.delete('/providers/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await aiProviderManager.removeProvider(id);

  res.json({
    success: true,
    message: 'Provider removed successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get available provider types
 * GET /api/v1/ai/provider-types
 */
router.get('/provider-types', asyncHandler(async (req: Request, res: Response) => {
  const availableProviders = aiProviderManager.getAvailableProviders();

  res.json({
    success: true,
    data: availableProviders,
    timestamp: new Date().toISOString(),
  });
}));

// Analytics and Monitoring Endpoints

/**
 * Get classification statistics
 * GET /api/v1/ai/stats/classification
 */
router.get('/stats/classification', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, timeRange = 'day' } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const stats = await messageClassificationService.getClassificationStats(
    organizationId as string,
    timeRange as 'hour' | 'day' | 'week' | 'month'
  );

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get response generation statistics
 * GET /api/v1/ai/stats/responses
 */
router.get('/stats/responses', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, timeRange = 'day' } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const stats = await responseGenerationService.getResponseStats(
    organizationId as string,
    timeRange as 'hour' | 'day' | 'week' | 'month'
  );

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get classification history
 * GET /api/v1/ai/history/classification
 */
router.get('/history/classification', asyncHandler(async (req: Request, res: Response) => {
  const { messageId, organizationId, limit = 50 } = req.query;

  const history = await messageClassificationService.getClassificationHistory(
    messageId as string,
    undefined, // conversationId
    organizationId as string,
    parseInt(limit as string)
  );

  res.json({
    success: true,
    data: history,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get response generation history
 * GET /api/v1/ai/history/responses
 */
router.get('/history/responses', asyncHandler(async (req: Request, res: Response) => {
  const { messageId, organizationId, limit = 50 } = req.query;

  const history = await responseGenerationService.getResponseHistory(
    messageId as string,
    organizationId as string,
    parseInt(limit as string)
  );

  res.json({
    success: true,
    data: history,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
