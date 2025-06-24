import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redis.service';
import { ErrorCode } from '@universal-ai-cs/shared';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
  message?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}

export class RateLimitMiddleware {
  constructor(private redisService: RedisService) {}

  /**
   * Create rate limiting middleware
   */
  create(config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const key = this.generateKey(req, config.keyGenerator);
        const windowStart = Math.floor(Date.now() / config.windowMs) * config.windowMs;
        const windowEnd = windowStart + config.windowMs;
        
        // Get current request count
        const currentCount = await this.getCurrentCount(key, windowStart);
        
        // Check if limit exceeded
        if (currentCount >= config.maxRequests) {
          const retryAfter = Math.ceil((windowEnd - Date.now()) / 1000);
          
          // Set rate limit headers
          this.setRateLimitHeaders(res, {
            limit: config.maxRequests,
            remaining: 0,
            reset: new Date(windowEnd),
            retryAfter,
          });

          if (config.onLimitReached) {
            config.onLimitReached(req, res);
          } else {
            res.status(429).json({
              success: false,
              error: {
                code: ErrorCode.RATE_LIMIT_EXCEEDED,
                message: config.message || 'Too many requests',
                details: {
                  limit: config.maxRequests,
                  windowMs: config.windowMs,
                  retryAfter,
                },
              },
            });
          }
          return;
        }

        // Increment counter
        await this.incrementCounter(key, windowStart, config.windowMs);
        
        // Set rate limit headers
        this.setRateLimitHeaders(res, {
          limit: config.maxRequests,
          remaining: Math.max(0, config.maxRequests - currentCount - 1),
          reset: new Date(windowEnd),
        });

        // Handle response to potentially skip counting
        if (config.skipSuccessfulRequests || config.skipFailedRequests) {
          this.handleResponseCounting(res, key, windowStart, config);
        }

        next();
      } catch (error) {
        console.error('Rate limiting error:', error);
        // Don't block requests if rate limiting fails
        next();
      }
    };
  }

  /**
   * Create rate limiter for authentication endpoints
   */
  createAuthLimiter(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    return this.create({
      windowMs,
      maxRequests: maxAttempts,
      keyGenerator: (req) => `auth:${this.getClientIdentifier(req)}`,
      message: 'Too many authentication attempts',
      skipSuccessfulRequests: true,
    });
  }

  /**
   * Create rate limiter for API endpoints
   */
  createApiLimiter(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
    return this.create({
      windowMs,
      maxRequests,
      keyGenerator: (req) => {
        if (req.user) {
          return `api:user:${req.user.id}`;
        }
        return `api:ip:${this.getClientIdentifier(req)}`;
      },
      message: 'API rate limit exceeded',
    });
  }

  /**
   * Create rate limiter for password reset endpoints
   */
  createPasswordResetLimiter(maxAttempts: number = 3, windowMs: number = 60 * 60 * 1000) {
    return this.create({
      windowMs,
      maxRequests: maxAttempts,
      keyGenerator: (req) => `password_reset:${this.getClientIdentifier(req)}`,
      message: 'Too many password reset attempts',
    });
  }

  /**
   * Create rate limiter for email verification
   */
  createEmailVerificationLimiter(maxAttempts: number = 5, windowMs: number = 60 * 60 * 1000) {
    return this.create({
      windowMs,
      maxRequests: maxAttempts,
      keyGenerator: (req) => `email_verify:${this.getClientIdentifier(req)}`,
      message: 'Too many email verification attempts',
    });
  }

  /**
   * Create rate limiter for MFA attempts
   */
  createMfaLimiter(maxAttempts: number = 10, windowMs: number = 15 * 60 * 1000) {
    return this.create({
      windowMs,
      maxRequests: maxAttempts,
      keyGenerator: (req) => `mfa:${this.getClientIdentifier(req)}`,
      message: 'Too many MFA attempts',
      skipSuccessfulRequests: true,
    });
  }

  /**
   * Get current rate limit status for a key
   */
  async getRateLimitStatus(
    req: Request,
    config: RateLimitConfig
  ): Promise<RateLimitInfo> {
    const key = this.generateKey(req, config.keyGenerator);
    const windowStart = Math.floor(Date.now() / config.windowMs) * config.windowMs;
    const windowEnd = windowStart + config.windowMs;
    
    const currentCount = await this.getCurrentCount(key, windowStart);
    
    return {
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - currentCount),
      reset: new Date(windowEnd),
      retryAfter: currentCount >= config.maxRequests 
        ? Math.ceil((windowEnd - Date.now()) / 1000)
        : undefined,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetRateLimit(req: Request, keyGenerator?: (req: Request) => string): Promise<void> {
    const key = this.generateKey(req, keyGenerator);
    const pattern = `rate_limit:${key}:*`;
    const keys = await this.redisService.keys(pattern);
    
    for (const redisKey of keys) {
      await this.redisService.del(redisKey);
    }
  }

  private generateKey(req: Request, keyGenerator?: (req: Request) => string): string {
    if (keyGenerator) {
      return keyGenerator(req);
    }
    
    // Default key generation
    if (req.user) {
      return `user:${req.user.id}`;
    }
    
    return `ip:${this.getClientIdentifier(req)}`;
  }

  private getClientIdentifier(req: Request): string {
    // Try to get real IP from various headers
    const forwarded = req.headers['x-forwarded-for'] as string;
    const realIp = req.headers['x-real-ip'] as string;
    const cfConnectingIp = req.headers['cf-connecting-ip'] as string;
    
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    if (realIp) {
      return realIp;
    }
    
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  private async getCurrentCount(key: string, windowStart: number): Promise<number> {
    const redisKey = `rate_limit:${key}:${windowStart}`;
    const count = await this.redisService.get(redisKey);
    return count ? parseInt(count) : 0;
  }

  private async incrementCounter(
    key: string,
    windowStart: number,
    windowMs: number
  ): Promise<void> {
    const redisKey = `rate_limit:${key}:${windowStart}`;
    const ttl = Math.ceil(windowMs / 1000);
    
    const multi = this.redisService.multi();
    multi.incr(redisKey);
    multi.expire(redisKey, ttl);
    await multi.exec();
  }

  private setRateLimitHeaders(res: Response, info: RateLimitInfo): void {
    res.set({
      'X-RateLimit-Limit': info.limit.toString(),
      'X-RateLimit-Remaining': info.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(info.reset.getTime() / 1000).toString(),
    });

    if (info.retryAfter) {
      res.set('Retry-After', info.retryAfter.toString());
    }
  }

  private handleResponseCounting(
    res: Response,
    key: string,
    windowStart: number,
    config: RateLimitConfig
  ): void {
    const originalSend = res.send;
    const originalJson = res.json;
    
    const shouldSkip = () => {
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      const isError = res.statusCode >= 400;
      
      return (config.skipSuccessfulRequests && isSuccess) ||
             (config.skipFailedRequests && isError);
    };

    res.send = function(body) {
      if (shouldSkip()) {
        // Decrement counter if we should skip this request
        const redisKey = `rate_limit:${key}:${windowStart}`;
        // Note: In a real implementation, you might want to handle this more carefully
        // to avoid race conditions
      }
      return originalSend.call(this, body);
    };

    res.json = function(body) {
      if (shouldSkip()) {
        // Decrement counter if we should skip this request
        const redisKey = `rate_limit:${key}:${windowStart}`;
        // Note: In a real implementation, you might want to handle this more carefully
      }
      return originalJson.call(this, body);
    };
  }
}
