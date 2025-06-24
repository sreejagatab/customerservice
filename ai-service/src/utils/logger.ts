/**
 * Logging utilities for AI Service
 */

import winston from 'winston';
import { config } from '@/config';

// Custom log format
const logFormat = winston.format.combine(
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

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: config.serviceName,
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// AI-specific logger
export const aiLogger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: `${config.serviceName}:ai`,
  },
  transports: [
    new winston.transports.Console(),
  ],
});

// Queue-specific logger
export const queueLogger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: `${config.serviceName}:queue`,
  },
  transports: [
    new winston.transports.Console(),
  ],
});

// Performance logger
export const performanceLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: {
    service: `${config.serviceName}:performance`,
  },
  transports: [
    new winston.transports.Console(),
  ],
});

// Cost tracking logger
export const costLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: {
    service: `${config.serviceName}:cost`,
  },
  transports: [
    new winston.transports.Console(),
  ],
});

// Utility functions for structured logging
export const logAiRequest = (
  provider: string,
  model: string,
  operation: string,
  metadata: Record<string, any> = {}
) => {
  aiLogger.info('AI request initiated', {
    provider,
    model,
    operation,
    ...metadata,
  });
};

export const logAiResponse = (
  provider: string,
  model: string,
  operation: string,
  duration: number,
  tokensUsed: number,
  cost: number,
  metadata: Record<string, any> = {}
) => {
  aiLogger.info('AI request completed', {
    provider,
    model,
    operation,
    duration,
    tokensUsed,
    cost,
    ...metadata,
  });
  
  // Also log to cost tracker
  costLogger.info('AI cost incurred', {
    provider,
    model,
    operation,
    tokensUsed,
    cost,
    timestamp: new Date().toISOString(),
  });
};

export const logAiError = (
  provider: string,
  model: string,
  operation: string,
  error: Error,
  metadata: Record<string, any> = {}
) => {
  aiLogger.error('AI request failed', {
    provider,
    model,
    operation,
    error: error.message,
    stack: error.stack,
    ...metadata,
  });
};

export const logQueueJob = (
  jobType: string,
  jobId: string,
  status: 'started' | 'completed' | 'failed' | 'retry',
  metadata: Record<string, any> = {}
) => {
  const logLevel = status === 'failed' ? 'error' : 'info';
  queueLogger[logLevel](`Queue job ${status}`, {
    jobType,
    jobId,
    status,
    ...metadata,
  });
};

export const logPerformance = (
  operation: string,
  duration: number,
  metadata: Record<string, any> = {}
) => {
  performanceLogger.info('Performance metric', {
    operation,
    duration,
    ...metadata,
  });
};

// Error logging helper
export const logError = (
  error: Error,
  context: string,
  metadata: Record<string, any> = {}
) => {
  logger.error(`Error in ${context}`, {
    error: error.message,
    stack: error.stack,
    context,
    ...metadata,
  });
};

// Request logging middleware helper
export const createRequestLogger = () => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP request', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });
    });
    
    next();
  };
};

export default logger;
