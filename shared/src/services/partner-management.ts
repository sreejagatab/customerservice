/**
 * Partner Management Service
 * Handles partner onboarding, management, and revenue sharing for white-label solutions
 */

import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { EventEmitter } from 'events';

export interface Partner {
  id: string;
  name: string;
  slug: string;
  email: string;
  contactPerson: string;
  phone?: string;
  address?: any;
  status: 'pending' | 'active' | 'suspended' | 'terminated';
  partnerType: 'reseller' | 'white_label' | 'integration';
  commissionRate: number;
  revenueShareModel: any;
  brandingSettings: any;
  apiAccessLevel: string;
  allowedFeatures: string[];
  resourceLimits: any;
  contractDetails: any;
  onboardingCompleted: boolean;
  certificationLevel?: string;
  supportTier: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerOrganization {
  id: string;
  partnerId: string;
  organizationId: string;
  relationshipType: 'managed' | 'referred' | 'white_label';
  commissionOverride?: number;
  customPricing?: any;
  supportLevel: string;
  createdAt: Date;
}

export interface RevenueShare {
  partnerId: string;
  organizationId: string;
  period: string;
  revenue: number;
  commission: number;
  commissionRate: number;
  status: 'pending' | 'calculated' | 'paid';
}

export class PartnerManagementService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    super();
    this.logger = new Logger('PartnerManagementService');
    this.db = db;
  }

  /**
   * Create a new partner
   */
  async createPartner(partnerData: Partial<Partner>): Promise<Partner> {
    try {
      const slug = this.generateSlug(partnerData.name!);
      
      const result = await this.db.query(`
        INSERT INTO partners (
          name, slug, email, contact_person, phone, address,
          partner_type, commission_rate, revenue_share_model,
          branding_settings, api_access_level, allowed_features,
          resource_limits, contract_details, support_tier
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        partnerData.name,
        slug,
        partnerData.email,
        partnerData.contactPerson,
        partnerData.phone,
        JSON.stringify(partnerData.address || {}),
        partnerData.partnerType || 'reseller',
        partnerData.commissionRate || 0.20,
        JSON.stringify(partnerData.revenueShareModel || {}),
        JSON.stringify(partnerData.brandingSettings || {}),
        partnerData.apiAccessLevel || 'standard',
        partnerData.allowedFeatures || [],
        JSON.stringify(partnerData.resourceLimits || {}),
        JSON.stringify(partnerData.contractDetails || {}),
        partnerData.supportTier || 'standard'
      ]);

      const partner = this.mapPartnerFromDb(result.rows[0]);
      
      this.emit('partner.created', partner);
      this.logger.info(`Partner created: ${partner.id}`);
      
      return partner;
    } catch (error) {
      this.logger.error('Error creating partner:', error);
      throw new Error('Failed to create partner');
    }
  }

  /**
   * Get partner by ID
   */
  async getPartner(partnerId: string): Promise<Partner | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM partners WHERE id = $1',
        [partnerId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapPartnerFromDb(result.rows[0]);
    } catch (error) {
      this.logger.error('Error getting partner:', error);
      throw new Error('Failed to get partner');
    }
  }

  /**
   * Update partner
   */
  async updatePartner(partnerId: string, updates: Partial<Partner>): Promise<Partner> {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'createdAt') continue;
        
        const dbKey = this.camelToSnake(key);
        setClause.push(`${dbKey} = $${paramIndex}`);
        
        if (typeof value === 'object' && value !== null) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
        paramIndex++;
      }

      values.push(partnerId);

      const result = await this.db.query(`
        UPDATE partners 
        SET ${setClause.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('Partner not found');
      }

      const partner = this.mapPartnerFromDb(result.rows[0]);
      
      this.emit('partner.updated', partner);
      this.logger.info(`Partner updated: ${partner.id}`);
      
      return partner;
    } catch (error) {
      this.logger.error('Error updating partner:', error);
      throw new Error('Failed to update partner');
    }
  }

  /**
   * List partners with pagination
   */
  async listPartners(
    page: number = 1,
    limit: number = 20,
    filters: any = {}
  ): Promise<{ partners: Partner[]; total: number; page: number; limit: number }> {
    try {
      const offset = (page - 1) * limit;
      const whereClause = this.buildWhereClause(filters);
      
      const countResult = await this.db.query(`
        SELECT COUNT(*) as total FROM partners ${whereClause.clause}
      `, whereClause.values);

      const result = await this.db.query(`
        SELECT * FROM partners ${whereClause.clause}
        ORDER BY created_at DESC
        LIMIT $${whereClause.values.length + 1} OFFSET $${whereClause.values.length + 2}
      `, [...whereClause.values, limit, offset]);

      const partners = result.rows.map(row => this.mapPartnerFromDb(row));
      const total = parseInt(countResult.rows[0].total);

      return { partners, total, page, limit };
    } catch (error) {
      this.logger.error('Error listing partners:', error);
      throw new Error('Failed to list partners');
    }
  }

  /**
   * Associate organization with partner
   */
  async associateOrganization(
    partnerId: string,
    organizationId: string,
    relationshipType: 'managed' | 'referred' | 'white_label',
    options: {
      commissionOverride?: number;
      customPricing?: any;
      supportLevel?: string;
    } = {}
  ): Promise<PartnerOrganization> {
    try {
      const result = await this.db.query(`
        INSERT INTO partner_organizations (
          partner_id, organization_id, relationship_type,
          commission_override, custom_pricing, support_level
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        partnerId,
        organizationId,
        relationshipType,
        options.commissionOverride,
        JSON.stringify(options.customPricing || {}),
        options.supportLevel || 'standard'
      ]);

      const association = this.mapPartnerOrganizationFromDb(result.rows[0]);
      
      // Update organization with partner reference
      await this.db.query(
        'UPDATE organizations SET partner_id = $1 WHERE id = $2',
        [partnerId, organizationId]
      );

      this.emit('partner.organization.associated', {
        partnerId,
        organizationId,
        relationshipType
      });

      this.logger.info(`Organization ${organizationId} associated with partner ${partnerId}`);
      
      return association;
    } catch (error) {
      this.logger.error('Error associating organization with partner:', error);
      throw new Error('Failed to associate organization with partner');
    }
  }

  /**
   * Calculate revenue share for a partner
   */
  async calculateRevenueShare(
    partnerId: string,
    period: string
  ): Promise<RevenueShare[]> {
    try {
      const result = await this.db.query(`
        SELECT 
          po.partner_id,
          po.organization_id,
          COALESCE(po.commission_override, p.commission_rate) as commission_rate,
          SUM(bu.total_cost) as revenue
        FROM partner_organizations po
        JOIN partners p ON po.partner_id = p.id
        JOIN billing_usage bu ON po.organization_id = bu.organization_id
        WHERE po.partner_id = $1 
          AND bu.billing_period_start >= $2::timestamp
          AND bu.billing_period_end <= $3::timestamp
          AND bu.status = 'finalized'
        GROUP BY po.partner_id, po.organization_id, commission_rate
      `, [partnerId, `${period}-01`, `${period}-31`]);

      const revenueShares: RevenueShare[] = result.rows.map(row => ({
        partnerId: row.partner_id,
        organizationId: row.organization_id,
        period,
        revenue: parseFloat(row.revenue),
        commissionRate: parseFloat(row.commission_rate),
        commission: parseFloat(row.revenue) * parseFloat(row.commission_rate),
        status: 'calculated' as const
      }));

      this.emit('revenue.calculated', { partnerId, period, revenueShares });
      
      return revenueShares;
    } catch (error) {
      this.logger.error('Error calculating revenue share:', error);
      throw new Error('Failed to calculate revenue share');
    }
  }

  /**
   * Get partner dashboard data
   */
  async getPartnerDashboard(partnerId: string): Promise<any> {
    try {
      const [
        partnerInfo,
        organizationCount,
        revenueData,
        recentActivity
      ] = await Promise.all([
        this.getPartner(partnerId),
        this.getPartnerOrganizationCount(partnerId),
        this.getPartnerRevenueData(partnerId),
        this.getPartnerRecentActivity(partnerId)
      ]);

      return {
        partner: partnerInfo,
        stats: {
          totalOrganizations: organizationCount,
          monthlyRevenue: revenueData.monthlyRevenue,
          totalCommission: revenueData.totalCommission,
          growthRate: revenueData.growthRate
        },
        recentActivity
      };
    } catch (error) {
      this.logger.error('Error getting partner dashboard:', error);
      throw new Error('Failed to get partner dashboard');
    }
  }

  /**
   * Helper methods
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private mapPartnerFromDb(row: any): Partner {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      email: row.email,
      contactPerson: row.contact_person,
      phone: row.phone,
      address: row.address,
      status: row.status,
      partnerType: row.partner_type,
      commissionRate: parseFloat(row.commission_rate),
      revenueShareModel: row.revenue_share_model,
      brandingSettings: row.branding_settings,
      apiAccessLevel: row.api_access_level,
      allowedFeatures: row.allowed_features,
      resourceLimits: row.resource_limits,
      contractDetails: row.contract_details,
      onboardingCompleted: row.onboarding_completed,
      certificationLevel: row.certification_level,
      supportTier: row.support_tier,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPartnerOrganizationFromDb(row: any): PartnerOrganization {
    return {
      id: row.id,
      partnerId: row.partner_id,
      organizationId: row.organization_id,
      relationshipType: row.relationship_type,
      commissionOverride: row.commission_override ? parseFloat(row.commission_override) : undefined,
      customPricing: row.custom_pricing,
      supportLevel: row.support_level,
      createdAt: row.created_at
    };
  }

  private buildWhereClause(filters: any): { clause: string; values: any[] } {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(filters.status);
      paramIndex++;
    }

    if (filters.partnerType) {
      conditions.push(`partner_type = $${paramIndex}`);
      values.push(filters.partnerType);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { clause, values };
  }

  private async getPartnerOrganizationCount(partnerId: string): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*) as count FROM partner_organizations WHERE partner_id = $1',
      [partnerId]
    );
    return parseInt(result.rows[0].count);
  }

  private async getPartnerRevenueData(partnerId: string): Promise<any> {
    // Implementation for revenue data calculation
    return {
      monthlyRevenue: 0,
      totalCommission: 0,
      growthRate: 0
    };
  }

  private async getPartnerRecentActivity(partnerId: string): Promise<any[]> {
    // Implementation for recent activity
    return [];
  }
}

export default PartnerManagementService;
