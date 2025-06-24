/**
 * Tenant Context Middleware for Multi-Tenant SaaS Architecture
 * Provides tenant isolation and context management across all services
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../services/database';

export interface TenantContext {
  organizationId: string;
  tenantType: 'direct' | 'partner' | 'white_label' | 'enterprise';
  parentOrganizationId?: string;
  partnerId?: string;
  region: string;
  customDomain?: string;
  branding?: any;
  resourceQuotas: Record<string, any>;
  complianceSettings: Record<string, any>;
  dataResidencyRequirements: Record<string, any>;
  billingStatus: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing';
  subscriptionPlan: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      organizationId?: string;
    }
  }
}

export class TenantContextMiddleware {
  private logger: Logger;
  private db: DatabaseService;
  private cache: Map<string, TenantContext> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(db: DatabaseService) {
    this.logger = new Logger('TenantContextMiddleware');
    this.db = db;
  }

  /**
   * Extract tenant context from request
   */
  public extractTenantContext = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = this.getOrganizationId(req);
      
      if (!organizationId) {
        res.status(400).json({
          error: 'Missing organization context',
          message: 'Organization ID is required for all requests'
        });
        return;
      }

      // Check cache first
      const cacheKey = `tenant:${organizationId}`;
      let tenantContext = this.cache.get(cacheKey);

      if (!tenantContext) {
        tenantContext = await this.loadTenantContext(organizationId);
        if (tenantContext) {
          this.cache.set(cacheKey, tenantContext);
          // Clear cache after timeout
          setTimeout(() => this.cache.delete(cacheKey), this.cacheTimeout);
        }
      }

      if (!tenantContext) {
        res.status(404).json({
          error: 'Organization not found',
          message: 'The specified organization does not exist or is not accessible'
        });
        return;
      }

      // Check if organization is active
      if (tenantContext.billingStatus === 'canceled' || tenantContext.billingStatus === 'unpaid') {
        res.status(403).json({
          error: 'Account suspended',
          message: 'Organization account is suspended due to billing issues'
        });
        return;
      }

      // Attach tenant context to request
      req.tenant = tenantContext;
      req.organizationId = organizationId;

      // Add tenant context to response headers for debugging
      if (process.env.NODE_ENV === 'development') {
        res.setHeader('X-Tenant-ID', organizationId);
        res.setHeader('X-Tenant-Type', tenantContext.tenantType);
        res.setHeader('X-Tenant-Region', tenantContext.region);
      }

      next();
    } catch (error) {
      this.logger.error('Error extracting tenant context:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to load tenant context'
      });
    }
  };

  /**
   * Validate resource quota before processing
   */
  public validateResourceQuota = (resourceType: string, amount: number = 1) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.tenant) {
          res.status(400).json({
            error: 'Missing tenant context',
            message: 'Tenant context is required for quota validation'
          });
          return;
        }

        const canProceed = await this.checkResourceQuota(
          req.tenant.organizationId,
          resourceType,
          amount
        );

        if (!canProceed) {
          res.status(429).json({
            error: 'Quota exceeded',
            message: `Resource quota exceeded for ${resourceType}`,
            quotaType: resourceType,
            requestedAmount: amount
          });
          return;
        }

        next();
      } catch (error) {
        this.logger.error('Error validating resource quota:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to validate resource quota'
        });
      }
    };
  };

  /**
   * Update resource usage after successful operation
   */
  public updateResourceUsage = async (
    organizationId: string,
    resourceType: string,
    amount: number = 1
  ): Promise<void> => {
    try {
      await this.db.query(
        'SELECT update_resource_usage($1, $2, $3)',
        [organizationId, resourceType, amount]
      );
    } catch (error) {
      this.logger.error('Error updating resource usage:', error);
      // Don't throw error to avoid breaking the main operation
    }
  };

  /**
   * Validate feature access
   */
  public validateFeatureAccess = (featureName: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.tenant) {
        res.status(400).json({
          error: 'Missing tenant context',
          message: 'Tenant context is required for feature validation'
        });
        return;
      }

      const hasAccess = req.tenant.features[featureName] === true;
      
      if (!hasAccess) {
        res.status(403).json({
          error: 'Feature not available',
          message: `Feature '${featureName}' is not available in your current plan`,
          feature: featureName,
          currentPlan: req.tenant.subscriptionPlan
        });
        return;
      }

      next();
    };
  };

  /**
   * Get organization ID from various sources
   */
  private getOrganizationId(req: Request): string | null {
    // Try different sources in order of preference
    
    // 1. From JWT token (most secure)
    if (req.user && (req.user as any).organizationId) {
      return (req.user as any).organizationId;
    }

    // 2. From custom header
    if (req.headers['x-organization-id']) {
      return req.headers['x-organization-id'] as string;
    }

    // 3. From subdomain (for white-label)
    if (req.headers.host) {
      const subdomain = req.headers.host.split('.')[0];
      if (subdomain && subdomain !== 'api' && subdomain !== 'www') {
        // This would need to be resolved to organization ID via database lookup
        return this.resolveSubdomainToOrganizationId(subdomain);
      }
    }

    // 4. From query parameter (least secure, only for development)
    if (process.env.NODE_ENV === 'development' && req.query.organizationId) {
      return req.query.organizationId as string;
    }

    return null;
  }

  /**
   * Load tenant context from database
   */
  private async loadTenantContext(organizationId: string): Promise<TenantContext | null> {
    try {
      const result = await this.db.query(`
        SELECT 
          o.*,
          sp.features,
          sp.limits,
          sp.name as plan_name
        FROM organizations o
        LEFT JOIN subscription_plans sp ON o.plan = sp.plan_type
        WHERE o.id = $1 AND o.status = 'active'
      `, [organizationId]);

      if (result.rows.length === 0) {
        return null;
      }

      const org = result.rows[0];

      return {
        organizationId: org.id,
        tenantType: org.tenant_type,
        parentOrganizationId: org.parent_organization_id,
        partnerId: org.partner_id,
        region: org.region,
        customDomain: org.custom_domain,
        branding: org.branding,
        resourceQuotas: org.resource_quotas,
        complianceSettings: org.compliance_settings,
        dataResidencyRequirements: org.data_residency_requirements,
        billingStatus: org.billing_status,
        subscriptionPlan: org.plan_name || org.plan,
        features: org.features || {},
        limits: org.limits || {}
      };
    } catch (error) {
      this.logger.error('Error loading tenant context:', error);
      return null;
    }
  }

  /**
   * Check resource quota
   */
  private async checkResourceQuota(
    organizationId: string,
    resourceType: string,
    amount: number
  ): Promise<boolean> {
    try {
      const result = await this.db.query(
        'SELECT check_resource_quota($1, $2, $3) as allowed',
        [organizationId, resourceType, amount]
      );

      return result.rows[0]?.allowed === true;
    } catch (error) {
      this.logger.error('Error checking resource quota:', error);
      return false; // Fail closed
    }
  }

  /**
   * Resolve subdomain to organization ID
   */
  private async resolveSubdomainToOrganizationId(subdomain: string): Promise<string | null> {
    try {
      const result = await this.db.query(`
        SELECT o.id 
        FROM organizations o
        LEFT JOIN white_label_branding wlb ON o.id = wlb.organization_id
        WHERE o.slug = $1 OR wlb.custom_domain LIKE $2
      `, [subdomain, `${subdomain}.%`]);

      return result.rows[0]?.id || null;
    } catch (error) {
      this.logger.error('Error resolving subdomain to organization ID:', error);
      return null;
    }
  }

  /**
   * Clear tenant cache
   */
  public clearTenantCache(organizationId?: string): void {
    if (organizationId) {
      this.cache.delete(`tenant:${organizationId}`);
    } else {
      this.cache.clear();
    }
  }
}

export default TenantContextMiddleware;
