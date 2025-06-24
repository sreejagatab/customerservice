/**
 * Request validation middleware for Integration Service
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from './error-handler';
import { logger } from '../utils/logger';

// Validation target types
type ValidationTarget = 'body' | 'params' | 'query' | 'headers';

// Validation options
interface ValidationOptions {
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
}

// Default validation options
const defaultOptions: ValidationOptions = {
  abortEarly: false,
  allowUnknown: false,
  stripUnknown: true,
};

// Generic validation middleware factory
export const validateRequest = (
  schema: Joi.ObjectSchema,
  target: ValidationTarget = 'body',
  options: ValidationOptions = {}
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validationOptions = { ...defaultOptions, ...options };
    const dataToValidate = req[target];

    const { error, value } = schema.validate(dataToValidate, validationOptions);

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      logger.warn('Request validation failed', {
        target,
        path: req.path,
        method: req.method,
        errors: details,
      });

      const validationError = new ValidationError(
        'Request validation failed',
        { errors: details }
      );

      return next(validationError);
    }

    // Replace the original data with validated/sanitized data
    req[target] = value;
    next();
  };
};

// Common validation schemas
export const commonSchemas = {
  // UUID validation
  uuid: Joi.string().uuid().required(),
  optionalUuid: Joi.string().uuid().optional(),

  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  // Date range
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  }),

  // Integration types
  integrationType: Joi.string().valid(
    'email', 'chat', 'sms', 'social', 'ecommerce', 'crm', 'helpdesk', 'custom'
  ),

  // Integration status
  integrationStatus: Joi.string().valid(
    'active', 'inactive', 'error', 'configuring', 'testing'
  ),

  // Email address
  email: Joi.string().email().required(),
  optionalEmail: Joi.string().email().optional(),

  // URL validation
  url: Joi.string().uri().required(),
  optionalUrl: Joi.string().uri().optional(),

  // Provider names
  emailProvider: Joi.string().valid('gmail', 'outlook', 'yahoo', 'smtp', 'imap'),
  chatProvider: Joi.string().valid('slack', 'whatsapp', 'telegram', 'discord'),
  socialProvider: Joi.string().valid('twitter', 'facebook', 'instagram', 'linkedin'),
};

// Integration-specific validation schemas
export const integrationSchemas = {
  // Create integration
  createIntegration: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    type: commonSchemas.integrationType.required(),
    provider: Joi.string().min(1).max(100).required(),
    config: Joi.object().required(),
    credentials: Joi.object().optional(),
    webhookUrl: commonSchemas.optionalUrl,
  }),

  // Update integration
  updateIntegration: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    config: Joi.object().optional(),
    credentials: Joi.object().optional(),
    status: commonSchemas.integrationStatus.optional(),
    webhookUrl: commonSchemas.optionalUrl,
  }),

  // Integration filters
  integrationFilters: Joi.object({
    type: commonSchemas.integrationType.optional(),
    provider: Joi.string().optional(),
    status: commonSchemas.integrationStatus.optional(),
    search: Joi.string().max(255).optional(),
  }).concat(commonSchemas.pagination),

  // Test integration
  testIntegration: Joi.object({
    testType: Joi.string().valid('connection', 'auth', 'send', 'receive').required(),
    testData: Joi.object().optional(),
  }),
};

// Gmail-specific validation schemas
export const gmailSchemas = {
  // Gmail configuration
  gmailConfig: Joi.object({
    scopes: Joi.array().items(Joi.string()).required(),
    labelPrefix: Joi.string().max(50).optional(),
    watchTopic: Joi.string().optional(),
    maxResults: Joi.number().integer().min(1).max(500).default(100),
    includeSpamTrash: Joi.boolean().default(false),
  }),

  // Gmail credentials
  gmailCredentials: Joi.object({
    type: Joi.string().valid('oauth2').required(),
    accessToken: Joi.string().required(),
    refreshToken: Joi.string().required(),
    expiresAt: Joi.date().iso().optional(),
  }),
};

// Outlook-specific validation schemas
export const outlookSchemas = {
  // Outlook configuration
  outlookConfig: Joi.object({
    scopes: Joi.array().items(Joi.string()).required(),
    folderIds: Joi.array().items(Joi.string()).optional(),
    deltaToken: Joi.string().optional(),
    maxPageSize: Joi.number().integer().min(1).max(1000).default(100),
    includeDeleted: Joi.boolean().default(false),
  }),

  // Outlook credentials
  outlookCredentials: Joi.object({
    type: Joi.string().valid('oauth2').required(),
    accessToken: Joi.string().required(),
    refreshToken: Joi.string().required(),
    expiresAt: Joi.date().iso().optional(),
  }),
};

// SMTP/IMAP validation schemas
export const emailSchemas = {
  // SMTP configuration
  smtpConfig: Joi.object({
    host: Joi.string().hostname().required(),
    port: Joi.number().integer().min(1).max(65535).required(),
    secure: Joi.boolean().default(false),
    auth: Joi.object({
      user: Joi.string().required(),
      pass: Joi.string().required(),
    }).required(),
  }),

  // IMAP configuration
  imapConfig: Joi.object({
    host: Joi.string().hostname().required(),
    port: Joi.number().integer().min(1).max(65535).required(),
    tls: Joi.boolean().default(true),
    auth: Joi.object({
      user: Joi.string().required(),
      pass: Joi.string().required(),
    }).required(),
    mailbox: Joi.string().default('INBOX'),
  }),
};

// Webhook validation schemas
export const webhookSchemas = {
  // Webhook payload (generic)
  webhookPayload: Joi.object({
    event: Joi.string().required(),
    timestamp: Joi.date().iso().required(),
    data: Joi.object().required(),
    signature: Joi.string().optional(),
  }),

  // Gmail webhook
  gmailWebhook: Joi.object({
    message: Joi.object({
      data: Joi.string().base64().required(),
      messageId: Joi.string().required(),
      publishTime: Joi.string().required(),
    }).required(),
    subscription: Joi.string().required(),
  }),

  // Microsoft webhook
  microsoftWebhook: Joi.object({
    value: Joi.array().items(
      Joi.object({
        subscriptionId: Joi.string().required(),
        changeType: Joi.string().required(),
        resource: Joi.string().required(),
        resourceData: Joi.object().required(),
      })
    ).required(),
  }),
};

// Validation middleware shortcuts
export const validateBody = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validateRequest(schema, 'body', options);

export const validateParams = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validateRequest(schema, 'params', options);

export const validateQuery = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validateRequest(schema, 'query', options);

export const validateHeaders = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validateRequest(schema, 'headers', options);

// Common validation middleware
export const validateUuidParam = validateParams(
  Joi.object({ id: commonSchemas.uuid })
);

export const validatePagination = validateQuery(commonSchemas.pagination);

export const validateDateRange = validateQuery(commonSchemas.dateRange);

export default validateRequest;
