/**
 * Load Balancer Service
 * Handles intelligent load balancing across service instances
 */

import { EventEmitter } from 'events';
import { Logger } from '@universal-ai-cs/shared';
import { ServiceRegistry, ServiceInstance } from './service-registry';

export interface LoadBalancerConfig {
  algorithm: 'round-robin' | 'weighted-round-robin' | 'least-connections' | 'least-response-time' | 'ip-hash' | 'random';
  healthCheckInterval: number;
  failureThreshold: number;
  recoveryThreshold: number;
  stickySession: boolean;
  sessionTimeout: number;
}

export interface LoadBalancerMetrics {
  totalRequests: number;
  requestsPerInstance: Record<string, number>;
  averageResponseTime: number;
  responseTimePerInstance: Record<string, number>;
  failureRate: number;
  failuresPerInstance: Record<string, number>;
  activeConnections: number;
  connectionsPerInstance: Record<string, number>;
}

export interface InstanceHealth {
  instanceId: string;
  healthy: boolean;
  responseTime: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastHealthCheck: Date;
  lastFailure?: Date;
  lastSuccess?: Date;
}

export class LoadBalancerService extends EventEmitter {
  private logger: Logger;
  private serviceRegistry: ServiceRegistry;
  private config: LoadBalancerConfig;
  private instanceHealth: Map<string, InstanceHealth> = new Map();
  private roundRobinCounters: Map<string, number> = new Map();
  private stickySessionMap: Map<string, string> = new Map();
  private connectionCounts: Map<string, number> = new Map();
  private metrics: LoadBalancerMetrics;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(serviceRegistry: ServiceRegistry, config: Partial<LoadBalancerConfig> = {}) {
    super();
    this.logger = new Logger('LoadBalancerService');
    this.serviceRegistry = serviceRegistry;
    this.config = {
      algorithm: 'round-robin',
      healthCheckInterval: 30000, // 30 seconds
      failureThreshold: 3,
      recoveryThreshold: 2,
      stickySession: false,
      sessionTimeout: 300000, // 5 minutes
      ...config,
    };

    this.metrics = {
      totalRequests: 0,
      requestsPerInstance: {},
      averageResponseTime: 0,
      responseTimePerInstance: {},
      failureRate: 0,
      failuresPerInstance: {},
      activeConnections: 0,
      connectionsPerInstance: {},
    };

    this.initializeHealthChecking();
  }

  /**
   * Select the best instance for a service
   */
  public selectInstance(serviceName: string, clientId?: string): ServiceInstance | null {
    const instances = this.serviceRegistry.getServiceInstances(serviceName);
    if (!instances || instances.length === 0) {
      return null;
    }

    // Filter healthy instances
    const healthyInstances = instances.filter(instance => 
      this.isInstanceHealthy(instance.id)
    );

    if (healthyInstances.length === 0) {
      this.logger.warn('No healthy instances available', { serviceName });
      return null;
    }

    let selectedInstance: ServiceInstance | null = null;

    switch (this.config.algorithm) {
      case 'round-robin':
        selectedInstance = this.selectRoundRobin(serviceName, healthyInstances);
        break;
      case 'weighted-round-robin':
        selectedInstance = this.selectWeightedRoundRobin(serviceName, healthyInstances);
        break;
      case 'least-connections':
        selectedInstance = this.selectLeastConnections(healthyInstances);
        break;
      case 'least-response-time':
        selectedInstance = this.selectLeastResponseTime(healthyInstances);
        break;
      case 'ip-hash':
        selectedInstance = this.selectIpHash(clientId || '', healthyInstances);
        break;
      case 'random':
        selectedInstance = this.selectRandom(healthyInstances);
        break;
      default:
        selectedInstance = this.selectRoundRobin(serviceName, healthyInstances);
    }

    // Handle sticky sessions
    if (this.config.stickySession && clientId && selectedInstance) {
      this.stickySessionMap.set(clientId, selectedInstance.id);
      setTimeout(() => {
        this.stickySessionMap.delete(clientId);
      }, this.config.sessionTimeout);
    }

    if (selectedInstance) {
      this.recordRequest(selectedInstance.id);
    }

    return selectedInstance;
  }

  /**
   * Record successful request
   */
  public recordSuccess(instanceId: string, responseTime: number): void {
    this.updateInstanceHealth(instanceId, true, responseTime);
    this.updateMetrics(instanceId, responseTime, false);
  }

  /**
   * Record failed request
   */
  public recordFailure(instanceId: string, responseTime: number = 0): void {
    this.updateInstanceHealth(instanceId, false, responseTime);
    this.updateMetrics(instanceId, responseTime, true);
  }

  /**
   * Record connection start
   */
  public recordConnectionStart(instanceId: string): void {
    const current = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, current + 1);
    this.metrics.activeConnections++;
    this.metrics.connectionsPerInstance[instanceId] = current + 1;
  }

  /**
   * Record connection end
   */
  public recordConnectionEnd(instanceId: string): void {
    const current = this.connectionCounts.get(instanceId) || 0;
    if (current > 0) {
      this.connectionCounts.set(instanceId, current - 1);
      this.metrics.activeConnections--;
      this.metrics.connectionsPerInstance[instanceId] = current - 1;
    }
  }

  /**
   * Get load balancer metrics
   */
  public getMetrics(): LoadBalancerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get instance health status
   */
  public getInstanceHealth(): InstanceHealth[] {
    return Array.from(this.instanceHealth.values());
  }

  /**
   * Private methods for load balancing algorithms
   */
  private selectRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selectedIndex = counter % instances.length;
    this.roundRobinCounters.set(serviceName, counter + 1);
    return instances[selectedIndex];
  }

  private selectWeightedRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    // Create weighted list based on instance capacity or weight
    const weightedInstances: ServiceInstance[] = [];
    
    instances.forEach(instance => {
      const weight = instance.weight || 1;
      for (let i = 0; i < weight; i++) {
        weightedInstances.push(instance);
      }
    });

    return this.selectRoundRobin(serviceName, weightedInstances);
  }

  private selectLeastConnections(instances: ServiceInstance[]): ServiceInstance {
    let selectedInstance = instances[0];
    let minConnections = this.connectionCounts.get(selectedInstance.id) || 0;

    for (const instance of instances) {
      const connections = this.connectionCounts.get(instance.id) || 0;
      if (connections < minConnections) {
        minConnections = connections;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  private selectLeastResponseTime(instances: ServiceInstance[]): ServiceInstance {
    let selectedInstance = instances[0];
    let minResponseTime = this.getAverageResponseTime(selectedInstance.id);

    for (const instance of instances) {
      const responseTime = this.getAverageResponseTime(instance.id);
      if (responseTime < minResponseTime) {
        minResponseTime = responseTime;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  private selectIpHash(clientId: string, instances: ServiceInstance[]): ServiceInstance {
    // Check sticky session first
    if (this.config.stickySession) {
      const stickyInstanceId = this.stickySessionMap.get(clientId);
      if (stickyInstanceId) {
        const stickyInstance = instances.find(i => i.id === stickyInstanceId);
        if (stickyInstance) {
          return stickyInstance;
        }
      }
    }

    // Use hash of client ID to select instance
    const hash = this.hashString(clientId);
    const index = hash % instances.length;
    return instances[index];
  }

  private selectRandom(instances: ServiceInstance[]): ServiceInstance {
    const index = Math.floor(Math.random() * instances.length);
    return instances[index];
  }

  /**
   * Helper methods
   */
  private isInstanceHealthy(instanceId: string): boolean {
    const health = this.instanceHealth.get(instanceId);
    return health ? health.healthy : true; // Default to healthy if no health data
  }

  private updateInstanceHealth(instanceId: string, success: boolean, responseTime: number): void {
    let health = this.instanceHealth.get(instanceId);
    
    if (!health) {
      health = {
        instanceId,
        healthy: true,
        responseTime: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastHealthCheck: new Date(),
      };
      this.instanceHealth.set(instanceId, health);
    }

    health.responseTime = responseTime;
    health.lastHealthCheck = new Date();

    if (success) {
      health.consecutiveFailures = 0;
      health.consecutiveSuccesses++;
      health.lastSuccess = new Date();

      // Mark as healthy if it was unhealthy and has enough successes
      if (!health.healthy && health.consecutiveSuccesses >= this.config.recoveryThreshold) {
        health.healthy = true;
        this.emit('instance.recovered', { instanceId });
        this.logger.info('Instance recovered', { instanceId });
      }
    } else {
      health.consecutiveSuccesses = 0;
      health.consecutiveFailures++;
      health.lastFailure = new Date();

      // Mark as unhealthy if it has too many failures
      if (health.healthy && health.consecutiveFailures >= this.config.failureThreshold) {
        health.healthy = false;
        this.emit('instance.failed', { instanceId });
        this.logger.warn('Instance marked as unhealthy', { instanceId });
      }
    }
  }

  private updateMetrics(instanceId: string, responseTime: number, isFailure: boolean): void {
    this.metrics.totalRequests++;
    
    // Update per-instance metrics
    this.metrics.requestsPerInstance[instanceId] = (this.metrics.requestsPerInstance[instanceId] || 0) + 1;
    
    if (isFailure) {
      this.metrics.failuresPerInstance[instanceId] = (this.metrics.failuresPerInstance[instanceId] || 0) + 1;
    } else {
      // Update response time metrics
      const currentAvg = this.metrics.responseTimePerInstance[instanceId] || 0;
      const requestCount = this.metrics.requestsPerInstance[instanceId];
      this.metrics.responseTimePerInstance[instanceId] = 
        (currentAvg * (requestCount - 1) + responseTime) / requestCount;
    }

    // Update global metrics
    const totalFailures = Object.values(this.metrics.failuresPerInstance).reduce((sum, count) => sum + count, 0);
    this.metrics.failureRate = totalFailures / this.metrics.totalRequests;

    const totalResponseTime = Object.entries(this.metrics.responseTimePerInstance)
      .reduce((sum, [instanceId, avgTime]) => {
        const requests = this.metrics.requestsPerInstance[instanceId] || 0;
        return sum + (avgTime * requests);
      }, 0);
    this.metrics.averageResponseTime = totalResponseTime / this.metrics.totalRequests;
  }

  private recordRequest(instanceId: string): void {
    // This is called when an instance is selected for a request
    // Additional request tracking can be added here
  }

  private getAverageResponseTime(instanceId: string): number {
    return this.metrics.responseTimePerInstance[instanceId] || 0;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private initializeHealthChecking(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const allServices = this.serviceRegistry.getAllServices();
    
    for (const service of allServices) {
      const instances = this.serviceRegistry.getServiceInstances(service.name);
      if (!instances) continue;

      for (const instance of instances) {
        try {
          const startTime = Date.now();
          const isHealthy = await this.serviceRegistry.checkInstanceHealth(instance.id);
          const responseTime = Date.now() - startTime;
          
          this.updateInstanceHealth(instance.id, isHealthy, responseTime);
        } catch (error) {
          this.updateInstanceHealth(instance.id, false, 0);
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.instanceHealth.clear();
    this.roundRobinCounters.clear();
    this.stickySessionMap.clear();
    this.connectionCounts.clear();
    this.removeAllListeners();
    
    this.logger.info('Load balancer service destroyed');
  }
}

export default LoadBalancerService;
