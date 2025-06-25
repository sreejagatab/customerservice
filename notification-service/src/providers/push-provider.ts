/**
 * Push Notification Provider Service
 * Supports Firebase Cloud Messaging (FCM) and Web Push
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';

export interface PushMessage {
  token: string | string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  clickAction?: string;
  badge?: number;
  sound?: string;
  priority?: 'normal' | 'high';
  timeToLive?: number;
  collapseKey?: string;
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
  deliveryTime: number;
  failedTokens?: string[];
  successCount?: number;
  failureCount?: number;
}

export interface PushProvider {
  name: string;
  send(message: PushMessage): Promise<PushResult>;
  healthCheck(): Promise<boolean>;
}

/**
 * Firebase Cloud Messaging (FCM) Provider
 */
export class FCMPushProvider implements PushProvider {
  public readonly name = 'fcm';
  private admin: any;

  constructor() {
    if (!config.push.firebase.projectId || !config.push.firebase.privateKey || !config.push.firebase.clientEmail) {
      throw new Error('Firebase credentials not configured');
    }

    const admin = require('firebase-admin');
    
    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.push.firebase.projectId,
          privateKey: config.push.firebase.privateKey.replace(/\\n/g, '\n'),
          clientEmail: config.push.firebase.clientEmail,
        }),
      });
    }

    this.admin = admin;
  }

  public async send(message: PushMessage): Promise<PushResult> {
    const startTime = Date.now();

    try {
      const tokens = Array.isArray(message.token) ? message.token : [message.token];
      
      const fcmMessage = {
        notification: {
          title: message.title,
          body: message.body,
          imageUrl: message.imageUrl,
        },
        data: message.data || {},
        android: {
          notification: {
            clickAction: message.clickAction,
            sound: message.sound || 'default',
            priority: message.priority === 'high' ? 'high' : 'normal',
          },
          ttl: message.timeToLive ? message.timeToLive * 1000 : undefined,
          collapseKey: message.collapseKey,
        },
        apns: {
          payload: {
            aps: {
              badge: message.badge,
              sound: message.sound || 'default',
              category: message.clickAction,
            },
          },
        },
        webpush: {
          notification: {
            title: message.title,
            body: message.body,
            icon: message.imageUrl,
            badge: message.badge,
            tag: message.collapseKey,
          },
          fcmOptions: {
            link: message.clickAction,
          },
        },
      };

      let result;
      if (tokens.length === 1) {
        // Single token
        result = await this.admin.messaging().send({
          ...fcmMessage,
          token: tokens[0],
        });
        
        const deliveryTime = Date.now() - startTime;
        
        logger.info('Push notification sent via FCM', {
          messageId: result,
          token: tokens[0],
          title: message.title,
          deliveryTime,
        });

        return {
          success: true,
          messageId: result,
          provider: this.name,
          deliveryTime,
          successCount: 1,
          failureCount: 0,
        };
      } else {
        // Multiple tokens
        result = await this.admin.messaging().sendMulticast({
          ...fcmMessage,
          tokens,
        });
        
        const deliveryTime = Date.now() - startTime;
        const failedTokens: string[] = [];
        
        result.responses.forEach((response: any, index: number) => {
          if (!response.success) {
            failedTokens.push(tokens[index]);
          }
        });

        logger.info('Push notifications sent via FCM (multicast)', {
          totalTokens: tokens.length,
          successCount: result.successCount,
          failureCount: result.failureCount,
          deliveryTime,
        });

        return {
          success: result.successCount > 0,
          provider: this.name,
          deliveryTime,
          successCount: result.successCount,
          failureCount: result.failureCount,
          failedTokens,
        };
      }
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      
      logger.error('FCM push notification send failed', {
        title: message.title,
        error: error instanceof Error ? error.message : String(error),
        deliveryTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.name,
        deliveryTime,
        successCount: 0,
        failureCount: Array.isArray(message.token) ? message.token.length : 1,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Try to get the Firebase app instance
      const app = this.admin.app();
      return !!app;
    } catch (error) {
      logger.error('FCM health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * Web Push Provider (using web-push library)
 */
export class WebPushProvider implements PushProvider {
  public readonly name = 'web-push';
  private webpush: any;

  constructor() {
    if (!config.push.webPush.vapidPublicKey || !config.push.webPush.vapidPrivateKey) {
      throw new Error('Web Push VAPID keys not configured');
    }

    const webpush = require('web-push');
    
    webpush.setVapidDetails(
      config.push.webPush.vapidSubject || 'mailto:support@example.com',
      config.push.webPush.vapidPublicKey,
      config.push.webPush.vapidPrivateKey
    );

    this.webpush = webpush;
  }

  public async send(message: PushMessage): Promise<PushResult> {
    const startTime = Date.now();

    try {
      const subscriptions = Array.isArray(message.token) ? message.token : [message.token];
      
      const payload = JSON.stringify({
        title: message.title,
        body: message.body,
        icon: message.imageUrl,
        badge: message.badge,
        data: message.data || {},
        actions: message.clickAction ? [{
          action: 'open',
          title: 'Open',
          url: message.clickAction,
        }] : undefined,
      });

      const options = {
        TTL: message.timeToLive || 86400, // 24 hours default
        urgency: message.priority === 'high' ? 'high' : 'normal',
      };

      const results = await Promise.allSettled(
        subscriptions.map(subscription => {
          try {
            const subscriptionObject = typeof subscription === 'string' 
              ? JSON.parse(subscription) 
              : subscription;
            return this.webpush.sendNotification(subscriptionObject, payload, options);
          } catch (error) {
            return Promise.reject(error);
          }
        })
      );

      const deliveryTime = Date.now() - startTime;
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      const failedTokens: string[] = [];

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedTokens.push(subscriptions[index]);
        }
      });

      logger.info('Web push notifications sent', {
        totalSubscriptions: subscriptions.length,
        successCount,
        failureCount,
        deliveryTime,
      });

      return {
        success: successCount > 0,
        provider: this.name,
        deliveryTime,
        successCount,
        failureCount,
        failedTokens,
      };
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      
      logger.error('Web push notification send failed', {
        title: message.title,
        error: error instanceof Error ? error.message : String(error),
        deliveryTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.name,
        deliveryTime,
        successCount: 0,
        failureCount: Array.isArray(message.token) ? message.token.length : 1,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Check if VAPID keys are properly configured
      return !!(config.push.webPush.vapidPublicKey && config.push.webPush.vapidPrivateKey);
    } catch (error) {
      return false;
    }
  }
}

/**
 * Mock Push Provider for Testing
 */
export class MockPushProvider implements PushProvider {
  public readonly name = 'mock';

  public async send(message: PushMessage): Promise<PushResult> {
    const startTime = Date.now();
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const deliveryTime = Date.now() - startTime;
    const tokens = Array.isArray(message.token) ? message.token : [message.token];
    const messageId = `mock_push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Push notification sent via Mock provider', {
      messageId,
      tokens: tokens.length,
      title: message.title,
      body: message.body,
      deliveryTime,
    });

    return {
      success: true,
      messageId,
      provider: this.name,
      deliveryTime,
      successCount: tokens.length,
      failureCount: 0,
    };
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * Push Notification Service with Provider Management
 */
export class PushNotificationService {
  private static instance: PushNotificationService;
  private providers: PushProvider[] = [];
  private primaryProvider: PushProvider | null = null;

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  private initializeProviders(): void {
    try {
      // Initialize FCM if configured
      if (config.push.firebase.projectId && config.push.firebase.privateKey && config.push.firebase.clientEmail) {
        const fcmProvider = new FCMPushProvider();
        this.providers.push(fcmProvider);
        this.primaryProvider = fcmProvider;
      }

      // Initialize Web Push if configured
      if (config.push.webPush.vapidPublicKey && config.push.webPush.vapidPrivateKey) {
        const webPushProvider = new WebPushProvider();
        this.providers.push(webPushProvider);
        if (!this.primaryProvider) {
          this.primaryProvider = webPushProvider;
        }
      }

      // Use mock provider in development/test environments
      if (config.nodeEnv !== 'production' && this.providers.length === 0) {
        const mockProvider = new MockPushProvider();
        this.providers.push(mockProvider);
        this.primaryProvider = mockProvider;
      }

      if (this.providers.length === 0) {
        logger.warn('No push notification providers configured');
      } else {
        logger.info('Push notification providers initialized', {
          providers: this.providers.map(p => p.name),
          primary: this.primaryProvider?.name,
        });
      }
    } catch (error) {
      logger.error('Failed to initialize push notification providers', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async sendPushNotification(message: PushMessage): Promise<PushResult> {
    if (!this.primaryProvider) {
      return {
        success: false,
        error: 'No push notification provider available',
        provider: 'none',
        deliveryTime: 0,
        successCount: 0,
        failureCount: Array.isArray(message.token) ? message.token.length : 1,
      };
    }

    // Try primary provider first
    let result = await this.primaryProvider.send(message);
    
    if (result.success) {
      return result;
    }

    // If primary provider fails, try fallback providers
    for (const provider of this.providers) {
      if (provider === this.primaryProvider) continue;

      logger.warn('Trying fallback push notification provider', {
        provider: provider.name,
        primaryProvider: this.primaryProvider.name,
        originalError: result.error,
      });

      result = await provider.send(message);
      
      if (result.success) {
        return result;
      }
    }

    // All providers failed
    logger.error('All push notification providers failed', {
      title: message.title,
      lastError: result.error,
    });

    return result;
  }

  public async healthCheck(): Promise<{ [providerName: string]: boolean }> {
    const healthStatus: { [providerName: string]: boolean } = {};

    for (const provider of this.providers) {
      healthStatus[provider.name] = await provider.healthCheck();
    }

    return healthStatus;
  }

  public getProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  public getPrimaryProvider(): string | null {
    return this.primaryProvider?.name || null;
  }
}

// Export singleton instance
export const pushNotificationService = PushNotificationService.getInstance();
