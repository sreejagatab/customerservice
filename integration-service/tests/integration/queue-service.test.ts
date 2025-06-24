/**
 * Queue Service Integration Tests
 */

import { QueueService, JobType } from '../../src/services/queue';

describe('QueueService Integration Tests', () => {
  let queueService: QueueService;

  beforeAll(async () => {
    queueService = QueueService.getInstance();
    await queueService.init();
  });

  afterAll(async () => {
    await queueService.close();
  });

  describe('Queue Operations', () => {
    test('should add and process message job', async () => {
      const jobData = {
        integrationId: 'test-integration',
        messageId: 'test-message',
        messageData: { subject: 'Test Message' },
        source: 'webhook',
        organizationId: 'test-org',
      };

      const job = await queueService.addMessageProcessingJob(jobData);
      
      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    test('should add sync job', async () => {
      const jobData = {
        integrationId: 'test-integration',
        organizationId: 'test-org',
        syncType: 'incremental' as const,
      };

      const job = await queueService.addSyncJob(jobData);
      
      expect(job).toBeDefined();
      expect(job.data.syncType).toBe('incremental');
    });

    test('should add email job', async () => {
      const jobData = {
        integrationId: 'test-integration',
        organizationId: 'test-org',
        to: [{ email: 'test@example.com', name: 'Test User' }],
        subject: 'Test Email',
        body: { text: 'Test email body' },
      };

      const job = await queueService.addEmailJob(jobData);
      
      expect(job).toBeDefined();
      expect(job.data.subject).toBe('Test Email');
    });

    test('should add webhook job', async () => {
      const jobData = {
        provider: 'gmail',
        event: 'message_received',
        payload: { messageId: 'test-message' },
      };

      const job = await queueService.addWebhookJob(jobData);
      
      expect(job).toBeDefined();
      expect(job.data.provider).toBe('gmail');
    });

    test('should add background job', async () => {
      const jobData = { cleanupType: 'old_logs' };

      const job = await queueService.addBackgroundJob(JobType.CLEANUP_OLD_DATA, jobData);
      
      expect(job).toBeDefined();
      expect(job.data).toEqual(jobData);
    });
  });

  describe('Queue Statistics', () => {
    test('should get queue statistics', async () => {
      const queueName = 'message-processing';
      const stats = await queueService.getQueueStats(queueName);
      
      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('delayed');
      
      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
    });

    test('should get all queue statistics', async () => {
      const allStats = await queueService.getAllQueueStats();
      
      expect(allStats).toHaveProperty('message-processing');
      expect(allStats).toHaveProperty('integration-sync');
      expect(allStats).toHaveProperty('email-sending');
      expect(allStats).toHaveProperty('webhook-processing');
      expect(allStats).toHaveProperty('background-tasks');
    });
  });

  describe('Queue Management', () => {
    test('should pause and resume queue', async () => {
      const queueName = 'background-tasks';
      
      await expect(queueService.pauseQueue(queueName)).resolves.not.toThrow();
      await expect(queueService.resumeQueue(queueName)).resolves.not.toThrow();
    });

    test('should cleanup old jobs', async () => {
      const queueName = 'message-processing';
      const grace = 1000; // 1 second
      
      await expect(queueService.cleanupJobs(queueName, grace)).resolves.not.toThrow();
    });

    test('should perform health check', async () => {
      const isHealthy = await queueService.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Queue Access', () => {
    test('should get queue instance', () => {
      const queue = queueService.getQueue('message-processing');
      expect(queue).toBeDefined();
    });

    test('should get all queue names', () => {
      const queueNames = queueService.getQueueNames();
      
      expect(Array.isArray(queueNames)).toBe(true);
      expect(queueNames).toContain('message-processing');
      expect(queueNames).toContain('integration-sync');
      expect(queueNames).toContain('email-sending');
      expect(queueNames).toContain('webhook-processing');
      expect(queueNames).toContain('background-tasks');
    });

    test('should return undefined for non-existent queue', () => {
      const queue = queueService.getQueue('non-existent-queue');
      expect(queue).toBeUndefined();
    });
  });

  describe('Job Priority and Options', () => {
    test('should add job with custom options', async () => {
      const jobData = {
        integrationId: 'test-integration',
        messageId: 'priority-message',
        messageData: { subject: 'Priority Message' },
        source: 'webhook',
        organizationId: 'test-org',
      };

      const options = {
        priority: 10,
        delay: 5000, // 5 seconds delay
        attempts: 5,
      };

      const job = await queueService.addMessageProcessingJob(jobData, options);
      
      expect(job).toBeDefined();
      expect(job.opts.priority).toBe(10);
      expect(job.opts.delay).toBe(5000);
      expect(job.opts.attempts).toBe(5);
    });

    test('should handle job with different priorities', async () => {
      const highPriorityJob = await queueService.addEmailJob(
        {
          integrationId: 'test-integration',
          organizationId: 'test-org',
          to: [{ email: 'urgent@example.com' }],
          subject: 'Urgent Email',
          body: { text: 'Urgent message' },
        },
        { priority: 10 }
      );

      const lowPriorityJob = await queueService.addEmailJob(
        {
          integrationId: 'test-integration',
          organizationId: 'test-org',
          to: [{ email: 'normal@example.com' }],
          subject: 'Normal Email',
          body: { text: 'Normal message' },
        },
        { priority: 1 }
      );

      expect(highPriorityJob.opts.priority).toBe(10);
      expect(lowPriorityJob.opts.priority).toBe(1);
    });
  });
});
