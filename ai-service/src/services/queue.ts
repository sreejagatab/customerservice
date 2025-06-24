/**
 * Queue service for AI Service
 * Handles AI processing jobs and communication with Integration Service
 */

import Bull, { Queue, Job, JobOptions } from 'bull';
import Redis from 'ioredis';
import { config } from '@/config';
import { logger, queueLogger, logQueueJob } from '@/utils/logger';
import { QueueError } from '@/utils/errors';

// Job types for AI processing
export enum AiJobType {
  CLASSIFY_MESSAGE = 'classify_message',
  GENERATE_RESPONSE = 'generate_response',
  ANALYZE_SENTIMENT = 'analyze_sentiment',
  EXTRACT_ENTITIES = 'extract_entities',
  DETECT_LANGUAGE = 'detect_language',
  TRANSLATE_TEXT = 'translate_text',
  SUMMARIZE_CONVERSATION = 'summarize_conversation',
  MODERATE_CONTENT = 'moderate_content',
  TRAIN_MODEL = 'train_model',
  EVALUATE_PERFORMANCE = 'evaluate_performance',
}

// Job data interfaces
export interface ClassifyMessageJobData {
  messageId: string;
  organizationId: string;
  integrationId: string;
  messageText: string;
  messageHtml?: string;
  context?: {
    conversationHistory?: Array<{
      role: 'customer' | 'agent';
      content: string;
      timestamp: Date;
    }>;
    customerInfo?: Record<string, any>;
    organizationContext?: Record<string, any>;
  };
  options?: {
    includeEntities?: boolean;
    includeSentiment?: boolean;
    includeTopics?: boolean;
    preferredProvider?: string;
    preferredModel?: string;
  };
}

export interface GenerateResponseJobData {
  messageId: string;
  organizationId: string;
  integrationId: string;
  messageText: string;
  classification?: Record<string, any>;
  conversationContext: {
    history: Array<{
      role: 'customer' | 'agent';
      content: string;
      timestamp: Date;
    }>;
    customerInfo?: Record<string, any>;
  };
  organizationContext: {
    businessInfo: Record<string, any>;
    policies: Record<string, any>;
    knowledgeBase?: string[];
  };
  options?: {
    tone?: 'professional' | 'friendly' | 'casual';
    length?: 'short' | 'medium' | 'long';
    includeReasoning?: boolean;
    preferredProvider?: string;
    preferredModel?: string;
  };
}

export interface AnalyzeSentimentJobData {
  messageId: string;
  organizationId: string;
  text: string;
  language?: string;
  options?: {
    includeEmotions?: boolean;
    preferredProvider?: string;
  };
}

export interface ExtractEntitiesJobData {
  messageId: string;
  organizationId: string;
  text: string;
  language?: string;
  options?: {
    entityTypes?: string[];
    preferredProvider?: string;
  };
}

export interface DetectLanguageJobData {
  messageId: string;
  organizationId: string;
  text: string;
  options?: {
    preferredProvider?: string;
  };
}

export interface TranslateTextJobData {
  messageId: string;
  organizationId: string;
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  options?: {
    preferredProvider?: string;
  };
}

export interface SummarizeConversationJobData {
  conversationId: string;
  organizationId: string;
  messages: Array<{
    role: 'customer' | 'agent';
    content: string;
    timestamp: Date;
  }>;
  options?: {
    maxLength?: number;
    includeKeyPoints?: boolean;
    preferredProvider?: string;
  };
}

export interface ModerateContentJobData {
  messageId: string;
  organizationId: string;
  text: string;
  options?: {
    categories?: string[];
    preferredProvider?: string;
  };
}

// Queue configuration
const queueConfig = {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: config.queue.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: config.queue.backoffDelay,
    },
  },
};

export class AiQueueService {
  private static instance: AiQueueService;
  private queues: Map<string, Queue> = new Map();
  private redisClient: Redis;
  private isInitialized = false;

  private constructor() {
    this.redisClient = new Redis(config.redis.url);
  }

  public static getInstance(): AiQueueService {
    if (!AiQueueService.instance) {
      AiQueueService.instance = new AiQueueService();
    }
    return AiQueueService.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = AiQueueService.getInstance();
    await instance.init();
  }

  public static async close(): Promise<void> {
    const instance = AiQueueService.getInstance();
    await instance.close();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.initializeQueues();
      this.setupQueueEventListeners();
      this.isInitialized = true;
      
      logger.info('AI Queue service initialized', {
        queues: Array.from(this.queues.keys()),
        concurrency: config.queue.concurrency,
      });
    } catch (error) {
      logger.error('Failed to initialize AI queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new QueueError('Failed to initialize queue service');
    }
  }

  private async initializeQueues(): Promise<void> {
    // AI Classification queue (high priority)
    const classificationQueue = new Bull('ai-classification', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 10,
      },
    });

    // AI Response Generation queue (high priority)
    const responseQueue = new Bull('ai-response-generation', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 9,
      },
    });

    // AI Analysis queue (medium priority)
    const analysisQueue = new Bull('ai-analysis', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 5,
      },
    });

    // AI Training queue (low priority)
    const trainingQueue = new Bull('ai-training', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 1,
      },
    });

    this.queues.set('ai-classification', classificationQueue);
    this.queues.set('ai-response-generation', responseQueue);
    this.queues.set('ai-analysis', analysisQueue);
    this.queues.set('ai-training', trainingQueue);
  }

  private setupQueueEventListeners(): void {
    this.queues.forEach((queue, queueName) => {
      queue.on('completed', (job: Job) => {
        logQueueJob(job.name, job.id.toString(), 'completed', {
          queue: queueName,
          duration: job.finishedOn! - job.processedOn!,
          attempts: job.attemptsMade,
        });
      });

      queue.on('failed', (job: Job, error: Error) => {
        logQueueJob(job.name, job.id.toString(), 'failed', {
          queue: queueName,
          error: error.message,
          attempts: job.attemptsMade,
          maxAttempts: job.opts.attempts,
        });
      });

      queue.on('stalled', (job: Job) => {
        queueLogger.warn('Job stalled', {
          queue: queueName,
          jobId: job.id,
          jobType: job.name,
        });
      });
    });
  }

  public async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Close all queues
      await Promise.all(
        Array.from(this.queues.values()).map(queue => queue.close())
      );

      // Close Redis connection
      await this.redisClient.quit();

      this.isInitialized = false;
      logger.info('AI Queue service closed');
    } catch (error) {
      logger.error('Error closing AI queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new QueueError('Failed to close queue service');
    }
  }

  // Add job to queue
  public async addJob<T = any>(
    queueName: string,
    jobType: AiJobType,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new QueueError(`Queue ${queueName} not found`);
    }

    const job = await queue.add(jobType, data, options);
    
    logQueueJob(jobType, job.id.toString(), 'started', {
      queue: queueName,
      priority: options?.priority,
      delay: options?.delay,
    });

    return job;
  }

  // Convenience methods for specific job types
  public async addClassificationJob(
    data: ClassifyMessageJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-classification', AiJobType.CLASSIFY_MESSAGE, data, options);
  }

  public async addResponseGenerationJob(
    data: GenerateResponseJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-response-generation', AiJobType.GENERATE_RESPONSE, data, options);
  }

  public async addSentimentAnalysisJob(
    data: AnalyzeSentimentJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-analysis', AiJobType.ANALYZE_SENTIMENT, data, options);
  }

  public async addEntityExtractionJob(
    data: ExtractEntitiesJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-analysis', AiJobType.EXTRACT_ENTITIES, data, options);
  }

  public async addLanguageDetectionJob(
    data: DetectLanguageJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-analysis', AiJobType.DETECT_LANGUAGE, data, options);
  }

  public async addTranslationJob(
    data: TranslateTextJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-analysis', AiJobType.TRANSLATE_TEXT, data, options);
  }

  public async addSummarizationJob(
    data: SummarizeConversationJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-analysis', AiJobType.SUMMARIZE_CONVERSATION, data, options);
  }

  public async addModerationJob(
    data: ModerateContentJobData,
    options?: JobOptions
  ): Promise<Job> {
    return this.addJob('ai-analysis', AiJobType.MODERATE_CONTENT, data, options);
  }

  // Queue management methods
  public async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new QueueError(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  public async getAllQueueStats() {
    const stats: Record<string, any> = {};
    
    for (const [queueName] of this.queues) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return stats;
  }

  public getQueues(): string[] {
    return Array.from(this.queues.keys());
  }
}

// Export singleton instance
export const aiQueueService = AiQueueService.getInstance();
export default AiQueueService;
