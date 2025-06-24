/**
 * WhatsApp Business API Integration
 * Messaging platform integration for WhatsApp Business
 */

import axios, { AxiosInstance } from 'axios';
import { BaseIntegration } from './base';
import { logger } from '@/utils/logger';
import { 
  IntegrationConfig, 
  IntegrationStatus,
  Message,
  MessageType,
  WebhookEvent 
} from '@universal-ai-cs/shared';

export interface WhatsAppConfig extends IntegrationConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  apiVersion: string;
}

export interface WhatsAppMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template';
  text?: {
    body: string;
    preview_url?: boolean;
  };
  image?: {
    link?: string;
    id?: string;
    caption?: string;
  };
  document?: {
    link?: string;
    id?: string;
    caption?: string;
    filename?: string;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: any[];
  };
}

export interface WhatsAppWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  document?: {
    id: string;
    filename: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  audio?: {
    id: string;
    mime_type: string;
    sha256: string;
  };
  video?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: any[];
  context?: {
    from: string;
    id: string;
  };
}

export class WhatsAppIntegration extends BaseIntegration {
  private client: AxiosInstance;
  private config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    super(config);
    this.config = config;
    
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${config.apiVersion}`,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  /**
   * Test connection to WhatsApp Business API
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.client.get(`/${this.config.phoneNumberId}`);
      
      if (response.status === 200 && response.data.id) {
        logger.info('WhatsApp connection test successful', {
          phoneNumberId: this.config.phoneNumberId,
          displayName: response.data.display_phone_number,
        });
        
        return { success: true };
      }
      
      return { success: false, error: 'Invalid response from WhatsApp API' };
    } catch (error: any) {
      logger.error('WhatsApp connection test failed', { error: error.message });
      return { 
        success: false, 
        error: error.response?.data?.error?.message || error.message 
      };
    }
  }

  /**
   * Send text message
   */
  async sendMessage(to: string, message: string, replyToMessageId?: string): Promise<string | null> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''), // Remove non-digits
        type: 'text',
        text: {
          body: message,
          preview_url: true,
        },
      };

      // Add context for reply
      if (replyToMessageId) {
        (payload as any).context = {
          message_id: replyToMessageId,
        };
      }

      const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, payload);
      
      if (response.data.messages && response.data.messages[0]) {
        const messageId = response.data.messages[0].id;
        logger.info('WhatsApp message sent', { to, messageId });
        return messageId;
      }
      
      return null;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp message', { 
        to, 
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Send image message
   */
  async sendImage(to: string, imageUrl: string, caption?: string): Promise<string | null> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'image',
        image: {
          link: imageUrl,
          caption,
        },
      };

      const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, payload);
      
      if (response.data.messages && response.data.messages[0]) {
        const messageId = response.data.messages[0].id;
        logger.info('WhatsApp image sent', { to, messageId, imageUrl });
        return messageId;
      }
      
      return null;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp image', { 
        to, 
        imageUrl,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Send document
   */
  async sendDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<string | null> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'document',
        document: {
          link: documentUrl,
          filename,
          caption,
        },
      };

      const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, payload);
      
      if (response.data.messages && response.data.messages[0]) {
        const messageId = response.data.messages[0].id;
        logger.info('WhatsApp document sent', { to, messageId, filename });
        return messageId;
      }
      
      return null;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp document', { 
        to, 
        filename,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Send template message
   */
  async sendTemplate(to: string, templateName: string, languageCode: string, components?: any[]): Promise<string | null> {
    try {
      const payload: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components,
        },
      };

      const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, payload);
      
      if (response.data.messages && response.data.messages[0]) {
        const messageId = response.data.messages[0].id;
        logger.info('WhatsApp template sent', { to, messageId, templateName });
        return messageId;
      }
      
      return null;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp template', { 
        to, 
        templateName,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Download media file
   */
  async downloadMedia(mediaId: string): Promise<Buffer | null> {
    try {
      // First get media URL
      const mediaResponse = await this.client.get(`/${mediaId}`);
      const mediaUrl = mediaResponse.data.url;
      
      // Download the actual file
      const fileResponse = await this.client.get(mediaUrl, {
        responseType: 'arraybuffer',
      });
      
      return Buffer.from(fileResponse.data);
    } catch (error: any) {
      logger.error('Failed to download WhatsApp media', { 
        mediaId,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<boolean> {
    try {
      await this.client.post(`/${this.config.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
      
      return true;
    } catch (error: any) {
      logger.error('Failed to mark WhatsApp message as read', { 
        messageId,
        error: error.response?.data || error.message 
      });
      return false;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event: WebhookEvent): Promise<void> {
    try {
      // Handle webhook verification
      if (event.query['hub.mode'] === 'subscribe') {
        const challenge = event.query['hub.challenge'];
        const verifyToken = event.query['hub.verify_token'];
        
        if (verifyToken === this.config.webhookVerifyToken) {
          logger.info('WhatsApp webhook verified');
          return challenge;
        } else {
          throw new Error('Invalid webhook verify token');
        }
      }

      const data = JSON.parse(event.body);
      
      if (data.object === 'whatsapp_business_account') {
        for (const entry of data.entry) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              await this.handleMessageChange(change.value);
            }
          }
        }
      }
    } catch (error: any) {
      logger.error('Failed to handle WhatsApp webhook', { error: error.message });
      throw error;
    }
  }

  /**
   * Get integration health status
   */
  async getHealthStatus(): Promise<IntegrationStatus> {
    try {
      const testResult = await this.testConnection();
      
      if (testResult.success) {
        return {
          status: 'healthy',
          lastChecked: new Date(),
          details: 'Connection successful',
        };
      } else {
        return {
          status: 'error',
          lastChecked: new Date(),
          details: testResult.error || 'Connection failed',
        };
      }
    } catch (error: any) {
      return {
        status: 'error',
        lastChecked: new Date(),
        details: error.message,
      };
    }
  }

  // Private helper methods
  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('WhatsApp API request', {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error) => {
        logger.error('WhatsApp API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('WhatsApp API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('WhatsApp API response error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.response?.data || error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  private async handleMessageChange(value: any): Promise<void> {
    // Handle incoming messages
    if (value.messages) {
      for (const message of value.messages) {
        await this.handleIncomingMessage(message, value.contacts?.[0]);
      }
    }

    // Handle message status updates
    if (value.statuses) {
      for (const status of value.statuses) {
        await this.handleMessageStatus(status);
      }
    }
  }

  private async handleIncomingMessage(message: WhatsAppWebhookMessage, contact: any): Promise<void> {
    try {
      const mappedMessage: Message = {
        id: message.id,
        conversationId: `whatsapp_${message.from}`,
        senderId: message.from,
        senderName: contact?.profile?.name || message.from,
        content: this.extractMessageContent(message),
        type: this.mapMessageType(message.type),
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        metadata: {
          platform: 'whatsapp',
          messageType: message.type,
          context: message.context,
        },
        source: 'whatsapp',
      };

      // Mark as read
      await this.markAsRead(message.id);

      // Emit message received event
      this.emit('message.received', mappedMessage);
      
      logger.info('WhatsApp message processed', {
        messageId: message.id,
        from: message.from,
        type: message.type,
      });
    } catch (error: any) {
      logger.error('Failed to handle incoming WhatsApp message', {
        messageId: message.id,
        error: error.message,
      });
    }
  }

  private async handleMessageStatus(status: any): Promise<void> {
    logger.info('WhatsApp message status update', {
      messageId: status.id,
      status: status.status,
      timestamp: status.timestamp,
    });

    // Emit status update event
    this.emit('message.status', {
      messageId: status.id,
      status: status.status,
      timestamp: new Date(parseInt(status.timestamp) * 1000),
    });
  }

  private extractMessageContent(message: WhatsAppWebhookMessage): string {
    switch (message.type) {
      case 'text':
        return message.text?.body || '';
      case 'image':
        return message.image?.caption || '[Image]';
      case 'document':
        return message.document?.caption || `[Document: ${message.document?.filename}]`;
      case 'audio':
        return '[Audio Message]';
      case 'video':
        return message.video?.caption || '[Video]';
      case 'location':
        return `[Location: ${message.location?.name || 'Shared location'}]`;
      case 'contacts':
        return '[Contact Information]';
      default:
        return '[Unsupported Message Type]';
    }
  }

  private mapMessageType(whatsappType: string): MessageType {
    switch (whatsappType) {
      case 'text':
        return MessageType.TEXT;
      case 'image':
        return MessageType.IMAGE;
      case 'document':
        return MessageType.FILE;
      case 'audio':
        return MessageType.AUDIO;
      case 'video':
        return MessageType.VIDEO;
      default:
        return MessageType.TEXT;
    }
  }
}
