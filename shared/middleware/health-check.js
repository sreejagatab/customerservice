/**
 * Comprehensive Health Check Middleware
 * Provides detailed health status for all services with dependency checks
 */

const os = require('os');
const { performance } = require('perf_hooks');

class HealthCheckMiddleware {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'unknown-service';
    this.version = options.version || '1.0.0';
    this.dependencies = options.dependencies || {};
    this.customChecks = options.customChecks || {};
    this.startTime = Date.now();
  }

  /**
   * Main health check endpoint
   */
  healthCheck() {
    return async (req, res) => {
      const startTime = performance.now();
      
      try {
        const healthStatus = await this.performHealthCheck();
        const responseTime = Math.round(performance.now() - startTime);
        
        // Add response time to health status
        healthStatus.responseTime = `${responseTime}ms`;
        
        // Determine HTTP status code
        const statusCode = healthStatus.status === 'healthy' ? 200 : 
                          healthStatus.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json(healthStatus);
        
      } catch (error) {
        const responseTime = Math.round(performance.now() - startTime);
        
        res.status(503).json({
          status: 'unhealthy',
          service: this.serviceName,
          version: this.version,
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          error: error.message,
          checks: {
            service: {
              status: 'fail',
              error: error.message
            }
          }
        });
      }
    };
  }

  /**
   * Liveness probe endpoint (Kubernetes)
   */
  livenessProbe() {
    return (req, res) => {
      // Simple check - if the service can respond, it's alive
      res.status(200).json({
        status: 'alive',
        service: this.serviceName,
        timestamp: new Date().toISOString(),
        uptime: this.getUptime()
      });
    };
  }

  /**
   * Readiness probe endpoint (Kubernetes)
   */
  readinessProbe() {
    return async (req, res) => {
      try {
        const dependencyChecks = await this.checkDependencies();
        const allDependenciesHealthy = Object.values(dependencyChecks)
          .every(check => check.status === 'pass');
        
        if (allDependenciesHealthy) {
          res.status(200).json({
            status: 'ready',
            service: this.serviceName,
            timestamp: new Date().toISOString(),
            dependencies: dependencyChecks
          });
        } else {
          res.status(503).json({
            status: 'not_ready',
            service: this.serviceName,
            timestamp: new Date().toISOString(),
            dependencies: dependencyChecks
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'not_ready',
          service: this.serviceName,
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    };
  }

  /**
   * Detailed health check endpoint
   */
  detailedHealth() {
    return async (req, res) => {
      const startTime = performance.now();
      
      try {
        const healthStatus = await this.performDetailedHealthCheck();
        const responseTime = Math.round(performance.now() - startTime);
        
        healthStatus.responseTime = `${responseTime}ms`;
        
        res.status(200).json(healthStatus);
        
      } catch (error) {
        const responseTime = Math.round(performance.now() - startTime);
        
        res.status(503).json({
          status: 'error',
          service: this.serviceName,
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          error: error.message
        });
      }
    };
  }

  /**
   * Perform basic health check
   */
  async performHealthCheck() {
    const checks = {};
    let overallStatus = 'healthy';
    
    // Basic service check
    checks.service = {
      status: 'pass',
      componentType: 'service',
      time: new Date().toISOString()
    };

    // Memory check
    const memoryCheck = this.checkMemory();
    checks.memory = memoryCheck;
    if (memoryCheck.status === 'fail') overallStatus = 'unhealthy';
    if (memoryCheck.status === 'warn') overallStatus = 'degraded';

    // Dependency checks
    const dependencyChecks = await this.checkDependencies();
    Object.assign(checks, dependencyChecks);
    
    // Check if any dependencies failed
    const dependencyStatuses = Object.values(dependencyChecks).map(check => check.status);
    if (dependencyStatuses.includes('fail')) {
      overallStatus = 'unhealthy';
    } else if (dependencyStatuses.includes('warn')) {
      overallStatus = 'degraded';
    }

    // Custom checks
    const customCheckResults = await this.runCustomChecks();
    Object.assign(checks, customCheckResults);
    
    // Check custom check results
    const customStatuses = Object.values(customCheckResults).map(check => check.status);
    if (customStatuses.includes('fail')) {
      overallStatus = 'unhealthy';
    } else if (customStatuses.includes('warn')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      service: this.serviceName,
      version: this.version,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      checks
    };
  }

  /**
   * Perform detailed health check with system metrics
   */
  async performDetailedHealthCheck() {
    const basicHealth = await this.performHealthCheck();
    
    // Add system metrics
    const systemMetrics = this.getSystemMetrics();
    
    return {
      ...basicHealth,
      system: systemMetrics,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      }
    };
  }

  /**
   * Check memory usage
   */
  checkMemory() {
    const memUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    let status = 'pass';
    if (memoryUsagePercent > 90) {
      status = 'fail';
    } else if (memoryUsagePercent > 80) {
      status = 'warn';
    }

    return {
      status,
      componentType: 'system',
      time: new Date().toISOString(),
      output: `Memory usage: ${memoryUsagePercent.toFixed(2)}%`,
      details: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        systemTotal: `${Math.round(totalMemory / 1024 / 1024)}MB`,
        systemFree: `${Math.round(freeMemory / 1024 / 1024)}MB`,
        usagePercent: `${memoryUsagePercent.toFixed(2)}%`
      }
    };
  }

  /**
   * Check dependencies (database, cache, external services)
   */
  async checkDependencies() {
    const checks = {};
    
    for (const [name, dependency] of Object.entries(this.dependencies)) {
      try {
        const startTime = performance.now();
        const result = await dependency.check();
        const responseTime = Math.round(performance.now() - startTime);
        
        checks[name] = {
          status: result ? 'pass' : 'fail',
          componentType: dependency.type || 'dependency',
          time: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          output: result ? 'Connection successful' : 'Connection failed'
        };
        
      } catch (error) {
        checks[name] = {
          status: 'fail',
          componentType: dependency.type || 'dependency',
          time: new Date().toISOString(),
          output: error.message
        };
      }
    }
    
    return checks;
  }

  /**
   * Run custom health checks
   */
  async runCustomChecks() {
    const checks = {};
    
    for (const [name, checkFunction] of Object.entries(this.customChecks)) {
      try {
        const startTime = performance.now();
        const result = await checkFunction();
        const responseTime = Math.round(performance.now() - startTime);
        
        checks[name] = {
          status: result.status || 'pass',
          componentType: 'custom',
          time: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          output: result.message || 'Check passed',
          ...(result.details && { details: result.details })
        };
        
      } catch (error) {
        checks[name] = {
          status: 'fail',
          componentType: 'custom',
          time: new Date().toISOString(),
          output: error.message
        };
      }
    }
    
    return checks;
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: cpus.length,
      loadAverage: {
        '1m': loadAvg[0].toFixed(2),
        '5m': loadAvg[1].toFixed(2),
        '15m': loadAvg[2].toFixed(2)
      },
      uptime: `${Math.floor(os.uptime())}s`,
      processUptime: this.getUptime()
    };
  }

  /**
   * Get service uptime
   */
  getUptime() {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  /**
   * Add dependency check
   */
  addDependency(name, checkFunction, type = 'dependency') {
    this.dependencies[name] = {
      check: checkFunction,
      type
    };
  }

  /**
   * Add custom check
   */
  addCustomCheck(name, checkFunction) {
    this.customChecks[name] = checkFunction;
  }

  /**
   * Initialize health check routes
   */
  initializeRoutes(app) {
    app.get('/health', this.healthCheck());
    app.get('/health/live', this.livenessProbe());
    app.get('/health/ready', this.readinessProbe());
    app.get('/health/detailed', this.detailedHealth());
  }
}

module.exports = HealthCheckMiddleware;
