/**
 * Notification Queue Service using RabbitMQ
 * Handles notification queue operations for the Notification Service
 */

import amqp, { Connection, Channel, Message } from 'amqplib';
import { config } from '@/config';
import { logger } from '@/utils/logger';

export interface NotificationJob {
  id: string;
  type: 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
  recipientId: string;
  organizationId: string;
  data: {
    to: string | string[];
    subject?: string;
    content: string;
    template?: string;
    templateData?: Record<string, any>;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    scheduledAt?: Date;
    metadata?: Record<string, any>;
  };
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt?: Date;
}

export interface QueueOptions {
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

export class NotificationQueueService {
  private static instance: NotificationQueueService;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;

  // Queue names
  public static readonly QUEUES = {
    EMAIL_NOTIFICATIONS: 'notifications.email',
    SMS_NOTIFICATIONS: 'notifications.sms',
    PUSH_NOTIFICATIONS: 'notifications.push',
    IN_APP_NOTIFICATIONS: 'notifications.in_app',
    WEBHOOK_NOTIFICATIONS: 'notifications.webhook',
    SCHEDULED_NOTIFICATIONS: 'notifications.scheduled',
    FAILED_NOTIFICATIONS: 'notifications.failed',
    NOTIFICATION_DLQ: 'notifications.dlq',
  };

  // Exchange names
  public static readonly EXCHANGES = {
    NOTIFICATION_EVENTS: 'notification.events',
    NOTIFICATION_ROUTING: 'notification.routing',
    SCHEDULED_NOTIFICATIONS: 'notification.scheduled',
  };

  private constructor() {}

  public static getInstance(): NotificationQueueService {
    if (!NotificationQueueService.instance) {
      NotificationQueueService.instance = new NotificationQueueService();
    }
    return NotificationQueueService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      await this.connect();
      await this.setupQueuesAndExchanges();
      logger.info('Notification queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize notification queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
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

      logger.info('Connected to RabbitMQ for notifications', {
        url: config.rabbitmq.url,
        prefetch: config.queue.concurrency,
      });
    } catch (error) {
      this.isConnected = false;
      throw new Error(`Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error('Channel not available');
    }

    try {
      // Create exchanges
      await this.channel.assertExchange(NotificationQueueService.EXCHANGES.NOTIFICATION_EVENTS, 'topic', { durable: true });
      await this.channel.assertExchange(NotificationQueueService.EXCHANGES.NOTIFICATION_ROUTING, 'direct', { durable: true });
      await this.channel.assertExchange(NotificationQueueService.EXCHANGES.SCHEDULED_NOTIFICATIONS, 'x-delayed-message', { 
        durable: true,
        arguments: { 'x-delayed-type': 'direct' }
      });

      // Create queues
      const queueOptions: QueueOptions = { durable: true };
      
      await this.channel.assertQueue(NotificationQueueService.QUEUES.EMAIL_NOTIFICATIONS, queueOptions);
      await this.channel.assertQueue(NotificationQueueService.QUEUES.SMS_NOTIFICATIONS, queueOptions);
      await this.channel.assertQueue(NotificationQueueService.QUEUES.PUSH_NOTIFICATIONS, queueOptions);
      await this.channel.assertQueue(NotificationQueueService.QUEUES.IN_APP_NOTIFICATIONS, queueOptions);
      await this.channel.assertQueue(NotificationQueueService.QUEUES.WEBHOOK_NOTIFICATIONS, queueOptions);
      await this.channel.assertQueue(NotificationQueueService.QUEUES.SCHEDULED_NOTIFICATIONS, queueOptions);
      await this.channel.assertQueue(NotificationQueueService.QUEUES.FAILED_NOTIFICATIONS, queueOptions);
      await this.channel.assertQueue(NotificationQueueService.QUEUES.NOTIFICATION_DLQ, queueOptions);

      // Bind queues to exchanges
      await this.channel.bindQueue(
        NotificationQueueService.QUEUES.EMAIL_NOTIFICATIONS,
        NotificationQueueService.EXCHANGES.NOTIFICATION_ROUTING,
        'email'
      );
      
      await this.channel.bindQueue(
        NotificationQueueService.QUEUES.SMS_NOTIFICATIONS,
        NotificationQueueService.EXCHANGES.NOTIFICATION_ROUTING,
        'sms'
      );

      await this.channel.bindQueue(
        NotificationQueueService.QUEUES.PUSH_NOTIFICATIONS,
        NotificationQueueService.EXCHANGES.NOTIFICATION_ROUTING,
        'push'
      );

      await this.channel.bindQueue(
        NotificationQueueService.QUEUES.IN_APP_NOTIFICATIONS,
        NotificationQueueService.EXCHANGES.NOTIFICATION_ROUTING,
        'in_app'
      );

      await this.channel.bindQueue(
        NotificationQueueService.QUEUES.WEBHOOK_NOTIFICATIONS,
        NotificationQueueService.EXCHANGES.NOTIFICATION_ROUTING,
        'webhook'
      );

      await this.channel.bindQueue(
        NotificationQueueService.QUEUES.SCHEDULED_NOTIFICATIONS,
        NotificationQueueService.EXCHANGES.SCHEDULED_NOTIFICATIONS,
        'scheduled'
      );

      logger.info('Notification queues and exchanges set up successfully');
    } catch (error) {
      throw new Error(`Failed to setup queues and exchanges: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async publishNotification(
    notificationJob: NotificationJob,
    options: { delay?: number; priority?: number } = {}
  ): Promise<boolean> {
    if (!this.channel || !this.isConnected) {
      throw new Error('Queue service not connected');
    }

    try {
      const routingKey = notificationJob.type;
      const messageBuffer = Buffer.from(JSON.stringify(notificationJob));
      
      const publishOptions: any = {
        persistent: true,
        timestamp: Date.now(),
        messageId: notificationJob.id,
        priority: this.getPriorityValue(notificationJob.data.priority),
      };

      if (options.priority) {
        publishOptions.priority = options.priority;
      }

      let exchange = NotificationQueueService.EXCHANGES.NOTIFICATION_ROUTING;
      
      // Handle scheduled notifications
      if (notificationJob.scheduledAt && notificationJob.scheduledAt > new Date()) {
        const delay = notificationJob.scheduledAt.getTime() - Date.now();
        publishOptions.headers = { 'x-delay': delay };
        exchange = NotificationQueueService.EXCHANGES.SCHEDULED_NOTIFICATIONS;
        routingKey = 'scheduled';
      }

      const result = this.channel.publish(exchange, routingKey, messageBuffer, publishOptions);
      
      logger.info('Notification published to queue', {
        notificationId: notificationJob.id,
        type: notificationJob.type,
        recipientId: notificationJob.recipientId,
        scheduled: !!notificationJob.scheduledAt,
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to publish notification', {
        notificationId: notificationJob.id,
        type: notificationJob.type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async consume(
    queue: string,
    handler: (notificationJob: NotificationJob, originalMessage: Message) => Promise<void>,
    options: { noAck?: boolean } = {}
  ): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new Error('Queue service not connected');
    }

    try {
      await this.channel.consume(queue, async (msg) => {
        if (!msg) return;

        try {
          const notificationJob: NotificationJob = JSON.parse(msg.content.toString());
          
          logger.info('Processing notification', {
            notificationId: notificationJob.id,
            type: notificationJob.type,
            queue,
          });
          
          await handler(notificationJob, msg);
          
          if (!options.noAck) {
            this.channel!.ack(msg);
          }
          
          logger.info('Notification processed successfully', {
            notificationId: notificationJob.id,
            type: notificationJob.type,
            queue,
          });
        } catch (error) {
          logger.error('Error processing notification', {
            queue,
            error: error instanceof Error ? error.message : String(error),
          });

          // Handle retry logic
          await this.handleNotificationError(msg, error as Error);
        }
      }, options);

      logger.info(`Started consuming from notification queue: ${queue}`);
    } catch (error) {
      throw new Error(`Failed to start consuming: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleNotificationError(msg: Message, error: Error): Promise<void> {
    if (!this.channel) return;

    try {
      const notificationJob: NotificationJob = JSON.parse(msg.content.toString());
      notificationJob.attempts = (notificationJob.attempts || 0) + 1;

      if (notificationJob.attempts < notificationJob.maxAttempts) {
        // Retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, notificationJob.attempts), 30000);
        
        await this.publishNotification(notificationJob, { delay });
        
        logger.info('Notification queued for retry', {
          notificationId: notificationJob.id,
          type: notificationJob.type,
          attempt: notificationJob.attempts,
          delay,
        });
      } else {
        // Send to failed notifications queue
        const failedNotification = {
          ...notificationJob,
          error: error.message,
          failedAt: new Date(),
        };

        const messageBuffer = Buffer.from(JSON.stringify(failedNotification));
        await this.channel.sendToQueue(
          NotificationQueueService.QUEUES.FAILED_NOTIFICATIONS,
          messageBuffer,
          { persistent: true }
        );
        
        logger.error('Notification moved to failed queue', {
          notificationId: notificationJob.id,
          type: notificationJob.type,
          attempts: notificationJob.attempts,
          error: error.message,
        });
      }

      this.channel.nack(msg, false, false);
    } catch (retryError) {
      logger.error('Error handling notification retry', {
        error: retryError instanceof Error ? retryError.message : String(retryError),
      });
      this.channel.nack(msg, false, false);
    }
  }

  private getPriorityValue(priority: string): number {
    switch (priority) {
      case 'urgent': return 10;
      case 'high': return 7;
      case 'normal': return 5;
      case 'low': return 1;
      default: return 5;
    }
  }

  public async getQueueInfo(queue: string): Promise<any> {
    if (!this.channel || !this.isConnected) {
      throw new Error('Queue service not connected');
    }

    try {
      return await this.channel.checkQueue(queue);
    } catch (error) {
      throw new Error(`Failed to get queue info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async purgeQueue(queue: string): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new Error('Queue service not connected');
    }

    try {
      await this.channel.purgeQueue(queue);
      logger.info(`Purged notification queue: ${queue}`);
    } catch (error) {
      throw new Error(`Failed to purge queue: ${error instanceof Error ? error.message : String(error)}`);
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
      logger.info('Notification queue service closed');
    } catch (error) {
      logger.error('Error closing notification queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Export singleton instance
export const notificationQueue = NotificationQueueService.getInstance();
