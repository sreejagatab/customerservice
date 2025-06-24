/**
 * Queue Worker Setup
 * Configures and starts queue processors for AI jobs
 */

import { AiQueueService, AiJobType } from '@/services/queue';
import { config } from '@/config';
import { logger, queueLogger } from '@/utils/logger';
import {
  processClassifyMessage,
  processGenerateResponse,
  processAnalyzeSentiment,
  processExtractEntities,
  processDetectLanguage,
  processTranslateText,
  processSummarizeConversation,
  processModerateContent,
} from '@/processors/ai-processors';

export class QueueWorker {
  private static instance: QueueWorker;
  private queueService: AiQueueService;
  private isStarted = false;

  private constructor() {
    this.queueService = AiQueueService.getInstance();
  }

  public static getInstance(): QueueWorker {
    if (!QueueWorker.instance) {
      QueueWorker.instance = new QueueWorker();
    }
    return QueueWorker.instance;
  }

  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    try {
      await this.setupProcessors();
      this.isStarted = true;
      
      logger.info('Queue worker started', {
        concurrency: config.queue.concurrency,
        maxAttempts: config.queue.maxAttempts,
      });
    } catch (error) {
      logger.error('Failed to start queue worker', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      // Close queue service (this will stop all processors)
      await AiQueueService.close();
      this.isStarted = false;
      
      logger.info('Queue worker stopped');
    } catch (error) {
      logger.error('Error stopping queue worker', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async setupProcessors(): Promise<void> {
    // Get queue instances
    const queues = this.queueService.getQueues();
    
    for (const queueName of queues) {
      await this.setupQueueProcessors(queueName);
    }
  }

  private async setupQueueProcessors(queueName: string): Promise<void> {
    const queue = (this.queueService as any).queues.get(queueName);
    if (!queue) {
      logger.warn('Queue not found', { queueName });
      return;
    }

    const concurrency = this.getConcurrencyForQueue(queueName);

    switch (queueName) {
      case 'ai-classification':
        queue.process(AiJobType.CLASSIFY_MESSAGE, concurrency, processClassifyMessage);
        break;

      case 'ai-response-generation':
        queue.process(AiJobType.GENERATE_RESPONSE, concurrency, processGenerateResponse);
        break;

      case 'ai-analysis':
        queue.process(AiJobType.ANALYZE_SENTIMENT, concurrency, processAnalyzeSentiment);
        queue.process(AiJobType.EXTRACT_ENTITIES, concurrency, processExtractEntities);
        queue.process(AiJobType.DETECT_LANGUAGE, concurrency, processDetectLanguage);
        queue.process(AiJobType.TRANSLATE_TEXT, concurrency, processTranslateText);
        queue.process(AiJobType.SUMMARIZE_CONVERSATION, concurrency, processSummarizeConversation);
        queue.process(AiJobType.MODERATE_CONTENT, concurrency, processModerateContent);
        break;

      case 'ai-training':
        // Training processors would be added here
        // queue.process(AiJobType.TRAIN_MODEL, 1, processTrainModel);
        // queue.process(AiJobType.EVALUATE_PERFORMANCE, 1, processEvaluatePerformance);
        break;

      default:
        logger.warn('Unknown queue name', { queueName });
    }

    // Setup error handlers
    this.setupQueueErrorHandlers(queue, queueName);

    logger.info('Queue processors setup', {
      queueName,
      concurrency,
    });
  }

  private setupQueueErrorHandlers(queue: any, queueName: string): void {
    queue.on('error', (error: Error) => {
      queueLogger.error('Queue error', {
        queueName,
        error: error.message,
        stack: error.stack,
      });
    });

    queue.on('waiting', (jobId: string) => {
      queueLogger.debug('Job waiting', {
        queueName,
        jobId,
      });
    });

    queue.on('active', (job: any) => {
      queueLogger.info('Job started', {
        queueName,
        jobId: job.id,
        jobType: job.name,
        attempts: job.attemptsMade,
      });
    });

    queue.on('completed', (job: any, result: any) => {
      queueLogger.info('Job completed', {
        queueName,
        jobId: job.id,
        jobType: job.name,
        attempts: job.attemptsMade,
        duration: job.finishedOn - job.processedOn,
      });
    });

    queue.on('failed', (job: any, error: Error) => {
      queueLogger.error('Job failed', {
        queueName,
        jobId: job.id,
        jobType: job.name,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        error: error.message,
        stack: error.stack,
      });
    });

    queue.on('stalled', (job: any) => {
      queueLogger.warn('Job stalled', {
        queueName,
        jobId: job.id,
        jobType: job.name,
        attempts: job.attemptsMade,
      });
    });

    queue.on('progress', (job: any, progress: number) => {
      queueLogger.debug('Job progress', {
        queueName,
        jobId: job.id,
        jobType: job.name,
        progress,
      });
    });
  }

  private getConcurrencyForQueue(queueName: string): number {
    // Different concurrency levels for different queue types
    const concurrencyMap: Record<string, number> = {
      'ai-classification': config.queue.concurrency,
      'ai-response-generation': Math.max(1, Math.floor(config.queue.concurrency * 0.8)),
      'ai-analysis': config.queue.concurrency,
      'ai-training': 1, // Training jobs should run sequentially
    };

    return concurrencyMap[queueName] || 1;
  }

  public getStatus(): {
    isStarted: boolean;
    queues: string[];
    concurrency: number;
  } {
    return {
      isStarted: this.isStarted,
      queues: this.queueService.getQueues(),
      concurrency: config.queue.concurrency,
    };
  }
}

// Export singleton instance
export const queueWorker = QueueWorker.getInstance();
export default QueueWorker;
