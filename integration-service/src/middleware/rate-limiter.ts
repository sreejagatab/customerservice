/**
 * Rate limiting middleware for Integration Service
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimitError } from './error-handler';

// Redis client for rate limiting
let redisClient: Redis;

// Rate limiter instances
let globalRateLimiterInstance: RateLimiterRedis;
let authRateLimiterInstance: RateLimiterRedis;
let webhookRateLimiterInstance: RateLimiterRedis;
let integrationRateLimiterInstance: RateLimiterRedis;

// Initialize rate limiters
export const initializeRateLimiters = async (): Promise<void> => {
  try {
    // Create Redis client
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await redisClient.connect();
    logger.info('Rate limiter Redis client connected');

    // Global rate limiter - applies to all requests
    globalRateLimiterInstance = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_global',
      points: config.rateLimit.maxRequests, // Number of requests
      duration: Math.floor(config.rateLimit.windowMs / 1000), // Per window in seconds
      blockDuration: 60, // Block for 60 seconds if limit exceeded
    });

    // Authentication rate limiter - stricter for auth endpoints
    authRateLimiterInstance = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_auth',
      points: 10, // 10 attempts
      duration: 900, // Per 15 minutes
      blockDuration: 900, // Block for 15 minutes
    });

    // Webhook rate limiter - for incoming webhooks
    webhookRateLimiterInstance = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_webhook',
      points: 1000, // 1000 webhooks
      duration: 60, // Per minute
      blockDuration: 60, // Block for 1 minute
    });

    // Integration rate limiter - for integration operations
    integrationRateLimiterInstance = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_integration',
      points: 50, // 50 operations
      duration: 60, // Per minute
      blockDuration: 300, // Block for 5 minutes
    });

    logger.info('Rate limiters initialized successfully');

    // Initialize middleware after Redis connection
    initializeRateLimiterMiddleware();
  } catch (error) {
    logger.error('Failed to initialize rate limiters:', error);
    throw error;
  }
};

// Get client identifier for rate limiting
const getClientId = (req: Request): string => {
  // Try to get user ID from auth token
  const userId = (req as any).user?.id;
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'] as string;
  const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
  return `ip:${ip}`;
};

// Generic rate limiter middleware factory
const createRateLimiterMiddleware = (limiter: RateLimiterRedis, errorMessage?: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientId = getClientId(req);
      const resRateLimiter = await limiter.consume(clientId);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': limiter.points.toString(),
        'X-RateLimit-Remaining': resRateLimiter.remainingPoints?.toString() || '0',
        'X-RateLimit-Reset': new Date(Date.now() + resRateLimiter.msBeforeNext).toISOString(),
      });

      next();
    } catch (rateLimiterRes: any) {
      // Rate limit exceeded
      const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;

      res.set({
        'X-RateLimit-Limit': limiter.points.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString(),
        'Retry-After': secs.toString(),
      });

      logger.warn('Rate limit exceeded', {
        clientId: getClientId(req),
        path: req.path,
        method: req.method,
        retryAfter: secs,
      });

      const error = new RateLimitError(
        errorMessage || `Rate limit exceeded. Try again in ${secs} seconds.`,
        { retryAfter: secs }
      );
      
      next(error);
    }
  };
};

// Placeholder middleware that will be replaced after initialization
const placeholderMiddleware = (req: any, res: any, next: any) => next();

// Global rate limiter middleware
export let rateLimiter = placeholderMiddleware;

// Authentication rate limiter middleware
export let authRateLimiter = placeholderMiddleware;

// Webhook rate limiter middleware
export let webhookRateLimiter = placeholderMiddleware;

// Integration rate limiter middleware
export let integrationRateLimiter = placeholderMiddleware;

// Initialize rate limiters after Redis connection is established
export const initializeRateLimiterMiddleware = () => {
  rateLimiter = createRateLimiterMiddleware(
    globalRateLimiterInstance,
    'Too many requests. Please try again later.'
  );

  authRateLimiter = createRateLimiterMiddleware(
    authRateLimiterInstance,
    'Too many authentication attempts. Please try again in 15 minutes.'
  );

  webhookRateLimiter = createRateLimiterMiddleware(
    webhookRateLimiterInstance,
    'Webhook rate limit exceeded. Please reduce the frequency of webhook calls.'
  );

  integrationRateLimiter = createRateLimiterMiddleware(
    integrationRateLimiterInstance,
    'Integration operation rate limit exceeded. Please try again in a few minutes.'
  );
};

// Custom rate limiter for specific integrations
export const createIntegrationRateLimiter = (
  integrationId: string,
  points: number,
  duration: number
) => {
  const limiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: `rl_int_${integrationId}`,
    points,
    duration,
    blockDuration: duration,
  });

  return createRateLimiterMiddleware(
    limiter,
    `Rate limit exceeded for integration ${integrationId}.`
  );
};

// Cleanup function
export const closeRateLimiters = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Rate limiter Redis client disconnected');
  }
};

// Initialize rate limiters on module load
if (!config.isTest) {
  initializeRateLimiters().catch((error) => {
    logger.error('Failed to initialize rate limiters on startup:', error);
  });
}

export default rateLimiter;
