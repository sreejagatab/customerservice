/**
 * Memory Optimizer
 * Memory usage optimization and monitoring utilities
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  heapUsedPercent: number;
  gcCount: number;
  gcDuration: number;
}

export interface MemoryThresholds {
  warning: number; // Percentage of heap usage
  critical: number; // Percentage of heap usage
  maxHeapSize?: number; // Maximum heap size in bytes
}

export interface ObjectPoolOptions<T> {
  maxSize: number;
  factory: () => T;
  reset?: (obj: T) => void;
  validate?: (obj: T) => boolean;
}

export class MemoryOptimizer extends EventEmitter {
  private gcStats = {
    count: 0,
    totalDuration: 0,
  };
  private thresholds: MemoryThresholds;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private objectPools = new Map<string, ObjectPool<any>>();

  constructor(thresholds: MemoryThresholds = { warning: 80, critical: 90 }) {
    super();
    this.thresholds = thresholds;
    this.setupGCMonitoring();
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(intervalMs = 30000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    logger.info('Memory monitoring started', { intervalMs });
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Memory monitoring stopped');
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      heapUsedPercent: Math.round(heapUsedPercent * 100) / 100,
      gcCount: this.gcStats.count,
      gcDuration: this.gcStats.totalDuration,
    };
  }

  /**
   * Force garbage collection (if --expose-gc flag is used)
   */
  forceGC(): boolean {
    if (global.gc) {
      const start = Date.now();
      global.gc();
      const duration = Date.now() - start;
      
      this.gcStats.count++;
      this.gcStats.totalDuration += duration;
      
      logger.info('Forced garbage collection', { duration });
      this.emit('gc', { forced: true, duration });
      
      return true;
    } else {
      logger.warn('Garbage collection not available. Start with --expose-gc flag.');
      return false;
    }
  }

  /**
   * Create an object pool for memory-efficient object reuse
   */
  createObjectPool<T>(name: string, options: ObjectPoolOptions<T>): ObjectPool<T> {
    const pool = new ObjectPool<T>(options);
    this.objectPools.set(name, pool);
    
    logger.info('Object pool created', { name, maxSize: options.maxSize });
    return pool;
  }

  /**
   * Get object pool by name
   */
  getObjectPool<T>(name: string): ObjectPool<T> | undefined {
    return this.objectPools.get(name);
  }

  /**
   * Optimize memory usage
   */
  async optimize(): Promise<{
    beforeStats: MemoryStats;
    afterStats: MemoryStats;
    optimizations: string[];
  }> {
    const beforeStats = this.getMemoryStats();
    const optimizations: string[] = [];

    // Clear object pools
    for (const [name, pool] of this.objectPools) {
      const cleared = pool.clear();
      if (cleared > 0) {
        optimizations.push(`Cleared ${cleared} objects from pool '${name}'`);
      }
    }

    // Force garbage collection if available
    if (this.forceGC()) {
      optimizations.push('Forced garbage collection');
    }

    // Clear require cache for development
    if (process.env.NODE_ENV === 'development') {
      const cacheSize = Object.keys(require.cache).length;
      if (cacheSize > 1000) {
        // Clear non-core modules from cache
        Object.keys(require.cache).forEach(key => {
          if (!key.includes('node_modules')) {
            delete require.cache[key];
          }
        });
        optimizations.push(`Cleared ${cacheSize} modules from require cache`);
      }
    }

    // Wait a bit for GC to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    const afterStats = this.getMemoryStats();

    logger.info('Memory optimization completed', {
      beforeHeapUsed: beforeStats.heapUsed,
      afterHeapUsed: afterStats.heapUsed,
      freed: beforeStats.heapUsed - afterStats.heapUsed,
      optimizations,
    });

    return { beforeStats, afterStats, optimizations };
  }

  /**
   * Get memory usage recommendations
   */
  getRecommendations(): string[] {
    const stats = this.getMemoryStats();
    const recommendations: string[] = [];

    if (stats.heapUsedPercent > this.thresholds.critical) {
      recommendations.push('Critical: Memory usage is very high. Consider scaling or optimizing.');
    } else if (stats.heapUsedPercent > this.thresholds.warning) {
      recommendations.push('Warning: Memory usage is high. Monitor closely.');
    }

    if (stats.external > stats.heapUsed) {
      recommendations.push('High external memory usage detected. Check for memory leaks in native modules.');
    }

    if (this.gcStats.count > 0) {
      const avgGCDuration = this.gcStats.totalDuration / this.gcStats.count;
      if (avgGCDuration > 100) {
        recommendations.push('Garbage collection is taking too long. Consider reducing object allocations.');
      }
    }

    const objectPoolsCount = this.objectPools.size;
    if (objectPoolsCount === 0) {
      recommendations.push('Consider using object pools for frequently allocated objects.');
    }

    return recommendations;
  }

  /**
   * Create memory snapshot (requires heapdump module)
   */
  createSnapshot(filename?: string): string | null {
    try {
      const heapdump = require('heapdump');
      const snapshotFile = filename || `heap-${Date.now()}.heapsnapshot`;
      heapdump.writeSnapshot(snapshotFile);
      
      logger.info('Memory snapshot created', { filename: snapshotFile });
      return snapshotFile;
    } catch (error) {
      logger.warn('Could not create memory snapshot. Install heapdump module.', { error });
      return null;
    }
  }

  // Private methods
  private setupGCMonitoring(): void {
    // Monitor GC events if available
    if (process.env.NODE_ENV !== 'production') {
      try {
        const v8 = require('v8');
        
        // Set up GC callbacks if available
        if (v8.setFlagsFromString) {
          v8.setFlagsFromString('--expose_gc');
        }
      } catch (error) {
        // V8 monitoring not available
      }
    }
  }

  private checkMemoryUsage(): void {
    const stats = this.getMemoryStats();
    
    if (stats.heapUsedPercent > this.thresholds.critical) {
      logger.error('Critical memory usage detected', stats);
      this.emit('critical', stats);
    } else if (stats.heapUsedPercent > this.thresholds.warning) {
      logger.warn('High memory usage detected', stats);
      this.emit('warning', stats);
    }

    this.emit('stats', stats);
  }
}

/**
 * Object Pool for memory-efficient object reuse
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private options: ObjectPoolOptions<T>;

  constructor(options: ObjectPoolOptions<T>) {
    this.options = options;
  }

  /**
   * Get object from pool or create new one
   */
  acquire(): T {
    let obj = this.pool.pop();
    
    if (!obj) {
      obj = this.options.factory();
    } else if (this.options.validate && !this.options.validate(obj)) {
      // Object is invalid, create new one
      obj = this.options.factory();
    }

    return obj;
  }

  /**
   * Return object to pool
   */
  release(obj: T): void {
    if (this.pool.length >= this.options.maxSize) {
      // Pool is full, discard object
      return;
    }

    // Reset object if reset function is provided
    if (this.options.reset) {
      this.options.reset(obj);
    }

    this.pool.push(obj);
  }

  /**
   * Get pool statistics
   */
  getStats(): { size: number; maxSize: number; utilization: number } {
    const size = this.pool.length;
    const utilization = ((this.options.maxSize - size) / this.options.maxSize) * 100;
    
    return {
      size,
      maxSize: this.options.maxSize,
      utilization: Math.round(utilization * 100) / 100,
    };
  }

  /**
   * Clear all objects from pool
   */
  clear(): number {
    const count = this.pool.length;
    this.pool = [];
    return count;
  }
}

// Utility functions
export function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export function createMemoryOptimizer(thresholds?: MemoryThresholds): MemoryOptimizer {
  return new MemoryOptimizer(thresholds);
}

// Export singleton instance
let memoryOptimizerInstance: MemoryOptimizer | null = null;

export function getMemoryOptimizer(): MemoryOptimizer {
  if (!memoryOptimizerInstance) {
    memoryOptimizerInstance = new MemoryOptimizer();
  }
  return memoryOptimizerInstance;
}
