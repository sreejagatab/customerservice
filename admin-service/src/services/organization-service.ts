/**
 * Organization Management Service
 * Handles organization creation, configuration, and multi-tenant management
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  industry?: string;
  size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  plan: 'basic' | 'professional' | 'enterprise' | 'custom';
  status: 'active' | 'suspended' | 'inactive';
  settings: OrganizationSettings;
  limits: OrganizationLimits;
  billing: BillingInfo;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface OrganizationSettings {
  timezone: string;
  language: string;
  dateFormat: string;
  currency: string;
  businessHours: {
    enabled: boolean;
    timezone: string;
    schedule: {
      [day: string]: {
        enabled: boolean;
        start: string;
        end: string;
      };
    };
  };
  branding: {
    primaryColor: string;
    secondaryColor: string;
    logo?: string;
    favicon?: string;
    customCss?: string;
  };
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    webhookEnabled: boolean;
    defaultSender: string;
  };
  security: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
    };
    sessionTimeout: number;
    twoFactorRequired: boolean;
    ipWhitelist: string[];
  };
  integrations: {
    allowedProviders: string[];
    maxIntegrations: number;
    webhookUrl?: string;
    apiKeys: Record<string, string>;
  };
}

export interface OrganizationLimits {
  maxUsers: number;
  maxIntegrations: number;
  maxMessagesPerMonth: number;
  maxNotificationsPerMonth: number;
  maxStorageGB: number;
  maxApiCallsPerHour: number;
  customRoles: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
}

export interface BillingInfo {
  plan: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  subscriptionId?: string;
  customerId?: string;
  paymentMethod?: {
    type: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
  };
}

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  description?: string;
  industry?: string;
  size: Organization['size'];
  plan?: Organization['plan'];
  settings?: Partial<OrganizationSettings>;
  adminUser: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  };
}

export interface UpdateOrganizationRequest {
  name?: string;
  description?: string;
  logo?: string;
  website?: string;
  industry?: string;
  size?: Organization['size'];
  settings?: Partial<OrganizationSettings>;
  metadata?: Record<string, any>;
}

export class OrganizationService {
  private static instance: OrganizationService;

  private constructor() {}

  public static getInstance(): OrganizationService {
    if (!OrganizationService.instance) {
      OrganizationService.instance = new OrganizationService();
    }
    return OrganizationService.instance;
  }

  /**
   * Create a new organization
   */
  public async createOrganization(request: CreateOrganizationRequest, createdBy: string): Promise<Organization | null> {
    try {
      // Generate slug if not provided
      const slug = request.slug || this.generateSlug(request.name);
      
      // Check slug uniqueness
      const existingOrg = await this.getOrganizationBySlug(slug);
      if (existingOrg) {
        throw new Error('Organization slug already exists');
      }

      const organization: Organization = {
        id: this.generateOrganizationId(),
        name: request.name,
        slug,
        description: request.description,
        industry: request.industry,
        size: request.size,
        plan: request.plan || config.multiTenancy.defaultPlan as any,
        status: 'active',
        settings: this.getDefaultSettings(request.settings),
        limits: this.getPlanLimits(request.plan || config.multiTenancy.defaultPlan as any),
        billing: this.getDefaultBilling(request.plan || config.multiTenancy.defaultPlan as any),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      };

      // TODO: Save to database
      
      // Cache organization
      await this.cacheOrganization(organization);

      // Create admin user for the organization
      const { userService } = await import('@/services/user-service');
      const adminUser = await userService.createUser({
        ...request.adminUser,
        organizationId: organization.id,
        roles: ['org-admin'],
      }, createdBy);

      if (!adminUser) {
        throw new Error('Failed to create admin user');
      }

      logger.info('Organization created', {
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        createdBy,
        adminUserId: adminUser.id,
      });

      return organization;
    } catch (error) {
      logger.error('Error creating organization', {
        name: request.name,
        slug: request.slug,
        createdBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update organization
   */
  public async updateOrganization(
    organizationId: string,
    updates: UpdateOrganizationRequest,
    updatedBy: string
  ): Promise<Organization | null> {
    try {
      const organization = await this.getOrganizationById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      const updatedOrganization: Organization = {
        ...organization,
        ...updates,
        settings: updates.settings ? { ...organization.settings, ...updates.settings } : organization.settings,
        metadata: updates.metadata ? { ...organization.metadata, ...updates.metadata } : organization.metadata,
        updatedAt: new Date(),
      };

      // TODO: Save to database
      
      // Update cache
      await this.cacheOrganization(updatedOrganization);

      logger.info('Organization updated', {
        organizationId,
        updates: Object.keys(updates),
        updatedBy,
      });

      return updatedOrganization;
    } catch (error) {
      logger.error('Error updating organization', {
        organizationId,
        updates,
        updatedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get organization by ID
   */
  public async getOrganizationById(organizationId: string): Promise<Organization | null> {
    try {
      // Check cache first
      const cacheKey = `organization:${organizationId}`;
      const cached = await redis.get<Organization>(cacheKey);
      if (cached) {
        return cached;
      }

      // TODO: Load from database
      
      return null;
    } catch (error) {
      logger.error('Error getting organization by ID', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get organization by slug
   */
  public async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    try {
      // TODO: Load from database by slug
      
      return null;
    } catch (error) {
      logger.error('Error getting organization by slug', {
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * List organizations with pagination
   */
  public async listOrganizations(
    filters: {
      status?: Organization['status'];
      plan?: Organization['plan'];
      size?: Organization['size'];
      search?: string;
    } = {},
    pagination: {
      page: number;
      limit: number;
    } = { page: 1, limit: 20 }
  ): Promise<{
    organizations: Organization[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // TODO: Implement database query with filters and pagination
      
      return {
        organizations: [],
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 0,
      };
    } catch (error) {
      logger.error('Error listing organizations', {
        filters,
        pagination,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        organizations: [],
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 0,
      };
    }
  }

  /**
   * Suspend organization
   */
  public async suspendOrganization(organizationId: string, reason: string, suspendedBy: string): Promise<boolean> {
    try {
      const organization = await this.getOrganizationById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      const updatedOrganization = await this.updateOrganization(
        organizationId,
        {
          metadata: {
            ...organization.metadata,
            suspendedAt: new Date(),
            suspendedBy,
            suspensionReason: reason,
          },
        },
        suspendedBy
      );

      if (updatedOrganization) {
        updatedOrganization.status = 'suspended';
        await this.cacheOrganization(updatedOrganization);
      }

      logger.warn('Organization suspended', {
        organizationId,
        reason,
        suspendedBy,
      });

      return true;
    } catch (error) {
      logger.error('Error suspending organization', {
        organizationId,
        reason,
        suspendedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Reactivate organization
   */
  public async reactivateOrganization(organizationId: string, reactivatedBy: string): Promise<boolean> {
    try {
      const organization = await this.getOrganizationById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      const updatedOrganization = await this.updateOrganization(
        organizationId,
        {
          metadata: {
            ...organization.metadata,
            reactivatedAt: new Date(),
            reactivatedBy,
            suspendedAt: undefined,
            suspendedBy: undefined,
            suspensionReason: undefined,
          },
        },
        reactivatedBy
      );

      if (updatedOrganization) {
        updatedOrganization.status = 'active';
        await this.cacheOrganization(updatedOrganization);
      }

      logger.info('Organization reactivated', {
        organizationId,
        reactivatedBy,
      });

      return true;
    } catch (error) {
      logger.error('Error reactivating organization', {
        organizationId,
        reactivatedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get organization usage statistics
   */
  public async getOrganizationUsage(organizationId: string): Promise<{
    users: { current: number; limit: number };
    integrations: { current: number; limit: number };
    messages: { currentMonth: number; limit: number };
    notifications: { currentMonth: number; limit: number };
    storage: { currentGB: number; limitGB: number };
    apiCalls: { currentHour: number; limit: number };
  }> {
    try {
      const organization = await this.getOrganizationById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // TODO: Get actual usage from various services
      
      return {
        users: { current: 0, limit: organization.limits.maxUsers },
        integrations: { current: 0, limit: organization.limits.maxIntegrations },
        messages: { currentMonth: 0, limit: organization.limits.maxMessagesPerMonth },
        notifications: { currentMonth: 0, limit: organization.limits.maxNotificationsPerMonth },
        storage: { currentGB: 0, limitGB: organization.limits.maxStorageGB },
        apiCalls: { currentHour: 0, limit: organization.limits.maxApiCallsPerHour },
      };
    } catch (error) {
      logger.error('Error getting organization usage', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if organization has reached limits
   */
  public async checkLimits(organizationId: string, resource: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const usage = await this.getOrganizationUsage(organizationId);
      
      switch (resource) {
        case 'users':
          return {
            allowed: usage.users.current < usage.users.limit,
            reason: usage.users.current >= usage.users.limit ? 'User limit reached' : undefined,
          };
        case 'integrations':
          return {
            allowed: usage.integrations.current < usage.integrations.limit,
            reason: usage.integrations.current >= usage.integrations.limit ? 'Integration limit reached' : undefined,
          };
        case 'messages':
          return {
            allowed: usage.messages.currentMonth < usage.messages.limit,
            reason: usage.messages.currentMonth >= usage.messages.limit ? 'Monthly message limit reached' : undefined,
          };
        case 'notifications':
          return {
            allowed: usage.notifications.currentMonth < usage.notifications.limit,
            reason: usage.notifications.currentMonth >= usage.notifications.limit ? 'Monthly notification limit reached' : undefined,
          };
        case 'storage':
          return {
            allowed: usage.storage.currentGB < usage.storage.limitGB,
            reason: usage.storage.currentGB >= usage.storage.limitGB ? 'Storage limit reached' : undefined,
          };
        case 'api_calls':
          return {
            allowed: usage.apiCalls.currentHour < usage.apiCalls.limit,
            reason: usage.apiCalls.currentHour >= usage.apiCalls.limit ? 'Hourly API call limit reached' : undefined,
          };
        default:
          return { allowed: true };
      }
    } catch (error) {
      logger.error('Error checking organization limits', {
        organizationId,
        resource,
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: false, reason: 'Error checking limits' };
    }
  }

  /**
   * Generate organization slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  /**
   * Generate unique organization ID
   */
  private generateOrganizationId(): string {
    return `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default organization settings
   */
  private getDefaultSettings(customSettings?: Partial<OrganizationSettings>): OrganizationSettings {
    const defaultSettings: OrganizationSettings = {
      timezone: 'UTC',
      language: 'en',
      dateFormat: 'YYYY-MM-DD',
      currency: 'USD',
      businessHours: {
        enabled: true,
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
      },
      branding: {
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        webhookEnabled: false,
        defaultSender: 'Customer Service',
      },
      security: {
        passwordPolicy: {
          minLength: config.password.minLength,
          requireUppercase: config.password.requireUppercase,
          requireLowercase: config.password.requireLowercase,
          requireNumbers: config.password.requireNumbers,
          requireSymbols: config.password.requireSymbols,
        },
        sessionTimeout: config.session.timeout,
        twoFactorRequired: false,
        ipWhitelist: [],
      },
      integrations: {
        allowedProviders: ['email', 'slack', 'teams'],
        maxIntegrations: 5,
        apiKeys: {},
      },
    };

    return customSettings ? { ...defaultSettings, ...customSettings } : defaultSettings;
  }

  /**
   * Get plan limits
   */
  private getPlanLimits(plan: string): OrganizationLimits {
    const planLimits: Record<string, OrganizationLimits> = {
      basic: {
        maxUsers: 5,
        maxIntegrations: 3,
        maxMessagesPerMonth: 1000,
        maxNotificationsPerMonth: 500,
        maxStorageGB: 1,
        maxApiCallsPerHour: 100,
        customRoles: false,
        advancedAnalytics: false,
        prioritySupport: false,
      },
      professional: {
        maxUsers: 25,
        maxIntegrations: 10,
        maxMessagesPerMonth: 10000,
        maxNotificationsPerMonth: 5000,
        maxStorageGB: 10,
        maxApiCallsPerHour: 1000,
        customRoles: true,
        advancedAnalytics: true,
        prioritySupport: false,
      },
      enterprise: {
        maxUsers: 100,
        maxIntegrations: 50,
        maxMessagesPerMonth: 100000,
        maxNotificationsPerMonth: 50000,
        maxStorageGB: 100,
        maxApiCallsPerHour: 10000,
        customRoles: true,
        advancedAnalytics: true,
        prioritySupport: true,
      },
      custom: {
        maxUsers: 1000,
        maxIntegrations: 100,
        maxMessagesPerMonth: 1000000,
        maxNotificationsPerMonth: 500000,
        maxStorageGB: 1000,
        maxApiCallsPerHour: 100000,
        customRoles: true,
        advancedAnalytics: true,
        prioritySupport: true,
      },
    };

    return planLimits[plan] || planLimits.basic;
  }

  /**
   * Get default billing info
   */
  private getDefaultBilling(plan: string): BillingInfo {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days trial

    return {
      plan,
      status: 'trialing',
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
      trialEnd,
    };
  }

  /**
   * Cache organization
   */
  private async cacheOrganization(organization: Organization): Promise<void> {
    const cacheKey = `organization:${organization.id}`;
    await redis.set(cacheKey, organization, { ttl: 3600 }); // 1 hour TTL
  }
}

// Export singleton instance
export const organizationService = OrganizationService.getInstance();
