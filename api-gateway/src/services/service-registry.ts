import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

export interface ServiceEndpoint {
  id: string;
  name: string;
  url: string;
  health: string;
  version: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  responseTime?: number;
  metadata?: Record<string, any>;
}

export interface ServiceRoute {
  path: string;
  service: string;
  methods: string[];
  stripPath?: boolean;
  preserveHost?: boolean;
  timeout?: number;
  retries?: number;
  auth?: boolean;
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}

export class ServiceRegistry extends EventEmitter {
  private services: Map<string, ServiceEndpoint> = new Map();
  private routes: ServiceRoute[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private httpClient: AxiosInstance;

  constructor(
    private healthCheckIntervalMs: number = 30000,
    private healthCheckTimeoutMs: number = 5000
  ) {
    super();
    
    this.httpClient = axios.create({
      timeout: this.healthCheckTimeoutMs,
      headers: {
        'User-Agent': 'Universal-AI-CS-Gateway/1.0.0',
      },
    });

    this.initializeDefaultRoutes();
    this.startHealthChecks();
  }

  /**
   * Register a service endpoint
   */
  registerService(service: Omit<ServiceEndpoint, 'status' | 'lastHealthCheck'>): void {
    const endpoint: ServiceEndpoint = {
      ...service,
      status: 'unknown',
      lastHealthCheck: new Date(),
    };

    this.services.set(service.name, endpoint);
    this.emit('serviceRegistered', endpoint);
    
    console.log(`Service registered: ${service.name} at ${service.url}`);
  }

  /**
   * Unregister a service
   */
  unregisterService(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (service) {
      this.services.delete(serviceName);
      this.emit('serviceUnregistered', service);
      console.log(`Service unregistered: ${serviceName}`);
    }
  }

  /**
   * Get a service endpoint by name
   */
  getService(serviceName: string): ServiceEndpoint | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Get all registered services
   */
  getAllServices(): ServiceEndpoint[] {
    return Array.from(this.services.values());
  }

  /**
   * Get healthy services only
   */
  getHealthyServices(): ServiceEndpoint[] {
    return this.getAllServices().filter(service => service.status === 'healthy');
  }

  /**
   * Add a route configuration
   */
  addRoute(route: ServiceRoute): void {
    this.routes.push(route);
    this.emit('routeAdded', route);
    console.log(`Route added: ${route.methods.join(',')} ${route.path} -> ${route.service}`);
  }

  /**
   * Get route for a given path and method
   */
  getRoute(path: string, method: string): ServiceRoute | undefined {
    return this.routes.find(route => {
      const methodMatch = route.methods.includes('*') || route.methods.includes(method.toUpperCase());
      const pathMatch = this.matchPath(route.path, path);
      return methodMatch && pathMatch;
    });
  }

  /**
   * Get all routes
   */
  getAllRoutes(): ServiceRoute[] {
    return [...this.routes];
  }

  /**
   * Perform health check on a specific service
   */
  async checkServiceHealth(serviceName: string): Promise<boolean> {
    const service = this.services.get(serviceName);
    if (!service) {
      return false;
    }

    try {
      const startTime = Date.now();
      const response = await this.httpClient.get(service.health);
      const responseTime = Date.now() - startTime;

      const isHealthy = response.status >= 200 && response.status < 300;
      
      // Update service status
      service.status = isHealthy ? 'healthy' : 'unhealthy';
      service.lastHealthCheck = new Date();
      service.responseTime = responseTime;

      if (isHealthy) {
        this.emit('serviceHealthy', service);
      } else {
        this.emit('serviceUnhealthy', service);
      }

      return isHealthy;
    } catch (error) {
      service.status = 'unhealthy';
      service.lastHealthCheck = new Date();
      service.responseTime = undefined;
      
      this.emit('serviceUnhealthy', service);
      console.error(`Health check failed for ${serviceName}:`, error.message);
      return false;
    }
  }

  /**
   * Perform health checks on all services
   */
  async checkAllServicesHealth(): Promise<void> {
    const healthCheckPromises = Array.from(this.services.keys()).map(serviceName =>
      this.checkServiceHealth(serviceName)
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllServicesHealth();
    }, this.healthCheckIntervalMs);

    console.log(`Health checks started with interval: ${this.healthCheckIntervalMs}ms`);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('Health checks stopped');
    }
  }

  /**
   * Get service registry statistics
   */
  getStats(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    unknownServices: number;
    totalRoutes: number;
    averageResponseTime: number;
  } {
    const services = this.getAllServices();
    const healthyServices = services.filter(s => s.status === 'healthy');
    const unhealthyServices = services.filter(s => s.status === 'unhealthy');
    const unknownServices = services.filter(s => s.status === 'unknown');
    
    const responseTimes = services
      .filter(s => s.responseTime !== undefined)
      .map(s => s.responseTime!);
    
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    return {
      totalServices: services.length,
      healthyServices: healthyServices.length,
      unhealthyServices: unhealthyServices.length,
      unknownServices: unknownServices.length,
      totalRoutes: this.routes.length,
      averageResponseTime: Math.round(averageResponseTime),
    };
  }

  /**
   * Initialize default service routes
   */
  private initializeDefaultRoutes(): void {
    const defaultRoutes: ServiceRoute[] = [
      // Authentication routes
      {
        path: '/api/v1/auth/*',
        service: 'auth-service',
        methods: ['*'],
        stripPath: true,
        auth: false,
        timeout: 30000,
        retries: 2,
      },
      
      // Integration routes
      {
        path: '/api/v1/integrations/*',
        service: 'integration-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 60000,
        retries: 3,
      },
      
      // AI processing routes
      {
        path: '/api/v1/ai/*',
        service: 'ai-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 120000,
        retries: 2,
      },
      
      // Message routes
      {
        path: '/api/v1/messages/*',
        service: 'message-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 30000,
        retries: 3,
      },
      
      // Conversation routes
      {
        path: '/api/v1/conversations/*',
        service: 'message-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 30000,
        retries: 3,
      },
      
      // Workflow routes
      {
        path: '/api/v1/workflows/*',
        service: 'workflow-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 60000,
        retries: 2,
      },
      
      // Analytics routes
      {
        path: '/api/v1/analytics/*',
        service: 'analytics-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 60000,
        retries: 2,
      },
      
      // Notification routes
      {
        path: '/api/v1/notifications/*',
        service: 'notification-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 30000,
        retries: 3,
      },
      
      // Admin routes
      {
        path: '/api/v1/admin/*',
        service: 'admin-service',
        methods: ['*'],
        stripPath: true,
        auth: true,
        timeout: 30000,
        retries: 2,
      },
    ];

    defaultRoutes.forEach(route => this.addRoute(route));
  }

  /**
   * Match path pattern with actual path
   */
  private matchPath(pattern: string, path: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\//g, '\\/');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHealthChecks();
    this.services.clear();
    this.routes = [];
    this.removeAllListeners();
  }
}
