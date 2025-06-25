/**
 * Performance and Load Tests for Notification Service
 */

import axios from 'axios';
import { performance } from 'perf_hooks';

interface LoadTestConfig {
  baseUrl: string;
  concurrentUsers: number;
  requestsPerUser: number;
  rampUpTime: number; // seconds
  testDuration: number; // seconds
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  responseTimePercentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  errors: Array<{
    error: string;
    count: number;
  }>;
}

class NotificationLoadTester {
  private config: LoadTestConfig;
  private results: number[] = [];
  private errors: Map<string, number> = new Map();
  private startTime: number = 0;

  constructor(config: LoadTestConfig) {
    this.config = config;
  }

  /**
   * Run load test
   */
  public async runLoadTest(): Promise<LoadTestResult> {
    console.log('Starting load test with configuration:', this.config);
    
    this.startTime = performance.now();
    const promises: Promise<void>[] = [];

    // Create concurrent users
    for (let user = 0; user < this.config.concurrentUsers; user++) {
      const userPromise = this.simulateUser(user);
      promises.push(userPromise);
      
      // Ramp up gradually
      if (this.config.rampUpTime > 0) {
        const delay = (this.config.rampUpTime * 1000) / this.config.concurrentUsers;
        await this.sleep(delay);
      }
    }

    // Wait for all users to complete
    await Promise.all(promises);

    return this.calculateResults();
  }

  /**
   * Simulate a single user
   */
  private async simulateUser(userId: number): Promise<void> {
    const userStartTime = performance.now();
    const endTime = userStartTime + (this.config.testDuration * 1000);

    let requestCount = 0;

    while (performance.now() < endTime && requestCount < this.config.requestsPerUser) {
      try {
        await this.makeRequest(userId, requestCount);
        requestCount++;
      } catch (error) {
        // Error already recorded in makeRequest
      }

      // Small delay between requests
      await this.sleep(100);
    }

    console.log(`User ${userId} completed ${requestCount} requests`);
  }

  /**
   * Make a single request
   */
  private async makeRequest(userId: number, requestId: number): Promise<void> {
    const requestStart = performance.now();

    try {
      const notificationData = {
        type: 'email',
        recipientId: `load-test-user-${userId}`,
        organizationId: 'load-test-org',
        data: {
          to: `loadtest${userId}@example.com`,
          subject: `Load Test Email ${requestId}`,
          content: `This is load test email ${requestId} from user ${userId}`,
          priority: 'normal',
        },
      };

      const response = await axios.post(
        `${this.config.baseUrl}/api/v1/notifications`,
        notificationData,
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const responseTime = performance.now() - requestStart;
      this.results.push(responseTime);

      if (response.status !== 201) {
        this.recordError(`HTTP ${response.status}`);
      }
    } catch (error) {
      const responseTime = performance.now() - requestStart;
      this.results.push(responseTime);

      if (axios.isAxiosError(error)) {
        if (error.response) {
          this.recordError(`HTTP ${error.response.status}`);
        } else if (error.code === 'ECONNABORTED') {
          this.recordError('Timeout');
        } else {
          this.recordError(error.code || 'Network Error');
        }
      } else {
        this.recordError('Unknown Error');
      }
    }
  }

  /**
   * Record error
   */
  private recordError(error: string): void {
    const count = this.errors.get(error) || 0;
    this.errors.set(error, count + 1);
  }

  /**
   * Calculate test results
   */
  private calculateResults(): LoadTestResult {
    const totalRequests = this.results.length;
    const failedRequests = Array.from(this.errors.values()).reduce((sum, count) => sum + count, 0);
    const successfulRequests = totalRequests - failedRequests;

    const sortedResults = this.results.sort((a, b) => a - b);
    const averageResponseTime = this.results.reduce((sum, time) => sum + time, 0) / totalRequests;
    const minResponseTime = Math.min(...this.results);
    const maxResponseTime = Math.max(...this.results);

    const testDuration = (performance.now() - this.startTime) / 1000;
    const requestsPerSecond = totalRequests / testDuration;
    const errorRate = (failedRequests / totalRequests) * 100;

    const responseTimePercentiles = {
      p50: this.getPercentile(sortedResults, 50),
      p90: this.getPercentile(sortedResults, 90),
      p95: this.getPercentile(sortedResults, 95),
      p99: this.getPercentile(sortedResults, 99),
    };

    const errors = Array.from(this.errors.entries()).map(([error, count]) => ({
      error,
      count,
    }));

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      requestsPerSecond,
      errorRate,
      responseTimePercentiles,
      errors,
    };
  }

  /**
   * Get percentile value
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] || 0;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Stress test for notification creation
 */
export async function runNotificationCreationStressTest(): Promise<void> {
  console.log('Running Notification Creation Stress Test...');

  const config: LoadTestConfig = {
    baseUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
    concurrentUsers: 50,
    requestsPerUser: 100,
    rampUpTime: 10, // 10 seconds
    testDuration: 60, // 60 seconds
  };

  const tester = new NotificationLoadTester(config);
  const results = await tester.runLoadTest();

  console.log('\n=== Notification Creation Stress Test Results ===');
  console.log(`Total Requests: ${results.totalRequests}`);
  console.log(`Successful Requests: ${results.successfulRequests}`);
  console.log(`Failed Requests: ${results.failedRequests}`);
  console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
  console.log(`Requests per Second: ${results.requestsPerSecond.toFixed(2)}`);
  console.log(`Average Response Time: ${results.averageResponseTime.toFixed(2)}ms`);
  console.log(`Min Response Time: ${results.minResponseTime.toFixed(2)}ms`);
  console.log(`Max Response Time: ${results.maxResponseTime.toFixed(2)}ms`);
  console.log('\nResponse Time Percentiles:');
  console.log(`  50th percentile: ${results.responseTimePercentiles.p50.toFixed(2)}ms`);
  console.log(`  90th percentile: ${results.responseTimePercentiles.p90.toFixed(2)}ms`);
  console.log(`  95th percentile: ${results.responseTimePercentiles.p95.toFixed(2)}ms`);
  console.log(`  99th percentile: ${results.responseTimePercentiles.p99.toFixed(2)}ms`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(error => {
      console.log(`  ${error.error}: ${error.count}`);
    });
  }

  // Performance assertions
  if (results.errorRate > 5) {
    console.error(`❌ Error rate too high: ${results.errorRate.toFixed(2)}% (should be < 5%)`);
  } else {
    console.log(`✅ Error rate acceptable: ${results.errorRate.toFixed(2)}%`);
  }

  if (results.responseTimePercentiles.p95 > 1000) {
    console.error(`❌ 95th percentile response time too high: ${results.responseTimePercentiles.p95.toFixed(2)}ms (should be < 1000ms)`);
  } else {
    console.log(`✅ 95th percentile response time acceptable: ${results.responseTimePercentiles.p95.toFixed(2)}ms`);
  }

  if (results.requestsPerSecond < 100) {
    console.error(`❌ Throughput too low: ${results.requestsPerSecond.toFixed(2)} req/s (should be > 100 req/s)`);
  } else {
    console.log(`✅ Throughput acceptable: ${results.requestsPerSecond.toFixed(2)} req/s`);
  }
}

/**
 * Memory leak test
 */
export async function runMemoryLeakTest(): Promise<void> {
  console.log('Running Memory Leak Test...');

  const baseUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
  const iterations = 1000;
  const batchSize = 10;

  console.log(`Creating ${iterations} notifications in batches of ${batchSize}...`);

  for (let i = 0; i < iterations; i += batchSize) {
    const promises = [];

    for (let j = 0; j < batchSize && (i + j) < iterations; j++) {
      const notificationData = {
        type: 'email',
        recipientId: `memory-test-user-${i + j}`,
        organizationId: 'memory-test-org',
        data: {
          to: `memorytest${i + j}@example.com`,
          subject: `Memory Test Email ${i + j}`,
          content: `This is memory test email ${i + j}`,
          priority: 'normal',
        },
      };

      const promise = axios.post(
        `${baseUrl}/api/v1/notifications`,
        notificationData,
        { timeout: 10000 }
      ).catch(error => {
        console.error(`Request ${i + j} failed:`, error.message);
      });

      promises.push(promise);
    }

    await Promise.all(promises);

    // Check memory usage periodically
    if (i % 100 === 0) {
      const memUsage = process.memoryUsage();
      console.log(`Iteration ${i}: Memory usage - RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB, Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }

    // Small delay to prevent overwhelming the service
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  console.log('Memory leak test completed');
}

/**
 * Concurrent notification processing test
 */
export async function runConcurrentProcessingTest(): Promise<void> {
  console.log('Running Concurrent Processing Test...');

  const baseUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
  const concurrentBatches = 20;
  const notificationsPerBatch = 50;

  const startTime = performance.now();

  const batchPromises = Array(concurrentBatches).fill(null).map(async (_, batchIndex) => {
    const batchNotifications = Array(notificationsPerBatch).fill(null).map((_, notificationIndex) => ({
      type: 'email',
      recipientId: `concurrent-test-user-${batchIndex}-${notificationIndex}`,
      organizationId: 'concurrent-test-org',
      data: {
        to: `concurrent${batchIndex}-${notificationIndex}@example.com`,
        subject: `Concurrent Test Email ${batchIndex}-${notificationIndex}`,
        content: `This is concurrent test email ${batchIndex}-${notificationIndex}`,
        priority: 'normal',
      },
    }));

    try {
      const response = await axios.post(
        `${baseUrl}/api/v1/notifications/batch`,
        { notifications: batchNotifications },
        { timeout: 30000 }
      );

      return {
        batchIndex,
        success: true,
        created: response.data.data.created,
        failed: response.data.data.failed,
      };
    } catch (error) {
      return {
        batchIndex,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const results = await Promise.all(batchPromises);
  const endTime = performance.now();

  const totalTime = (endTime - startTime) / 1000;
  const successfulBatches = results.filter(r => r.success).length;
  const totalNotifications = concurrentBatches * notificationsPerBatch;
  const throughput = totalNotifications / totalTime;

  console.log('\n=== Concurrent Processing Test Results ===');
  console.log(`Total Batches: ${concurrentBatches}`);
  console.log(`Successful Batches: ${successfulBatches}`);
  console.log(`Failed Batches: ${concurrentBatches - successfulBatches}`);
  console.log(`Total Notifications: ${totalNotifications}`);
  console.log(`Total Time: ${totalTime.toFixed(2)}s`);
  console.log(`Throughput: ${throughput.toFixed(2)} notifications/second`);

  const failedBatches = results.filter(r => !r.success);
  if (failedBatches.length > 0) {
    console.log('\nFailed Batches:');
    failedBatches.forEach(batch => {
      console.log(`  Batch ${batch.batchIndex}: ${batch.error}`);
    });
  }

  // Performance assertions
  if (throughput < 500) {
    console.error(`❌ Batch processing throughput too low: ${throughput.toFixed(2)} notifications/s (should be > 500/s)`);
  } else {
    console.log(`✅ Batch processing throughput acceptable: ${throughput.toFixed(2)} notifications/s`);
  }
}

// Run all performance tests
if (require.main === module) {
  async function runAllTests() {
    try {
      await runNotificationCreationStressTest();
      console.log('\n' + '='.repeat(60) + '\n');
      
      await runMemoryLeakTest();
      console.log('\n' + '='.repeat(60) + '\n');
      
      await runConcurrentProcessingTest();
      
      console.log('\n🎉 All performance tests completed!');
    } catch (error) {
      console.error('Performance test failed:', error);
      process.exit(1);
    }
  }

  runAllTests();
}
