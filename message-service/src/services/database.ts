/**
 * Database Service for Message Service
 * Handles PostgreSQL database connections and operations
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '@/config';
import { logger, dbLogger, logDatabaseQuery, logDatabaseError } from '@/utils/logger';
import { DatabaseError, mapDatabaseError } from '@/utils/errors';

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool;
  private isInitialized: boolean = false;

  private constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      min: config.database.pool.min,
      max: config.database.pool.max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Pool event listeners
    this.pool.on('connect', (client) => {
      dbLogger.debug('Database client connected', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      });
    });

    this.pool.on('error', (err) => {
      dbLogger.error('Database pool error', {
        error: err.message,
        stack: err.stack,
      });
    });

    this.pool.on('remove', (client) => {
      dbLogger.debug('Database client removed from pool');
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isInitialized = true;
      logger.info('Database service initialized', {
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        poolMin: config.database.pool.min,
        poolMax: config.database.pool.max,
      });
    } catch (error) {
      logger.error('Failed to initialize database service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to initialize database connection');
    }
  }

  public async query<T = any>(
    text: string,
    params?: any[],
    client?: PoolClient
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const queryClient = client || this.pool;

    try {
      const result = await queryClient.query<T>(text, params);
      const duration = Date.now() - start;
      
      logDatabaseQuery(text, duration, result.rowCount || 0);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logDatabaseError(text, error as Error, { duration, params });
      throw mapDatabaseError(error);
    }
  }

  public async getClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      throw new DatabaseError('Failed to get database client');
    }
  }

  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows.length > 0 && result.rows[0]?.health === 1;
    } catch (error) {
      dbLogger.error('Database health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  public async close(): Promise<void> {
    try {
      await this.pool.end();
      this.isInitialized = false;
      logger.info('Database service closed');
    } catch (error) {
      logger.error('Error closing database service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance();
