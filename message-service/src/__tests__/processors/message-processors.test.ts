/**
 * Unit Tests for Message Processors
 */

import {
  processMessage,
  processAiClassification,
  processMessageAssignment,
  processAutoResponse,
  processWebhookDelivery,
  processMessageDelivery,
  processRetryMessage,
} from '../../processors/message-processors';
import { logger } from '../../utils/logger';
import { messageQueue } from '../../services/queue';
import { redis } from '../../services/redis';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../services/queue');
jest.mock('../../services/redis');
jest.mock('../../services/ai-client');
jest.mock('../../services/webhook-client');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockMessageQueue = messageQueue as jest.Mocked<typeof messageQueue>;
const mockRedis = redis as jest.Mocked<typeof redis>;

describe('Message Processors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processMessage', () => {
    it('should process message successfully', async () => {
      // Arrange
      const job = {
        id: 'msg_123',
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: { text: 'Hello, I need help', format: 'text' },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: { type: 'customer' as const, email: 'customer@example.com' },
        metadata: { source: 'email' },
        createdAt: new Date(),
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockMessageQueue.publishMessage.mockResolvedValue(true);

      // Act
      await processMessage(job);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(
        `message:${job.id}`,
        expect.any(String),
        { ttl: 86400 }
      );
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledWith(
        'ai.classification',
        expect.objectContaining({ messageId: job.id })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message processed successfully',
        expect.objectContaining({ messageId: job.id })
      );
    });

    it('should handle duplicate messages', async () => {
      // Arrange
      const job = {
        id: 'msg_123',
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: { text: 'Hello', format: 'text' },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: { type: 'customer' as const },
        metadata: {},
        createdAt: new Date(),
      };

      mockRedis.get.mockResolvedValue('existing_message');

      // Act
      await processMessage(job);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Duplicate message detected',
        expect.objectContaining({ messageId: job.id })
      );
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should handle processing errors', async () => {
      // Arrange
      const job = {
        id: 'msg_123',
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: { text: 'Hello', format: 'text' },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: { type: 'customer' as const },
        metadata: {},
        createdAt: new Date(),
      };

      const error = new Error('Redis error');
      mockRedis.get.mockRejectedValue(error);

      // Act & Assert
      await expect(processMessage(job)).rejects.toThrow('Redis error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing message',
        expect.objectContaining({
          messageId: job.id,
          error: 'Redis error',
        })
      );
    });
  });

  describe('processAiClassification', () => {
    it('should classify message with AI successfully', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        organizationId: 'org_123',
        content: 'I want to cancel my order',
        metadata: { priority: 'normal' },
      };

      const mockClassification = {
        intent: 'cancel_order',
        sentiment: 'negative',
        confidence: 0.95,
        entities: [{ type: 'order', value: 'order' }],
        urgency: 'high',
        category: 'order_management',
      };

      // Mock AI service response
      const mockAiClient = require('../../services/ai-client');
      mockAiClient.classifyMessage.mockResolvedValue(mockClassification);

      mockRedis.get.mockResolvedValue(JSON.stringify({
        id: job.messageId,
        content: { text: job.content },
      }));
      mockRedis.set.mockResolvedValue('OK');
      mockMessageQueue.publishMessage.mockResolvedValue(true);

      // Act
      await processAiClassification(job);

      // Assert
      expect(mockAiClient.classifyMessage).toHaveBeenCalledWith(job.content, job.metadata);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `message:${job.messageId}`,
        expect.stringContaining('"classification"'),
        { ttl: 86400 }
      );
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledWith(
        'message.assignment',
        expect.objectContaining({
          messageId: job.messageId,
          classification: mockClassification,
        })
      );
    });

    it('should handle AI classification errors', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        organizationId: 'org_123',
        content: 'Hello',
        metadata: {},
      };

      const mockAiClient = require('../../services/ai-client');
      const aiError = new Error('AI service unavailable');
      mockAiClient.classifyMessage.mockRejectedValue(aiError);

      mockRedis.get.mockResolvedValue(JSON.stringify({
        id: job.messageId,
        content: { text: job.content },
      }));

      // Act & Assert
      await expect(processAiClassification(job)).rejects.toThrow('AI service unavailable');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in AI classification',
        expect.objectContaining({
          messageId: job.messageId,
          error: 'AI service unavailable',
        })
      );
    });

    it('should handle missing message', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        organizationId: 'org_123',
        content: 'Hello',
        metadata: {},
      };

      mockRedis.get.mockResolvedValue(null);

      // Act & Assert
      await expect(processAiClassification(job)).rejects.toThrow('Message not found');
    });
  });

  describe('processMessageAssignment', () => {
    it('should assign message to agent successfully', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        organizationId: 'org_123',
        classification: {
          intent: 'support_request',
          urgency: 'high',
          category: 'technical_support',
        },
      };

      const mockMessage = {
        id: job.messageId,
        conversationId: 'conv_456',
        content: { text: 'I need help' },
      };

      const mockAgent = {
        id: 'agent_123',
        name: 'John Doe',
        skills: ['technical_support'],
        availability: 'available',
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockMessage));
      mockRedis.set.mockResolvedValue('OK');

      // Mock agent assignment logic
      const mockAgentService = require('../../services/agent-service');
      mockAgentService.findBestAgent.mockResolvedValue(mockAgent);

      mockMessageQueue.publishMessage.mockResolvedValue(true);

      // Act
      await processMessageAssignment(job);

      // Assert
      expect(mockAgentService.findBestAgent).toHaveBeenCalledWith(
        job.organizationId,
        job.classification
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `message:${job.messageId}`,
        expect.stringContaining('"assignedAgent"'),
        { ttl: 86400 }
      );
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledWith(
        'message.delivery',
        expect.objectContaining({
          messageId: job.messageId,
          agentId: mockAgent.id,
        })
      );
    });

    it('should handle no available agents', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        organizationId: 'org_123',
        classification: {
          intent: 'support_request',
          urgency: 'low',
          category: 'general',
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify({
        id: job.messageId,
        conversationId: 'conv_456',
      }));

      const mockAgentService = require('../../services/agent-service');
      mockAgentService.findBestAgent.mockResolvedValue(null);

      mockMessageQueue.publishMessage.mockResolvedValue(true);

      // Act
      await processMessageAssignment(job);

      // Assert
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledWith(
        'message.queue',
        expect.objectContaining({
          messageId: job.messageId,
          reason: 'no_agents_available',
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message queued - no agents available',
        expect.objectContaining({ messageId: job.messageId })
      );
    });
  });

  describe('processAutoResponse', () => {
    it('should generate and send auto response', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        organizationId: 'org_123',
        classification: {
          intent: 'greeting',
          confidence: 0.9,
        },
        triggerConditions: ['high_confidence', 'greeting_intent'],
      };

      const mockMessage = {
        id: job.messageId,
        conversationId: 'conv_456',
        content: { text: 'Hello' },
        sender: { email: 'customer@example.com' },
      };

      const mockResponse = {
        content: 'Hello! How can I help you today?',
        type: 'auto_response',
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockMessage));

      const mockAiClient = require('../../services/ai-client');
      mockAiClient.generateResponse.mockResolvedValue(mockResponse);

      mockMessageQueue.publishMessage.mockResolvedValue(true);

      // Act
      await processAutoResponse(job);

      // Assert
      expect(mockAiClient.generateResponse).toHaveBeenCalledWith(
        mockMessage.content.text,
        job.classification,
        expect.any(Object)
      );
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledWith(
        'message.delivery',
        expect.objectContaining({
          content: mockResponse.content,
          type: 'auto_response',
        })
      );
    });

    it('should skip auto response for low confidence', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        organizationId: 'org_123',
        classification: {
          intent: 'unknown',
          confidence: 0.3,
        },
        triggerConditions: [],
      };

      // Act
      await processAutoResponse(job);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Auto response skipped - conditions not met',
        expect.objectContaining({ messageId: job.messageId })
      );
    });
  });

  describe('processWebhookDelivery', () => {
    it('should deliver webhook successfully', async () => {
      // Arrange
      const job = {
        webhookUrl: 'https://example.com/webhook',
        payload: {
          event: 'message.created',
          messageId: 'msg_123',
          data: { content: 'Hello' },
        },
        headers: {
          'X-Webhook-Secret': 'secret123',
        },
        retryCount: 0,
        maxRetries: 3,
      };

      const mockWebhookClient = require('../../services/webhook-client');
      mockWebhookClient.deliverWebhook.mockResolvedValue({
        success: true,
        statusCode: 200,
        responseTime: 150,
      });

      // Act
      await processWebhookDelivery(job);

      // Assert
      expect(mockWebhookClient.deliverWebhook).toHaveBeenCalledWith(
        job.webhookUrl,
        job.payload,
        job.headers
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook delivered successfully',
        expect.objectContaining({
          url: job.webhookUrl,
          statusCode: 200,
        })
      );
    });

    it('should retry failed webhook delivery', async () => {
      // Arrange
      const job = {
        webhookUrl: 'https://example.com/webhook',
        payload: { event: 'message.created' },
        headers: {},
        retryCount: 1,
        maxRetries: 3,
      };

      const mockWebhookClient = require('../../services/webhook-client');
      mockWebhookClient.deliverWebhook.mockResolvedValue({
        success: false,
        statusCode: 500,
        error: 'Internal Server Error',
      });

      mockMessageQueue.publishMessage.mockResolvedValue(true);

      // Act
      await processWebhookDelivery(job);

      // Assert
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledWith(
        'webhook.retry',
        expect.objectContaining({
          ...job,
          retryCount: 2,
        })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Webhook delivery failed, retrying',
        expect.objectContaining({
          url: job.webhookUrl,
          retryCount: 2,
        })
      );
    });

    it('should give up after max retries', async () => {
      // Arrange
      const job = {
        webhookUrl: 'https://example.com/webhook',
        payload: { event: 'message.created' },
        headers: {},
        retryCount: 3,
        maxRetries: 3,
      };

      const mockWebhookClient = require('../../services/webhook-client');
      mockWebhookClient.deliverWebhook.mockResolvedValue({
        success: false,
        statusCode: 500,
        error: 'Internal Server Error',
      });

      // Act
      await processWebhookDelivery(job);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Webhook delivery failed permanently',
        expect.objectContaining({
          url: job.webhookUrl,
          retryCount: 3,
        })
      );
    });
  });

  describe('processMessageDelivery', () => {
    it('should deliver message to agent successfully', async () => {
      // Arrange
      const job = {
        messageId: 'msg_123',
        agentId: 'agent_456',
        organizationId: 'org_123',
        conversationId: 'conv_789',
        deliveryMethod: 'websocket' as const,
      };

      const mockMessage = {
        id: job.messageId,
        content: { text: 'Hello' },
        sender: { type: 'customer' },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockMessage));

      const mockWebSocketService = require('../../services/websocket');
      mockWebSocketService.emitToRoom.mockReturnValue(true);

      // Act
      await processMessageDelivery(job);

      // Assert
      expect(mockWebSocketService.emitToRoom).toHaveBeenCalledWith(
        `agent:${job.agentId}`,
        'message:new',
        expect.objectContaining({
          message: mockMessage,
          conversationId: job.conversationId,
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message delivered to agent',
        expect.objectContaining({
          messageId: job.messageId,
          agentId: job.agentId,
        })
      );
    });
  });

  describe('processRetryMessage', () => {
    it('should retry failed message processing', async () => {
      // Arrange
      const job = {
        originalJob: {
          messageId: 'msg_123',
          organizationId: 'org_123',
          content: 'Hello',
        },
        retryCount: 1,
        maxRetries: 3,
        lastError: 'AI service timeout',
        retryReason: 'service_timeout',
      };

      mockMessageQueue.publishMessage.mockResolvedValue(true);

      // Act
      await processRetryMessage(job);

      // Assert
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledWith(
        'ai.classification',
        job.originalJob
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message retry processed',
        expect.objectContaining({
          messageId: job.originalJob.messageId,
          retryCount: 1,
        })
      );
    });

    it('should give up after max retries', async () => {
      // Arrange
      const job = {
        originalJob: {
          messageId: 'msg_123',
          organizationId: 'org_123',
          content: 'Hello',
        },
        retryCount: 3,
        maxRetries: 3,
        lastError: 'Persistent error',
        retryReason: 'unknown_error',
      };

      // Act
      await processRetryMessage(job);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Message processing failed permanently',
        expect.objectContaining({
          messageId: job.originalJob.messageId,
          retryCount: 3,
          lastError: 'Persistent error',
        })
      );
    });
  });
});
