/**
 * Database service for Integration Service
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger, dbLogger } from '../utils/logger';

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool;
  private isInitialized = false;

  private constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      dbLogger.error('Unexpected error on idle client', err);
    });

    this.pool.on('connect', (client) => {
      dbLogger.debug('New client connected to database');
    });

    this.pool.on('remove', (client) => {
      dbLogger.debug('Client removed from database pool');
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
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isInitialized = true;
      dbLogger.info('Database service initialized successfully');
    } catch (error) {
      dbLogger.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      await this.pool.end();
      this.isInitialized = false;
      dbLogger.info('Database service closed successfully');
    } catch (error) {
      dbLogger.error('Error closing database service:', error);
      throw error;
    }
  }

  // Execute a query with automatic connection management
  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
    client?: PoolClient
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    let queryClient = client;
    let shouldRelease = false;

    try {
      if (!queryClient) {
        queryClient = await this.pool.connect();
        shouldRelease = true;
      }

      const result = await queryClient.query(text, params) as QueryResult<T>;
      const duration = Date.now() - start;

      dbLogger.debug('Query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        rows: result.rowCount,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      dbLogger.error('Query failed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        error: (error as any).message,
        params: params?.length ? `${params.length} parameters` : 'no parameters',
      });
      throw error;
    } finally {
      if (shouldRelease && queryClient) {
        queryClient.release();
      }
    }
  }

  // Execute multiple queries in a transaction
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      
      dbLogger.debug('Transaction completed successfully');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      dbLogger.error('Transaction rolled back due to error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Get a client for manual transaction management
  public async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows[0]?.health === 1;
    } catch (error) {
      dbLogger.error('Database health check failed:', error);
      return false;
    }
  }

  // Get pool statistics
  public getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Integration-specific database operations
export class IntegrationRepository {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  // Get all integrations for an organization
  async getIntegrations(organizationId: string, filters?: {
    type?: string;
    provider?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = `
      SELECT id, organization_id, name, type, provider, config, status,
             last_sync_at, sync_status, webhook_url, error_count,
             last_error_at, last_error, metadata, created_at, updated_at
      FROM integrations
      WHERE organization_id = $1
    `;
    
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters?.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }

    if (filters?.provider) {
      query += ` AND provider = $${paramIndex}`;
      params.push(filters.provider);
      paramIndex++;
    }

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (name ILIKE $${paramIndex} OR provider ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    return await this.db.query(query, params);
  }

  // Get a specific integration
  async getIntegration(id: string, organizationId: string) {
    const query = `
      SELECT id, organization_id, name, type, provider, config, credentials,
             status, last_sync_at, sync_status, webhook_url, rate_limits,
             error_count, last_error_at, last_error, metadata, created_at, updated_at
      FROM integrations
      WHERE id = $1 AND organization_id = $2
    `;
    
    return await this.db.query(query, [id, organizationId]);
  }

  // Create a new integration
  async createIntegration(integration: {
    organizationId: string;
    name: string;
    type: string;
    provider: string;
    config: object;
    credentials?: object;
    webhookUrl?: string;
    rateLimits?: object;
    metadata?: object;
  }) {
    const query = `
      INSERT INTO integrations (
        organization_id, name, type, provider, config, credentials,
        webhook_url, rate_limits, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, organization_id, name, type, provider, config, status,
                created_at, updated_at
    `;

    const params = [
      integration.organizationId,
      integration.name,
      integration.type,
      integration.provider,
      JSON.stringify(integration.config),
      integration.credentials ? JSON.stringify(integration.credentials) : null,
      integration.webhookUrl,
      integration.rateLimits ? JSON.stringify(integration.rateLimits) : null,
      integration.metadata ? JSON.stringify(integration.metadata) : null,
    ];

    return await this.db.query(query, params);
  }

  // Update an integration
  async updateIntegration(
    id: string,
    organizationId: string,
    updates: {
      name?: string;
      config?: object;
      credentials?: object;
      status?: string;
      lastSyncAt?: Date;
      syncStatus?: string;
      webhookUrl?: string;
      rateLimits?: object;
      errorCount?: number;
      lastErrorAt?: Date;
      lastError?: string;
      metadata?: object;
    }
  ) {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${dbField} = $${paramIndex}`);
        
        if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);

    const query = `
      UPDATE integrations
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING id, organization_id, name, type, provider, config, status,
                last_sync_at, sync_status, updated_at
    `;

    params.push(id, organizationId);

    return await this.db.query(query, params);
  }

  // Delete an integration
  async deleteIntegration(id: string, organizationId: string) {
    const query = `
      DELETE FROM integrations
      WHERE id = $1 AND organization_id = $2
      RETURNING id, name, type, provider
    `;

    return await this.db.query(query, [id, organizationId]);
  }

  // Update integration sync status
  async updateSyncStatus(
    id: string,
    organizationId: string,
    syncStatus: string,
    lastSyncAt?: Date,
    errorCount?: number,
    lastError?: string
  ) {
    const query = `
      UPDATE integrations
      SET sync_status = $3,
          last_sync_at = COALESCE($4, NOW()),
          error_count = COALESCE($5, error_count),
          last_error_at = CASE WHEN $6 IS NOT NULL THEN NOW() ELSE last_error_at END,
          last_error = COALESCE($6, last_error),
          updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, sync_status, last_sync_at, error_count, last_error_at
    `;

    return await this.db.query(query, [
      id,
      organizationId,
      syncStatus,
      lastSyncAt,
      errorCount,
      lastError,
    ]);
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance();
export const integrationRepo = new IntegrationRepository();

export default DatabaseService;
