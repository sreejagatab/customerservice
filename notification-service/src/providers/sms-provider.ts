/**
 * SMS Provider Service
 * Supports multiple SMS providers: Twilio, AWS SNS, etc.
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';

export interface SMSMessage {
  to: string;
  message: string;
  from?: string;
  mediaUrls?: string[];
  metadata?: Record<string, any>;
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
  deliveryTime: number;
  cost?: number;
}

export interface SMSProvider {
  name: string;
  send(message: SMSMessage): Promise<SMSResult>;
  healthCheck(): Promise<boolean>;
}

/**
 * Twilio SMS Provider
 */
export class TwilioSMSProvider implements SMSProvider {
  public readonly name = 'twilio';
  private client: any;

  constructor() {
    if (!config.sms.twilio.accountSid || !config.sms.twilio.authToken) {
      throw new Error('Twilio credentials not configured');
    }

    const twilio = require('twilio');
    this.client = twilio(config.sms.twilio.accountSid, config.sms.twilio.authToken);
  }

  public async send(message: SMSMessage): Promise<SMSResult> {
    const startTime = Date.now();

    try {
      const messageOptions: any = {
        body: message.message,
        from: message.from || config.sms.twilio.phoneNumber,
        to: message.to,
      };

      // Add media URLs if provided
      if (message.mediaUrls && message.mediaUrls.length > 0) {
        messageOptions.mediaUrl = message.mediaUrls;
      }

      const result = await this.client.messages.create(messageOptions);
      const deliveryTime = Date.now() - startTime;

      logger.info('SMS sent via Twilio', {
        messageId: result.sid,
        to: message.to,
        status: result.status,
        deliveryTime,
      });

      return {
        success: true,
        messageId: result.sid,
        provider: this.name,
        deliveryTime,
        cost: result.price ? parseFloat(result.price) : undefined,
      };
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      
      logger.error('Twilio SMS send failed', {
        to: message.to,
        error: error instanceof Error ? error.message : String(error),
        deliveryTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.name,
        deliveryTime,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Check account balance to verify connection
      await this.client.balance.fetch();
      return true;
    } catch (error) {
      logger.error('Twilio health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async getDeliveryStatus(messageId: string): Promise<string> {
    try {
      const message = await this.client.messages(messageId).fetch();
      return message.status;
    } catch (error) {
      logger.error('Failed to get Twilio message status', {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'unknown';
    }
  }
}

/**
 * AWS SNS SMS Provider
 */
export class AWSSMSProvider implements SMSProvider {
  public readonly name = 'aws-sns';
  private snsClient: any;

  constructor() {
    const AWS = require('aws-sdk');
    
    // Use default AWS credentials or IAM role
    this.snsClient = new AWS.SNS({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  public async send(message: SMSMessage): Promise<SMSResult> {
    const startTime = Date.now();

    try {
      const params = {
        Message: message.message,
        PhoneNumber: message.to,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: message.from || 'CustomerService',
          },
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional',
          },
        },
      };

      const result = await this.snsClient.publish(params).promise();
      const deliveryTime = Date.now() - startTime;

      logger.info('SMS sent via AWS SNS', {
        messageId: result.MessageId,
        to: message.to,
        deliveryTime,
      });

      return {
        success: true,
        messageId: result.MessageId,
        provider: this.name,
        deliveryTime,
      };
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      
      logger.error('AWS SNS SMS send failed', {
        to: message.to,
        error: error instanceof Error ? error.message : String(error),
        deliveryTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.name,
        deliveryTime,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Check SMS attributes to verify connection
      await this.snsClient.getSMSAttributes().promise();
      return true;
    } catch (error) {
      logger.error('AWS SNS health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * Mock SMS Provider for Testing
 */
export class MockSMSProvider implements SMSProvider {
  public readonly name = 'mock';

  public async send(message: SMSMessage): Promise<SMSResult> {
    const startTime = Date.now();
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const deliveryTime = Date.now() - startTime;
    const messageId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('SMS sent via Mock provider', {
      messageId,
      to: message.to,
      message: message.message,
      deliveryTime,
    });

    return {
      success: true,
      messageId,
      provider: this.name,
      deliveryTime,
      cost: 0.01, // Mock cost
    };
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * SMS Service with Provider Management
 */
export class SMSService {
  private static instance: SMSService;
  private providers: SMSProvider[] = [];
  private primaryProvider: SMSProvider | null = null;

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): SMSService {
    if (!SMSService.instance) {
      SMSService.instance = new SMSService();
    }
    return SMSService.instance;
  }

  private initializeProviders(): void {
    try {
      // Initialize Twilio if configured
      if (config.sms.twilio.accountSid && config.sms.twilio.authToken) {
        const twilioProvider = new TwilioSMSProvider();
        this.providers.push(twilioProvider);
        this.primaryProvider = twilioProvider;
      }

      // Initialize AWS SNS if available
      try {
        const awsProvider = new AWSSMSProvider();
        this.providers.push(awsProvider);
        if (!this.primaryProvider) {
          this.primaryProvider = awsProvider;
        }
      } catch (error) {
        logger.warn('AWS SNS SMS provider not available', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Use mock provider in development/test environments
      if (config.nodeEnv !== 'production' && this.providers.length === 0) {
        const mockProvider = new MockSMSProvider();
        this.providers.push(mockProvider);
        this.primaryProvider = mockProvider;
      }

      if (this.providers.length === 0) {
        throw new Error('No SMS providers configured');
      }

      logger.info('SMS providers initialized', {
        providers: this.providers.map(p => p.name),
        primary: this.primaryProvider?.name,
      });
    } catch (error) {
      logger.error('Failed to initialize SMS providers', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async sendSMS(message: SMSMessage): Promise<SMSResult> {
    if (!this.primaryProvider) {
      throw new Error('No SMS provider available');
    }

    // Validate phone number format
    if (!this.isValidPhoneNumber(message.to)) {
      return {
        success: false,
        error: 'Invalid phone number format',
        provider: 'validation',
        deliveryTime: 0,
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

      logger.warn('Trying fallback SMS provider', {
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
    logger.error('All SMS providers failed', {
      to: message.to,
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

  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Basic phone number validation (E.164 format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  public formatPhoneNumber(phoneNumber: string, countryCode: string = '+1'): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present
    if (!phoneNumber.startsWith('+')) {
      return `${countryCode}${digits}`;
    }
    
    return phoneNumber;
  }
}

// Export singleton instance
export const smsService = SMSService.getInstance();
