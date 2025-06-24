/**
 * Workflow and automation types for the Universal AI Customer Service Platform
 */

import { BaseEntity, Priority } from './common';

// Workflow entity
export interface Workflow extends BaseEntity {
  organizationId: string;
  name: string;
  description?: string;
  version: number;
  status: WorkflowStatus;
  triggers: WorkflowTrigger[];
  steps: WorkflowStep[];
  variables: WorkflowVariable[];
  settings: WorkflowSettings;
  tags: string[];
  statistics: WorkflowStatistics;
  lastExecutedAt?: Date;
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

// Workflow Triggers
export interface WorkflowTrigger {
  id: string;
  type: TriggerType;
  name: string;
  conditions: TriggerCondition[];
  settings: TriggerSettings;
  active: boolean;
}

export enum TriggerType {
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_CLASSIFIED = 'message_classified',
  CONVERSATION_CREATED = 'conversation_created',
  CONVERSATION_UPDATED = 'conversation_updated',
  CUSTOMER_REPLIED = 'customer_replied',
  TIME_BASED = 'time_based',
  WEBHOOK = 'webhook',
  MANUAL = 'manual',
  INTEGRATION_EVENT = 'integration_event',
  AI_CONFIDENCE_LOW = 'ai_confidence_low',
  SLA_BREACH = 'sla_breach',
}

export interface TriggerCondition {
  field: string;
  operator: ConditionOperator;
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_THAN_OR_EQUAL = 'greater_than_or_equal',
  LESS_THAN_OR_EQUAL = 'less_than_or_equal',
  IN = 'in',
  NOT_IN = 'not_in',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
  REGEX_MATCH = 'regex_match',
}

export interface TriggerSettings {
  debounceMs?: number;
  maxExecutionsPerHour?: number;
  timeWindow?: {
    start: string; // HH:MM format
    end: string; // HH:MM format
    timezone: string;
    weekdays: number[]; // 0-6, Sunday = 0
  };
  customSettings?: Record<string, any>;
}

// Workflow Steps
export interface WorkflowStep {
  id: string;
  type: StepType;
  name: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
  config: StepConfig;
  conditions?: StepCondition[];
  onSuccess?: string; // Next step ID
  onFailure?: string; // Next step ID
  onTimeout?: string; // Next step ID
  timeout?: number; // in seconds
  retryPolicy?: RetryPolicy;
  active: boolean;
}

export enum StepType {
  // AI Actions
  AI_CLASSIFY = 'ai_classify',
  AI_GENERATE_RESPONSE = 'ai_generate_response',
  AI_ANALYZE_SENTIMENT = 'ai_analyze_sentiment',
  AI_EXTRACT_ENTITIES = 'ai_extract_entities',
  AI_TRANSLATE = 'ai_translate',
  AI_SUMMARIZE = 'ai_summarize',
  
  // Message Actions
  SEND_MESSAGE = 'send_message',
  SEND_EMAIL = 'send_email',
  SEND_SMS = 'send_sms',
  FORWARD_MESSAGE = 'forward_message',
  
  // Conversation Actions
  UPDATE_CONVERSATION = 'update_conversation',
  ASSIGN_CONVERSATION = 'assign_conversation',
  CLOSE_CONVERSATION = 'close_conversation',
  ADD_TAG = 'add_tag',
  REMOVE_TAG = 'remove_tag',
  
  // Integration Actions
  CREATE_TICKET = 'create_ticket',
  UPDATE_CRM = 'update_crm',
  SYNC_DATA = 'sync_data',
  WEBHOOK_CALL = 'webhook_call',
  
  // Control Flow
  CONDITION = 'condition',
  DELAY = 'delay',
  PARALLEL = 'parallel',
  LOOP = 'loop',
  SWITCH = 'switch',
  
  // Human Actions
  ESCALATE_TO_HUMAN = 'escalate_to_human',
  REQUEST_APPROVAL = 'request_approval',
  NOTIFY_AGENT = 'notify_agent',
  
  // Utility Actions
  SET_VARIABLE = 'set_variable',
  HTTP_REQUEST = 'http_request',
  RUN_SCRIPT = 'run_script',
  LOG_EVENT = 'log_event',
}

export type StepConfig = 
  | AiStepConfig
  | MessageStepConfig
  | ConversationStepConfig
  | IntegrationStepConfig
  | ControlFlowStepConfig
  | HumanStepConfig
  | UtilityStepConfig;

export interface AiStepConfig {
  provider?: string;
  model?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  includeContext?: boolean;
  confidenceThreshold?: number;
  fallbackAction?: string;
}

export interface MessageStepConfig {
  recipient?: {
    type: 'customer' | 'agent' | 'email' | 'phone';
    value?: string;
  };
  template?: string;
  variables?: Record<string, string>;
  attachments?: string[];
  priority?: Priority;
  delay?: number;
}

export interface ConversationStepConfig {
  status?: string;
  priority?: Priority;
  assignTo?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  notes?: string;
}

export interface IntegrationStepConfig {
  integrationId?: string;
  action: string;
  parameters: Record<string, any>;
  mapping?: Record<string, string>;
  errorHandling?: 'ignore' | 'retry' | 'fail';
}

export interface ControlFlowStepConfig {
  conditions?: StepCondition[];
  delay?: number;
  maxIterations?: number;
  parallelSteps?: string[];
  switchVariable?: string;
  switchCases?: Array<{
    value: any;
    stepId: string;
  }>;
  defaultCase?: string;
}

export interface HumanStepConfig {
  assignTo?: string;
  department?: string;
  priority?: Priority;
  message?: string;
  timeout?: number;
  escalationRules?: EscalationRule[];
}

export interface UtilityStepConfig {
  variable?: string;
  value?: any;
  expression?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  script?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logMessage?: string;
}

export interface StepCondition {
  field: string;
  operator: ConditionOperator;
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffType: 'fixed' | 'exponential' | 'linear';
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier?: number;
}

export interface EscalationRule {
  condition: {
    field: string;
    operator: ConditionOperator;
    value: any;
  };
  action: {
    type: 'assign' | 'notify' | 'escalate';
    target: string;
  };
  delay?: number;
}

// Workflow Variables
export interface WorkflowVariable {
  name: string;
  type: VariableType;
  defaultValue?: any;
  description?: string;
  required: boolean;
  validation?: VariableValidation;
}

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  ARRAY = 'array',
  OBJECT = 'object',
  EMAIL = 'email',
  URL = 'url',
  PHONE = 'phone',
}

export interface VariableValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: any[];
  custom?: string; // Custom validation function
}

// Workflow Settings
export interface WorkflowSettings {
  maxExecutionTime: number; // in seconds
  maxConcurrentExecutions: number;
  errorHandling: ErrorHandlingStrategy;
  logging: LoggingSettings;
  notifications: NotificationSettings;
  permissions: WorkflowPermissions;
}

export enum ErrorHandlingStrategy {
  STOP_ON_ERROR = 'stop_on_error',
  CONTINUE_ON_ERROR = 'continue_on_error',
  RETRY_ON_ERROR = 'retry_on_error',
  ESCALATE_ON_ERROR = 'escalate_on_error',
}

export interface LoggingSettings {
  level: 'debug' | 'info' | 'warn' | 'error';
  includeVariables: boolean;
  includeStepOutputs: boolean;
  retentionDays: number;
}

export interface NotificationSettings {
  onSuccess: boolean;
  onFailure: boolean;
  onTimeout: boolean;
  recipients: string[];
  channels: ('email' | 'slack' | 'webhook')[];
}

export interface WorkflowPermissions {
  canExecute: string[];
  canModify: string[];
  canView: string[];
  canDelete: string[];
}

// Workflow Statistics
export interface WorkflowStatistics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionStatus: ExecutionStatus;
  executionHistory: WorkflowExecutionSummary[];
}

// Workflow Execution
export interface WorkflowExecution extends BaseEntity {
  workflowId: string;
  organizationId: string;
  triggerId: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // in milliseconds
  triggerData: Record<string, any>;
  context: ExecutionContext;
  steps: StepExecution[];
  variables: Record<string, any>;
  error?: ExecutionError;
  logs: ExecutionLog[];
}

export enum ExecutionStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
  PAUSED = 'paused',
}

export interface ExecutionContext {
  messageId?: string;
  conversationId?: string;
  customerId?: string;
  integrationId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface StepExecution {
  stepId: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // in milliseconds
  input?: any;
  output?: any;
  error?: ExecutionError;
  retryCount: number;
  logs: ExecutionLog[];
}

export interface ExecutionError {
  code: string;
  message: string;
  details?: any;
  stepId?: string;
  timestamp: Date;
  recoverable: boolean;
}

export interface ExecutionLog {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  stepId?: string;
  data?: any;
}

export interface WorkflowExecutionSummary {
  id: string;
  status: ExecutionStatus;
  startedAt: Date;
  duration?: number;
  triggerType: TriggerType;
  stepsCompleted: number;
  totalSteps: number;
}

// Workflow Templates
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedSetupTime: number; // in minutes
  workflow: Omit<Workflow, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>;
  requiredIntegrations: string[];
  requiredPermissions: string[];
  screenshots?: string[];
  documentation?: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  reviews: TemplateReview[];
}

export enum WorkflowCategory {
  CUSTOMER_SUPPORT = 'customer_support',
  SALES = 'sales',
  MARKETING = 'marketing',
  OPERATIONS = 'operations',
  INTEGRATION = 'integration',
  NOTIFICATION = 'notification',
  DATA_PROCESSING = 'data_processing',
  COMPLIANCE = 'compliance',
  CUSTOM = 'custom',
}

export interface TemplateReview {
  userId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
  helpful: number;
}
