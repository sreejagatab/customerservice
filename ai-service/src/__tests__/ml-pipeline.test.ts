/**
 * ML Pipeline Service Tests
 * Comprehensive tests for machine learning pipeline functionality
 */

import { MLPipelineService, MLModel, TrainingJob, Dataset } from '../services/ml-pipeline';
import { IndustryModelsService } from '../services/industry-models';
import { PredictiveAnalyticsService } from '../services/predictive-analytics';

describe('ML Pipeline Service', () => {
  let mlPipeline: MLPipelineService;
  let industryModels: IndustryModelsService;
  let predictiveAnalytics: PredictiveAnalyticsService;

  beforeAll(async () => {
    // Initialize services
    mlPipeline = new MLPipelineService();
    industryModels = new IndustryModelsService(mlPipeline);
    predictiveAnalytics = new PredictiveAnalyticsService(mlPipeline);
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Model Management', () => {
    let testModel: MLModel;

    it('should create a new ML model', async () => {
      const modelConfig = {
        name: 'Test Classification Model',
        type: 'classification' as const,
        industry: 'general' as const,
        architecture: {
          layers: [
            { type: 'dense', units: 64, activation: 'relu' },
            { type: 'dropout', dropout: 0.2 },
            { type: 'dense', units: 32, activation: 'relu' },
            { type: 'dense', units: 2, activation: 'softmax' },
          ],
          optimizer: 'adam',
          loss: 'categoricalCrossentropy',
          metrics: ['accuracy'],
        },
        trainingData: {
          size: 1000,
          features: ['feature1', 'feature2', 'feature3'],
          labels: ['class1', 'class2'],
          source: 'test_database',
        },
        metadata: {
          description: 'Test model for unit testing',
          tags: ['test', 'classification'],
          createdAt: new Date(),
          modelSize: 0,
        },
      };

      testModel = await mlPipeline.createModel(modelConfig);

      expect(testModel).toMatchObject({
        id: expect.any(String),
        name: 'Test Classification Model',
        type: 'classification',
        industry: 'general',
        status: 'training',
        architecture: expect.objectContaining({
          layers: expect.any(Array),
          optimizer: 'adam',
          loss: 'categoricalCrossentropy',
        }),
      });
    });

    it('should create a dataset for training', async () => {
      const datasetConfig = {
        name: 'Test Dataset',
        type: 'training' as const,
        size: 1000,
        features: [
          { name: 'feature1', type: 'numerical' as const, nullable: false, description: 'First feature' },
          { name: 'feature2', type: 'numerical' as const, nullable: false, description: 'Second feature' },
          { name: 'feature3', type: 'categorical' as const, nullable: false, description: 'Third feature' },
        ],
        labels: [
          { name: 'target', type: 'categorical' as const, classes: ['class1', 'class2'] },
        ],
        source: {
          type: 'database' as const,
          location: 'test_db',
          format: 'sql' as const,
        },
      };

      const dataset = await mlPipeline.createDataset(datasetConfig);

      expect(dataset).toMatchObject({
        id: expect.any(String),
        name: 'Test Dataset',
        type: 'training',
        size: 1000,
        features: expect.any(Array),
        labels: expect.any(Array),
      });
    });

    it('should start model training', async () => {
      // Create a dataset first
      const dataset = await mlPipeline.createDataset({
        name: 'Training Dataset',
        type: 'training',
        size: 1000,
        features: [
          { name: 'feature1', type: 'numerical', nullable: false, description: 'Feature 1' },
        ],
        labels: [
          { name: 'target', type: 'categorical', classes: ['class1', 'class2'] },
        ],
        source: {
          type: 'database',
          location: 'test_db',
          format: 'sql',
        },
      });

      const trainingConfig = {
        epochs: 10,
        batchSize: 32,
        learningRate: 0.001,
        validationSplit: 0.2,
        earlyStopping: true,
      };

      const job = await mlPipeline.trainModel(testModel.id, dataset.id, trainingConfig);

      expect(job).toMatchObject({
        id: expect.any(String),
        modelId: testModel.id,
        status: 'queued',
        progress: 0,
        config: trainingConfig,
      });
    }, 30000);

    it('should deploy a trained model', async () => {
      // Mock the model as trained
      await mlPipeline['updateModelStatus'](testModel.id, 'trained');

      await expect(mlPipeline.deployModel(testModel.id)).resolves.not.toThrow();
    });

    it('should make predictions with deployed model', async () => {
      const input = {
        feature1: 0.5,
        feature2: 0.3,
        feature3: 'category_a',
      };

      const prediction = await mlPipeline.predict(testModel.id, input, {
        explainable: true,
      });

      expect(prediction).toMatchObject({
        id: expect.any(String),
        modelId: testModel.id,
        input,
        output: {
          prediction: expect.any(Number),
          confidence: expect.any(Number),
        },
        metadata: {
          timestamp: expect.any(Date),
          processingTime: expect.any(Number),
        },
      });
    });

    it('should get model metrics', async () => {
      const metrics = await mlPipeline.getModelMetrics(testModel.id);

      expect(metrics).toMatchObject({
        accuracy: expect.any(Number),
        precision: expect.any(Number),
        recall: expect.any(Number),
        f1Score: expect.any(Number),
      });
    });
  });

  describe('Industry-Specific Models', () => {
    it('should create HIPAA-compliant healthcare model', async () => {
      const config = {
        name: 'Healthcare Diagnosis Model',
        useCase: 'diagnosis_support' as const,
        dataSource: 'healthcare_db',
      };

      const model = await industryModels.createHealthcareModel(config);

      expect(model).toMatchObject({
        name: 'Healthcare Diagnosis Model',
        industry: 'healthcare',
        compliance: {
          hipaa: true,
          gdpr: true,
        },
      });
    });

    it('should create SOX-compliant financial model', async () => {
      const config = {
        name: 'Fraud Detection Model',
        useCase: 'fraud_detection' as const,
        dataSource: 'financial_db',
      };

      const model = await industryModels.createFinancialModel(config);

      expect(model).toMatchObject({
        name: 'Fraud Detection Model',
        industry: 'finance',
        compliance: {
          sox: true,
          pci: true,
        },
      });
    });

    it('should create legal compliance model', async () => {
      const config = {
        name: 'Contract Analysis Model',
        useCase: 'contract_analysis' as const,
        dataSource: 'legal_db',
      };

      const model = await industryModels.createLegalModel(config);

      expect(model).toMatchObject({
        name: 'Contract Analysis Model',
        industry: 'legal',
        type: 'nlp',
      });
    });

    it('should create e-commerce model', async () => {
      const config = {
        name: 'Product Recommendation Model',
        useCase: 'recommendation' as const,
        dataSource: 'ecommerce_db',
      };

      const model = await industryModels.createEcommerceModel(config);

      expect(model).toMatchObject({
        name: 'Product Recommendation Model',
        industry: 'ecommerce',
        compliance: {
          gdpr: true,
          pci: true,
        },
      });
    });

    it('should validate compliance requirements', async () => {
      // Create a healthcare model first
      const healthcareModel = await industryModels.createHealthcareModel({
        name: 'Test Healthcare Model',
        useCase: 'diagnosis_support',
        dataSource: 'test_db',
      });

      const validation = await industryModels.validateCompliance(healthcareModel.id);

      expect(validation).toMatchObject({
        hipaa: {
          phiHandling: expect.any(Boolean),
          encryption: expect.any(Boolean),
          auditLogging: expect.any(Boolean),
          accessControls: expect.any(Boolean),
        },
        gdpr: {
          dataMinimization: expect.any(Boolean),
          consentManagement: expect.any(Boolean),
          rightToErasure: expect.any(Boolean),
          dataPortability: expect.any(Boolean),
        },
      });
    });
  });

  describe('Predictive Analytics', () => {
    it('should predict customer churn', async () => {
      const customerId = 'test_customer_123';

      const prediction = await predictiveAnalytics.predictChurn(customerId);

      expect(prediction).toMatchObject({
        customerId,
        churnProbability: expect.any(Number),
        riskLevel: expect.stringMatching(/^(low|medium|high|critical)$/),
        contributingFactors: expect.any(Array),
        recommendedActions: expect.any(Array),
        timeframe: {
          predictedChurnDate: expect.any(Date),
          confidenceInterval: {
            lower: expect.any(Date),
            upper: expect.any(Date),
          },
        },
      });

      expect(prediction.churnProbability).toBeGreaterThanOrEqual(0);
      expect(prediction.churnProbability).toBeLessThanOrEqual(1);
    });

    it('should generate demand forecast', async () => {
      const productId = 'test_product_456';
      const period = 'weekly';
      const horizon = 12;

      const forecast = await predictiveAnalytics.forecastDemand(productId, period, horizon);

      expect(forecast).toMatchObject({
        productId,
        period,
        forecast: expect.any(Array),
        accuracy: {
          mape: expect.any(Number),
          rmse: expect.any(Number),
          mae: expect.any(Number),
        },
        influencingFactors: expect.any(Array),
      });
    });

    it('should calculate customer lifetime value', async () => {
      const customerId = 'test_customer_789';

      const clv = await predictiveAnalytics.calculateCustomerLifetimeValue(customerId);

      expect(clv).toMatchObject({
        customerId,
        currentValue: expect.any(Number),
        predictedValue: expect.any(Number),
        valueSegment: expect.stringMatching(/^(low|medium|high|premium)$/),
        growthPotential: expect.any(Number),
        retentionProbability: expect.any(Number),
        recommendedInvestment: expect.any(Number),
        paybackPeriod: expect.any(Number),
        riskFactors: expect.any(Array),
        opportunities: expect.any(Array),
      });

      expect(clv.currentValue).toBeGreaterThan(0);
      expect(clv.predictedValue).toBeGreaterThan(0);
      expect(clv.retentionProbability).toBeGreaterThanOrEqual(0);
      expect(clv.retentionProbability).toBeLessThanOrEqual(1);
    });

    it('should analyze sentiment trends', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-07');
      const granularity = 'daily';

      const trends = await predictiveAnalytics.analyzeSentimentTrends(startDate, endDate, granularity);

      expect(trends).toEqual(expect.any(Array));
      
      if (trends.length > 0) {
        expect(trends[0]).toMatchObject({
          period: expect.any(Date),
          overallSentiment: expect.any(Number),
          sentimentDistribution: {
            positive: expect.any(Number),
            neutral: expect.any(Number),
            negative: expect.any(Number),
          },
          topicSentiments: expect.any(Array),
          alerts: expect.any(Array),
        });

        expect(trends[0].overallSentiment).toBeGreaterThanOrEqual(-1);
        expect(trends[0].overallSentiment).toBeLessThanOrEqual(1);
      }
    });

    it('should generate business insights', async () => {
      const insights = await predictiveAnalytics.generateBusinessInsights();

      expect(insights).toEqual(expect.any(Array));

      if (insights.length > 0) {
        expect(insights[0]).toMatchObject({
          id: expect.any(String),
          type: expect.stringMatching(/^(opportunity|risk|trend|anomaly)$/),
          title: expect.any(String),
          description: expect.any(String),
          confidence: expect.any(Number),
          impact: {
            revenue: expect.any(Number),
            cost: expect.any(Number),
            customers: expect.any(Number),
            timeframe: expect.any(String),
          },
          evidence: expect.any(Array),
          recommendations: expect.any(Array),
          createdAt: expect.any(Date),
          expiresAt: expect.any(Date),
        });

        expect(insights[0].confidence).toBeGreaterThanOrEqual(0);
        expect(insights[0].confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid model configuration', async () => {
      const invalidConfig = {
        name: '',
        type: 'invalid_type' as any,
        industry: 'invalid_industry' as any,
        architecture: {},
        trainingData: {},
      };

      await expect(mlPipeline.createModel(invalidConfig)).rejects.toThrow();
    });

    it('should handle prediction on non-deployed model', async () => {
      const nonDeployedModel = await mlPipeline.createModel({
        name: 'Non-deployed Model',
        type: 'classification',
        industry: 'general',
        architecture: {
          layers: [{ type: 'dense', units: 10, activation: 'relu' }],
          optimizer: 'adam',
          loss: 'categoricalCrossentropy',
          metrics: ['accuracy'],
        },
        trainingData: {
          size: 100,
          features: ['feature1'],
          labels: ['label1'],
          source: 'test',
        },
      });

      await expect(
        mlPipeline.predict(nonDeployedModel.id, { feature1: 0.5 })
      ).rejects.toThrow('Model not deployed');
    });

    it('should handle training with invalid dataset', async () => {
      const model = await mlPipeline.createModel({
        name: 'Test Model',
        type: 'classification',
        industry: 'general',
        architecture: {
          layers: [{ type: 'dense', units: 10, activation: 'relu' }],
          optimizer: 'adam',
          loss: 'categoricalCrossentropy',
          metrics: ['accuracy'],
        },
        trainingData: {
          size: 100,
          features: ['feature1'],
          labels: ['label1'],
          source: 'test',
        },
      });

      await expect(
        mlPipeline.trainModel(model.id, 'invalid_dataset_id', {
          epochs: 10,
          batchSize: 32,
          learningRate: 0.001,
          validationSplit: 0.2,
          earlyStopping: true,
        })
      ).rejects.toThrow('Dataset not found');
    });

    it('should handle churn prediction for non-existent customer', async () => {
      await expect(
        predictiveAnalytics.predictChurn('non_existent_customer')
      ).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent predictions', async () => {
      // Create and deploy a test model
      const model = await mlPipeline.createModel({
        name: 'Performance Test Model',
        type: 'classification',
        industry: 'general',
        architecture: {
          layers: [
            { type: 'dense', units: 32, activation: 'relu' },
            { type: 'dense', units: 2, activation: 'softmax' },
          ],
          optimizer: 'adam',
          loss: 'categoricalCrossentropy',
          metrics: ['accuracy'],
        },
        trainingData: {
          size: 1000,
          features: ['feature1', 'feature2'],
          labels: ['class1', 'class2'],
          source: 'test',
        },
      });

      await mlPipeline['updateModelStatus'](model.id, 'deployed');

      const concurrentPredictions = 10;
      const predictions = [];

      for (let i = 0; i < concurrentPredictions; i++) {
        predictions.push(
          mlPipeline.predict(model.id, {
            feature1: Math.random(),
            feature2: Math.random(),
          })
        );
      }

      const results = await Promise.all(predictions);

      expect(results).toHaveLength(concurrentPredictions);
      results.forEach(result => {
        expect(result).toMatchObject({
          id: expect.any(String),
          modelId: model.id,
          output: {
            prediction: expect.any(Number),
            confidence: expect.any(Number),
          },
        });
      });
    }, 30000);

    it('should complete predictions within acceptable time limits', async () => {
      // Create and deploy a test model
      const model = await mlPipeline.createModel({
        name: 'Latency Test Model',
        type: 'classification',
        industry: 'general',
        architecture: {
          layers: [
            { type: 'dense', units: 16, activation: 'relu' },
            { type: 'dense', units: 2, activation: 'softmax' },
          ],
          optimizer: 'adam',
          loss: 'categoricalCrossentropy',
          metrics: ['accuracy'],
        },
        trainingData: {
          size: 500,
          features: ['feature1'],
          labels: ['class1', 'class2'],
          source: 'test',
        },
      });

      await mlPipeline['updateModelStatus'](model.id, 'deployed');

      const startTime = Date.now();
      
      await mlPipeline.predict(model.id, { feature1: 0.5 });
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Prediction should complete within 1 second
      expect(duration).toBeLessThan(1000);
    });
  });
});

describe('ML Pipeline Integration', () => {
  it('should integrate all ML services successfully', async () => {
    const mlPipeline = new MLPipelineService();
    const industryModels = new IndustryModelsService(mlPipeline);
    const predictiveAnalytics = new PredictiveAnalyticsService(mlPipeline);

    // Test that all services are properly initialized
    expect(mlPipeline).toBeInstanceOf(MLPipelineService);
    expect(industryModels).toBeInstanceOf(IndustryModelsService);
    expect(predictiveAnalytics).toBeInstanceOf(PredictiveAnalyticsService);

    // Test end-to-end workflow
    const model = await industryModels.createEcommerceModel({
      name: 'Integration Test Model',
      useCase: 'customer_segmentation',
      dataSource: 'integration_test_db',
    });

    expect(model).toMatchObject({
      name: 'Integration Test Model',
      industry: 'ecommerce',
      type: 'classification',
    });
  });
});
