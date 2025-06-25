/**
 * Unit Tests for Message Processor Service
 */

import { messageProcessor } from '../../../src/services/message-processor';
import { messageRepository } from '../../../src/repositories/message.repository';
import { messageQueue } from '../../../src/services/queue';
import { redis } from '../../../src/services/redis';

// Mock dependencies
jest.mock('../../../src/repositories/message.repository');
jest.mock('../../../src/services/queue');
jest.mock('../../../src/services/redis');

const mockMessageRepository = messageRepository as jest.Mocked<typeof messageRepository>;
const mockMessageQueue = messageQueue as jest.Mocked<typeof messageQueue>;
const mockRedis = redis as jest.Mocked<typeof redis>;

describe('MessageProcessorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processIncomingMessage', () => {
    it('should successfully process a valid incoming message', async () => {
      // Arrange
      const incomingMessage = testUtils.createMockIncomingMessage();
      const mockSavedMessage = testUtils.createMockMessage();

      mockRedis.exists.mockResolvedValue(false);
      mockMessageRepository.createMessage.mockResolvedValue(mockSavedMessage);
      mockMessageQueue.publishMessage.mockResolvedValue(true);
      mockRedis.set.mockResolvedValue(true);

      // Act
      const result = await messageProcessor.processIncomingMessage(incomingMessage);

      // Assert
      expect(result.status).toBe('queued');
      expect(result.messageId).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
      expect(mockMessageRepository.createMessage).toHaveBeenCalledTimes(1);
      expect(mockMessageQueue.publishMessage).toHaveBeenCalledTimes(2); // Processing + AI queues
    });

    it('should reject invalid message content', async () => {
      // Arrange
      const invalidMessage = {
        ...testUtils.createMockIncomingMessage(),
        content: { text: '', format: 'text' as const },
      };

      // Act
      const result = await messageProcessor.processIncomingMessage(invalidMessage);

      // Assert
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Message content text is required');
      expect(mockMessageRepository.createMessage).not.toHaveBeenCalled();
    });

    it('should handle duplicate messages when deduplication is enabled', async () => {
      // Arrange
      const incomingMessage = {
        ...testUtils.createMockIncomingMessage(),
        externalId: 'duplicate-123',
      };

      mockRedis.exists.mockResolvedValue(true);

      // Act
      const result = await messageProcessor.processIncomingMessage(incomingMessage);

      // Assert
      expect(result.status).toBe('completed');
      expect(result.errors).toContain('Duplicate message');
      expect(mockMessageRepository.createMessage).not.toHaveBeenCalled();
    });

    it('should validate email format', async () => {
      // Arrange
      const invalidMessage = {
        ...testUtils.createMockIncomingMessage(),
        sender: {
          ...testUtils.createMockIncomingMessage().sender,
          email: 'invalid-email',
        },
      };

      // Act
      const result = await messageProcessor.processIncomingMessage(invalidMessage);

      // Assert
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Invalid sender email format');
    });

    it('should validate message length', async () => {
      // Arrange
      const longMessage = {
        ...testUtils.createMockIncomingMessage(),
        content: {
          text: 'a'.repeat(10001), // Exceeds 10,000 character limit
          format: 'text' as const,
        },
      };

      // Act
      const result = await messageProcessor.processIncomingMessage(longMessage);

      // Assert
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Message content exceeds maximum length (10,000 characters)');
    });

    it('should handle attachment validation', async () => {
      // Arrange
      const messageWithLargeAttachment = {
        ...testUtils.createMockIncomingMessage(),
        attachments: [{
          filename: 'large-file.pdf',
          contentType: 'application/pdf',
          size: 26 * 1024 * 1024, // 26MB - exceeds 25MB limit
          url: 'https://example.com/file.pdf',
        }],
      };

      // Act
      const result = await messageProcessor.processIncomingMessage(messageWithLargeAttachment);

      // Assert
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Attachment large-file.pdf exceeds size limit (25MB)');
    });
  });

  describe('updateMessageStatus', () => {
    it('should successfully update message status', async () => {
      // Arrange
      const messageId = 'test-message-id';
      const newStatus = 'processed';
      const mockUpdatedMessage = {
        ...testUtils.createMockMessage(),
        status: newStatus,
        processedAt: new Date(),
      };

      mockMessageRepository.updateMessage.mockResolvedValue(mockUpdatedMessage);
      mockRedis.set.mockResolvedValue(true);

      // Act
      const result = await messageProcessor.updateMessageStatus(messageId, newStatus);

      // Assert
      expect(result.status).toBe(newStatus);
      expect(result.processedAt).toBeDefined();
      expect(mockMessageRepository.updateMessage).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          status: newStatus,
          processedAt: expect.any(Date),
        })
      );
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should set appropriate timestamps for different statuses', async () => {
      // Arrange
      const messageId = 'test-message-id';
      const mockMessage = testUtils.createMockMessage();

      mockMessageRepository.updateMessage.mockResolvedValue(mockMessage);
      mockRedis.set.mockResolvedValue(true);

      // Test processed status
      await messageProcessor.updateMessageStatus(messageId, 'processed');
      expect(mockMessageRepository.updateMessage).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          status: 'processed',
          processedAt: expect.any(Date),
        })
      );

      // Test delivered status
      await messageProcessor.updateMessageStatus(messageId, 'delivered');
      expect(mockMessageRepository.updateMessage).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          status: 'delivered',
          deliveredAt: expect.any(Date),
        })
      );

      // Test read status
      await messageProcessor.updateMessageStatus(messageId, 'read');
      expect(mockMessageRepository.updateMessage).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          status: 'read',
          readAt: expect.any(Date),
        })
      );
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      const messageId = 'test-message-id';
      const error = new Error('Database connection failed');

      mockMessageRepository.updateMessage.mockRejectedValue(error);

      // Act & Assert
      await expect(
        messageProcessor.updateMessageStatus(messageId, 'processed')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('message validation', () => {
    it('should validate required fields', async () => {
      // Test missing content
      const messageWithoutContent = {
        ...testUtils.createMockIncomingMessage(),
        content: { text: '', format: 'text' as const },
      };

      const result1 = await messageProcessor.processIncomingMessage(messageWithoutContent);
      expect(result1.status).toBe('failed');
      expect(result1.errors).toContain('Message content text is required');

      // Test missing sender type
      const messageWithoutSenderType = {
        ...testUtils.createMockIncomingMessage(),
        sender: {
          ...testUtils.createMockIncomingMessage().sender,
          type: undefined as any,
        },
      };

      const result2 = await messageProcessor.processIncomingMessage(messageWithoutSenderType);
      expect(result2.status).toBe('failed');
      expect(result2.errors).toContain('Sender type is required');

      // Test invalid direction
      const messageWithInvalidDirection = {
        ...testUtils.createMockIncomingMessage(),
        direction: 'invalid' as any,
      };

      const result3 = await messageProcessor.processIncomingMessage(messageWithInvalidDirection);
      expect(result3.status).toBe('failed');
      expect(result3.errors).toContain('Direction must be either inbound or outbound');
    });

    it('should validate email formats', async () => {
      const invalidEmails = ['invalid', '@example.com', 'test@', 'test@.com'];

      for (const email of invalidEmails) {
        const message = {
          ...testUtils.createMockIncomingMessage(),
          sender: {
            ...testUtils.createMockIncomingMessage().sender,
            email,
          },
        };

        const result = await messageProcessor.processIncomingMessage(message);
        expect(result.status).toBe('failed');
        expect(result.errors).toContain('Invalid sender email format');
      }
    });

    it('should validate phone number formats', async () => {
      const invalidPhones = ['123', 'abc', '123-abc'];

      for (const phone of invalidPhones) {
        const message = {
          ...testUtils.createMockIncomingMessage(),
          sender: {
            ...testUtils.createMockIncomingMessage().sender,
            phone,
          },
        };

        const result = await messageProcessor.processIncomingMessage(message);
        // Phone validation should produce warnings, not errors
        expect(result.status).toBe('queued'); // Should still process
      }
    });
  });

  describe('error handling', () => {
    it('should handle database errors during message creation', async () => {
      // Arrange
      const incomingMessage = testUtils.createMockIncomingMessage();
      const dbError = new Error('Database connection failed');

      mockRedis.exists.mockResolvedValue(false);
      mockMessageRepository.createMessage.mockRejectedValue(dbError);

      // Act
      const result = await messageProcessor.processIncomingMessage(incomingMessage);

      // Assert
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Database connection failed');
    });

    it('should handle queue publishing errors', async () => {
      // Arrange
      const incomingMessage = testUtils.createMockIncomingMessage();
      const mockSavedMessage = testUtils.createMockMessage();
      const queueError = new Error('Queue connection failed');

      mockRedis.exists.mockResolvedValue(false);
      mockMessageRepository.createMessage.mockResolvedValue(mockSavedMessage);
      mockMessageQueue.publishMessage.mockRejectedValue(queueError);

      // Act
      const result = await messageProcessor.processIncomingMessage(incomingMessage);

      // Assert
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Queue connection failed');
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const incomingMessage = testUtils.createMockIncomingMessage();
      const mockSavedMessage = testUtils.createMockMessage();

      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));
      mockMessageRepository.createMessage.mockResolvedValue(mockSavedMessage);
      mockMessageQueue.publishMessage.mockResolvedValue(true);
      mockRedis.set.mockResolvedValue(true);

      // Act
      const result = await messageProcessor.processIncomingMessage(incomingMessage);

      // Assert
      // Should still process successfully even if Redis fails (fail open)
      expect(result.status).toBe('queued');
    });
  });
});
