/**
 * Database service for AI Service
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { DatabaseError } from '@/utils/errors';

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool;
  private isInitialized = false;

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
      logger.debug('Database client connected', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      });
    });

    this.pool.on('error', (err) => {
      logger.error('Database pool error', {
        error: err.message,
        stack: err.stack,
      });
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = DatabaseService.getInstance();
    await instance.init();
  }

  public static async close(): Promise<void> {
    const instance = DatabaseService.getInstance();
    await instance.close();
  }

  private async init(): Promise<void> {
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

  public async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      await this.pool.end();
      this.isInitialized = false;
      logger.info('Database service closed');
    } catch (error) {
      logger.error('Error closing database service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to close database connection');
    }
  }

  // Query methods
  public async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    if (!this.isInitialized) {
      throw new DatabaseError('Database service not initialized');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params?.length || 0,
        rows: result.rowCount,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params?.length || 0,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError(
        `Query failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async getClient(): Promise<PoolClient> {
    if (!this.isInitialized) {
      throw new DatabaseError('Database service not initialized');
    }

    try {
      return await this.pool.connect();
    } catch (error) {
      throw new DatabaseError(
        `Failed to get database client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Transaction helper
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

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows.length > 0 && result.rows[0]?.health === 1;
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Pool statistics
  public getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Repository base class
export abstract class BaseRepository {
  protected db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  protected async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    return this.db.query<T>(text, params);
  }

  protected async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(callback);
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();
export default DatabaseService;
