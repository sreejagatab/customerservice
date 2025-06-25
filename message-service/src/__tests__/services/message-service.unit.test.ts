/**
 * Unit Tests for Message Service
 * Tests individual functions and methods in isolation
 */

import { MessageService } from '../../services/message-service';
import { MessageProcessor } from '../../services/message-processor';
import { MessageValidator } from '../../utils/message-validator';
import { redis } from '../../services/redis';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../services/redis');
jest.mock('../../utils/logger');
jest.mock('../../services/message-processor');

describe('MessageService', () => {
  let messageService: MessageService;
  let mockRedis: jest.Mocked<typeof redis>;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create service instance
    messageService = MessageService.getInstance();
    
    // Setup mock implementations
    mockRedis = redis as jest.Mocked<typeof redis>;
    mockLogger = logger as jest.Mocked<typeof logger>;
    
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
  });

  describe('createMessage', () => {
    it('should create a new message successfully', async () => {
      // Arrange
      const messageData = {
        organizationId: 'org_123',
        conversationId: 'conv_123',
        content: 'Test message',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'email' as const,
        metadata: { source: 'test' },
      };

      const expectedMessage = {
        id: expect.any(String),
        ...messageData,
        status: 'pending',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      };

      // Act
      const result = await messageService.createMessage(messageData, 'user_123');

      // Assert
      expect(result).toMatchObject(expectedMessage);
      expect(result.id).toBeValidUUID();
      expect(result.createdAt).toBeWithinTimeRange(new Date());
      expect(mockRedis.set).toHaveBeenCalledWith(
        `message:${result.id}`,
        expect.any(Object),
        { ttl: 86400 }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message created',
        expect.objectContaining({
          messageId: result.id,
          organizationId: messageData.organizationId,
        })
      );
    });

    it('should validate message data before creation', async () => {
      // Arrange
      const invalidMessageData = {
        organizationId: '', // Invalid: empty string
        conversationId: 'conv_123',
        content: '',
        type: 'invalid' as any,
        direction: 'inbound' as const,
        channel: 'email' as const,
      };

      // Act & Assert
      await expect(
        messageService.createMessage(invalidMessageData, 'user_123')
      ).rejects.toThrow('Invalid message data');
    });

    it('should handle creation errors gracefully', async () => {
      // Arrange
      const messageData = global.testUtils.generateTestMessage();
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(
        messageService.createMessage(messageData, 'user_123')
      ).rejects.toThrow('Redis error');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error creating message',
        expect.objectContaining({
          error: 'Redis error',
        })
      );
    });
  });

  describe('getMessage', () => {
    it('should retrieve message from cache first', async () => {
      // Arrange
      const messageId = 'msg_123';
      const cachedMessage = global.testUtils.generateTestMessage();
      mockRedis.get.mockResolvedValue(cachedMessage);

      // Act
      const result = await messageService.getMessage(messageId);

      // Assert
      expect(result).toEqual(cachedMessage);
      expect(mockRedis.get).toHaveBeenCalledWith(`message:${messageId}`);
    });

    it('should return null for non-existent message', async () => {
      // Arrange
      const messageId = 'non_existent';
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await messageService.getMessage(messageId);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle retrieval errors', async () => {
      // Arrange
      const messageId = 'msg_123';
      mockRedis.get.mockRejectedValue(new Error('Redis connection error'));

      // Act & Assert
      await expect(messageService.getMessage(messageId)).rejects.toThrow('Redis connection error');
    });
  });

  describe('updateMessageStatus', () => {
    it('should update message status successfully', async () => {
      // Arrange
      const messageId = 'msg_123';
      const existingMessage = global.testUtils.generateTestMessage();
      const newStatus = 'delivered';
      
      mockRedis.get.mockResolvedValue(existingMessage);

      // Act
      const result = await messageService.updateMessageStatus(messageId, newStatus);

      // Assert
      expect(result).toBeTruthy();
      expect(mockRedis.set).toHaveBeenCalledWith(
        `message:${messageId}`,
        expect.objectContaining({
          status: newStatus,
          updatedAt: expect.any(Date),
        }),
        { ttl: 86400 }
      );
    });

    it('should return false for non-existent message', async () => {
      // Arrange
      const messageId = 'non_existent';
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await messageService.updateMessageStatus(messageId, 'delivered');

      // Assert
      expect(result).toBeFalsy();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('searchMessages', () => {
    it('should search messages with filters', async () => {
      // Arrange
      const filters = {
        organizationId: 'org_123',
        conversationId: 'conv_123',
        status: 'delivered' as const,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
      };
      const pagination = { page: 1, limit: 10 };

      const mockMessages = [
        global.testUtils.generateTestMessage(),
        global.testUtils.generateTestMessage(),
      ];

      // Mock database query (would be implemented in actual service)
      jest.spyOn(messageService as any, 'queryDatabase').mockResolvedValue({
        messages: mockMessages,
        total: 2,
      });

      // Act
      const result = await messageService.searchMessages(filters, pagination);

      // Assert
      expect(result).toEqual({
        messages: mockMessages,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should handle empty search results', async () => {
      // Arrange
      const filters = { organizationId: 'org_123' };
      const pagination = { page: 1, limit: 10 };

      jest.spyOn(messageService as any, 'queryDatabase').mockResolvedValue({
        messages: [],
        total: 0,
      });

      // Act
      const result = await messageService.searchMessages(filters, pagination);

      // Assert
      expect(result.messages).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('deleteMessage', () => {
    it('should delete message successfully', async () => {
      // Arrange
      const messageId = 'msg_123';
      const existingMessage = global.testUtils.generateTestMessage();
      mockRedis.get.mockResolvedValue(existingMessage);

      // Act
      const result = await messageService.deleteMessage(messageId);

      // Assert
      expect(result).toBeTruthy();
      expect(mockRedis.del).toHaveBeenCalledWith(`message:${messageId}`);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message deleted',
        expect.objectContaining({ messageId })
      );
    });

    it('should return false for non-existent message', async () => {
      // Arrange
      const messageId = 'non_existent';
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await messageService.deleteMessage(messageId);

      // Assert
      expect(result).toBeFalsy();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('getMessageStatistics', () => {
    it('should return message statistics', async () => {
      // Arrange
      const organizationId = 'org_123';
      const timeRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-12-31'),
      };

      const mockStats = {
        totalMessages: 1000,
        messagesByStatus: {
          pending: 10,
          processing: 5,
          delivered: 950,
          failed: 35,
        },
        messagesByChannel: {
          email: 600,
          sms: 200,
          chat: 150,
          voice: 50,
        },
        messagesByDirection: {
          inbound: 700,
          outbound: 300,
        },
        averageProcessingTime: 1.5,
        peakHours: [9, 10, 11, 14, 15, 16],
      };

      jest.spyOn(messageService as any, 'aggregateStatistics').mockResolvedValue(mockStats);

      // Act
      const result = await messageService.getMessageStatistics(organizationId, timeRange);

      // Assert
      expect(result).toEqual(mockStats);
      expect(result.totalMessages).toBeGreaterThan(0);
      expect(result.messagesByStatus).toHaveProperty('delivered');
      expect(result.averageProcessingTime).toBeGreaterThan(0);
    });
  });

  describe('validateMessage', () => {
    it('should validate correct message structure', () => {
      // Arrange
      const validMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_123',
        content: 'Valid message content',
        type: 'text',
        direction: 'inbound',
        channel: 'email',
      };

      // Act
      const isValid = MessageValidator.validate(validMessage);

      // Assert
      expect(isValid).toBeTruthy();
    });

    it('should reject invalid message structure', () => {
      // Arrange
      const invalidMessage = {
        organizationId: '', // Empty string
        content: '', // Empty content
        type: 'invalid_type',
        direction: 'invalid_direction',
      };

      // Act
      const isValid = MessageValidator.validate(invalidMessage);

      // Assert
      expect(isValid).toBeFalsy();
    });
  });

  describe('error handling', () => {
    it('should handle network timeouts gracefully', async () => {
      // Arrange
      const messageData = global.testUtils.generateTestMessage();
      mockRedis.set.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      // Act & Assert
      await expect(
        messageService.createMessage(messageData, 'user_123')
      ).rejects.toThrow('Timeout');
    });

    it('should retry failed operations', async () => {
      // Arrange
      const messageId = 'msg_123';
      let callCount = 0;
      
      mockRedis.get.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve(global.testUtils.generateTestMessage());
      });

      // Act
      const result = await global.testUtils.retry(
        () => messageService.getMessage(messageId),
        3
      );

      // Assert
      expect(result).toBeTruthy();
      expect(callCount).toBe(3);
    });
  });

  describe('performance', () => {
    it('should handle bulk message creation efficiently', async () => {
      // Arrange
      const messageCount = 100;
      const messages = Array.from({ length: messageCount }, () => 
        global.testUtils.generateTestMessage()
      );

      const startTime = Date.now();

      // Act
      const results = await Promise.all(
        messages.map(msg => messageService.createMessage(msg, 'user_123'))
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(results).toHaveLength(messageCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(results.every(result => result.id)).toBeTruthy();
    });

    it('should cache frequently accessed messages', async () => {
      // Arrange
      const messageId = 'msg_123';
      const message = global.testUtils.generateTestMessage();
      mockRedis.get.mockResolvedValue(message);

      // Act - Access same message multiple times
      await messageService.getMessage(messageId);
      await messageService.getMessage(messageId);
      await messageService.getMessage(messageId);

      // Assert - Should use cache, not hit database multiple times
      expect(mockRedis.get).toHaveBeenCalledTimes(3);
    });
  });
});

// Integration test helpers
export const messageServiceTestHelpers = {
  createTestMessage: async (overrides: any = {}) => {
    const messageService = MessageService.getInstance();
    const messageData = {
      ...global.testUtils.generateTestMessage(),
      ...overrides,
    };
    return await messageService.createMessage(messageData, 'test_user');
  },

  cleanupTestMessages: async (messageIds: string[]) => {
    const messageService = MessageService.getInstance();
    await Promise.all(
      messageIds.map(id => messageService.deleteMessage(id))
    );
  },

  waitForMessageProcessing: async (messageId: string, timeout: number = 5000) => {
    const messageService = MessageService.getInstance();
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const message = await messageService.getMessage(messageId);
      if (message && message.status !== 'pending') {
        return message;
      }
      await global.testUtils.waitFor(100);
    }
    
    throw new Error(`Message ${messageId} not processed within ${timeout}ms`);
  },
};
