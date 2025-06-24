import { z } from 'zod';

/**
 * Validation utilities using Zod
 */

// Common validation schemas
export const emailSchema = z.string().email('Invalid email format');
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');

export const uuidSchema = z.string().uuid('Invalid UUID format');
export const urlSchema = z.string().url('Invalid URL format');
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format');

// Pagination validation
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Date range validation
export const dateRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
}).refine(data => data.start <= data.end, {
  message: 'Start date must be before or equal to end date',
  path: ['start'],
});

// File validation
export const fileSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().min(1, 'Content type is required'),
  size: z.number().int().min(1).max(10 * 1024 * 1024, 'File size must not exceed 10MB'),
  data: z.string().min(1, 'File data is required'),
});

// Organization validation
export const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens').optional(),
  plan: z.enum(['starter', 'professional', 'enterprise', 'enterprise_plus']),
});

// User validation
export const userSchema = z.object({
  email: emailSchema,
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.enum(['super_admin', 'admin', 'manager', 'agent', 'viewer']),
  permissions: z.array(z.string()).optional(),
});

// Integration validation
export const integrationSchema = z.object({
  name: z.string().min(1, 'Integration name is required').max(255),
  type: z.enum(['email', 'chat', 'sms', 'social', 'ecommerce', 'crm', 'helpdesk', 'custom']),
  provider: z.string().min(1, 'Provider is required'),
  config: z.record(z.any()),
  credentials: z.record(z.any()),
});

// Message validation
export const messageSchema = z.object({
  content: z.object({
    text: z.string().min(1, 'Message content is required').max(10000),
    html: z.string().optional(),
    format: z.enum(['text', 'html', 'markdown']).default('text'),
  }),
  recipient: z.object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  }).refine(data => data.email || data.phone, {
    message: 'Either email or phone is required',
  }),
  attachments: z.array(fileSchema).max(5, 'Maximum 5 attachments allowed').optional(),
});

// Conversation validation
export const conversationSchema = z.object({
  customerEmail: emailSchema,
  customerName: z.string().max(255).optional(),
  customerPhone: phoneSchema.optional(),
  subject: z.string().max(255).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent', 'critical']).default('normal'),
  tags: z.array(z.string().max(50)).max(10, 'Maximum 10 tags allowed').optional(),
});

// AI processing validation
export const aiProcessingSchema = z.object({
  type: z.enum(['classify_message', 'generate_response', 'analyze_sentiment', 'extract_entities', 'detect_language', 'translate_text', 'summarize_conversation', 'moderate_content']),
  input: z.object({
    text: z.string().min(1, 'Input text is required').max(10000),
    html: z.string().optional(),
    attachments: z.array(z.object({
      type: z.enum(['image', 'document', 'audio', 'video']),
      url: urlSchema,
      mimeType: z.string(),
      size: z.number().int().min(1),
    })).optional(),
  }),
  options: z.object({
    preferredProvider: z.string().optional(),
    preferredModel: z.string().optional(),
    maxTokens: z.number().int().min(1).max(4000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
  }).optional(),
});

// Workflow validation
export const workflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(255),
  description: z.string().max(1000).optional(),
  triggers: z.array(z.object({
    type: z.enum(['message_received', 'message_classified', 'conversation_created', 'conversation_updated', 'customer_replied', 'time_based', 'webhook', 'manual', 'integration_event', 'ai_confidence_low', 'sla_breach']),
    conditions: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'in', 'not_in', 'is_empty', 'is_not_empty', 'regex_match']),
      value: z.any(),
    })),
  })).min(1, 'At least one trigger is required'),
  steps: z.array(z.object({
    type: z.string(),
    name: z.string().min(1, 'Step name is required'),
    config: z.record(z.any()),
  })).min(1, 'At least one step is required').max(50, 'Maximum 50 steps allowed'),
});

// Analytics validation
export const analyticsQuerySchema = z.object({
  metrics: z.array(z.string()).min(1, 'At least one metric is required'),
  dimensions: z.array(z.string()).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'regex']),
    value: z.any(),
  })).optional(),
  timeRange: z.object({
    type: z.enum(['relative', 'absolute']),
    start: z.date().optional(),
    end: z.date().optional(),
    period: z.enum(['last_hour', 'last_24_hours', 'last_7_days', 'last_30_days', 'last_90_days', 'last_year', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom']).optional(),
  }),
  limit: z.number().int().min(1).max(10000).optional(),
});

// Webhook validation
export const webhookSchema = z.object({
  url: urlSchema,
  events: z.array(z.string()).min(1, 'At least one event is required'),
  secret: z.string().min(8, 'Webhook secret must be at least 8 characters').optional(),
  active: z.boolean().default(true),
  retryAttempts: z.number().int().min(0).max(10).default(3),
  timeout: z.number().int().min(1000).max(30000).default(10000),
});

/**
 * Validation helper functions
 */

export function validateEmail(email: string): boolean {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
}

export function validatePassword(password: string): boolean {
  try {
    passwordSchema.parse(password);
    return true;
  } catch {
    return false;
  }
}

export function validateUUID(uuid: string): boolean {
  try {
    uuidSchema.parse(uuid);
    return true;
  } catch {
    return false;
  }
}

export function validateURL(url: string): boolean {
  try {
    urlSchema.parse(url);
    return true;
  } catch {
    return false;
  }
}

export function validatePhone(phone: string): boolean {
  try {
    phoneSchema.parse(phone);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeString(input: string, maxLength = 255): string {
  return input.trim().substring(0, maxLength);
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateAndSanitizeInput<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

export function formatValidationErrors(errors: z.ZodError): Array<{
  field: string;
  message: string;
  value?: any;
}> {
  return errors.errors.map(error => ({
    field: error.path.join('.'),
    message: error.message,
    value: error.code === 'invalid_type' ? undefined : (error as any).received,
  }));
}
