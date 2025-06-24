import { BaseEntity, Status, Priority, UserRole } from './common';

/**
 * Core entity types for the Universal AI Customer Service Platform
 */

// Organization entity
export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  plan: SubscriptionPlan;
  settings: OrganizationSettings;
  status: Status;
  billingInfo?: BillingInfo;
  limits: OrganizationLimits;
}

export interface OrganizationSettings {
  timezone: string;
  language: string;
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    customCss?: string;
  };
  notifications: {
    email: boolean;
    slack: boolean;
    webhook: boolean;
  };
  security: {
    mfaRequired: boolean;
    sessionTimeout: number;
    ipWhitelist?: string[];
  };
}

export interface OrganizationLimits {
  maxUsers: number;
  maxIntegrations: number;
  maxMessagesPerMonth: number;
  maxAiRequestsPerMonth: number;
  maxWorkflows: number;
  storageLimit: number; // in MB
}

export enum SubscriptionPlan {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
  ENTERPRISE_PLUS = 'enterprise_plus',
}

export interface BillingInfo {
  customerId: string;
  subscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid';
  paymentMethod?: {
    type: 'card' | 'bank_account';
    last4: string;
    brand?: string;
  };
}

// User entity
export interface User extends BaseEntity {
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: UserRole;
  permissions: string[];
  status: Status;
  lastLoginAt?: Date;
  preferences: UserPreferences;
  mfaEnabled: boolean;
  mfaSecret?: string;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    browser: boolean;
    mobile: boolean;
  };
  dashboard: {
    layout: 'grid' | 'list';
    widgets: string[];
  };
}

// Integration entity
export interface Integration extends BaseEntity {
  organizationId: string;
  name: string;
  type: IntegrationType;
  provider: string;
  config: IntegrationConfig;
  credentials: IntegrationCredentials;
  status: IntegrationStatus;
  lastSyncAt?: Date;
  syncStatus?: SyncStatus;
  webhookUrl?: string;
  rateLimits?: RateLimitSettings;
  errorCount: number;
  lastErrorAt?: Date;
  lastError?: string;
}

export enum IntegrationType {
  EMAIL = 'email',
  CHAT = 'chat',
  SMS = 'sms',
  SOCIAL = 'social',
  ECOMMERCE = 'ecommerce',
  CRM = 'crm',
  HELPDESK = 'helpdesk',
  CUSTOM = 'custom',
}

export enum IntegrationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  CONFIGURING = 'configuring',
  TESTING = 'testing',
}

export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  SUCCESS = 'success',
  ERROR = 'error',
  PARTIAL = 'partial',
}

export interface IntegrationConfig {
  autoSync: boolean;
  syncInterval: number; // in minutes
  batchSize: number;
  retryAttempts: number;
  timeout: number; // in seconds
  fieldMapping: Record<string, string>;
  filters?: IntegrationFilters;
  customSettings?: Record<string, any>;
}

export interface IntegrationCredentials {
  type: 'oauth2' | 'api_key' | 'basic_auth' | 'custom';
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  customFields?: Record<string, string>;
  expiresAt?: Date;
}

export interface IntegrationFilters {
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  senders?: string[];
  subjects?: string[];
  labels?: string[];
  customFilters?: Record<string, any>;
}

export interface RateLimitSettings {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

// Conversation entity
export interface Conversation extends BaseEntity {
  organizationId: string;
  integrationId: string;
  externalId?: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  subject?: string;
  status: ConversationStatus;
  priority: Priority;
  assignedTo?: string;
  tags: string[];
  metadata: ConversationMetadata;
  aiSummary?: string;
  sentiment?: SentimentAnalysis;
  lastMessageAt: Date;
  responseTime?: number; // in seconds
  resolutionTime?: number; // in seconds
  satisfactionRating?: number; // 1-5
  satisfactionFeedback?: string;
}

export enum ConversationStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING_FOR_CUSTOMER = 'waiting_for_customer',
  WAITING_FOR_AGENT = 'waiting_for_agent',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  SPAM = 'spam',
}

export interface ConversationMetadata {
  source: string;
  channel: string;
  customerTier?: string;
  orderNumber?: string;
  productId?: string;
  customFields?: Record<string, any>;
}

export interface SentimentAnalysis {
  score: number; // -1 to 1
  label: 'negative' | 'neutral' | 'positive';
  confidence: number; // 0 to 1
  emotions?: {
    anger: number;
    fear: number;
    joy: number;
    sadness: number;
    surprise: number;
  };
}

// Message entity
export interface Message extends BaseEntity {
  conversationId: string;
  externalId?: string;
  direction: MessageDirection;
  content: MessageContent;
  sender: MessageSender;
  recipient?: MessageRecipient;
  status: MessageStatus;
  aiClassification?: AiClassification;
  aiResponse?: AiResponse;
  attachments: MessageAttachment[];
  metadata: MessageMetadata;
  processedAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  SPAM = 'spam',
}

export interface MessageContent {
  text: string;
  html?: string;
  format: 'text' | 'html' | 'markdown';
  language?: string;
  encoding?: string;
}

export interface MessageSender {
  email?: string;
  name?: string;
  phone?: string;
  userId?: string;
  type: 'customer' | 'agent' | 'system' | 'ai';
}

export interface MessageRecipient {
  email?: string;
  name?: string;
  phone?: string;
  userId?: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

export interface MessageMetadata {
  headers?: Record<string, string>;
  threadId?: string;
  references?: string[];
  inReplyTo?: string;
  customFields?: Record<string, any>;
}

export interface AiClassification {
  category: string;
  subcategory?: string;
  intent: string;
  confidence: number;
  urgency: Priority;
  sentiment: SentimentAnalysis;
  language: string;
  topics: string[];
  entities: NamedEntity[];
  processingTime: number; // in milliseconds
  modelUsed: string;
}

export interface AiResponse {
  content: string;
  confidence: number;
  reasoning?: string;
  suggestedActions: string[];
  requiresHumanReview: boolean;
  processingTime: number; // in milliseconds
  modelUsed: string;
  tokensUsed: number;
  cost: number;
}

export interface NamedEntity {
  text: string;
  label: string;
  confidence: number;
  start: number;
  end: number;
}
