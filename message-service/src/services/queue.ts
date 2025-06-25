/**
 * Message Queue Service using RabbitMQ
 * Handles message queue operations for the Message Service
 */

import amqp, { Connection, Channel, Message } from 'amqplib';
import { config } from '@/config';
import { logger, queueLogger, logQueueJob, logQueueError } from '@/utils/logger';
import { QueueError } from '@/utils/errors';

export interface QueueMessage {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  attempts: number;
  maxAttempts: number;
  delay?: number;
}

export interface QueueOptions {
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

export interface ConsumeOptions {
  noAck?: boolean;
  exclusive?: boolean;
  priority?: number;
  arguments?: any;
}

export class MessageQueueService {
  private static instance: MessageQueueService;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;

  // Queue names
  public static readonly QUEUES = {
    MESSAGE_PROCESSING: 'message.processing',
    MESSAGE_ROUTING: 'message.routing',
    MESSAGE_DELIVERY: 'message.delivery',
    MESSAGE_RETRY: 'message.retry',
    MESSAGE_DLQ: 'message.dlq', // Dead Letter Queue
    WEBHOOK_DELIVERY: 'webhook.delivery',
    AI_PROCESSING: 'ai.processing',
  };

  // Exchange names
  public static readonly EXCHANGES = {
    MESSAGE_EVENTS: 'message.events',
    MESSAGE_ROUTING: 'message.routing',
    WEBHOOK_EVENTS: 'webhook.events',
  };

  private constructor() {}

  public static getInstance(): MessageQueueService {
    if (!MessageQueueService.instance) {
      MessageQueueService.instance = new MessageQueueService();
    }
    return MessageQueueService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      await this.connect();
      await this.setupQueuesAndExchanges();
      logger.info('Message queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize message queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new QueueError('Failed to initialize message queue service');
    }
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Set up connection event handlers
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));

      // Set prefetch count for fair dispatch
      await this.channel.prefetch(config.queue.concurrency);

      logger.info('Connected to RabbitMQ', {
        url: config.rabbitmq.url,
        prefetch: config.queue.concurrency,
      });
    } catch (error) {
      this.isConnected = false;
      throw new QueueError(`Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleConnectionError(error: Error): Promise<void> {
    logger.error('RabbitMQ connection error', { error: error.message });
    this.isConnected = false;
    await this.reconnect();
  }

  private async handleConnectionClose(): Promise<void> {
    logger.warn('RabbitMQ connection closed');
    this.isConnected = false;
    await this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
        await this.setupQueuesAndExchanges();
        logger.info('Successfully reconnected to RabbitMQ');
      } catch (error) {
        logger.error('Reconnection failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        await this.reconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private async setupQueuesAndExchanges(): Promise<void> {
    if (!this.channel) {
      throw new QueueError('Channel not available');
    }

    try {
      // Create exchanges
      await this.channel.assertExchange(MessageQueueService.EXCHANGES.MESSAGE_EVENTS, 'topic', { durable: true });
      await this.channel.assertExchange(MessageQueueService.EXCHANGES.MESSAGE_ROUTING, 'direct', { durable: true });
      await this.channel.assertExchange(MessageQueueService.EXCHANGES.WEBHOOK_EVENTS, 'topic', { durable: true });

      // Create queues
      const queueOptions: QueueOptions = { durable: true };
      
      await this.channel.assertQueue(MessageQueueService.QUEUES.MESSAGE_PROCESSING, queueOptions);
      await this.channel.assertQueue(MessageQueueService.QUEUES.MESSAGE_ROUTING, queueOptions);
      await this.channel.assertQueue(MessageQueueService.QUEUES.MESSAGE_DELIVERY, queueOptions);
      await this.channel.assertQueue(MessageQueueService.QUEUES.MESSAGE_RETRY, queueOptions);
      await this.channel.assertQueue(MessageQueueService.QUEUES.MESSAGE_DLQ, queueOptions);
      await this.channel.assertQueue(MessageQueueService.QUEUES.WEBHOOK_DELIVERY, queueOptions);
      await this.channel.assertQueue(MessageQueueService.QUEUES.AI_PROCESSING, queueOptions);

      // Bind queues to exchanges
      await this.channel.bindQueue(
        MessageQueueService.QUEUES.MESSAGE_PROCESSING,
        MessageQueueService.EXCHANGES.MESSAGE_EVENTS,
        'message.received'
      );
      
      await this.channel.bindQueue(
        MessageQueueService.QUEUES.MESSAGE_ROUTING,
        MessageQueueService.EXCHANGES.MESSAGE_ROUTING,
        'route'
      );

      await this.channel.bindQueue(
        MessageQueueService.QUEUES.WEBHOOK_DELIVERY,
        MessageQueueService.EXCHANGES.WEBHOOK_EVENTS,
        'webhook.*'
      );

      logger.info('Queues and exchanges set up successfully');
    } catch (error) {
      throw new QueueError(`Failed to setup queues and exchanges: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async publishMessage(
    queue: string,
    message: QueueMessage,
    options: { delay?: number; priority?: number } = {}
  ): Promise<boolean> {
    if (!this.channel || !this.isConnected) {
      throw new QueueError('Queue service not connected');
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const publishOptions: any = {
        persistent: true,
        timestamp: Date.now(),
        messageId: message.id,
      };

      if (options.priority) {
        publishOptions.priority = options.priority;
      }

      if (options.delay) {
        // Use delayed message plugin or implement delay logic
        publishOptions.headers = { 'x-delay': options.delay };
      }

      const result = await this.channel.sendToQueue(queue, messageBuffer, publishOptions);
      
      logQueueJob(message.id, message.type, 'published', { queue });
      
      return result;
    } catch (error) {
      logQueueError(message.id, message.type, error as Error, { queue });
      throw new QueueError(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async publishToExchange(
    exchange: string,
    routingKey: string,
    message: QueueMessage,
    options: { priority?: number } = {}
  ): Promise<boolean> {
    if (!this.channel || !this.isConnected) {
      throw new QueueError('Queue service not connected');
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const publishOptions: any = {
        persistent: true,
        timestamp: Date.now(),
        messageId: message.id,
      };

      if (options.priority) {
        publishOptions.priority = options.priority;
      }

      const result = this.channel.publish(exchange, routingKey, messageBuffer, publishOptions);
      
      logQueueJob(message.id, message.type, 'published_to_exchange', { exchange, routingKey });
      
      return result;
    } catch (error) {
      logQueueError(message.id, message.type, error as Error, { exchange, routingKey });
      throw new QueueError(`Failed to publish to exchange: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async consume(
    queue: string,
    handler: (message: QueueMessage, originalMessage: Message) => Promise<void>,
    options: ConsumeOptions = {}
  ): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new QueueError('Queue service not connected');
    }

    try {
      await this.channel.consume(queue, async (msg) => {
        if (!msg) return;

        try {
          const queueMessage: QueueMessage = JSON.parse(msg.content.toString());
          
          logQueueJob(queueMessage.id, queueMessage.type, 'processing_started', { queue });
          
          await handler(queueMessage, msg);
          
          if (!options.noAck) {
            this.channel!.ack(msg);
          }
          
          logQueueJob(queueMessage.id, queueMessage.type, 'processing_completed', { queue });
        } catch (error) {
          logger.error('Error processing queue message', {
            queue,
            error: error instanceof Error ? error.message : String(error),
          });

          // Handle retry logic
          await this.handleMessageError(msg, error as Error);
        }
      }, options);

      logger.info(`Started consuming from queue: ${queue}`);
    } catch (error) {
      throw new QueueError(`Failed to start consuming: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleMessageError(msg: Message, error: Error): Promise<void> {
    if (!this.channel) return;

    try {
      const queueMessage: QueueMessage = JSON.parse(msg.content.toString());
      queueMessage.attempts = (queueMessage.attempts || 0) + 1;

      if (queueMessage.attempts < queueMessage.maxAttempts) {
        // Retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, queueMessage.attempts), 30000);
        
        await this.publishMessage(MessageQueueService.QUEUES.MESSAGE_RETRY, queueMessage, { delay });
        
        logQueueJob(queueMessage.id, queueMessage.type, 'retrying', {
          attempt: queueMessage.attempts,
          delay,
        });
      } else {
        // Send to dead letter queue
        await this.publishMessage(MessageQueueService.QUEUES.MESSAGE_DLQ, {
          ...queueMessage,
          error: error.message,
          failedAt: new Date(),
        });
        
        logQueueJob(queueMessage.id, queueMessage.type, 'moved_to_dlq', {
          attempts: queueMessage.attempts,
        });
      }

      this.channel.nack(msg, false, false);
    } catch (retryError) {
      logger.error('Error handling message retry', {
        error: retryError instanceof Error ? retryError.message : String(retryError),
      });
      this.channel.nack(msg, false, false);
    }
  }

  public async getQueueInfo(queue: string): Promise<any> {
    if (!this.channel || !this.isConnected) {
      throw new QueueError('Queue service not connected');
    }

    try {
      return await this.channel.checkQueue(queue);
    } catch (error) {
      throw new QueueError(`Failed to get queue info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async purgeQueue(queue: string): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new QueueError('Queue service not connected');
    }

    try {
      await this.channel.purgeQueue(queue);
      logger.info(`Purged queue: ${queue}`);
    } catch (error) {
      throw new QueueError(`Failed to purge queue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      return this.isConnected && this.connection !== null && this.channel !== null;
    } catch (error) {
      return false;
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.isConnected = false;
      logger.info('Message queue service closed');
    } catch (error) {
      logger.error('Error closing message queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Export singleton instance
export const messageQueue = MessageQueueService.getInstance();
