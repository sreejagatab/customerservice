/**
 * Integration-specific types for various platforms and services
 */

// Base integration interface
export interface BaseIntegrationConfig {
  name: string;
  type: string;
  provider: string;
  version: string;
  description?: string;
  iconUrl?: string;
  documentationUrl?: string;
  supportedFeatures: IntegrationFeature[];
  rateLimits: RateLimitConfig;
  webhookSupport: boolean;
  authMethods: AuthMethod[];
}

export enum IntegrationFeature {
  READ_MESSAGES = 'read_messages',
  SEND_MESSAGES = 'send_messages',
  CREATE_LABELS = 'create_labels',
  MANAGE_CONTACTS = 'manage_contacts',
  FILE_ATTACHMENTS = 'file_attachments',
  REAL_TIME_SYNC = 'real_time_sync',
  BATCH_OPERATIONS = 'batch_operations',
  CUSTOM_FIELDS = 'custom_fields',
  WEBHOOKS = 'webhooks',
  OAUTH2 = 'oauth2',
}

export enum AuthMethod {
  OAUTH2 = 'oauth2',
  API_KEY = 'api_key',
  BASIC_AUTH = 'basic_auth',
  JWT = 'jwt',
  CUSTOM = 'custom',
}

export interface RateLimitConfig {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  burstLimit?: number;
  quotaReset?: 'rolling' | 'fixed';
}

// Email integrations
export interface EmailIntegrationConfig extends BaseIntegrationConfig {
  type: 'email';
  emailSettings: {
    imapHost?: string;
    imapPort?: number;
    smtpHost?: string;
    smtpPort?: number;
    useSSL: boolean;
    useTLS: boolean;
    maxAttachmentSize: number; // in MB
    supportedFormats: string[];
    autoLabeling: boolean;
    folderMapping: Record<string, string>;
  };
}

// Gmail specific
export interface GmailConfig extends EmailIntegrationConfig {
  provider: 'gmail';
  gmailSettings: {
    scopes: string[];
    labelPrefix?: string;
    watchTopic?: string;
    historyId?: string;
    maxResults: number;
    includeSpamTrash: boolean;
  };
}

// Outlook specific
export interface OutlookConfig extends EmailIntegrationConfig {
  provider: 'outlook';
  outlookSettings: {
    scopes: string[];
    folderIds: string[];
    deltaToken?: string;
    maxPageSize: number;
    includeDeleted: boolean;
  };
}

// Chat integrations
export interface ChatIntegrationConfig extends BaseIntegrationConfig {
  type: 'chat';
  chatSettings: {
    maxMessageLength: number;
    supportedMessageTypes: MessageType[];
    fileUploadSupport: boolean;
    maxFileSize: number; // in MB
    supportedFileTypes: string[];
    typingIndicator: boolean;
    readReceipts: boolean;
    groupChatSupport: boolean;
  };
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker',
  TEMPLATE = 'template',
}

// WhatsApp specific
export interface WhatsAppConfig extends ChatIntegrationConfig {
  provider: 'whatsapp';
  whatsappSettings: {
    phoneNumberId: string;
    businessAccountId: string;
    webhookVerifyToken: string;
    templateNamespace?: string;
    supportedTemplates: WhatsAppTemplate[];
  };
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    parameters?: Array<{
      type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
      text?: string;
    }>;
  }>;
}

// Slack specific
export interface SlackConfig extends ChatIntegrationConfig {
  provider: 'slack';
  slackSettings: {
    botToken: string;
    signingSecret: string;
    appId: string;
    teamId: string;
    channels: string[];
    userGroups: string[];
    eventSubscriptions: string[];
  };
}

// Social media integrations
export interface SocialIntegrationConfig extends BaseIntegrationConfig {
  type: 'social';
  socialSettings: {
    platforms: SocialPlatform[];
    autoReply: boolean;
    mentionTracking: boolean;
    hashtagTracking: string[];
    sentimentFiltering: boolean;
    languageFiltering: string[];
  };
}

export enum SocialPlatform {
  TWITTER = 'twitter',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
}

// E-commerce integrations
export interface EcommerceIntegrationConfig extends BaseIntegrationConfig {
  type: 'ecommerce';
  ecommerceSettings: {
    storeUrl: string;
    currency: string;
    orderStatuses: string[];
    productSync: boolean;
    customerSync: boolean;
    inventoryTracking: boolean;
    webhookEvents: EcommerceWebhookEvent[];
  };
}

export enum EcommerceWebhookEvent {
  ORDER_CREATED = 'order_created',
  ORDER_UPDATED = 'order_updated',
  ORDER_CANCELLED = 'order_cancelled',
  PAYMENT_RECEIVED = 'payment_received',
  REFUND_CREATED = 'refund_created',
  CUSTOMER_CREATED = 'customer_created',
  PRODUCT_UPDATED = 'product_updated',
}

// Shopify specific
export interface ShopifyConfig extends EcommerceIntegrationConfig {
  provider: 'shopify';
  shopifySettings: {
    shopDomain: string;
    apiVersion: string;
    scopes: string[];
    webhookEndpoint: string;
    fulfillmentServices: string[];
  };
}

// CRM integrations
export interface CrmIntegrationConfig extends BaseIntegrationConfig {
  type: 'crm';
  crmSettings: {
    objectTypes: CrmObjectType[];
    fieldMapping: Record<string, string>;
    syncDirection: 'bidirectional' | 'inbound' | 'outbound';
    duplicateHandling: 'merge' | 'skip' | 'create';
    customFields: CrmCustomField[];
  };
}

export enum CrmObjectType {
  CONTACT = 'contact',
  LEAD = 'lead',
  ACCOUNT = 'account',
  OPPORTUNITY = 'opportunity',
  CASE = 'case',
  TASK = 'task',
  NOTE = 'note',
}

export interface CrmCustomField {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'picklist' | 'textarea';
  required: boolean;
  options?: string[];
  defaultValue?: any;
}

// Salesforce specific
export interface SalesforceConfig extends CrmIntegrationConfig {
  provider: 'salesforce';
  salesforceSettings: {
    instanceUrl: string;
    apiVersion: string;
    sandbox: boolean;
    loginUrl: string;
    customObjects: string[];
    triggers: SalesforceTrigger[];
  };
}

export interface SalesforceTrigger {
  objectType: string;
  events: ('insert' | 'update' | 'delete')[];
  conditions?: Record<string, any>;
}

// Helpdesk integrations
export interface HelpdeskIntegrationConfig extends BaseIntegrationConfig {
  type: 'helpdesk';
  helpdeskSettings: {
    ticketStatuses: string[];
    priorities: string[];
    categories: string[];
    customFields: HelpdeskCustomField[];
    slaSettings: SlaSettings;
    automationRules: AutomationRule[];
  };
}

export interface HelpdeskCustomField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'textarea';
  required: boolean;
  options?: string[];
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

export interface SlaSettings {
  responseTime: {
    low: number;
    normal: number;
    high: number;
    urgent: number;
  };
  resolutionTime: {
    low: number;
    normal: number;
    high: number;
    urgent: number;
  };
  businessHours: {
    timezone: string;
    workdays: number[];
    startTime: string;
    endTime: string;
    holidays: Date[];
  };
}

export interface AutomationRule {
  id: string;
  name: string;
  conditions: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than';
    value: any;
  }>;
  actions: Array<{
    type: 'assign' | 'set_status' | 'set_priority' | 'add_tag' | 'send_email' | 'create_task';
    parameters: Record<string, any>;
  }>;
  active: boolean;
}

// Custom integration
export interface CustomIntegrationConfig extends BaseIntegrationConfig {
  type: 'custom';
  customSettings: {
    baseUrl: string;
    endpoints: CustomEndpoint[];
    authentication: CustomAuth;
    dataMapping: CustomDataMapping;
    webhookConfig?: CustomWebhookConfig;
  };
}

export interface CustomEndpoint {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: string;
  responseMapping: Record<string, string>;
  rateLimitKey?: string;
}

export interface CustomAuth {
  type: AuthMethod;
  config: Record<string, any>;
  tokenRefresh?: {
    endpoint: string;
    method: string;
    bodyTemplate: string;
    tokenPath: string;
  };
}

export interface CustomDataMapping {
  inbound: Record<string, string>;
  outbound: Record<string, string>;
  transformations?: Array<{
    field: string;
    type: 'date' | 'number' | 'boolean' | 'string' | 'array' | 'object';
    format?: string;
    defaultValue?: any;
  }>;
}

export interface CustomWebhookConfig {
  endpoint: string;
  events: string[];
  signatureHeader?: string;
  signatureAlgorithm?: 'sha1' | 'sha256' | 'md5';
  retryPolicy: {
    maxAttempts: number;
    backoffMultiplier: number;
    maxBackoffSeconds: number;
  };
}
