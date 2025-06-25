/**
 * Error handling utilities for Voice Service
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

export class TwilioError extends AppError {
  constructor(message: string = 'Twilio service error') {
    super(message, 502, 'TWILIO_ERROR');
    this.name = 'TwilioError';
  }
}

export class VoiceProcessingError extends AppError {
  constructor(message: string = 'Voice processing error') {
    super(message, 500, 'VOICE_PROCESSING_ERROR');
    this.name = 'VoiceProcessingError';
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
  let code = 'INTERNAL_ERROR';

  // Handle known error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code || 'APP_ERROR';
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = error.message;
    code = 'VALIDATION_ERROR';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    code = 'INVALID_ID';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  }

  // Log error
  logger.error('Error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode,
      code,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.headers['x-request-id'],
      organizationId: req.headers['x-organization-id'],
    },
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'],
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
      }),
    },
  });
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
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });

  // Give the logger time to write the log
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    } : reason,
    promise: promise.toString(),
  });

  // Give the logger time to write the log
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

// Twilio error handler
export const handleTwilioError = (error: any): AppError => {
  if (error.code === 20003) {
    return new UnauthorizedError('Invalid Twilio credentials');
  }
  
  if (error.code === 21211) {
    return new ValidationError('Invalid phone number format');
  }
  
  if (error.code === 21612) {
    return new ValidationError('Phone number is not verified');
  }
  
  return new TwilioError(`Twilio error: ${error.message}`);
};

// Voice processing error handler
export const handleVoiceProcessingError = (error: any): AppError => {
  if (error.code === 'ECONNREFUSED') {
    return new ServiceUnavailableError('Voice processing service unavailable');
  }
  
  if (error.code === 'ENOTFOUND') {
    return new ServiceUnavailableError('Voice processing service not found');
  }
  
  return new VoiceProcessingError('Voice processing failed');
};

export default {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ServiceUnavailableError,
  TwilioError,
  VoiceProcessingError,
  errorHandler,
  asyncHandler,
  handleUncaughtException,
  handleUnhandledRejection,
  handleTwilioError,
  handleVoiceProcessingError,
};
