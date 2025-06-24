/**
 * Load Test Processor for Artillery.js
 * Provides custom metrics and enhanced reporting
 */

const fs = require('fs');
const path = require('path');

// Custom metrics tracking
const customMetrics = {
  authSuccessRate: 0,
  authFailureCount: 0,
  authTotalCount: 0,
  aiProcessingTimes: [],
  databaseQueryTimes: [],
  errorsByEndpoint: {},
  responseTimesByEndpoint: {},
};

/**
 * Initialize custom metrics
 */
function initializeMetrics(context, events, done) {
  // Reset metrics for new test run
  customMetrics.authSuccessRate = 0;
  customMetrics.authFailureCount = 0;
  customMetrics.authTotalCount = 0;
  customMetrics.aiProcessingTimes = [];
  customMetrics.databaseQueryTimes = [];
  customMetrics.errorsByEndpoint = {};
  customMetrics.responseTimesByEndpoint = {};

  console.log('🚀 Load test metrics initialized');
  return done();
}

/**
 * Track authentication metrics
 */
function trackAuthMetrics(requestParams, response, context, events, done) {
  const isAuthEndpoint = requestParams.url.includes('/auth/');
  
  if (isAuthEndpoint) {
    customMetrics.authTotalCount++;
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      customMetrics.authSuccessRate = 
        ((customMetrics.authTotalCount - customMetrics.authFailureCount) / customMetrics.authTotalCount) * 100;
    } else {
      customMetrics.authFailureCount++;
      customMetrics.authSuccessRate = 
        ((customMetrics.authTotalCount - customMetrics.authFailureCount) / customMetrics.authTotalCount) * 100;
    }

    // Emit custom metric
    events.emit('counter', 'auth.total', 1);
    if (response.statusCode >= 400) {
      events.emit('counter', 'auth.failures', 1);
    }
  }

  return done();
}

/**
 * Track AI processing metrics
 */
function trackAIMetrics(requestParams, response, context, events, done) {
  const isAIEndpoint = requestParams.url.includes('/ai/');
  
  if (isAIEndpoint && response.timings) {
    const processingTime = response.timings.phases.total;
    customMetrics.aiProcessingTimes.push(processingTime);
    
    // Emit custom metric
    events.emit('histogram', 'ai.processing_time', processingTime);
    
    // Track slow AI requests (>5 seconds)
    if (processingTime > 5000) {
      events.emit('counter', 'ai.slow_requests', 1);
    }
  }

  return done();
}

/**
 * Track response times by endpoint
 */
function trackEndpointMetrics(requestParams, response, context, events, done) {
  const endpoint = getEndpointName(requestParams.url);
  const responseTime = response.timings ? response.timings.phases.total : 0;
  
  // Initialize endpoint tracking
  if (!customMetrics.responseTimesByEndpoint[endpoint]) {
    customMetrics.responseTimesByEndpoint[endpoint] = [];
  }
  
  if (!customMetrics.errorsByEndpoint[endpoint]) {
    customMetrics.errorsByEndpoint[endpoint] = 0;
  }

  // Track response time
  customMetrics.responseTimesByEndpoint[endpoint].push(responseTime);
  
  // Track errors
  if (response.statusCode >= 400) {
    customMetrics.errorsByEndpoint[endpoint]++;
    events.emit('counter', `errors.${endpoint}`, 1);
  }

  // Emit endpoint-specific metrics
  events.emit('histogram', `response_time.${endpoint}`, responseTime);

  return done();
}

/**
 * Track database performance (if available in response headers)
 */
function trackDatabaseMetrics(requestParams, response, context, events, done) {
  // Check for custom database timing headers
  const dbTime = response.headers['x-db-query-time'];
  
  if (dbTime) {
    const queryTime = parseInt(dbTime);
    customMetrics.databaseQueryTimes.push(queryTime);
    
    // Emit database metric
    events.emit('histogram', 'database.query_time', queryTime);
    
    // Track slow queries (>100ms)
    if (queryTime > 100) {
      events.emit('counter', 'database.slow_queries', 1);
    }
  }

  return done();
}

/**
 * Generate performance report
 */
function generateReport(context, events, done) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      authSuccessRate: customMetrics.authSuccessRate.toFixed(2) + '%',
      totalAuthAttempts: customMetrics.authTotalCount,
      authFailures: customMetrics.authFailureCount,
    },
    aiProcessing: {
      totalRequests: customMetrics.aiProcessingTimes.length,
      averageTime: calculateAverage(customMetrics.aiProcessingTimes),
      p95Time: calculatePercentile(customMetrics.aiProcessingTimes, 95),
      slowRequests: customMetrics.aiProcessingTimes.filter(t => t > 5000).length,
    },
    database: {
      totalQueries: customMetrics.databaseQueryTimes.length,
      averageQueryTime: calculateAverage(customMetrics.databaseQueryTimes),
      slowQueries: customMetrics.databaseQueryTimes.filter(t => t > 100).length,
    },
    endpointPerformance: {},
  };

  // Calculate endpoint-specific metrics
  for (const [endpoint, times] of Object.entries(customMetrics.responseTimesByEndpoint)) {
    report.endpointPerformance[endpoint] = {
      totalRequests: times.length,
      averageResponseTime: calculateAverage(times),
      p95ResponseTime: calculatePercentile(times, 95),
      errorCount: customMetrics.errorsByEndpoint[endpoint] || 0,
      errorRate: ((customMetrics.errorsByEndpoint[endpoint] || 0) / times.length * 100).toFixed(2) + '%',
    };
  }

  // Save report to file
  const reportPath = path.join(__dirname, 'reports', `load-test-report-${Date.now()}.json`);
  
  // Ensure reports directory exists
  const reportsDir = path.dirname(reportPath);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('\n📊 Load Test Performance Report:');
  console.log('================================');
  console.log(`Authentication Success Rate: ${report.summary.authSuccessRate}`);
  console.log(`AI Processing Average Time: ${report.aiProcessing.averageTime}ms`);
  console.log(`Database Average Query Time: ${report.database.averageQueryTime}ms`);
  console.log(`Report saved to: ${reportPath}`);

  return done();
}

/**
 * Helper function to extract endpoint name from URL
 */
function getEndpointName(url) {
  // Remove query parameters and extract meaningful endpoint name
  const cleanUrl = url.split('?')[0];
  const pathParts = cleanUrl.split('/').filter(part => part.length > 0);
  
  // Create meaningful endpoint names
  if (pathParts.includes('auth')) {
    return `auth.${pathParts[pathParts.length - 1]}`;
  } else if (pathParts.includes('api')) {
    const apiIndex = pathParts.indexOf('api');
    return pathParts.slice(apiIndex + 1, apiIndex + 3).join('.');
  } else {
    return pathParts.slice(-2).join('.') || 'root';
  }
}

/**
 * Calculate average of array
 */
function calculateAverage(arr) {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((sum, val) => sum + val, 0) / arr.length);
}

/**
 * Calculate percentile of array
 */
function calculatePercentile(arr, percentile) {
  if (arr.length === 0) return 0;
  
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index] || 0;
}

/**
 * Real-time metrics logging
 */
function logRealTimeMetrics(context, events, done) {
  // Log metrics every 30 seconds during test
  const interval = setInterval(() => {
    console.log(`\n⏱️  Real-time Metrics (${new Date().toLocaleTimeString()}):`);
    console.log(`   Auth Success Rate: ${customMetrics.authSuccessRate.toFixed(1)}%`);
    console.log(`   AI Requests: ${customMetrics.aiProcessingTimes.length}`);
    console.log(`   DB Queries: ${customMetrics.databaseQueryTimes.length}`);
    
    if (customMetrics.aiProcessingTimes.length > 0) {
      console.log(`   Avg AI Time: ${calculateAverage(customMetrics.aiProcessingTimes)}ms`);
    }
  }, 30000);

  // Clear interval when test completes
  context.vars.metricsInterval = interval;
  
  return done();
}

/**
 * Cleanup function
 */
function cleanup(context, events, done) {
  if (context.vars.metricsInterval) {
    clearInterval(context.vars.metricsInterval);
  }
  return done();
}

// Export functions for Artillery
module.exports = {
  initializeMetrics,
  trackAuthMetrics,
  trackAIMetrics,
  trackEndpointMetrics,
  trackDatabaseMetrics,
  generateReport,
  logRealTimeMetrics,
  cleanup,
};
