#!/usr/bin/env node

/**
 * Performance Monitoring Script
 * Monitors system performance during load tests and generates reports
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      timestamp: new Date().toISOString(),
      system: {
        cpu: [],
        memory: [],
        disk: [],
        network: [],
      },
      application: {
        responseTime: [],
        throughput: [],
        errorRate: [],
        activeConnections: [],
      },
      database: {
        connections: [],
        queryTime: [],
        lockWaits: [],
      },
    };
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.reportPath = path.join(__dirname, 'reports');
  }

  /**
   * Start performance monitoring
   */
  async startMonitoring(intervalMs = 5000) {
    if (this.isMonitoring) {
      console.log('⚠️  Monitoring already running');
      return;
    }

    console.log('🚀 Starting performance monitoring...');
    this.isMonitoring = true;

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportPath)) {
      fs.mkdirSync(this.reportPath, { recursive: true });
    }

    // Start monitoring intervals
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    // Initial metrics collection
    await this.collectMetrics();
    
    console.log(`📊 Performance monitoring started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️  Monitoring not running');
      return;
    }

    console.log('🛑 Stopping performance monitoring...');
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Generate final report
    this.generateReport();
    console.log('✅ Performance monitoring stopped');
  }

  /**
   * Collect system and application metrics
   */
  async collectMetrics() {
    const timestamp = Date.now();

    try {
      // System metrics
      await this.collectSystemMetrics(timestamp);
      
      // Application metrics (if endpoints are available)
      await this.collectApplicationMetrics(timestamp);
      
      // Database metrics (if available)
      await this.collectDatabaseMetrics(timestamp);

      // Log current status
      this.logCurrentStatus();

    } catch (error) {
      console.error('❌ Error collecting metrics:', error.message);
    }
  }

  /**
   * Collect system-level metrics
   */
  async collectSystemMetrics(timestamp) {
    // CPU usage
    const cpuUsage = await this.getCPUUsage();
    this.metrics.system.cpu.push({ timestamp, value: cpuUsage });

    // Memory usage
    const memoryUsage = this.getMemoryUsage();
    this.metrics.system.memory.push({ timestamp, ...memoryUsage });

    // Disk usage
    const diskUsage = await this.getDiskUsage();
    this.metrics.system.disk.push({ timestamp, ...diskUsage });
  }

  /**
   * Get CPU usage percentage
   */
  getCPUUsage() {
    return new Promise((resolve) => {
      const startMeasure = this.cpuAverage();
      
      setTimeout(() => {
        const endMeasure = this.cpuAverage();
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        const cpuPercentage = 100 - ~~(100 * idleDifference / totalDifference);
        resolve(cpuPercentage);
      }, 1000);
    });
  }

  /**
   * Calculate CPU average
   */
  cpuAverage() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    
    for (const cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq;
    }
    
    const total = user + nice + sys + idle + irq;
    return { idle, total };
  }

  /**
   * Get memory usage
   */
  getMemoryUsage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    return {
      total: Math.round(totalMemory / 1024 / 1024), // MB
      used: Math.round(usedMemory / 1024 / 1024),   // MB
      free: Math.round(freeMemory / 1024 / 1024),   // MB
      percentage: Math.round((usedMemory / totalMemory) * 100),
    };
  }

  /**
   * Get disk usage
   */
  getDiskUsage() {
    return new Promise((resolve) => {
      exec('df -h /', (error, stdout) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }

        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          resolve({
            total: parts[1],
            used: parts[2],
            available: parts[3],
            percentage: parseInt(parts[4]),
          });
        } else {
          resolve({ error: 'Unable to parse disk usage' });
        }
      });
    });
  }

  /**
   * Collect application metrics
   */
  async collectApplicationMetrics(timestamp) {
    try {
      // Health check endpoint
      const healthResponse = await this.makeRequest('http://localhost:3000/health');
      if (healthResponse) {
        this.metrics.application.responseTime.push({
          timestamp,
          endpoint: 'health',
          value: healthResponse.responseTime,
        });
      }

      // Metrics endpoint (if available)
      const metricsResponse = await this.makeRequest('http://localhost:3000/metrics');
      if (metricsResponse && metricsResponse.data) {
        // Parse application-specific metrics
        this.parseApplicationMetrics(timestamp, metricsResponse.data);
      }

    } catch (error) {
      console.log('⚠️  Application metrics not available:', error.message);
    }
  }

  /**
   * Make HTTP request with timing
   */
  makeRequest(url) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      // Simple HTTP request (you might want to use axios or fetch)
      exec(`curl -s -w "%{http_code}" -o /dev/null "${url}"`, (error, stdout) => {
        const responseTime = Date.now() - startTime;
        const statusCode = parseInt(stdout.trim());
        
        if (error || statusCode >= 400) {
          resolve(null);
        } else {
          resolve({ responseTime, statusCode });
        }
      });
    });
  }

  /**
   * Parse application-specific metrics
   */
  parseApplicationMetrics(timestamp, metricsData) {
    // Parse metrics based on your application's metrics format
    if (metricsData.throughput) {
      this.metrics.application.throughput.push({
        timestamp,
        value: metricsData.throughput,
      });
    }

    if (metricsData.errorRate) {
      this.metrics.application.errorRate.push({
        timestamp,
        value: metricsData.errorRate,
      });
    }

    if (metricsData.activeConnections) {
      this.metrics.application.activeConnections.push({
        timestamp,
        value: metricsData.activeConnections,
      });
    }
  }

  /**
   * Collect database metrics
   */
  async collectDatabaseMetrics(timestamp) {
    try {
      // This would connect to your database and collect metrics
      // For now, we'll simulate some metrics
      
      // Simulate database connection count
      const connections = Math.floor(Math.random() * 20) + 5;
      this.metrics.database.connections.push({ timestamp, value: connections });

      // Simulate query time
      const queryTime = Math.floor(Math.random() * 100) + 10;
      this.metrics.database.queryTime.push({ timestamp, value: queryTime });

    } catch (error) {
      console.log('⚠️  Database metrics not available:', error.message);
    }
  }

  /**
   * Log current performance status
   */
  logCurrentStatus() {
    const latest = this.getLatestMetrics();
    
    console.log(`\n📊 Performance Status (${new Date().toLocaleTimeString()}):`);
    console.log(`   CPU: ${latest.cpu}%`);
    console.log(`   Memory: ${latest.memory.used}MB (${latest.memory.percentage}%)`);
    console.log(`   Disk: ${latest.disk.percentage || 'N/A'}%`);
    
    if (latest.application.responseTime) {
      console.log(`   Response Time: ${latest.application.responseTime}ms`);
    }
    
    if (latest.database.connections) {
      console.log(`   DB Connections: ${latest.database.connections}`);
    }
  }

  /**
   * Get latest metrics values
   */
  getLatestMetrics() {
    return {
      cpu: this.metrics.system.cpu.slice(-1)[0]?.value || 0,
      memory: this.metrics.system.memory.slice(-1)[0] || {},
      disk: this.metrics.system.disk.slice(-1)[0] || {},
      application: {
        responseTime: this.metrics.application.responseTime.slice(-1)[0]?.value,
        throughput: this.metrics.application.throughput.slice(-1)[0]?.value,
        errorRate: this.metrics.application.errorRate.slice(-1)[0]?.value,
      },
      database: {
        connections: this.metrics.database.connections.slice(-1)[0]?.value,
        queryTime: this.metrics.database.queryTime.slice(-1)[0]?.value,
      },
    };
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const reportData = {
      ...this.metrics,
      summary: this.generateSummary(),
      recommendations: this.generateRecommendations(),
    };

    const reportFile = path.join(this.reportPath, `performance-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));

    console.log(`\n📋 Performance Report Generated:`);
    console.log(`   File: ${reportFile}`);
    console.log(`   Duration: ${this.getMonitoringDuration()}`);
    console.log(`   Data Points: ${this.getTotalDataPoints()}`);
  }

  /**
   * Generate performance summary
   */
  generateSummary() {
    return {
      duration: this.getMonitoringDuration(),
      dataPoints: this.getTotalDataPoints(),
      averages: {
        cpu: this.calculateAverage(this.metrics.system.cpu.map(m => m.value)),
        memoryUsage: this.calculateAverage(this.metrics.system.memory.map(m => m.percentage)),
        responseTime: this.calculateAverage(this.metrics.application.responseTime.map(m => m.value)),
      },
      peaks: {
        cpu: Math.max(...this.metrics.system.cpu.map(m => m.value)),
        memory: Math.max(...this.metrics.system.memory.map(m => m.percentage)),
        responseTime: Math.max(...this.metrics.application.responseTime.map(m => m.value)),
      },
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const summary = this.generateSummary();

    if (summary.peaks.cpu > 80) {
      recommendations.push('High CPU usage detected. Consider scaling horizontally or optimizing CPU-intensive operations.');
    }

    if (summary.peaks.memory > 85) {
      recommendations.push('High memory usage detected. Check for memory leaks and consider increasing available memory.');
    }

    if (summary.averages.responseTime > 500) {
      recommendations.push('High response times detected. Consider optimizing database queries and adding caching.');
    }

    return recommendations;
  }

  /**
   * Calculate average of array
   */
  calculateAverage(arr) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((sum, val) => sum + val, 0) / arr.length);
  }

  /**
   * Get monitoring duration
   */
  getMonitoringDuration() {
    const start = new Date(this.metrics.timestamp);
    const end = new Date();
    return `${Math.round((end - start) / 1000)}s`;
  }

  /**
   * Get total data points collected
   */
  getTotalDataPoints() {
    return this.metrics.system.cpu.length + 
           this.metrics.system.memory.length + 
           this.metrics.application.responseTime.length;
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new PerformanceMonitor();
  
  // Handle command line arguments
  const command = process.argv[2];
  
  if (command === 'start') {
    const interval = parseInt(process.argv[3]) || 5000;
    monitor.startMonitoring(interval);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, stopping monitoring...');
      monitor.stopMonitoring();
      process.exit(0);
    });
    
  } else if (command === 'report') {
    monitor.generateReport();
    
  } else {
    console.log('Usage:');
    console.log('  node monitor-performance.js start [interval_ms]');
    console.log('  node monitor-performance.js report');
  }
}

module.exports = PerformanceMonitor;
