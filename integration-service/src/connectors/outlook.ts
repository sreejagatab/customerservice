/**
 * Outlook Connector - Microsoft 365 Integration
 */

import axios, { AxiosInstance } from 'axios';
import { AbstractConnector, Message, SendMessageRequest, FetchOptions, SyncResult } from './base';
import { IntegrationError, ExternalServiceError } from '../middleware/error-handler';
import { config } from '../config';
import { integrationLogger } from '../utils/logger';

interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: string;
    content: string;
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  isRead: boolean;
  importance: string;
  hasAttachments: boolean;
  attachments?: any[];
}

export class OutlookConnector extends AbstractConnector {
  public readonly id = 'outlook-connector';
  public readonly type = 'email';
  public readonly provider = 'outlook';
  public readonly name = 'Outlook/Microsoft 365';
  public readonly version = '1.0.0';
  public readonly supportedFeatures = [
    'read_messages',
    'send_messages',
    'mark_read',
    'delete_messages',
    'webhooks',
    'sync',
    'folders',
    'attachments',
  ];

  private httpClient: AxiosInstance;
  private accessToken!: string;
  private refreshToken!: string;
  private tokenExpiry!: Date;
  private subscriptionId?: string;

  constructor() {
    super();
    this.httpClient = axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0',
      timeout: 30000,
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      config.headers.Authorization = `Bearer ${this.accessToken}`;
      return config;
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.emit('auth_error', error);
        }
        return Promise.reject(error);
      }
    );
  }

  // Authentication methods
  public async authenticate(credentials: any): Promise<any> {
    try {
      if (!credentials.accessToken) {
        throw new IntegrationError('Access token is required for Outlook authentication');
      }

      this.accessToken = credentials.accessToken;
      this.refreshToken = credentials.refreshToken;
      this.tokenExpiry = new Date(credentials.expiresAt || Date.now() + 3600000);

      // Test the token
      await this.httpClient.get('/me');

      return {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.tokenExpiry,
      };
    } catch (error) {
      this.handleError(error, 'Outlook authentication failed');
    }
  }

  public async refreshAuth(credentials: any): Promise<any> {
    try {
      if (!credentials.refreshToken) {
        throw new IntegrationError('Refresh token is required');
      }

      const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: config.microsoft.clientId,
        client_secret: config.microsoft.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
        scope: config.microsoft.scopes.join(' '),
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const tokenData = response.data;
      
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || credentials.refreshToken,
        expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
      };
    } catch (error) {
      this.handleError(error, 'Outlook token refresh failed');
    }
  }

  public async validateAuth(credentials: any): Promise<boolean> {
    try {
      const authResult = await this.authenticate(credentials);
      
      // Test with a simple API call
      await this.httpClient.get('/me');
      
      return true;
    } catch (error: any) {
      integrationLogger.warn('Outlook auth validation failed:', error.message);
      return false;
    }
  }

  // Connection methods
  public async connect(): Promise<void> {
    try {
      // Test connection with profile fetch
      const response = await this.httpClient.get('/me');
      
      integrationLogger.info('Connected to Outlook', {
        email: response.data.mail || response.data.userPrincipalName,
        displayName: response.data.displayName,
      });

      this.emit('connected');
    } catch (error) {
      this.handleError(error, 'Outlook connection failed');
    }
  }

  public async disconnect(): Promise<void> {
    try {
      // Remove webhook subscription if exists
      if (this.subscriptionId) {
        await this.removeWebhook(this.subscriptionId);
      }

      this.accessToken = '';
      this.refreshToken = '';
      this.emit('disconnected');
    } catch (error: any) {
      integrationLogger.warn('Error during Outlook disconnect:', error.message);
      // Don't throw error on disconnect
    }
  }

  // Health check
  protected async performHealthCheck(): Promise<boolean> {
    try {
      await this.httpClient.get('/me');
      return true;
    } catch (error) {
      return false;
    }
  }

  // Message operations
  public async fetchMessages(options: FetchOptions = {}): Promise<Message[]> {
    try {
      const {
        limit = 50,
        pageToken,
        query,
        since,
        before,
      } = options;

      let url = '/me/messages';
      const params: any = {
        $top: limit,
        $orderby: 'receivedDateTime desc',
      };

      if (pageToken) {
        params.$skiptoken = pageToken;
      }

      // Build filter
      const filters: string[] = [];
      if (since) {
        filters.push(`receivedDateTime ge ${since.toISOString()}`);
      }
      if (before) {
        filters.push(`receivedDateTime le ${before.toISOString()}`);
      }
      if (query) {
        filters.push(`contains(subject,'${query}') or contains(bodyPreview,'${query}')`);
      }

      if (filters.length > 0) {
        params.$filter = filters.join(' and ');
      }

      const response = await this.httpClient.get(url, { params });
      const outlookMessages: OutlookMessage[] = response.data.value;

      return outlookMessages.map(msg => this.parseOutlookMessage(msg));
    } catch (error) {
      this.handleError(error, 'Failed to fetch Outlook messages');
    }
  }

  public async sendMessage(message: SendMessageRequest): Promise<any> {
    try {
      const outlookMessage = {
        subject: message.subject,
        body: {
          contentType: message.body.html ? 'HTML' : 'Text',
          content: message.body.html || message.body.text || '',
        },
        toRecipients: message.to.map(addr => ({
          emailAddress: {
            address: addr.email,
            name: addr.name || addr.email,
          },
        })),
        ccRecipients: message.cc?.map(addr => ({
          emailAddress: {
            address: addr.email,
            name: addr.name || addr.email,
          },
        })),
        bccRecipients: message.bcc?.map(addr => ({
          emailAddress: {
            address: addr.email,
            name: addr.name || addr.email,
          },
        })),
      };

      const response = await this.httpClient.post('/me/sendMail', {
        message: outlookMessage,
      });

      integrationLogger.info('Outlook message sent successfully');

      return {
        success: true,
        messageId: response.headers['x-ms-request-id'],
      };
    } catch (error) {
      this.handleError(error, 'Failed to send Outlook message');
    }
  }

  public async markAsRead(messageId: string): Promise<void> {
    try {
      await this.httpClient.patch(`/me/messages/${messageId}`, {
        isRead: true,
      });
    } catch (error) {
      this.handleError(error, 'Failed to mark Outlook message as read');
    }
  }

  public async deleteMessage(messageId: string): Promise<void> {
    try {
      await this.httpClient.delete(`/me/messages/${messageId}`);
    } catch (error) {
      this.handleError(error, 'Failed to delete Outlook message');
    }
  }

  // Webhook operations
  public async setupWebhook(webhookUrl: string): Promise<any> {
    try {
      const subscription = {
        changeType: 'created,updated',
        notificationUrl: webhookUrl,
        resource: '/me/messages',
        expirationDateTime: new Date(Date.now() + 4230 * 60 * 1000).toISOString(), // Max 4230 minutes
        clientState: `outlook-${this.id}-${Date.now()}`,
      };

      const response = await this.httpClient.post('/subscriptions', subscription);
      this.subscriptionId = response.data.id;

      integrationLogger.info('Outlook webhook setup successfully', {
        subscriptionId: this.subscriptionId,
        expirationDateTime: response.data.expirationDateTime,
      });

      return {
        subscriptionId: this.subscriptionId,
        expirationDateTime: response.data.expirationDateTime,
      };
    } catch (error) {
      this.handleError(error, 'Failed to setup Outlook webhook');
    }
  }

  public async removeWebhook(webhookId: string): Promise<void> {
    try {
      await this.httpClient.delete(`/subscriptions/${webhookId}`);
      if (this.subscriptionId === webhookId) {
        this.subscriptionId = undefined;
      }
    } catch (error) {
      this.handleError(error, 'Failed to remove Outlook webhook');
    }
  }

  public async processWebhook(payload: any): Promise<any> {
    try {
      const notifications = payload.value || [];
      const processedMessages: Message[] = [];

      for (const notification of notifications) {
        if (notification.changeType === 'created') {
          // Fetch the full message
          const messageResponse = await this.httpClient.get(`/me/messages/${notification.resourceData.id}`);
          const outlookMessage: OutlookMessage = messageResponse.data;
          processedMessages.push(this.parseOutlookMessage(outlookMessage));
        }
      }

      return {
        messages: processedMessages,
        processedCount: notifications.length,
      };
    } catch (error) {
      this.handleError(error, 'Failed to process Outlook webhook');
    }
  }

  // Sync operation
  public async sync(lastSyncAt?: Date): Promise<SyncResult> {
    try {
      const messages = await this.fetchMessages({
        limit: this.config.maxPageSize || 100,
        since: lastSyncAt,
      });

      return {
        messages,
        hasMore: messages.length === (this.config.maxPageSize || 100),
      };
    } catch (error) {
      this.handleError(error, 'Outlook sync failed');
    }
  }

  // Helper methods
  private async ensureValidToken(): Promise<void> {
    if (this.tokenExpiry && new Date() >= this.tokenExpiry) {
      // Token is expired, refresh it
      const newCredentials = await this.refreshAuth({
        refreshToken: this.refreshToken,
      });
      
      this.accessToken = newCredentials.accessToken;
      this.refreshToken = newCredentials.refreshToken;
      this.tokenExpiry = newCredentials.expiresAt;
    }
  }

  private parseOutlookMessage(outlookMessage: OutlookMessage): Message {
    return {
      id: outlookMessage.id,
      threadId: outlookMessage.conversationId,
      from: {
        email: outlookMessage.from.emailAddress.address,
        name: outlookMessage.from.emailAddress.name,
      },
      to: outlookMessage.toRecipients.map(recipient => ({
        email: recipient.emailAddress.address,
        name: recipient.emailAddress.name,
      })),
      cc: outlookMessage.ccRecipients?.map(recipient => ({
        email: recipient.emailAddress.address,
        name: recipient.emailAddress.name,
      })),
      subject: outlookMessage.subject,
      body: {
        text: outlookMessage.body.contentType === 'Text' ? outlookMessage.body.content : undefined,
        html: outlookMessage.body.contentType === 'HTML' ? outlookMessage.body.content : undefined,
      },
      date: new Date(outlookMessage.receivedDateTime),
      isRead: outlookMessage.isRead,
      isImportant: outlookMessage.importance === 'high',
      metadata: {
        bodyPreview: outlookMessage.bodyPreview,
        hasAttachments: outlookMessage.hasAttachments,
        importance: outlookMessage.importance,
      },
    };
  }
}

export default OutlookConnector;
