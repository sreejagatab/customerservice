/**
 * Base connector class for all integrations
 */

import { EventEmitter } from 'events';
import { BaseConnector } from '../services/integration-manager';
import { logger, integrationLogger } from '../utils/logger';
import { IntegrationError, ExternalServiceError } from '../middleware/error-handler';

// Message interface
export interface Message {
  id: string;
  threadId?: string;
  from: {
    email: string;
    name?: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  cc?: Array<{
    email: string;
    name?: string;
  }>;
  bcc?: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
  }>;
  date: Date;
  labels?: string[];
  isRead: boolean;
  isImportant?: boolean;
  metadata?: Record<string, any>;
}

// Send message interface
export interface SendMessageRequest {
  to: Array<{
    email: string;
    name?: string;
  }>;
  cc?: Array<{
    email: string;
    name?: string;
  }>;
  bcc?: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
}

// Fetch options interface
export interface FetchOptions {
  limit?: number;
  pageToken?: string;
  query?: string;
  labels?: string[];
  since?: Date;
  before?: Date;
  includeSpamTrash?: boolean;
}

// Sync result interface
export interface SyncResult {
  messages: Message[];
  nextPageToken?: string;
  syncToken?: string;
  hasMore: boolean;
}

// Abstract base connector
export abstract class AbstractConnector extends EventEmitter implements BaseConnector {
  public abstract readonly id: string;
  public abstract readonly type: string;
  public abstract readonly provider: string;
  public abstract readonly name: string;
  public abstract readonly version: string;
  public abstract readonly supportedFeatures: string[];

  protected config: any;
  protected credentials: any;
  protected isConnected = false;
  protected isInitialized = false;
  protected lastError?: Error | any;

  // Public getters for test access
  public get connected(): boolean {
    return this.isConnected;
  }

  public get initialized(): boolean {
    return this.isInitialized;
  }

  constructor() {
    super();
    this.setupEventHandlers();
  }

  // Abstract methods that must be implemented by subclasses
  public abstract authenticate(credentials: any): Promise<any>;
  public abstract refreshAuth(credentials: any): Promise<any>;
  public abstract validateAuth(credentials: any): Promise<boolean>;
  public abstract connect(): Promise<void>;
  public abstract disconnect(): Promise<void>;

  // Lifecycle methods
  public async initialize(config: any, credentials: any): Promise<void> {
    try {
      this.config = config;
      this.credentials = credentials;

      // Validate configuration
      await this.validateConfig(config);

      // Validate and refresh credentials if needed
      const isValid = await this.validateAuth(credentials);
      if (!isValid) {
        throw new IntegrationError('Invalid credentials provided');
      }

      // Connect to the service
      await this.connect();

      this.isInitialized = true;
      this.emit('initialized');

      integrationLogger.info(`Connector ${this.id} initialized successfully`, {
        provider: this.provider,
        type: this.type,
      });
    } catch (error) {
      this.lastError = error;
      integrationLogger.error(`Failed to initialize connector ${this.id}:`, error);
      throw error;
    }
  }

  public async destroy(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.disconnect();
      }

      this.isInitialized = false;
      this.isConnected = false;
      this.removeAllListeners();

      integrationLogger.info(`Connector ${this.id} destroyed successfully`);
    } catch (error) {
      integrationLogger.error(`Error destroying connector ${this.id}:`, error);
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized || !this.isConnected) {
        return false;
      }

      // Perform provider-specific health check
      return await this.performHealthCheck();
    } catch (error) {
      this.lastError = error;
      integrationLogger.error(`Health check failed for connector ${this.id}:`, error);
      return false;
    }
  }

  public async test(): Promise<boolean> {
    try {
      // Test authentication
      const authValid = await this.validateAuth(this.credentials);
      if (!authValid) {
        return false;
      }

      // Test connection
      if (!this.isConnected) {
        await this.connect();
      }

      // Perform provider-specific test
      return await this.performTest();
    } catch (error) {
      this.lastError = error;
      integrationLogger.error(`Test failed for connector ${this.id}:`, error);
      return false;
    }
  }

  // Optional methods with default implementations
  public async fetchMessages(options?: FetchOptions): Promise<Message[]> {
    if (!this.supportedFeatures.includes('read_messages')) {
      throw new IntegrationError(`Provider ${this.provider} does not support reading messages`);
    }
    throw new IntegrationError('fetchMessages method not implemented');
  }

  public async sendMessage(message: SendMessageRequest): Promise<any> {
    if (!this.supportedFeatures.includes('send_messages')) {
      throw new IntegrationError(`Provider ${this.provider} does not support sending messages`);
    }
    throw new IntegrationError('sendMessage method not implemented');
  }

  public async markAsRead(messageId: string): Promise<void> {
    if (!this.supportedFeatures.includes('mark_read')) {
      throw new IntegrationError(`Provider ${this.provider} does not support marking messages as read`);
    }
    throw new IntegrationError('markAsRead method not implemented');
  }

  public async deleteMessage(messageId: string): Promise<void> {
    if (!this.supportedFeatures.includes('delete_messages')) {
      throw new IntegrationError(`Provider ${this.provider} does not support deleting messages`);
    }
    throw new IntegrationError('deleteMessage method not implemented');
  }

  public async setupWebhook(webhookUrl: string): Promise<any> {
    if (!this.supportedFeatures.includes('webhooks')) {
      throw new IntegrationError(`Provider ${this.provider} does not support webhooks`);
    }
    throw new IntegrationError('setupWebhook method not implemented');
  }

  public async removeWebhook(webhookId: string): Promise<void> {
    if (!this.supportedFeatures.includes('webhooks')) {
      throw new IntegrationError(`Provider ${this.provider} does not support webhooks`);
    }
    throw new IntegrationError('removeWebhook method not implemented');
  }

  public async processWebhook(payload: any, signature?: string): Promise<any> {
    if (!this.supportedFeatures.includes('webhooks')) {
      throw new IntegrationError(`Provider ${this.provider} does not support webhooks`);
    }
    throw new IntegrationError('processWebhook method not implemented');
  }

  public async sync(lastSyncAt?: Date): Promise<SyncResult> {
    if (!this.supportedFeatures.includes('sync')) {
      throw new IntegrationError(`Provider ${this.provider} does not support sync`);
    }
    throw new IntegrationError('sync method not implemented');
  }

  public async getLastSyncToken(): Promise<string | null> {
    return null;
  }

  // Protected helper methods
  protected async validateConfig(config: any): Promise<void> {
    // Override in subclasses for provider-specific validation
    if (!config) {
      throw new IntegrationError('Configuration is required');
    }
  }

  protected async performHealthCheck(): Promise<boolean> {
    // Override in subclasses for provider-specific health checks
    return this.isConnected;
  }

  protected async performTest(): Promise<boolean> {
    // Override in subclasses for provider-specific tests
    return await this.performHealthCheck();
  }

  protected handleError(error: any, context?: string): never {
    const message = context ? `${context}: ${error.message}` : error.message;
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new ExternalServiceError(`Connection failed to ${this.provider}`, this.provider, {
        originalError: error.message,
        code: error.code,
      });
    }

    if (error.status === 401 || error.status === 403) {
      throw new IntegrationError(`Authentication failed for ${this.provider}`, 401, 'AUTH_ERROR', {
        originalError: error.message,
        status: error.status,
      });
    }

    if (error.status === 429) {
      throw new IntegrationError(`Rate limit exceeded for ${this.provider}`, 429, 'RATE_LIMIT_ERROR', {
        originalError: error.message,
        retryAfter: error.headers?.['retry-after'],
      });
    }

    throw new ExternalServiceError(message, this.provider, {
      originalError: error.message,
      status: error.status,
      code: error.code,
    });
  }

  protected setupEventHandlers(): void {
    this.on('error', (error) => {
      this.lastError = error;
      integrationLogger.error(`Connector ${this.id} error:`, error);
    });

    this.on('connected', () => {
      this.isConnected = true;
      integrationLogger.info(`Connector ${this.id} connected`);
    });

    this.on('disconnected', () => {
      this.isConnected = false;
      integrationLogger.info(`Connector ${this.id} disconnected`);
    });
  }

  // Utility methods
  protected parseEmailAddress(address: string): { email: string; name?: string } {
    const match = address.match(/^(.+?)\s*<(.+?)>$/) || address.match(/^(.+)$/);
    if (!match) {
      throw new IntegrationError(`Invalid email address format: ${address}`);
    }

    if (match.length === 3) {
      return {
        name: match[1].trim().replace(/^["']|["']$/g, ''),
        email: match[2].trim(),
      };
    } else {
      return {
        email: match[1].trim(),
      };
    }
  }

  protected formatEmailAddress(contact: { email: string; name?: string }): string {
    if (contact.name) {
      return `"${contact.name}" <${contact.email}>`;
    }
    return contact.email;
  }

  // Getters
  public get isHealthy(): boolean {
    return this.isInitialized && this.isConnected && !this.lastError;
  }

  public get status(): string {
    if (!this.isInitialized) return 'not_initialized';
    if (!this.isConnected) return 'disconnected';
    if (this.lastError) return 'error';
    return 'connected';
  }

  public getLastError(): Error | undefined {
    return this.lastError;
  }
}

export default AbstractConnector;
