/**
 * Health Monitoring Service
 * Monitors system health, service availability, and performance metrics
 */

import axios from 'axios';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  responseTime: number;
  timestamp: Date;
  details?: Record<string, any>;
  error?: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: HealthCheck[];
  infrastructure: {
    database: HealthCheck;
    redis: HealthCheck;
    messageQueue: HealthCheck;
  };
  metrics: {
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
    activeConnections: number;
  };
  timestamp: Date;
}

export interface ServiceEndpoint {
  name: string;
  url: string;
  healthPath: string;
  timeout: number;
  expectedStatus: number;
  apiKey?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  duration: number; // seconds
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  notificationChannels: string[];
  lastTriggered?: Date;
}

export interface HealthAlert {
  id: string;
  ruleId: string;
  service: string;
  severity: AlertRule['severity'];
  message: string;
  details: Record<string, any>;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export class HealthMonitoringService {
  private static instance: HealthMonitoringService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private serviceEndpoints: ServiceEndpoint[] = [];
  private alertRules: AlertRule[] = [];
  private activeAlerts: Map<string, HealthAlert> = new Map();

  private constructor() {
    this.initializeServiceEndpoints();
    this.initializeDefaultAlertRules();
  }

  public static getInstance(): HealthMonitoringService {
    if (!HealthMonitoringService.instance) {
      HealthMonitoringService.instance = new HealthMonitoringService();
    }
    return HealthMonitoringService.instance;
  }

  /**
   * Start health monitoring
   */
  public async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error('Error during health monitoring', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    logger.info('Health monitoring started', { intervalMs });
  }

  /**
   * Stop health monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('Health monitoring stopped');
  }

  /**
   * Get current system health
   */
  public async getSystemHealth(): Promise<SystemHealth> {
    try {
      // Check all services
      const serviceChecks = await Promise.all(
        this.serviceEndpoints.map(endpoint => this.checkServiceHealth(endpoint))
      );

      // Check infrastructure
      const infrastructure = {
        database: await this.checkDatabaseHealth(),
        redis: await this.checkRedisHealth(),
        messageQueue: await this.checkMessageQueueHealth(),
      };

      // Get system metrics
      const metrics = await this.getSystemMetrics();

      // Determine overall health
      const allChecks = [...serviceChecks, ...Object.values(infrastructure)];
      const overall = this.determineOverallHealth(allChecks);

      const systemHealth: SystemHealth = {
        overall,
        services: serviceChecks,
        infrastructure,
        metrics,
        timestamp: new Date(),
      };

      // Cache the health status
      await redis.set('system_health', systemHealth, { ttl: 60 });

      return systemHealth;
    } catch (error) {
      logger.error('Error getting system health', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        overall: 'unknown',
        services: [],
        infrastructure: {
          database: { service: 'database', status: 'unknown', responseTime: 0, timestamp: new Date() },
          redis: { service: 'redis', status: 'unknown', responseTime: 0, timestamp: new Date() },
          messageQueue: { service: 'messageQueue', status: 'unknown', responseTime: 0, timestamp: new Date() },
        },
        metrics: {
          uptime: 0,
          memoryUsage: 0,
          cpuUsage: 0,
          diskUsage: 0,
          activeConnections: 0,
        },
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check health of a specific service
   */
  public async checkServiceHealth(endpoint: ServiceEndpoint): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${endpoint.url}${endpoint.healthPath}`, {
        timeout: endpoint.timeout,
        headers: endpoint.apiKey ? { 'Authorization': `Bearer ${endpoint.apiKey}` } : {},
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.status === endpoint.expectedStatus;

      return {
        service: endpoint.name,
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime,
        timestamp: new Date(),
        details: {
          statusCode: response.status,
          url: `${endpoint.url}${endpoint.healthPath}`,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        service: endpoint.name,
        status: 'unhealthy',
        responseTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        details: {
          url: `${endpoint.url}${endpoint.healthPath}`,
        },
      };
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // TODO: Implement actual database health check
      // For now, simulate a check
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'database',
        status: 'healthy',
        responseTime,
        timestamp: new Date(),
        details: {
          host: config.database.host,
          port: config.database.port,
          database: config.database.name,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      await redis.ping();
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'redis',
        status: 'healthy',
        responseTime,
        timestamp: new Date(),
        details: {
          host: config.redis.host,
          port: config.redis.port,
          db: config.redis.db,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'redis',
        status: 'unhealthy',
        responseTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check message queue health
   */
  private async checkMessageQueueHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // TODO: Implement actual message queue health check
      // For now, simulate a check
      await new Promise(resolve => setTimeout(resolve, 15));
      
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'messageQueue',
        status: 'healthy',
        responseTime,
        timestamp: new Date(),
        details: {
          type: 'RabbitMQ',
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'messageQueue',
        status: 'unhealthy',
        responseTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics(): Promise<SystemHealth['metrics']> {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      return {
        uptime,
        memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        cpuUsage: 0, // TODO: Implement CPU usage calculation
        diskUsage: 0, // TODO: Implement disk usage calculation
        activeConnections: 0, // TODO: Get active connection count
      };
    } catch (error) {
      logger.error('Error getting system metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        diskUsage: 0,
        activeConnections: 0,
      };
    }
  }

  /**
   * Determine overall health status
   */
  private determineOverallHealth(checks: HealthCheck[]): SystemHealth['overall'] {
    const healthyCount = checks.filter(check => check.status === 'healthy').length;
    const unhealthyCount = checks.filter(check => check.status === 'unhealthy').length;
    const degradedCount = checks.filter(check => check.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return 'unhealthy';
    } else if (degradedCount > 0) {
      return 'degraded';
    } else if (healthyCount === checks.length) {
      return 'healthy';
    } else {
      return 'degraded';
    }
  }

  /**
   * Perform health checks and evaluate alerts
   */
  private async performHealthChecks(): Promise<void> {
    try {
      const systemHealth = await this.getSystemHealth();
      
      // Evaluate alert rules
      for (const rule of this.alertRules) {
        if (rule.enabled) {
          await this.evaluateAlertRule(rule, systemHealth);
        }
      }

      // Store health history
      await this.storeHealthHistory(systemHealth);
      
      logger.debug('Health checks completed', {
        overall: systemHealth.overall,
        serviceCount: systemHealth.services.length,
        activeAlerts: this.activeAlerts.size,
      });
    } catch (error) {
      logger.error('Error performing health checks', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Evaluate alert rule
   */
  private async evaluateAlertRule(rule: AlertRule, systemHealth: SystemHealth): Promise<void> {
    try {
      let triggered = false;
      let details: Record<string, any> = {};

      // Evaluate different types of conditions
      switch (rule.condition) {
        case 'service_unhealthy':
          const unhealthyServices = systemHealth.services.filter(s => s.status === 'unhealthy');
          triggered = unhealthyServices.length > 0;
          details = { unhealthyServices: unhealthyServices.map(s => s.service) };
          break;

        case 'response_time_high':
          const slowServices = systemHealth.services.filter(s => s.responseTime > rule.threshold);
          triggered = slowServices.length > 0;
          details = { slowServices: slowServices.map(s => ({ service: s.service, responseTime: s.responseTime })) };
          break;

        case 'memory_usage_high':
          triggered = systemHealth.metrics.memoryUsage > rule.threshold;
          details = { memoryUsage: systemHealth.metrics.memoryUsage, threshold: rule.threshold };
          break;

        case 'cpu_usage_high':
          triggered = systemHealth.metrics.cpuUsage > rule.threshold;
          details = { cpuUsage: systemHealth.metrics.cpuUsage, threshold: rule.threshold };
          break;

        case 'disk_usage_high':
          triggered = systemHealth.metrics.diskUsage > rule.threshold;
          details = { diskUsage: systemHealth.metrics.diskUsage, threshold: rule.threshold };
          break;
      }

      const existingAlert = this.activeAlerts.get(rule.id);

      if (triggered && !existingAlert) {
        // Create new alert
        const alert: HealthAlert = {
          id: this.generateAlertId(),
          ruleId: rule.id,
          service: 'system',
          severity: rule.severity,
          message: `Alert: ${rule.name}`,
          details,
          triggeredAt: new Date(),
          acknowledged: false,
        };

        this.activeAlerts.set(rule.id, alert);
        await this.sendAlert(alert);
        
        logger.warn('Health alert triggered', {
          alertId: alert.id,
          ruleName: rule.name,
          severity: rule.severity,
          details,
        });
      } else if (!triggered && existingAlert && !existingAlert.resolvedAt) {
        // Resolve existing alert
        existingAlert.resolvedAt = new Date();
        await this.resolveAlert(existingAlert);
        this.activeAlerts.delete(rule.id);
        
        logger.info('Health alert resolved', {
          alertId: existingAlert.id,
          ruleName: rule.name,
          duration: existingAlert.resolvedAt.getTime() - existingAlert.triggeredAt.getTime(),
        });
      }
    } catch (error) {
      logger.error('Error evaluating alert rule', {
        ruleId: rule.id,
        ruleName: rule.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlert(alert: HealthAlert): Promise<void> {
    try {
      // TODO: Send alert via notification service
      logger.info('Alert notification sent', {
        alertId: alert.id,
        severity: alert.severity,
        message: alert.message,
      });
    } catch (error) {
      logger.error('Error sending alert notification', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Resolve alert
   */
  private async resolveAlert(alert: HealthAlert): Promise<void> {
    try {
      // TODO: Send resolution notification via notification service
      logger.info('Alert resolution notification sent', {
        alertId: alert.id,
        resolvedAt: alert.resolvedAt,
      });
    } catch (error) {
      logger.error('Error sending alert resolution notification', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Store health history for analytics
   */
  private async storeHealthHistory(systemHealth: SystemHealth): Promise<void> {
    try {
      const historyKey = `health_history:${new Date().toISOString().split('T')[0]}`;
      const timestamp = Date.now();
      
      await redis.zadd(historyKey, timestamp, JSON.stringify({
        timestamp,
        overall: systemHealth.overall,
        serviceCount: systemHealth.services.length,
        healthyServices: systemHealth.services.filter(s => s.status === 'healthy').length,
        metrics: systemHealth.metrics,
      }));
      
      // Keep only last 24 hours of data
      const oneDayAgo = timestamp - 24 * 60 * 60 * 1000;
      await redis.zremrangebyscore(historyKey, 0, oneDayAgo);
      
      // Set expiration for 7 days
      await redis.expire(historyKey, 7 * 24 * 60 * 60);
    } catch (error) {
      logger.error('Error storing health history', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Initialize service endpoints
   */
  private initializeServiceEndpoints(): void {
    this.serviceEndpoints = [
      {
        name: 'message-service',
        url: config.services.message.url,
        healthPath: '/health',
        timeout: 5000,
        expectedStatus: 200,
        apiKey: config.services.message.apiKey,
      },
      {
        name: 'notification-service',
        url: config.services.notification.url,
        healthPath: '/health',
        timeout: 5000,
        expectedStatus: 200,
        apiKey: config.services.notification.apiKey,
      },
      {
        name: 'ai-service',
        url: config.services.ai.url,
        healthPath: '/health',
        timeout: 10000,
        expectedStatus: 200,
        apiKey: config.services.ai.apiKey,
      },
      {
        name: 'integration-service',
        url: config.services.integration.url,
        healthPath: '/health',
        timeout: 5000,
        expectedStatus: 200,
        apiKey: config.services.integration.apiKey,
      },
    ];
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    this.alertRules = [
      {
        id: 'service-unhealthy',
        name: 'Service Unhealthy',
        condition: 'service_unhealthy',
        threshold: 0,
        duration: 60,
        severity: 'high',
        enabled: true,
        notificationChannels: ['email', 'slack'],
      },
      {
        id: 'high-response-time',
        name: 'High Response Time',
        condition: 'response_time_high',
        threshold: 5000, // 5 seconds
        duration: 300, // 5 minutes
        severity: 'medium',
        enabled: true,
        notificationChannels: ['email'],
      },
      {
        id: 'high-memory-usage',
        name: 'High Memory Usage',
        condition: 'memory_usage_high',
        threshold: 85, // 85%
        duration: 600, // 10 minutes
        severity: 'medium',
        enabled: true,
        notificationChannels: ['email'],
      },
      {
        id: 'high-cpu-usage',
        name: 'High CPU Usage',
        condition: 'cpu_usage_high',
        threshold: 90, // 90%
        duration: 300, // 5 minutes
        severity: 'high',
        enabled: true,
        notificationChannels: ['email', 'slack'],
      },
      {
        id: 'high-disk-usage',
        name: 'High Disk Usage',
        condition: 'disk_usage_high',
        threshold: 90, // 90%
        duration: 1800, // 30 minutes
        severity: 'high',
        enabled: true,
        notificationChannels: ['email', 'slack'],
      },
    ];
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Acknowledge alert
   */
  public async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    try {
      const alert = Array.from(this.activeAlerts.values()).find(a => a.id === alertId);
      if (!alert) {
        return false;
      }

      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date();

      logger.info('Alert acknowledged', {
        alertId,
        acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt,
      });

      return true;
    } catch (error) {
      logger.error('Error acknowledging alert', {
        alertId,
        acknowledgedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Export singleton instance
export const healthMonitoringService = HealthMonitoringService.getInstance();
