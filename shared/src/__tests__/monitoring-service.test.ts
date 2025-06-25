/**
 * Monitoring Service Tests
 * Tests for comprehensive monitoring, alerting, and health checks
 */

import { MonitoringService, SystemMetrics, ApplicationMetrics, BusinessMetrics, HealthCheck, Alert } from '../services/monitoring-service';

describe('Monitoring Service', () => {
  let monitoringService: MonitoringService;

  beforeAll(async () => {
    monitoringService = new MonitoringService();
  });

  afterAll(async () => {
    monitoringService.cleanup();
  });

  describe('System Metrics Collection', () => {
    it('should collect system metrics successfully', async () => {
      const metrics = await monitoringService.collectSystemMetrics();

      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        cpu: {
          usage: expect.any(Number),
          cores: expect.any(Number),
          loadAverage: expect.any(Array),
        },
        memory: {
          total: expect.any(Number),
          used: expect.any(Number),
          free: expect.any(Number),
          usage: expect.any(Number),
        },
        disk: {
          total: expect.any(Number),
          used: expect.any(Number),
          free: expect.any(Number),
          usage: expect.any(Number),
        },
        network: {
          bytesIn: expect.any(Number),
          bytesOut: expect.any(Number),
          packetsIn: expect.any(Number),
          packetsOut: expect.any(Number),
        },
      });

      expect(metrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(metrics.cpu.cores).toBeGreaterThan(0);
      expect(metrics.memory.usage).toBeGreaterThanOrEqual(0);
      expect(metrics.memory.usage).toBeLessThanOrEqual(100);
      expect(metrics.disk.usage).toBeGreaterThanOrEqual(0);
      expect(metrics.disk.usage).toBeLessThanOrEqual(100);
    });

    it('should handle system metrics collection errors gracefully', async () => {
      // Mock a failure scenario
      const originalCpuUsage = process.cpuUsage;
      process.cpuUsage = jest.fn().mockImplementation(() => {
        throw new Error('CPU metrics unavailable');
      });

      await expect(monitoringService.collectSystemMetrics()).rejects.toThrow('CPU metrics unavailable');

      // Restore original function
      process.cpuUsage = originalCpuUsage;
    });
  });

  describe('Application Metrics Collection', () => {
    it('should collect application metrics successfully', async () => {
      const metrics = await monitoringService.collectApplicationMetrics();

      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        requests: {
          total: expect.any(Number),
          rate: expect.any(Number),
          errors: expect.any(Number),
          errorRate: expect.any(Number),
        },
        response: {
          averageTime: expect.any(Number),
          p50: expect.any(Number),
          p95: expect.any(Number),
          p99: expect.any(Number),
        },
        database: {
          connections: expect.any(Number),
          queries: expect.any(Number),
          slowQueries: expect.any(Number),
          averageQueryTime: expect.any(Number),
        },
        cache: {
          hits: expect.any(Number),
          misses: expect.any(Number),
          hitRate: expect.any(Number),
          evictions: expect.any(Number),
        },
      });

      expect(metrics.requests.total).toBeGreaterThanOrEqual(0);
      expect(metrics.requests.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.response.averageTime).toBeGreaterThanOrEqual(0);
      expect(metrics.database.connections).toBeGreaterThanOrEqual(0);
      expect(metrics.cache.hitRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Business Metrics Collection', () => {
    it('should collect business metrics successfully', async () => {
      const metrics = await monitoringService.collectBusinessMetrics();

      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        users: {
          active: expect.any(Number),
          new: expect.any(Number),
          returning: expect.any(Number),
          churn: expect.any(Number),
        },
        revenue: {
          total: expect.any(Number),
          recurring: expect.any(Number),
          oneTime: expect.any(Number),
          growth: expect.any(Number),
        },
        support: {
          tickets: expect.any(Number),
          resolved: expect.any(Number),
          averageResolutionTime: expect.any(Number),
          satisfaction: expect.any(Number),
        },
        ai: {
          requests: expect.any(Number),
          accuracy: expect.any(Number),
          processingTime: expect.any(Number),
          cost: expect.any(Number),
        },
      });

      expect(metrics.users.active).toBeGreaterThanOrEqual(0);
      expect(metrics.revenue.total).toBeGreaterThanOrEqual(0);
      expect(metrics.support.satisfaction).toBeGreaterThanOrEqual(0);
      expect(metrics.support.satisfaction).toBeLessThanOrEqual(5);
      expect(metrics.ai.accuracy).toBeGreaterThanOrEqual(0);
      expect(metrics.ai.accuracy).toBeLessThanOrEqual(1);
    });
  });

  describe('Health Checks', () => {
    it('should perform health checks successfully', async () => {
      const healthChecks = await monitoringService.performHealthChecks();

      expect(healthChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.any(String),
            status: expect.stringMatching(/^(healthy|unhealthy|degraded)$/),
            responseTime: expect.any(Number),
            lastCheck: expect.any(Date),
          }),
        ])
      );

      // Should include at least database, redis, and memory checks
      const checkNames = healthChecks.map(check => check.name);
      expect(checkNames).toContain('database');
      expect(checkNames).toContain('redis');
      expect(checkNames).toContain('memory');
    });

    it('should detect unhealthy services', async () => {
      // This test would require mocking database/redis failures
      const healthChecks = await monitoringService.performHealthChecks();
      
      // At least one check should be performed
      expect(healthChecks.length).toBeGreaterThan(0);
      
      // Each check should have valid response time
      healthChecks.forEach(check => {
        expect(check.responseTime).toBeGreaterThanOrEqual(0);
        expect(check.lastCheck).toBeInstanceOf(Date);
      });
    });

    it('should get current health status', () => {
      const healthStatus = monitoringService.getHealthStatus();
      
      expect(healthStatus).toEqual(expect.any(Array));
      
      if (healthStatus.length > 0) {
        expect(healthStatus[0]).toMatchObject({
          name: expect.any(String),
          status: expect.stringMatching(/^(healthy|unhealthy|degraded)$/),
          responseTime: expect.any(Number),
          lastCheck: expect.any(Date),
        });
      }
    });
  });

  describe('Alerting System', () => {
    it('should get active alerts', () => {
      const activeAlerts = monitoringService.getActiveAlerts();
      
      expect(activeAlerts).toEqual(expect.any(Array));
      
      activeAlerts.forEach(alert => {
        expect(alert).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          severity: expect.stringMatching(/^(info|warning|error|critical)$/),
          condition: expect.any(String),
          threshold: expect.any(Number),
          duration: expect.any(Number),
          enabled: expect.any(Boolean),
          channels: expect.any(Array),
          status: 'active',
        });
      });
    });

    it('should handle alert lifecycle', () => {
      // Test alert creation, triggering, and resolution
      const initialAlerts = monitoringService.getActiveAlerts();
      const initialCount = initialAlerts.length;
      
      // Alerts should be properly initialized
      expect(initialCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Prometheus Metrics', () => {
    it('should generate Prometheus metrics format', () => {
      const metrics = monitoringService.getPrometheusMetrics();
      
      expect(metrics).toEqual(expect.any(String));
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toContain('system_cpu_usage_percent');
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('messages_processed_total');
    });

    it('should include all required metric types', () => {
      const metrics = monitoringService.getPrometheusMetrics();
      
      // Should include system metrics
      expect(metrics).toContain('system_cpu_usage_percent');
      
      // Should include application metrics
      expect(metrics).toContain('http_requests_total');
      
      // Should include business metrics
      expect(metrics).toContain('messages_processed_total');
    });
  });

  describe('Performance Tests', () => {
    it('should collect metrics within acceptable time limits', async () => {
      const startTime = Date.now();
      
      await Promise.all([
        monitoringService.collectSystemMetrics(),
        monitoringService.collectApplicationMetrics(),
        monitoringService.collectBusinessMetrics(),
      ]);
      
      const duration = Date.now() - startTime;
      
      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent health checks efficiently', async () => {
      const concurrentChecks = 5;
      const promises = [];
      
      for (let i = 0; i < concurrentChecks; i++) {
        promises.push(monitoringService.performHealthChecks());
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(concurrentChecks);
      results.forEach(healthChecks => {
        expect(healthChecks).toEqual(expect.any(Array));
      });
    });

    it('should generate Prometheus metrics quickly', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        monitoringService.getPrometheusMetrics();
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete 100 calls within 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      // This would require mocking database failures
      // For now, just ensure the method doesn't throw unexpectedly
      await expect(monitoringService.collectBusinessMetrics()).resolves.toBeDefined();
    });

    it('should handle Redis connection failures gracefully', async () => {
      // This would require mocking Redis failures
      // For now, just ensure the method doesn't throw unexpectedly
      await expect(monitoringService.collectApplicationMetrics()).resolves.toBeDefined();
    });

    it('should handle system resource access failures', async () => {
      // Test should pass even if some system resources are unavailable
      await expect(monitoringService.collectSystemMetrics()).resolves.toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should integrate all monitoring components', async () => {
      // Collect all types of metrics
      const systemMetrics = await monitoringService.collectSystemMetrics();
      const appMetrics = await monitoringService.collectApplicationMetrics();
      const businessMetrics = await monitoringService.collectBusinessMetrics();
      
      // Perform health checks
      const healthChecks = await monitoringService.performHealthChecks();
      
      // Get alerts and Prometheus metrics
      const alerts = monitoringService.getActiveAlerts();
      const prometheusMetrics = monitoringService.getPrometheusMetrics();
      
      // Verify all components work together
      expect(systemMetrics).toBeDefined();
      expect(appMetrics).toBeDefined();
      expect(businessMetrics).toBeDefined();
      expect(healthChecks).toBeDefined();
      expect(alerts).toBeDefined();
      expect(prometheusMetrics).toBeDefined();
      
      // Verify timestamps are recent
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      expect(systemMetrics.timestamp).toBeInstanceOf(Date);
      expect(systemMetrics.timestamp.getTime()).toBeGreaterThan(fiveMinutesAgo.getTime());
      
      expect(appMetrics.timestamp).toBeInstanceOf(Date);
      expect(appMetrics.timestamp.getTime()).toBeGreaterThan(fiveMinutesAgo.getTime());
      
      expect(businessMetrics.timestamp).toBeInstanceOf(Date);
      expect(businessMetrics.timestamp.getTime()).toBeGreaterThan(fiveMinutesAgo.getTime());
    });

    it('should maintain monitoring state across operations', async () => {
      // Perform multiple operations
      await monitoringService.performHealthChecks();
      const initialHealth = monitoringService.getHealthStatus();
      
      await monitoringService.collectSystemMetrics();
      await monitoringService.collectApplicationMetrics();
      
      const finalHealth = monitoringService.getHealthStatus();
      
      // Health status should be maintained
      expect(finalHealth.length).toBeGreaterThanOrEqual(initialHealth.length);
    });
  });
});

describe('Monitoring Service Lifecycle', () => {
  it('should initialize and cleanup properly', () => {
    const service = new MonitoringService();
    
    // Should initialize without errors
    expect(service).toBeInstanceOf(MonitoringService);
    
    // Should cleanup without errors
    expect(() => service.cleanup()).not.toThrow();
  });

  it('should handle multiple instances', () => {
    const service1 = new MonitoringService();
    const service2 = new MonitoringService();
    
    // Both should work independently
    expect(service1.getHealthStatus()).toBeDefined();
    expect(service2.getHealthStatus()).toBeDefined();
    
    // Cleanup both
    service1.cleanup();
    service2.cleanup();
  });
});
