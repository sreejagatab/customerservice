/**
 * Worker service for processing queue jobs
 */

import { QueueService, JobType } from '../services/queue';
import { DatabaseService } from '../services/database';
import { IntegrationManager } from '../services/integration-manager';
import { processors } from '../processors';
import { logger, queueLogger } from '../utils/logger';
import { config } from '../config';

export class WorkerService {
  private static instance: WorkerService;
  private queueService: QueueService;
  private isRunning = false;

  private constructor() {
    this.queueService = QueueService.getInstance();
  }

  public static getInstance(): WorkerService {
    if (!WorkerService.instance) {
      WorkerService.instance = new WorkerService();
    }
    return WorkerService.instance;
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      // Initialize dependencies
      await DatabaseService.initialize();
      await QueueService.initialize();
      await IntegrationManager.initialize();

      // Set up job processors
      await this.setupProcessors();

      this.isRunning = true;
      queueLogger.info('Worker service started successfully');

    } catch (error) {
      queueLogger.error('Failed to start worker service:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Close all queue connections
      await QueueService.close();
      await DatabaseService.close();
      await IntegrationManager.close();

      this.isRunning = false;
      queueLogger.info('Worker service stopped successfully');

    } catch (error) {
      queueLogger.error('Error stopping worker service:', error);
      throw error;
    }
  }

  private async setupProcessors(): Promise<void> {
    const queueNames = this.queueService.getQueueNames();

    for (const queueName of queueNames) {
      const queue = this.queueService.getQueue(queueName);
      if (!queue) {
        continue;
      }

      // Set up processors based on queue name
      switch (queueName) {
        case 'message-processing':
          queue.process(
            JobType.PROCESS_MESSAGE,
            config.queue.concurrency,
            processors[JobType.PROCESS_MESSAGE]
          );
          break;

        case 'integration-sync':
          queue.process(
            JobType.SYNC_INTEGRATION,
            config.queue.concurrency,
            processors[JobType.SYNC_INTEGRATION]
          );
          break;

        case 'email-sending':
          queue.process(
            JobType.SEND_EMAIL,
            config.queue.concurrency,
            processors[JobType.SEND_EMAIL]
          );
          break;

        case 'webhook-processing':
          queue.process(
            JobType.WEBHOOK_EVENT,
            config.queue.concurrency,
            processors[JobType.WEBHOOK_EVENT]
          );
          break;

        case 'background-tasks':
          queue.process(
            JobType.CLEANUP_OLD_DATA,
            1, // Lower concurrency for background tasks
            processors[JobType.CLEANUP_OLD_DATA]
          );
          
          // Add retry failed operation processor
          queue.process(
            JobType.RETRY_FAILED_OPERATION,
            1,
            async (job) => {
              queueLogger.info('Retrying failed operation', {
                jobId: job.id,
                originalJobData: job.data,
              });
              
              // Implement retry logic based on job data
              // This is a placeholder for now
              return { retried: true };
            }
          );
          break;
      }

      queueLogger.info(`Set up processors for queue: ${queueName}`);
    }
  }

  public getStatus(): { isRunning: boolean; queues: string[] } {
    return {
      isRunning: this.isRunning,
      queues: this.queueService.getQueueNames(),
    };
  }
}

// Worker startup script
if (require.main === module) {
  const worker = WorkerService.getInstance();

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down worker gracefully...`);
    
    try {
      await worker.stop();
      logger.info('Worker shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during worker shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start the worker
  worker.start().catch((error) => {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  });
}

export default WorkerService;
