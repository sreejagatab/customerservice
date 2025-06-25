/**
 * Tenant Isolation Service
 * Provides runtime tenant isolation and data security
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { RedisService } from './redis';

export interface TenantIsolationConfig {
  level: 'shared' | 'dedicated_schema' | 'dedicated_database' | 'dedicated_infrastructure';
  databaseSchema?: string;
  databaseName?: string;
  storagePrefix: string;
  networkSegment?: string;
  encryptionKey?: string;
  dataResidency: {
    region: string;
    country: string;
    compliance: string[];
  };
}

export interface TenantDataAccess {
  organizationId: string;
  isolation: TenantIsolationConfig;
  permissions: string[];
  resourceLimits: Record<string, number>;
}

export class TenantIsolationService extends EventEmitter {
  private static instance: TenantIsolationService;
  private logger: Logger;
  private db: DatabaseService;
  private redis: RedisService;
  private tenantContexts: Map<string, TenantDataAccess> = new Map();
  private encryptionKeys: Map<string, string> = new Map();

  constructor() {
    super();
    this.logger = new Logger('TenantIsolationService');
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
  }

  public static getInstance(): TenantIsolationService {
    if (!TenantIsolationService.instance) {
      TenantIsolationService.instance = new TenantIsolationService();
    }
    return TenantIsolationService.instance;
  }

  /**
   * Initialize tenant isolation service
   */
  public async initialize(): Promise<void> {
    try {
      // Load tenant contexts
      await this.loadTenantContexts();
      
      // Initialize encryption keys
      await this.initializeEncryptionKeys();
      
      // Setup monitoring
      this.setupMonitoring();
      
      this.logger.info('Tenant isolation service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize tenant isolation service', { error });
      throw error;
    }
  }

  /**
   * Get tenant data access context
   */
  public getTenantContext(organizationId: string): TenantDataAccess | null {
    return this.tenantContexts.get(organizationId) || null;
  }

  /**
   * Create isolated database query
   */
  public async createIsolatedQuery(
    organizationId: string,
    query: string,
    params: any[] = []
  ): Promise<any> {
    const context = this.getTenantContext(organizationId);
    if (!context) {
      throw new Error(`Tenant context not found for organization: ${organizationId}`);
    }

    try {
      let isolatedQuery = query;
      let isolatedParams = params;

      switch (context.isolation.level) {
        case 'dedicated_schema':
          isolatedQuery = this.addSchemaPrefix(query, context.isolation.databaseSchema!);
          break;
        
        case 'dedicated_database':
          // Use dedicated database connection
          const dedicatedDb = await this.getDedicatedDatabaseConnection(
            context.isolation.databaseName!
          );
          return await dedicatedDb.query(isolatedQuery, isolatedParams);
        
        case 'shared':
          // Add organization filter to all queries
          const { query: filteredQuery, params: filteredParams } = this.addOrganizationFilter(
            query,
            params,
            organizationId
          );
          isolatedQuery = filteredQuery;
          isolatedParams = filteredParams;
          break;
        
        case 'dedicated_infrastructure':
          // Route to dedicated infrastructure
          return await this.executeDedicatedInfrastructureQuery(
            organizationId,
            query,
            params
          );
      }

      // Execute query with tenant context
      const result = await this.db.query(isolatedQuery, isolatedParams);
      
      // Log data access for audit
      this.logDataAccess(organizationId, query, result.rowCount || 0);
      
      return result;
    } catch (error) {
      this.logger.error('Error executing isolated query', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Encrypt tenant data
   */
  public encryptTenantData(organizationId: string, data: any): string {
    const encryptionKey = this.encryptionKeys.get(organizationId);
    if (!encryptionKey) {
      throw new Error(`Encryption key not found for organization: ${organizationId}`);
    }

    try {
      const crypto = require('crypto');
      const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      this.logger.error('Error encrypting tenant data', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Decrypt tenant data
   */
  public decryptTenantData(organizationId: string, encryptedData: string): any {
    const encryptionKey = this.encryptionKeys.get(organizationId);
    if (!encryptionKey) {
      throw new Error(`Encryption key not found for organization: ${organizationId}`);
    }

    try {
      const crypto = require('crypto');
      const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error('Error decrypting tenant data', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create isolated storage path
   */
  public createIsolatedStoragePath(organizationId: string, path: string): string {
    const context = this.getTenantContext(organizationId);
    if (!context) {
      throw new Error(`Tenant context not found for organization: ${organizationId}`);
    }

    return `${context.isolation.storagePrefix}/${path}`;
  }

  /**
   * Validate tenant access permissions
   */
  public validateTenantAccess(
    organizationId: string,
    resource: string,
    action: string
  ): boolean {
    const context = this.getTenantContext(organizationId);
    if (!context) {
      return false;
    }

    const permission = `${resource}:${action}`;
    return context.permissions.includes(permission) || context.permissions.includes('*');
  }

  /**
   * Check resource limits
   */
  public async checkResourceLimit(
    organizationId: string,
    resource: string,
    requestedAmount: number = 1
  ): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const context = this.getTenantContext(organizationId);
    if (!context) {
      throw new Error(`Tenant context not found for organization: ${organizationId}`);
    }

    const limit = context.resourceLimits[resource] || 0;
    const currentUsage = await this.getCurrentUsage(organizationId, resource);
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = remaining >= requestedAmount;

    return { allowed, remaining, limit };
  }

  /**
   * Update resource usage
   */
  public async updateResourceUsage(
    organizationId: string,
    resource: string,
    amount: number
  ): Promise<void> {
    try {
      const key = `tenant:${organizationId}:usage:${resource}`;
      await this.redis.incrby(key, amount);
      
      // Set expiry for monthly reset
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const ttl = Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
      await this.redis.expire(key, ttl);

      this.emit('resource.usage.updated', {
        organizationId,
        resource,
        amount,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Error updating resource usage', {
        organizationId,
        resource,
        amount,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async loadTenantContexts(): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT 
          o.id,
          o.tenant_type,
          o.region,
          o.resource_quotas,
          o.data_residency_requirements,
          ti.isolation_level,
          ti.database_schema,
          ti.database_name,
          ti.storage_prefix,
          ti.network_segment,
          ti.encryption_key_id
        FROM organizations o
        LEFT JOIN tenant_isolation ti ON o.id = ti.organization_id
        WHERE o.status = 'active'
      `);

      for (const row of result.rows) {
        const context: TenantDataAccess = {
          organizationId: row.id,
          isolation: {
            level: row.isolation_level || 'shared',
            databaseSchema: row.database_schema,
            databaseName: row.database_name,
            storagePrefix: row.storage_prefix || `tenant_${row.id}`,
            networkSegment: row.network_segment,
            encryptionKey: row.encryption_key_id,
            dataResidency: row.data_residency_requirements || {
              region: row.region,
              country: 'US',
              compliance: [],
            },
          },
          permissions: await this.loadTenantPermissions(row.id),
          resourceLimits: row.resource_quotas || {},
        };

        this.tenantContexts.set(row.id, context);
      }

      this.logger.info('Loaded tenant contexts', {
        count: this.tenantContexts.size,
      });
    } catch (error) {
      this.logger.error('Error loading tenant contexts', { error });
      throw error;
    }
  }

  private async loadTenantPermissions(organizationId: string): Promise<string[]> {
    try {
      const result = await this.db.query(`
        SELECT permission
        FROM tenant_permissions
        WHERE organization_id = $1
      `, [organizationId]);

      return result.rows.map(row => row.permission);
    } catch (error) {
      this.logger.error('Error loading tenant permissions', {
        organizationId,
        error,
      });
      return [];
    }
  }

  private async initializeEncryptionKeys(): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT organization_id, encryption_key
        FROM tenant_encryption_keys
      `);

      for (const row of result.rows) {
        this.encryptionKeys.set(row.organization_id, row.encryption_key);
      }

      this.logger.info('Loaded encryption keys', {
        count: this.encryptionKeys.size,
      });
    } catch (error) {
      this.logger.error('Error loading encryption keys', { error });
      throw error;
    }
  }

  private addSchemaPrefix(query: string, schema: string): string {
    // Add schema prefix to table names in the query
    return query.replace(/FROM\s+(\w+)/gi, `FROM ${schema}.$1`)
                .replace(/JOIN\s+(\w+)/gi, `JOIN ${schema}.$1`)
                .replace(/UPDATE\s+(\w+)/gi, `UPDATE ${schema}.$1`)
                .replace(/INSERT\s+INTO\s+(\w+)/gi, `INSERT INTO ${schema}.$1`);
  }

  private addOrganizationFilter(
    query: string,
    params: any[],
    organizationId: string
  ): { query: string; params: any[] } {
    // Add WHERE clause for organization_id if not present
    if (!query.toLowerCase().includes('where')) {
      query += ` WHERE organization_id = $${params.length + 1}`;
      params.push(organizationId);
    } else {
      query = query.replace(/WHERE/i, `WHERE organization_id = $${params.length + 1} AND`);
      params.push(organizationId);
    }

    return { query, params };
  }

  private async getDedicatedDatabaseConnection(databaseName: string): Promise<any> {
    // Implementation for dedicated database connections
    // This would typically involve connection pooling for dedicated databases
    throw new Error('Dedicated database connections not implemented');
  }

  private async executeDedicatedInfrastructureQuery(
    organizationId: string,
    query: string,
    params: any[]
  ): Promise<any> {
    // Implementation for dedicated infrastructure queries
    // This would route to dedicated infrastructure endpoints
    throw new Error('Dedicated infrastructure queries not implemented');
  }

  private async getCurrentUsage(organizationId: string, resource: string): Promise<number> {
    try {
      const key = `tenant:${organizationId}:usage:${resource}`;
      const usage = await this.redis.get(key);
      return parseInt(usage || '0', 10);
    } catch (error) {
      this.logger.error('Error getting current usage', {
        organizationId,
        resource,
        error,
      });
      return 0;
    }
  }

  private logDataAccess(organizationId: string, query: string, rowCount: number): void {
    this.emit('data.access', {
      organizationId,
      query: query.substring(0, 100), // Truncate for logging
      rowCount,
      timestamp: new Date(),
    });
  }

  private setupMonitoring(): void {
    // Setup monitoring for tenant isolation violations
    this.on('data.access', (event) => {
      // Log data access for audit purposes
      this.logger.debug('Tenant data access', event);
    });

    this.on('resource.usage.updated', (event) => {
      // Monitor resource usage
      this.logger.debug('Resource usage updated', event);
    });
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const tenantCount = this.tenantContexts.size;
      const encryptionKeyCount = this.encryptionKeys.size;

      return {
        status: 'healthy',
        details: {
          tenantCount,
          encryptionKeyCount,
          isolationLevels: Array.from(this.tenantContexts.values())
            .reduce((acc, context) => {
              acc[context.isolation.level] = (acc[context.isolation.level] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Close service
   */
  public async close(): Promise<void> {
    this.tenantContexts.clear();
    this.encryptionKeys.clear();
    this.removeAllListeners();
    this.logger.info('Tenant isolation service closed');
  }
}

export default TenantIsolationService;
