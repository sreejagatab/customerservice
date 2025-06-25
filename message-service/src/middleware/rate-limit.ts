/**
 * Advanced Rate Limiting Middleware
 * Provides sophisticated rate limiting with Redis backend
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '@/services/redis';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { RateLimitError } from '@/utils/errors';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

/**
 * Create rate limiting middleware
 */
export function createRateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    onLimitReached,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator(req);
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get current request count
      const rateLimitInfo = await getRateLimitInfo(key, windowStart, now, maxRequests);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, rateLimitInfo.remaining).toString(),
        'X-RateLimit-Reset': rateLimitInfo.resetTime.toISOString(),
        'X-RateLimit-Window': windowMs.toString(),
      });

      // Check if limit exceeded
      if (rateLimitInfo.current >= maxRequests) {
        logger.warn('Rate limit exceeded', {
          key,
          current: rateLimitInfo.current,
          limit: maxRequests,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        if (onLimitReached) {
          onLimitReached(req, res);
        }

        throw new RateLimitError('Rate limit exceeded. Please try again later.');
      }

      // Increment counter
      await incrementRateLimit(key, now, windowMs);

      // Handle response to potentially skip counting
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(body) {
          const statusCode = res.statusCode;
          const shouldSkip = 
            (skipSuccessfulRequests && statusCode < 400) ||
            (skipFailedRequests && statusCode >= 400);

          if (shouldSkip) {
            // Decrement counter if we should skip this request
            decrementRateLimit(key, now, windowMs).catch(err => {
              logger.error('Failed to decrement rate limit', { error: err.message });
            });
          }

          return originalSend.call(this, body);
        };
      }

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        next(error);
      }
    }
  };
}

/**
 * Get rate limit information
 */
async function getRateLimitInfo(
  key: string,
  windowStart: number,
  now: number,
  maxRequests: number
): Promise<RateLimitInfo> {
  try {
    // Use Redis sorted set to track requests in time window
    const requestCount = await redis.get(`rate_limit:${key}:count`) || 0;
    const windowEnd = await redis.get(`rate_limit:${key}:window`) || now + 60000;

    return {
      limit: maxRequests,
      current: Number(requestCount),
      remaining: Math.max(0, maxRequests - Number(requestCount)),
      resetTime: new Date(Number(windowEnd)),
    };
  } catch (error) {
    logger.error('Failed to get rate limit info', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Fail open - allow request if Redis is down
    return {
      limit: maxRequests,
      current: 0,
      remaining: maxRequests,
      resetTime: new Date(now + 60000),
    };
  }
}

/**
 * Increment rate limit counter
 */
async function incrementRateLimit(key: string, now: number, windowMs: number): Promise<void> {
  try {
    const countKey = `rate_limit:${key}:count`;
    const windowKey = `rate_limit:${key}:window`;
    
    // Get current window end time
    const currentWindow = await redis.get(windowKey);
    
    if (!currentWindow || Number(currentWindow) <= now) {
      // Start new window
      await redis.set(countKey, 1, { ttl: Math.ceil(windowMs / 1000) });
      await redis.set(windowKey, now + windowMs, { ttl: Math.ceil(windowMs / 1000) });
    } else {
      // Increment in current window
      await redis.incr(countKey);
    }
  } catch (error) {
    logger.error('Failed to increment rate limit', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Decrement rate limit counter
 */
async function decrementRateLimit(key: string, now: number, windowMs: number): Promise<void> {
  try {
    const countKey = `rate_limit:${key}:count`;
    const currentCount = await redis.get(countKey);
    
    if (currentCount && Number(currentCount) > 0) {
      if (Number(currentCount) === 1) {
        await redis.del(countKey);
      } else {
        // Use Redis DECR command
        const newCount = Number(currentCount) - 1;
        await redis.set(countKey, newCount, { ttl: Math.ceil(windowMs / 1000) });
      }
    }
  } catch (error) {
    logger.error('Failed to decrement rate limit', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: Request): string {
  return `ip:${req.ip}`;
}

/**
 * Key generator for authenticated users
 */
export function userKeyGenerator(req: Request): string {
  const userId = req.headers['x-user-id'] || req.ip;
  return `user:${userId}`;
}

/**
 * Key generator for API keys
 */
export function apiKeyGenerator(req: Request): string {
  const apiKey = req.headers['x-api-key'] || req.ip;
  return `api:${apiKey}`;
}

/**
 * Key generator for organization-based limiting
 */
export function organizationKeyGenerator(req: Request): string {
  const orgId = req.headers['x-organization-id'] || req.ip;
  return `org:${orgId}`;
}

/**
 * Predefined rate limit configurations
 */
export const rateLimitConfigs = {
  // General API rate limiting
  api: createRateLimit({
    windowMs: config.rateLimit.windowMs,
    maxRequests: config.rateLimit.maxRequests,
    keyGenerator: defaultKeyGenerator,
  }),

  // Strict rate limiting for message creation
  messageCreation: createRateLimit({
    windowMs: 60000, // 1 minute
    maxRequests: 100, // 100 messages per minute
    keyGenerator: organizationKeyGenerator,
    skipFailedRequests: true,
  }),

  // Rate limiting for search operations
  search: createRateLimit({
    windowMs: 60000, // 1 minute
    maxRequests: 50, // 50 searches per minute
    keyGenerator: userKeyGenerator,
  }),

  // Rate limiting for AI processing
  aiProcessing: createRateLimit({
    windowMs: 60000, // 1 minute
    maxRequests: 20, // 20 AI requests per minute
    keyGenerator: organizationKeyGenerator,
  }),

  // Rate limiting for webhook delivery
  webhook: createRateLimit({
    windowMs: 60000, // 1 minute
    maxRequests: 200, // 200 webhooks per minute
    keyGenerator: organizationKeyGenerator,
    skipFailedRequests: true,
  }),
};

/**
 * Get rate limit status for a key
 */
export async function getRateLimitStatus(key: string, windowMs: number, maxRequests: number): Promise<RateLimitInfo> {
  const now = Date.now();
  const windowStart = now - windowMs;
  return getRateLimitInfo(key, windowStart, now, maxRequests);
}

/**
 * Reset rate limit for a key
 */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await redis.del(`rate_limit:${key}:count`);
    await redis.del(`rate_limit:${key}:window`);
    logger.info('Rate limit reset', { key });
  } catch (error) {
    logger.error('Failed to reset rate limit', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
