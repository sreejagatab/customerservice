/**
 * Integration Manager - Universal Connector Framework
 * Manages all third-party integrations and provides a unified interface
 */

import { EventEmitter } from 'events';
import { logger, integrationLogger, logIntegrationEvent } from '../utils/logger';
import { IntegrationError, ConfigurationError } from '../middleware/error-handler';
import { integrationRepo } from './database';
import { queueService, JobType } from './queue';

// Base connector interface
export interface BaseConnector {
  readonly id: string;
  readonly type: string;
  readonly provider: string;
  readonly name: string;
  readonly version: string;
  readonly supportedFeatures: string[];

  // Status getters
  readonly initialized: boolean;
  readonly connected: boolean;

  // Lifecycle methods
  initialize(config: any, credentials: any): Promise<void>;
  destroy(): Promise<void>;
  healthCheck(): Promise<boolean>;

  // Authentication methods
  authenticate(credentials: any): Promise<any>;
  refreshAuth(credentials: any): Promise<any>;
  validateAuth(credentials: any): Promise<boolean>;

  // Core operations
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  test(): Promise<boolean>;

  // Message operations (if supported)
  fetchMessages?(options?: any): Promise<any[]>;
  sendMessage?(message: any): Promise<any>;
  markAsRead?(messageId: string): Promise<void>;
  deleteMessage?(messageId: string): Promise<void>;

  // Webhook operations (if supported)
  setupWebhook?(webhookUrl: string): Promise<any>;
  removeWebhook?(webhookId: string): Promise<void>;
  processWebhook?(payload: any, signature?: string): Promise<any>;

  // Sync operations
  sync?(lastSyncAt?: Date): Promise<any>;
  getLastSyncToken?(): Promise<string | null>;
}

// Connector registry
export class ConnectorRegistry {
  private static instance: ConnectorRegistry;
  private connectors: Map<string, new () => BaseConnector> = new Map();
  private instances: Map<string, BaseConnector> = new Map();

  private constructor() {}

  public static getInstance(): ConnectorRegistry {
    if (!ConnectorRegistry.instance) {
      ConnectorRegistry.instance = new ConnectorRegistry();
    }
    return ConnectorRegistry.instance;
  }

  // Register a connector class
  public register(provider: string, connectorClass: new () => BaseConnector): void {
    this.connectors.set(provider, connectorClass);
    integrationLogger.info(`Registered connector for provider: ${provider}`);
  }

  // Create connector instance
  public create(provider: string): BaseConnector {
    const ConnectorClass = this.connectors.get(provider);
    if (!ConnectorClass) {
      throw new ConfigurationError(`No connector found for provider: ${provider}`);
    }

    return new ConnectorClass();
  }

  // Get or create connector instance
  public getInstance(integrationId: string, provider: string): BaseConnector {
    const instanceKey = `${integrationId}:${provider}`;
    
    if (!this.instances.has(instanceKey)) {
      const connector = this.create(provider);
      this.instances.set(instanceKey, connector);
    }

    return this.instances.get(instanceKey)!;
  }

  // Remove connector instance
  public removeInstance(integrationId: string, provider: string): void {
    const instanceKey = `${integrationId}:${provider}`;
    const connector = this.instances.get(instanceKey);
    
    if (connector) {
      connector.destroy().catch(error => {
        integrationLogger.error(`Error destroying connector instance ${instanceKey}:`, error);
      });
      this.instances.delete(instanceKey);
    }
  }

  // Get all registered providers
  public getProviders(): string[] {
    return Array.from(this.connectors.keys());
  }

  // Check if provider is supported
  public isSupported(provider: string): boolean {
    return this.connectors.has(provider);
  }
}

// Integration Manager
export class IntegrationManager extends EventEmitter {
  private static instance: IntegrationManager;
  private registry: ConnectorRegistry;
  private activeIntegrations: Map<string, BaseConnector> = new Map();
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  private constructor() {
    super();
    this.registry = ConnectorRegistry.getInstance();
    this.setupEventHandlers();
  }

  public static getInstance(): IntegrationManager {
    if (!IntegrationManager.instance) {
      IntegrationManager.instance = new IntegrationManager();
    }
    return IntegrationManager.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = IntegrationManager.getInstance();
    await instance.init();
  }

  public static async close(): Promise<void> {
    const instance = IntegrationManager.getInstance();
    await instance.close();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Register built-in connectors
      await this.registerBuiltInConnectors();

      // Load active integrations
      await this.loadActiveIntegrations();

      this.isInitialized = true;
      integrationLogger.info('Integration manager initialized successfully');
    } catch (error) {
      integrationLogger.error('Failed to initialize integration manager:', error);
      throw error;
    }
  }

  private async registerBuiltInConnectors(): Promise<void> {
    // Import and register connectors
    try {
      // Gmail connector
      const { GmailConnector } = await import('../connectors/gmail');
      this.registry.register('gmail', GmailConnector);

      // Outlook connector
      const { OutlookConnector } = await import('../connectors/outlook');
      this.registry.register('outlook', OutlookConnector);

      // SMTP connector
      const { SmtpConnector } = await import('../connectors/smtp');
      this.registry.register('smtp', SmtpConnector);

      // IMAP connector
      const { ImapConnector } = await import('../connectors/imap');
      this.registry.register('imap', ImapConnector);

      integrationLogger.info('Built-in connectors registered successfully');
    } catch (error) {
      integrationLogger.warn('Some connectors failed to register:', error);
      // Continue initialization even if some connectors fail
    }
  }

  private async loadActiveIntegrations(): Promise<void> {
    try {
      // This would typically load from database
      // For now, we'll implement this when we have the database queries ready
      integrationLogger.info('Active integrations loaded');
    } catch (error) {
      integrationLogger.error('Failed to load active integrations:', error);
    }
  }

  private setupEventHandlers(): void {
    this.on('integration:created', this.handleIntegrationCreated.bind(this));
    this.on('integration:updated', this.handleIntegrationUpdated.bind(this));
    this.on('integration:deleted', this.handleIntegrationDeleted.bind(this));
    this.on('integration:error', this.handleIntegrationError.bind(this));
  }

  // Create and initialize an integration
  public async createIntegration(integrationData: {
    id: string;
    organizationId: string;
    name: string;
    type: string;
    provider: string;
    config: any;
    credentials: any;
    webhookUrl?: string;
  }): Promise<BaseConnector> {
    try {
      const connector = this.registry.getInstance(integrationData.id, integrationData.provider);
      
      // Initialize the connector
      await connector.initialize(integrationData.config, integrationData.credentials);
      
      // Test the connection
      const isHealthy = await connector.healthCheck();
      if (!isHealthy) {
        throw new IntegrationError('Integration health check failed');
      }

      // Store the active integration
      this.activeIntegrations.set(integrationData.id, connector);

      // Set up webhook if supported and configured
      if (integrationData.webhookUrl && connector.setupWebhook) {
        await connector.setupWebhook(integrationData.webhookUrl);
      }

      // Set up sync interval if supported
      if (connector.sync && integrationData.config.autoSync) {
        this.setupSyncInterval(integrationData.id, integrationData.config.syncInterval || 300000); // 5 minutes default
      }

      logIntegrationEvent('created', integrationData.id, integrationData.provider, {
        organizationId: integrationData.organizationId,
        name: integrationData.name,
      });

      this.emit('integration:created', integrationData);
      return connector;
    } catch (error) {
      integrationLogger.error(`Failed to create integration ${integrationData.id}:`, error);
      throw error;
    }
  }

  // Get an active integration
  public getIntegration(integrationId: string): BaseConnector | undefined {
    return this.activeIntegrations.get(integrationId);
  }

  // Update an integration
  public async updateIntegration(
    integrationId: string,
    updates: {
      config?: any;
      credentials?: any;
      webhookUrl?: string;
    }
  ): Promise<void> {
    const connector = this.activeIntegrations.get(integrationId);
    if (!connector) {
      throw new IntegrationError(`Integration ${integrationId} not found`);
    }

    try {
      // Re-initialize with new config/credentials
      if (updates.config || updates.credentials) {
        const integration = await integrationRepo.getIntegration(integrationId, ''); // TODO: Get org ID
        if (integration.rows.length === 0) {
          throw new IntegrationError(`Integration ${integrationId} not found in database`);
        }

        const integrationData = integration.rows[0];
        const newConfig = updates.config || integrationData.config;
        const newCredentials = updates.credentials || integrationData.credentials;

        await connector.initialize(newConfig, newCredentials);
      }

      // Update webhook if changed
      if (updates.webhookUrl && connector.setupWebhook) {
        await connector.setupWebhook(updates.webhookUrl);
      }

      logIntegrationEvent('updated', integrationId, connector.provider);
      this.emit('integration:updated', { integrationId, updates });
    } catch (error) {
      integrationLogger.error(`Failed to update integration ${integrationId}:`, error);
      throw error;
    }
  }

  // Delete an integration
  public async deleteIntegration(integrationId: string): Promise<void> {
    const connector = this.activeIntegrations.get(integrationId);
    if (!connector) {
      return; // Already deleted or never existed
    }

    try {
      // Clean up sync interval
      this.clearSyncInterval(integrationId);

      // Destroy the connector
      await connector.destroy();

      // Remove from active integrations
      this.activeIntegrations.delete(integrationId);
      this.registry.removeInstance(integrationId, connector.provider);

      logIntegrationEvent('deleted', integrationId, connector.provider);
      this.emit('integration:deleted', { integrationId });
    } catch (error) {
      integrationLogger.error(`Failed to delete integration ${integrationId}:`, error);
      throw error;
    }
  }

  // Test an integration
  public async testIntegration(integrationId: string): Promise<boolean> {
    const connector = this.activeIntegrations.get(integrationId);
    if (!connector) {
      throw new IntegrationError(`Integration ${integrationId} not found`);
    }

    try {
      const result = await connector.test();
      logIntegrationEvent('tested', integrationId, connector.provider, { result });
      return result;
    } catch (error) {
      integrationLogger.error(`Integration test failed for ${integrationId}:`, error);
      throw error;
    }
  }

  // Sync an integration
  public async syncIntegration(integrationId: string, lastSyncAt?: Date): Promise<void> {
    const connector = this.activeIntegrations.get(integrationId);
    if (!connector || !connector.sync) {
      throw new IntegrationError(`Integration ${integrationId} does not support sync`);
    }

    try {
      await connector.sync(lastSyncAt);
      logIntegrationEvent('synced', integrationId, connector.provider);
    } catch (error) {
      integrationLogger.error(`Sync failed for integration ${integrationId}:`, error);
      this.emit('integration:error', { integrationId, error });
      throw error;
    }
  }

  // Set up automatic sync for an integration
  private setupSyncInterval(integrationId: string, intervalMs: number): void {
    // Clear existing interval if any
    this.clearSyncInterval(integrationId);

    const interval = setInterval(async () => {
      try {
        await queueService.addSyncJob({
          integrationId,
          organizationId: '', // TODO: Get from integration data
          syncType: 'incremental',
        });
      } catch (error) {
        integrationLogger.error(`Failed to queue sync job for ${integrationId}:`, error);
      }
    }, intervalMs);

    this.syncIntervals.set(integrationId, interval);
    integrationLogger.debug(`Set up sync interval for integration ${integrationId}`, { intervalMs });
  }

  // Clear sync interval for an integration
  private clearSyncInterval(integrationId: string): void {
    const interval = this.syncIntervals.get(integrationId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(integrationId);
      integrationLogger.debug(`Cleared sync interval for integration ${integrationId}`);
    }
  }

  // Event handlers
  private async handleIntegrationCreated(data: any): Promise<void> {
    integrationLogger.info('Integration created event handled', data);
  }

  private async handleIntegrationUpdated(data: any): Promise<void> {
    integrationLogger.info('Integration updated event handled', data);
  }

  private async handleIntegrationDeleted(data: any): Promise<void> {
    integrationLogger.info('Integration deleted event handled', data);
  }

  private async handleIntegrationError(data: any): Promise<void> {
    integrationLogger.error('Integration error event handled', data);
    
    // Update error count in database
    try {
      await integrationRepo.updateSyncStatus(
        data.integrationId,
        '', // TODO: Get org ID
        'error',
        undefined,
        undefined,
        data.error.message
      );
    } catch (error) {
      integrationLogger.error('Failed to update integration error status:', error);
    }
  }

  // Health check for all active integrations
  public async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [integrationId, connector] of this.activeIntegrations) {
      try {
        results[integrationId] = await connector.healthCheck();
      } catch (error) {
        results[integrationId] = false;
        integrationLogger.error(`Health check failed for integration ${integrationId}:`, error);
      }
    }

    return results;
  }

  // Get integration statistics
  public getStats() {
    return {
      totalIntegrations: this.activeIntegrations.size,
      supportedProviders: this.registry.getProviders(),
      activeSyncIntervals: this.syncIntervals.size,
    };
  }

  public async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Clear all sync intervals
      for (const [integrationId] of this.syncIntervals) {
        this.clearSyncInterval(integrationId);
      }

      // Destroy all active integrations
      await Promise.all(
        Array.from(this.activeIntegrations.values()).map(connector => 
          connector.destroy().catch(error => 
            integrationLogger.error('Error destroying connector:', error)
          )
        )
      );

      this.activeIntegrations.clear();
      this.isInitialized = false;
      integrationLogger.info('Integration manager closed successfully');
    } catch (error) {
      integrationLogger.error('Error closing integration manager:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const integrationManager = IntegrationManager.getInstance();
export const connectorRegistry = ConnectorRegistry.getInstance();

export default IntegrationManager;
