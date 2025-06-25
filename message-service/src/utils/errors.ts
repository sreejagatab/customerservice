/**
 * Error handling utilities for Message Service
 * Provides custom error classes and error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { logger, logError } from './logger';

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

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, true, { resource, identifier });
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, true, context);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 401, true);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string = 'Forbidden access') {
    super(message, 403, true);
  }
}

export class RateLimitError extends BaseError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, true);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

export class QueueError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

export class MessageProcessingError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

export class ExternalServiceError extends BaseError {
  constructor(service: string, message: string, context?: Record<string, any>) {
    super(`External service error (${service}): ${message}`, 502, true, { service, ...context });
  }
}

export class WebhookError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

// Error response interface
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    timestamp: string;
    requestId?: string;
    details?: any;
  };
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
  logError(error, {
    statusCode,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: req.headers['x-request-id'],
    context,
  });

  // Prepare error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: error.constructor.name,
      message,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string,
    },
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = {
      stack: error.stack,
      context,
    };
  }

  res.status(statusCode).json(errorResponse);
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
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
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  
  // Graceful shutdown
  process.exit(1);
};

// Validation error formatter
export const formatValidationError = (errors: any[]): ValidationError => {
  const messages = errors.map(error => {
    if (error.path) {
      return `${error.path}: ${error.message}`;
    }
    return error.message;
  });
  
  return new ValidationError(
    `Validation failed: ${messages.join(', ')}`,
    { validationErrors: errors }
  );
};

// Database error mapper
export const mapDatabaseError = (error: any): DatabaseError => {
  let message = 'Database operation failed';
  let context: Record<string, any> = {};

  // PostgreSQL specific error codes
  switch (error.code) {
    case '23505': // unique_violation
      message = 'Resource already exists';
      context = { constraint: error.constraint };
      break;
    case '23503': // foreign_key_violation
      message = 'Referenced resource does not exist';
      context = { constraint: error.constraint };
      break;
    case '23502': // not_null_violation
      message = 'Required field is missing';
      context = { column: error.column };
      break;
    case '42P01': // undefined_table
      message = 'Database table does not exist';
      context = { table: error.table };
      break;
    default:
      message = error.message || 'Database operation failed';
      context = { code: error.code };
  }

  return new DatabaseError(message, context);
};

// Queue error mapper
export const mapQueueError = (error: any): QueueError => {
  let message = 'Queue operation failed';
  let context: Record<string, any> = {};

  if (error.message) {
    message = error.message;
  }

  if (error.code) {
    context.code = error.code;
  }

  return new QueueError(message, context);
};

// External service error mapper
export const mapExternalServiceError = (
  service: string,
  error: any
): ExternalServiceError => {
  let message = 'External service request failed';
  let context: Record<string, any> = {};

  if (error.response) {
    // HTTP error response
    message = error.response.data?.message || error.message || 'Request failed';
    context = {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data,
    };
  } else if (error.request) {
    // Network error
    message = 'Network error - service unavailable';
    context = { timeout: error.timeout };
  } else {
    // Other error
    message = error.message || 'Unknown error';
  }

  return new ExternalServiceError(service, message, context);
};
