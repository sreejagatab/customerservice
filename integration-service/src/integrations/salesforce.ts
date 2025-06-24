/**
 * Salesforce Integration
 * CRM platform integration for customer data and case management
 */

import axios, { AxiosInstance } from 'axios';
import { BaseIntegration } from './base';
import { logger } from '@/utils/logger';
import { 
  IntegrationConfig, 
  IntegrationStatus,
  CustomerData,
  CaseData 
} from '@universal-ai-cs/shared';

export interface SalesforceConfig extends IntegrationConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  securityToken: string;
  apiVersion: string;
}

export interface SalesforceContact {
  Id: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Phone: string;
  MobilePhone: string;
  AccountId: string;
  CreatedDate: string;
  LastModifiedDate: string;
  Description: string;
}

export interface SalesforceCase {
  Id: string;
  CaseNumber: string;
  ContactId: string;
  AccountId: string;
  Subject: string;
  Description: string;
  Status: string;
  Priority: string;
  Origin: string;
  Type: string;
  CreatedDate: string;
  LastModifiedDate: string;
  ClosedDate: string;
  OwnerId: string;
}

export interface SalesforceAccount {
  Id: string;
  Name: string;
  Type: string;
  Industry: string;
  Phone: string;
  Website: string;
  BillingAddress: any;
  ShippingAddress: any;
  CreatedDate: string;
  LastModifiedDate: string;
}

export class SalesforceIntegration extends BaseIntegration {
  private client: AxiosInstance;
  private config: SalesforceConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: SalesforceConfig) {
    super(config);
    this.config = config;
    
    this.client = axios.create({
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  /**
   * Authenticate with Salesforce
   */
  private async authenticate(): Promise<void> {
    try {
      const response = await axios.post(`${this.config.instanceUrl}/services/oauth2/token`, 
        new URLSearchParams({
          grant_type: 'password',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          username: this.config.username,
          password: this.config.password + this.config.securityToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      
      // Update client defaults
      this.client.defaults.baseURL = `${this.config.instanceUrl}/services/data/v${this.config.apiVersion}`;
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
      
      logger.info('Salesforce authentication successful');
    } catch (error: any) {
      logger.error('Salesforce authentication failed', { error: error.message });
      throw new Error(`Salesforce authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Ensure valid authentication
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiresAt || this.tokenExpiresAt <= new Date()) {
      await this.authenticate();
    }
  }

  /**
   * Test connection to Salesforce
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureAuthenticated();
      
      const response = await this.client.get('/sobjects/');
      
      if (response.status === 200 && response.data.sobjects) {
        logger.info('Salesforce connection test successful');
        return { success: true };
      }
      
      return { success: false, error: 'Invalid response from Salesforce API' };
    } catch (error: any) {
      logger.error('Salesforce connection test failed', { error: error.message });
      return { 
        success: false, 
        error: error.response?.data?.[0]?.message || error.message 
      };
    }
  }

  /**
   * Search contacts by email
   */
  async searchContacts(email: string): Promise<CustomerData[]> {
    try {
      await this.ensureAuthenticated();
      
      const query = `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, AccountId, CreatedDate, LastModifiedDate, Description FROM Contact WHERE Email = '${email}'`;
      const response = await this.client.get(`/query/?q=${encodeURIComponent(query)}`);
      
      const contacts = response.data.records as SalesforceContact[];
      return contacts.map(contact => this.mapSalesforceContact(contact));
    } catch (error: any) {
      logger.error('Failed to search Salesforce contacts', { email, error: error.message });
      return [];
    }
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId: string): Promise<CustomerData | null> {
    try {
      await this.ensureAuthenticated();
      
      const response = await this.client.get(`/sobjects/Contact/${contactId}`);
      const contact = response.data as SalesforceContact;
      
      return this.mapSalesforceContact(contact);
    } catch (error: any) {
      logger.error('Failed to get Salesforce contact', { contactId, error: error.message });
      return null;
    }
  }

  /**
   * Create new contact
   */
  async createContact(customerData: Partial<CustomerData>): Promise<string | null> {
    try {
      await this.ensureAuthenticated();
      
      const [firstName, ...lastNameParts] = (customerData.name || '').split(' ');
      const lastName = lastNameParts.join(' ') || firstName;
      
      const contactData = {
        FirstName: firstName,
        LastName: lastName,
        Email: customerData.email,
        Phone: customerData.phone,
        Description: `Created from Universal AI CS - ${new Date().toISOString()}`,
      };

      const response = await this.client.post('/sobjects/Contact/', contactData);
      
      if (response.data.success) {
        logger.info('Salesforce contact created', { contactId: response.data.id });
        return response.data.id;
      }
      
      return null;
    } catch (error: any) {
      logger.error('Failed to create Salesforce contact', { error: error.message });
      return null;
    }
  }

  /**
   * Get cases for contact
   */
  async getContactCases(contactId: string, limit = 50): Promise<CaseData[]> {
    try {
      await this.ensureAuthenticated();
      
      const query = `SELECT Id, CaseNumber, ContactId, AccountId, Subject, Description, Status, Priority, Origin, Type, CreatedDate, LastModifiedDate, ClosedDate, OwnerId FROM Case WHERE ContactId = '${contactId}' ORDER BY CreatedDate DESC LIMIT ${limit}`;
      const response = await this.client.get(`/query/?q=${encodeURIComponent(query)}`);
      
      const cases = response.data.records as SalesforceCase[];
      return cases.map(caseRecord => this.mapSalesforceCase(caseRecord));
    } catch (error: any) {
      logger.error('Failed to get contact cases', { contactId, error: error.message });
      return [];
    }
  }

  /**
   * Create new case
   */
  async createCase(caseData: {
    contactId?: string;
    subject: string;
    description: string;
    priority?: string;
    origin?: string;
    type?: string;
  }): Promise<string | null> {
    try {
      await this.ensureAuthenticated();
      
      const salesforceCaseData = {
        ContactId: caseData.contactId,
        Subject: caseData.subject,
        Description: caseData.description,
        Priority: caseData.priority || 'Medium',
        Origin: caseData.origin || 'Web',
        Type: caseData.type || 'Question',
        Status: 'New',
      };

      const response = await this.client.post('/sobjects/Case/', salesforceCaseData);
      
      if (response.data.success) {
        logger.info('Salesforce case created', { caseId: response.data.id });
        return response.data.id;
      }
      
      return null;
    } catch (error: any) {
      logger.error('Failed to create Salesforce case', { error: error.message });
      return null;
    }
  }

  /**
   * Update case
   */
  async updateCase(caseId: string, updates: Partial<{
    subject: string;
    description: string;
    status: string;
    priority: string;
  }>): Promise<boolean> {
    try {
      await this.ensureAuthenticated();
      
      const updateData: any = {};
      if (updates.subject) updateData.Subject = updates.subject;
      if (updates.description) updateData.Description = updates.description;
      if (updates.status) updateData.Status = updates.status;
      if (updates.priority) updateData.Priority = updates.priority;

      await this.client.patch(`/sobjects/Case/${caseId}`, updateData);
      
      logger.info('Salesforce case updated', { caseId });
      return true;
    } catch (error: any) {
      logger.error('Failed to update Salesforce case', { caseId, error: error.message });
      return false;
    }
  }

  /**
   * Add case comment
   */
  async addCaseComment(caseId: string, comment: string, isPublic = true): Promise<boolean> {
    try {
      await this.ensureAuthenticated();
      
      const commentData = {
        ParentId: caseId,
        CommentBody: comment,
        IsPublished: isPublic,
      };

      await this.client.post('/sobjects/CaseComment/', commentData);
      
      logger.info('Salesforce case comment added', { caseId });
      return true;
    } catch (error: any) {
      logger.error('Failed to add Salesforce case comment', { caseId, error: error.message });
      return false;
    }
  }

  /**
   * Get account information
   */
  async getAccount(accountId: string): Promise<any> {
    try {
      await this.ensureAuthenticated();
      
      const response = await this.client.get(`/sobjects/Account/${accountId}`);
      return response.data as SalesforceAccount;
    } catch (error: any) {
      logger.error('Failed to get Salesforce account', { accountId, error: error.message });
      return null;
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
        logger.debug('Salesforce API request', {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error) => {
        logger.error('Salesforce API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Salesforce API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('Salesforce API response error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.response?.data || error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  private mapSalesforceContact(contact: SalesforceContact): CustomerData {
    return {
      id: contact.Id,
      email: contact.Email,
      name: `${contact.FirstName || ''} ${contact.LastName || ''}`.trim(),
      phone: contact.Phone || contact.MobilePhone,
      createdAt: new Date(contact.CreatedDate),
      updatedAt: new Date(contact.LastModifiedDate),
      metadata: {
        accountId: contact.AccountId,
        description: contact.Description,
        salesforceId: contact.Id,
      },
      source: 'salesforce',
    };
  }

  private mapSalesforceCase(caseRecord: SalesforceCase): CaseData {
    return {
      id: caseRecord.Id,
      caseNumber: caseRecord.CaseNumber,
      contactId: caseRecord.ContactId,
      accountId: caseRecord.AccountId,
      subject: caseRecord.Subject,
      description: caseRecord.Description,
      status: caseRecord.Status,
      priority: caseRecord.Priority,
      origin: caseRecord.Origin,
      type: caseRecord.Type,
      createdAt: new Date(caseRecord.CreatedDate),
      updatedAt: new Date(caseRecord.LastModifiedDate),
      closedAt: caseRecord.ClosedDate ? new Date(caseRecord.ClosedDate) : undefined,
      ownerId: caseRecord.OwnerId,
      source: 'salesforce',
    };
  }
}
