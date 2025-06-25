/**
 * Redis Service for Message Service
 * Handles Redis connections and caching operations
 */

import Redis from 'ioredis';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { DatabaseError } from '@/utils/errors';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean;
}

export class RedisService {
  private static instance: RedisService;
  private client: Redis;
  private isConnected: boolean = false;

  private constructor() {
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: 'message-service:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    // Use Redis URL if provided, otherwise use individual config
    if (config.redis.url) {
      this.client = new Redis(config.redis.url, {
        ...redisConfig,
        keyPrefix: 'message-service:',
      });
    } else {
      this.client = new Redis(redisConfig);
    }

    this.setupEventHandlers();
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connecting');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis client connected and ready', {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      });
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis client error', {
        error: error.message,
        stack: error.stack,
      });
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis client connection closed');
    });

    this.client.on('reconnecting', (delay) => {
      logger.info('Redis client reconnecting', { delay });
    });
  }

  public async initialize(): Promise<void> {
    try {
      await this.client.connect();
      
      // Test connection
      await this.client.ping();
      
      logger.info('Redis service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Redis service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to initialize Redis connection');
    }
  }

  public async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch (error) {
      logger.error('Redis GET error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  public async set(
    key: string,
    value: any,
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const serializedValue = JSON.stringify(value);
      
      if (options.ttl) {
        await this.client.setex(key, options.ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      logger.error('Redis SET error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Redis DEL error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXPIRE error', {
        key,
        seconds,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis INCR error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async hget(hash: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(hash, field);
    } catch (error) {
      logger.error('Redis HGET error', {
        hash,
        field,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  public async hset(hash: string, field: string, value: string): Promise<boolean> {
    try {
      const result = await this.client.hset(hash, field, value);
      return result >= 0;
    } catch (error) {
      logger.error('Redis HSET error', {
        hash,
        field,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lpush(key, ...values);
    } catch (error) {
      logger.error('Redis LPUSH error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rpop(key);
    } catch (error) {
      logger.error('Redis RPOP error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public isReady(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  public async close(): Promise<void> {
    try {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis service closed');
    } catch (error) {
      logger.error('Error closing Redis service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Export singleton instance
export const redis = RedisService.getInstance();
