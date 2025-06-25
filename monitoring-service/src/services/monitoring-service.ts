/**
 * Monitoring Service
 * System monitoring and health checks
 */

import { logger } from '@universal-ai-cs/shared';
import axios from 'axios';
import os from 'os';

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  responseTime: number;
  lastCheck: Date;
  endpoint: string;
  version?: string;
  uptime?: number;
  details?: Record<string, any>;
  dependencies?: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
  }>;
}

export interface SystemMetrics {
  timestamp: Date;
  system: {
    cpu: {
      usage: number;
      loadAverage: number[];
      cores: number;
    };
    memory: {
      total: number;
      used: number;
      free: number;
      usage: number;
    };
    disk: {
      total: number;
      used: number;
      free: number;
      usage: number;
    };
    network: {
      bytesIn: number;
      bytesOut: number;
      packetsIn: number;
      packetsOut: number;
    };
  };
  services: ServiceHealth[];
  database: {
    connections: number;
    activeQueries: number;
    slowQueries: number;
    responseTime: number;
  };
  cache: {
    hitRate: number;
    missRate: number;
    evictions: number;
    memory: number;
  };
}

export interface MonitoringAlert {
  id: string;
  type: 'system' | 'service' | 'business' | 'security';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  source: string;
  timestamp: Date;
  status: 'active' | 'acknowledged' | 'resolved';
  threshold?: {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'ne';
    value: number;
    duration: number;
  };
  currentValue?: number;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  metadata: Record<string, any>;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private serviceEndpoints: Map<string, string> = new Map();
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private systemMetrics: SystemMetrics[] = [];
  private alerts: Map<string, MonitoringAlert> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  private constructor() {}

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Initialize the monitoring service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadServiceEndpoints();
      this.startMonitoring();
      this.startMetricsCollection();
      
      logger.info('Monitoring Service initialized', {
        services: this.serviceEndpoints.size,
        monitoringActive: true,
        metricsCollectionActive: true,
      });
    } catch (error) {
      logger.error('Failed to initialize Monitoring Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get system status
   */
  public async getSystemStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    systemMetrics: SystemMetrics;
    activeAlerts: number;
    uptime: number;
  }> {
    try {
      const services = Array.from(this.serviceHealth.values());
      const healthyServices = services.filter(s => s.status === 'healthy').length;
      const totalServices = services.length;
      
      let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (healthyServices === 0) {
        overall = 'unhealthy';
      } else if (healthyServices < totalServices * 0.8) {
        overall = 'degraded';
      }

      const currentMetrics = await this.collectSystemMetrics();
      const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'active').length;

      return {
        overall,
        services,
        systemMetrics: currentMetrics,
        activeAlerts,
        uptime: process.uptime(),
      };
    } catch (error) {
      logger.error('Error getting system status', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        overall: 'unhealthy',
        services: [],
        systemMetrics: await this.collectSystemMetrics(),
        activeAlerts: 0,
        uptime: 0,
      };
    }
  }

  /**
   * Get service health
   */
  public async getServiceHealth(serviceName?: string): Promise<ServiceHealth[]> {
    try {
      if (serviceName) {
        const health = this.serviceHealth.get(serviceName);
        return health ? [health] : [];
      }
      
      return Array.from(this.serviceHealth.values());
    } catch (error) {
      logger.error('Error getting service health', {
        error: error instanceof Error ? error.message : String(error),
        serviceName,
      });
      return [];
    }
  }

  /**
   * Get system metrics
   */
  public async getSystemMetrics(
    timeRange?: { start: Date; end: Date }
  ): Promise<SystemMetrics[]> {
    try {
      let metrics = this.systemMetrics;

      if (timeRange) {
        metrics = metrics.filter(m => 
          m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
        );
      }

      // Sort by timestamp (newest first)
      metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return metrics;
    } catch (error) {
      logger.error('Error getting system metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Create alert
   */
  public async createAlert(alertData: {
    type: 'system' | 'service' | 'business' | 'security';
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    description: string;
    source: string;
    threshold?: {
      metric: string;
      operator: 'gt' | 'lt' | 'eq' | 'ne';
      value: number;
      duration: number;
    };
    currentValue?: number;
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const alert: MonitoringAlert = {
        id: alertId,
        type: alertData.type,
        severity: alertData.severity,
        title: alertData.title,
        description: alertData.description,
        source: alertData.source,
        timestamp: new Date(),
        status: 'active',
        threshold: alertData.threshold,
        currentValue: alertData.currentValue,
        metadata: alertData.metadata || {},
      };

      this.alerts.set(alertId, alert);

      logger.warn('Monitoring alert created', {
        alertId,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        source: alert.source,
      });

      return alertId;
    } catch (error) {
      logger.error('Error creating alert', {
        error: error instanceof Error ? error.message : String(error),
        alertData,
      });
      throw error;
    }
  }

  /**
   * Get alerts
   */
  public async getAlerts(filters?: {
    type?: string;
    severity?: string;
    status?: string;
    source?: string;
    limit?: number;
  }): Promise<MonitoringAlert[]> {
    try {
      let alerts = Array.from(this.alerts.values());

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
        if (filters.source) {
          alerts = alerts.filter(alert => alert.source === filters.source);
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
      logger.error('Error getting alerts', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Acknowledge alert
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

      logger.info('Alert acknowledged', {
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
   * Resolve alert
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

      logger.info('Alert resolved', {
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
    servicesMonitored: number;
    activeAlerts: number;
    monitoringActive: boolean;
    metricsCollectionActive: boolean;
  }> {
    try {
      const activeAlerts = Array.from(this.alerts.values()).filter(alert => alert.status === 'active');
      
      return {
        status: 'healthy',
        servicesMonitored: this.serviceEndpoints.size,
        activeAlerts: activeAlerts.length,
        monitoringActive: !!this.monitoringInterval,
        metricsCollectionActive: !!this.metricsInterval,
      };
    } catch (error) {
      logger.error('Monitoring service health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        status: 'unhealthy',
        servicesMonitored: 0,
        activeAlerts: 0,
        monitoringActive: false,
        metricsCollectionActive: false,
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
      
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      logger.info('Monitoring Service shut down');
    } catch (error) {
      logger.error('Error shutting down Monitoring Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Private helper methods
  private async loadServiceEndpoints(): Promise<void> {
    // Load service endpoints from configuration
    const services = [
      { name: 'api-gateway', endpoint: 'http://localhost:3001/health' },
      { name: 'auth-service', endpoint: 'http://localhost:3002/health' },
      { name: 'integration-service', endpoint: 'http://localhost:3003/health' },
      { name: 'ai-service', endpoint: 'http://localhost:3004/health' },
      { name: 'message-service', endpoint: 'http://localhost:3005/health' },
      { name: 'workflow-service', endpoint: 'http://localhost:3006/health' },
      { name: 'analytics-service', endpoint: 'http://localhost:3007/health' },
      { name: 'notification-service', endpoint: 'http://localhost:3008/health' },
      { name: 'admin-service', endpoint: 'http://localhost:3009/health' },
      { name: 'voice-service', endpoint: 'http://localhost:3010/health' },
      { name: 'partner-service', endpoint: 'http://localhost:3011/health' },
      { name: 'security-service', endpoint: 'http://localhost:3012/health' },
      { name: 'performance-service', endpoint: 'http://localhost:3013/health' },
      { name: 'billing-service', endpoint: 'http://localhost:3014/health' },
    ];

    services.forEach(service => {
      this.serviceEndpoints.set(service.name, service.endpoint);
    });
  }

  private startMonitoring(): void {
    // Check service health every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkAllServices();
      } catch (error) {
        logger.error('Error in monitoring interval', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000); // 30 seconds
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 60 seconds
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectSystemMetrics();
        this.systemMetrics.push(metrics);
        
        // Keep only last 24 hours of metrics
        const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
        this.systemMetrics = this.systemMetrics.filter(m => m.timestamp.getTime() > cutoffTime);
      } catch (error) {
        logger.error('Error in metrics collection', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 60000); // 60 seconds
  }

  private async checkAllServices(): Promise<void> {
    const promises = Array.from(this.serviceEndpoints.entries()).map(
      ([serviceName, endpoint]) => this.checkServiceHealth(serviceName, endpoint)
    );

    await Promise.allSettled(promises);
  }

  private async checkServiceHealth(serviceName: string, endpoint: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(endpoint, {
        timeout: 5000,
        validateStatus: (status) => status < 500, // Accept 4xx as degraded, not unhealthy
      });
      
      const responseTime = Date.now() - startTime;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (response.status >= 500) {
        status = 'unhealthy';
      } else if (response.status >= 400 || responseTime > 2000) {
        status = 'degraded';
      }

      const health: ServiceHealth = {
        service: serviceName,
        status,
        responseTime,
        lastCheck: new Date(),
        endpoint,
        version: response.data?.version,
        uptime: response.data?.uptime,
        details: response.data,
      };

      this.serviceHealth.set(serviceName, health);

      // Create alerts for unhealthy services
      if (status === 'unhealthy') {
        await this.createAlert({
          type: 'service',
          severity: 'error',
          title: `Service ${serviceName} is unhealthy`,
          description: `Service ${serviceName} is not responding or returning errors`,
          source: serviceName,
          metadata: { endpoint, responseTime, statusCode: response.status },
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      const health: ServiceHealth = {
        service: serviceName,
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        endpoint,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };

      this.serviceHealth.set(serviceName, health);

      // Create alert for service down
      await this.createAlert({
        type: 'service',
        severity: 'critical',
        title: `Service ${serviceName} is down`,
        description: `Service ${serviceName} is not reachable`,
        source: serviceName,
        metadata: { endpoint, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Mock disk and network metrics (in production, use proper system monitoring)
      const diskTotal = 100 * 1024 * 1024 * 1024; // 100GB
      const diskUsed = 45 * 1024 * 1024 * 1024; // 45GB
      const diskFree = diskTotal - diskUsed;

      return {
        timestamp: new Date(),
        system: {
          cpu: {
            usage: Math.random() * 100, // Mock CPU usage
            loadAverage: os.loadavg(),
            cores: cpus.length,
          },
          memory: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usage: (usedMem / totalMem) * 100,
          },
          disk: {
            total: diskTotal,
            used: diskUsed,
            free: diskFree,
            usage: (diskUsed / diskTotal) * 100,
          },
          network: {
            bytesIn: Math.floor(Math.random() * 1000000),
            bytesOut: Math.floor(Math.random() * 1000000),
            packetsIn: Math.floor(Math.random() * 10000),
            packetsOut: Math.floor(Math.random() * 10000),
          },
        },
        services: Array.from(this.serviceHealth.values()),
        database: {
          connections: Math.floor(Math.random() * 100),
          activeQueries: Math.floor(Math.random() * 50),
          slowQueries: Math.floor(Math.random() * 5),
          responseTime: Math.random() * 100,
        },
        cache: {
          hitRate: 85 + Math.random() * 10,
          missRate: 5 + Math.random() * 10,
          evictions: Math.floor(Math.random() * 100),
          memory: Math.random() * 1024 * 1024 * 1024, // Random memory usage
        },
      };
    } catch (error) {
      logger.error('Error collecting system metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
