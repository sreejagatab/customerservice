/**
 * ML Pipeline Routes
 * Handles machine learning model training, deployment, and prediction endpoints
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { MLPipelineService } from '@/services/ml-pipeline';
import { IndustryModelsService } from '@/services/industry-models';
import { PredictiveAnalyticsService } from '@/services/predictive-analytics';
import { logger } from '@/utils/logger';

const router = Router();

// Validation middleware
const validateRequest = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: errors.array(),
      },
    });
  }
  next();
};

/**
 * Create a new ML model
 */
router.post('/models',
  [
    body('name').notEmpty().withMessage('Model name is required'),
    body('type').isIn(['classification', 'regression', 'clustering', 'nlp', 'sentiment', 'churn_prediction']).withMessage('Invalid model type'),
    body('industry').isIn(['healthcare', 'finance', 'legal', 'ecommerce', 'general']).withMessage('Invalid industry'),
    body('architecture').isObject().withMessage('Architecture configuration is required'),
    body('trainingData').isObject().withMessage('Training data configuration is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const mlPipeline = (req.app as any).mlPipeline as MLPipelineService;
      const model = await mlPipeline.createModel(req.body);

      res.status(201).json({
        success: true,
        data: model,
        message: 'Model created successfully',
      });
    } catch (error) {
      logger.error('Error creating model', {
        error: error instanceof Error ? error.message : String(error),
        body: req.body,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create model',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Start model training
 */
router.post('/models/:modelId/train',
  [
    param('modelId').notEmpty().withMessage('Model ID is required'),
    body('datasetId').notEmpty().withMessage('Dataset ID is required'),
    body('config').isObject().withMessage('Training configuration is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const mlPipeline = (req.app as any).mlPipeline as MLPipelineService;
      const { modelId } = req.params;
      const { datasetId, config } = req.body;

      const job = await mlPipeline.trainModel(modelId, datasetId, config);

      res.status(200).json({
        success: true,
        data: job,
        message: 'Training started successfully',
      });
    } catch (error) {
      logger.error('Error starting model training', {
        error: error instanceof Error ? error.message : String(error),
        modelId: req.params.modelId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to start training',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Deploy a trained model
 */
router.post('/models/:modelId/deploy',
  [
    param('modelId').notEmpty().withMessage('Model ID is required'),
    body('version').optional().isString().withMessage('Version must be a string'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const mlPipeline = (req.app as any).mlPipeline as MLPipelineService;
      const { modelId } = req.params;
      const { version } = req.body;

      await mlPipeline.deployModel(modelId, version);

      res.status(200).json({
        success: true,
        message: 'Model deployed successfully',
      });
    } catch (error) {
      logger.error('Error deploying model', {
        error: error instanceof Error ? error.message : String(error),
        modelId: req.params.modelId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to deploy model',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Make prediction using deployed model
 */
router.post('/models/:modelId/predict',
  [
    param('modelId').notEmpty().withMessage('Model ID is required'),
    body('input').isObject().withMessage('Input data is required'),
    body('options').optional().isObject().withMessage('Options must be an object'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const mlPipeline = (req.app as any).mlPipeline as MLPipelineService;
      const { modelId } = req.params;
      const { input, options = {} } = req.body;

      const prediction = await mlPipeline.predict(modelId, input, options);

      res.status(200).json({
        success: true,
        data: prediction,
        message: 'Prediction completed successfully',
      });
    } catch (error) {
      logger.error('Error making prediction', {
        error: error instanceof Error ? error.message : String(error),
        modelId: req.params.modelId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to make prediction',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Get model metrics
 */
router.get('/models/:modelId/metrics',
  [
    param('modelId').notEmpty().withMessage('Model ID is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const mlPipeline = (req.app as any).mlPipeline as MLPipelineService;
      const { modelId } = req.params;

      const metrics = await mlPipeline.getModelMetrics(modelId);

      res.status(200).json({
        success: true,
        data: metrics,
        message: 'Metrics retrieved successfully',
      });
    } catch (error) {
      logger.error('Error getting model metrics', {
        error: error instanceof Error ? error.message : String(error),
        modelId: req.params.modelId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get metrics',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Create industry-specific model
 */
router.post('/industry-models/:industry',
  [
    param('industry').isIn(['healthcare', 'finance', 'legal', 'ecommerce']).withMessage('Invalid industry'),
    body('name').notEmpty().withMessage('Model name is required'),
    body('useCase').notEmpty().withMessage('Use case is required'),
    body('dataSource').notEmpty().withMessage('Data source is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const industryModels = (req.app as any).industryModels as IndustryModelsService;
      const { industry } = req.params;
      const { name, useCase, dataSource } = req.body;

      let model;
      switch (industry) {
        case 'healthcare':
          model = await industryModels.createHealthcareModel({ name, useCase, dataSource });
          break;
        case 'finance':
          model = await industryModels.createFinancialModel({ name, useCase, dataSource });
          break;
        case 'legal':
          model = await industryModels.createLegalModel({ name, useCase, dataSource });
          break;
        case 'ecommerce':
          model = await industryModels.createEcommerceModel({ name, useCase, dataSource });
          break;
        default:
          throw new Error(`Unsupported industry: ${industry}`);
      }

      res.status(201).json({
        success: true,
        data: model,
        message: `${industry} model created successfully`,
      });
    } catch (error) {
      logger.error('Error creating industry model', {
        error: error instanceof Error ? error.message : String(error),
        industry: req.params.industry,
        body: req.body,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create industry model',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Validate compliance
 */
router.get('/models/:modelId/compliance',
  [
    param('modelId').notEmpty().withMessage('Model ID is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const industryModels = (req.app as any).industryModels as IndustryModelsService;
      const { modelId } = req.params;

      const validation = await industryModels.validateCompliance(modelId);

      res.status(200).json({
        success: true,
        data: validation,
        message: 'Compliance validation completed',
      });
    } catch (error) {
      logger.error('Error validating compliance', {
        error: error instanceof Error ? error.message : String(error),
        modelId: req.params.modelId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to validate compliance',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Predict customer churn
 */
router.post('/analytics/churn/:customerId',
  [
    param('customerId').notEmpty().withMessage('Customer ID is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const predictiveAnalytics = (req.app as any).predictiveAnalytics as PredictiveAnalyticsService;
      const { customerId } = req.params;

      const prediction = await predictiveAnalytics.predictChurn(customerId);

      res.status(200).json({
        success: true,
        data: prediction,
        message: 'Churn prediction completed',
      });
    } catch (error) {
      logger.error('Error predicting churn', {
        error: error instanceof Error ? error.message : String(error),
        customerId: req.params.customerId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to predict churn',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Generate demand forecast
 */
router.post('/analytics/demand/:productId',
  [
    param('productId').notEmpty().withMessage('Product ID is required'),
    body('period').isIn(['daily', 'weekly', 'monthly', 'quarterly']).withMessage('Invalid period'),
    body('horizon').isInt({ min: 1, max: 365 }).withMessage('Horizon must be between 1 and 365'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const predictiveAnalytics = (req.app as any).predictiveAnalytics as PredictiveAnalyticsService;
      const { productId } = req.params;
      const { period, horizon } = req.body;

      const forecast = await predictiveAnalytics.forecastDemand(productId, period, horizon);

      res.status(200).json({
        success: true,
        data: forecast,
        message: 'Demand forecast completed',
      });
    } catch (error) {
      logger.error('Error forecasting demand', {
        error: error instanceof Error ? error.message : String(error),
        productId: req.params.productId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to forecast demand',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Calculate customer lifetime value
 */
router.get('/analytics/clv/:customerId',
  [
    param('customerId').notEmpty().withMessage('Customer ID is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const predictiveAnalytics = (req.app as any).predictiveAnalytics as PredictiveAnalyticsService;
      const { customerId } = req.params;

      const clv = await predictiveAnalytics.calculateCustomerLifetimeValue(customerId);

      res.status(200).json({
        success: true,
        data: clv,
        message: 'CLV calculation completed',
      });
    } catch (error) {
      logger.error('Error calculating CLV', {
        error: error instanceof Error ? error.message : String(error),
        customerId: req.params.customerId,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to calculate CLV',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Analyze sentiment trends
 */
router.get('/analytics/sentiment',
  [
    query('startDate').isISO8601().withMessage('Start date must be valid ISO 8601 date'),
    query('endDate').isISO8601().withMessage('End date must be valid ISO 8601 date'),
    query('granularity').optional().isIn(['hourly', 'daily', 'weekly']).withMessage('Invalid granularity'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const predictiveAnalytics = (req.app as any).predictiveAnalytics as PredictiveAnalyticsService;
      const { startDate, endDate, granularity = 'daily' } = req.query;

      const trends = await predictiveAnalytics.analyzeSentimentTrends(
        new Date(startDate as string),
        new Date(endDate as string),
        granularity as any
      );

      res.status(200).json({
        success: true,
        data: trends,
        message: 'Sentiment analysis completed',
      });
    } catch (error) {
      logger.error('Error analyzing sentiment trends', {
        error: error instanceof Error ? error.message : String(error),
        query: req.query,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze sentiment trends',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

/**
 * Generate business insights
 */
router.get('/analytics/insights',
  async (req: Request, res: Response) => {
    try {
      const predictiveAnalytics = (req.app as any).predictiveAnalytics as PredictiveAnalyticsService;

      const insights = await predictiveAnalytics.generateBusinessInsights();

      res.status(200).json({
        success: true,
        data: insights,
        message: 'Business insights generated',
      });
    } catch (error) {
      logger.error('Error generating business insights', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate business insights',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

export default router;
