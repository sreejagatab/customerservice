/**
 * Partner Portal Service
 * Handles partner portal functionality, dashboard, and self-service features
 */

import { EventEmitter } from 'events';
import { Logger } from '@universal-ai-cs/shared';
import { DatabaseService } from '@universal-ai-cs/shared';
import { RedisService } from '@universal-ai-cs/shared';

export interface PartnerPortalUser {
  id: string;
  partnerId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'developer' | 'viewer';
  permissions: string[];
  status: 'active' | 'inactive' | 'pending';
  lastLogin?: Date;
  preferences: {
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
    dashboard: {
      widgets: string[];
      layout: 'grid' | 'list';
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerDashboard {
  partnerId: string;
  overview: {
    totalRevenue: number;
    monthlyRevenue: number;
    revenueGrowth: number;
    customerCount: number;
    customerGrowth: number;
    apiUsage: number;
    apiGrowth: number;
    supportTickets: number;
    satisfaction: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'customer_signup' | 'revenue_payment' | 'api_usage' | 'support_ticket' | 'certification';
    title: string;
    description: string;
    timestamp: Date;
    metadata: Record<string, any>;
  }>;
  alerts: Array<{
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
    dismissible: boolean;
    createdAt: Date;
  }>;
  quickActions: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    url: string;
    category: 'customer' | 'revenue' | 'technical' | 'support';
  }>;
}

export interface PartnerOnboarding {
  partnerId: string;
  currentStep: number;
  totalSteps: number;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'skipped';
    required: boolean;
    estimatedTime: number; // minutes
    resources: Array<{
      type: 'document' | 'video' | 'tutorial' | 'webinar';
      title: string;
      url: string;
      duration?: number;
    }>;
    completedAt?: Date;
  }>;
  progress: number; // percentage
  estimatedCompletion: Date;
  assignedTo?: string;
}

export interface PartnerResource {
  id: string;
  title: string;
  description: string;
  type: 'documentation' | 'tutorial' | 'video' | 'webinar' | 'template' | 'tool';
  category: 'getting_started' | 'technical' | 'marketing' | 'sales' | 'support';
  audience: 'all' | 'new_partners' | 'certified_partners' | 'enterprise_partners';
  content: {
    url?: string;
    downloadUrl?: string;
    embedCode?: string;
    text?: string;
  };
  metadata: {
    duration?: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    tags: string[];
    lastUpdated: Date;
    version: string;
  };
  access: {
    public: boolean;
    partnerTiers: string[];
    certificationRequired?: string;
  };
  analytics: {
    views: number;
    downloads: number;
    rating: number;
    reviews: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class PartnerPortalService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;
  private redis: RedisService;

  constructor() {
    super();
    this.logger = new Logger('PartnerPortalService');
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
  }

  /**
   * Get partner dashboard data
   */
  public async getPartnerDashboard(partnerId: string): Promise<PartnerDashboard> {
    try {
      const [overview, recentActivity, alerts] = await Promise.all([
        this.getPartnerOverview(partnerId),
        this.getRecentActivity(partnerId),
        this.getPartnerAlerts(partnerId),
      ]);

      const quickActions = this.getQuickActions(partnerId);

      return {
        partnerId,
        overview,
        recentActivity,
        alerts,
        quickActions,
      };
    } catch (error) {
      this.logger.error('Error getting partner dashboard', {
        partnerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get partner onboarding status
   */
  public async getPartnerOnboarding(partnerId: string): Promise<PartnerOnboarding> {
    try {
      const result = await this.db.query(`
        SELECT * FROM partner_onboarding WHERE partner_id = $1
      `, [partnerId]);

      if (result.rows.length === 0) {
        return await this.initializeOnboarding(partnerId);
      }

      const onboarding = result.rows[0];
      return {
        partnerId: onboarding.partner_id,
        currentStep: onboarding.current_step,
        totalSteps: onboarding.total_steps,
        steps: JSON.parse(onboarding.steps),
        progress: onboarding.progress,
        estimatedCompletion: onboarding.estimated_completion,
        assignedTo: onboarding.assigned_to,
      };
    } catch (error) {
      this.logger.error('Error getting partner onboarding', {
        partnerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update onboarding step
   */
  public async updateOnboardingStep(
    partnerId: string,
    stepId: string,
    status: 'completed' | 'skipped'
  ): Promise<void> {
    try {
      const onboarding = await this.getPartnerOnboarding(partnerId);
      
      // Update step status
      const stepIndex = onboarding.steps.findIndex(step => step.id === stepId);
      if (stepIndex === -1) {
        throw new Error(`Onboarding step not found: ${stepId}`);
      }

      onboarding.steps[stepIndex].status = status;
      onboarding.steps[stepIndex].completedAt = new Date();

      // Calculate progress
      const completedSteps = onboarding.steps.filter(step => 
        step.status === 'completed' || step.status === 'skipped'
      ).length;
      onboarding.progress = (completedSteps / onboarding.totalSteps) * 100;

      // Update current step
      const nextPendingStep = onboarding.steps.find(step => step.status === 'pending');
      onboarding.currentStep = nextPendingStep 
        ? onboarding.steps.indexOf(nextPendingStep) + 1
        : onboarding.totalSteps;

      // Save to database
      await this.db.query(`
        UPDATE partner_onboarding 
        SET current_step = $1, steps = $2, progress = $3, updated_at = NOW()
        WHERE partner_id = $4
      `, [
        onboarding.currentStep,
        JSON.stringify(onboarding.steps),
        onboarding.progress,
        partnerId,
      ]);

      this.emit('onboarding.step.completed', {
        partnerId,
        stepId,
        status,
        progress: onboarding.progress,
      });

      // Check if onboarding is complete
      if (onboarding.progress === 100) {
        await this.completeOnboarding(partnerId);
      }
    } catch (error) {
      this.logger.error('Error updating onboarding step', {
        partnerId,
        stepId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get partner resources
   */
  public async getPartnerResources(
    partnerId: string,
    filters: {
      type?: string;
      category?: string;
      difficulty?: string;
      search?: string;
    } = {}
  ): Promise<PartnerResource[]> {
    try {
      // Get partner tier to filter resources
      const partnerResult = await this.db.query(`
        SELECT tier FROM partners WHERE id = $1
      `, [partnerId]);

      if (partnerResult.rows.length === 0) {
        throw new Error(`Partner not found: ${partnerId}`);
      }

      const partnerTier = partnerResult.rows[0].tier;

      // Build query with filters
      let query = `
        SELECT * FROM partner_resources 
        WHERE (access_public = true OR $1 = ANY(access_partner_tiers))
      `;
      const params = [partnerTier];
      let paramIndex = 2;

      if (filters.type) {
        query += ` AND type = $${paramIndex}`;
        params.push(filters.type);
        paramIndex++;
      }

      if (filters.category) {
        query += ` AND category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
      }

      if (filters.difficulty) {
        query += ` AND metadata->>'difficulty' = $${paramIndex}`;
        params.push(filters.difficulty);
        paramIndex++;
      }

      if (filters.search) {
        query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${filters.search}%`);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        category: row.category,
        audience: row.audience,
        content: JSON.parse(row.content),
        metadata: JSON.parse(row.metadata),
        access: {
          public: row.access_public,
          partnerTiers: row.access_partner_tiers,
          certificationRequired: row.access_certification_required,
        },
        analytics: JSON.parse(row.analytics),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      this.logger.error('Error getting partner resources', {
        partnerId,
        filters,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create partner portal user
   */
  public async createPortalUser(
    partnerId: string,
    userData: Partial<PartnerPortalUser>
  ): Promise<PartnerPortalUser> {
    try {
      const user: PartnerPortalUser = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        partnerId,
        email: userData.email!,
        firstName: userData.firstName!,
        lastName: userData.lastName!,
        role: userData.role || 'viewer',
        permissions: userData.permissions || [],
        status: 'pending',
        preferences: {
          language: 'en',
          timezone: 'UTC',
          notifications: {
            email: true,
            sms: false,
            push: true,
          },
          dashboard: {
            widgets: ['overview', 'revenue', 'customers'],
            layout: 'grid',
          },
          ...userData.preferences,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.db.query(`
        INSERT INTO partner_portal_users (
          id, partner_id, email, first_name, last_name, role,
          permissions, status, preferences, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        user.id,
        user.partnerId,
        user.email,
        user.firstName,
        user.lastName,
        user.role,
        JSON.stringify(user.permissions),
        user.status,
        JSON.stringify(user.preferences),
        user.createdAt,
        user.updatedAt,
      ]);

      this.emit('portal.user.created', user);

      this.logger.info('Partner portal user created', {
        userId: user.id,
        partnerId,
        email: user.email,
        role: user.role,
      });

      return user;
    } catch (error) {
      this.logger.error('Error creating portal user', {
        partnerId,
        userData,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async getPartnerOverview(partnerId: string): Promise<PartnerDashboard['overview']> {
    // Get partner metrics from database
    const result = await this.db.query(`
      SELECT 
        COALESCE(SUM(revenue), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN revenue ELSE 0 END), 0) as monthly_revenue,
        COUNT(DISTINCT organization_id) as customer_count,
        COALESCE(SUM(api_calls), 0) as api_usage,
        COALESCE(AVG(satisfaction_score), 0) as satisfaction
      FROM partner_metrics 
      WHERE partner_id = $1
    `, [partnerId]);

    const metrics = result.rows[0];

    return {
      totalRevenue: parseFloat(metrics.total_revenue),
      monthlyRevenue: parseFloat(metrics.monthly_revenue),
      revenueGrowth: 0, // Calculate growth rate
      customerCount: parseInt(metrics.customer_count),
      customerGrowth: 0, // Calculate growth rate
      apiUsage: parseInt(metrics.api_usage),
      apiGrowth: 0, // Calculate growth rate
      supportTickets: 0, // Get from support system
      satisfaction: parseFloat(metrics.satisfaction),
    };
  }

  private async getRecentActivity(partnerId: string): Promise<PartnerDashboard['recentActivity']> {
    const result = await this.db.query(`
      SELECT * FROM partner_activity 
      WHERE partner_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [partnerId]);

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      timestamp: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  }

  private async getPartnerAlerts(partnerId: string): Promise<PartnerDashboard['alerts']> {
    const result = await this.db.query(`
      SELECT * FROM partner_alerts 
      WHERE partner_id = $1 AND dismissed = false
      ORDER BY created_at DESC
    `, [partnerId]);

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      actionUrl: row.action_url,
      actionText: row.action_text,
      dismissible: row.dismissible,
      createdAt: row.created_at,
    }));
  }

  private getQuickActions(partnerId: string): PartnerDashboard['quickActions'] {
    return [
      {
        id: 'add_customer',
        title: 'Add New Customer',
        description: 'Onboard a new customer to your platform',
        icon: 'user-plus',
        url: '/customers/new',
        category: 'customer',
      },
      {
        id: 'view_revenue',
        title: 'View Revenue Report',
        description: 'Check your latest revenue and commissions',
        icon: 'chart-line',
        url: '/revenue/reports',
        category: 'revenue',
      },
      {
        id: 'api_docs',
        title: 'API Documentation',
        description: 'Access technical documentation and guides',
        icon: 'code',
        url: '/docs/api',
        category: 'technical',
      },
      {
        id: 'support_ticket',
        title: 'Create Support Ticket',
        description: 'Get help from our support team',
        icon: 'life-ring',
        url: '/support/new',
        category: 'support',
      },
    ];
  }

  private async initializeOnboarding(partnerId: string): Promise<PartnerOnboarding> {
    const steps = [
      {
        id: 'profile_setup',
        title: 'Complete Partner Profile',
        description: 'Fill out your company information and contact details',
        status: 'pending' as const,
        required: true,
        estimatedTime: 15,
        resources: [
          {
            type: 'document' as const,
            title: 'Partner Profile Guide',
            url: '/docs/partner-profile-guide',
          },
        ],
      },
      {
        id: 'contract_agreement',
        title: 'Review and Sign Agreement',
        description: 'Review the partner agreement and provide digital signature',
        status: 'pending' as const,
        required: true,
        estimatedTime: 30,
        resources: [
          {
            type: 'document' as const,
            title: 'Partner Agreement Template',
            url: '/docs/partner-agreement',
          },
        ],
      },
      {
        id: 'branding_setup',
        title: 'Configure White-Label Branding',
        description: 'Set up your custom branding and domain',
        status: 'pending' as const,
        required: false,
        estimatedTime: 45,
        resources: [
          {
            type: 'tutorial' as const,
            title: 'Branding Setup Tutorial',
            url: '/tutorials/branding-setup',
            duration: 20,
          },
        ],
      },
      {
        id: 'api_setup',
        title: 'API Access Configuration',
        description: 'Set up API keys and configure access permissions',
        status: 'pending' as const,
        required: true,
        estimatedTime: 20,
        resources: [
          {
            type: 'document' as const,
            title: 'API Setup Guide',
            url: '/docs/api-setup',
          },
        ],
      },
      {
        id: 'certification',
        title: 'Complete Certification Training',
        description: 'Complete required training modules and certification',
        status: 'pending' as const,
        required: true,
        estimatedTime: 120,
        resources: [
          {
            type: 'webinar' as const,
            title: 'Partner Certification Course',
            url: '/training/certification',
            duration: 90,
          },
        ],
      },
      {
        id: 'first_customer',
        title: 'Onboard First Customer',
        description: 'Successfully onboard your first customer',
        status: 'pending' as const,
        required: false,
        estimatedTime: 60,
        resources: [
          {
            type: 'tutorial' as const,
            title: 'Customer Onboarding Guide',
            url: '/tutorials/customer-onboarding',
            duration: 30,
          },
        ],
      },
    ];

    const onboarding: PartnerOnboarding = {
      partnerId,
      currentStep: 1,
      totalSteps: steps.length,
      steps,
      progress: 0,
      estimatedCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    // Save to database
    await this.db.query(`
      INSERT INTO partner_onboarding (
        partner_id, current_step, total_steps, steps, progress,
        estimated_completion, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [
      partnerId,
      onboarding.currentStep,
      onboarding.totalSteps,
      JSON.stringify(onboarding.steps),
      onboarding.progress,
      onboarding.estimatedCompletion,
    ]);

    return onboarding;
  }

  private async completeOnboarding(partnerId: string): Promise<void> {
    await this.db.query(`
      UPDATE partners 
      SET onboarding_completed = true, onboarding_completed_at = NOW()
      WHERE id = $1
    `, [partnerId]);

    this.emit('onboarding.completed', { partnerId });

    this.logger.info('Partner onboarding completed', { partnerId });
  }
}

export default PartnerPortalService;
