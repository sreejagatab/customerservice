/**
 * Unit Tests for Message Queue Service
 */

import { MessageQueueService } from '../../services/queue';
import { logger } from '../../utils/logger';
import amqp from 'amqplib';

// Mock dependencies
jest.mock('amqplib');
jest.mock('../../utils/logger');

const mockAmqp = amqp as jest.Mocked<typeof amqp>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('MessageQueueService', () => {
  let messageQueue: MessageQueueService;
  let mockConnection: any;
  let mockChannel: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock AMQP connection and channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
      bindQueue: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockReturnValue(true),
      sendToQueue: jest.fn().mockReturnValue(true),
      consume: jest.fn().mockResolvedValue({}),
      ack: jest.fn(),
      nack: jest.fn(),
      prefetch: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue({}),
      checkQueue: jest.fn().mockResolvedValue({ messageCount: 0, consumerCount: 0 }),
      purgeQueue: jest.fn().mockResolvedValue({ messageCount: 0 }),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue({}),
      on: jest.fn(),
    };

    mockAmqp.connect.mockResolvedValue(mockConnection);

    messageQueue = MessageQueueService.getInstance();
  });

  afterEach(() => {
    MessageQueueService.resetInstance();
  });

  describe('initialization', () => {
    it('should initialize connection and channel successfully', async () => {
      // Act
      await messageQueue.initialize();

      // Assert
      expect(mockAmqp.connect).toHaveBeenCalledWith(
        expect.stringContaining('amqp://'),
        expect.any(Object)
      );
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
      expect(mockLogger.info).toHaveBeenCalledWith('Message queue service initialized');
    });

    it('should handle connection errors gracefully', async () => {
      // Arrange
      const connectionError = new Error('Connection failed');
      mockAmqp.connect.mockRejectedValue(connectionError);

      // Act & Assert
      await expect(messageQueue.initialize()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize message queue',
        expect.objectContaining({
          error: 'Connection failed',
        })
      );
    });

    it('should setup exchanges and queues during initialization', async () => {
      // Act
      await messageQueue.initialize();

      // Assert
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        MessageQueueService.EXCHANGES.MESSAGE_EVENTS,
        'topic',
        { durable: true }
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        MessageQueueService.QUEUES.MESSAGE_PROCESSING,
        { durable: true }
      );
    });
  });

  describe('publishMessage', () => {
    beforeEach(async () => {
      await messageQueue.initialize();
    });

    it('should publish message to queue successfully', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const message = { id: 'msg_123', content: 'test message' };

      // Act
      const result = await messageQueue.publishMessage(queueName, message);

      // Assert
      expect(result).toBe(true);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        queueName,
        expect.any(Buffer),
        { persistent: true }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message published to queue',
        expect.objectContaining({
          queue: queueName,
          messageId: message.id,
        })
      );
    });

    it('should handle publish failures', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const message = { id: 'msg_123', content: 'test message' };
      mockChannel.sendToQueue.mockReturnValue(false);

      // Act
      const result = await messageQueue.publishMessage(queueName, message);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to publish message to queue',
        expect.objectContaining({
          queue: queueName,
          messageId: message.id,
        })
      );
    });

    it('should throw error when not initialized', async () => {
      // Arrange
      const uninitializedQueue = new MessageQueueService();
      const message = { id: 'msg_123', content: 'test message' };

      // Act & Assert
      await expect(
        uninitializedQueue.publishMessage(MessageQueueService.QUEUES.MESSAGE_PROCESSING, message)
      ).rejects.toThrow('Message queue not initialized');
    });
  });

  describe('publishToExchange', () => {
    beforeEach(async () => {
      await messageQueue.initialize();
    });

    it('should publish message to exchange successfully', async () => {
      // Arrange
      const exchange = MessageQueueService.EXCHANGES.MESSAGE_EVENTS;
      const routingKey = 'message.created';
      const message = { id: 'msg_123', event: 'created' };

      // Act
      const result = await messageQueue.publishToExchange(exchange, routingKey, message);

      // Assert
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        exchange,
        routingKey,
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should handle exchange publish failures', async () => {
      // Arrange
      const exchange = MessageQueueService.EXCHANGES.MESSAGE_EVENTS;
      const routingKey = 'message.created';
      const message = { id: 'msg_123', event: 'created' };
      mockChannel.publish.mockReturnValue(false);

      // Act
      const result = await messageQueue.publishToExchange(exchange, routingKey, message);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to publish message to exchange',
        expect.objectContaining({
          exchange,
          routingKey,
          messageId: message.id,
        })
      );
    });
  });

  describe('consume', () => {
    beforeEach(async () => {
      await messageQueue.initialize();
    });

    it('should start consuming messages from queue', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const processor = jest.fn().mockResolvedValue(undefined);
      const options = { noAck: false };

      // Act
      await messageQueue.consume(queueName, processor, options);

      // Assert
      expect(mockChannel.consume).toHaveBeenCalledWith(
        queueName,
        expect.any(Function),
        options
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started consuming messages',
        expect.objectContaining({
          queue: queueName,
        })
      );
    });

    it('should process messages and acknowledge them', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const processor = jest.fn().mockResolvedValue(undefined);
      const mockMessage = {
        content: Buffer.from(JSON.stringify({ id: 'msg_123' })),
        properties: {},
        fields: {},
      };

      let messageHandler: Function;
      mockChannel.consume.mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({});
      });

      // Act
      await messageQueue.consume(queueName, processor, { noAck: false });
      await messageHandler(mockMessage);

      // Assert
      expect(processor).toHaveBeenCalledWith({ id: 'msg_123' });
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should handle processing errors and nack messages', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const processingError = new Error('Processing failed');
      const processor = jest.fn().mockRejectedValue(processingError);
      const mockMessage = {
        content: Buffer.from(JSON.stringify({ id: 'msg_123' })),
        properties: {},
        fields: {},
      };

      let messageHandler: Function;
      mockChannel.consume.mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({});
      });

      // Act
      await messageQueue.consume(queueName, processor, { noAck: false });
      await messageHandler(mockMessage);

      // Assert
      expect(processor).toHaveBeenCalledWith({ id: 'msg_123' });
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing message',
        expect.objectContaining({
          error: 'Processing failed',
          messageId: 'msg_123',
        })
      );
    });
  });

  describe('getQueueInfo', () => {
    beforeEach(async () => {
      await messageQueue.initialize();
    });

    it('should return queue information', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const mockQueueInfo = { messageCount: 5, consumerCount: 2 };
      mockChannel.checkQueue.mockResolvedValue(mockQueueInfo);

      // Act
      const result = await messageQueue.getQueueInfo(queueName);

      // Assert
      expect(result).toEqual(mockQueueInfo);
      expect(mockChannel.checkQueue).toHaveBeenCalledWith(queueName);
    });

    it('should handle queue check errors', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const checkError = new Error('Queue not found');
      mockChannel.checkQueue.mockRejectedValue(checkError);

      // Act & Assert
      await expect(messageQueue.getQueueInfo(queueName)).rejects.toThrow('Queue not found');
    });
  });

  describe('purgeQueue', () => {
    beforeEach(async () => {
      await messageQueue.initialize();
    });

    it('should purge queue successfully', async () => {
      // Arrange
      const queueName = MessageQueueService.QUEUES.MESSAGE_PROCESSING;
      const mockPurgeResult = { messageCount: 10 };
      mockChannel.purgeQueue.mockResolvedValue(mockPurgeResult);

      // Act
      const result = await messageQueue.purgeQueue(queueName);

      // Assert
      expect(result).toEqual(mockPurgeResult);
      expect(mockChannel.purgeQueue).toHaveBeenCalledWith(queueName);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Queue purged',
        expect.objectContaining({
          queue: queueName,
          messageCount: 10,
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when connection is healthy', async () => {
      // Arrange
      await messageQueue.initialize();

      // Act
      const result = await messageQueue.healthCheck();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when not initialized', async () => {
      // Arrange
      const uninitializedQueue = new MessageQueueService();

      // Act
      const result = await uninitializedQueue.healthCheck();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('close', () => {
    it('should close connection and channel', async () => {
      // Arrange
      await messageQueue.initialize();

      // Act
      await messageQueue.close();

      // Assert
      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Message queue service closed');
    });

    it('should handle close errors gracefully', async () => {
      // Arrange
      await messageQueue.initialize();
      const closeError = new Error('Close failed');
      mockChannel.close.mockRejectedValue(closeError);

      // Act
      await messageQueue.close();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error closing message queue',
        expect.objectContaining({
          error: 'Close failed',
        })
      );
    });
  });
});
