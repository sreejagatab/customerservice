/**
 * API Marketplace Service
 * Handles third-party application marketplace, installations, and developer ecosystem
 */

import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface MarketplaceApplication {
  id: string;
  developerId: string;
  name: string;
  slug: string;
  description?: string;
  longDescription?: string;
  category: string;
  subcategory?: string;
  appType: 'integration' | 'widget' | 'automation' | 'analytics';
  status: 'draft' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'published' | 'suspended';
  visibility: 'public' | 'private' | 'partner_only';
  pricingModel: 'free' | 'one_time' | 'subscription' | 'usage_based' | 'revenue_share';
  pricingDetails: any;
  revenueSharePercentage: number;
  logoUrl?: string;
  screenshots: string[];
  demoUrl?: string;
  documentationUrl?: string;
  supportUrl?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  webhookUrl?: string;
  oauthConfig: any;
  apiConfig: any;
  permissionsRequired: string[];
  supportedFeatures: string[];
  installationCount: number;
  ratingAverage: number;
  ratingCount: number;
  tags: string[];
  version: string;
  changelog: any[];
  isFeatured: boolean;
  featuredUntil?: Date;
  approvedAt?: Date;
  publishedAt?: Date;
  lastUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationInstallation {
  id: string;
  applicationId: string;
  organizationId: string;
  installedBy: string;
  installationStatus: 'installing' | 'active' | 'inactive' | 'error' | 'uninstalled';
  configuration: any;
  permissionsGranted: string[];
  oauthTokens: any;
  webhookSecret?: string;
  lastSyncAt?: Date;
  syncStatus: 'pending' | 'syncing' | 'success' | 'error';
  syncErrorMessage?: string;
  usageMetrics: any;
  billingInfo: any;
  installedAt: Date;
  activatedAt?: Date;
  deactivatedAt?: Date;
  uninstalledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperProfile {
  id: string;
  userId: string;
  companyName?: string;
  websiteUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  bio?: string;
  specializations: string[];
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationDocuments: any[];
  revenueShareAgreement: boolean;
  payoutDetails: any;
  totalRevenue: number;
  totalInstallations: number;
  averageRating: number;
  isPartner: boolean;
  partnerTier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEndpoint {
  id: string;
  organizationId: string;
  applicationId?: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  retryPolicy: any;
  timeoutSeconds: number;
  headers: any;
  authentication: any;
  lastTriggeredAt?: Date;
  successCount: number;
  failureCount: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastErrorMessage?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class APIMarketplaceService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    super();
    this.logger = new Logger('APIMarketplaceService');
    this.db = db;
  }

  /**
   * Submit application to marketplace
   */
  async submitApplication(
    developerId: string,
    applicationData: Partial<MarketplaceApplication>
  ): Promise<MarketplaceApplication> {
    try {
      const slug = this.generateSlug(applicationData.name!);
      
      const result = await this.db.query(`
        INSERT INTO marketplace_applications (
          developer_id, name, slug, description, long_description, category,
          subcategory, app_type, pricing_model, pricing_details,
          revenue_share_percentage, logo_url, screenshots, demo_url,
          documentation_url, support_url, privacy_policy_url,
          terms_of_service_url, webhook_url, oauth_config, api_config,
          permissions_required, supported_features, tags, version, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        RETURNING *
      `, [
        developerId,
        applicationData.name,
        slug,
        applicationData.description,
        applicationData.longDescription,
        applicationData.category,
        applicationData.subcategory,
        applicationData.appType || 'integration',
        applicationData.pricingModel || 'free',
        JSON.stringify(applicationData.pricingDetails || {}),
        applicationData.revenueSharePercentage || 0,
        applicationData.logoUrl,
        JSON.stringify(applicationData.screenshots || []),
        applicationData.demoUrl,
        applicationData.documentationUrl,
        applicationData.supportUrl,
        applicationData.privacyPolicyUrl,
        applicationData.termsOfServiceUrl,
        applicationData.webhookUrl,
        JSON.stringify(applicationData.oauthConfig || {}),
        JSON.stringify(applicationData.apiConfig || {}),
        JSON.stringify(applicationData.permissionsRequired || []),
        JSON.stringify(applicationData.supportedFeatures || []),
        applicationData.tags || [],
        applicationData.version || '1.0.0',
        'submitted'
      ]);

      const application = this.mapApplicationFromDb(result.rows[0]);
      
      this.emit('application.submitted', application);
      this.logger.info(`Application submitted: ${application.id}`, {
        developerId,
        applicationName: application.name
      });
      
      return application;
    } catch (error) {
      this.logger.error('Error submitting application:', error);
      throw new Error('Failed to submit application');
    }
  }

  /**
   * Install application for organization
   */
  async installApplication(
    applicationId: string,
    organizationId: string,
    installedBy: string,
    configuration: any = {},
    permissionsGranted: string[] = []
  ): Promise<ApplicationInstallation> {
    try {
      // Check if application exists and is published
      const application = await this.getApplication(applicationId);
      if (!application || application.status !== 'published') {
        throw new Error('Application not found or not available');
      }

      // Check if already installed
      const existing = await this.getInstallation(applicationId, organizationId);
      if (existing && existing.installationStatus !== 'uninstalled') {
        throw new Error('Application is already installed');
      }

      // Generate webhook secret
      const webhookSecret = crypto.randomBytes(32).toString('hex');

      const result = await this.db.query(`
        INSERT INTO application_installations (
          application_id, organization_id, installed_by, configuration,
          permissions_granted, webhook_secret, installation_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        applicationId,
        organizationId,
        installedBy,
        JSON.stringify(configuration),
        JSON.stringify(permissionsGranted),
        webhookSecret,
        'installing'
      ]);

      const installation = this.mapInstallationFromDb(result.rows[0]);

      // Update installation count
      await this.db.query(
        'UPDATE marketplace_applications SET installation_count = installation_count + 1 WHERE id = $1',
        [applicationId]
      );

      // Process installation asynchronously
      this.processInstallation(installation.id).catch(error => {
        this.logger.error('Error processing installation:', error);
      });

      this.emit('application.installed', installation);
      this.logger.info(`Application installed: ${installation.id}`, {
        applicationId,
        organizationId
      });

      return installation;
    } catch (error) {
      this.logger.error('Error installing application:', error);
      throw new Error('Failed to install application');
    }
  }

  /**
   * Create webhook endpoint
   */
  async createWebhookEndpoint(
    organizationId: string,
    webhookData: Partial<WebhookEndpoint>,
    createdBy?: string
  ): Promise<WebhookEndpoint> {
    try {
      const secret = crypto.randomBytes(32).toString('hex');
      
      const result = await this.db.query(`
        INSERT INTO webhook_endpoints (
          organization_id, application_id, name, url, secret, events,
          retry_policy, timeout_seconds, headers, authentication, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        organizationId,
        webhookData.applicationId,
        webhookData.name,
        webhookData.url,
        secret,
        webhookData.events || [],
        JSON.stringify(webhookData.retryPolicy || { max_retries: 3, backoff_strategy: 'exponential' }),
        webhookData.timeoutSeconds || 30,
        JSON.stringify(webhookData.headers || {}),
        JSON.stringify(webhookData.authentication || {}),
        createdBy
      ]);

      const webhook = this.mapWebhookFromDb(result.rows[0]);
      
      this.emit('webhook.created', webhook);
      this.logger.info(`Webhook endpoint created: ${webhook.id}`, {
        organizationId,
        url: webhook.url
      });

      return webhook;
    } catch (error) {
      this.logger.error('Error creating webhook endpoint:', error);
      throw new Error('Failed to create webhook endpoint');
    }
  }

  /**
   * Trigger webhook delivery
   */
  async triggerWebhook(
    organizationId: string,
    eventType: string,
    eventData: any,
    applicationId?: string
  ): Promise<void> {
    try {
      // Get matching webhook endpoints
      let query = `
        SELECT * FROM webhook_endpoints 
        WHERE organization_id = $1 AND is_active = true AND $2 = ANY(events)
      `;
      const params = [organizationId, eventType];

      if (applicationId) {
        query += ' AND application_id = $3';
        params.push(applicationId);
      }

      const result = await this.db.query(query, params);

      for (const webhookRow of result.rows) {
        const webhook = this.mapWebhookFromDb(webhookRow);
        
        // Create delivery record
        await this.db.query(
          'SELECT process_webhook_delivery($1, $2, $3)',
          [webhook.id, eventType, JSON.stringify(eventData)]
        );
      }

      this.emit('webhook.triggered', {
        organizationId,
        eventType,
        webhookCount: result.rows.length
      });
    } catch (error) {
      this.logger.error('Error triggering webhook:', error);
      // Don't throw error to avoid breaking main operations
    }
  }

  /**
   * Get marketplace applications with filtering
   */
  async getMarketplaceApplications(
    filters: {
      category?: string;
      pricingModel?: string;
      featured?: boolean;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ applications: MarketplaceApplication[]; total: number; page: number; limit: number }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      let whereClause = "WHERE status = 'published'";
      const params = [];
      let paramIndex = 1;

      if (filters.category) {
        whereClause += ` AND category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
      }

      if (filters.pricingModel) {
        whereClause += ` AND pricing_model = $${paramIndex}`;
        params.push(filters.pricingModel);
        paramIndex++;
      }

      if (filters.featured) {
        whereClause += ` AND is_featured = true AND (featured_until IS NULL OR featured_until > NOW())`;
      }

      if (filters.search) {
        whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR $${paramIndex} = ANY(tags))`;
        params.push(`%${filters.search}%`);
        paramIndex++;
      }

      // Get total count
      const countResult = await this.db.query(
        `SELECT COUNT(*) as total FROM marketplace_applications ${whereClause}`,
        params
      );

      // Get applications
      const result = await this.db.query(`
        SELECT * FROM marketplace_applications ${whereClause}
        ORDER BY 
          CASE WHEN is_featured THEN 0 ELSE 1 END,
          rating_average DESC,
          installation_count DESC,
          created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);

      const applications = result.rows.map(row => this.mapApplicationFromDb(row));
      const total = parseInt(countResult.rows[0].total);

      return { applications, total, page, limit };
    } catch (error) {
      this.logger.error('Error getting marketplace applications:', error);
      throw new Error('Failed to get marketplace applications');
    }
  }

  /**
   * Get developer analytics
   */
  async getDeveloperAnalytics(developerId: string): Promise<any> {
    try {
      // Get application stats
      const appsResult = await this.db.query(`
        SELECT 
          COUNT(*) as total_apps,
          COUNT(CASE WHEN status = 'published' THEN 1 END) as published_apps,
          SUM(installation_count) as total_installations,
          AVG(rating_average) as avg_rating
        FROM marketplace_applications
        WHERE developer_id = $1
      `, [developerId]);

      // Get revenue stats
      const revenueResult = await this.db.query(`
        SELECT 
          SUM(net_amount) as total_revenue,
          COUNT(*) as total_transactions,
          SUM(CASE WHEN payment_status = 'paid' THEN net_amount ELSE 0 END) as paid_revenue
        FROM marketplace_revenue
        WHERE developer_id = $1
      `, [developerId]);

      // Get recent installations
      const installationsResult = await this.db.query(`
        SELECT 
          DATE_TRUNC('day', ai.installed_at) as date,
          COUNT(*) as installations
        FROM application_installations ai
        JOIN marketplace_applications ma ON ai.application_id = ma.id
        WHERE ma.developer_id = $1
          AND ai.installed_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', ai.installed_at)
        ORDER BY date
      `, [developerId]);

      return {
        applications: appsResult.rows[0],
        revenue: revenueResult.rows[0],
        installations: installationsResult.rows
      };
    } catch (error) {
      this.logger.error('Error getting developer analytics:', error);
      throw new Error('Failed to get developer analytics');
    }
  }

  /**
   * Private helper methods
   */
  private async getApplication(applicationId: string): Promise<MarketplaceApplication | null> {
    const result = await this.db.query(
      'SELECT * FROM marketplace_applications WHERE id = $1',
      [applicationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapApplicationFromDb(result.rows[0]);
  }

  private async getInstallation(
    applicationId: string,
    organizationId: string
  ): Promise<ApplicationInstallation | null> {
    const result = await this.db.query(
      'SELECT * FROM application_installations WHERE application_id = $1 AND organization_id = $2',
      [applicationId, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapInstallationFromDb(result.rows[0]);
  }

  private async processInstallation(installationId: string): Promise<void> {
    try {
      // Simulate installation process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update installation status
      await this.db.query(
        'UPDATE application_installations SET installation_status = $1, activated_at = NOW() WHERE id = $2',
        ['active', installationId]
      );

      this.emit('installation.completed', { installationId });
    } catch (error) {
      await this.db.query(
        'UPDATE application_installations SET installation_status = $1 WHERE id = $2',
        ['error', installationId]
      );
      
      this.emit('installation.failed', { installationId, error: error.message });
      throw error;
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private mapApplicationFromDb(row: any): MarketplaceApplication {
    return {
      id: row.id,
      developerId: row.developer_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      longDescription: row.long_description,
      category: row.category,
      subcategory: row.subcategory,
      appType: row.app_type,
      status: row.status,
      visibility: row.visibility,
      pricingModel: row.pricing_model,
      pricingDetails: row.pricing_details,
      revenueSharePercentage: parseFloat(row.revenue_share_percentage),
      logoUrl: row.logo_url,
      screenshots: row.screenshots,
      demoUrl: row.demo_url,
      documentationUrl: row.documentation_url,
      supportUrl: row.support_url,
      privacyPolicyUrl: row.privacy_policy_url,
      termsOfServiceUrl: row.terms_of_service_url,
      webhookUrl: row.webhook_url,
      oauthConfig: row.oauth_config,
      apiConfig: row.api_config,
      permissionsRequired: row.permissions_required,
      supportedFeatures: row.supported_features,
      installationCount: row.installation_count,
      ratingAverage: parseFloat(row.rating_average),
      ratingCount: row.rating_count,
      tags: row.tags,
      version: row.version,
      changelog: row.changelog,
      isFeatured: row.is_featured,
      featuredUntil: row.featured_until,
      approvedAt: row.approved_at,
      publishedAt: row.published_at,
      lastUpdatedAt: row.last_updated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapInstallationFromDb(row: any): ApplicationInstallation {
    return {
      id: row.id,
      applicationId: row.application_id,
      organizationId: row.organization_id,
      installedBy: row.installed_by,
      installationStatus: row.installation_status,
      configuration: row.configuration,
      permissionsGranted: row.permissions_granted,
      oauthTokens: row.oauth_tokens,
      webhookSecret: row.webhook_secret,
      lastSyncAt: row.last_sync_at,
      syncStatus: row.sync_status,
      syncErrorMessage: row.sync_error_message,
      usageMetrics: row.usage_metrics,
      billingInfo: row.billing_info,
      installedAt: row.installed_at,
      activatedAt: row.activated_at,
      deactivatedAt: row.deactivated_at,
      uninstalledAt: row.uninstalled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapWebhookFromDb(row: any): WebhookEndpoint {
    return {
      id: row.id,
      organizationId: row.organization_id,
      applicationId: row.application_id,
      name: row.name,
      url: row.url,
      secret: row.secret,
      events: row.events,
      isActive: row.is_active,
      retryPolicy: row.retry_policy,
      timeoutSeconds: row.timeout_seconds,
      headers: row.headers,
      authentication: row.authentication,
      lastTriggeredAt: row.last_triggered_at,
      successCount: row.success_count,
      failureCount: row.failure_count,
      lastSuccessAt: row.last_success_at,
      lastFailureAt: row.last_failure_at,
      lastErrorMessage: row.last_error_message,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export default APIMarketplaceService;
