/**
 * Error handling utilities for AI Service
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

// Base error class
export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error classes
export class ValidationError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, true, context);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>) {
    super(message, 401, true, context);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string = 'Insufficient permissions', context?: Record<string, any>) {
    super(message, 403, true, context);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string = 'Resource not found', context?: Record<string, any>) {
    super(message, 404, true, context);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, true, context);
  }
}

export class RateLimitError extends BaseError {
  constructor(message: string = 'Rate limit exceeded', context?: Record<string, any>) {
    super(message, 429, true, context);
  }
}

export class ExternalServiceError extends BaseError {
  constructor(
    service: string,
    message: string,
    statusCode: number = 502,
    context?: Record<string, any>
  ) {
    super(`${service}: ${message}`, statusCode, true, { service, ...context });
  }
}

// AI-specific errors
export class AiProviderError extends BaseError {
  public readonly provider: string;
  public readonly model?: string;
  public readonly operation?: string;

  constructor(
    provider: string,
    message: string,
    statusCode: number = 502,
    model?: string,
    operation?: string,
    context?: Record<string, any>
  ) {
    super(`AI Provider (${provider}): ${message}`, statusCode, true, {
      provider,
      model,
      operation,
      ...context,
    });
    this.provider = provider;
    this.model = model;
    this.operation = operation;
  }
}

export class AiQuotaExceededError extends AiProviderError {
  constructor(provider: string, model?: string, context?: Record<string, any>) {
    super(provider, 'API quota exceeded', 429, model, undefined, context);
  }
}

export class AiModelNotFoundError extends AiProviderError {
  constructor(provider: string, model: string, context?: Record<string, any>) {
    super(provider, `Model '${model}' not found or not available`, 404, model, undefined, context);
  }
}

export class AiInvalidRequestError extends AiProviderError {
  constructor(provider: string, message: string, model?: string, context?: Record<string, any>) {
    super(provider, `Invalid request: ${message}`, 400, model, undefined, context);
  }
}

// Configuration errors
export class ConfigurationError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(`Configuration error: ${message}`, 500, false, context);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(`Database error: ${message}`, 500, true, context);
  }
}

export class QueueError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(`Queue error: ${message}`, 500, true, context);
  }
}

// Error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  let context: Record<string, any> = {};

  if (error instanceof BaseError) {
    statusCode = error.statusCode;
    message = error.message;
    context = error.context || {};
  }

  // Log error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    statusCode,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    context,
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        context,
      }),
    },
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown',
  });
};

// Async error handler wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handlers
export const handleUncaughtException = (error: Error): void => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  
  // Graceful shutdown
  process.exit(1);
};

export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
  
  // Graceful shutdown
  process.exit(1);
};

// Validation helper
export const validateRequired = (
  data: Record<string, any>,
  requiredFields: string[]
): void => {
  const missingFields = requiredFields.filter(field => 
    data[field] === undefined || data[field] === null || data[field] === ''
  );

  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missingFields.join(', ')}`,
      { missingFields, providedFields: Object.keys(data) }
    );
  }
};

// AI error mapping helper
export const mapAiProviderError = (
  provider: string,
  error: any,
  model?: string,
  operation?: string
): AiProviderError => {
  // OpenAI error mapping
  if (provider === 'openai') {
    if (error.status === 429) {
      return new AiQuotaExceededError(provider, model, { originalError: error.message });
    }
    if (error.status === 404) {
      return new AiModelNotFoundError(provider, model || 'unknown', { originalError: error.message });
    }
    if (error.status === 400) {
      return new AiInvalidRequestError(provider, error.message, model, { originalError: error.message });
    }
  }

  // Anthropic error mapping
  if (provider === 'anthropic') {
    if (error.status === 429) {
      return new AiQuotaExceededError(provider, model, { originalError: error.message });
    }
    if (error.status === 400) {
      return new AiInvalidRequestError(provider, error.message, model, { originalError: error.message });
    }
  }

  // Google AI error mapping
  if (provider === 'google') {
    if (error.status === 429) {
      return new AiQuotaExceededError(provider, model, { originalError: error.message });
    }
    if (error.status === 400) {
      return new AiInvalidRequestError(provider, error.message, model, { originalError: error.message });
    }
  }

  // Default error
  return new AiProviderError(
    provider,
    error.message || 'Unknown error',
    error.status || 500,
    model,
    operation,
    { originalError: error }
  );
};

export default {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  AiProviderError,
  AiQuotaExceededError,
  AiModelNotFoundError,
  AiInvalidRequestError,
  ConfigurationError,
  DatabaseError,
  QueueError,
  errorHandler,
  asyncHandler,
  handleUncaughtException,
  handleUnhandledRejection,
  validateRequired,
  mapAiProviderError,
};
