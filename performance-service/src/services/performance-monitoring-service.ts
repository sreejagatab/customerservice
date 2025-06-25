/**
 * Performance Monitoring Service
 * Real-time performance monitoring and alerting
 */

import { logger } from '@universal-ai-cs/shared';

export interface PerformanceMetric {
  id: string;
  timestamp: Date;
  organizationId: string;
  service: string;
  endpoint?: string;
  metrics: {
    responseTime: number;
    throughput: number;
    errorRate: number;
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    networkLatency?: number;
  };
  metadata: {
    userAgent?: string;
    ip?: string;
    method?: string;
    statusCode?: number;
    requestSize?: number;
    responseSize?: number;
  };
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  organizationId: string;
  type: 'response_time' | 'error_rate' | 'throughput' | 'resource_usage' | 'availability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  threshold: {
    metric: string;
    operator: 'greater_than' | 'less_than' | 'equals';
    value: number;
    duration: number; // minutes
  };
  currentValue: number;
  service: string;
  endpoint?: string;
  status: 'active' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

export interface RequestData {
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
}

export class PerformanceMonitoringService {
  private static instance: PerformanceMonitoringService;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private alertRules: Map<string, any> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private requestBuffer: RequestData[] = [];

  private constructor() {}

  public static getInstance(): PerformanceMonitoringService {
    if (!PerformanceMonitoringService.instance) {
      PerformanceMonitoringService.instance = new PerformanceMonitoringService();
    }
    return PerformanceMonitoringService.instance;
  }

  /**
   * Initialize the monitoring service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadAlertRules();
      this.startMonitoring();
      
      logger.info('Performance Monitoring Service initialized', {
        alertRules: this.alertRules.size,
        monitoringActive: true,
      });
    } catch (error) {
      logger.error('Failed to initialize Performance Monitoring Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record a request for monitoring
   */
  public recordRequest(requestData: RequestData): void {
    try {
      this.requestBuffer.push({
        ...requestData,
        // Add timestamp if not present
        timestamp: new Date(),
      } as any);

      // Process buffer if it gets too large
      if (this.requestBuffer.length > 1000) {
        this.processRequestBuffer();
      }
    } catch (error) {
      logger.error('Error recording request', {
        error: error instanceof Error ? error.message : String(error),
        url: requestData.url,
      });
    }
  }

  /**
   * Get performance metrics
   */
  public async getMetrics(
    organizationId: string,
    filters?: {
      service?: string;
      endpoint?: string;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    }
  ): Promise<PerformanceMetric[]> {
    try {
      let metrics = Array.from(this.metrics.values())
        .filter(metric => metric.organizationId === organizationId);

      if (filters) {
        if (filters.service) {
          metrics = metrics.filter(metric => metric.service === filters.service);
        }
        if (filters.endpoint) {
          metrics = metrics.filter(metric => metric.endpoint === filters.endpoint);
        }
        if (filters.startTime) {
          metrics = metrics.filter(metric => metric.timestamp >= filters.startTime!);
        }
        if (filters.endTime) {
          metrics = metrics.filter(metric => metric.timestamp <= filters.endTime!);
        }
      }

      // Sort by timestamp (newest first)
      metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply limit
      if (filters?.limit) {
        metrics = metrics.slice(0, filters.limit);
      }

      return metrics;
    } catch (error) {
      logger.error('Error getting performance metrics', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return [];
    }
  }

  /**
   * Get performance summary
   */
  public async getPerformanceSummary(
    organizationId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    averageResponseTime: number;
    totalRequests: number;
    errorRate: number;
    throughput: number;
    availability: number;
    trends: Array<{
      timestamp: Date;
      responseTime: number;
      throughput: number;
      errorRate: number;
    }>;
  }> {
    try {
      const metrics = await this.getMetrics(organizationId, {
        startTime: timeRange.start,
        endTime: timeRange.end,
      });

      if (metrics.length === 0) {
        return {
          averageResponseTime: 0,
          totalRequests: 0,
          errorRate: 0,
          throughput: 0,
          availability: 100,
          trends: [],
        };
      }

      const totalRequests = metrics.length;
      const averageResponseTime = metrics.reduce((sum, m) => sum + m.metrics.responseTime, 0) / totalRequests;
      const errorCount = metrics.filter(m => m.metadata.statusCode && m.metadata.statusCode >= 400).length;
      const errorRate = (errorCount / totalRequests) * 100;
      
      const timeRangeMs = timeRange.end.getTime() - timeRange.start.getTime();
      const throughput = (totalRequests / (timeRangeMs / 1000)) * 60; // requests per minute
      
      const availability = 100 - errorRate;

      // Generate hourly trends
      const trends = this.generateTrends(metrics, timeRange);

      return {
        averageResponseTime,
        totalRequests,
        errorRate,
        throughput,
        availability,
        trends,
      };
    } catch (error) {
      logger.error('Error getting performance summary', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      
      return {
        averageResponseTime: 0,
        totalRequests: 0,
        errorRate: 0,
        throughput: 0,
        availability: 0,
        trends: [],
      };
    }
  }

  /**
   * Get active alerts
   */
  public async getAlerts(
    organizationId: string,
    filters?: {
      type?: string;
      severity?: string;
      status?: string;
      limit?: number;
    }
  ): Promise<PerformanceAlert[]> {
    try {
      let alerts = Array.from(this.alerts.values())
        .filter(alert => alert.organizationId === organizationId);

      if (filters) {
        if (filters.type) {
          alerts = alerts.filter(alert => alert.type === filters.type);
        }
        if (filters.severity) {
          alerts = alerts.filter(alert => alert.severity === filters.severity);
        }
        if (filters.status) {
          alerts = alerts.filter(alert => alert.status === filters.status);
        }
      }

      // Sort by timestamp (newest first)
      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply limit
      if (filters?.limit) {
        alerts = alerts.slice(0, filters.limit);
      }

      return alerts;
    } catch (error) {
      logger.error('Error getting performance alerts', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return [];
    }
  }

  /**
   * Acknowledge an alert
   */
  public async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string,
    notes?: string
  ): Promise<void> {
    try {
      const alert = this.alerts.get(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.status = 'acknowledged';
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date();
      (alert as any).acknowledgeNotes = notes;

      logger.info('Performance alert acknowledged', {
        alertId,
        acknowledgedBy,
        notes,
      });
    } catch (error) {
      logger.error('Error acknowledging alert', {
        error: error instanceof Error ? error.message : String(error),
        alertId,
        acknowledgedBy,
      });
      throw error;
    }
  }

  /**
   * Resolve an alert
   */
  public async resolveAlert(
    alertId: string,
    resolvedBy: string,
    notes?: string
  ): Promise<void> {
    try {
      const alert = this.alerts.get(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      (alert as any).resolvedBy = resolvedBy;
      (alert as any).resolveNotes = notes;

      logger.info('Performance alert resolved', {
        alertId,
        resolvedBy,
        notes,
      });
    } catch (error) {
      logger.error('Error resolving alert', {
        error: error instanceof Error ? error.message : String(error),
        alertId,
        resolvedBy,
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metricsCollected: number;
    activeAlerts: number;
    monitoringActive: boolean;
    lastMetricTime?: Date;
  }> {
    try {
      const metrics = Array.from(this.metrics.values());
      const activeAlerts = Array.from(this.alerts.values()).filter(alert => alert.status === 'active');
      const lastMetric = metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

      return {
        status: this.monitoringInterval ? 'healthy' : 'degraded',
        metricsCollected: this.metrics.size,
        activeAlerts: activeAlerts.length,
        monitoringActive: !!this.monitoringInterval,
        lastMetricTime: lastMetric?.timestamp,
      };
    } catch (error) {
      logger.error('Performance monitoring health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        status: 'unhealthy',
        metricsCollected: 0,
        activeAlerts: 0,
        monitoringActive: false,
      };
    }
  }

  /**
   * Shutdown the service
   */
  public async shutdown(): Promise<void> {
    try {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }

      // Process any remaining requests in buffer
      if (this.requestBuffer.length > 0) {
        this.processRequestBuffer();
      }

      logger.info('Performance Monitoring Service shut down');
    } catch (error) {
      logger.error('Error shutting down Performance Monitoring Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Private helper methods
  private async loadAlertRules(): Promise<void> {
    // Load default alert rules
    const defaultRules = [
      {
        id: 'high_response_time',
        name: 'High Response Time',
        type: 'response_time',
        threshold: { metric: 'responseTime', operator: 'greater_than', value: 5000, duration: 5 },
        severity: 'high',
        enabled: true,
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        type: 'error_rate',
        threshold: { metric: 'errorRate', operator: 'greater_than', value: 5, duration: 5 },
        severity: 'critical',
        enabled: true,
      },
      {
        id: 'low_throughput',
        name: 'Low Throughput',
        type: 'throughput',
        threshold: { metric: 'throughput', operator: 'less_than', value: 10, duration: 10 },
        severity: 'medium',
        enabled: true,
      },
    ];

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
    });
  }

  private startMonitoring(): void {
    // Process request buffer and check alerts every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        this.processRequestBuffer();
        await this.checkAlertRules();
        this.cleanupOldData();
      } catch (error) {
        logger.error('Error in monitoring interval', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000); // 30 seconds
  }

  private processRequestBuffer(): void {
    if (this.requestBuffer.length === 0) return;

    try {
      // Group requests by service and endpoint
      const grouped = this.groupRequestsByEndpoint(this.requestBuffer);
      
      // Generate metrics for each group
      for (const [key, requests] of grouped.entries()) {
        const metric = this.generateMetricFromRequests(key, requests);
        this.metrics.set(metric.id, metric);
      }

      // Clear buffer
      this.requestBuffer = [];
    } catch (error) {
      logger.error('Error processing request buffer', {
        error: error instanceof Error ? error.message : String(error),
        bufferSize: this.requestBuffer.length,
      });
    }
  }

  private groupRequestsByEndpoint(requests: RequestData[]): Map<string, RequestData[]> {
    const grouped = new Map<string, RequestData[]>();
    
    requests.forEach(request => {
      const key = `${request.method}:${request.url}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(request);
    });
    
    return grouped;
  }

  private generateMetricFromRequests(key: string, requests: RequestData[]): PerformanceMetric {
    const [method, url] = key.split(':', 2);
    
    const totalRequests = requests.length;
    const averageResponseTime = requests.reduce((sum, r) => sum + r.duration, 0) / totalRequests;
    const errorCount = requests.filter(r => r.statusCode >= 400).length;
    const errorRate = (errorCount / totalRequests) * 100;
    
    const timeSpan = Math.max(1, (Date.now() - requests[0].timestamp.getTime()) / 1000);
    const throughput = totalRequests / timeSpan;

    return {
      id: `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      organizationId: 'default-org', // In production, extract from request context
      service: 'api-gateway', // In production, determine from request
      endpoint: url,
      metrics: {
        responseTime: averageResponseTime,
        throughput,
        errorRate,
      },
      metadata: {
        method,
        requestCount: totalRequests,
        errorCount,
      } as any,
    };
  }

  private async checkAlertRules(): Promise<void> {
    // Simple alert checking - in production, implement more sophisticated logic
    const recentMetrics = Array.from(this.metrics.values())
      .filter(metric => Date.now() - metric.timestamp.getTime() < 5 * 60 * 1000); // Last 5 minutes

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      const relevantMetrics = recentMetrics.filter(metric => {
        // Filter metrics relevant to this rule
        return true; // Simplified for demo
      });

      if (relevantMetrics.length === 0) continue;

      // Check if threshold is exceeded
      const currentValue = this.calculateMetricValue(rule.threshold.metric, relevantMetrics);
      const thresholdExceeded = this.evaluateThreshold(currentValue, rule.threshold);

      if (thresholdExceeded) {
        await this.createAlert(rule, currentValue, relevantMetrics[0]);
      }
    }
  }

  private calculateMetricValue(metric: string, metrics: PerformanceMetric[]): number {
    switch (metric) {
      case 'responseTime':
        return metrics.reduce((sum, m) => sum + m.metrics.responseTime, 0) / metrics.length;
      case 'errorRate':
        return metrics.reduce((sum, m) => sum + m.metrics.errorRate, 0) / metrics.length;
      case 'throughput':
        return metrics.reduce((sum, m) => sum + m.metrics.throughput, 0) / metrics.length;
      default:
        return 0;
    }
  }

  private evaluateThreshold(value: number, threshold: any): boolean {
    switch (threshold.operator) {
      case 'greater_than':
        return value > threshold.value;
      case 'less_than':
        return value < threshold.value;
      case 'equals':
        return value === threshold.value;
      default:
        return false;
    }
  }

  private async createAlert(rule: any, currentValue: number, metric: PerformanceMetric): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: PerformanceAlert = {
      id: alertId,
      timestamp: new Date(),
      organizationId: metric.organizationId,
      type: rule.type,
      severity: rule.severity,
      title: rule.name,
      description: `${rule.name}: Current value ${currentValue.toFixed(2)} exceeds threshold ${rule.threshold.value}`,
      threshold: rule.threshold,
      currentValue,
      service: metric.service,
      endpoint: metric.endpoint,
      status: 'active',
    };

    this.alerts.set(alertId, alert);

    logger.warn('Performance alert created', {
      alertId,
      type: alert.type,
      severity: alert.severity,
      currentValue,
      threshold: rule.threshold.value,
    });
  }

  private generateTrends(metrics: PerformanceMetric[], timeRange: { start: Date; end: Date }): any[] {
    // Generate hourly trends
    const trends: any[] = [];
    const hourMs = 60 * 60 * 1000;
    
    for (let time = timeRange.start.getTime(); time < timeRange.end.getTime(); time += hourMs) {
      const hourStart = new Date(time);
      const hourEnd = new Date(time + hourMs);
      
      const hourMetrics = metrics.filter(m => 
        m.timestamp >= hourStart && m.timestamp < hourEnd
      );

      if (hourMetrics.length > 0) {
        trends.push({
          timestamp: hourStart,
          responseTime: hourMetrics.reduce((sum, m) => sum + m.metrics.responseTime, 0) / hourMetrics.length,
          throughput: hourMetrics.reduce((sum, m) => sum + m.metrics.throughput, 0) / hourMetrics.length,
          errorRate: hourMetrics.reduce((sum, m) => sum + m.metrics.errorRate, 0) / hourMetrics.length,
        });
      }
    }
    
    return trends;
  }

  private cleanupOldData(): void {
    // Keep only last 24 hours of metrics
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    
    for (const [id, metric] of this.metrics.entries()) {
      if (metric.timestamp.getTime() < cutoffTime) {
        this.metrics.delete(id);
      }
    }

    // Keep only last 7 days of alerts
    const alertCutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.timestamp.getTime() < alertCutoffTime && alert.status === 'resolved') {
        this.alerts.delete(id);
      }
    }
  }
}
