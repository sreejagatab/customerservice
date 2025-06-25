/**
 * Usage Tracking Service
 * Tracks usage across all services for billing purposes
 */

import { logger } from '@universal-ai-cs/shared';

export interface UsageRecord {
  id: string;
  organizationId: string;
  service: string;
  endpoint?: string;
  method?: string;
  duration: number; // milliseconds
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface UsageMetrics {
  organizationId: string;
  period: { start: Date; end: Date };
  metrics: {
    totalRequests: number;
    totalDuration: number;
    averageResponseTime: number;
    byService: Record<string, {
      requests: number;
      duration: number;
      averageResponseTime: number;
    }>;
    byEndpoint: Record<string, {
      requests: number;
      duration: number;
      averageResponseTime: number;
    }>;
  };
  costs: {
    apiCalls: number;
    computeTime: number;
    storage: number;
    total: number;
  };
}

export interface QuotaLimit {
  organizationId: string;
  planId: string;
  limits: {
    apiCallsPerMinute: number;
    apiCallsPerHour: number;
    apiCallsPerDay: number;
    messagesPerHour: number;
    messagesPerDay: number;
    storageGB: number;
    users: number;
  };
  current: {
    apiCallsThisMinute: number;
    apiCallsThisHour: number;
    apiCallsThisDay: number;
    messagesThisHour: number;
    messagesThisDay: number;
    storageUsedGB: number;
    activeUsers: number;
  };
  resetTimes: {
    minute: Date;
    hour: Date;
    day: Date;
  };
}

export class UsageTrackingService {
  private static instance: UsageTrackingService;
  private usageRecords: Map<string, UsageRecord> = new Map();
  private quotaLimits: Map<string, QuotaLimit> = new Map();
  private aggregationInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {}

  public static getInstance(): UsageTrackingService {
    if (!UsageTrackingService.instance) {
      UsageTrackingService.instance = new UsageTrackingService();
    }
    return UsageTrackingService.instance;
  }

  /**
   * Initialize the usage tracking service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadQuotaLimits();
      this.startAggregation();
      this.startCleanup();
      
      logger.info('Usage Tracking Service initialized', {
        quotaLimits: this.quotaLimits.size,
        usageRecords: this.usageRecords.size,
      });
    } catch (error) {
      logger.error('Failed to initialize Usage Tracking Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record usage
   */
  public recordUsage(usage: {
    organizationId: string;
    service: string;
    endpoint?: string;
    method?: string;
    duration: number;
    timestamp: Date;
    metadata?: Record<string, any>;
  }): void {
    try {
      const recordId = `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const record: UsageRecord = {
        id: recordId,
        organizationId: usage.organizationId,
        service: usage.service,
        endpoint: usage.endpoint,
        method: usage.method,
        duration: usage.duration,
        timestamp: usage.timestamp,
        metadata: usage.metadata || {},
      };

      this.usageRecords.set(recordId, record);

      // Update quota tracking
      this.updateQuotaUsage(usage.organizationId, usage.service);

      // Check quota limits
      this.checkQuotaLimits(usage.organizationId);

    } catch (error) {
      logger.error('Error recording usage', {
        error: error instanceof Error ? error.message : String(error),
        organizationId: usage.organizationId,
        service: usage.service,
      });
    }
  }

  /**
   * Get usage metrics
   */
  public async getUsageMetrics(
    organizationId: string,
    period: { start: Date; end: Date }
  ): Promise<UsageMetrics> {
    try {
      const records = Array.from(this.usageRecords.values())
        .filter(record => 
          record.organizationId === organizationId &&
          record.timestamp >= period.start &&
          record.timestamp <= period.end
        );

      const totalRequests = records.length;
      const totalDuration = records.reduce((sum, record) => sum + record.duration, 0);
      const averageResponseTime = totalRequests > 0 ? totalDuration / totalRequests : 0;

      // Group by service
      const byService: Record<string, any> = {};
      records.forEach(record => {
        if (!byService[record.service]) {
          byService[record.service] = {
            requests: 0,
            duration: 0,
            averageResponseTime: 0,
          };
        }
        byService[record.service].requests++;
        byService[record.service].duration += record.duration;
      });

      // Calculate averages for services
      Object.keys(byService).forEach(service => {
        const serviceData = byService[service];
        serviceData.averageResponseTime = serviceData.requests > 0 
          ? serviceData.duration / serviceData.requests 
          : 0;
      });

      // Group by endpoint
      const byEndpoint: Record<string, any> = {};
      records.forEach(record => {
        if (record.endpoint) {
          const key = `${record.service}:${record.endpoint}`;
          if (!byEndpoint[key]) {
            byEndpoint[key] = {
              requests: 0,
              duration: 0,
              averageResponseTime: 0,
            };
          }
          byEndpoint[key].requests++;
          byEndpoint[key].duration += record.duration;
        }
      });

      // Calculate averages for endpoints
      Object.keys(byEndpoint).forEach(endpoint => {
        const endpointData = byEndpoint[endpoint];
        endpointData.averageResponseTime = endpointData.requests > 0 
          ? endpointData.duration / endpointData.requests 
          : 0;
      });

      // Calculate costs (simplified pricing)
      const costs = {
        apiCalls: totalRequests * 0.001, // $0.001 per API call
        computeTime: (totalDuration / 1000) * 0.0001, // $0.0001 per second
        storage: 0, // Would be calculated separately
        total: 0,
      };
      costs.total = costs.apiCalls + costs.computeTime + costs.storage;

      return {
        organizationId,
        period,
        metrics: {
          totalRequests,
          totalDuration,
          averageResponseTime,
          byService,
          byEndpoint,
        },
        costs,
      };
    } catch (error) {
      logger.error('Error getting usage metrics', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      
      return {
        organizationId,
        period,
        metrics: {
          totalRequests: 0,
          totalDuration: 0,
          averageResponseTime: 0,
          byService: {},
          byEndpoint: {},
        },
        costs: {
          apiCalls: 0,
          computeTime: 0,
          storage: 0,
          total: 0,
        },
      };
    }
  }

  /**
   * Check quota limits
   */
  public async checkQuotaLimits(organizationId: string): Promise<{
    withinLimits: boolean;
    violations: Array<{
      type: string;
      current: number;
      limit: number;
      percentage: number;
    }>;
  }> {
    try {
      const quota = this.quotaLimits.get(organizationId);
      if (!quota) {
        return { withinLimits: true, violations: [] };
      }

      const violations: any[] = [];

      // Check API calls per minute
      if (quota.current.apiCallsThisMinute > quota.limits.apiCallsPerMinute) {
        violations.push({
          type: 'apiCallsPerMinute',
          current: quota.current.apiCallsThisMinute,
          limit: quota.limits.apiCallsPerMinute,
          percentage: (quota.current.apiCallsThisMinute / quota.limits.apiCallsPerMinute) * 100,
        });
      }

      // Check API calls per hour
      if (quota.current.apiCallsThisHour > quota.limits.apiCallsPerHour) {
        violations.push({
          type: 'apiCallsPerHour',
          current: quota.current.apiCallsThisHour,
          limit: quota.limits.apiCallsPerHour,
          percentage: (quota.current.apiCallsThisHour / quota.limits.apiCallsPerHour) * 100,
        });
      }

      // Check messages per hour
      if (quota.current.messagesThisHour > quota.limits.messagesPerHour) {
        violations.push({
          type: 'messagesPerHour',
          current: quota.current.messagesThisHour,
          limit: quota.limits.messagesPerHour,
          percentage: (quota.current.messagesThisHour / quota.limits.messagesPerHour) * 100,
        });
      }

      // Check storage
      if (quota.current.storageUsedGB > quota.limits.storageGB) {
        violations.push({
          type: 'storage',
          current: quota.current.storageUsedGB,
          limit: quota.limits.storageGB,
          percentage: (quota.current.storageUsedGB / quota.limits.storageGB) * 100,
        });
      }

      if (violations.length > 0) {
        logger.warn('Quota violations detected', {
          organizationId,
          violations,
        });
      }

      return {
        withinLimits: violations.length === 0,
        violations,
      };
    } catch (error) {
      logger.error('Error checking quota limits', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      
      return { withinLimits: true, violations: [] };
    }
  }

  /**
   * Get quota status
   */
  public async getQuotaStatus(organizationId: string): Promise<QuotaLimit | null> {
    return this.quotaLimits.get(organizationId) || null;
  }

  /**
   * Update quota limits
   */
  public async updateQuotaLimits(
    organizationId: string,
    planId: string,
    limits: Partial<QuotaLimit['limits']>
  ): Promise<void> {
    try {
      let quota = this.quotaLimits.get(organizationId);
      
      if (!quota) {
        quota = {
          organizationId,
          planId,
          limits: {
            apiCallsPerMinute: 60,
            apiCallsPerHour: 1000,
            apiCallsPerDay: 10000,
            messagesPerHour: 100,
            messagesPerDay: 1000,
            storageGB: 10,
            users: 10,
          },
          current: {
            apiCallsThisMinute: 0,
            apiCallsThisHour: 0,
            apiCallsThisDay: 0,
            messagesThisHour: 0,
            messagesThisDay: 0,
            storageUsedGB: 0,
            activeUsers: 0,
          },
          resetTimes: {
            minute: new Date(Date.now() + 60 * 1000),
            hour: new Date(Date.now() + 60 * 60 * 1000),
            day: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        };
      }

      // Update limits
      quota.limits = { ...quota.limits, ...limits };
      quota.planId = planId;

      this.quotaLimits.set(organizationId, quota);

      logger.info('Quota limits updated', {
        organizationId,
        planId,
        limits: quota.limits,
      });
    } catch (error) {
      logger.error('Error updating quota limits', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        planId,
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    usageRecords: number;
    quotaLimits: number;
    aggregationActive: boolean;
    cleanupActive: boolean;
  }> {
    try {
      return {
        status: 'healthy',
        usageRecords: this.usageRecords.size,
        quotaLimits: this.quotaLimits.size,
        aggregationActive: !!this.aggregationInterval,
        cleanupActive: !!this.cleanupInterval,
      };
    } catch (error) {
      logger.error('Usage tracking health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        status: 'unhealthy',
        usageRecords: 0,
        quotaLimits: 0,
        aggregationActive: false,
        cleanupActive: false,
      };
    }
  }

  /**
   * Shutdown the service
   */
  public async shutdown(): Promise<void> {
    try {
      if (this.aggregationInterval) {
        clearInterval(this.aggregationInterval);
      }
      
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      logger.info('Usage Tracking Service shut down');
    } catch (error) {
      logger.error('Error shutting down Usage Tracking Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Private helper methods
  private async loadQuotaLimits(): Promise<void> {
    // In production, load from database
    // For now, create default quota for demo
    const defaultQuota: QuotaLimit = {
      organizationId: 'default-org',
      planId: 'professional',
      limits: {
        apiCallsPerMinute: 300,
        apiCallsPerHour: 10000,
        apiCallsPerDay: 100000,
        messagesPerHour: 1000,
        messagesPerDay: 10000,
        storageGB: 100,
        users: 50,
      },
      current: {
        apiCallsThisMinute: 0,
        apiCallsThisHour: 0,
        apiCallsThisDay: 0,
        messagesThisHour: 0,
        messagesThisDay: 0,
        storageUsedGB: 5.2,
        activeUsers: 12,
      },
      resetTimes: {
        minute: new Date(Date.now() + 60 * 1000),
        hour: new Date(Date.now() + 60 * 60 * 1000),
        day: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    };

    this.quotaLimits.set(defaultQuota.organizationId, defaultQuota);
  }

  private updateQuotaUsage(organizationId: string, service: string): void {
    const quota = this.quotaLimits.get(organizationId);
    if (!quota) return;

    const now = new Date();

    // Reset counters if time periods have passed
    if (now > quota.resetTimes.minute) {
      quota.current.apiCallsThisMinute = 0;
      quota.resetTimes.minute = new Date(now.getTime() + 60 * 1000);
    }

    if (now > quota.resetTimes.hour) {
      quota.current.apiCallsThisHour = 0;
      quota.current.messagesThisHour = 0;
      quota.resetTimes.hour = new Date(now.getTime() + 60 * 60 * 1000);
    }

    if (now > quota.resetTimes.day) {
      quota.current.apiCallsThisDay = 0;
      quota.current.messagesThisDay = 0;
      quota.resetTimes.day = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    // Increment counters
    quota.current.apiCallsThisMinute++;
    quota.current.apiCallsThisHour++;
    quota.current.apiCallsThisDay++;

    if (service === 'message-service') {
      quota.current.messagesThisHour++;
      quota.current.messagesThisDay++;
    }
  }

  private startAggregation(): void {
    // Aggregate usage data every 5 minutes
    this.aggregationInterval = setInterval(async () => {
      try {
        await this.aggregateUsageData();
      } catch (error) {
        logger.error('Error in usage aggregation', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  private startCleanup(): void {
    // Clean up old usage records every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupOldRecords();
      } catch (error) {
        logger.error('Error in usage cleanup', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  private async aggregateUsageData(): Promise<void> {
    // In production, aggregate data to database for reporting
    const organizationUsage = new Map<string, number>();
    
    for (const record of this.usageRecords.values()) {
      const count = organizationUsage.get(record.organizationId) || 0;
      organizationUsage.set(record.organizationId, count + 1);
    }

    logger.info('Usage data aggregated', {
      totalRecords: this.usageRecords.size,
      organizations: organizationUsage.size,
    });
  }

  private async cleanupOldRecords(): Promise<void> {
    // Keep only last 24 hours of detailed records
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const [id, record] of this.usageRecords.entries()) {
      if (record.timestamp.getTime() < cutoffTime) {
        this.usageRecords.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info('Old usage records cleaned up', {
        deletedCount,
        remainingRecords: this.usageRecords.size,
      });
    }
  }
}
