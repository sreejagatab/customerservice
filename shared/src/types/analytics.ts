/**
 * Analytics and reporting types for the Universal AI Customer Service Platform
 */

import { BaseEntity } from './common';

// Analytics Event
export interface AnalyticsEvent extends BaseEntity {
  organizationId: string;
  eventType: EventType;
  eventData: Record<string, any>;
  userId?: string;
  sessionId?: string;
  integrationId?: string;
  conversationId?: string;
  messageId?: string;
  metadata: EventMetadata;
}

export enum EventType {
  // Message Events
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_PROCESSED = 'message_processed',
  MESSAGE_CLASSIFIED = 'message_classified',
  
  // Conversation Events
  CONVERSATION_CREATED = 'conversation_created',
  CONVERSATION_UPDATED = 'conversation_updated',
  CONVERSATION_ASSIGNED = 'conversation_assigned',
  CONVERSATION_RESOLVED = 'conversation_resolved',
  CONVERSATION_CLOSED = 'conversation_closed',
  
  // AI Events
  AI_CLASSIFICATION = 'ai_classification',
  AI_RESPONSE_GENERATED = 'ai_response_generated',
  AI_CONFIDENCE_LOW = 'ai_confidence_low',
  AI_FALLBACK_TRIGGERED = 'ai_fallback_triggered',
  AI_COST_INCURRED = 'ai_cost_incurred',
  
  // Integration Events
  INTEGRATION_CONNECTED = 'integration_connected',
  INTEGRATION_DISCONNECTED = 'integration_disconnected',
  INTEGRATION_SYNC_STARTED = 'integration_sync_started',
  INTEGRATION_SYNC_COMPLETED = 'integration_sync_completed',
  INTEGRATION_ERROR = 'integration_error',
  
  // Workflow Events
  WORKFLOW_TRIGGERED = 'workflow_triggered',
  WORKFLOW_EXECUTED = 'workflow_executed',
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',
  
  // User Events
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_ACTION = 'user_action',
  USER_ERROR = 'user_error',
  
  // System Events
  SYSTEM_ERROR = 'system_error',
  SYSTEM_WARNING = 'system_warning',
  PERFORMANCE_METRIC = 'performance_metric',
  HEALTH_CHECK = 'health_check',
  
  // Business Events
  CUSTOMER_SATISFACTION = 'customer_satisfaction',
  SLA_BREACH = 'sla_breach',
  ESCALATION = 'escalation',
  COST_THRESHOLD = 'cost_threshold',
}

export interface EventMetadata {
  source: string;
  version: string;
  environment: string;
  userAgent?: string;
  ipAddress?: string;
  geolocation?: {
    country: string;
    region: string;
    city: string;
    timezone: string;
  };
  customFields?: Record<string, any>;
}

// Metrics and KPIs
export interface MetricDefinition {
  name: string;
  displayName: string;
  description: string;
  type: MetricType;
  unit: string;
  category: MetricCategory;
  calculation: MetricCalculation;
  filters?: MetricFilter[];
  aggregation: AggregationType;
  dimensions?: string[];
  targets?: MetricTarget[];
}

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  RATE = 'rate',
  PERCENTAGE = 'percentage',
  DURATION = 'duration',
  CURRENCY = 'currency',
}

export enum MetricCategory {
  VOLUME = 'volume',
  PERFORMANCE = 'performance',
  QUALITY = 'quality',
  EFFICIENCY = 'efficiency',
  COST = 'cost',
  SATISFACTION = 'satisfaction',
  OPERATIONAL = 'operational',
  BUSINESS = 'business',
}

export interface MetricCalculation {
  formula: string;
  eventTypes: EventType[];
  fields: string[];
  conditions?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

export enum AggregationType {
  SUM = 'sum',
  COUNT = 'count',
  AVERAGE = 'average',
  MIN = 'min',
  MAX = 'max',
  MEDIAN = 'median',
  PERCENTILE = 'percentile',
  DISTINCT_COUNT = 'distinct_count',
  RATE = 'rate',
}

export interface MetricFilter {
  field: string;
  operator: string;
  value: any;
  required: boolean;
}

export interface MetricTarget {
  type: 'minimum' | 'maximum' | 'range';
  value: number;
  upperBound?: number;
  severity: 'info' | 'warning' | 'critical';
}

// Dashboard and Reports
export interface Dashboard extends BaseEntity {
  organizationId: string;
  name: string;
  description?: string;
  type: DashboardType;
  layout: DashboardLayout;
  widgets: DashboardWidget[];
  filters: DashboardFilter[];
  permissions: DashboardPermissions;
  isDefault: boolean;
  tags: string[];
}

export enum DashboardType {
  OVERVIEW = 'overview',
  OPERATIONAL = 'operational',
  EXECUTIVE = 'executive',
  CUSTOM = 'custom',
  REAL_TIME = 'real_time',
  HISTORICAL = 'historical',
}

export interface DashboardLayout {
  columns: number;
  rows: number;
  responsive: boolean;
  theme: 'light' | 'dark' | 'auto';
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  config: WidgetConfig;
  dataSource: DataSource;
  refreshInterval?: number; // in seconds
  visible: boolean;
}

export enum WidgetType {
  METRIC_CARD = 'metric_card',
  LINE_CHART = 'line_chart',
  BAR_CHART = 'bar_chart',
  PIE_CHART = 'pie_chart',
  AREA_CHART = 'area_chart',
  SCATTER_PLOT = 'scatter_plot',
  HEATMAP = 'heatmap',
  TABLE = 'table',
  GAUGE = 'gauge',
  PROGRESS_BAR = 'progress_bar',
  TEXT = 'text',
  MAP = 'map',
  FUNNEL = 'funnel',
  SANKEY = 'sankey',
}

export interface WidgetConfig {
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  animation?: boolean;
  responsive?: boolean;
  customOptions?: Record<string, any>;
}

export interface DataSource {
  type: 'metric' | 'query' | 'api';
  config: DataSourceConfig;
  caching?: {
    enabled: boolean;
    ttl: number; // in seconds
  };
}

export type DataSourceConfig = 
  | MetricDataSourceConfig
  | QueryDataSourceConfig
  | ApiDataSourceConfig;

export interface MetricDataSourceConfig {
  metrics: string[];
  dimensions?: string[];
  filters?: Record<string, any>;
  timeRange: TimeRange;
  aggregation?: AggregationType;
  groupBy?: string[];
}

export interface QueryDataSourceConfig {
  query: string;
  parameters?: Record<string, any>;
  database?: string;
}

export interface ApiDataSourceConfig {
  endpoint: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
  transform?: string; // JavaScript function to transform data
}

export interface TimeRange {
  type: 'relative' | 'absolute';
  start?: Date;
  end?: Date;
  period?: TimePeriod;
  timezone?: string;
}

export enum TimePeriod {
  LAST_HOUR = 'last_hour',
  LAST_24_HOURS = 'last_24_hours',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  LAST_YEAR = 'last_year',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  THIS_QUARTER = 'this_quarter',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom',
}

export interface DashboardFilter {
  field: string;
  type: 'select' | 'multiselect' | 'date' | 'daterange' | 'text' | 'number';
  label: string;
  options?: Array<{
    label: string;
    value: any;
  }>;
  defaultValue?: any;
  required: boolean;
}

export interface DashboardPermissions {
  canView: string[];
  canEdit: string[];
  canShare: string[];
  canDelete: string[];
  isPublic: boolean;
}

// Reports
export interface Report extends BaseEntity {
  organizationId: string;
  name: string;
  description?: string;
  type: ReportType;
  format: ReportFormat;
  schedule?: ReportSchedule;
  recipients: string[];
  config: ReportConfig;
  lastGeneratedAt?: Date;
  status: ReportStatus;
  tags: string[];
}

export enum ReportType {
  SUMMARY = 'summary',
  DETAILED = 'detailed',
  TREND = 'trend',
  COMPARISON = 'comparison',
  CUSTOM = 'custom',
  REGULATORY = 'regulatory',
}

export enum ReportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
  JSON = 'json',
  HTML = 'html',
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  time: string; // HH:MM format
  timezone: string;
  weekday?: number; // 0-6, Sunday = 0
  dayOfMonth?: number; // 1-31
  enabled: boolean;
}

export interface ReportConfig {
  sections: ReportSection[];
  timeRange: TimeRange;
  filters?: Record<string, any>;
  groupBy?: string[];
  sortBy?: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  includeCharts: boolean;
  includeTables: boolean;
  includeRawData: boolean;
  customTemplate?: string;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'metrics' | 'chart' | 'table' | 'text';
  config: ReportSectionConfig;
  order: number;
}

export type ReportSectionConfig = 
  | MetricsReportConfig
  | ChartReportConfig
  | TableReportConfig
  | TextReportConfig;

export interface MetricsReportConfig {
  metrics: string[];
  showComparison: boolean;
  comparisonPeriod?: TimePeriod;
  showTrend: boolean;
}

export interface ChartReportConfig {
  chartType: WidgetType;
  dataSource: DataSource;
  title?: string;
  width?: number;
  height?: number;
}

export interface TableReportConfig {
  dataSource: DataSource;
  columns: Array<{
    field: string;
    title: string;
    type: 'text' | 'number' | 'date' | 'currency' | 'percentage';
    format?: string;
  }>;
  pagination: boolean;
  maxRows?: number;
}

export interface TextReportConfig {
  content: string;
  variables?: Record<string, string>;
}

export enum ReportStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Analytics Queries
export interface AnalyticsQuery {
  metrics: string[];
  dimensions?: string[];
  filters?: QueryFilter[];
  timeRange: TimeRange;
  groupBy?: string[];
  orderBy?: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  limit?: number;
  offset?: number;
}

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'regex';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface AnalyticsResult {
  data: Array<Record<string, any>>;
  metadata: {
    totalRows: number;
    executionTime: number;
    cacheHit: boolean;
    query: AnalyticsQuery;
    generatedAt: Date;
  };
  aggregations?: Record<string, any>;
}

// Real-time Analytics
export interface RealTimeMetric {
  name: string;
  value: number;
  timestamp: Date;
  dimensions?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: {
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
    threshold: number;
    duration?: number; // in seconds
  };
  actions: AlertAction[];
  enabled: boolean;
  cooldown: number; // in seconds
  lastTriggered?: Date;
}

export interface AlertAction {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, any>;
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  status: 'active' | 'resolved' | 'acknowledged';
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  message: string;
  metadata?: Record<string, any>;
}
