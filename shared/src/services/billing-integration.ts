/**
 * Billing Integration Service
 * Handles billing, subscription management, and usage tracking
 */

import { EventEmitter } from 'events';
import Stripe from 'stripe';
import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { RedisService } from './redis';

export interface BillingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    messages: number;
    users: number;
    integrations: number;
    storage: number; // GB
    apiCalls: number;
  };
  stripeProductId?: string;
  stripePriceId?: string;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  metadata: Record<string, any>;
}

export interface UsageRecord {
  organizationId: string;
  metric: string;
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Invoice {
  id: string;
  organizationId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  dueDate: Date;
  paidAt?: Date;
  stripeInvoiceId?: string;
  lineItems: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  metadata?: Record<string, any>;
}

export class BillingIntegrationService extends EventEmitter {
  private static instance: BillingIntegrationService;
  private logger: Logger;
  private db: DatabaseService;
  private redis: RedisService;
  private stripe: Stripe;
  private plans: Map<string, BillingPlan> = new Map();

  constructor() {
    super();
    this.logger = new Logger('BillingIntegrationService');
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
    
    // Initialize Stripe
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  }

  public static getInstance(): BillingIntegrationService {
    if (!BillingIntegrationService.instance) {
      BillingIntegrationService.instance = new BillingIntegrationService();
    }
    return BillingIntegrationService.instance;
  }

  /**
   * Initialize billing service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadBillingPlans();
      await this.setupWebhooks();
      this.startUsageAggregation();
      
      this.logger.info('Billing integration service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize billing service', { error });
      throw error;
    }
  }

  /**
   * Get available billing plans
   */
  public getBillingPlans(): BillingPlan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Get billing plan by ID
   */
  public getBillingPlan(planId: string): BillingPlan | null {
    return this.plans.get(planId) || null;
  }

  /**
   * Create subscription for organization
   */
  public async createSubscription(
    organizationId: string,
    planId: string,
    paymentMethodId?: string,
    trialDays?: number
  ): Promise<Subscription> {
    try {
      const plan = this.getBillingPlan(planId);
      if (!plan) {
        throw new Error(`Billing plan not found: ${planId}`);
      }

      // Get organization details
      const orgResult = await this.db.query(
        'SELECT * FROM organizations WHERE id = $1',
        [organizationId]
      );
      
      if (orgResult.rows.length === 0) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      const organization = orgResult.rows[0];

      // Create or get Stripe customer
      let stripeCustomerId = organization.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await this.stripe.customers.create({
          email: organization.billing_email || organization.email,
          name: organization.name,
          metadata: {
            organizationId,
          },
        });
        stripeCustomerId = customer.id;

        // Update organization with Stripe customer ID
        await this.db.query(
          'UPDATE organizations SET stripe_customer_id = $1 WHERE id = $2',
          [stripeCustomerId, organizationId]
        );
      }

      // Attach payment method if provided
      if (paymentMethodId) {
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: stripeCustomerId,
        });

        await this.stripe.customers.update(stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      // Create Stripe subscription
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: stripeCustomerId,
        items: [{ price: plan.stripePriceId! }],
        metadata: {
          organizationId,
          planId,
        },
      };

      if (trialDays) {
        subscriptionParams.trial_period_days = trialDays;
      }

      const stripeSubscription = await this.stripe.subscriptions.create(subscriptionParams);

      // Create subscription record
      const subscription: Subscription = {
        id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        planId,
        status: stripeSubscription.status as any,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : undefined,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        stripeSubscriptionId: stripeSubscription.id,
        metadata: {},
      };

      // Save subscription to database
      await this.db.query(`
        INSERT INTO subscriptions (
          id, organization_id, plan_id, status, current_period_start,
          current_period_end, trial_end, cancel_at_period_end,
          stripe_subscription_id, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      `, [
        subscription.id,
        subscription.organizationId,
        subscription.planId,
        subscription.status,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.trialEnd,
        subscription.cancelAtPeriodEnd,
        subscription.stripeSubscriptionId,
        JSON.stringify(subscription.metadata),
      ]);

      this.emit('subscription.created', subscription);
      
      this.logger.info('Subscription created', {
        organizationId,
        subscriptionId: subscription.id,
        planId,
      });

      return subscription;
    } catch (error) {
      this.logger.error('Error creating subscription', {
        organizationId,
        planId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get organization subscription
   */
  public async getSubscription(organizationId: string): Promise<Subscription | null> {
    try {
      const result = await this.db.query(`
        SELECT * FROM subscriptions 
        WHERE organization_id = $1 AND status IN ('active', 'trialing', 'past_due')
        ORDER BY created_at DESC LIMIT 1
      `, [organizationId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        organizationId: row.organization_id,
        planId: row.plan_id,
        status: row.status,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        trialEnd: row.trial_end,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        stripeSubscriptionId: row.stripe_subscription_id,
        metadata: row.metadata || {},
      };
    } catch (error) {
      this.logger.error('Error getting subscription', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cancel subscription
   */
  public async cancelSubscription(
    organizationId: string,
    cancelAtPeriodEnd: boolean = true
  ): Promise<void> {
    try {
      const subscription = await this.getSubscription(organizationId);
      if (!subscription) {
        throw new Error(`No active subscription found for organization: ${organizationId}`);
      }

      if (subscription.stripeSubscriptionId) {
        if (cancelAtPeriodEnd) {
          await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: true,
          });
        } else {
          await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        }
      }

      // Update subscription in database
      await this.db.query(`
        UPDATE subscriptions 
        SET cancel_at_period_end = $1, status = $2, updated_at = NOW()
        WHERE id = $3
      `, [
        cancelAtPeriodEnd,
        cancelAtPeriodEnd ? subscription.status : 'canceled',
        subscription.id,
      ]);

      this.emit('subscription.canceled', {
        organizationId,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd,
      });

      this.logger.info('Subscription canceled', {
        organizationId,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd,
      });
    } catch (error) {
      this.logger.error('Error canceling subscription', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record usage for billing
   */
  public async recordUsage(
    organizationId: string,
    metric: string,
    quantity: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const usageRecord: UsageRecord = {
        organizationId,
        metric,
        quantity,
        timestamp: new Date(),
        metadata,
      };

      // Store in database
      await this.db.query(`
        INSERT INTO usage_records (
          organization_id, metric, quantity, timestamp, metadata
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        usageRecord.organizationId,
        usageRecord.metric,
        usageRecord.quantity,
        usageRecord.timestamp,
        JSON.stringify(usageRecord.metadata || {}),
      ]);

      // Update real-time usage in Redis
      const key = `usage:${organizationId}:${metric}`;
      await this.redis.incrby(key, quantity);

      // Set monthly expiry
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const ttl = Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
      await this.redis.expire(key, ttl);

      this.emit('usage.recorded', usageRecord);

      this.logger.debug('Usage recorded', {
        organizationId,
        metric,
        quantity,
      });
    } catch (error) {
      this.logger.error('Error recording usage', {
        organizationId,
        metric,
        quantity,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get current usage for organization
   */
  public async getCurrentUsage(
    organizationId: string,
    metric?: string
  ): Promise<Record<string, number>> {
    try {
      if (metric) {
        const key = `usage:${organizationId}:${metric}`;
        const usage = await this.redis.get(key);
        return { [metric]: parseInt(usage || '0', 10) };
      }

      // Get all usage metrics
      const pattern = `usage:${organizationId}:*`;
      const keys = await this.redis.keys(pattern);
      const usage: Record<string, number> = {};

      for (const key of keys) {
        const metric = key.split(':')[2];
        const value = await this.redis.get(key);
        usage[metric] = parseInt(value || '0', 10);
      }

      return usage;
    } catch (error) {
      this.logger.error('Error getting current usage', {
        organizationId,
        metric,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Check if organization has exceeded limits
   */
  public async checkUsageLimits(organizationId: string): Promise<{
    withinLimits: boolean;
    violations: Array<{ metric: string; usage: number; limit: number }>;
  }> {
    try {
      const subscription = await this.getSubscription(organizationId);
      if (!subscription) {
        return { withinLimits: false, violations: [] };
      }

      const plan = this.getBillingPlan(subscription.planId);
      if (!plan) {
        return { withinLimits: false, violations: [] };
      }

      const currentUsage = await this.getCurrentUsage(organizationId);
      const violations: Array<{ metric: string; usage: number; limit: number }> = [];

      // Check each limit
      for (const [metric, limit] of Object.entries(plan.limits)) {
        const usage = currentUsage[metric] || 0;
        if (usage > limit) {
          violations.push({ metric, usage, limit });
        }
      }

      return {
        withinLimits: violations.length === 0,
        violations,
      };
    } catch (error) {
      this.logger.error('Error checking usage limits', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { withinLimits: false, violations: [] };
    }
  }

  /**
   * Private helper methods
   */
  private async loadBillingPlans(): Promise<void> {
    try {
      const result = await this.db.query('SELECT * FROM billing_plans WHERE active = true');
      
      for (const row of result.rows) {
        const plan: BillingPlan = {
          id: row.id,
          name: row.name,
          description: row.description,
          price: row.price,
          currency: row.currency,
          interval: row.interval,
          features: row.features || [],
          limits: row.limits || {},
          stripeProductId: row.stripe_product_id,
          stripePriceId: row.stripe_price_id,
        };
        
        this.plans.set(plan.id, plan);
      }

      this.logger.info('Loaded billing plans', { count: this.plans.size });
    } catch (error) {
      this.logger.error('Error loading billing plans', { error });
      throw error;
    }
  }

  private async setupWebhooks(): Promise<void> {
    // Webhook handling for Stripe events would be implemented here
    // This would handle subscription updates, payment failures, etc.
    this.logger.info('Billing webhooks configured');
  }

  private startUsageAggregation(): void {
    // Start periodic usage aggregation for billing
    setInterval(async () => {
      try {
        await this.aggregateUsageForBilling();
      } catch (error) {
        this.logger.error('Error in usage aggregation', { error });
      }
    }, 60000); // Run every minute
  }

  private async aggregateUsageForBilling(): Promise<void> {
    // Aggregate usage data for billing purposes
    // This would typically run daily or monthly
    this.logger.debug('Usage aggregation completed');
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      // Test Stripe connection
      await this.stripe.accounts.retrieve();
      
      return {
        status: 'healthy',
        details: {
          plansLoaded: this.plans.size,
          stripeConnected: true,
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
    this.plans.clear();
    this.removeAllListeners();
    this.logger.info('Billing integration service closed');
  }
}

export default BillingIntegrationService;
