/**
 * Performance and Load Tests
 * Tests system performance under various load conditions
 */

import { test, expect } from '@playwright/test';
import { performance } from 'perf_hooks';
import axios from 'axios';

const API_BASE_URL = process.env.LOAD_TEST_API_URL || 'http://localhost:8000';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '100');
const TEST_DURATION = parseInt(process.env.TEST_DURATION || '60'); // seconds

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
}

interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  responseTime: number;
  throughput: number;
  errorRate: number;
}

test.describe('Performance Tests', () => {
  test('API endpoint load test - Message creation', async () => {
    const results: number[] = [];
    const errors: string[] = [];
    const startTime = performance.now();

    // Create test data
    const testMessage = {
      organizationId: 'load-test-org',
      conversationId: 'load-test-conv',
      content: 'Load test message',
      type: 'text',
      direction: 'inbound',
      channel: 'api',
    };

    // Run concurrent requests
    const promises = Array.from({ length: CONCURRENT_USERS }, async (_, index) => {
      const requestStart = performance.now();
      
      try {
        const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, {
          ...testMessage,
          content: `Load test message ${index}`,
          conversationId: `load-test-conv-${index}`,
        }, {
          timeout: 10000,
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        });

        const requestEnd = performance.now();
        const responseTime = requestEnd - requestStart;
        
        if (response.status === 201) {
          results.push(responseTime);
        } else {
          errors.push(`Unexpected status: ${response.status}`);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    });

    await Promise.all(promises);
    
    const endTime = performance.now();
    const totalTime = (endTime - startTime) / 1000; // Convert to seconds

    // Calculate metrics
    const loadTestResult: LoadTestResult = {
      totalRequests: CONCURRENT_USERS,
      successfulRequests: results.length,
      failedRequests: errors.length,
      averageResponseTime: results.reduce((a, b) => a + b, 0) / results.length,
      minResponseTime: Math.min(...results),
      maxResponseTime: Math.max(...results),
      requestsPerSecond: CONCURRENT_USERS / totalTime,
      errorRate: (errors.length / CONCURRENT_USERS) * 100,
    };

    // Assertions
    expect(loadTestResult.errorRate).toBeLessThan(5); // Less than 5% error rate
    expect(loadTestResult.averageResponseTime).toBeLessThan(1000); // Less than 1 second average
    expect(loadTestResult.requestsPerSecond).toBeGreaterThan(50); // At least 50 RPS
    expect(loadTestResult.maxResponseTime).toBeLessThan(5000); // Max 5 seconds

    console.log('Load Test Results:', loadTestResult);
  });

  test('Database performance under load', async () => {
    const queryTimes: number[] = [];
    const concurrentQueries = 50;

    // Test database query performance
    const promises = Array.from({ length: concurrentQueries }, async (_, index) => {
      const startTime = performance.now();
      
      try {
        const response = await axios.get(`${API_BASE_URL}/api/v1/messages`, {
          params: {
            organizationId: 'load-test-org',
            limit: 100,
            offset: index * 100,
          },
          headers: {
            'Authorization': 'Bearer test-token',
          },
        });

        const endTime = performance.now();
        const queryTime = endTime - startTime;
        
        if (response.status === 200) {
          queryTimes.push(queryTime);
        }
      } catch (error) {
        console.error('Database query failed:', error);
      }
    });

    await Promise.all(promises);

    // Calculate database performance metrics
    const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
    const maxQueryTime = Math.max(...queryTimes);
    const minQueryTime = Math.min(...queryTimes);

    // Assertions
    expect(avgQueryTime).toBeLessThan(500); // Average query time less than 500ms
    expect(maxQueryTime).toBeLessThan(2000); // Max query time less than 2 seconds
    expect(queryTimes.length).toBe(concurrentQueries); // All queries should succeed

    console.log('Database Performance:', {
      averageQueryTime: avgQueryTime,
      maxQueryTime,
      minQueryTime,
      successfulQueries: queryTimes.length,
    });
  });

  test('Memory usage under sustained load', async () => {
    const memorySnapshots: number[] = [];
    const duration = 30000; // 30 seconds
    const interval = 1000; // 1 second intervals

    // Start memory monitoring
    const monitoringInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/v1/health/metrics`, {
          headers: { 'Authorization': 'Bearer test-token' },
        });
        
        if (response.data.memory) {
          memorySnapshots.push(response.data.memory.used);
        }
      } catch (error) {
        console.error('Failed to get memory metrics:', error);
      }
    }, interval);

    // Generate sustained load
    const loadPromises = [];
    const startTime = Date.now();

    while (Date.now() - startTime < duration) {
      // Create batch of requests
      const batchPromises = Array.from({ length: 10 }, () =>
        axios.post(`${API_BASE_URL}/api/v1/messages`, {
          organizationId: 'memory-test-org',
          conversationId: `memory-test-${Date.now()}`,
          content: 'Memory test message',
          type: 'text',
          direction: 'inbound',
          channel: 'api',
        }, {
          headers: { 'Authorization': 'Bearer test-token' },
        }).catch(() => {}) // Ignore individual failures
      );

      loadPromises.push(...batchPromises);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between batches
    }

    // Wait for all requests to complete
    await Promise.all(loadPromises);
    
    // Stop monitoring
    clearInterval(monitoringInterval);

    // Analyze memory usage
    if (memorySnapshots.length > 0) {
      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const maxMemory = Math.max(...memorySnapshots);
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthPercentage = (memoryGrowth / initialMemory) * 100;

      // Assertions
      expect(memoryGrowthPercentage).toBeLessThan(50); // Memory shouldn't grow more than 50%
      expect(maxMemory).toBeLessThan(initialMemory * 2); // Memory shouldn't double

      console.log('Memory Usage Analysis:', {
        initialMemory,
        finalMemory,
        maxMemory,
        memoryGrowth,
        memoryGrowthPercentage,
        snapshots: memorySnapshots.length,
      });
    }
  });

  test('WebSocket connection performance', async () => {
    const connectionTimes: number[] = [];
    const messageTimes: number[] = [];
    const concurrentConnections = 20;

    const promises = Array.from({ length: concurrentConnections }, async (_, index) => {
      return new Promise<void>((resolve, reject) => {
        const WebSocket = require('ws');
        const connectStart = performance.now();
        
        const ws = new WebSocket(`ws://localhost:8000/ws?token=test-token&userId=user-${index}`);
        
        ws.on('open', () => {
          const connectEnd = performance.now();
          connectionTimes.push(connectEnd - connectStart);
          
          // Send test message
          const messageStart = performance.now();
          ws.send(JSON.stringify({
            type: 'message',
            content: `Test message from connection ${index}`,
          }));
          
          ws.on('message', () => {
            const messageEnd = performance.now();
            messageTimes.push(messageEnd - messageStart);
            ws.close();
            resolve();
          });
        });
        
        ws.on('error', (error: Error) => {
          reject(error);
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
      });
    });

    await Promise.all(promises);

    // Calculate WebSocket performance metrics
    const avgConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
    const avgMessageTime = messageTimes.reduce((a, b) => a + b, 0) / messageTimes.length;

    // Assertions
    expect(avgConnectionTime).toBeLessThan(1000); // Connection time less than 1 second
    expect(avgMessageTime).toBeLessThan(100); // Message round-trip less than 100ms
    expect(connectionTimes.length).toBe(concurrentConnections); // All connections should succeed

    console.log('WebSocket Performance:', {
      averageConnectionTime: avgConnectionTime,
      averageMessageTime: avgMessageTime,
      successfulConnections: connectionTimes.length,
    });
  });

  test('File upload performance', async () => {
    const uploadTimes: number[] = [];
    const fileSizes = [1024, 10240, 102400, 1048576]; // 1KB, 10KB, 100KB, 1MB
    
    for (const size of fileSizes) {
      // Generate test file data
      const fileData = Buffer.alloc(size, 'a');
      
      const uploadStart = performance.now();
      
      try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', fileData, {
          filename: `test-file-${size}.txt`,
          contentType: 'text/plain',
        });
        form.append('organizationId', 'upload-test-org');
        
        const response = await axios.post(`${API_BASE_URL}/api/v1/files/upload`, form, {
          headers: {
            ...form.getHeaders(),
            'Authorization': 'Bearer test-token',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        
        const uploadEnd = performance.now();
        const uploadTime = uploadEnd - uploadStart;
        
        if (response.status === 201) {
          uploadTimes.push(uploadTime);
          
          // Calculate upload speed (bytes per second)
          const uploadSpeed = size / (uploadTime / 1000);
          console.log(`File size: ${size} bytes, Upload time: ${uploadTime}ms, Speed: ${uploadSpeed} bytes/sec`);
        }
      } catch (error) {
        console.error(`Upload failed for file size ${size}:`, error);
      }
    }

    // Assertions
    expect(uploadTimes.length).toBe(fileSizes.length); // All uploads should succeed
    expect(Math.max(...uploadTimes)).toBeLessThan(30000); // Max upload time 30 seconds
  });

  test('Cache performance and hit rates', async () => {
    const cacheTestRequests = 100;
    const uniqueKeys = 10; // This will create cache hits
    
    const responseTimes: number[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // Make requests that should benefit from caching
    for (let i = 0; i < cacheTestRequests; i++) {
      const keyIndex = i % uniqueKeys; // Reuse keys to test cache hits
      const startTime = performance.now();
      
      try {
        const response = await axios.get(`${API_BASE_URL}/api/v1/organizations/cache-test-org-${keyIndex}`, {
          headers: { 'Authorization': 'Bearer test-token' },
        });
        
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);
        
        // Check if response came from cache
        if (response.headers['x-cache-status'] === 'hit') {
          cacheHits++;
        } else {
          cacheMisses++;
        }
      } catch (error) {
        console.error('Cache test request failed:', error);
      }
    }

    // Calculate cache performance
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const cacheHitRate = (cacheHits / (cacheHits + cacheMisses)) * 100;

    // Assertions
    expect(cacheHitRate).toBeGreaterThan(70); // Cache hit rate should be > 70%
    expect(avgResponseTime).toBeLessThan(200); // Average response time < 200ms with caching

    console.log('Cache Performance:', {
      averageResponseTime: avgResponseTime,
      cacheHitRate,
      cacheHits,
      cacheMisses,
      totalRequests: responseTimes.length,
    });
  });
});

// Stress tests
test.describe('Stress Tests', () => {
  test('System behavior under extreme load', async () => {
    const extremeLoad = 500; // 500 concurrent requests
    const results: { success: boolean; responseTime: number }[] = [];
    
    const promises = Array.from({ length: extremeLoad }, async (_, index) => {
      const startTime = performance.now();
      
      try {
        const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, {
          organizationId: 'stress-test-org',
          conversationId: `stress-test-conv-${index}`,
          content: `Stress test message ${index}`,
          type: 'text',
          direction: 'inbound',
          channel: 'api',
        }, {
          timeout: 30000, // Longer timeout for stress test
          headers: { 'Authorization': 'Bearer test-token' },
        });
        
        const endTime = performance.now();
        results.push({
          success: response.status === 201,
          responseTime: endTime - startTime,
        });
      } catch (error) {
        const endTime = performance.now();
        results.push({
          success: false,
          responseTime: endTime - startTime,
        });
      }
    });

    await Promise.all(promises);

    // Analyze stress test results
    const successfulRequests = results.filter(r => r.success).length;
    const successRate = (successfulRequests / extremeLoad) * 100;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    // Under extreme load, we expect some degradation but system should remain stable
    expect(successRate).toBeGreaterThan(80); // At least 80% success rate under stress
    expect(avgResponseTime).toBeLessThan(10000); // Average response time < 10 seconds

    console.log('Stress Test Results:', {
      totalRequests: extremeLoad,
      successfulRequests,
      successRate,
      averageResponseTime: avgResponseTime,
    });
  });
});
