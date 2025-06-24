import { 
  Organization, 
  User, 
  Integration, 
  Conversation, 
  Message,
  PaginationParams,
  PaginatedResponse,
  ApiResponse 
} from './';

/**
 * API request and response types for all endpoints
 */

// Authentication API types
export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginResponse {
  user: User;
  organization: Organization;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  plan?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ConfirmResetPasswordRequest {
  token: string;
  newPassword: string;
}

// Organization API types
export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  plan: string;
  settings?: Partial<Organization['settings']>;
}

export interface UpdateOrganizationRequest {
  name?: string;
  settings?: Partial<Organization['settings']>;
  limits?: Partial<Organization['limits']>;
}

export interface OrganizationListResponse extends PaginatedResponse<Organization> {}

// User API types
export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions?: string[];
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: string;
  permissions?: string[];
  status?: string;
  preferences?: Partial<User['preferences']>;
}

export interface UserListResponse extends PaginatedResponse<User> {}

export interface UserProfileResponse {
  user: User;
  organization: Organization;
  permissions: string[];
}

// Integration API types
export interface CreateIntegrationRequest {
  name: string;
  type: string;
  provider: string;
  config: Integration['config'];
  credentials: Integration['credentials'];
}

export interface UpdateIntegrationRequest {
  name?: string;
  config?: Partial<Integration['config']>;
  credentials?: Partial<Integration['credentials']>;
  status?: string;
}

export interface IntegrationListResponse extends PaginatedResponse<Integration> {}

export interface IntegrationTestRequest {
  integrationId: string;
  testType: 'connection' | 'authentication' | 'sync' | 'webhook';
}

export interface IntegrationTestResponse {
  success: boolean;
  message: string;
  details?: Record<string, any>;
  responseTime: number;
}

export interface IntegrationSyncRequest {
  integrationId: string;
  fullSync?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface IntegrationSyncResponse {
  syncId: string;
  status: string;
  estimatedDuration: number;
  itemsToSync: number;
}

// Conversation API types
export interface ConversationListRequest extends PaginationParams {
  status?: string;
  priority?: string;
  assignedTo?: string;
  customerEmail?: string;
  integrationId?: string;
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface ConversationListResponse extends PaginatedResponse<Conversation> {}

export interface UpdateConversationRequest {
  status?: string;
  priority?: string;
  assignedTo?: string;
  tags?: string[];
  aiSummary?: string;
  satisfactionRating?: number;
  satisfactionFeedback?: string;
}

export interface ConversationStatsResponse {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  averageResponseTime: number;
  averageResolutionTime: number;
  satisfactionScore: number;
}

// Message API types
export interface MessageListRequest extends PaginationParams {
  conversationId?: string;
  direction?: string;
  status?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface MessageListResponse extends PaginatedResponse<Message> {}

export interface SendMessageRequest {
  conversationId: string;
  content: {
    text: string;
    html?: string;
    format?: string;
  };
  recipient: {
    email?: string;
    phone?: string;
  };
  attachments?: Array<{
    filename: string;
    contentType: string;
    data: string; // base64 encoded
  }>;
  metadata?: Record<string, any>;
}

export interface SendMessageResponse {
  message: Message;
  deliveryStatus: string;
  estimatedDeliveryTime?: number;
}

export interface ProcessMessageRequest {
  messageId: string;
  forceReprocess?: boolean;
  skipAi?: boolean;
}

export interface ProcessMessageResponse {
  message: Message;
  processingTime: number;
  aiClassification?: Message['aiClassification'];
  aiResponse?: Message['aiResponse'];
}

// AI API types
export interface AiClassifyRequest {
  text: string;
  context?: {
    conversationHistory?: string[];
    customerInfo?: Record<string, any>;
    organizationContext?: Record<string, any>;
  };
  options?: {
    includeEntities?: boolean;
    includeSentiment?: boolean;
    includeTopics?: boolean;
  };
}

export interface AiClassifyResponse {
  classification: Message['aiClassification'];
  processingTime: number;
  cost: number;
}

export interface AiGenerateResponseRequest {
  messageText: string;
  conversationContext: {
    history: Array<{
      role: 'customer' | 'agent';
      content: string;
      timestamp: Date;
    }>;
    customerInfo?: Record<string, any>;
    classification?: Message['aiClassification'];
  };
  organizationContext: {
    businessInfo: Record<string, any>;
    policies: Record<string, any>;
    knowledgeBase?: string[];
  };
  options?: {
    tone?: 'professional' | 'friendly' | 'casual';
    length?: 'short' | 'medium' | 'long';
    includeReasoning?: boolean;
  };
}

export interface AiGenerateResponseResponse {
  response: Message['aiResponse'];
  alternatives?: string[];
  processingTime: number;
  cost: number;
}

export interface AiTrainRequest {
  trainingData: Array<{
    input: string;
    expectedOutput: string;
    category?: string;
    metadata?: Record<string, any>;
  }>;
  modelType: 'classification' | 'response_generation' | 'sentiment';
  options?: {
    epochs?: number;
    batchSize?: number;
    learningRate?: number;
  };
}

export interface AiTrainResponse {
  trainingJobId: string;
  status: string;
  estimatedDuration: number;
  datasetSize: number;
}

// Workflow API types
export interface WorkflowListRequest extends PaginationParams {
  status?: string;
  type?: string;
  tags?: string[];
}

export interface WorkflowExecutionRequest {
  workflowId: string;
  triggerData: Record<string, any>;
  context?: Record<string, any>;
}

export interface WorkflowExecutionResponse {
  executionId: string;
  status: string;
  steps: Array<{
    stepId: string;
    status: string;
    output?: any;
    error?: string;
    duration: number;
  }>;
  totalDuration: number;
}

// Analytics API types
export interface AnalyticsRequest {
  metrics: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  groupBy?: 'hour' | 'day' | 'week' | 'month';
  filters?: {
    integrationIds?: string[];
    userIds?: string[];
    conversationStatuses?: string[];
    messagePriorities?: string[];
  };
}

export interface AnalyticsResponse {
  data: Array<{
    timestamp: Date;
    metrics: Record<string, number>;
  }>;
  summary: {
    totalMessages: number;
    totalConversations: number;
    averageResponseTime: number;
    averageResolutionTime: number;
    satisfactionScore: number;
    aiAccuracy: number;
    costSavings: number;
  };
}

// Webhook API types
export interface WebhookListRequest extends PaginationParams {
  integrationId?: string;
  status?: string;
}

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  secret?: string;
  active?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

export interface WebhookDeliveryResponse {
  id: string;
  webhookId: string;
  event: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  response?: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  };
}

// Health check API types
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: Array<{
    name: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime?: number;
    details?: Record<string, any>;
  }>;
  version: string;
  uptime: number;
}

// Generic API types
export type ApiRequest<T = any> = T;
export type ApiResponseData<T = any> = ApiResponse<T>;

// Error response types
export interface ValidationErrorResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: Array<{
      field: string;
      message: string;
      value?: any;
    }>;
  };
}

export interface NotFoundErrorResponse {
  success: false;
  error: {
    code: 'NOT_FOUND';
    message: string;
    resource?: string;
    resourceId?: string;
  };
}

export interface UnauthorizedErrorResponse {
  success: false;
  error: {
    code: 'UNAUTHORIZED';
    message: string;
    details?: {
      reason: 'invalid_token' | 'expired_token' | 'missing_token';
    };
  };
}
