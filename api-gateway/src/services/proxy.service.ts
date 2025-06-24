import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { ServiceRegistry, ServiceRoute } from './service-registry';
import { ErrorCode } from '@universal-ai-cs/shared';

export interface ProxyOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  loadBalancing?: 'round-robin' | 'random' | 'least-connections';
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
  };
}

export interface ProxyMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  errorsByService: Record<string, number>;
  requestsByService: Record<string, number>;
}

export class ProxyService {
  private httpClient: AxiosInstance;
  private metrics: ProxyMetrics;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(
    private serviceRegistry: ServiceRegistry,
    private options: ProxyOptions = {}
  ) {
    this.httpClient = axios.create({
      timeout: options.timeout || 30000,
      headers: {
        'User-Agent': 'Universal-AI-CS-Gateway/1.0.0',
      },
    });

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      errorsByService: {},
      requestsByService: {},
    };

    this.setupAxiosInterceptors();
  }

  /**
   * Create proxy middleware for a specific route
   */
  createProxyMiddleware(route: ServiceRoute) {
    return createProxyMiddleware({
      target: this.getServiceUrl(route.service),
      changeOrigin: true,
      pathRewrite: route.stripPath ? this.createPathRewriter(route.path) : undefined,
      timeout: route.timeout || this.options.timeout || 30000,
      
      // Custom router for dynamic service discovery
      router: (req) => {
        const service = this.serviceRegistry.getService(route.service);
        if (!service || service.status !== 'healthy') {
          throw new Error(`Service ${route.service} is not available`);
        }
        return service.url;
      },

      // Error handling
      onError: (err, req, res) => {
        console.error(`Proxy error for ${route.service}:`, err.message);
        this.handleProxyError(err, req as Request, res as Response, route);
      },

      // Request logging
      onProxyReq: (proxyReq, req) => {
        this.logRequest(req as Request, route);
      },

      // Response logging
      onProxyRes: (proxyRes, req, res) => {
        this.logResponse(proxyRes, req as Request, res as Response, route);
      },

      // Custom headers
      onProxyReqWs: (proxyReq, req, socket) => {
        // Handle WebSocket upgrades if needed
      },
    });
  }

  /**
   * Proxy request manually with retry logic and circuit breaker
   */
  async proxyRequest(
    req: Request,
    res: Response,
    route: ServiceRoute
  ): Promise<void> {
    const startTime = Date.now();
    const service = this.serviceRegistry.getService(route.service);

    if (!service) {
      this.sendErrorResponse(res, 503, ErrorCode.SERVICE_UNAVAILABLE, 'Service not found');
      return;
    }

    // Check circuit breaker
    const circuitBreaker = this.getCircuitBreaker(route.service);
    if (circuitBreaker.isOpen()) {
      this.sendErrorResponse(res, 503, ErrorCode.SERVICE_UNAVAILABLE, 'Service temporarily unavailable');
      return;
    }

    try {
      const targetUrl = this.buildTargetUrl(service.url, req.path, route);
      const config = this.buildRequestConfig(req, route);

      let lastError: any;
      const maxRetries = route.retries || this.options.retries || 3;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await this.httpClient.request({
            ...config,
            url: targetUrl,
          });

          // Success - record metrics and send response
          const responseTime = Date.now() - startTime;
          this.recordSuccess(route.service, responseTime);
          circuitBreaker.recordSuccess();

          this.sendProxyResponse(res, response);
          return;

        } catch (error) {
          lastError = error;
          
          if (attempt < maxRetries && this.isRetryableError(error)) {
            const delay = this.calculateRetryDelay(attempt);
            await this.sleep(delay);
            continue;
          }
          
          break;
        }
      }

      // All retries failed
      const responseTime = Date.now() - startTime;
      this.recordFailure(route.service, responseTime);
      circuitBreaker.recordFailure();

      this.handleRequestError(res, lastError, route);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordFailure(route.service, responseTime);
      circuitBreaker.recordFailure();

      this.handleRequestError(res, error, route);
    }
  }

  /**
   * Get proxy metrics
   */
  getMetrics(): ProxyMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      errorsByService: {},
      requestsByService: {},
    };
  }

  private getServiceUrl(serviceName: string): string {
    const service = this.serviceRegistry.getService(serviceName);
    return service?.url || `http://localhost:3000`;
  }

  private createPathRewriter(routePath: string): Record<string, string> {
    // Remove the route prefix from the path
    const prefix = routePath.replace('/*', '');
    return {
      [`^${prefix.replace(/\//g, '\\/')}`]: '',
    };
  }

  private buildTargetUrl(serviceUrl: string, requestPath: string, route: ServiceRoute): string {
    let targetPath = requestPath;
    
    if (route.stripPath) {
      const prefix = route.path.replace('/*', '');
      targetPath = requestPath.replace(prefix, '');
    }

    return `${serviceUrl}${targetPath}`;
  }

  private buildRequestConfig(req: Request, route: ServiceRoute): AxiosRequestConfig {
    const config: AxiosRequestConfig = {
      method: req.method as any,
      headers: { ...req.headers },
      timeout: route.timeout || this.options.timeout || 30000,
    };

    // Remove hop-by-hop headers
    delete config.headers!['host'];
    delete config.headers!['connection'];
    delete config.headers!['upgrade'];
    delete config.headers!['proxy-authorization'];
    delete config.headers!['proxy-authenticate'];
    delete config.headers!['te'];
    delete config.headers!['trailers'];
    delete config.headers!['transfer-encoding'];

    // Add request body for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
      config.data = req.body;
    }

    // Add query parameters
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    return config;
  }

  private sendProxyResponse(res: Response, axiosResponse: any): void {
    // Set response headers
    Object.keys(axiosResponse.headers).forEach(key => {
      if (!this.isHopByHopHeader(key)) {
        res.set(key, axiosResponse.headers[key]);
      }
    });

    // Set status and send data
    res.status(axiosResponse.status).send(axiosResponse.data);
  }

  private sendErrorResponse(res: Response, status: number, code: string, message: string): void {
    res.status(status).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }

  private handleProxyError(err: any, req: Request, res: Response, route: ServiceRoute): void {
    console.error(`Proxy error for ${route.service}:`, err.message);
    
    if (res.headersSent) {
      return;
    }

    let status = 500;
    let code = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      status = 503;
      code = ErrorCode.SERVICE_UNAVAILABLE;
      message = 'Service unavailable';
    } else if (err.code === 'ETIMEDOUT') {
      status = 504;
      code = ErrorCode.TIMEOUT_ERROR;
      message = 'Gateway timeout';
    }

    this.sendErrorResponse(res, status, code, message);
  }

  private handleRequestError(res: Response, error: any, route: ServiceRoute): void {
    if (res.headersSent) {
      return;
    }

    let status = 500;
    let code = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (error.response) {
      // HTTP error response
      status = error.response.status;
      message = error.response.data?.message || error.message;
      code = error.response.data?.code || ErrorCode.EXTERNAL_SERVICE_ERROR;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      status = 503;
      code = ErrorCode.SERVICE_UNAVAILABLE;
      message = 'Service unavailable';
    } else if (error.code === 'ETIMEDOUT') {
      status = 504;
      code = ErrorCode.TIMEOUT_ERROR;
      message = 'Gateway timeout';
    }

    this.sendErrorResponse(res, status, code, message);
  }

  private isRetryableError(error: any): boolean {
    if (error.response) {
      const status = error.response.status;
      // Retry on 5xx errors and 429 (rate limit)
      return status >= 500 || status === 429;
    }
    
    // Retry on network errors
    return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code);
  }

  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.options.retryDelay || 1000;
    return baseDelay * Math.pow(2, attempt); // Exponential backoff
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isHopByHopHeader(header: string): boolean {
    const hopByHopHeaders = [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
    ];
    return hopByHopHeaders.includes(header.toLowerCase());
  }

  private getCircuitBreaker(serviceName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      const options = this.options.circuitBreaker || {
        failureThreshold: 5,
        resetTimeout: 60000,
      };
      this.circuitBreakers.set(serviceName, new CircuitBreaker(options));
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  private recordSuccess(serviceName: string, responseTime: number): void {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.updateAverageResponseTime(responseTime);
    this.incrementServiceCounter(serviceName, 'requestsByService');
  }

  private recordFailure(serviceName: string, responseTime: number): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    this.updateAverageResponseTime(responseTime);
    this.incrementServiceCounter(serviceName, 'requestsByService');
    this.incrementServiceCounter(serviceName, 'errorsByService');
  }

  private updateAverageResponseTime(responseTime: number): void {
    const total = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = total / this.metrics.totalRequests;
  }

  private incrementServiceCounter(serviceName: string, counterType: keyof ProxyMetrics): void {
    const counter = this.metrics[counterType] as Record<string, number>;
    counter[serviceName] = (counter[serviceName] || 0) + 1;
  }

  private logRequest(req: Request, route: ServiceRoute): void {
    console.log(`Proxying ${req.method} ${req.path} to ${route.service}`);
  }

  private logResponse(proxyRes: any, req: Request, res: Response, route: ServiceRoute): void {
    console.log(`Response from ${route.service}: ${proxyRes.statusCode}`);
  }

  private setupAxiosInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        const responseTime = Date.now() - response.config.metadata.startTime;
        console.log(`Request completed in ${responseTime}ms`);
        return response;
      },
      (error) => {
        if (error.config?.metadata) {
          const responseTime = Date.now() - error.config.metadata.startTime;
          console.log(`Request failed after ${responseTime}ms`);
        }
        return Promise.reject(error);
      }
    );
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private options: {
      failureThreshold: number;
      resetTimeout: number;
    }
  ) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }
}
