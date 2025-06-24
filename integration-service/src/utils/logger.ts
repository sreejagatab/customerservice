/**
 * Centralized logging utility for Integration Service
 */

import winston from 'winston';
import { config } from '../config';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(colors);

// Create formatters
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${service || config.serviceName}] ${level}: ${message} ${metaStr}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      service: service || config.serviceName,
      ...meta,
    });
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport
if (config.isDevelopment || config.isTest) {
  transports.push(
    new winston.transports.Console({
      level: config.logging.level,
      format: config.logging.format === 'json' ? jsonFormat : consoleFormat,
    })
  );
} else {
  // Production: JSON format to stdout
  transports.push(
    new winston.transports.Console({
      level: config.logging.level,
      format: jsonFormat,
    })
  );
}

// File transports for production
if (config.isProduction) {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: jsonFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: jsonFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  levels,
  transports,
  exitOnError: false,
  defaultMeta: {
    service: config.serviceName,
  },
});

// Add request ID to logs when available
export const createRequestLogger = (requestId: string) => {
  return logger.child({ requestId });
};

// Integration-specific loggers
export const integrationLogger = logger.child({ component: 'integration' });
export const webhookLogger = logger.child({ component: 'webhook' });
export const queueLogger = logger.child({ component: 'queue' });
export const authLogger = logger.child({ component: 'auth' });
export const dbLogger = logger.child({ component: 'database' });

// Error logging helper
export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
};

// Performance logging helper
export const logPerformance = (operation: string, duration: number, context?: Record<string, any>) => {
  logger.info(`Performance: ${operation}`, {
    operation,
    duration,
    unit: 'ms',
    ...context,
  });
};

// Integration event logging
export const logIntegrationEvent = (
  event: string,
  integrationId: string,
  provider: string,
  context?: Record<string, any>
) => {
  integrationLogger.info(`Integration event: ${event}`, {
    event,
    integrationId,
    provider,
    ...context,
  });
};

// Webhook event logging
export const logWebhookEvent = (
  event: string,
  provider: string,
  context?: Record<string, any>
) => {
  webhookLogger.info(`Webhook event: ${event}`, {
    event,
    provider,
    ...context,
  });
};

// Queue job logging
export const logQueueJob = (
  jobType: string,
  jobId: string,
  status: 'started' | 'completed' | 'failed',
  context?: Record<string, any>
) => {
  queueLogger.info(`Queue job ${status}: ${jobType}`, {
    jobType,
    jobId,
    status,
    ...context,
  });
};

export default logger;
