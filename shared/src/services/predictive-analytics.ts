/**
 * Predictive Analytics Service
 * Provides machine learning-powered insights for business intelligence and forecasting
 */

import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { EventEmitter } from 'events';

export interface PredictiveModel {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  modelType: 'churn_prediction' | 'demand_forecasting' | 'sentiment_trending' | 'capacity_planning';
  algorithm: 'random_forest' | 'xgboost' | 'lstm' | 'arima' | 'prophet';
  features: string[];
  targetVariable: string;
  trainingDataQuery: string;
  predictionHorizon: number; // days
  retrainFrequency: 'daily' | 'weekly' | 'monthly';
  modelArtifactPath?: string;
  performanceMetrics: any;
  featureImportance: any;
  lastTrainedAt?: Date;
  nextRetrainAt?: Date;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Prediction {
  id: string;
  predictiveModelId: string;
  organizationId: string;
  predictionDate: Date;
  targetDate: Date;
  inputFeatures: any;
  predictionValue: any;
  confidenceScore?: number;
  predictionInterval?: any;
  actualValue?: any;
  accuracyScore?: number;
  createdAt: Date;
}

export interface BusinessInsight {
  type: 'trend' | 'anomaly' | 'forecast' | 'recommendation';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  data: any;
  actionable: boolean;
  recommendations?: string[];
  createdAt: Date;
}

export class PredictiveAnalyticsService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    super();
    this.logger = new Logger('PredictiveAnalyticsService');
    this.db = db;
  }

  /**
   * Create a new predictive model
   */
  async createPredictiveModel(
    organizationId: string,
    modelData: Partial<PredictiveModel>
  ): Promise<PredictiveModel> {
    try {
      const result = await this.db.query(`
        INSERT INTO predictive_models (
          organization_id, name, description, model_type, algorithm,
          features, target_variable, training_data_query, prediction_horizon,
          retrain_frequency, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        organizationId,
        modelData.name,
        modelData.description,
        modelData.modelType,
        modelData.algorithm,
        JSON.stringify(modelData.features || []),
        modelData.targetVariable,
        modelData.trainingDataQuery,
        modelData.predictionHorizon || 30,
        modelData.retrainFrequency || 'weekly',
        modelData.createdBy
      ]);

      const model = this.mapPredictiveModelFromDb(result.rows[0]);
      
      this.emit('model.created', model);
      this.logger.info(`Predictive model created: ${model.id}`, {
        organizationId,
        modelType: model.modelType,
        algorithm: model.algorithm
      });
      
      return model;
    } catch (error) {
      this.logger.error('Error creating predictive model:', error);
      throw new Error('Failed to create predictive model');
    }
  }

  /**
   * Train predictive model
   */
  async trainPredictiveModel(modelId: string): Promise<{ success: boolean; metrics: any }> {
    try {
      const model = await this.getPredictiveModel(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      this.logger.info(`Starting training for model: ${modelId}`);

      // Extract training data
      const trainingData = await this.extractTrainingData(model);
      
      // Train model based on algorithm
      const trainedModel = await this.trainModel(model, trainingData);
      
      // Calculate performance metrics
      const metrics = await this.evaluateModel(trainedModel, trainingData);
      
      // Update model with training results
      await this.db.query(`
        UPDATE predictive_models 
        SET performance_metrics = $1, feature_importance = $2, last_trained_at = NOW(),
            next_retrain_at = $3, model_artifact_path = $4
        WHERE id = $5
      `, [
        JSON.stringify(metrics),
        JSON.stringify(trainedModel.featureImportance),
        this.calculateNextRetrainDate(model.retrainFrequency),
        trainedModel.artifactPath,
        modelId
      ]);

      this.emit('model.trained', { modelId, metrics });
      this.logger.info(`Model trained successfully: ${modelId}`, { metrics });

      return { success: true, metrics };
    } catch (error) {
      this.logger.error('Error training predictive model:', error);
      throw new Error('Failed to train predictive model');
    }
  }

  /**
   * Generate predictions
   */
  async generatePredictions(
    modelId: string,
    inputFeatures?: any
  ): Promise<Prediction[]> {
    try {
      const model = await this.getPredictiveModel(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      if (!model.lastTrainedAt) {
        throw new Error('Model has not been trained yet');
      }

      // Generate predictions based on model type
      const predictions = await this.runPrediction(model, inputFeatures);
      
      // Store predictions in database
      const storedPredictions = await Promise.all(
        predictions.map(pred => this.storePrediction(pred))
      );

      this.emit('predictions.generated', { modelId, count: predictions.length });
      this.logger.info(`Generated ${predictions.length} predictions for model: ${modelId}`);

      return storedPredictions;
    } catch (error) {
      this.logger.error('Error generating predictions:', error);
      throw new Error('Failed to generate predictions');
    }
  }

  /**
   * Get business insights
   */
  async getBusinessInsights(
    organizationId: string,
    timeframe: 'day' | 'week' | 'month' | 'quarter' = 'week'
  ): Promise<BusinessInsight[]> {
    try {
      const insights: BusinessInsight[] = [];

      // Customer churn insights
      const churnInsights = await this.generateChurnInsights(organizationId, timeframe);
      insights.push(...churnInsights);

      // Volume forecasting insights
      const volumeInsights = await this.generateVolumeInsights(organizationId, timeframe);
      insights.push(...volumeInsights);

      // Sentiment trending insights
      const sentimentInsights = await this.generateSentimentInsights(organizationId, timeframe);
      insights.push(...sentimentInsights);

      // Capacity planning insights
      const capacityInsights = await this.generateCapacityInsights(organizationId, timeframe);
      insights.push(...capacityInsights);

      // Sort by severity and confidence
      insights.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.confidence - a.confidence;
      });

      this.logger.info(`Generated ${insights.length} business insights for organization: ${organizationId}`);
      return insights;
    } catch (error) {
      this.logger.error('Error getting business insights:', error);
      throw new Error('Failed to get business insights');
    }
  }

  /**
   * Get predictive model performance
   */
  async getModelPerformance(
    modelId: string,
    period: 'week' | 'month' | 'quarter' = 'month'
  ): Promise<any> {
    try {
      const model = await this.getPredictiveModel(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      const startDate = this.getStartDateForPeriod(period);
      
      // Get prediction accuracy over time
      const accuracyResult = await this.db.query(`
        SELECT 
          DATE_TRUNC('day', prediction_date) as date,
          AVG(accuracy_score) as avg_accuracy,
          COUNT(*) as prediction_count
        FROM predictions 
        WHERE predictive_model_id = $1 
          AND prediction_date >= $2
          AND accuracy_score IS NOT NULL
        GROUP BY DATE_TRUNC('day', prediction_date)
        ORDER BY date
      `, [modelId, startDate]);

      // Get feature importance trends
      const featureImportance = model.featureImportance || {};

      // Calculate overall performance metrics
      const overallMetrics = await this.db.query(`
        SELECT 
          AVG(accuracy_score) as avg_accuracy,
          AVG(confidence_score) as avg_confidence,
          COUNT(*) as total_predictions,
          COUNT(CASE WHEN accuracy_score >= 0.8 THEN 1 END) as high_accuracy_predictions
        FROM predictions 
        WHERE predictive_model_id = $1 AND prediction_date >= $2
      `, [modelId, startDate]);

      return {
        model: {
          id: model.id,
          name: model.name,
          type: model.modelType,
          algorithm: model.algorithm
        },
        performance: {
          overall: overallMetrics.rows[0],
          accuracy_over_time: accuracyResult.rows,
          feature_importance: featureImportance,
          last_trained: model.lastTrainedAt,
          next_retrain: model.nextRetrainAt
        }
      };
    } catch (error) {
      this.logger.error('Error getting model performance:', error);
      throw new Error('Failed to get model performance');
    }
  }

  /**
   * Private helper methods
   */
  private async getPredictiveModel(modelId: string): Promise<PredictiveModel | null> {
    const result = await this.db.query(
      'SELECT * FROM predictive_models WHERE id = $1',
      [modelId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapPredictiveModelFromDb(result.rows[0]);
  }

  private async extractTrainingData(model: PredictiveModel): Promise<any[]> {
    try {
      const result = await this.db.query(model.trainingDataQuery);
      return result.rows;
    } catch (error) {
      this.logger.error('Error extracting training data:', error);
      throw new Error('Failed to extract training data');
    }
  }

  private async trainModel(model: PredictiveModel, trainingData: any[]): Promise<any> {
    // This would integrate with your ML training infrastructure
    // For now, simulate training results
    
    const mockFeatureImportance: any = {};
    model.features.forEach((feature, index) => {
      mockFeatureImportance[feature] = Math.random() * 0.5 + 0.1; // Random importance between 0.1 and 0.6
    });

    return {
      featureImportance: mockFeatureImportance,
      artifactPath: `./models/${model.id}_${Date.now()}.pkl`
    };
  }

  private async evaluateModel(trainedModel: any, testData: any[]): Promise<any> {
    // This would run actual model evaluation
    // For now, return mock metrics
    return {
      accuracy: 0.85 + Math.random() * 0.1, // 0.85-0.95
      precision: 0.82 + Math.random() * 0.1,
      recall: 0.88 + Math.random() * 0.1,
      f1_score: 0.85 + Math.random() * 0.1,
      mae: Math.random() * 0.1, // Mean Absolute Error
      rmse: Math.random() * 0.15 // Root Mean Square Error
    };
  }

  private async runPrediction(model: PredictiveModel, inputFeatures?: any): Promise<any[]> {
    // This would run actual predictions using the trained model
    // For now, generate mock predictions
    
    const predictions = [];
    const now = new Date();
    
    for (let i = 1; i <= model.predictionHorizon; i++) {
      const targetDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      
      let predictionValue;
      switch (model.modelType) {
        case 'churn_prediction':
          predictionValue = { churn_probability: Math.random() * 0.3 }; // 0-30% churn probability
          break;
        case 'demand_forecasting':
          predictionValue = { predicted_volume: Math.floor(Math.random() * 1000) + 500 }; // 500-1500 messages
          break;
        case 'sentiment_trending':
          predictionValue = { sentiment_score: (Math.random() - 0.5) * 2 }; // -1 to 1
          break;
        case 'capacity_planning':
          predictionValue = { required_agents: Math.floor(Math.random() * 20) + 5 }; // 5-25 agents
          break;
        default:
          predictionValue = { value: Math.random() };
      }

      predictions.push({
        predictiveModelId: model.id,
        organizationId: model.organizationId,
        predictionDate: now,
        targetDate,
        inputFeatures: inputFeatures || {},
        predictionValue,
        confidenceScore: 0.7 + Math.random() * 0.25 // 0.7-0.95 confidence
      });
    }

    return predictions;
  }

  private async storePrediction(prediction: any): Promise<Prediction> {
    const result = await this.db.query(`
      INSERT INTO predictions (
        predictive_model_id, organization_id, prediction_date, target_date,
        input_features, prediction_value, confidence_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      prediction.predictiveModelId,
      prediction.organizationId,
      prediction.predictionDate,
      prediction.targetDate,
      JSON.stringify(prediction.inputFeatures),
      JSON.stringify(prediction.predictionValue),
      prediction.confidenceScore
    ]);

    return this.mapPredictionFromDb(result.rows[0]);
  }

  private async generateChurnInsights(organizationId: string, timeframe: string): Promise<BusinessInsight[]> {
    // Mock churn insights
    return [
      {
        type: 'forecast',
        title: 'Customer Churn Risk Increasing',
        description: 'Predicted 15% increase in customer churn over the next 30 days based on recent support interaction patterns.',
        severity: 'high',
        confidence: 0.87,
        data: { predicted_churn_rate: 0.15, current_churn_rate: 0.08 },
        actionable: true,
        recommendations: [
          'Implement proactive outreach to at-risk customers',
          'Review and improve response times for high-priority issues',
          'Consider offering retention incentives to customers with low satisfaction scores'
        ],
        createdAt: new Date()
      }
    ];
  }

  private async generateVolumeInsights(organizationId: string, timeframe: string): Promise<BusinessInsight[]> {
    return [
      {
        type: 'forecast',
        title: 'Message Volume Spike Expected',
        description: 'Forecasting 40% increase in support messages next week, likely due to upcoming product launch.',
        severity: 'medium',
        confidence: 0.92,
        data: { predicted_volume: 1400, current_volume: 1000 },
        actionable: true,
        recommendations: [
          'Schedule additional support staff for next week',
          'Prepare FAQ responses for common product launch questions',
          'Consider enabling auto-responses for routine inquiries'
        ],
        createdAt: new Date()
      }
    ];
  }

  private async generateSentimentInsights(organizationId: string, timeframe: string): Promise<BusinessInsight[]> {
    return [
      {
        type: 'trend',
        title: 'Customer Sentiment Declining',
        description: 'Average customer sentiment has decreased by 12% over the past week, primarily in billing-related conversations.',
        severity: 'medium',
        confidence: 0.78,
        data: { current_sentiment: -0.15, previous_sentiment: -0.03, category: 'billing' },
        actionable: true,
        recommendations: [
          'Review billing processes for potential issues',
          'Provide additional training to billing support team',
          'Consider implementing billing self-service options'
        ],
        createdAt: new Date()
      }
    ];
  }

  private async generateCapacityInsights(organizationId: string, timeframe: string): Promise<BusinessInsight[]> {
    return [
      {
        type: 'recommendation',
        title: 'Optimal Staffing Recommendation',
        description: 'Based on predicted volume and response time targets, recommend increasing staff by 2 agents during peak hours.',
        severity: 'low',
        confidence: 0.85,
        data: { current_staff: 8, recommended_staff: 10, peak_hours: '9AM-5PM' },
        actionable: true,
        recommendations: [
          'Hire 2 additional part-time agents for peak hours',
          'Consider implementing flexible scheduling',
          'Evaluate automation opportunities to reduce manual workload'
        ],
        createdAt: new Date()
      }
    ];
  }

  private calculateNextRetrainDate(frequency: string): Date {
    const now = new Date();
    switch (frequency) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  private getStartDateForPeriod(period: string): Date {
    const now = new Date();
    switch (period) {
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'quarter':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  private mapPredictiveModelFromDb(row: any): PredictiveModel {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      modelType: row.model_type,
      algorithm: row.algorithm,
      features: row.features,
      targetVariable: row.target_variable,
      trainingDataQuery: row.training_data_query,
      predictionHorizon: row.prediction_horizon,
      retrainFrequency: row.retrain_frequency,
      modelArtifactPath: row.model_artifact_path,
      performanceMetrics: row.performance_metrics,
      featureImportance: row.feature_importance,
      lastTrainedAt: row.last_trained_at,
      nextRetrainAt: row.next_retrain_at,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPredictionFromDb(row: any): Prediction {
    return {
      id: row.id,
      predictiveModelId: row.predictive_model_id,
      organizationId: row.organization_id,
      predictionDate: row.prediction_date,
      targetDate: row.target_date,
      inputFeatures: row.input_features,
      predictionValue: row.prediction_value,
      confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : undefined,
      predictionInterval: row.prediction_interval,
      actualValue: row.actual_value,
      accuracyScore: row.accuracy_score ? parseFloat(row.accuracy_score) : undefined,
      createdAt: row.created_at
    };
  }
}

export default PredictiveAnalyticsService;
