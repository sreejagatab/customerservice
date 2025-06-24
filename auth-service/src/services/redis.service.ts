import { createClient, RedisClientType } from 'redis';
import { RedisConfig } from '@universal-ai-cs/shared';

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor(config: RedisConfig) {
    this.client = createClient({
      url: config.host ? `redis://${config.host}:${config.port}` : undefined,
      password: config.password,
      database: config.db || 0,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis connection failed after 10 retries');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('Redis client connected');
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      console.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
    }
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<string | null> {
    return this.client.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<string | null> {
    return this.client.setEx(key, seconds, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  async hget(key: string, field: string): Promise<string | undefined> {
    return this.client.hGet(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hSet(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hGetAll(key);
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.client.hDel(key, field);
  }

  async sadd(key: string, member: string): Promise<number> {
    return this.client.sAdd(key, member);
  }

  async srem(key: string, member: string): Promise<number> {
    return this.client.sRem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.sMembers(key);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return this.client.sIsMember(key, member);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.client.zAdd(key, { score, value: member });
  }

  async zrem(key: string, member: string): Promise<number> {
    return this.client.zRem(key, member);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zRange(key, start, stop);
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    return this.client.zRangeByScore(key, min, max);
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    return this.client.zRemRangeByScore(key, min, max);
  }

  async lpush(key: string, element: string): Promise<number> {
    return this.client.lPush(key, element);
  }

  async rpush(key: string, element: string): Promise<number> {
    return this.client.rPush(key, element);
  }

  async lpop(key: string): Promise<string | null> {
    return this.client.lPop(key);
  }

  async rpop(key: string): Promise<string | null> {
    return this.client.rPop(key);
  }

  async llen(key: string): Promise<number> {
    return this.client.lLen(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lRange(key, start, stop);
  }

  async flushdb(): Promise<string> {
    return this.client.flushDb();
  }

  async flushall(): Promise<string> {
    return this.client.flushAll();
  }

  async multi(): Promise<any> {
    return this.client.multi();
  }

  async eval(script: string, keys: string[], args: string[]): Promise<any> {
    return this.client.eval(script, {
      keys,
      arguments: args,
    });
  }

  getClient(): RedisClientType {
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
      };
    }
  }

  async getInfo(): Promise<{
    connectedClients: number;
    usedMemory: number;
    totalCommandsProcessed: number;
    keyspaceHits: number;
    keyspaceMisses: number;
  }> {
    const info = await this.client.info();
    const lines = info.split('\r\n');
    const stats: any = {};

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        stats[key] = value;
      }
    }

    return {
      connectedClients: parseInt(stats.connected_clients || '0'),
      usedMemory: parseInt(stats.used_memory || '0'),
      totalCommandsProcessed: parseInt(stats.total_commands_processed || '0'),
      keyspaceHits: parseInt(stats.keyspace_hits || '0'),
      keyspaceMisses: parseInt(stats.keyspace_misses || '0'),
    };
  }
}
