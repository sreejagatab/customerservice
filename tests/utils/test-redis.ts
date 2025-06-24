import { createClient, RedisClientType } from 'redis';

export class TestRedis {
  private client: RedisClientType | null = null;

  async setup(): Promise<void> {
    const redisUrl = process.env.TEST_REDIS_URL;
    if (!redisUrl) {
      throw new Error('TEST_REDIS_URL environment variable is required');
    }

    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            return new Error('Redis connection failed after 3 retries');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    this.client.on('error', (error) => {
      console.error('Test Redis error:', error);
    });

    await this.client.connect();
    await this.client.ping();
    
    console.log('✅ Test Redis connected');
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    console.log('✅ Test Redis disconnected');
  }

  async clear(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    await this.client.flushDb();
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    return this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    return this.client.exists(key);
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    return this.client.keys(pattern);
  }

  async setTestToken(userId: string, token: string, ttl: number = 3600): Promise<void> {
    await this.set(`test_token:${userId}`, token, ttl);
  }

  async getTestToken(userId: string): Promise<string | null> {
    return this.get(`test_token:${userId}`);
  }

  async setTestSession(sessionId: string, data: any, ttl: number = 3600): Promise<void> {
    await this.set(`test_session:${sessionId}`, JSON.stringify(data), ttl);
  }

  async getTestSession(sessionId: string): Promise<any | null> {
    const data = await this.get(`test_session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async setRateLimit(key: string, count: number, ttl: number): Promise<void> {
    await this.set(`rate_limit:${key}`, count.toString(), ttl);
  }

  async getRateLimit(key: string): Promise<number> {
    const count = await this.get(`rate_limit:${key}`);
    return count ? parseInt(count) : 0;
  }

  async incrementRateLimit(key: string, ttl: number): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    const multi = this.client.multi();
    multi.incr(`rate_limit:${key}`);
    multi.expire(`rate_limit:${key}`, ttl);
    const results = await multi.exec();
    
    return results[0] as number;
  }

  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    return this.client;
  }
}
