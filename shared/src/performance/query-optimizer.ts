/**
 * Database Query Optimizer
 * Performance optimization utilities for database queries
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { getCache, cacheKey } from '../cache/redis-cache';

export interface QueryOptions {
  cache?: {
    enabled: boolean;
    ttl?: number;
    tags?: string[];
    key?: string;
  };
  timeout?: number;
  retries?: number;
  explain?: boolean;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  executionTime: number;
  fromCache: boolean;
  queryPlan?: any;
}

export interface QueryStats {
  totalQueries: number;
  averageExecutionTime: number;
  cacheHitRate: number;
  slowQueries: Array<{
    query: string;
    executionTime: number;
    timestamp: Date;
  }>;
}

export class QueryOptimizer {
  private pool: Pool;
  private stats = {
    totalQueries: 0,
    totalExecutionTime: 0,
    cacheHits: 0,
    slowQueries: [] as Array<{ query: string; executionTime: number; timestamp: Date }>,
  };
  private slowQueryThreshold = 1000; // 1 second

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Execute optimized query with caching and performance monitoring
   */
  async query<T = any>(
    text: string,
    params: any[] = [],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    let fromCache = false;
    let result: any;
    let queryPlan: any;

    try {
      // Generate cache key if caching is enabled
      const cacheKey = this.generateCacheKey(text, params, options);
      
      // Try to get from cache first
      if (options.cache?.enabled && cacheKey) {
        const cache = getCache();
        const cachedResult = await cache.get<QueryResult<T>>(cacheKey);
        
        if (cachedResult) {
          this.stats.cacheHits++;
          this.stats.totalQueries++;
          
          return {
            ...cachedResult,
            fromCache: true,
            executionTime: Date.now() - startTime,
          };
        }
      }

      // Execute query with timeout
      const client = await this.pool.connect();
      
      try {
        // Set query timeout if specified
        if (options.timeout) {
          await client.query(`SET statement_timeout = ${options.timeout}`);
        }

        // Get query plan if requested
        if (options.explain) {
          const explainResult = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, params);
          queryPlan = explainResult.rows[0]['QUERY PLAN'];
        }

        // Execute the actual query
        result = await client.query(text, params);
        
      } finally {
        client.release();
      }

      const executionTime = Date.now() - startTime;
      
      // Track statistics
      this.updateStats(text, executionTime);

      const queryResult: QueryResult<T> = {
        rows: result.rows,
        rowCount: result.rowCount,
        executionTime,
        fromCache,
        queryPlan,
      };

      // Cache the result if caching is enabled
      if (options.cache?.enabled && cacheKey) {
        const cache = getCache();
        await cache.set(cacheKey, queryResult, {
          ttl: options.cache.ttl || 300, // 5 minutes default
          tags: options.cache.tags,
        });
      }

      return queryResult;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.updateStats(text, executionTime);
      
      logger.error('Query execution failed', {
        query: text,
        params,
        error: error.message,
        executionTime,
      });

      // Retry logic
      if (options.retries && options.retries > 0) {
        logger.info('Retrying query', { query: text, retriesLeft: options.retries });
        return this.query(text, params, { ...options, retries: options.retries - 1 });
      }

      throw error;
    }
  }

  /**
   * Execute query with automatic pagination
   */
  async queryWithPagination<T = any>(
    baseQuery: string,
    params: any[] = [],
    page = 1,
    limit = 20,
    options: QueryOptions = {}
  ): Promise<{
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    // Count total records
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_query`;
    const countResult = await this.query(countQuery, params, options);
    const total = parseInt(countResult.rows[0].total);

    // Calculate pagination
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);
    
    // Execute paginated query
    const paginatedQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const paginatedParams = [...params, limit, offset];
    
    const dataResult = await this.query<T>(paginatedQuery, paginatedParams, options);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T = any>(
    queries: Array<{ text: string; params?: any[] }>,
    options: QueryOptions = {}
  ): Promise<QueryResult<T>[]> {
    const client = await this.pool.connect();
    const results: QueryResult<T>[] = [];
    
    try {
      await client.query('BEGIN');
      
      for (const query of queries) {
        const startTime = Date.now();
        const result = await client.query(query.text, query.params || []);
        const executionTime = Date.now() - startTime;
        
        results.push({
          rows: result.rows,
          rowCount: result.rowCount,
          executionTime,
          fromCache: false,
        });
        
        this.updateStats(query.text, executionTime);
      }
      
      await client.query('COMMIT');
      
      logger.info('Transaction completed successfully', {
        queriesCount: queries.length,
        totalTime: results.reduce((sum, r) => sum + r.executionTime, 0),
      });
      
      return results;
      
    } catch (error: any) {
      await client.query('ROLLBACK');
      
      logger.error('Transaction failed, rolled back', {
        error: error.message,
        queriesCount: queries.length,
      });
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk insert with optimized performance
   */
  async bulkInsert<T = any>(
    tableName: string,
    columns: string[],
    data: any[][],
    options: {
      batchSize?: number;
      onConflict?: string;
      returning?: string[];
    } = {}
  ): Promise<QueryResult<T>> {
    const batchSize = options.batchSize || 1000;
    const results: QueryResult<T>[] = [];
    
    // Process data in batches
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      // Generate VALUES clause
      const valuesClauses = batch.map((row, rowIndex) => {
        const placeholders = columns.map((_, colIndex) => 
          `$${rowIndex * columns.length + colIndex + 1}`
        );
        return `(${placeholders.join(', ')})`;
      });
      
      // Flatten parameters
      const params = batch.flat();
      
      // Build query
      let query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valuesClauses.join(', ')}`;
      
      if (options.onConflict) {
        query += ` ${options.onConflict}`;
      }
      
      if (options.returning) {
        query += ` RETURNING ${options.returning.join(', ')}`;
      }
      
      const result = await this.query<T>(query, params);
      results.push(result);
    }
    
    // Combine results
    const combinedResult: QueryResult<T> = {
      rows: results.flatMap(r => r.rows),
      rowCount: results.reduce((sum, r) => sum + r.rowCount, 0),
      executionTime: results.reduce((sum, r) => sum + r.executionTime, 0),
      fromCache: false,
    };
    
    logger.info('Bulk insert completed', {
      tableName,
      totalRows: data.length,
      batches: results.length,
      executionTime: combinedResult.executionTime,
    });
    
    return combinedResult;
  }

  /**
   * Get query statistics
   */
  getStats(): QueryStats {
    const averageExecutionTime = this.stats.totalQueries > 0 
      ? this.stats.totalExecutionTime / this.stats.totalQueries 
      : 0;
    
    const cacheHitRate = this.stats.totalQueries > 0 
      ? (this.stats.cacheHits / this.stats.totalQueries) * 100 
      : 0;

    return {
      totalQueries: this.stats.totalQueries,
      averageExecutionTime: Math.round(averageExecutionTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      slowQueries: [...this.stats.slowQueries].sort((a, b) => b.executionTime - a.executionTime),
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      totalExecutionTime: 0,
      cacheHits: 0,
      slowQueries: [],
    };
  }

  /**
   * Analyze query performance
   */
  async analyzeQuery(query: string, params: any[] = []): Promise<{
    executionTime: number;
    planningTime: number;
    totalCost: number;
    recommendations: string[];
  }> {
    const result = await this.query(
      query,
      params,
      { explain: true }
    );

    const plan = result.queryPlan?.[0];
    if (!plan) {
      throw new Error('Could not get query plan');
    }

    const recommendations: string[] = [];
    
    // Analyze for common performance issues
    if (plan['Total Cost'] > 1000) {
      recommendations.push('Consider adding indexes to reduce query cost');
    }
    
    if (plan['Planning Time'] > 10) {
      recommendations.push('Query planning time is high, consider simplifying the query');
    }
    
    if (result.executionTime > this.slowQueryThreshold) {
      recommendations.push('Query execution time is slow, consider optimization');
    }

    return {
      executionTime: result.executionTime,
      planningTime: plan['Planning Time'] || 0,
      totalCost: plan['Total Cost'] || 0,
      recommendations,
    };
  }

  // Private helper methods
  private generateCacheKey(query: string, params: any[], options: QueryOptions): string | null {
    if (!options.cache?.enabled) {
      return null;
    }

    if (options.cache.key) {
      return options.cache.key;
    }

    // Generate hash-based cache key
    const crypto = require('crypto');
    const hash = crypto
      .createHash('md5')
      .update(query + JSON.stringify(params))
      .digest('hex');
    
    return cacheKey('query', hash);
  }

  private updateStats(query: string, executionTime: number): void {
    this.stats.totalQueries++;
    this.stats.totalExecutionTime += executionTime;
    
    // Track slow queries
    if (executionTime > this.slowQueryThreshold) {
      this.stats.slowQueries.push({
        query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
        executionTime,
        timestamp: new Date(),
      });
      
      // Keep only last 100 slow queries
      if (this.stats.slowQueries.length > 100) {
        this.stats.slowQueries = this.stats.slowQueries.slice(-100);
      }
      
      logger.warn('Slow query detected', {
        query: query.substring(0, 200),
        executionTime,
      });
    }
  }
}

// Export singleton instance
let optimizerInstance: QueryOptimizer | null = null;

export function createQueryOptimizer(pool: Pool): QueryOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new QueryOptimizer(pool);
  }
  return optimizerInstance;
}

export function getQueryOptimizer(): QueryOptimizer {
  if (!optimizerInstance) {
    throw new Error('Query optimizer not initialized. Call createQueryOptimizer() first.');
  }
  return optimizerInstance;
}
