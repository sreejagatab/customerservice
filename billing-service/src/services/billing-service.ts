/**
 * Billing Service
 * Core billing functionality for multi-tenant SaaS platform
 */

import { logger } from '@universal-ai-cs/shared';
import Stripe from 'stripe';

export interface BillingPlan {
  id: string;
  name: string;
  description: string;
  type: 'free' | 'starter' | 'professional' | 'enterprise' | 'custom';
  pricing: {
    basePrice: number; // monthly base price
    currency: 'USD' | 'EUR' | 'GBP';
    billingCycle: 'monthly' | 'yearly';
    usageBased: boolean;
    freeAllowances: {
      messages: number;
      aiRequests: number;
      storage: number; // GB
      users: number;
    };
    overageRates: {
      perMessage: number;
      perAiRequest: number;
      perGbStorage: number;
      perUser: number;
    };
  };
  features: {
    maxIntegrations: number;
    customBranding: boolean;
    prioritySupport: boolean;
    sla: string;
    apiAccess: boolean;
    webhooks: boolean;
    analytics: boolean;
    customModels: boolean;
  };
  limits: {
    maxOrganizations: number;
    maxUsers: number;
    maxMessages: number;
    maxStorage: number;
    rateLimits: {
      apiCallsPerMinute: number;
      messagesPerHour: number;
    };
  };
}

export interface Invoice {
  id: string;
  organizationId: string;
  subscriptionId: string;
  invoiceNumber: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  paidAt?: Date;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    type: 'subscription' | 'usage' | 'one_time';
    metadata: Record<string, any>;
  }>;
  paymentMethod?: {
    type: 'card' | 'bank_transfer' | 'wire';
    last4?: string;
    brand?: string;
  };
  stripeInvoiceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingUsage {
  organizationId: string;
  period: { start: Date; end: Date };
  usage: {
    messages: number;
    aiRequests: number;
    storage: number;
    users: number;
    apiCalls: number;
  };
  costs: {
    baseSubscription: number;
    overages: {
      messages: number;
      aiRequests: number;
      storage: number;
      users: number;
    };
    total: number;
  };
  projectedCosts: {
    monthly: number;
    yearly: number;
  };
}

export class BillingService {
  private static instance: BillingService;
  private stripe: Stripe;
  private billingPlans: Map<string, BillingPlan> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  private processingInterval?: NodeJS.Timeout;

  private constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_...', {
      apiVersion: '2023-10-16',
    });
  }

  public static getInstance(): BillingService {
    if (!BillingService.instance) {
      BillingService.instance = new BillingService();
    }
    return BillingService.instance;
  }

  /**
   * Initialize the billing service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadBillingPlans();
      this.startBillingProcessor();
      
      logger.info('Billing Service initialized', {
        billingPlans: this.billingPlans.size,
        invoices: this.invoices.size,
        stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      });
    } catch (error) {
      logger.error('Failed to initialize Billing Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get billing plans
   */
  public async getBillingPlans(): Promise<BillingPlan[]> {
    return Array.from(this.billingPlans.values());
  }

  /**
   * Create subscription
   */
  public async createSubscription(
    organizationId: string,
    planId: string,
    paymentMethodId: string,
    billingDetails: {
      email: string;
      name: string;
      address?: {
        line1: string;
        city: string;
        state: string;
        postal_code: string;
        country: string;
      };
    }
  ): Promise<{
    subscriptionId: string;
    clientSecret?: string;
    status: string;
  }> {
    try {
      const plan = this.billingPlans.get(planId);
      if (!plan) {
        throw new Error('Billing plan not found');
      }

      // Create Stripe customer
      const customer = await this.stripe.customers.create({
        email: billingDetails.email,
        name: billingDetails.name,
        address: billingDetails.address,
        metadata: {
          organizationId,
        },
      });

      // Attach payment method
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id,
      });

      // Set as default payment method
      await this.stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Create Stripe price if not exists
      const priceId = await this.getOrCreateStripePrice(plan);

      // Create subscription
      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          organizationId,
          planId,
        },
      });

      logger.info('Subscription created', {
        organizationId,
        planId,
        subscriptionId: subscription.id,
        customerId: customer.id,
      });

      return {
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
        status: subscription.status,
      };
    } catch (error) {
      logger.error('Error creating subscription', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        planId,
      });
      throw error;
    }
  }

  /**
   * Generate invoice
   */
  public async generateInvoice(
    organizationId: string,
    subscriptionId: string,
    usage: BillingUsage
  ): Promise<string> {
    try {
      const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const lineItems: any[] = [];
      
      // Base subscription
      lineItems.push({
        id: `line_${Date.now()}_1`,
        description: 'Monthly Subscription',
        quantity: 1,
        unitPrice: usage.costs.baseSubscription,
        amount: usage.costs.baseSubscription,
        type: 'subscription',
        metadata: { period: `${usage.period.start.toISOString()} - ${usage.period.end.toISOString()}` },
      });

      // Usage overages
      if (usage.costs.overages.messages > 0) {
        lineItems.push({
          id: `line_${Date.now()}_2`,
          description: 'Message Overage',
          quantity: usage.usage.messages,
          unitPrice: usage.costs.overages.messages / usage.usage.messages,
          amount: usage.costs.overages.messages,
          type: 'usage',
          metadata: { usageType: 'messages' },
        });
      }

      if (usage.costs.overages.aiRequests > 0) {
        lineItems.push({
          id: `line_${Date.now()}_3`,
          description: 'AI Request Overage',
          quantity: usage.usage.aiRequests,
          unitPrice: usage.costs.overages.aiRequests / usage.usage.aiRequests,
          amount: usage.costs.overages.aiRequests,
          type: 'usage',
          metadata: { usageType: 'aiRequests' },
        });
      }

      const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
      const tax = subtotal * 0.08; // 8% tax rate
      const total = subtotal + tax;

      const invoice: Invoice = {
        id: invoiceId,
        organizationId,
        subscriptionId,
        invoiceNumber: `INV-${Date.now()}`,
        status: 'open',
        currency: 'USD',
        subtotal,
        tax,
        total,
        amountPaid: 0,
        amountDue: total,
        periodStart: usage.period.start,
        periodEnd: usage.period.end,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        lineItems,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.invoices.set(invoiceId, invoice);

      logger.info('Invoice generated', {
        invoiceId,
        organizationId,
        total,
        lineItemsCount: lineItems.length,
      });

      return invoiceId;
    } catch (error) {
      logger.error('Error generating invoice', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        subscriptionId,
      });
      throw error;
    }
  }

  /**
   * Get invoices
   */
  public async getInvoices(
    organizationId: string,
    filters?: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<Invoice[]> {
    try {
      let invoices = Array.from(this.invoices.values())
        .filter(invoice => invoice.organizationId === organizationId);

      if (filters) {
        if (filters.status) {
          invoices = invoices.filter(invoice => invoice.status === filters.status);
        }
        if (filters.startDate) {
          invoices = invoices.filter(invoice => invoice.createdAt >= filters.startDate!);
        }
        if (filters.endDate) {
          invoices = invoices.filter(invoice => invoice.createdAt <= filters.endDate!);
        }
      }

      // Sort by creation date (newest first)
      invoices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Apply limit
      if (filters?.limit) {
        invoices = invoices.slice(0, filters.limit);
      }

      return invoices;
    } catch (error) {
      logger.error('Error getting invoices', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return [];
    }
  }

  /**
   * Process payment
   */
  public async processPayment(
    invoiceId: string,
    paymentMethodId: string
  ): Promise<{
    success: boolean;
    paymentIntentId?: string;
    error?: string;
  }> {
    try {
      const invoice = this.invoices.get(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status !== 'open') {
        throw new Error('Invoice is not open for payment');
      }

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(invoice.total * 100), // Convert to cents
        currency: invoice.currency.toLowerCase(),
        payment_method: paymentMethodId,
        confirm: true,
        return_url: `${process.env.FRONTEND_URL}/billing/payment-success`,
        metadata: {
          invoiceId,
          organizationId: invoice.organizationId,
        },
      });

      if (paymentIntent.status === 'succeeded') {
        invoice.status = 'paid';
        invoice.amountPaid = invoice.total;
        invoice.amountDue = 0;
        invoice.paidAt = new Date();
        invoice.updatedAt = new Date();

        logger.info('Payment processed successfully', {
          invoiceId,
          paymentIntentId: paymentIntent.id,
          amount: invoice.total,
        });

        return {
          success: true,
          paymentIntentId: paymentIntent.id,
        };
      } else {
        return {
          success: false,
          error: `Payment status: ${paymentIntent.status}`,
        };
      }
    } catch (error) {
      logger.error('Error processing payment', {
        error: error instanceof Error ? error.message : String(error),
        invoiceId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment processing failed',
      };
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    billingPlans: number;
    invoices: number;
    stripeConnected: boolean;
    processingActive: boolean;
  }> {
    try {
      // Test Stripe connection
      let stripeConnected = false;
      try {
        await this.stripe.accounts.retrieve();
        stripeConnected = true;
      } catch (error) {
        // Stripe connection failed
      }

      return {
        status: stripeConnected ? 'healthy' : 'degraded',
        billingPlans: this.billingPlans.size,
        invoices: this.invoices.size,
        stripeConnected,
        processingActive: !!this.processingInterval,
      };
    } catch (error) {
      logger.error('Billing service health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        status: 'unhealthy',
        billingPlans: 0,
        invoices: 0,
        stripeConnected: false,
        processingActive: false,
      };
    }
  }

  /**
   * Shutdown the service
   */
  public async shutdown(): Promise<void> {
    try {
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
      }

      logger.info('Billing Service shut down');
    } catch (error) {
      logger.error('Error shutting down Billing Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Private helper methods
  private async loadBillingPlans(): Promise<void> {
    const plans: BillingPlan[] = [
      {
        id: 'free',
        name: 'Free',
        description: 'Perfect for getting started',
        type: 'free',
        pricing: {
          basePrice: 0,
          currency: 'USD',
          billingCycle: 'monthly',
          usageBased: false,
          freeAllowances: {
            messages: 1000,
            aiRequests: 100,
            storage: 1,
            users: 3,
          },
          overageRates: {
            perMessage: 0.01,
            perAiRequest: 0.05,
            perGbStorage: 5.00,
            perUser: 10.00,
          },
        },
        features: {
          maxIntegrations: 2,
          customBranding: false,
          prioritySupport: false,
          sla: 'Best effort',
          apiAccess: true,
          webhooks: false,
          analytics: true,
          customModels: false,
        },
        limits: {
          maxOrganizations: 1,
          maxUsers: 3,
          maxMessages: 1000,
          maxStorage: 1,
          rateLimits: {
            apiCallsPerMinute: 60,
            messagesPerHour: 100,
          },
        },
      },
      {
        id: 'professional',
        name: 'Professional',
        description: 'For growing businesses',
        type: 'professional',
        pricing: {
          basePrice: 99,
          currency: 'USD',
          billingCycle: 'monthly',
          usageBased: true,
          freeAllowances: {
            messages: 10000,
            aiRequests: 1000,
            storage: 10,
            users: 10,
          },
          overageRates: {
            perMessage: 0.005,
            perAiRequest: 0.03,
            perGbStorage: 3.00,
            perUser: 8.00,
          },
        },
        features: {
          maxIntegrations: 10,
          customBranding: true,
          prioritySupport: true,
          sla: '99.9% uptime',
          apiAccess: true,
          webhooks: true,
          analytics: true,
          customModels: true,
        },
        limits: {
          maxOrganizations: 5,
          maxUsers: 50,
          maxMessages: 50000,
          maxStorage: 100,
          rateLimits: {
            apiCallsPerMinute: 300,
            messagesPerHour: 1000,
          },
        },
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'For large organizations',
        type: 'enterprise',
        pricing: {
          basePrice: 499,
          currency: 'USD',
          billingCycle: 'monthly',
          usageBased: true,
          freeAllowances: {
            messages: 100000,
            aiRequests: 10000,
            storage: 100,
            users: 100,
          },
          overageRates: {
            perMessage: 0.003,
            perAiRequest: 0.02,
            perGbStorage: 2.00,
            perUser: 5.00,
          },
        },
        features: {
          maxIntegrations: -1, // unlimited
          customBranding: true,
          prioritySupport: true,
          sla: '99.99% uptime',
          apiAccess: true,
          webhooks: true,
          analytics: true,
          customModels: true,
        },
        limits: {
          maxOrganizations: -1, // unlimited
          maxUsers: -1, // unlimited
          maxMessages: -1, // unlimited
          maxStorage: -1, // unlimited
          rateLimits: {
            apiCallsPerMinute: 1000,
            messagesPerHour: 10000,
          },
        },
      },
    ];

    plans.forEach(plan => {
      this.billingPlans.set(plan.id, plan);
    });
  }

  private startBillingProcessor(): void {
    // Process billing tasks every hour
    this.processingInterval = setInterval(async () => {
      try {
        await this.processBillingTasks();
      } catch (error) {
        logger.error('Error in billing processor', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  private async processBillingTasks(): Promise<void> {
    // Process overdue invoices
    const overdueInvoices = Array.from(this.invoices.values())
      .filter(invoice => 
        invoice.status === 'open' && 
        invoice.dueDate < new Date()
      );

    for (const invoice of overdueInvoices) {
      logger.warn('Invoice overdue', {
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
        dueDate: invoice.dueDate,
        amount: invoice.amountDue,
      });

      // In production, send overdue notifications
      // await this.sendOverdueNotification(invoice);
    }
  }

  private async getOrCreateStripePrice(plan: BillingPlan): Promise<string> {
    try {
      // In production, store price IDs in database
      // For now, create a new price each time (not recommended for production)
      const price = await this.stripe.prices.create({
        unit_amount: Math.round(plan.pricing.basePrice * 100), // Convert to cents
        currency: plan.pricing.currency.toLowerCase(),
        recurring: {
          interval: plan.pricing.billingCycle === 'yearly' ? 'year' : 'month',
        },
        product_data: {
          name: plan.name,
          description: plan.description,
        },
        metadata: {
          planId: plan.id,
        },
      });

      return price.id;
    } catch (error) {
      logger.error('Error creating Stripe price', {
        error: error instanceof Error ? error.message : String(error),
        planId: plan.id,
      });
      throw error;
    }
  }
}
