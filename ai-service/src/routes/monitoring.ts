/**
 * AI Performance Monitoring and Cost Optimization API Routes
 * Dashboard endpoints for monitoring AI performance and managing costs
 */

import { Router, Request, Response } from 'express';
import { performanceMonitoringService } from '@/services/performance-monitoring';
import { costOptimizationService } from '@/services/cost-optimization';
import { asyncHandler, validateRequired } from '@/utils/errors';
import { logger } from '@/utils/logger';

const router = Router();

// Performance Monitoring Endpoints

/**
 * Get accuracy metrics
 * GET /api/v1/ai/monitoring/accuracy
 */
router.get('/accuracy', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, timeRange = 'day' } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const metrics = await performanceMonitoringService.getAccuracyMetrics(
    organizationId as string,
    timeRange as 'hour' | 'day' | 'week' | 'month'
  );

  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get cost metrics
 * GET /api/v1/ai/monitoring/costs
 */
router.get('/costs', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, timeRange = 'day' } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const metrics = await performanceMonitoringService.getCostMetrics(
    organizationId as string,
    timeRange as 'hour' | 'day' | 'week' | 'month'
  );

  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get quality metrics
 * GET /api/v1/ai/monitoring/quality
 */
router.get('/quality', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, timeRange = 'day' } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const metrics = await performanceMonitoringService.getQualityMetrics(
    organizationId as string,
    timeRange as 'hour' | 'day' | 'week' | 'month'
  );

  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Generate comprehensive performance report
 * GET /api/v1/ai/monitoring/report
 */
router.get('/report', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, timeRange = 'day' } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const report = await performanceMonitoringService.generatePerformanceReport(
    organizationId as string,
    timeRange as 'hour' | 'day' | 'week' | 'month'
  );

  res.json({
    success: true,
    data: report,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Record performance metrics
 * POST /api/v1/ai/monitoring/metrics
 */
router.post('/metrics', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    providerId,
    metrics,
    metadata
  } = req.body;

  validateRequired(req.body, ['organizationId', 'providerId', 'metrics']);

  await performanceMonitoringService.recordMetrics(
    organizationId,
    providerId,
    metrics,
    metadata
  );

  res.json({
    success: true,
    message: 'Metrics recorded successfully',
    timestamp: new Date().toISOString(),
  });
}));

// A/B Testing Endpoints

/**
 * Create A/B test
 * POST /api/v1/ai/monitoring/ab-tests
 */
router.post('/ab-tests', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    testName,
    variants
  } = req.body;

  validateRequired(req.body, ['organizationId', 'testName', 'variants']);

  if (!Array.isArray(variants) || variants.length < 2) {
    return res.status(400).json({
      success: false,
      error: { message: 'At least 2 variants are required for A/B testing' },
    });
  }

  const testId = await performanceMonitoringService.createABTest(
    organizationId,
    testName,
    variants
  );

  res.status(201).json({
    success: true,
    data: { testId },
    message: 'A/B test created successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get A/B test results
 * GET /api/v1/ai/monitoring/ab-tests/:testId
 */
router.get('/ab-tests/:testId', asyncHandler(async (req: Request, res: Response) => {
  const { testId } = req.params;

  const results = await performanceMonitoringService.getABTestResults(testId);

  if (!results) {
    return res.status(404).json({
      success: false,
      error: { message: 'A/B test not found' },
    });
  }

  res.json({
    success: true,
    data: results,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Complete A/B test
 * POST /api/v1/ai/monitoring/ab-tests/:testId/complete
 */
router.post('/ab-tests/:testId/complete', asyncHandler(async (req: Request, res: Response) => {
  const { testId } = req.params;

  const results = await performanceMonitoringService.completeABTest(testId);

  res.json({
    success: true,
    data: results,
    message: 'A/B test completed successfully',
    timestamp: new Date().toISOString(),
  });
}));

// Cost Optimization Endpoints

/**
 * Create cost optimization rule
 * POST /api/v1/ai/monitoring/cost-rules
 */
router.post('/cost-rules', asyncHandler(async (req: Request, res: Response) => {
  const {
    organizationId,
    name,
    description,
    type,
    conditions,
    actions,
    priority,
    isActive
  } = req.body;

  validateRequired(req.body, [
    'organizationId',
    'name',
    'type',
    'conditions',
    'actions',
    'priority'
  ]);

  const id = await costOptimizationService.createOptimizationRule({
    organizationId,
    name,
    description: description || '',
    type,
    conditions,
    actions,
    priority,
    isActive: isActive ?? true,
  });

  res.status(201).json({
    success: true,
    data: { id },
    message: 'Cost optimization rule created successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Get cost optimization rules
 * GET /api/v1/ai/monitoring/cost-rules
 */
router.get('/cost-rules', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, isActive } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const rules = await costOptimizationService.getOptimizationRules(
    organizationId as string,
    isActive !== undefined ? isActive === 'true' : undefined
  );

  res.json({
    success: true,
    data: rules,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Generate cost predictions
 * GET /api/v1/ai/monitoring/cost-predictions
 */
router.get('/cost-predictions', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, period = 'day' } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const prediction = await costOptimizationService.generateCostPrediction(
    organizationId as string,
    period as 'day' | 'week' | 'month'
  );

  res.json({
    success: true,
    data: prediction,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Check budget alerts
 * GET /api/v1/ai/monitoring/budget-alerts
 */
router.get('/budget-alerts', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId } = req.query;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId query parameter is required' },
    });
  }

  const alerts = await costOptimizationService.checkBudgetAlerts(
    organizationId as string
  );

  res.json({
    success: true,
    data: alerts,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Generate cost optimization report
 * GET /api/v1/ai/monitoring/optimization-report
 */
router.get('/optimization-report', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId, startDate, endDate } = req.query;

  if (!organizationId || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: { message: 'organizationId, startDate, and endDate query parameters are required' },
    });
  }

  const report = await costOptimizationService.generateOptimizationReport(
    organizationId as string,
    new Date(startDate as string),
    new Date(endDate as string)
  );

  res.json({
    success: true,
    data: report,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
