/**
 * Job processors for Integration Service queues
 */

import { Job } from 'bull';
import { logger, queueLogger, logQueueJob } from '../utils/logger';
import { integrationManager } from '../services/integration-manager';
import { integrationRepo } from '../services/database';
import { 
  ProcessMessageJobData, 
  SyncIntegrationJobData, 
  SendEmailJobData, 
  WebhookEventJobData,
  JobType 
} from '../services/queue';

// Message processing job processor
export const processMessageJob = async (job: Job<ProcessMessageJobData>): Promise<void> => {
  const { integrationId, messageId, messageData, source, organizationId } = job.data;
  
  logQueueJob(JobType.PROCESS_MESSAGE, job.id.toString(), 'started', {
    integrationId,
    messageId,
    source,
    organizationId,
  });

  try {
    // Get the integration connector
    const connector = integrationManager.getIntegration(integrationId);
    if (!connector) {
      throw new Error(`Integration ${integrationId} not found or not active`);
    }

    // Process the message based on source
    let result;
    switch (source) {
      case 'webhook':
        if (connector.processWebhook) {
          result = await connector.processWebhook(messageData);
        }
        break;
      
      case 'sync':
        // Message was fetched during sync, just log it
        logger.info('Message processed from sync', {
          integrationId,
          messageId,
          subject: messageData.subject,
        });
        result = { processed: true };
        break;
      
      default:
        throw new Error(`Unknown message source: ${source}`);
    }

    // Update job progress
    await job.progress(100);

    logQueueJob(JobType.PROCESS_MESSAGE, job.id.toString(), 'completed', {
      integrationId,
      messageId,
      result,
    });

  } catch (error: any) {
    logger.error('Message processing job failed:', {
      integrationId,
      messageId,
      error: error.message,
      jobId: job.id,
    });

    // Update integration error count
    try {
      await integrationRepo.updateSyncStatus(
        integrationId,
        organizationId,
        'error',
        undefined,
        undefined,
        error.message
      );
    } catch (dbError) {
      logger.error('Failed to update integration error status:', dbError);
    }

    throw error;
  }
};

// Integration sync job processor
export const syncIntegrationJob = async (job: Job<SyncIntegrationJobData>): Promise<void> => {
  const { integrationId, organizationId, syncType, lastSyncAt } = job.data;
  
  logQueueJob(JobType.SYNC_INTEGRATION, job.id.toString(), 'started', {
    integrationId,
    syncType,
    organizationId,
  });

  try {
    // Get the integration connector
    const connector = integrationManager.getIntegration(integrationId);
    if (!connector) {
      throw new Error(`Integration ${integrationId} not found or not active`);
    }

    if (!connector.sync) {
      throw new Error(`Integration ${integrationId} does not support sync`);
    }

    // Update job progress
    await job.progress(25);

    // Perform sync
    const syncResult = await connector.sync(lastSyncAt);
    
    await job.progress(75);

    // Update sync status in database
    await integrationRepo.updateSyncStatus(
      integrationId,
      organizationId,
      'completed',
      new Date(),
      0, // Reset error count on successful sync
      undefined
    );

    await job.progress(100);

    logQueueJob(JobType.SYNC_INTEGRATION, job.id.toString(), 'completed', {
      integrationId,
      messagesCount: syncResult.messages.length,
      hasMore: syncResult.hasMore,
    });

    // If there are more messages, queue another sync job
    if (syncResult.hasMore && syncResult.nextPageToken) {
      // Queue next page sync (implement pagination logic here)
      logger.info('More messages available, consider implementing pagination', {
        integrationId,
        nextPageToken: syncResult.nextPageToken,
      });
    }

  } catch (error: any) {
    logger.error('Integration sync job failed:', {
      integrationId,
      syncType,
      error: error.message,
      jobId: job.id,
    });

    // Update integration error status
    try {
      await integrationRepo.updateSyncStatus(
        integrationId,
        organizationId,
        'error',
        undefined,
        undefined,
        error.message
      );
    } catch (dbError) {
      logger.error('Failed to update integration sync error status:', dbError);
    }

    throw error;
  }
};

// Email sending job processor
export const sendEmailJob = async (job: Job<SendEmailJobData>): Promise<void> => {
  const { integrationId, organizationId, to, cc, bcc, subject, body, attachments } = job.data;
  
  logQueueJob(JobType.SEND_EMAIL, job.id.toString(), 'started', {
    integrationId,
    organizationId,
    recipients: to.length,
  });

  try {
    // Get the integration connector
    const connector = integrationManager.getIntegration(integrationId);
    if (!connector) {
      throw new Error(`Integration ${integrationId} not found or not active`);
    }

    if (!connector.sendMessage) {
      throw new Error(`Integration ${integrationId} does not support sending messages`);
    }

    // Update job progress
    await job.progress(25);

    // Send the email
    const result = await connector.sendMessage({
      to,
      cc,
      bcc,
      subject,
      body,
      attachments,
    });

    await job.progress(100);

    logQueueJob(JobType.SEND_EMAIL, job.id.toString(), 'completed', {
      integrationId,
      messageId: result.id || result.messageId,
      recipients: to.length,
    });

  } catch (error: any) {
    logger.error('Email sending job failed:', {
      integrationId,
      subject,
      recipients: to.length,
      error: error.message,
      jobId: job.id,
    });

    throw error;
  }
};

// Webhook event processing job processor
export const processWebhookJob = async (job: Job<WebhookEventJobData>): Promise<void> => {
  const { provider, event, payload, signature, integrationId, organizationId } = job.data;
  
  logQueueJob(JobType.WEBHOOK_EVENT, job.id.toString(), 'started', {
    provider,
    event,
    integrationId,
    organizationId,
  });

  try {
    if (integrationId) {
      // Process webhook for specific integration
      const connector = integrationManager.getIntegration(integrationId);
      if (!connector) {
        throw new Error(`Integration ${integrationId} not found or not active`);
      }

      if (!connector.processWebhook) {
        throw new Error(`Integration ${integrationId} does not support webhook processing`);
      }

      await job.progress(50);

      const result = await connector.processWebhook(payload, signature);
      
      await job.progress(100);

      logQueueJob(JobType.WEBHOOK_EVENT, job.id.toString(), 'completed', {
        provider,
        event,
        integrationId,
        processedMessages: result?.messages?.length || 0,
      });

    } else {
      // Generic webhook processing (e.g., for provider-level webhooks)
      await job.progress(50);

      logger.info('Generic webhook processed', {
        provider,
        event,
        payloadSize: JSON.stringify(payload).length,
      });

      await job.progress(100);

      logQueueJob(JobType.WEBHOOK_EVENT, job.id.toString(), 'completed', {
        provider,
        event,
        type: 'generic',
      });
    }

  } catch (error: any) {
    logger.error('Webhook processing job failed:', {
      provider,
      event,
      integrationId,
      error: error.message,
      jobId: job.id,
    });

    throw error;
  }
};

// Cleanup job processor
export const cleanupJob = async (job: Job): Promise<void> => {
  logQueueJob(JobType.CLEANUP_OLD_DATA, job.id.toString(), 'started');

  try {
    // Implement cleanup logic here
    // - Clean old job data
    // - Clean old logs
    // - Clean temporary files
    
    await job.progress(50);
    
    logger.info('Cleanup job completed');
    
    await job.progress(100);

    logQueueJob(JobType.CLEANUP_OLD_DATA, job.id.toString(), 'completed');

  } catch (error: any) {
    logger.error('Cleanup job failed:', {
      error: error.message,
      jobId: job.id,
    });

    throw error;
  }
};

// Export all processors
export const processors = {
  [JobType.PROCESS_MESSAGE]: processMessageJob,
  [JobType.SYNC_INTEGRATION]: syncIntegrationJob,
  [JobType.SEND_EMAIL]: sendEmailJob,
  [JobType.WEBHOOK_EVENT]: processWebhookJob,
  [JobType.CLEANUP_OLD_DATA]: cleanupJob,
};

export default processors;
