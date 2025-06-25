/**
 * Logger utility for Message Service
 * Provides structured logging with different log levels and contexts
 */

import winston from 'winston';
import { config } from '@/config';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Create custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      service: service || config.serviceName,
      message,
      ...meta,
    };
    
    return config.logging.format === 'json' 
      ? JSON.stringify(logEntry)
      : `${timestamp} [${level.toUpperCase()}] ${service || config.serviceName}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  })
);

// Create main logger
export const logger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: customFormat,
  defaultMeta: {
    service: config.serviceName,
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// Create specialized loggers
export const messageLogger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: customFormat,
  defaultMeta: {
    service: config.serviceName,
    component: 'message-processor',
  },
  transports: [
    new winston.transports.Console(),
  ],
});

export const queueLogger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: customFormat,
  defaultMeta: {
    service: config.serviceName,
    component: 'queue-processor',
  },
  transports: [
    new winston.transports.Console(),
  ],
});

export const dbLogger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: customFormat,
  defaultMeta: {
    service: config.serviceName,
    component: 'database',
  },
  transports: [
    new winston.transports.Console(),
  ],
});

export const apiLogger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: customFormat,
  defaultMeta: {
    service: config.serviceName,
    component: 'api',
  },
  transports: [
    new winston.transports.Console(),
  ],
});

// Utility functions for structured logging
export const logMessageProcessing = (
  messageId: string,
  action: string,
  duration?: number,
  metadata: Record<string, any> = {}
) => {
  messageLogger.info('Message processing event', {
    messageId,
    action,
    duration,
    ...metadata,
  });
};

export const logMessageError = (
  messageId: string,
  error: Error,
  context: Record<string, any> = {}
) => {
  messageLogger.error('Message processing error', {
    messageId,
    error: error.message,
    stack: error.stack,
    ...context,
  });
};

export const logQueueJob = (
  jobId: string,
  jobType: string,
  action: string,
  metadata: Record<string, any> = {}
) => {
  queueLogger.info('Queue job event', {
    jobId,
    jobType,
    action,
    ...metadata,
  });
};

export const logQueueError = (
  jobId: string,
  jobType: string,
  error: Error,
  metadata: Record<string, any> = {}
) => {
  queueLogger.error('Queue job error', {
    jobId,
    jobType,
    error: error.message,
    stack: error.stack,
    ...metadata,
  });
};

export const logApiRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  metadata: Record<string, any> = {}
) => {
  apiLogger.info('API request', {
    method,
    url,
    statusCode,
    duration,
    ...metadata,
  });
};

export const logApiError = (
  method: string,
  url: string,
  error: Error,
  metadata: Record<string, any> = {}
) => {
  apiLogger.error('API error', {
    method,
    url,
    error: error.message,
    stack: error.stack,
    ...metadata,
  });
};

export const logDatabaseQuery = (
  query: string,
  duration: number,
  rowCount?: number,
  metadata: Record<string, any> = {}
) => {
  dbLogger.debug('Database query', {
    query: query.substring(0, 200), // Truncate long queries
    duration,
    rowCount,
    ...metadata,
  });
};

export const logDatabaseError = (
  query: string,
  error: Error,
  metadata: Record<string, any> = {}
) => {
  dbLogger.error('Database error', {
    query: query.substring(0, 200),
    error: error.message,
    stack: error.stack,
    ...metadata,
  });
};

// Request logger middleware
export const createRequestLogger = () => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logApiRequest(
        req.method,
        req.originalUrl,
        res.statusCode,
        duration,
        {
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          requestId: req.headers['x-request-id'],
        }
      );
    });
    
    next();
  };
};

// Error logger
export const logError = (
  error: Error,
  context: Record<string, any> = {}
) => {
  logger.error('Application error', {
    error: error.message,
    stack: error.stack,
    ...context,
  });
};

// Performance logger
export const logPerformance = (
  operation: string,
  duration: number,
  metadata: Record<string, any> = {}
) => {
  logger.info('Performance metric', {
    operation,
    duration,
    ...metadata,
  });
};

// Health check logger
export const logHealthCheck = (
  component: string,
  status: 'healthy' | 'unhealthy',
  details?: Record<string, any>
) => {
  logger.info('Health check', {
    component,
    status,
    ...details,
  });
};
