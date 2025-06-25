/**
 * Marketplace Service
 * Handles partner marketplace, app store, and integration discovery
 */

import { EventEmitter } from 'events';
import { Logger } from '@universal-ai-cs/shared';
import { DatabaseService } from '@universal-ai-cs/shared';
import { RedisService } from '@universal-ai-cs/shared';

export interface MarketplaceApp {
  id: string;
  partnerId: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: 'crm' | 'helpdesk' | 'analytics' | 'communication' | 'productivity' | 'ecommerce' | 'marketing' | 'other';
  subcategory?: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'published' | 'suspended' | 'deprecated';
  visibility: 'public' | 'private' | 'partner_only';
  pricing: {
    model: 'free' | 'freemium' | 'paid' | 'subscription' | 'usage_based';
    price?: number;
    currency?: string;
    billingCycle?: 'monthly' | 'yearly' | 'one_time';
    trialDays?: number;
    features: {
      free?: string[];
      paid?: string[];
      enterprise?: string[];
    };
  };
  media: {
    logo: string;
    icon: string;
    screenshots: string[];
    videos?: string[];
    banner?: string;
  };
  metadata: {
    tags: string[];
    supportedLanguages: string[];
    supportedRegions: string[];
    integrationTypes: string[];
    apiVersion: string;
    webhookSupport: boolean;
    ssoSupport: boolean;
    mobileSupport: boolean;
  };
  technical: {
    installationType: 'oauth' | 'api_key' | 'webhook' | 'iframe' | 'redirect';
    configurationUrl?: string;
    webhookUrl?: string;
    redirectUrl?: string;
    scopes?: string[];
    permissions: string[];
    requirements: {
      minimumPlan?: string;
      features?: string[];
      customFields?: boolean;
    };
  };
  support: {
    documentation: string;
    supportUrl?: string;
    contactEmail: string;
    phone?: string;
    availableHours?: string;
    languages: string[];
  };
  analytics: {
    installs: number;
    activeInstalls: number;
    uninstalls: number;
    rating: number;
    reviewCount: number;
    views: number;
    conversionRate: number;
  };
  reviews: Array<{
    id: string;
    userId: string;
    userName: string;
    rating: number;
    title: string;
    comment: string;
    helpful: number;
    verified: boolean;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface AppInstallation {
  id: string;
  appId: string;
  organizationId: string;
  userId: string;
  status: 'installing' | 'active' | 'suspended' | 'uninstalling' | 'uninstalled';
  configuration: Record<string, any>;
  permissions: string[];
  subscription?: {
    plan: string;
    status: 'active' | 'cancelled' | 'past_due';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialEnd?: Date;
  };
  usage: {
    apiCalls: number;
    lastUsed: Date;
    features: Record<string, number>;
  };
  installedAt: Date;
  updatedAt: Date;
  uninstalledAt?: Date;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  parentId?: string;
  appCount: number;
  featured: boolean;
  order: number;
}

export interface MarketplaceSearch {
  query?: string;
  category?: string;
  subcategory?: string;
  pricing?: 'free' | 'paid' | 'freemium';
  rating?: number;
  tags?: string[];
  sortBy?: 'relevance' | 'popularity' | 'rating' | 'newest' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export class MarketplaceService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;
  private redis: RedisService;

  constructor() {
    super();
    this.logger = new Logger('MarketplaceService');
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
  }

  /**
   * Search marketplace apps
   */
  public async searchApps(searchParams: MarketplaceSearch): Promise<{
    apps: MarketplaceApp[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    facets: {
      categories: Array<{ name: string; count: number }>;
      pricing: Array<{ type: string; count: number }>;
      ratings: Array<{ rating: number; count: number }>;
    };
  }> {
    try {
      const {
        query,
        category,
        subcategory,
        pricing,
        rating,
        tags,
        sortBy = 'relevance',
        sortOrder = 'desc',
        page = 1,
        limit = 20,
      } = searchParams;

      // Build search query
      let baseQuery = `
        SELECT a.*, p.name as partner_name
        FROM marketplace_apps a
        JOIN partners p ON a.partner_id = p.id
        WHERE a.status = 'published' AND a.visibility IN ('public', 'partner_only')
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (query) {
        baseQuery += ` AND (a.name ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex} OR a.tags @> ARRAY[$${paramIndex}])`;
        params.push(`%${query}%`);
        paramIndex++;
      }

      if (category) {
        baseQuery += ` AND a.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (subcategory) {
        baseQuery += ` AND a.subcategory = $${paramIndex}`;
        params.push(subcategory);
        paramIndex++;
      }

      if (pricing) {
        baseQuery += ` AND a.pricing->>'model' = $${paramIndex}`;
        params.push(pricing);
        paramIndex++;
      }

      if (rating) {
        baseQuery += ` AND a.rating >= $${paramIndex}`;
        params.push(rating);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        baseQuery += ` AND a.tags && $${paramIndex}`;
        params.push(tags);
        paramIndex++;
      }

      // Add sorting
      const sortColumn = this.getSortColumn(sortBy);
      baseQuery += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

      // Add pagination
      const offset = (page - 1) * limit;
      baseQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      // Execute search
      const result = await this.db.query(baseQuery, params);

      // Get total count
      const countQuery = baseQuery.replace(/SELECT a\.\*, p\.name as partner_name/, 'SELECT COUNT(*)')
        .replace(/ORDER BY .+ (ASC|DESC)/, '')
        .replace(/LIMIT \$\d+ OFFSET \$\d+/, '');
      const countResult = await this.db.query(countQuery, params.slice(0, -2));
      const total = parseInt(countResult.rows[0].count);

      // Get facets
      const facets = await this.getSearchFacets(searchParams);

      const apps = result.rows.map(row => this.mapRowToApp(row));

      return {
        apps,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        facets,
      };
    } catch (error) {
      this.logger.error('Error searching marketplace apps', {
        searchParams,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get app details
   */
  public async getApp(appId: string): Promise<MarketplaceApp | null> {
    try {
      const result = await this.db.query(`
        SELECT a.*, p.name as partner_name
        FROM marketplace_apps a
        JOIN partners p ON a.partner_id = p.id
        WHERE a.id = $1
      `, [appId]);

      if (result.rows.length === 0) {
        return null;
      }

      // Increment view count
      await this.incrementViewCount(appId);

      return this.mapRowToApp(result.rows[0]);
    } catch (error) {
      this.logger.error('Error getting app', {
        appId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Install app for organization
   */
  public async installApp(
    appId: string,
    organizationId: string,
    userId: string,
    configuration: Record<string, any> = {}
  ): Promise<AppInstallation> {
    try {
      // Check if app exists and is published
      const app = await this.getApp(appId);
      if (!app || app.status !== 'published') {
        throw new Error(`App not available for installation: ${appId}`);
      }

      // Check if already installed
      const existingInstallation = await this.getInstallation(appId, organizationId);
      if (existingInstallation && existingInstallation.status === 'active') {
        throw new Error('App is already installed');
      }

      // Create installation record
      const installation: AppInstallation = {
        id: `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        appId,
        organizationId,
        userId,
        status: 'installing',
        configuration,
        permissions: app.technical.permissions,
        usage: {
          apiCalls: 0,
          lastUsed: new Date(),
          features: {},
        },
        installedAt: new Date(),
        updatedAt: new Date(),
      };

      // Save installation
      await this.db.query(`
        INSERT INTO app_installations (
          id, app_id, organization_id, user_id, status, configuration,
          permissions, usage, installed_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        installation.id,
        installation.appId,
        installation.organizationId,
        installation.userId,
        installation.status,
        JSON.stringify(installation.configuration),
        JSON.stringify(installation.permissions),
        JSON.stringify(installation.usage),
        installation.installedAt,
        installation.updatedAt,
      ]);

      // Perform installation steps
      await this.performInstallation(installation, app);

      // Update installation status
      installation.status = 'active';
      await this.updateInstallationStatus(installation.id, 'active');

      // Update app analytics
      await this.incrementInstallCount(appId);

      this.emit('app.installed', {
        installation,
        app,
        organizationId,
        userId,
      });

      this.logger.info('App installed successfully', {
        appId,
        organizationId,
        installationId: installation.id,
      });

      return installation;
    } catch (error) {
      this.logger.error('Error installing app', {
        appId,
        organizationId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Uninstall app
   */
  public async uninstallApp(
    installationId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    try {
      const installation = await this.getInstallationById(installationId);
      if (!installation) {
        throw new Error(`Installation not found: ${installationId}`);
      }

      // Update status to uninstalling
      await this.updateInstallationStatus(installationId, 'uninstalling');

      // Perform uninstallation cleanup
      await this.performUninstallation(installation);

      // Update status to uninstalled
      await this.updateInstallationStatus(installationId, 'uninstalled');
      await this.db.query(`
        UPDATE app_installations 
        SET uninstalled_at = NOW(), uninstall_reason = $1
        WHERE id = $2
      `, [reason, installationId]);

      // Update app analytics
      await this.incrementUninstallCount(installation.appId);

      this.emit('app.uninstalled', {
        installation,
        userId,
        reason,
      });

      this.logger.info('App uninstalled successfully', {
        installationId,
        appId: installation.appId,
        organizationId: installation.organizationId,
      });
    } catch (error) {
      this.logger.error('Error uninstalling app', {
        installationId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get marketplace categories
   */
  public async getCategories(): Promise<MarketplaceCategory[]> {
    try {
      const result = await this.db.query(`
        SELECT c.*, COUNT(a.id) as app_count
        FROM marketplace_categories c
        LEFT JOIN marketplace_apps a ON c.slug = a.category AND a.status = 'published'
        GROUP BY c.id
        ORDER BY c.order ASC, c.name ASC
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        icon: row.icon,
        parentId: row.parent_id,
        appCount: parseInt(row.app_count),
        featured: row.featured,
        order: row.order,
      }));
    } catch (error) {
      this.logger.error('Error getting categories', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get featured apps
   */
  public async getFeaturedApps(limit: number = 10): Promise<MarketplaceApp[]> {
    try {
      const result = await this.db.query(`
        SELECT a.*, p.name as partner_name
        FROM marketplace_apps a
        JOIN partners p ON a.partner_id = p.id
        WHERE a.status = 'published' 
          AND a.visibility = 'public'
          AND a.featured = true
        ORDER BY a.rating DESC, a.installs DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => this.mapRowToApp(row));
    } catch (error) {
      this.logger.error('Error getting featured apps', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Submit app review
   */
  public async submitReview(
    appId: string,
    userId: string,
    rating: number,
    title: string,
    comment: string
  ): Promise<void> {
    try {
      // Check if user has installed the app
      const installation = await this.getUserInstallation(appId, userId);
      if (!installation) {
        throw new Error('You must install the app before reviewing it');
      }

      // Check if user has already reviewed
      const existingReview = await this.db.query(`
        SELECT id FROM app_reviews WHERE app_id = $1 AND user_id = $2
      `, [appId, userId]);

      if (existingReview.rows.length > 0) {
        throw new Error('You have already reviewed this app');
      }

      // Create review
      await this.db.query(`
        INSERT INTO app_reviews (
          id, app_id, user_id, rating, title, comment, verified, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        appId,
        userId,
        rating,
        title,
        comment,
        true, // Verified since they installed the app
      ]);

      // Update app rating
      await this.updateAppRating(appId);

      this.emit('app.reviewed', {
        appId,
        userId,
        rating,
        title,
        comment,
      });

      this.logger.info('App review submitted', {
        appId,
        userId,
        rating,
      });
    } catch (error) {
      this.logger.error('Error submitting review', {
        appId,
        userId,
        rating,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private mapRowToApp(row: any): MarketplaceApp {
    return {
      id: row.id,
      partnerId: row.partner_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      shortDescription: row.short_description,
      category: row.category,
      subcategory: row.subcategory,
      version: row.version,
      status: row.status,
      visibility: row.visibility,
      pricing: JSON.parse(row.pricing),
      media: JSON.parse(row.media),
      metadata: JSON.parse(row.metadata),
      technical: JSON.parse(row.technical),
      support: JSON.parse(row.support),
      analytics: JSON.parse(row.analytics),
      reviews: [], // Load separately if needed
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }

  private getSortColumn(sortBy: string): string {
    const sortColumns = {
      relevance: 'a.rating DESC, a.installs',
      popularity: 'a.installs',
      rating: 'a.rating',
      newest: 'a.published_at',
      name: 'a.name',
    };

    return sortColumns[sortBy as keyof typeof sortColumns] || 'a.rating DESC, a.installs';
  }

  private async getSearchFacets(searchParams: MarketplaceSearch): Promise<any> {
    // Implementation for search facets
    return {
      categories: [],
      pricing: [],
      ratings: [],
    };
  }

  private async incrementViewCount(appId: string): Promise<void> {
    await this.db.query(`
      UPDATE marketplace_apps 
      SET analytics = jsonb_set(analytics, '{views}', (COALESCE(analytics->>'views', '0')::int + 1)::text::jsonb)
      WHERE id = $1
    `, [appId]);
  }

  private async getInstallation(appId: string, organizationId: string): Promise<AppInstallation | null> {
    const result = await this.db.query(`
      SELECT * FROM app_installations 
      WHERE app_id = $1 AND organization_id = $2 AND status != 'uninstalled'
    `, [appId, organizationId]);

    return result.rows.length > 0 ? this.mapRowToInstallation(result.rows[0]) : null;
  }

  private async getInstallationById(id: string): Promise<AppInstallation | null> {
    const result = await this.db.query(`
      SELECT * FROM app_installations WHERE id = $1
    `, [id]);

    return result.rows.length > 0 ? this.mapRowToInstallation(result.rows[0]) : null;
  }

  private mapRowToInstallation(row: any): AppInstallation {
    return {
      id: row.id,
      appId: row.app_id,
      organizationId: row.organization_id,
      userId: row.user_id,
      status: row.status,
      configuration: JSON.parse(row.configuration),
      permissions: JSON.parse(row.permissions),
      subscription: row.subscription ? JSON.parse(row.subscription) : undefined,
      usage: JSON.parse(row.usage),
      installedAt: row.installed_at,
      updatedAt: row.updated_at,
      uninstalledAt: row.uninstalled_at,
    };
  }

  private async performInstallation(installation: AppInstallation, app: MarketplaceApp): Promise<void> {
    // Implementation for app installation process
    // This would handle OAuth flows, webhook setup, etc.
    this.logger.info('Performing app installation', {
      installationId: installation.id,
      appId: app.id,
    });
  }

  private async performUninstallation(installation: AppInstallation): Promise<void> {
    // Implementation for app uninstallation cleanup
    // This would handle webhook cleanup, data removal, etc.
    this.logger.info('Performing app uninstallation', {
      installationId: installation.id,
      appId: installation.appId,
    });
  }

  private async updateInstallationStatus(installationId: string, status: string): Promise<void> {
    await this.db.query(`
      UPDATE app_installations 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `, [status, installationId]);
  }

  private async incrementInstallCount(appId: string): Promise<void> {
    await this.db.query(`
      UPDATE marketplace_apps 
      SET analytics = jsonb_set(analytics, '{installs}', (COALESCE(analytics->>'installs', '0')::int + 1)::text::jsonb)
      WHERE id = $1
    `, [appId]);
  }

  private async incrementUninstallCount(appId: string): Promise<void> {
    await this.db.query(`
      UPDATE marketplace_apps 
      SET analytics = jsonb_set(analytics, '{uninstalls}', (COALESCE(analytics->>'uninstalls', '0')::int + 1)::text::jsonb)
      WHERE id = $1
    `, [appId]);
  }

  private async getUserInstallation(appId: string, userId: string): Promise<AppInstallation | null> {
    const result = await this.db.query(`
      SELECT * FROM app_installations 
      WHERE app_id = $1 AND user_id = $2 AND status = 'active'
    `, [appId, userId]);

    return result.rows.length > 0 ? this.mapRowToInstallation(result.rows[0]) : null;
  }

  private async updateAppRating(appId: string): Promise<void> {
    const result = await this.db.query(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
      FROM app_reviews 
      WHERE app_id = $1
    `, [appId]);

    const { avg_rating, review_count } = result.rows[0];

    await this.db.query(`
      UPDATE marketplace_apps 
      SET 
        analytics = jsonb_set(
          jsonb_set(analytics, '{rating}', $1::text::jsonb),
          '{reviewCount}', $2::text::jsonb
        )
      WHERE id = $3
    `, [parseFloat(avg_rating).toFixed(1), review_count, appId]);
  }
}

export default MarketplaceService;
