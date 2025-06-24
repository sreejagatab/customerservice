/**
 * Gmail Connector - Google Workspace Integration
 */

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { AbstractConnector, Message, SendMessageRequest, FetchOptions, SyncResult } from './base';
import { IntegrationError, ExternalServiceError } from '../middleware/error-handler';
import { config } from '../config';
import { integrationLogger } from '../utils/logger';

export class GmailConnector extends AbstractConnector {
  public readonly id = 'gmail-connector';
  public readonly type = 'email';
  public readonly provider = 'gmail';
  public readonly name = 'Gmail/Google Workspace';
  public readonly version = '1.0.0';
  public readonly supportedFeatures = [
    'read_messages',
    'send_messages',
    'mark_read',
    'delete_messages',
    'webhooks',
    'sync',
    'labels',
    'attachments',
  ];

  private oauth2Client: OAuth2Client;
  private gmail!: gmail_v1.Gmail;
  private watchExpiration?: Date;
  private historyId?: string;

  constructor() {
    super();
    this.oauth2Client = new OAuth2Client(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  // Authentication methods
  public async authenticate(credentials: any): Promise<any> {
    try {
      if (!credentials.accessToken) {
        throw new IntegrationError('Access token is required for Gmail authentication');
      }

      this.oauth2Client.setCredentials({
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
        expiry_date: credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : undefined,
      });

      // Test the credentials
      const auth = await this.oauth2Client.getAccessToken();
      if (!auth.token) {
        throw new IntegrationError('Failed to obtain access token');
      }

      return {
        accessToken: auth.token,
        refreshToken: credentials.refreshToken,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };
    } catch (error) {
      this.handleError(error, 'Gmail authentication failed');
    }
  }

  public async refreshAuth(credentials: any): Promise<any> {
    try {
      if (!credentials.refreshToken) {
        throw new IntegrationError('Refresh token is required');
      }

      this.oauth2Client.setCredentials({
        refresh_token: credentials.refreshToken,
      });

      const { credentials: newCredentials } = await this.oauth2Client.refreshAccessToken();
      
      return {
        accessToken: newCredentials.access_token,
        refreshToken: newCredentials.refresh_token || credentials.refreshToken,
        expiresAt: new Date(newCredentials.expiry_date || Date.now() + 3600000),
      };
    } catch (error) {
      this.handleError(error, 'Gmail token refresh failed');
    }
  }

  public async validateAuth(credentials: any): Promise<boolean> {
    try {
      await this.authenticate(credentials);
      
      // Test with a simple API call
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      await gmail.users.getProfile({ userId: 'me' });
      
      return true;
    } catch (error: any) {
      integrationLogger.warn('Gmail auth validation failed:', error.message);
      return false;
    }
  }

  // Connection methods
  public async connect(): Promise<void> {
    try {
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      
      // Test connection with profile fetch
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      
      integrationLogger.info('Connected to Gmail', {
        email: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal,
        threadsTotal: profile.data.threadsTotal,
      });

      this.emit('connected');
    } catch (error) {
      this.handleError(error, 'Gmail connection failed');
    }
  }

  public async disconnect(): Promise<void> {
    try {
      // Revoke the token if possible
      if (this.oauth2Client.credentials.access_token) {
        await this.oauth2Client.revokeCredentials();
      }

      this.gmail = null as any;
      this.emit('disconnected');
    } catch (error: any) {
      integrationLogger.warn('Error during Gmail disconnect:', error.message);
      // Don't throw error on disconnect
    }
  }

  // Health check
  protected async performHealthCheck(): Promise<boolean> {
    try {
      if (!this.gmail) {
        return false;
      }

      await this.gmail.users.getProfile({ userId: 'me' });
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
        labels = ['INBOX'],
        since,
        before,
        includeSpamTrash = false,
      } = options;

      // Build query string
      let q = query || '';
      if (labels.length > 0) {
        q += ` ${labels.map(label => `label:${label}`).join(' OR ')}`;
      }
      if (since) {
        q += ` after:${Math.floor(since.getTime() / 1000)}`;
      }
      if (before) {
        q += ` before:${Math.floor(before.getTime() / 1000)}`;
      }

      // List messages
      const listResponse = await this.gmail.users.messages.list({
        userId: 'me',
        q: q.trim(),
        maxResults: limit,
        pageToken,
        includeSpamTrash,
      });

      if (!listResponse.data.messages) {
        return [];
      }

      // Fetch full message details
      const messages = await Promise.all(
        listResponse.data.messages.map(async (msg) => {
          const fullMessage = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'full',
          });
          return this.parseGmailMessage(fullMessage.data);
        })
      );

      return messages;
    } catch (error) {
      this.handleError(error, 'Failed to fetch Gmail messages');
    }
  }

  public async sendMessage(message: SendMessageRequest): Promise<any> {
    try {
      const rawMessage = this.buildRawMessage(message);
      
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawMessage,
        },
      });

      integrationLogger.info('Gmail message sent successfully', {
        messageId: response.data.id,
        threadId: response.data.threadId,
      });

      return {
        id: response.data.id,
        threadId: response.data.threadId,
      };
    } catch (error) {
      this.handleError(error, 'Failed to send Gmail message');
    }
  }

  public async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      this.handleError(error, 'Failed to mark Gmail message as read');
    }
  }

  public async deleteMessage(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.delete({
        userId: 'me',
        id: messageId,
      });
    } catch (error) {
      this.handleError(error, 'Failed to delete Gmail message');
    }
  }

  // Webhook operations
  public async setupWebhook(webhookUrl: string): Promise<any> {
    try {
      // Set up Gmail push notifications
      const response = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: this.config.watchTopic || `projects/${config.google.clientId}/topics/gmail-notifications`,
          labelIds: this.config.labelIds || ['INBOX'],
          labelFilterAction: 'include',
        },
      });

      this.watchExpiration = new Date(parseInt(response.data.expiration!));
      this.historyId = response.data.historyId || undefined;

      integrationLogger.info('Gmail webhook setup successfully', {
        historyId: this.historyId,
        expiration: this.watchExpiration,
      });

      return {
        historyId: this.historyId,
        expiration: this.watchExpiration,
      };
    } catch (error) {
      this.handleError(error, 'Failed to setup Gmail webhook');
    }
  }

  public async removeWebhook(): Promise<void> {
    try {
      await this.gmail.users.stop({ userId: 'me' });
      this.watchExpiration = undefined;
      this.historyId = undefined;
    } catch (error) {
      this.handleError(error, 'Failed to remove Gmail webhook');
    }
  }

  public async processWebhook(payload: any): Promise<any> {
    try {
      // Decode the Pub/Sub message
      const data = JSON.parse(Buffer.from(payload.message.data, 'base64').toString());
      
      if (!data.historyId) {
        throw new IntegrationError('Invalid Gmail webhook payload: missing historyId');
      }

      // Get history since last known historyId
      const historyResponse = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: this.historyId || data.historyId,
      });

      const changes = historyResponse.data.history || [];
      const processedMessages: Message[] = [];

      for (const change of changes) {
        if (change.messagesAdded) {
          for (const msgAdded of change.messagesAdded) {
            const fullMessage = await this.gmail.users.messages.get({
              userId: 'me',
              id: msgAdded.message!.id!,
              format: 'full',
            });
            processedMessages.push(this.parseGmailMessage(fullMessage.data));
          }
        }
      }

      // Update historyId
      this.historyId = data.historyId;

      return {
        messages: processedMessages,
        historyId: this.historyId,
      };
    } catch (error) {
      this.handleError(error, 'Failed to process Gmail webhook');
    }
  }

  // Sync operation
  public async sync(lastSyncAt?: Date): Promise<SyncResult> {
    try {
      const messages = await this.fetchMessages({
        limit: this.config.maxResults || 100,
        since: lastSyncAt,
        labels: this.config.labelIds || ['INBOX'],
      });

      return {
        messages,
        syncToken: this.historyId || undefined,
        hasMore: messages.length === (this.config.maxResults || 100),
      };
    } catch (error) {
      this.handleError(error, 'Gmail sync failed');
    }
  }

  // Helper methods
  private parseGmailMessage(gmailMessage: gmail_v1.Schema$Message): Message {
    const headers = gmailMessage.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    // Parse body
    let textBody = '';
    let htmlBody = '';
    
    if (gmailMessage.payload?.body?.data) {
      textBody = Buffer.from(gmailMessage.payload.body.data, 'base64').toString();
    } else if (gmailMessage.payload?.parts) {
      for (const part of gmailMessage.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          textBody = Buffer.from(part.body.data, 'base64').toString();
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody = Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }

    return {
      id: gmailMessage.id!,
      threadId: gmailMessage.threadId || undefined,
      from: this.parseEmailAddress(getHeader('from')),
      to: getHeader('to').split(',').map(addr => this.parseEmailAddress(addr.trim())),
      cc: getHeader('cc') ? getHeader('cc').split(',').map(addr => this.parseEmailAddress(addr.trim())) : undefined,
      subject: getHeader('subject'),
      body: {
        text: textBody,
        html: htmlBody,
      },
      date: new Date(parseInt(gmailMessage.internalDate!)),
      labels: gmailMessage.labelIds || undefined,
      isRead: !gmailMessage.labelIds?.includes('UNREAD'),
      isImportant: gmailMessage.labelIds?.includes('IMPORTANT'),
      metadata: {
        snippet: gmailMessage.snippet,
        sizeEstimate: gmailMessage.sizeEstimate,
      },
    };
  }

  private buildRawMessage(message: SendMessageRequest): string {
    const lines: string[] = [];
    
    // Headers
    lines.push(`To: ${message.to.map(addr => this.formatEmailAddress(addr)).join(', ')}`);
    if (message.cc?.length) {
      lines.push(`Cc: ${message.cc.map(addr => this.formatEmailAddress(addr)).join(', ')}`);
    }
    if (message.bcc?.length) {
      lines.push(`Bcc: ${message.bcc.map(addr => this.formatEmailAddress(addr)).join(', ')}`);
    }
    lines.push(`Subject: ${message.subject}`);
    if (message.replyTo) {
      lines.push(`Reply-To: ${message.replyTo}`);
    }
    if (message.inReplyTo) {
      lines.push(`In-Reply-To: ${message.inReplyTo}`);
    }
    if (message.references?.length) {
      lines.push(`References: ${message.references.join(' ')}`);
    }
    
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('');
    
    // Body
    lines.push(message.body.html || message.body.text || '');
    
    const rawMessage = lines.join('\r\n');
    return Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

export default GmailConnector;
