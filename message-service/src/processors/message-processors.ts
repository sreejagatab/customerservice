/**
 * Message Queue Processors
 * Handles different types of message processing jobs from the queue
 */

import { Message } from 'amqplib';
import { config } from '@/config';
import { logger, queueLogger, logQueueJob, logQueueError } from '@/utils/logger';
import { QueueError, MessageProcessingError } from '@/utils/errors';
import { QueueMessage } from '@/services/queue';
import { messageRepository } from '@/repositories/message.repository';
import { messageProcessor } from '@/services/message-processor';
import { messageRouter } from '@/services/message-router';
import { redis } from '@/services/redis';
import axios from 'axios';

/**
 * Process message - main message processing workflow
 */
export async function processMessage(queueMessage: QueueMessage, originalMessage: Message): Promise<void> {
  const { messageId, conversationId, organizationId } = queueMessage.data;
  const startTime = Date.now();

  try {
    logQueueJob(queueMessage.id, queueMessage.type, 'started', { messageId });

    // 1. Get message from database
    const message = await messageRepository.getMessageById(messageId);
    if (!message) {
      throw new MessageProcessingError(`Message not found: ${messageId}`);
    }

    // 2. Update status to processing
    await messageProcessor.updateMessageStatus(messageId, 'processing');

    // 3. Route message based on rules and AI classification
    const routingResult = await messageRouter.routeMessage(message);

    // 4. Update message status to processed
    await messageProcessor.updateMessageStatus(messageId, 'processed', {
      metadata: {
        ...message.metadata,
        routingResult,
        processedAt: new Date().toISOString(),
      },
    });

    // 5. Cache processing result
    await redis.set(`processing_result:${messageId}`, routingResult, { ttl: 3600 });

    const processingTime = Date.now() - startTime;
    logQueueJob(queueMessage.id, queueMessage.type, 'completed', { 
      messageId, 
      processingTime,
      appliedRules: routingResult.appliedRules.length,
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logQueueError(queueMessage.id, queueMessage.type, error as Error, { 
      messageId, 
      processingTime 
    });

    // Update message status to failed
    try {
      await messageProcessor.updateMessageStatus(messageId, 'failed', {
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date().toISOString(),
        },
      });
    } catch (updateError) {
      logger.error('Failed to update message status to failed', {
        messageId,
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }

    throw error;
  }
}

/**
 * Process AI classification results
 */
export async function processAiClassification(queueMessage: QueueMessage, originalMessage: Message): Promise<void> {
  const { messageId, classification } = queueMessage.data;

  try {
    logQueueJob(queueMessage.id, queueMessage.type, 'started', { messageId });

    // Get message from database
    const message = await messageRepository.getMessageById(messageId);
    if (!message) {
      throw new MessageProcessingError(`Message not found: ${messageId}`);
    }

    // Update message with AI classification
    await messageRepository.updateMessage(messageId, {
      aiClassification: classification,
      metadata: {
        ...message.metadata,
        aiProcessedAt: new Date().toISOString(),
      },
    });

    // Trigger re-routing if classification affects routing
    if (classification.urgency === 'urgent' || classification.category === 'complaint') {
      await messageRouter.routeMessage({
        ...message,
        aiClassification: classification,
      });
    }

    logQueueJob(queueMessage.id, queueMessage.type, 'completed', { 
      messageId,
      category: classification.category,
      urgency: classification.urgency,
    });

  } catch (error) {
    logQueueError(queueMessage.id, queueMessage.type, error as Error, { messageId });
    throw error;
  }
}

/**
 * Process message assignment
 */
export async function processMessageAssignment(queueMessage: QueueMessage, originalMessage: Message): Promise<void> {
  const { messageId, agentId, assignedAt } = queueMessage.data;

  try {
    logQueueJob(queueMessage.id, queueMessage.type, 'started', { messageId, agentId });

    // Get message to find conversation
    const message = await messageRepository.getMessageById(messageId);
    if (!message) {
      throw new MessageProcessingError(`Message not found: ${messageId}`);
    }

    // Update conversation assignment (this would be in conversation repository)
    // For now, just log the assignment
    logger.info('Message assigned to agent', {
      messageId,
      conversationId: message.conversationId,
      agentId,
      assignedAt,
    });

    // Send notification to agent (queue for notification service)
    await sendAgentNotification(agentId, message);

    logQueueJob(queueMessage.id, queueMessage.type, 'completed', { messageId, agentId });

  } catch (error) {
    logQueueError(queueMessage.id, queueMessage.type, error as Error, { messageId, agentId });
    throw error;
  }
}

/**
 * Process auto response
 */
export async function processAutoResponse(queueMessage: QueueMessage, originalMessage: Message): Promise<void> {
  const { conversationId, responseText, originalMessageId } = queueMessage.data;

  try {
    logQueueJob(queueMessage.id, queueMessage.type, 'started', { conversationId });

    // Get conversation details
    const conversation = await messageRepository.getConversationById(conversationId);
    if (!conversation) {
      throw new MessageProcessingError(`Conversation not found: ${conversationId}`);
    }

    // Create auto response message
    const autoResponseMessage = {
      conversationId,
      direction: 'outbound' as const,
      content: {
        text: responseText,
        format: 'text' as const,
      },
      sender: {
        type: 'ai' as const,
        name: 'AI Assistant',
      },
      recipient: {
        email: conversation.customerEmail,
        name: conversation.customerName,
      },
      status: 'sent' as const,
      attachments: [],
      metadata: {
        isAutoResponse: true,
        originalMessageId,
        generatedAt: new Date().toISOString(),
        organizationId: conversation.organizationId,
        integrationId: conversation.integrationId,
      },
    };

    // Save auto response message
    const savedMessage = await messageRepository.createMessage(autoResponseMessage);

    // Queue for delivery
    await queueMessageDelivery(savedMessage.id, conversation.integrationId);

    logQueueJob(queueMessage.id, queueMessage.type, 'completed', { 
      conversationId,
      autoResponseMessageId: savedMessage.id,
    });

  } catch (error) {
    logQueueError(queueMessage.id, queueMessage.type, error as Error, { conversationId });
    throw error;
  }
}

/**
 * Process webhook delivery
 */
export async function processWebhookDelivery(queueMessage: QueueMessage, originalMessage: Message): Promise<void> {
  const { messageId, webhookUrl, event, payload } = queueMessage.data;

  try {
    logQueueJob(queueMessage.id, queueMessage.type, 'started', { messageId, webhookUrl });

    // Prepare webhook payload
    const webhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    // Send webhook
    const response = await axios.post(webhookUrl, webhookPayload, {
      timeout: config.webhook.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${config.serviceName}/1.0.0`,
        'X-Event-Type': event,
      },
    });

    // Log successful delivery
    logger.info('Webhook delivered successfully', {
      messageId,
      webhookUrl,
      event,
      statusCode: response.status,
      responseTime: response.headers['x-response-time'],
    });

    logQueueJob(queueMessage.id, queueMessage.type, 'completed', { 
      messageId,
      webhookUrl,
      statusCode: response.status,
    });

  } catch (error) {
    logQueueError(queueMessage.id, queueMessage.type, error as Error, { messageId, webhookUrl });

    // Log webhook delivery failure
    logger.error('Webhook delivery failed', {
      messageId,
      webhookUrl,
      event,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Process message delivery
 */
export async function processMessageDelivery(queueMessage: QueueMessage, originalMessage: Message): Promise<void> {
  const { messageId, integrationId } = queueMessage.data;

  try {
    logQueueJob(queueMessage.id, queueMessage.type, 'started', { messageId, integrationId });

    // Get message details
    const message = await messageRepository.getMessageById(messageId);
    if (!message) {
      throw new MessageProcessingError(`Message not found: ${messageId}`);
    }

    // Call integration service to deliver message
    const deliveryResult = await deliverMessageViaIntegration(message, integrationId);

    // Update message status based on delivery result
    if (deliveryResult.success) {
      await messageProcessor.updateMessageStatus(messageId, 'delivered', {
        metadata: {
          ...message.metadata,
          deliveryResult,
          deliveredAt: new Date().toISOString(),
        },
      });
    } else {
      await messageProcessor.updateMessageStatus(messageId, 'failed', {
        metadata: {
          ...message.metadata,
          deliveryError: deliveryResult.error,
          failedAt: new Date().toISOString(),
        },
      });
    }

    logQueueJob(queueMessage.id, queueMessage.type, 'completed', { 
      messageId,
      integrationId,
      delivered: deliveryResult.success,
    });

  } catch (error) {
    logQueueError(queueMessage.id, queueMessage.type, error as Error, { messageId, integrationId });
    throw error;
  }
}

/**
 * Process retry queue messages
 */
export async function processRetryMessage(queueMessage: QueueMessage, originalMessage: Message): Promise<void> {
  try {
    logQueueJob(queueMessage.id, 'retry', 'started', { 
      originalType: queueMessage.type,
      attempt: queueMessage.attempts,
    });

    // Add delay before processing
    if (queueMessage.delay) {
      await new Promise(resolve => setTimeout(resolve, queueMessage.delay));
    }

    // Route to appropriate processor based on original message type
    switch (queueMessage.type) {
      case 'message.process':
        await processMessage(queueMessage, originalMessage);
        break;
      case 'ai.classify':
        await processAiClassification(queueMessage, originalMessage);
        break;
      case 'message.assign':
        await processMessageAssignment(queueMessage, originalMessage);
        break;
      case 'message.auto_response':
        await processAutoResponse(queueMessage, originalMessage);
        break;
      case 'webhook.trigger':
        await processWebhookDelivery(queueMessage, originalMessage);
        break;
      case 'message.delivery':
        await processMessageDelivery(queueMessage, originalMessage);
        break;
      default:
        throw new QueueError(`Unknown message type for retry: ${queueMessage.type}`);
    }

    logQueueJob(queueMessage.id, 'retry', 'completed', { 
      originalType: queueMessage.type,
      attempt: queueMessage.attempts,
    });

  } catch (error) {
    logQueueError(queueMessage.id, 'retry', error as Error, { 
      originalType: queueMessage.type,
      attempt: queueMessage.attempts,
    });
    throw error;
  }
}

// Helper functions
async function sendAgentNotification(agentId: string, message: any): Promise<void> {
  try {
    // Call notification service
    await axios.post(`${config.services.notification.url}/api/v1/notifications`, {
      recipientId: agentId,
      type: 'message_assigned',
      title: 'New Message Assigned',
      content: `You have been assigned a new message from ${message.sender.email || message.sender.name}`,
      data: {
        messageId: message.id,
        conversationId: message.conversationId,
      },
    }, {
      headers: {
        'Authorization': `Bearer ${config.services.notification.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
  } catch (error) {
    logger.error('Failed to send agent notification', {
      agentId,
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function queueMessageDelivery(messageId: string, integrationId: string): Promise<void> {
  // This would queue the message for delivery via the integration service
  logger.info('Queuing message for delivery', { messageId, integrationId });
}

async function deliverMessageViaIntegration(message: any, integrationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Call integration service to deliver message
    const response = await axios.post(`${config.services.integration.url}/api/v1/messages/send`, {
      integrationId,
      message: {
        to: message.recipient?.email,
        subject: 'Re: Your inquiry',
        content: message.content.text,
        html: message.content.html,
      },
    }, {
      headers: {
        'Authorization': `Bearer ${config.services.integration.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    return { success: response.status === 200 };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
