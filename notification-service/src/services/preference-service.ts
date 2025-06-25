/**
 * Notification Preference Service
 * Manages user notification preferences and delivery rules
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface NotificationPreference {
  userId: string;
  organizationId: string;
  channels: {
    email: {
      enabled: boolean;
      address?: string;
      frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
      quietHours?: {
        start: string; // HH:MM format
        end: string;   // HH:MM format
        timezone: string;
      };
    };
    sms: {
      enabled: boolean;
      phoneNumber?: string;
      frequency: 'immediate' | 'urgent_only';
      quietHours?: {
        start: string;
        end: string;
        timezone: string;
      };
    };
    push: {
      enabled: boolean;
      tokens: string[];
      frequency: 'immediate' | 'hourly' | 'daily';
      quietHours?: {
        start: string;
        end: string;
        timezone: string;
      };
    };
    inApp: {
      enabled: boolean;
      frequency: 'immediate' | 'hourly';
    };
    webhook: {
      enabled: boolean;
      url?: string;
      frequency: 'immediate';
    };
  };
  categories: {
    [category: string]: {
      email: boolean;
      sms: boolean;
      push: boolean;
      inApp: boolean;
      webhook: boolean;
    };
  };
  globalOptOut: boolean;
  language: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryRule {
  userId: string;
  organizationId: string;
  type: 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
  canDeliver: boolean;
  reason?: string;
  nextAllowedDelivery?: Date;
}

export class NotificationPreferenceService {
  private static instance: NotificationPreferenceService;

  private constructor() {}

  public static getInstance(): NotificationPreferenceService {
    if (!NotificationPreferenceService.instance) {
      NotificationPreferenceService.instance = new NotificationPreferenceService();
    }
    return NotificationPreferenceService.instance;
  }

  /**
   * Get user notification preferences
   */
  public async getUserPreferences(userId: string, organizationId: string): Promise<NotificationPreference | null> {
    try {
      const cacheKey = `preferences:${organizationId}:${userId}`;
      
      // Try cache first
      const cached = await redis.get<NotificationPreference>(cacheKey);
      if (cached) {
        return cached;
      }

      // TODO: Implement database query
      // For now, return default preferences
      const defaultPreferences = this.getDefaultPreferences(userId, organizationId);
      
      // Cache for 1 hour
      await redis.set(cacheKey, defaultPreferences, { ttl: 3600 });
      
      return defaultPreferences;
    } catch (error) {
      logger.error('Failed to get user preferences', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update user notification preferences
   */
  public async updateUserPreferences(
    userId: string,
    organizationId: string,
    preferences: Partial<NotificationPreference>
  ): Promise<NotificationPreference> {
    try {
      const currentPreferences = await this.getUserPreferences(userId, organizationId);
      
      if (!currentPreferences) {
        throw new Error('User preferences not found');
      }

      // Merge preferences
      const updatedPreferences: NotificationPreference = {
        ...currentPreferences,
        ...preferences,
        userId,
        organizationId,
        updatedAt: new Date(),
      };

      // TODO: Save to database
      
      // Update cache
      const cacheKey = `preferences:${organizationId}:${userId}`;
      await redis.set(cacheKey, updatedPreferences, { ttl: 3600 });

      logger.info('User preferences updated', {
        userId,
        organizationId,
      });

      return updatedPreferences;
    } catch (error) {
      logger.error('Failed to update user preferences', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if delivery is allowed for a specific channel
   */
  public async checkDeliveryRules(
    userId: string,
    organizationId: string,
    type: 'email' | 'sms' | 'push' | 'in_app' | 'webhook',
    category?: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<DeliveryRule> {
    try {
      const preferences = await this.getUserPreferences(userId, organizationId);
      
      if (!preferences) {
        return {
          userId,
          organizationId,
          type,
          canDeliver: false,
          reason: 'User preferences not found',
        };
      }

      // Check global opt-out
      if (preferences.globalOptOut) {
        return {
          userId,
          organizationId,
          type,
          canDeliver: false,
          reason: 'User has globally opted out',
        };
      }

      // Check channel-specific settings
      const channelSettings = preferences.channels[type];
      if (!channelSettings?.enabled) {
        return {
          userId,
          organizationId,
          type,
          canDeliver: false,
          reason: `${type} notifications disabled`,
        };
      }

      // Check category-specific settings
      if (category && preferences.categories[category]) {
        const categorySettings = preferences.categories[category];
        if (!categorySettings[type]) {
          return {
            userId,
            organizationId,
            type,
            canDeliver: false,
            reason: `${type} notifications disabled for category ${category}`,
          };
        }
      }

      // Check frequency limits
      const frequencyCheck = await this.checkFrequencyLimits(
        userId,
        organizationId,
        type,
        channelSettings.frequency,
        priority
      );
      
      if (!frequencyCheck.canDeliver) {
        return frequencyCheck;
      }

      // Check quiet hours
      const quietHoursCheck = this.checkQuietHours(
        channelSettings.quietHours,
        preferences.timezone,
        priority
      );
      
      if (!quietHoursCheck.canDeliver) {
        return {
          userId,
          organizationId,
          type,
          canDeliver: false,
          reason: quietHoursCheck.reason,
          nextAllowedDelivery: quietHoursCheck.nextAllowedDelivery,
        };
      }

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimits(userId, organizationId, type);
      if (!rateLimitCheck.canDeliver) {
        return rateLimitCheck;
      }

      return {
        userId,
        organizationId,
        type,
        canDeliver: true,
      };
    } catch (error) {
      logger.error('Failed to check delivery rules', {
        userId,
        organizationId,
        type,
        category,
        priority,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        userId,
        organizationId,
        type,
        canDeliver: false,
        reason: 'Error checking delivery rules',
      };
    }
  }

  /**
   * Check frequency limits
   */
  private async checkFrequencyLimits(
    userId: string,
    organizationId: string,
    type: string,
    frequency: string,
    priority: string
  ): Promise<DeliveryRule> {
    // Urgent notifications bypass frequency limits
    if (priority === 'urgent') {
      return {
        userId,
        organizationId,
        type: type as any,
        canDeliver: true,
      };
    }

    const now = new Date();
    const cacheKey = `frequency:${organizationId}:${userId}:${type}`;

    try {
      switch (frequency) {
        case 'immediate':
          return {
            userId,
            organizationId,
            type: type as any,
            canDeliver: true,
          };

        case 'hourly': {
          const lastSent = await redis.get(`${cacheKey}:hourly`);
          if (lastSent) {
            const lastSentTime = new Date(lastSent);
            const hoursSince = (now.getTime() - lastSentTime.getTime()) / (1000 * 60 * 60);
            
            if (hoursSince < 1) {
              const nextAllowed = new Date(lastSentTime.getTime() + 60 * 60 * 1000);
              return {
                userId,
                organizationId,
                type: type as any,
                canDeliver: false,
                reason: 'Hourly frequency limit reached',
                nextAllowedDelivery: nextAllowed,
              };
            }
          }
          break;
        }

        case 'daily': {
          const lastSent = await redis.get(`${cacheKey}:daily`);
          if (lastSent) {
            const lastSentTime = new Date(lastSent);
            const daysSince = (now.getTime() - lastSentTime.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSince < 1) {
              const nextAllowed = new Date(lastSentTime.getTime() + 24 * 60 * 60 * 1000);
              return {
                userId,
                organizationId,
                type: type as any,
                canDeliver: false,
                reason: 'Daily frequency limit reached',
                nextAllowedDelivery: nextAllowed,
              };
            }
          }
          break;
        }

        case 'weekly': {
          const lastSent = await redis.get(`${cacheKey}:weekly`);
          if (lastSent) {
            const lastSentTime = new Date(lastSent);
            const weeksSince = (now.getTime() - lastSentTime.getTime()) / (1000 * 60 * 60 * 24 * 7);
            
            if (weeksSince < 1) {
              const nextAllowed = new Date(lastSentTime.getTime() + 7 * 24 * 60 * 60 * 1000);
              return {
                userId,
                organizationId,
                type: type as any,
                canDeliver: false,
                reason: 'Weekly frequency limit reached',
                nextAllowedDelivery: nextAllowed,
              };
            }
          }
          break;
        }

        case 'urgent_only':
          if (priority !== 'urgent') {
            return {
              userId,
              organizationId,
              type: type as any,
              canDeliver: false,
              reason: 'Only urgent notifications allowed',
            };
          }
          break;
      }

      return {
        userId,
        organizationId,
        type: type as any,
        canDeliver: true,
      };
    } catch (error) {
      logger.error('Error checking frequency limits', {
        userId,
        organizationId,
        type,
        frequency,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        userId,
        organizationId,
        type: type as any,
        canDeliver: true, // Fail open
      };
    }
  }

  /**
   * Check quiet hours
   */
  private checkQuietHours(
    quietHours: any,
    timezone: string,
    priority: string
  ): { canDeliver: boolean; reason?: string; nextAllowedDelivery?: Date } {
    // Urgent notifications bypass quiet hours
    if (priority === 'urgent' || !quietHours) {
      return { canDeliver: true };
    }

    try {
      const moment = require('moment-timezone');
      const now = moment().tz(timezone);
      const currentTime = now.format('HH:mm');
      
      const startTime = quietHours.start;
      const endTime = quietHours.end;
      
      // Check if current time is within quiet hours
      const isInQuietHours = this.isTimeInRange(currentTime, startTime, endTime);
      
      if (isInQuietHours) {
        // Calculate next allowed delivery time (end of quiet hours)
        const nextAllowed = moment().tz(timezone);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        nextAllowed.hour(endHour).minute(endMinute).second(0);
        
        // If end time is before current time, it's next day
        if (nextAllowed.isBefore(now)) {
          nextAllowed.add(1, 'day');
        }
        
        return {
          canDeliver: false,
          reason: 'Within quiet hours',
          nextAllowedDelivery: nextAllowed.toDate(),
        };
      }
      
      return { canDeliver: true };
    } catch (error) {
      logger.error('Error checking quiet hours', {
        quietHours,
        timezone,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return { canDeliver: true }; // Fail open
    }
  }

  /**
   * Check if time is within range
   */
  private isTimeInRange(currentTime: string, startTime: string, endTime: string): boolean {
    const current = this.timeToMinutes(currentTime);
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    
    if (start <= end) {
      // Same day range
      return current >= start && current <= end;
    } else {
      // Overnight range
      return current >= start || current <= end;
    }
  }

  /**
   * Convert time string to minutes since midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Check rate limits
   */
  private async checkRateLimits(
    userId: string,
    organizationId: string,
    type: string
  ): Promise<DeliveryRule> {
    try {
      const rateLimitKey = `rate_limit:${organizationId}:${userId}:${type}`;
      const currentCount = await redis.get(rateLimitKey) || 0;
      
      // Define rate limits per channel type
      const rateLimits = {
        email: 50,    // 50 emails per hour
        sms: 10,      // 10 SMS per hour
        push: 100,    // 100 push notifications per hour
        in_app: 200,  // 200 in-app notifications per hour
        webhook: 100, // 100 webhook calls per hour
      };
      
      const limit = rateLimits[type as keyof typeof rateLimits] || 50;
      
      if (Number(currentCount) >= limit) {
        return {
          userId,
          organizationId,
          type: type as any,
          canDeliver: false,
          reason: `Rate limit exceeded (${limit} per hour)`,
        };
      }
      
      return {
        userId,
        organizationId,
        type: type as any,
        canDeliver: true,
      };
    } catch (error) {
      logger.error('Error checking rate limits', {
        userId,
        organizationId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        userId,
        organizationId,
        type: type as any,
        canDeliver: true, // Fail open
      };
    }
  }

  /**
   * Record delivery for frequency and rate limiting
   */
  public async recordDelivery(
    userId: string,
    organizationId: string,
    type: string,
    frequency: string
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const cacheKey = `frequency:${organizationId}:${userId}:${type}`;
      const rateLimitKey = `rate_limit:${organizationId}:${userId}:${type}`;
      
      // Record for frequency limiting
      await redis.set(`${cacheKey}:${frequency}`, now, { ttl: this.getFrequencyTTL(frequency) });
      
      // Increment rate limit counter
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 3600); // 1 hour TTL
      
    } catch (error) {
      logger.error('Failed to record delivery', {
        userId,
        organizationId,
        type,
        frequency,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get TTL for frequency limiting
   */
  private getFrequencyTTL(frequency: string): number {
    switch (frequency) {
      case 'hourly': return 3600;        // 1 hour
      case 'daily': return 86400;        // 24 hours
      case 'weekly': return 604800;      // 7 days
      default: return 3600;              // Default 1 hour
    }
  }

  /**
   * Get default preferences for a user
   */
  private getDefaultPreferences(userId: string, organizationId: string): NotificationPreference {
    return {
      userId,
      organizationId,
      channels: {
        email: {
          enabled: true,
          frequency: 'immediate',
        },
        sms: {
          enabled: false,
          frequency: 'urgent_only',
        },
        push: {
          enabled: true,
          tokens: [],
          frequency: 'immediate',
        },
        inApp: {
          enabled: true,
          frequency: 'immediate',
        },
        webhook: {
          enabled: false,
          frequency: 'immediate',
        },
      },
      categories: {
        'message_received': {
          email: true,
          sms: false,
          push: true,
          inApp: true,
          webhook: false,
        },
        'message_assigned': {
          email: true,
          sms: false,
          push: true,
          inApp: true,
          webhook: false,
        },
        'urgent_message': {
          email: true,
          sms: true,
          push: true,
          inApp: true,
          webhook: true,
        },
      },
      globalOptOut: false,
      language: 'en',
      timezone: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// Export singleton instance
export const preferenceService = NotificationPreferenceService.getInstance();
