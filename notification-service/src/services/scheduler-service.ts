/**
 * Notification Scheduler Service
 * Handles scheduled notifications, recurring notifications, and time-based delivery
 */

import { CronJob } from 'cron';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';
import { notificationQueue, NotificationJob } from '@/services/notification-queue';

export interface ScheduledNotification {
  id: string;
  organizationId: string;
  recipientId: string;
  type: 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
  templateId?: string;
  data: {
    to: string | string[];
    subject?: string;
    content: string;
    templateData?: Record<string, any>;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    metadata?: Record<string, any>;
  };
  schedule: {
    type: 'once' | 'recurring';
    scheduledAt?: Date;
    cronExpression?: string;
    timezone: string;
    endDate?: Date;
    maxOccurrences?: number;
  };
  status: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
  executionCount: number;
}

export interface SchedulerStats {
  totalScheduled: number;
  activeSchedules: number;
  pendingExecutions: number;
  completedToday: number;
  failedToday: number;
}

export class NotificationSchedulerService {
  private static instance: NotificationSchedulerService;
  private cronJobs: Map<string, CronJob> = new Map();
  private isRunning: boolean = false;

  private constructor() {}

  public static getInstance(): NotificationSchedulerService {
    if (!NotificationSchedulerService.instance) {
      NotificationSchedulerService.instance = new NotificationSchedulerService();
    }
    return NotificationSchedulerService.instance;
  }

  /**
   * Initialize the scheduler service
   */
  public async initialize(): Promise<void> {
    try {
      if (!config.features.notificationScheduling) {
        logger.info('Notification scheduling is disabled');
        return;
      }

      // Load existing scheduled notifications
      await this.loadScheduledNotifications();

      // Start cleanup job
      this.startCleanupJob();

      this.isRunning = true;
      logger.info('Notification scheduler service initialized');
    } catch (error) {
      logger.error('Failed to initialize notification scheduler service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Schedule a notification
   */
  public async scheduleNotification(notification: Omit<ScheduledNotification, 'id' | 'createdAt' | 'updatedAt' | 'executionCount'>): Promise<ScheduledNotification> {
    try {
      const scheduledNotification: ScheduledNotification = {
        ...notification,
        id: this.generateScheduleId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        executionCount: 0,
      };

      // Calculate next execution time
      scheduledNotification.nextExecutionAt = this.calculateNextExecution(scheduledNotification.schedule);

      // Validate schedule
      this.validateSchedule(scheduledNotification.schedule);

      // Save to storage
      await this.saveScheduledNotification(scheduledNotification);

      // Set up cron job for recurring notifications
      if (scheduledNotification.schedule.type === 'recurring') {
        await this.setupCronJob(scheduledNotification);
      } else {
        // Schedule one-time notification
        await this.scheduleOneTimeNotification(scheduledNotification);
      }

      logger.info('Notification scheduled', {
        scheduleId: scheduledNotification.id,
        type: scheduledNotification.type,
        scheduleType: scheduledNotification.schedule.type,
        nextExecution: scheduledNotification.nextExecutionAt,
      });

      return scheduledNotification;
    } catch (error) {
      logger.error('Failed to schedule notification', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel a scheduled notification
   */
  public async cancelScheduledNotification(scheduleId: string): Promise<boolean> {
    try {
      const notification = await this.getScheduledNotification(scheduleId);
      if (!notification) {
        return false;
      }

      // Stop cron job if exists
      const cronJob = this.cronJobs.get(scheduleId);
      if (cronJob) {
        cronJob.stop();
        this.cronJobs.delete(scheduleId);
      }

      // Update status
      notification.status = 'cancelled';
      notification.updatedAt = new Date();
      await this.saveScheduledNotification(notification);

      // Remove from Redis queue if it's a one-time notification
      await redis.del(`scheduled_notification:${scheduleId}`);

      logger.info('Scheduled notification cancelled', { scheduleId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel scheduled notification', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Pause a scheduled notification
   */
  public async pauseScheduledNotification(scheduleId: string): Promise<boolean> {
    try {
      const notification = await this.getScheduledNotification(scheduleId);
      if (!notification) {
        return false;
      }

      // Stop cron job if exists
      const cronJob = this.cronJobs.get(scheduleId);
      if (cronJob) {
        cronJob.stop();
      }

      // Update status
      notification.status = 'paused';
      notification.updatedAt = new Date();
      await this.saveScheduledNotification(notification);

      logger.info('Scheduled notification paused', { scheduleId });
      return true;
    } catch (error) {
      logger.error('Failed to pause scheduled notification', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Resume a paused scheduled notification
   */
  public async resumeScheduledNotification(scheduleId: string): Promise<boolean> {
    try {
      const notification = await this.getScheduledNotification(scheduleId);
      if (!notification || notification.status !== 'paused') {
        return false;
      }

      // Update status
      notification.status = 'active';
      notification.updatedAt = new Date();
      notification.nextExecutionAt = this.calculateNextExecution(notification.schedule);
      await this.saveScheduledNotification(notification);

      // Restart cron job if recurring
      if (notification.schedule.type === 'recurring') {
        await this.setupCronJob(notification);
      } else {
        await this.scheduleOneTimeNotification(notification);
      }

      logger.info('Scheduled notification resumed', { scheduleId });
      return true;
    } catch (error) {
      logger.error('Failed to resume scheduled notification', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get scheduled notification by ID
   */
  public async getScheduledNotification(scheduleId: string): Promise<ScheduledNotification | null> {
    try {
      const cacheKey = `scheduled_notification:${scheduleId}`;
      const cached = await redis.get<ScheduledNotification>(cacheKey);
      
      if (cached) {
        return cached;
      }

      // TODO: Load from database
      return null;
    } catch (error) {
      logger.error('Failed to get scheduled notification', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * List scheduled notifications
   */
  public async listScheduledNotifications(
    organizationId: string,
    filters: {
      status?: string;
      type?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ notifications: ScheduledNotification[]; total: number }> {
    try {
      // TODO: Implement database query with filters
      // For now, return empty result
      return {
        notifications: [],
        total: 0,
      };
    } catch (error) {
      logger.error('Failed to list scheduled notifications', {
        organizationId,
        filters,
        error: error instanceof Error ? error.message : String(error),
      });
      return { notifications: [], total: 0 };
    }
  }

  /**
   * Get scheduler statistics
   */
  public async getSchedulerStats(organizationId?: string): Promise<SchedulerStats> {
    try {
      // TODO: Implement stats calculation from database
      return {
        totalScheduled: 0,
        activeSchedules: 0,
        pendingExecutions: 0,
        completedToday: 0,
        failedToday: 0,
      };
    } catch (error) {
      logger.error('Failed to get scheduler stats', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalScheduled: 0,
        activeSchedules: 0,
        pendingExecutions: 0,
        completedToday: 0,
        failedToday: 0,
      };
    }
  }

  /**
   * Execute a scheduled notification
   */
  private async executeScheduledNotification(notification: ScheduledNotification): Promise<void> {
    try {
      // Check if notification should still be executed
      if (notification.status !== 'active') {
        return;
      }

      // Check max occurrences
      if (notification.schedule.maxOccurrences && 
          notification.executionCount >= notification.schedule.maxOccurrences) {
        notification.status = 'completed';
        await this.saveScheduledNotification(notification);
        return;
      }

      // Check end date
      if (notification.schedule.endDate && new Date() > notification.schedule.endDate) {
        notification.status = 'completed';
        await this.saveScheduledNotification(notification);
        return;
      }

      // Create notification job
      const notificationJob: NotificationJob = {
        id: `scheduled_${notification.id}_${Date.now()}`,
        type: notification.type,
        recipientId: notification.recipientId,
        organizationId: notification.organizationId,
        data: notification.data,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date(),
        scheduledAt: new Date(),
      };

      // Queue the notification
      await notificationQueue.publishNotification(notificationJob);

      // Update execution tracking
      notification.executionCount++;
      notification.lastExecutedAt = new Date();
      notification.nextExecutionAt = this.calculateNextExecution(notification.schedule);
      notification.updatedAt = new Date();

      // Mark as completed if it's a one-time notification
      if (notification.schedule.type === 'once') {
        notification.status = 'completed';
      }

      await this.saveScheduledNotification(notification);

      logger.info('Scheduled notification executed', {
        scheduleId: notification.id,
        executionCount: notification.executionCount,
        nextExecution: notification.nextExecutionAt,
      });
    } catch (error) {
      logger.error('Failed to execute scheduled notification', {
        scheduleId: notification.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Mark as failed
      notification.status = 'failed';
      notification.updatedAt = new Date();
      await this.saveScheduledNotification(notification);
    }
  }

  /**
   * Setup cron job for recurring notification
   */
  private async setupCronJob(notification: ScheduledNotification): Promise<void> {
    if (!notification.schedule.cronExpression) {
      throw new Error('Cron expression required for recurring notifications');
    }

    try {
      // Stop existing job if any
      const existingJob = this.cronJobs.get(notification.id);
      if (existingJob) {
        existingJob.stop();
      }

      // Create new cron job
      const cronJob = new CronJob(
        notification.schedule.cronExpression,
        () => this.executeScheduledNotification(notification),
        null,
        false,
        notification.schedule.timezone
      );

      // Start the job
      cronJob.start();
      this.cronJobs.set(notification.id, cronJob);

      logger.debug('Cron job set up for scheduled notification', {
        scheduleId: notification.id,
        cronExpression: notification.schedule.cronExpression,
        timezone: notification.schedule.timezone,
      });
    } catch (error) {
      logger.error('Failed to setup cron job', {
        scheduleId: notification.id,
        cronExpression: notification.schedule.cronExpression,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Schedule one-time notification
   */
  private async scheduleOneTimeNotification(notification: ScheduledNotification): Promise<void> {
    if (!notification.schedule.scheduledAt) {
      throw new Error('Scheduled time required for one-time notifications');
    }

    const delay = notification.schedule.scheduledAt.getTime() - Date.now();
    
    if (delay <= 0) {
      // Execute immediately if scheduled time has passed
      await this.executeScheduledNotification(notification);
    } else {
      // Schedule for future execution
      setTimeout(() => {
        this.executeScheduledNotification(notification);
      }, delay);
    }
  }

  /**
   * Calculate next execution time
   */
  private calculateNextExecution(schedule: ScheduledNotification['schedule']): Date | undefined {
    if (schedule.type === 'once') {
      return schedule.scheduledAt;
    }

    if (schedule.type === 'recurring' && schedule.cronExpression) {
      try {
        const cronJob = new CronJob(schedule.cronExpression, () => {}, null, false, schedule.timezone);
        return cronJob.nextDate().toDate();
      } catch (error) {
        logger.error('Failed to calculate next execution time', {
          cronExpression: schedule.cronExpression,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Validate schedule configuration
   */
  private validateSchedule(schedule: ScheduledNotification['schedule']): void {
    if (schedule.type === 'once' && !schedule.scheduledAt) {
      throw new Error('Scheduled time is required for one-time notifications');
    }

    if (schedule.type === 'recurring' && !schedule.cronExpression) {
      throw new Error('Cron expression is required for recurring notifications');
    }

    if (schedule.cronExpression) {
      try {
        new CronJob(schedule.cronExpression, () => {}, null, false, schedule.timezone);
      } catch (error) {
        throw new Error(`Invalid cron expression: ${schedule.cronExpression}`);
      }
    }

    if (schedule.endDate && schedule.scheduledAt && schedule.endDate <= schedule.scheduledAt) {
      throw new Error('End date must be after scheduled time');
    }

    if (schedule.maxOccurrences && schedule.maxOccurrences <= 0) {
      throw new Error('Max occurrences must be greater than 0');
    }
  }

  /**
   * Save scheduled notification to storage
   */
  private async saveScheduledNotification(notification: ScheduledNotification): Promise<void> {
    const cacheKey = `scheduled_notification:${notification.id}`;
    await redis.set(cacheKey, notification, { ttl: 86400 }); // 24 hours TTL
    
    // TODO: Save to database
  }

  /**
   * Load existing scheduled notifications
   */
  private async loadScheduledNotifications(): Promise<void> {
    try {
      // TODO: Load from database and set up cron jobs
      logger.info('Scheduled notifications loaded');
    } catch (error) {
      logger.error('Failed to load scheduled notifications', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start cleanup job for completed/failed notifications
   */
  private startCleanupJob(): void {
    // Run cleanup every hour
    const cleanupJob = new CronJob('0 0 * * * *', async () => {
      try {
        await this.cleanupOldNotifications();
      } catch (error) {
        logger.error('Cleanup job failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, null, true);

    logger.info('Cleanup job started');
  }

  /**
   * Cleanup old completed/failed notifications
   */
  private async cleanupOldNotifications(): Promise<void> {
    try {
      // TODO: Implement cleanup logic
      // Remove completed notifications older than 30 days
      // Remove failed notifications older than 7 days
      logger.debug('Cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup old notifications', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate unique schedule ID
   */
  private generateScheduleId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop the scheduler service
   */
  public async stop(): Promise<void> {
    try {
      // Stop all cron jobs
      for (const [scheduleId, cronJob] of this.cronJobs) {
        cronJob.stop();
      }
      this.cronJobs.clear();

      this.isRunning = false;
      logger.info('Notification scheduler service stopped');
    } catch (error) {
      logger.error('Error stopping notification scheduler service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if scheduler is running
   */
  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const schedulerService = NotificationSchedulerService.getInstance();
