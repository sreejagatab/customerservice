/**
 * Shopify Integration
 * E-commerce platform integration for order management and customer support
 */

import axios, { AxiosInstance } from 'axios';
import { BaseIntegration } from './base';
import { logger } from '@/utils/logger';
import { 
  IntegrationConfig, 
  IntegrationStatus,
  WebhookEvent,
  CustomerData,
  OrderData,
  ProductData 
} from '@universal-ai-cs/shared';

export interface ShopifyConfig extends IntegrationConfig {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  webhookSecret: string;
  enabledWebhooks: string[];
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
  updated_at: string;
  orders_count: number;
  total_spent: string;
  tags: string;
  addresses: any[];
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string;
  line_items: any[];
  shipping_address: any;
  billing_address: any;
  customer: ShopifyCustomer;
}

export class ShopifyIntegration extends BaseIntegration {
  private client: AxiosInstance;
  private config: ShopifyConfig;

  constructor(config: ShopifyConfig) {
    super(config);
    this.config = config;
    
    this.client = axios.create({
      baseURL: `https://${config.shopDomain}.myshopify.com/admin/api/${config.apiVersion}`,
      headers: {
        'X-Shopify-Access-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  /**
   * Test connection to Shopify
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.client.get('/shop.json');
      
      if (response.status === 200 && response.data.shop) {
        logger.info('Shopify connection test successful', {
          shop: response.data.shop.name,
          domain: response.data.shop.domain,
        });
        
        return { success: true };
      }
      
      return { success: false, error: 'Invalid response from Shopify API' };
    } catch (error: any) {
      logger.error('Shopify connection test failed', { error: error.message });
      return { 
        success: false, 
        error: error.response?.data?.errors || error.message 
      };
    }
  }

  /**
   * Get customer information
   */
  async getCustomer(customerId: string): Promise<CustomerData | null> {
    try {
      const response = await this.client.get(`/customers/${customerId}.json`);
      const customer = response.data.customer as ShopifyCustomer;
      
      return this.mapShopifyCustomer(customer);
    } catch (error: any) {
      logger.error('Failed to get Shopify customer', { customerId, error: error.message });
      return null;
    }
  }

  /**
   * Search customers by email
   */
  async searchCustomers(email: string): Promise<CustomerData[]> {
    try {
      const response = await this.client.get('/customers/search.json', {
        params: { query: `email:${email}` },
      });
      
      const customers = response.data.customers as ShopifyCustomer[];
      return customers.map(customer => this.mapShopifyCustomer(customer));
    } catch (error: any) {
      logger.error('Failed to search Shopify customers', { email, error: error.message });
      return [];
    }
  }

  /**
   * Get customer orders
   */
  async getCustomerOrders(customerId: string, limit = 50): Promise<OrderData[]> {
    try {
      const response = await this.client.get(`/customers/${customerId}/orders.json`, {
        params: { limit, status: 'any' },
      });
      
      const orders = response.data.orders as ShopifyOrder[];
      return orders.map(order => this.mapShopifyOrder(order));
    } catch (error: any) {
      logger.error('Failed to get customer orders', { customerId, error: error.message });
      return [];
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string): Promise<OrderData | null> {
    try {
      const response = await this.client.get(`/orders/${orderId}.json`);
      const order = response.data.order as ShopifyOrder;
      
      return this.mapShopifyOrder(order);
    } catch (error: any) {
      logger.error('Failed to get Shopify order', { orderId, error: error.message });
      return null;
    }
  }

  /**
   * Create customer note
   */
  async createCustomerNote(customerId: string, note: string): Promise<boolean> {
    try {
      await this.client.put(`/customers/${customerId}.json`, {
        customer: {
          id: parseInt(customerId),
          note: note,
        },
      });
      
      return true;
    } catch (error: any) {
      logger.error('Failed to create customer note', { customerId, error: error.message });
      return false;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event: WebhookEvent): Promise<void> {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(event.headers, event.body)) {
        throw new Error('Invalid webhook signature');
      }

      const eventType = event.headers['x-shopify-topic'];
      const data = JSON.parse(event.body);

      logger.info('Processing Shopify webhook', { eventType, id: data.id });

      switch (eventType) {
        case 'orders/create':
          await this.handleOrderCreated(data);
          break;
        case 'orders/updated':
          await this.handleOrderUpdated(data);
          break;
        case 'orders/cancelled':
          await this.handleOrderCancelled(data);
          break;
        case 'customers/create':
          await this.handleCustomerCreated(data);
          break;
        case 'customers/update':
          await this.handleCustomerUpdated(data);
          break;
        default:
          logger.warn('Unhandled Shopify webhook event', { eventType });
      }
    } catch (error: any) {
      logger.error('Failed to handle Shopify webhook', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup webhooks
   */
  async setupWebhooks(webhookUrl: string): Promise<boolean> {
    try {
      const webhookTopics = [
        'orders/create',
        'orders/updated',
        'orders/cancelled',
        'customers/create',
        'customers/update',
      ];

      for (const topic of webhookTopics) {
        if (this.config.enabledWebhooks.includes(topic)) {
          await this.createWebhook(topic, webhookUrl);
        }
      }

      return true;
    } catch (error: any) {
      logger.error('Failed to setup Shopify webhooks', { error: error.message });
      return false;
    }
  }

  /**
   * Get integration health status
   */
  async getHealthStatus(): Promise<IntegrationStatus> {
    try {
      const testResult = await this.testConnection();
      
      if (testResult.success) {
        return {
          status: 'healthy',
          lastChecked: new Date(),
          details: 'Connection successful',
        };
      } else {
        return {
          status: 'error',
          lastChecked: new Date(),
          details: testResult.error || 'Connection failed',
        };
      }
    } catch (error: any) {
      return {
        status: 'error',
        lastChecked: new Date(),
        details: error.message,
      };
    }
  }

  // Private helper methods
  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Shopify API request', {
          method: config.method,
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        logger.error('Shopify API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Shopify API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('Shopify API response error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.response?.data || error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  private mapShopifyCustomer(customer: ShopifyCustomer): CustomerData {
    return {
      id: customer.id.toString(),
      email: customer.email,
      name: `${customer.first_name} ${customer.last_name}`.trim(),
      phone: customer.phone,
      createdAt: new Date(customer.created_at),
      updatedAt: new Date(customer.updated_at),
      metadata: {
        ordersCount: customer.orders_count,
        totalSpent: customer.total_spent,
        tags: customer.tags,
        addresses: customer.addresses,
      },
      source: 'shopify',
    };
  }

  private mapShopifyOrder(order: ShopifyOrder): OrderData {
    return {
      id: order.id.toString(),
      orderNumber: order.order_number.toString(),
      customerId: order.customer?.id?.toString(),
      customerEmail: order.email,
      status: order.financial_status,
      fulfillmentStatus: order.fulfillment_status,
      totalAmount: parseFloat(order.total_price),
      currency: order.currency,
      createdAt: new Date(order.created_at),
      updatedAt: new Date(order.updated_at),
      items: order.line_items.map(item => ({
        id: item.id.toString(),
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.price),
        sku: item.sku,
      })),
      shippingAddress: order.shipping_address,
      billingAddress: order.billing_address,
      metadata: {
        subtotalPrice: order.subtotal_price,
        totalTax: order.total_tax,
      },
      source: 'shopify',
    };
  }

  private async createWebhook(topic: string, address: string): Promise<void> {
    try {
      await this.client.post('/webhooks.json', {
        webhook: {
          topic,
          address,
          format: 'json',
        },
      });
      
      logger.info('Shopify webhook created', { topic, address });
    } catch (error: any) {
      if (error.response?.status === 422) {
        // Webhook might already exist
        logger.warn('Shopify webhook already exists', { topic });
      } else {
        throw error;
      }
    }
  }

  private verifyWebhookSignature(headers: Record<string, string>, body: string): boolean {
    const signature = headers['x-shopify-hmac-sha256'];
    if (!signature || !this.config.webhookSecret) {
      return false;
    }

    const crypto = require('crypto');
    const calculatedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(body, 'utf8')
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  }

  private async handleOrderCreated(order: ShopifyOrder): Promise<void> {
    // Emit event for order creation
    this.emit('order.created', this.mapShopifyOrder(order));
  }

  private async handleOrderUpdated(order: ShopifyOrder): Promise<void> {
    // Emit event for order update
    this.emit('order.updated', this.mapShopifyOrder(order));
  }

  private async handleOrderCancelled(order: ShopifyOrder): Promise<void> {
    // Emit event for order cancellation
    this.emit('order.cancelled', this.mapShopifyOrder(order));
  }

  private async handleCustomerCreated(customer: ShopifyCustomer): Promise<void> {
    // Emit event for customer creation
    this.emit('customer.created', this.mapShopifyCustomer(customer));
  }

  private async handleCustomerUpdated(customer: ShopifyCustomer): Promise<void> {
    // Emit event for customer update
    this.emit('customer.updated', this.mapShopifyCustomer(customer));
  }
}
