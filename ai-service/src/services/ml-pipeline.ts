/**
 * ML Pipeline Service
 * Handles machine learning model training, versioning, and deployment
 */

import { EventEmitter } from 'events';
import { Logger } from '@universal-ai-cs/shared';
import { DatabaseService } from '@universal-ai-cs/shared';
import { RedisService } from '@universal-ai-cs/shared';
import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import * as path from 'path';

export interface MLModel {
  id: string;
  name: string;
  version: string;
  type: 'classification' | 'regression' | 'clustering' | 'nlp' | 'sentiment' | 'churn_prediction';
  industry: 'healthcare' | 'finance' | 'legal' | 'ecommerce' | 'general';
  status: 'training' | 'trained' | 'deployed' | 'deprecated' | 'failed';
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  trainingData: {
    size: number;
    features: string[];
    labels: string[];
    source: string;
  };
  hyperparameters: Record<string, any>;
  architecture: {
    layers: Array<{
      type: string;
      units?: number;
      activation?: string;
      dropout?: number;
    }>;
    optimizer: string;
    loss: string;
    metrics: string[];
  };
  compliance: {
    hipaa: boolean;
    sox: boolean;
    gdpr: boolean;
    pci: boolean;
  };
  metadata: {
    createdAt: Date;
    trainedAt?: Date;
    deployedAt?: Date;
    trainingDuration?: number;
    modelSize: number;
    description: string;
    tags: string[];
  };
}

export interface TrainingJob {
  id: string;
  modelId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  config: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    validationSplit: number;
    earlyStopping: boolean;
  };
  metrics: {
    loss: number[];
    accuracy: number[];
    valLoss: number[];
    valAccuracy: number[];
  };
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'warning' | 'error';
    message: string;
  }>;
  error?: string;
}

export interface Dataset {
  id: string;
  name: string;
  type: 'training' | 'validation' | 'test';
  size: number;
  features: Array<{
    name: string;
    type: 'categorical' | 'numerical' | 'text' | 'boolean';
    nullable: boolean;
    description: string;
  }>;
  labels: Array<{
    name: string;
    type: 'categorical' | 'numerical' | 'binary';
    classes?: string[];
  }>;
  source: {
    type: 'database' | 'file' | 'api' | 'stream';
    location: string;
    format: 'csv' | 'json' | 'parquet' | 'sql';
  };
  preprocessing: {
    normalization: boolean;
    encoding: 'one_hot' | 'label' | 'target';
    featureSelection: boolean;
    outlierRemoval: boolean;
  };
  compliance: {
    anonymized: boolean;
    encrypted: boolean;
    retention: number; // days
    jurisdiction: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelPrediction {
  id: string;
  modelId: string;
  input: Record<string, any>;
  output: {
    prediction: any;
    confidence: number;
    probabilities?: Record<string, number>;
    explanation?: Array<{
      feature: string;
      importance: number;
      value: any;
    }>;
  };
  metadata: {
    timestamp: Date;
    processingTime: number;
    version: string;
    userId?: string;
    organizationId?: string;
  };
}

export class MLPipelineService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;
  private redis: RedisService;
  private models: Map<string, tf.LayersModel> = new Map();
  private trainingJobs: Map<string, TrainingJob> = new Map();
  private datasets: Map<string, Dataset> = new Map();

  constructor() {
    super();
    this.logger = new Logger('MLPipelineService');
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();

    this.initializeModels();
  }

  /**
   * Create a new ML model
   */
  public async createModel(modelConfig: Partial<MLModel>): Promise<MLModel> {
    try {
      const model: MLModel = {
        id: `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: modelConfig.name!,
        version: '1.0.0',
        type: modelConfig.type!,
        industry: modelConfig.industry || 'general',
        status: 'training',
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        trainingData: modelConfig.trainingData!,
        hyperparameters: modelConfig.hyperparameters || {},
        architecture: modelConfig.architecture!,
        compliance: modelConfig.compliance || {
          hipaa: false,
          sox: false,
          gdpr: true,
          pci: false,
        },
        metadata: {
          createdAt: new Date(),
          modelSize: 0,
          description: modelConfig.metadata?.description || '',
          tags: modelConfig.metadata?.tags || [],
        },
      };

      // Save to database
      await this.db.query(`
        INSERT INTO ml_models (
          id, name, version, type, industry, status, accuracy, precision, recall, f1_score,
          training_data, hyperparameters, architecture, compliance, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        model.id, model.name, model.version, model.type, model.industry, model.status,
        model.accuracy, model.precision, model.recall, model.f1Score,
        JSON.stringify(model.trainingData), JSON.stringify(model.hyperparameters),
        JSON.stringify(model.architecture), JSON.stringify(model.compliance),
        JSON.stringify(model.metadata), model.metadata.createdAt
      ]);

      this.emit('model.created', model);

      this.logger.info('ML model created', {
        modelId: model.id,
        name: model.name,
        type: model.type,
        industry: model.industry,
      });

      return model;
    } catch (error) {
      this.logger.error('Error creating ML model', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start training a model
   */
  public async trainModel(
    modelId: string,
    datasetId: string,
    config: TrainingJob['config']
  ): Promise<TrainingJob> {
    try {
      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }

      const dataset = await this.getDataset(datasetId);
      if (!dataset) {
        throw new Error(`Dataset not found: ${datasetId}`);
      }

      const job: TrainingJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        modelId,
        status: 'queued',
        progress: 0,
        config,
        metrics: {
          loss: [],
          accuracy: [],
          valLoss: [],
          valAccuracy: [],
        },
        logs: [],
      };

      this.trainingJobs.set(job.id, job);

      // Start training asynchronously
      this.executeTraining(job, model, dataset);

      this.emit('training.started', job);

      this.logger.info('Model training started', {
        jobId: job.id,
        modelId,
        datasetId,
      });

      return job;
    } catch (error) {
      this.logger.error('Error starting model training', {
        modelId,
        datasetId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Deploy a trained model
   */
  public async deployModel(modelId: string, version?: string): Promise<void> {
    try {
      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }

      if (model.status !== 'trained') {
        throw new Error(`Model must be trained before deployment: ${modelId}`);
      }

      // Load the trained model
      const modelPath = this.getModelPath(modelId, version || model.version);
      const tfModel = await tf.loadLayersModel(`file://${modelPath}`);

      // Store in memory for fast inference
      this.models.set(modelId, tfModel);

      // Update model status
      await this.updateModelStatus(modelId, 'deployed');

      this.emit('model.deployed', { modelId, version: version || model.version });

      this.logger.info('Model deployed successfully', {
        modelId,
        version: version || model.version,
      });
    } catch (error) {
      this.logger.error('Error deploying model', {
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Make prediction using deployed model
   */
  public async predict(
    modelId: string,
    input: Record<string, any>,
    options: {
      explainable?: boolean;
      userId?: string;
      organizationId?: string;
    } = {}
  ): Promise<ModelPrediction> {
    try {
      const startTime = Date.now();

      const model = this.models.get(modelId);
      if (!model) {
        throw new Error(`Model not deployed: ${modelId}`);
      }

      const modelInfo = await this.getModel(modelId);
      if (!modelInfo) {
        throw new Error(`Model info not found: ${modelId}`);
      }

      // Preprocess input
      const processedInput = await this.preprocessInput(input, modelInfo);

      // Make prediction
      const prediction = model.predict(processedInput) as tf.Tensor;
      const predictionData = await prediction.data();
      const predictionArray = Array.from(predictionData);

      // Post-process output
      const output = await this.postprocessOutput(predictionArray, modelInfo);

      // Generate explanation if requested
      let explanation;
      if (options.explainable) {
        explanation = await this.generateExplanation(input, output, modelInfo);
      }

      const result: ModelPrediction = {
        id: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        modelId,
        input,
        output: {
          prediction: output.prediction,
          confidence: output.confidence,
          probabilities: output.probabilities,
          explanation,
        },
        metadata: {
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          version: modelInfo.version,
          userId: options.userId,
          organizationId: options.organizationId,
        },
      };

      // Store prediction for analytics
      await this.storePrediction(result);

      this.emit('prediction.made', result);

      return result;
    } catch (error) {
      this.logger.error('Error making prediction', {
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create dataset for training
   */
  public async createDataset(datasetConfig: Partial<Dataset>): Promise<Dataset> {
    try {
      const dataset: Dataset = {
        id: `dataset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: datasetConfig.name!,
        type: datasetConfig.type || 'training',
        size: datasetConfig.size || 0,
        features: datasetConfig.features || [],
        labels: datasetConfig.labels || [],
        source: datasetConfig.source!,
        preprocessing: datasetConfig.preprocessing || {
          normalization: true,
          encoding: 'one_hot',
          featureSelection: false,
          outlierRemoval: false,
        },
        compliance: datasetConfig.compliance || {
          anonymized: true,
          encrypted: true,
          retention: 365,
          jurisdiction: 'US',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.datasets.set(dataset.id, dataset);

      // Save to database
      await this.db.query(`
        INSERT INTO ml_datasets (
          id, name, type, size, features, labels, source, preprocessing,
          compliance, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        dataset.id, dataset.name, dataset.type, dataset.size,
        JSON.stringify(dataset.features), JSON.stringify(dataset.labels),
        JSON.stringify(dataset.source), JSON.stringify(dataset.preprocessing),
        JSON.stringify(dataset.compliance), dataset.createdAt, dataset.updatedAt
      ]);

      this.emit('dataset.created', dataset);

      this.logger.info('Dataset created', {
        datasetId: dataset.id,
        name: dataset.name,
        type: dataset.type,
        size: dataset.size,
      });

      return dataset;
    } catch (error) {
      this.logger.error('Error creating dataset', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get model performance metrics
   */
  public async getModelMetrics(modelId: string): Promise<{
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    confusionMatrix?: number[][];
    rocCurve?: Array<{ fpr: number; tpr: number }>;
    featureImportance?: Array<{ feature: string; importance: number }>;
  }> {
    try {
      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }

      // Get metrics from database
      const result = await this.db.query(`
        SELECT metrics FROM ml_model_metrics WHERE model_id = $1 ORDER BY created_at DESC LIMIT 1
      `, [modelId]);

      if (result.rows.length === 0) {
        return {
          accuracy: model.accuracy,
          precision: model.precision,
          recall: model.recall,
          f1Score: model.f1Score,
        };
      }

      return JSON.parse(result.rows[0].metrics);
    } catch (error) {
      this.logger.error('Error getting model metrics', {
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async initializeModels(): Promise<void> {
    try {
      // Load deployed models from database
      const result = await this.db.query(`
        SELECT id, version FROM ml_models WHERE status = 'deployed'
      `);

      for (const row of result.rows) {
        try {
          const modelPath = this.getModelPath(row.id, row.version);
          if (fs.existsSync(modelPath)) {
            const model = await tf.loadLayersModel(`file://${modelPath}`);
            this.models.set(row.id, model);
            this.logger.info('Model loaded', { modelId: row.id });
          }
        } catch (error) {
          this.logger.warn('Failed to load model', {
            modelId: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      this.logger.error('Error initializing models', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeTraining(job: TrainingJob, model: MLModel, dataset: Dataset): Promise<void> {
    try {
      job.status = 'running';
      job.startTime = new Date();
      job.progress = 0;

      this.addTrainingLog(job, 'info', 'Starting model training');

      // Load and preprocess data
      const { trainData, validationData } = await this.loadTrainingData(dataset);

      // Build TensorFlow model
      const tfModel = await this.buildTensorFlowModel(model.architecture);

      // Configure training
      tfModel.compile({
        optimizer: model.architecture.optimizer,
        loss: model.architecture.loss,
        metrics: model.architecture.metrics,
      });

      // Train model with callbacks
      const history = await tfModel.fit(trainData.xs, trainData.ys, {
        epochs: job.config.epochs,
        batchSize: job.config.batchSize,
        validationData: validationData ? [validationData.xs, validationData.ys] : undefined,
        validationSplit: validationData ? undefined : job.config.validationSplit,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            job.progress = ((epoch + 1) / job.config.epochs) * 100;
            job.metrics.loss.push(logs?.loss || 0);
            job.metrics.accuracy.push(logs?.acc || 0);
            if (logs?.val_loss) job.metrics.valLoss.push(logs.val_loss);
            if (logs?.val_acc) job.metrics.valAccuracy.push(logs.val_acc);

            this.addTrainingLog(job, 'info', `Epoch ${epoch + 1}/${job.config.epochs} - Loss: ${logs?.loss?.toFixed(4)}, Accuracy: ${logs?.acc?.toFixed(4)}`);
          },
        },
      });

      // Save trained model
      const modelPath = this.getModelPath(model.id, model.version);
      await tfModel.save(`file://${modelPath}`);

      // Update model metrics
      const finalAccuracy = job.metrics.accuracy[job.metrics.accuracy.length - 1];
      await this.updateModelMetrics(model.id, {
        accuracy: finalAccuracy,
        precision: finalAccuracy, // Simplified for demo
        recall: finalAccuracy,
        f1Score: finalAccuracy,
      });

      // Complete training
      job.status = 'completed';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime!.getTime();
      job.progress = 100;

      await this.updateModelStatus(model.id, 'trained');

      this.addTrainingLog(job, 'info', 'Model training completed successfully');
      this.emit('training.completed', job);

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error instanceof Error ? error.message : String(error);

      this.addTrainingLog(job, 'error', `Training failed: ${job.error}`);
      this.emit('training.failed', job);

      this.logger.error('Model training failed', {
        jobId: job.id,
        modelId: job.modelId,
        error: job.error,
      });
    }
  }

  private async getModel(modelId: string): Promise<MLModel | null> {
    try {
      const result = await this.db.query(`
        SELECT * FROM ml_models WHERE id = $1
      `, [modelId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        version: row.version,
        type: row.type,
        industry: row.industry,
        status: row.status,
        accuracy: parseFloat(row.accuracy),
        precision: parseFloat(row.precision),
        recall: parseFloat(row.recall),
        f1Score: parseFloat(row.f1_score),
        trainingData: JSON.parse(row.training_data),
        hyperparameters: JSON.parse(row.hyperparameters),
        architecture: JSON.parse(row.architecture),
        compliance: JSON.parse(row.compliance),
        metadata: JSON.parse(row.metadata),
      };
    } catch (error) {
      this.logger.error('Error getting model', {
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async getDataset(datasetId: string): Promise<Dataset | null> {
    return this.datasets.get(datasetId) || null;
  }

  private getModelPath(modelId: string, version: string): string {
    return path.join(process.cwd(), 'models', modelId, version);
  }

  private async updateModelStatus(modelId: string, status: MLModel['status']): Promise<void> {
    await this.db.query(`
      UPDATE ml_models SET status = $1, updated_at = NOW() WHERE id = $2
    `, [status, modelId]);
  }

  private async updateModelMetrics(modelId: string, metrics: Partial<MLModel>): Promise<void> {
    await this.db.query(`
      UPDATE ml_models 
      SET accuracy = $1, precision = $2, recall = $3, f1_score = $4, updated_at = NOW()
      WHERE id = $5
    `, [metrics.accuracy, metrics.precision, metrics.recall, metrics.f1Score, modelId]);
  }

  private addTrainingLog(job: TrainingJob, level: 'info' | 'warning' | 'error', message: string): void {
    job.logs.push({
      timestamp: new Date(),
      level,
      message,
    });
  }

  private async preprocessInput(input: Record<string, any>, model: MLModel): Promise<tf.Tensor> {
    // Simplified preprocessing - in production, this would be more sophisticated
    const values = Object.values(input).map(v => typeof v === 'number' ? v : 0);
    return tf.tensor2d([values]);
  }

  private async postprocessOutput(prediction: number[], model: MLModel): Promise<{
    prediction: any;
    confidence: number;
    probabilities?: Record<string, number>;
  }> {
    // Simplified postprocessing
    if (model.type === 'classification') {
      const maxIndex = prediction.indexOf(Math.max(...prediction));
      return {
        prediction: maxIndex,
        confidence: prediction[maxIndex],
        probabilities: prediction.reduce((acc, prob, idx) => {
          acc[`class_${idx}`] = prob;
          return acc;
        }, {} as Record<string, number>),
      };
    }

    return {
      prediction: prediction[0],
      confidence: Math.min(prediction[0], 1.0),
    };
  }

  private async generateExplanation(
    input: Record<string, any>,
    output: any,
    model: MLModel
  ): Promise<Array<{ feature: string; importance: number; value: any }>> {
    // Simplified explanation - in production, use SHAP or LIME
    return Object.entries(input).map(([feature, value]) => ({
      feature,
      importance: Math.random(),
      value,
    }));
  }

  private async storePrediction(prediction: ModelPrediction): Promise<void> {
    await this.db.query(`
      INSERT INTO ml_predictions (
        id, model_id, input, output, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      prediction.id,
      prediction.modelId,
      JSON.stringify(prediction.input),
      JSON.stringify(prediction.output),
      JSON.stringify(prediction.metadata),
      prediction.metadata.timestamp,
    ]);
  }

  private async loadTrainingData(dataset: Dataset): Promise<{
    trainData: { xs: tf.Tensor; ys: tf.Tensor };
    validationData?: { xs: tf.Tensor; ys: tf.Tensor };
  }> {
    // Simplified data loading - in production, this would load from actual sources
    const mockData = Array.from({ length: 1000 }, () => 
      Array.from({ length: 10 }, () => Math.random())
    );
    const mockLabels = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 2));

    return {
      trainData: {
        xs: tf.tensor2d(mockData),
        ys: tf.tensor2d(mockLabels.map(l => [l])),
      },
    };
  }

  private async buildTensorFlowModel(architecture: MLModel['architecture']): Promise<tf.LayersModel> {
    const model = tf.sequential();

    for (const layer of architecture.layers) {
      switch (layer.type) {
        case 'dense':
          model.add(tf.layers.dense({
            units: layer.units || 64,
            activation: layer.activation || 'relu',
          }));
          break;
        case 'dropout':
          model.add(tf.layers.dropout({ rate: layer.dropout || 0.2 }));
          break;
      }
    }

    return model;
  }
}

export default MLPipelineService;
