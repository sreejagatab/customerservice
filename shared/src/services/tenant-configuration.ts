/**
 * Tenant Configuration Service
 * Manages tenant-specific configurations, settings, and customizations
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { RedisService } from './redis';

export interface TenantConfiguration {
  organizationId: string;
  general: {
    name: string;
    description?: string;
    timezone: string;
    locale: string;
    currency: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
  };
  branding: {
    logo?: string;
    favicon?: string;
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      text: string;
    };
    fonts: {
      primary: string;
      secondary: string;
    };
    customCss?: string;
    customJs?: string;
  };
  features: {
    aiEnabled: boolean;
    autoResponse: boolean;
    sentimentAnalysis: boolean;
    voiceSupport: boolean;
    chatSupport: boolean;
    emailSupport: boolean;
    smsSupport: boolean;
    knowledgeBase: boolean;
    analytics: boolean;
    reporting: boolean;
    webhooks: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
  };
  workingHours: {
    enabled: boolean;
    timezone: string;
    schedule: {
      [key: string]: {
        enabled: boolean;
        start: string;
        end: string;
        breaks?: Array<{ start: string; end: string }>;
      };
    };
    holidays: Array<{
      date: string;
      name: string;
      recurring: boolean;
    }>;
  };
  notifications: {
    email: {
      enabled: boolean;
      fromName: string;
      fromEmail: string;
      replyTo?: string;
      templates: Record<string, string>;
    };
    sms: {
      enabled: boolean;
      fromNumber?: string;
      provider: 'twilio' | 'aws' | 'custom';
    };
    push: {
      enabled: boolean;
      vapidKeys?: {
        publicKey: string;
        privateKey: string;
      };
    };
    webhook: {
      enabled: boolean;
      endpoints: Array<{
        url: string;
        events: string[];
        secret?: string;
        active: boolean;
      }>;
    };
  };
  security: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
      maxAge: number; // days
    };
    sessionTimeout: number; // minutes
    mfaRequired: boolean;
    ipWhitelist: string[];
    allowedDomains: string[];
    dataRetention: {
      messages: number; // days
      conversations: number; // days
      analytics: number; // days
      logs: number; // days
    };
  };
  integrations: {
    crm: {
      enabled: boolean;
      provider?: 'salesforce' | 'hubspot' | 'pipedrive' | 'custom';
      config?: Record<string, any>;
    };
    helpdesk: {
      enabled: boolean;
      provider?: 'zendesk' | 'freshdesk' | 'intercom' | 'custom';
      config?: Record<string, any>;
    };
    analytics: {
      enabled: boolean;
      provider?: 'google' | 'mixpanel' | 'amplitude' | 'custom';
      config?: Record<string, any>;
    };
    payment: {
      enabled: boolean;
      provider?: 'stripe' | 'paypal' | 'square' | 'custom';
      config?: Record<string, any>;
    };
  };
  customFields: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  category: 'startup' | 'enterprise' | 'ecommerce' | 'saas' | 'custom';
  configuration: Partial<TenantConfiguration>;
  isDefault: boolean;
}

export class TenantConfigurationService extends EventEmitter {
  private static instance: TenantConfigurationService;
  private logger: Logger;
  private db: DatabaseService;
  private redis: RedisService;
  private configurations: Map<string, TenantConfiguration> = new Map();
  private templates: Map<string, ConfigurationTemplate> = new Map();

  constructor() {
    super();
    this.logger = new Logger('TenantConfigurationService');
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
  }

  public static getInstance(): TenantConfigurationService {
    if (!TenantConfigurationService.instance) {
      TenantConfigurationService.instance = new TenantConfigurationService();
    }
    return TenantConfigurationService.instance;
  }

  /**
   * Initialize tenant configuration service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadConfigurationTemplates();
      await this.loadTenantConfigurations();
      this.setupConfigurationSync();
      
      this.logger.info('Tenant configuration service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize tenant configuration service', { error });
      throw error;
    }
  }

  /**
   * Get tenant configuration
   */
  public async getTenantConfiguration(organizationId: string): Promise<TenantConfiguration | null> {
    try {
      // Check cache first
      let config = this.configurations.get(organizationId);
      if (config) {
        return config;
      }

      // Load from database
      const result = await this.db.query(`
        SELECT * FROM tenant_configurations WHERE organization_id = $1
      `, [organizationId]);

      if (result.rows.length === 0) {
        return null;
      }

      config = this.mapRowToConfiguration(result.rows[0]);
      this.configurations.set(organizationId, config);

      return config;
    } catch (error) {
      this.logger.error('Error getting tenant configuration', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Create tenant configuration
   */
  public async createTenantConfiguration(
    organizationId: string,
    configuration: Partial<TenantConfiguration>,
    templateId?: string
  ): Promise<TenantConfiguration> {
    try {
      // Start with default configuration
      let baseConfig = this.getDefaultConfiguration();

      // Apply template if specified
      if (templateId) {
        const template = this.templates.get(templateId);
        if (template) {
          baseConfig = this.mergeConfigurations(baseConfig, template.configuration);
        }
      }

      // Apply provided configuration
      const finalConfig = this.mergeConfigurations(baseConfig, configuration);
      finalConfig.organizationId = organizationId;
      finalConfig.createdAt = new Date();
      finalConfig.updatedAt = new Date();

      // Save to database
      await this.db.query(`
        INSERT INTO tenant_configurations (
          organization_id, configuration, created_at, updated_at
        ) VALUES ($1, $2, $3, $4)
      `, [
        organizationId,
        JSON.stringify(finalConfig),
        finalConfig.createdAt,
        finalConfig.updatedAt,
      ]);

      // Cache configuration
      this.configurations.set(organizationId, finalConfig);

      // Sync to Redis for fast access
      await this.syncConfigurationToRedis(organizationId, finalConfig);

      this.emit('configuration.created', {
        organizationId,
        configuration: finalConfig,
      });

      this.logger.info('Tenant configuration created', {
        organizationId,
        templateId,
      });

      return finalConfig;
    } catch (error) {
      this.logger.error('Error creating tenant configuration', {
        organizationId,
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update tenant configuration
   */
  public async updateTenantConfiguration(
    organizationId: string,
    updates: Partial<TenantConfiguration>
  ): Promise<TenantConfiguration> {
    try {
      const existingConfig = await this.getTenantConfiguration(organizationId);
      if (!existingConfig) {
        throw new Error(`Configuration not found for organization: ${organizationId}`);
      }

      // Merge updates with existing configuration
      const updatedConfig = this.mergeConfigurations(existingConfig, updates);
      updatedConfig.updatedAt = new Date();

      // Save to database
      await this.db.query(`
        UPDATE tenant_configurations 
        SET configuration = $1, updated_at = $2
        WHERE organization_id = $3
      `, [
        JSON.stringify(updatedConfig),
        updatedConfig.updatedAt,
        organizationId,
      ]);

      // Update cache
      this.configurations.set(organizationId, updatedConfig);

      // Sync to Redis
      await this.syncConfigurationToRedis(organizationId, updatedConfig);

      this.emit('configuration.updated', {
        organizationId,
        configuration: updatedConfig,
        changes: updates,
      });

      this.logger.info('Tenant configuration updated', {
        organizationId,
        changes: Object.keys(updates),
      });

      return updatedConfig;
    } catch (error) {
      this.logger.error('Error updating tenant configuration', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get configuration value by path
   */
  public async getConfigurationValue(
    organizationId: string,
    path: string,
    defaultValue?: any
  ): Promise<any> {
    try {
      const config = await this.getTenantConfiguration(organizationId);
      if (!config) {
        return defaultValue;
      }

      return this.getNestedValue(config, path, defaultValue);
    } catch (error) {
      this.logger.error('Error getting configuration value', {
        organizationId,
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return defaultValue;
    }
  }

  /**
   * Set configuration value by path
   */
  public async setConfigurationValue(
    organizationId: string,
    path: string,
    value: any
  ): Promise<void> {
    try {
      const config = await this.getTenantConfiguration(organizationId);
      if (!config) {
        throw new Error(`Configuration not found for organization: ${organizationId}`);
      }

      // Set nested value
      this.setNestedValue(config, path, value);

      // Update configuration
      await this.updateTenantConfiguration(organizationId, config);
    } catch (error) {
      this.logger.error('Error setting configuration value', {
        organizationId,
        path,
        value,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get available configuration templates
   */
  public getConfigurationTemplates(): ConfigurationTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Apply configuration template
   */
  public async applyConfigurationTemplate(
    organizationId: string,
    templateId: string,
    overrides?: Partial<TenantConfiguration>
  ): Promise<TenantConfiguration> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Configuration template not found: ${templateId}`);
      }

      const existingConfig = await this.getTenantConfiguration(organizationId);
      if (!existingConfig) {
        throw new Error(`Configuration not found for organization: ${organizationId}`);
      }

      // Merge template with existing configuration and overrides
      let updatedConfig = this.mergeConfigurations(existingConfig, template.configuration);
      
      if (overrides) {
        updatedConfig = this.mergeConfigurations(updatedConfig, overrides);
      }

      return await this.updateTenantConfiguration(organizationId, updatedConfig);
    } catch (error) {
      this.logger.error('Error applying configuration template', {
        organizationId,
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  public validateConfiguration(configuration: Partial<TenantConfiguration>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate required fields
    if (configuration.general) {
      if (!configuration.general.name) {
        errors.push('Organization name is required');
      }
      if (!configuration.general.timezone) {
        errors.push('Timezone is required');
      }
      if (!configuration.general.locale) {
        errors.push('Locale is required');
      }
    }

    // Validate branding colors
    if (configuration.branding?.colors) {
      const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      const colors = configuration.branding.colors;
      
      if (colors.primary && !colorRegex.test(colors.primary)) {
        errors.push('Invalid primary color format');
      }
      if (colors.secondary && !colorRegex.test(colors.secondary)) {
        errors.push('Invalid secondary color format');
      }
    }

    // Validate working hours
    if (configuration.workingHours?.schedule) {
      for (const [day, schedule] of Object.entries(configuration.workingHours.schedule)) {
        if (schedule.enabled) {
          if (!schedule.start || !schedule.end) {
            errors.push(`Working hours for ${day} must have start and end times`);
          }
        }
      }
    }

    // Validate security settings
    if (configuration.security?.passwordPolicy) {
      const policy = configuration.security.passwordPolicy;
      if (policy.minLength < 8) {
        errors.push('Minimum password length must be at least 8 characters');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Private helper methods
   */
  private async loadConfigurationTemplates(): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT * FROM configuration_templates WHERE active = true
      `);

      for (const row of result.rows) {
        const template: ConfigurationTemplate = {
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          configuration: JSON.parse(row.configuration),
          isDefault: row.is_default,
        };

        this.templates.set(template.id, template);
      }

      this.logger.info('Loaded configuration templates', {
        count: this.templates.size,
      });
    } catch (error) {
      this.logger.error('Error loading configuration templates', { error });
      throw error;
    }
  }

  private async loadTenantConfigurations(): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT * FROM tenant_configurations
      `);

      for (const row of result.rows) {
        const config = this.mapRowToConfiguration(row);
        this.configurations.set(config.organizationId, config);
      }

      this.logger.info('Loaded tenant configurations', {
        count: this.configurations.size,
      });
    } catch (error) {
      this.logger.error('Error loading tenant configurations', { error });
      throw error;
    }
  }

  private mapRowToConfiguration(row: any): TenantConfiguration {
    const config = JSON.parse(row.configuration);
    config.createdAt = row.created_at;
    config.updatedAt = row.updated_at;
    return config;
  }

  private getDefaultConfiguration(): TenantConfiguration {
    return {
      organizationId: '',
      general: {
        name: '',
        timezone: 'UTC',
        locale: 'en-US',
        currency: 'USD',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
      },
      branding: {
        colors: {
          primary: '#007bff',
          secondary: '#6c757d',
          accent: '#28a745',
          background: '#ffffff',
          text: '#212529',
        },
        fonts: {
          primary: 'Inter, sans-serif',
          secondary: 'Inter, sans-serif',
        },
      },
      features: {
        aiEnabled: true,
        autoResponse: false,
        sentimentAnalysis: true,
        voiceSupport: false,
        chatSupport: true,
        emailSupport: true,
        smsSupport: false,
        knowledgeBase: true,
        analytics: true,
        reporting: true,
        webhooks: false,
        apiAccess: true,
        whiteLabel: false,
      },
      workingHours: {
        enabled: false,
        timezone: 'UTC',
        schedule: {
          monday: { enabled: true, start: '09:00', end: '17:00' },
          tuesday: { enabled: true, start: '09:00', end: '17:00' },
          wednesday: { enabled: true, start: '09:00', end: '17:00' },
          thursday: { enabled: true, start: '09:00', end: '17:00' },
          friday: { enabled: true, start: '09:00', end: '17:00' },
          saturday: { enabled: false, start: '09:00', end: '17:00' },
          sunday: { enabled: false, start: '09:00', end: '17:00' },
        },
        holidays: [],
      },
      notifications: {
        email: {
          enabled: true,
          fromName: 'Customer Support',
          fromEmail: 'support@example.com',
          templates: {},
        },
        sms: {
          enabled: false,
          provider: 'twilio',
        },
        push: {
          enabled: false,
        },
        webhook: {
          enabled: false,
          endpoints: [],
        },
      },
      security: {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: false,
          maxAge: 90,
        },
        sessionTimeout: 480, // 8 hours
        mfaRequired: false,
        ipWhitelist: [],
        allowedDomains: [],
        dataRetention: {
          messages: 365,
          conversations: 365,
          analytics: 730,
          logs: 90,
        },
      },
      integrations: {
        crm: { enabled: false },
        helpdesk: { enabled: false },
        analytics: { enabled: false },
        payment: { enabled: false },
      },
      customFields: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private mergeConfigurations(
    base: Partial<TenantConfiguration>,
    updates: Partial<TenantConfiguration>
  ): TenantConfiguration {
    // Deep merge configurations
    return this.deepMerge(base, updates) as TenantConfiguration;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  private getNestedValue(obj: any, path: string, defaultValue?: any): any {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }
    
    return current;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private async syncConfigurationToRedis(
    organizationId: string,
    configuration: TenantConfiguration
  ): Promise<void> {
    try {
      const key = `tenant:config:${organizationId}`;
      await this.redis.set(key, JSON.stringify(configuration), { ttl: 3600 }); // 1 hour TTL
    } catch (error) {
      this.logger.error('Error syncing configuration to Redis', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private setupConfigurationSync(): void {
    // Setup periodic sync to Redis
    setInterval(async () => {
      for (const [organizationId, config] of this.configurations) {
        await this.syncConfigurationToRedis(organizationId, config);
      }
    }, 300000); // Sync every 5 minutes
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      return {
        status: 'healthy',
        details: {
          configurationsLoaded: this.configurations.size,
          templatesLoaded: this.templates.size,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Close service
   */
  public async close(): Promise<void> {
    this.configurations.clear();
    this.templates.clear();
    this.removeAllListeners();
    this.logger.info('Tenant configuration service closed');
  }
}

export default TenantConfigurationService;
