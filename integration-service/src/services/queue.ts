/**
 * Queue service for Integration Service
 * Handles message processing, webhook events, and background tasks
 */

import Bull, { Queue, Job, JobOptions } from 'bull';
import Redis from 'ioredis';
import { config } from '../config';
import { logger, queueLogger, logQueueJob } from '../utils/logger';

// Job types
export enum JobType {
  PROCESS_MESSAGE = 'process_message',
  SYNC_INTEGRATION = 'sync_integration',
  SEND_EMAIL = 'send_email',
  WEBHOOK_EVENT = 'webhook_event',
  RETRY_FAILED_OPERATION = 'retry_failed_operation',
  CLEANUP_OLD_DATA = 'cleanup_old_data',
}

// Job data interfaces
export interface ProcessMessageJobData {
  integrationId: string;
  messageId: string;
  messageData: any;
  source: string;
  organizationId: string;
}

export interface SyncIntegrationJobData {
  integrationId: string;
  organizationId: string;
  syncType: 'full' | 'incremental';
  lastSyncAt?: Date;
}

export interface SendEmailJobData {
  integrationId: string;
  to: Array<{
    email: string;
    name?: string;
  }>;
  cc?: Array<{
    email: string;
    name?: string;
  }>;
  bcc?: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  organizationId: string;
}

export interface WebhookEventJobData {
  provider: string;
  event: string;
  payload: any;
  signature?: string;
  integrationId?: string;
  organizationId?: string;
}

// Queue configuration
const queueConfig = {
  redis: config.queue.redisUrl,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: config.queue.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  } as JobOptions,
};

export class QueueService {
  private static instance: QueueService;
  private queues: Map<string, Queue> = new Map();
  private redisClient: Redis;
  private isInitialized = false;

  private constructor() {
    this.redisClient = new Redis(queueConfig.redis);
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = QueueService.getInstance();
    await instance.init();
  }

  public static async close(): Promise<void> {
    const instance = QueueService.getInstance();
    await instance.close();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test Redis connection
      await this.redisClient.ping();
      queueLogger.info('Queue Redis client connected');

      // Initialize queues
      await this.initializeQueues();

      this.isInitialized = true;
      queueLogger.info('Queue service initialized successfully');
    } catch (error) {
      queueLogger.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  private async initializeQueues(): Promise<void> {
    // Message processing queue (high priority)
    const messageQueue = new Bull('message-processing', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 10,
      },
    });

    // Integration sync queue (medium priority)
    const syncQueue = new Bull('integration-sync', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 5,
      },
    });

    // Email sending queue (high priority)
    const emailQueue = new Bull('email-sending', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 8,
      },
    });

    // Webhook processing queue (high priority)
    const webhookQueue = new Bull('webhook-processing', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 9,
      },
    });

    // Background tasks queue (low priority)
    const backgroundQueue = new Bull('background-tasks', queueConfig.redis, {
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        priority: 1,
      },
    });

    // Store queues
    this.queues.set('message-processing', messageQueue);
    this.queues.set('integration-sync', syncQueue);
    this.queues.set('email-sending', emailQueue);
    this.queues.set('webhook-processing', webhookQueue);
    this.queues.set('background-tasks', backgroundQueue);

    // Set up event listeners for all queues
    this.queues.forEach((queue, name) => {
      this.setupQueueEventListeners(queue, name);
    });

    queueLogger.info(`Initialized ${this.queues.size} queues`);
  }

  private setupQueueEventListeners(queue: Queue, queueName: string): void {
    queue.on('completed', (job: Job) => {
      logQueueJob(job.name, job.id.toString(), 'completed', {
        queue: queueName,
        duration: Date.now() - job.processedOn!,
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
      queueLogger.warn(`Job stalled in queue ${queueName}`, {
        jobId: job.id,
        jobType: job.name,
        attempts: job.attemptsMade,
      });
    });

    queue.on('error', (error: Error) => {
      queueLogger.error(`Queue error in ${queueName}:`, error);
    });
  }

  // Add job to queue
  public async addJob<T = any>(
    queueName: string,
    jobType: JobType,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
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
  public async addMessageProcessingJob(data: ProcessMessageJobData, options?: JobOptions): Promise<Job> {
    return this.addJob('message-processing', JobType.PROCESS_MESSAGE, data, options);
  }

  public async addSyncJob(data: SyncIntegrationJobData, options?: JobOptions): Promise<Job> {
    return this.addJob('integration-sync', JobType.SYNC_INTEGRATION, data, options);
  }

  public async addEmailJob(data: SendEmailJobData, options?: JobOptions): Promise<Job> {
    return this.addJob('email-sending', JobType.SEND_EMAIL, data, options);
  }

  public async addWebhookJob(data: WebhookEventJobData, options?: JobOptions): Promise<Job> {
    return this.addJob('webhook-processing', JobType.WEBHOOK_EVENT, data, options);
  }

  public async addBackgroundJob<T = any>(jobType: JobType, data: T, options?: JobOptions): Promise<Job> {
    return this.addJob('background-tasks', jobType, data, options);
  }

  // Get queue statistics
  public async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
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

  // Get all queue statistics
  public async getAllQueueStats() {
    const stats: Record<string, any> = {};
    
    for (const [queueName] of this.queues) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return stats;
  }

  // Clean up old jobs
  public async cleanupJobs(queueName: string, grace: number = 24 * 60 * 60 * 1000): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    
    queueLogger.info(`Cleaned up old jobs in queue ${queueName}`, { grace });
  }

  // Pause/resume queues
  public async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    queueLogger.info(`Queue ${queueName} paused`);
  }

  public async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    queueLogger.info(`Queue ${queueName} resumed`);
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      await this.redisClient.ping();
      return true;
    } catch (error) {
      queueLogger.error('Queue health check failed:', error);
      return false;
    }
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

      // Close Redis client
      await this.redisClient.quit();

      this.isInitialized = false;
      queueLogger.info('Queue service closed successfully');
    } catch (error) {
      queueLogger.error('Error closing queue service:', error);
      throw error;
    }
  }

  // Get queue instance (for advanced operations)
  public getQueue(queueName: string): Queue | undefined {
    return this.queues.get(queueName);
  }

  // Get all queue names
  public getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }
}

// Export singleton instance
export const queueService = QueueService.getInstance();

export default QueueService;
