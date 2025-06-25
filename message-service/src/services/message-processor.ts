/**
 * Message Processing Service
 * Handles message validation, transformation, routing, and status tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { config } from '@/config';
import { logger, messageLogger, logMessageProcessing, logMessageError } from '@/utils/logger';
import { MessageProcessingError, ValidationError, NotFoundError } from '@/utils/errors';
import { messageRepository, MessageEntity, ConversationEntity } from '@/repositories/message.repository';
import { messageQueue, QueueMessage, MessageQueueService } from '@/services/queue';
import { redis } from '@/services/redis';

export interface IncomingMessage {
  conversationId?: string;
  externalId?: string;
  direction: 'inbound' | 'outbound';
  content: {
    text: string;
    html?: string;
    format?: 'text' | 'html' | 'markdown';
    language?: string;
  };
  sender: {
    email?: string;
    name?: string;
    phone?: string;
    userId?: string;
    type: 'customer' | 'agent' | 'system' | 'ai';
  };
  recipient?: {
    email?: string;
    name?: string;
    phone?: string;
    userId?: string;
  };
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    url: string;
    thumbnailUrl?: string;
  }>;
  metadata?: Record<string, any>;
  organizationId: string;
  integrationId: string;
}

export interface ProcessingResult {
  messageId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  processingTime?: number;
  aiClassification?: any;
  aiResponse?: any;
  errors?: string[];
}

export interface MessageValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class MessageProcessorService {
  private static instance: MessageProcessorService;

  private constructor() {}

  public static getInstance(): MessageProcessorService {
    if (!MessageProcessorService.instance) {
      MessageProcessorService.instance = new MessageProcessorService();
    }
    return MessageProcessorService.instance;
  }

  /**
   * Process incoming message - main entry point
   */
  public async processIncomingMessage(incomingMessage: IncomingMessage): Promise<ProcessingResult> {
    const startTime = Date.now();
    const messageId = uuidv4();

    try {
      logMessageProcessing(messageId, 'processing_started', 0, { direction: incomingMessage.direction });

      // 1. Validate message
      const validationResult = await this.validateMessage(incomingMessage);
      if (!validationResult.isValid) {
        throw new ValidationError(`Message validation failed: ${validationResult.errors.join(', ')}`);
      }

      // 2. Check for duplicates
      if (config.features.messageDeduplication && incomingMessage.externalId) {
        const isDuplicate = await this.checkDuplicate(incomingMessage.externalId, incomingMessage.conversationId);
        if (isDuplicate) {
          logger.warn('Duplicate message detected', { externalId: incomingMessage.externalId });
          return {
            messageId: '',
            status: 'completed',
            processingTime: Date.now() - startTime,
            errors: ['Duplicate message'],
          };
        }
      }

      // 3. Find or create conversation
      const conversationId = await this.resolveConversation(incomingMessage);

      // 4. Transform and create message entity
      const messageEntity = await this.transformToMessageEntity(incomingMessage, conversationId, messageId);

      // 5. Save message to database
      const savedMessage = await messageRepository.createMessage(messageEntity);

      // 6. Queue for further processing
      await this.queueForProcessing(savedMessage);

      // 7. Cache message for quick access
      await this.cacheMessage(savedMessage);

      const processingTime = Date.now() - startTime;
      logMessageProcessing(messageId, 'processing_completed', processingTime);

      return {
        messageId: savedMessage.id,
        status: 'queued',
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logMessageError(messageId, error as Error, { processingTime });
      
      return {
        messageId,
        status: 'failed',
        processingTime,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Validate incoming message
   */
  private async validateMessage(message: IncomingMessage): Promise<MessageValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!message.content?.text?.trim()) {
      errors.push('Message content text is required');
    }

    if (!message.sender?.type) {
      errors.push('Sender type is required');
    }

    if (!['inbound', 'outbound'].includes(message.direction)) {
      errors.push('Direction must be either inbound or outbound');
    }

    if (!message.organizationId) {
      errors.push('Organization ID is required');
    }

    if (!message.integrationId) {
      errors.push('Integration ID is required');
    }

    // Content validation
    if (message.content.text.length > 10000) {
      errors.push('Message content exceeds maximum length (10,000 characters)');
    }

    // Email validation
    if (message.sender.email && !this.isValidEmail(message.sender.email)) {
      errors.push('Invalid sender email format');
    }

    if (message.recipient?.email && !this.isValidEmail(message.recipient.email)) {
      errors.push('Invalid recipient email format');
    }

    // Phone validation
    if (message.sender.phone && !this.isValidPhone(message.sender.phone)) {
      warnings.push('Sender phone number format may be invalid');
    }

    // Attachments validation
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (!attachment.filename || !attachment.contentType) {
          errors.push('Attachment filename and content type are required');
        }
        
        if (attachment.size > 25 * 1024 * 1024) { // 25MB limit
          errors.push(`Attachment ${attachment.filename} exceeds size limit (25MB)`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check for duplicate messages
   */
  private async checkDuplicate(externalId: string, conversationId?: string): Promise<boolean> {
    try {
      const cacheKey = `duplicate:${externalId}:${conversationId || 'no-conv'}`;
      const exists = await redis.exists(cacheKey);
      
      if (exists) {
        return true;
      }

      // Check database
      const existingMessage = await messageRepository.getMessages(
        { conversationId },
        { page: 1, limit: 1 }
      );

      const isDuplicate = existingMessage.data.some(msg => msg.externalId === externalId);
      
      if (!isDuplicate) {
        // Cache for 1 hour to prevent duplicates
        await redis.set(cacheKey, 'true', { ttl: 3600 });
      }

      return isDuplicate;
    } catch (error) {
      logger.error('Error checking for duplicates', {
        externalId,
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false; // Fail open to avoid blocking messages
    }
  }

  /**
   * Resolve conversation ID (find existing or create new)
   */
  private async resolveConversation(message: IncomingMessage): Promise<string> {
    if (message.conversationId) {
      // Verify conversation exists
      const conversation = await messageRepository.getConversationById(message.conversationId);
      if (conversation) {
        return message.conversationId;
      }
    }

    // For inbound messages, try to find existing conversation by customer email
    if (message.direction === 'inbound' && message.sender.email) {
      const existingConversations = await this.findConversationsByCustomer(
        message.sender.email,
        message.organizationId
      );
      
      if (existingConversations.length > 0) {
        // Return the most recent open conversation
        const openConversation = existingConversations.find(conv => 
          ['open', 'in_progress', 'waiting_for_customer'].includes(conv.status)
        );
        
        if (openConversation) {
          return openConversation.id;
        }
      }
    }

    // Create new conversation
    return await this.createNewConversation(message);
  }

  /**
   * Transform incoming message to message entity
   */
  private async transformToMessageEntity(
    incomingMessage: IncomingMessage,
    conversationId: string,
    messageId: string
  ): Promise<Omit<MessageEntity, 'id' | 'createdAt' | 'updatedAt'>> {
    return {
      conversationId,
      externalId: incomingMessage.externalId,
      direction: incomingMessage.direction,
      content: {
        text: incomingMessage.content.text,
        html: incomingMessage.content.html,
        format: incomingMessage.content.format || 'text',
        language: incomingMessage.content.language,
        encoding: 'utf-8',
      },
      sender: incomingMessage.sender,
      recipient: incomingMessage.recipient,
      status: 'received',
      attachments: incomingMessage.attachments || [],
      metadata: {
        ...incomingMessage.metadata,
        organizationId: incomingMessage.organizationId,
        integrationId: incomingMessage.integrationId,
        receivedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Queue message for further processing (AI, routing, etc.)
   */
  private async queueForProcessing(message: MessageEntity): Promise<void> {
    const queueMessage: QueueMessage = {
      id: uuidv4(),
      type: 'message.process',
      data: {
        messageId: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        organizationId: message.metadata.organizationId,
        integrationId: message.metadata.integrationId,
      },
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: config.queue.maxAttempts,
    };

    await messageQueue.publishMessage(MessageQueueService.QUEUES.MESSAGE_PROCESSING, queueMessage);

    // Also queue for AI processing if it's an inbound message
    if (message.direction === 'inbound') {
      const aiQueueMessage: QueueMessage = {
        id: uuidv4(),
        type: 'ai.classify',
        data: {
          messageId: message.id,
          text: message.content.text,
          context: {
            conversationId: message.conversationId,
            organizationId: message.metadata.organizationId,
          },
        },
        timestamp: new Date(),
        attempts: 0,
        maxAttempts: config.queue.maxAttempts,
      };

      await messageQueue.publishMessage(MessageQueueService.QUEUES.AI_PROCESSING, aiQueueMessage);
    }
  }

  /**
   * Cache message for quick access
   */
  private async cacheMessage(message: MessageEntity): Promise<void> {
    try {
      const cacheKey = `message:${message.id}`;
      await redis.set(cacheKey, message, { ttl: 3600 }); // Cache for 1 hour
    } catch (error) {
      logger.error('Error caching message', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw as caching is not critical
    }
  }

  /**
   * Update message status
   */
  public async updateMessageStatus(
    messageId: string,
    status: MessageEntity['status'],
    additionalData?: Partial<MessageEntity>
  ): Promise<MessageEntity> {
    try {
      const updates: Partial<MessageEntity> = {
        status,
        ...additionalData,
      };

      // Set timestamp based on status
      switch (status) {
        case 'processed':
          updates.processedAt = new Date();
          break;
        case 'delivered':
          updates.deliveredAt = new Date();
          break;
        case 'read':
          updates.readAt = new Date();
          break;
      }

      const updatedMessage = await messageRepository.updateMessage(messageId, updates);
      
      // Update cache
      await this.cacheMessage(updatedMessage);
      
      logMessageProcessing(messageId, `status_updated_to_${status}`);
      
      return updatedMessage;
    } catch (error) {
      logMessageError(messageId, error as Error);
      throw error;
    }
  }

  // Helper methods
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  private async findConversationsByCustomer(
    customerEmail: string,
    organizationId: string
  ): Promise<ConversationEntity[]> {
    // This would need to be implemented in the conversation repository
    // For now, return empty array
    return [];
  }

  private async createNewConversation(message: IncomingMessage): Promise<string> {
    // This would need to be implemented to create a new conversation
    // For now, return a UUID
    return uuidv4();
  }
}

// Export singleton instance
export const messageProcessor = MessageProcessorService.getInstance();
