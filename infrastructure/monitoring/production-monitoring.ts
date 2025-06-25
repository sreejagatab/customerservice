/**
 * Production Monitoring System
 * Comprehensive monitoring, alerting, and observability
 */

import { EventEmitter } from 'events';
import { Logger } from '@universal-ai-cs/shared';
import * as prometheus from 'prom-client';

export interface MonitoringMetrics {
  system: {
    cpu: number;
    memory: number;
    disk: number;
    network: {
      inbound: number;
      outbound: number;
    };
  };
  application: {
    requestRate: number;
    responseTime: number;
    errorRate: number;
    activeConnections: number;
    queueSize: number;
  };
  business: {
    messagesProcessed: number;
    aiRequestsPerMinute: number;
    customerSatisfaction: number;
    revenuePerHour: number;
    activeUsers: number;
  };
  infrastructure: {
    databaseConnections: number;
    cacheHitRate: number;
    storageUsage: number;
    loadBalancerHealth: number;
  };
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  service: string;
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: Date;
  status: 'firing' | 'resolved';
  duration: number;
  runbook?: string;
  tags: Record<string, string>;
}

export interface HealthCheck {
  service: string;
  endpoint: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  lastCheck: Date;
  consecutiveFailures: number;
  details: {
    database: boolean;
    cache: boolean;
    externalServices: boolean;
    diskSpace: boolean;
    memory: boolean;
  };
}

export interface PerformanceReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    availability: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
  };
  trends: {
    responseTime: number[];
    errorRate: number[];
    throughput: number[];
    userGrowth: number[];
  };
  incidents: Array<{
    id: string;
    title: string;
    severity: string;
    duration: number;
    impact: string;
    resolution: string;
  }>;
  recommendations: Array<{
    category: 'performance' | 'cost' | 'security' | 'reliability';
    priority: 'high' | 'medium' | 'low';
    description: string;
    estimatedImpact: string;
  }>;
}

export class ProductionMonitoring extends EventEmitter {
  private logger: Logger;
  private metrics: MonitoringMetrics;
  private alerts: Map<string, Alert> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private prometheusRegistry: prometheus.Registry;
  private metricsCollectors: Map<string, prometheus.Metric> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();

  constructor() {
    super();
    this.logger = new Logger('ProductionMonitoring');
    this.prometheusRegistry = new prometheus.Registry();
    
    this.metrics = {
      system: { cpu: 0, memory: 0, disk: 0, network: { inbound: 0, outbound: 0 } },
      application: { requestRate: 0, responseTime: 0, errorRate: 0, activeConnections: 0, queueSize: 0 },
      business: { messagesProcessed: 0, aiRequestsPerMinute: 0, customerSatisfaction: 0, revenuePerHour: 0, activeUsers: 0 },
      infrastructure: { databaseConnections: 0, cacheHitRate: 0, storageUsage: 0, loadBalancerHealth: 0 },
    };

    this.initializeMetrics();
    this.initializeAlertRules();
    this.startMonitoring();
  }

  /**
   * Initialize Prometheus metrics
   */
  private initializeMetrics(): void {
    // System metrics
    this.metricsCollectors.set('cpu_usage', new prometheus.Gauge({
      name: 'system_cpu_usage_percent',
      help: 'CPU usage percentage',
      labelNames: ['service', 'instance'],
      registers: [this.prometheusRegistry],
    }));

    this.metricsCollectors.set('memory_usage', new prometheus.Gauge({
      name: 'system_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['service', 'instance'],
      registers: [this.prometheusRegistry],
    }));

    // Application metrics
    this.metricsCollectors.set('http_requests_total', new prometheus.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'service'],
      registers: [this.prometheusRegistry],
    }));

    this.metricsCollectors.set('http_request_duration', new prometheus.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'service'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.prometheusRegistry],
    }));

    this.metricsCollectors.set('active_connections', new prometheus.Gauge({
      name: 'active_connections_total',
      help: 'Number of active connections',
      labelNames: ['service'],
      registers: [this.prometheusRegistry],
    }));

    // Business metrics
    this.metricsCollectors.set('messages_processed', new prometheus.Counter({
      name: 'messages_processed_total',
      help: 'Total messages processed',
      labelNames: ['type', 'status'],
      registers: [this.prometheusRegistry],
    }));

    this.metricsCollectors.set('ai_requests', new prometheus.Counter({
      name: 'ai_requests_total',
      help: 'Total AI requests',
      labelNames: ['provider', 'model', 'status'],
      registers: [this.prometheusRegistry],
    }));

    this.metricsCollectors.set('customer_satisfaction', new prometheus.Gauge({
      name: 'customer_satisfaction_score',
      help: 'Customer satisfaction score',
      labelNames: ['period'],
      registers: [this.prometheusRegistry],
    }));

    // Infrastructure metrics
    this.metricsCollectors.set('database_connections', new prometheus.Gauge({
      name: 'database_connections_active',
      help: 'Active database connections',
      labelNames: ['database', 'pool'],
      registers: [this.prometheusRegistry],
    }));

    this.metricsCollectors.set('cache_hit_rate', new prometheus.Gauge({
      name: 'cache_hit_rate_percent',
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type'],
      registers: [this.prometheusRegistry],
    }));
  }

  /**
   * Initialize alert rules
   */
  private initializeAlertRules(): void {
    // Critical alerts
    this.alertRules.set('high_error_rate', {
      metric: 'error_rate',
      threshold: 5, // 5%
      severity: 'critical',
      duration: 300, // 5 minutes
      description: 'Error rate is above 5% for 5 minutes',
      runbook: 'https://docs.company.com/runbooks/high-error-rate',
    });

    this.alertRules.set('high_response_time', {
      metric: 'response_time',
      threshold: 2000, // 2 seconds
      severity: 'critical',
      duration: 300,
      description: 'Average response time is above 2 seconds for 5 minutes',
      runbook: 'https://docs.company.com/runbooks/high-response-time',
    });

    this.alertRules.set('service_down', {
      metric: 'service_availability',
      threshold: 0.95, // 95%
      severity: 'critical',
      duration: 60,
      description: 'Service availability is below 95% for 1 minute',
      runbook: 'https://docs.company.com/runbooks/service-down',
    });

    // Warning alerts
    this.alertRules.set('high_cpu_usage', {
      metric: 'cpu_usage',
      threshold: 80, // 80%
      severity: 'warning',
      duration: 600, // 10 minutes
      description: 'CPU usage is above 80% for 10 minutes',
      runbook: 'https://docs.company.com/runbooks/high-cpu',
    });

    this.alertRules.set('high_memory_usage', {
      metric: 'memory_usage',
      threshold: 85, // 85%
      severity: 'warning',
      duration: 600,
      description: 'Memory usage is above 85% for 10 minutes',
      runbook: 'https://docs.company.com/runbooks/high-memory',
    });

    this.alertRules.set('low_cache_hit_rate', {
      metric: 'cache_hit_rate',
      threshold: 70, // 70%
      severity: 'warning',
      duration: 900, // 15 minutes
      description: 'Cache hit rate is below 70% for 15 minutes',
      runbook: 'https://docs.company.com/runbooks/low-cache-hit-rate',
    });
  }

  /**
   * Start monitoring processes
   */
  private startMonitoring(): void {
    // Collect metrics every 30 seconds
    setInterval(() => {
      this.collectMetrics();
    }, 30000);

    // Evaluate alerts every minute
    setInterval(() => {
      this.evaluateAlerts();
    }, 60000);

    // Health checks every 30 seconds
    setInterval(() => {
      this.performHealthChecks();
    }, 30000);

    // Generate reports every hour
    setInterval(() => {
      this.generateHourlyReport();
    }, 3600000);

    this.logger.info('Production monitoring started');
  }

  /**
   * Collect system and application metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      // Collect system metrics
      await this.collectSystemMetrics();

      // Collect application metrics
      await this.collectApplicationMetrics();

      // Collect business metrics
      await this.collectBusinessMetrics();

      // Collect infrastructure metrics
      await this.collectInfrastructureMetrics();

      this.emit('metrics.collected', this.metrics);
    } catch (error) {
      this.logger.error('Error collecting metrics', { error });
    }
  }

  /**
   * Evaluate alert rules
   */
  private evaluateAlerts(): void {
    for (const [ruleId, rule] of this.alertRules) {
      try {
        const currentValue = this.getCurrentMetricValue(rule.metric);
        const shouldAlert = this.shouldTriggerAlert(rule, currentValue);

        if (shouldAlert) {
          this.triggerAlert(ruleId, rule, currentValue);
        } else {
          this.resolveAlert(ruleId);
        }
      } catch (error) {
        this.logger.error('Error evaluating alert rule', { ruleId, error });
      }
    }
  }

  /**
   * Perform health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    const services = [
      'api-gateway',
      'ai-service',
      'integration-service',
      'analytics-service',
      'workflow-service',
      'voice-service',
      'notification-service',
      'message-service',
      'partner-service',
    ];

    for (const service of services) {
      try {
        const health = await this.checkServiceHealth(service);
        this.healthChecks.set(service, health);

        if (health.status === 'unhealthy') {
          this.triggerServiceDownAlert(service, health);
        }
      } catch (error) {
        this.logger.error('Error performing health check', { service, error });
      }
    }

    this.emit('health.checked', Array.from(this.healthChecks.values()));
  }

  /**
   * Generate performance report
   */
  public async generatePerformanceReport(
    startDate: Date,
    endDate: Date
  ): Promise<PerformanceReport> {
    try {
      const report: PerformanceReport = {
        period: { start: startDate, end: endDate },
        summary: await this.calculateSummaryMetrics(startDate, endDate),
        trends: await this.calculateTrends(startDate, endDate),
        incidents: await this.getIncidents(startDate, endDate),
        recommendations: await this.generateRecommendations(),
      };

      this.emit('report.generated', report);
      return report;
    } catch (error) {
      this.logger.error('Error generating performance report', { error });
      throw error;
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => alert.status === 'firing');
  }

  /**
   * Get health status
   */
  public getHealthStatus(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  /**
   * Get Prometheus metrics
   */
  public getPrometheusMetrics(): string {
    return this.prometheusRegistry.metrics();
  }

  /**
   * Private helper methods
   */
  private async collectSystemMetrics(): Promise<void> {
    // Implementation would collect actual system metrics
    // For now, using mock data
    this.metrics.system = {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: {
        inbound: Math.random() * 1000,
        outbound: Math.random() * 1000,
      },
    };

    // Update Prometheus metrics
    (this.metricsCollectors.get('cpu_usage') as prometheus.Gauge)?.set(
      { service: 'system', instance: 'main' },
      this.metrics.system.cpu
    );

    (this.metricsCollectors.get('memory_usage') as prometheus.Gauge)?.set(
      { service: 'system', instance: 'main' },
      this.metrics.system.memory * 1024 * 1024 * 1024 // Convert to bytes
    );
  }

  private async collectApplicationMetrics(): Promise<void> {
    // Implementation would collect actual application metrics
    this.metrics.application = {
      requestRate: Math.random() * 1000,
      responseTime: Math.random() * 2000,
      errorRate: Math.random() * 10,
      activeConnections: Math.floor(Math.random() * 500),
      queueSize: Math.floor(Math.random() * 100),
    };
  }

  private async collectBusinessMetrics(): Promise<void> {
    // Implementation would collect actual business metrics
    this.metrics.business = {
      messagesProcessed: Math.floor(Math.random() * 10000),
      aiRequestsPerMinute: Math.floor(Math.random() * 500),
      customerSatisfaction: 4.0 + Math.random(),
      revenuePerHour: Math.random() * 1000,
      activeUsers: Math.floor(Math.random() * 5000),
    };
  }

  private async collectInfrastructureMetrics(): Promise<void> {
    // Implementation would collect actual infrastructure metrics
    this.metrics.infrastructure = {
      databaseConnections: Math.floor(Math.random() * 100),
      cacheHitRate: 70 + Math.random() * 30,
      storageUsage: Math.random() * 100,
      loadBalancerHealth: Math.random() > 0.1 ? 100 : 0,
    };
  }

  private getCurrentMetricValue(metric: string): number {
    // Map metric names to actual values
    const metricMap: Record<string, number> = {
      error_rate: this.metrics.application.errorRate,
      response_time: this.metrics.application.responseTime,
      cpu_usage: this.metrics.system.cpu,
      memory_usage: this.metrics.system.memory,
      cache_hit_rate: this.metrics.infrastructure.cacheHitRate,
      service_availability: this.metrics.infrastructure.loadBalancerHealth,
    };

    return metricMap[metric] || 0;
  }

  private shouldTriggerAlert(rule: AlertRule, currentValue: number): boolean {
    // Simple threshold-based alerting
    if (rule.metric === 'cache_hit_rate' || rule.metric === 'service_availability') {
      return currentValue < rule.threshold;
    }
    return currentValue > rule.threshold;
  }

  private triggerAlert(ruleId: string, rule: AlertRule, currentValue: number): void {
    const existingAlert = this.alerts.get(ruleId);
    
    if (!existingAlert || existingAlert.status === 'resolved') {
      const alert: Alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        severity: rule.severity,
        title: `${rule.metric} threshold exceeded`,
        description: rule.description,
        service: 'universal-ai-cs',
        metric: rule.metric,
        threshold: rule.threshold,
        currentValue,
        timestamp: new Date(),
        status: 'firing',
        duration: 0,
        runbook: rule.runbook,
        tags: { rule: ruleId },
      };

      this.alerts.set(ruleId, alert);
      this.emit('alert.triggered', alert);

      this.logger.warn('Alert triggered', {
        ruleId,
        metric: rule.metric,
        threshold: rule.threshold,
        currentValue,
      });
    }
  }

  private resolveAlert(ruleId: string): void {
    const alert = this.alerts.get(ruleId);
    if (alert && alert.status === 'firing') {
      alert.status = 'resolved';
      alert.duration = Date.now() - alert.timestamp.getTime();

      this.emit('alert.resolved', alert);

      this.logger.info('Alert resolved', {
        ruleId,
        duration: alert.duration,
      });
    }
  }

  private async checkServiceHealth(service: string): Promise<HealthCheck> {
    // Implementation would perform actual health checks
    const isHealthy = Math.random() > 0.05; // 95% uptime simulation

    return {
      service,
      endpoint: `http://${service}:3000/health`,
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: Math.random() * 1000,
      lastCheck: new Date(),
      consecutiveFailures: isHealthy ? 0 : Math.floor(Math.random() * 5),
      details: {
        database: isHealthy,
        cache: isHealthy,
        externalServices: isHealthy,
        diskSpace: isHealthy,
        memory: isHealthy,
      },
    };
  }

  private triggerServiceDownAlert(service: string, health: HealthCheck): void {
    const alertId = `service_down_${service}`;
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity: 'critical',
      title: `Service ${service} is down`,
      description: `Service ${service} failed health check`,
      service,
      metric: 'service_availability',
      threshold: 1,
      currentValue: 0,
      timestamp: new Date(),
      status: 'firing',
      duration: 0,
      runbook: 'https://docs.company.com/runbooks/service-down',
      tags: { service, type: 'health_check' },
    };

    this.alerts.set(alertId, alert);
    this.emit('alert.triggered', alert);
  }

  private async calculateSummaryMetrics(startDate: Date, endDate: Date): Promise<PerformanceReport['summary']> {
    // Implementation would calculate actual summary metrics
    return {
      availability: 99.5,
      averageResponseTime: 250,
      errorRate: 0.5,
      throughput: 1000,
    };
  }

  private async calculateTrends(startDate: Date, endDate: Date): Promise<PerformanceReport['trends']> {
    // Implementation would calculate actual trends
    return {
      responseTime: Array.from({ length: 24 }, () => Math.random() * 1000),
      errorRate: Array.from({ length: 24 }, () => Math.random() * 5),
      throughput: Array.from({ length: 24 }, () => Math.random() * 2000),
      userGrowth: Array.from({ length: 24 }, () => Math.random() * 100),
    };
  }

  private async getIncidents(startDate: Date, endDate: Date): Promise<PerformanceReport['incidents']> {
    // Implementation would fetch actual incidents
    return [];
  }

  private async generateRecommendations(): Promise<PerformanceReport['recommendations']> {
    // Implementation would generate actual recommendations
    return [
      {
        category: 'performance',
        priority: 'high',
        description: 'Consider adding more cache layers to improve response times',
        estimatedImpact: '20% reduction in response time',
      },
    ];
  }

  private generateHourlyReport(): void {
    const report = {
      timestamp: new Date(),
      metrics: this.metrics,
      activeAlerts: this.getActiveAlerts().length,
      healthyServices: Array.from(this.healthChecks.values()).filter(h => h.status === 'healthy').length,
      totalServices: this.healthChecks.size,
    };

    this.emit('report.hourly', report);
  }
}

interface AlertRule {
  metric: string;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  duration: number;
  description: string;
  runbook?: string;
}

export default ProductionMonitoring;
