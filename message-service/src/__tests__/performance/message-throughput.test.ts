/**
 * Performance Tests for Message Service
 * Tests message processing throughput and response times
 */

import request from 'supertest';
import messageService from '../../index';
import { MessageQueueService } from '../../services/queue';
import { redis } from '../../services/redis';

const app = messageService.getApp();

describe('Message Service Performance Tests', () => {
  beforeAll(async () => {
    // Initialize services for performance testing
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.flushall();
  });

  describe('Message Creation Throughput', () => {
    it('should handle 100 concurrent message creations within 5 seconds', async () => {
      // Arrange
      const messageCount = 100;
      const maxDuration = 5000; // 5 seconds
      const startTime = Date.now();

      const messageData = {
        conversationId: '123e4567-e89b-12d3-a456-426614174000',
        direction: 'inbound',
        content: {
          text: 'Performance test message',
          format: 'text',
        },
        sender: {
          email: 'perf-test@example.com',
          name: 'Performance Tester',
          type: 'customer',
        },
        metadata: {
          source: 'performance-test',
          testId: 'throughput-test',
        },
      };

      // Act
      const promises = Array.from({ length: messageCount }, (_, index) =>
        request(app)
          .post('/api/v1/messages')
          .set('x-organization-id', 'perf-test-org')
          .set('x-integration-id', 'perf-test-integration')
          .send({
            ...messageData,
            content: {
              ...messageData.content,
              text: `Performance test message ${index + 1}`,
            },
          })
          .expect(201)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(responses).toHaveLength(messageCount);
      expect(duration).toBeLessThan(maxDuration);
      
      // Verify all messages were created successfully
      responses.forEach((response, index) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.messageId).toBeDefined();
        expect(response.body.data.status).toBe('queued');
      });

      // Calculate throughput
      const throughput = (messageCount / duration) * 1000; // messages per second
      console.log(`Throughput: ${throughput.toFixed(2)} messages/second`);
      console.log(`Average response time: ${(duration / messageCount).toFixed(2)}ms`);

      // Expect at least 20 messages per second
      expect(throughput).toBeGreaterThan(20);
    }, 10000);

    it('should maintain response time under 100ms for single message creation', async () => {
      // Arrange
      const maxResponseTime = 100; // 100ms
      const iterations = 10;
      const responseTimes: number[] = [];

      const messageData = {
        conversationId: '123e4567-e89b-12d3-a456-426614174000',
        direction: 'inbound',
        content: {
          text: 'Response time test message',
          format: 'text',
        },
        sender: {
          email: 'response-time-test@example.com',
          name: 'Response Time Tester',
          type: 'customer',
        },
        metadata: {
          source: 'response-time-test',
        },
      };

      // Act
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/v1/messages')
          .set('x-organization-id', 'response-time-test-org')
          .set('x-integration-id', 'response-time-test-integration')
          .send({
            ...messageData,
            content: {
              ...messageData.content,
              text: `Response time test message ${i + 1}`,
            },
          })
          .expect(201);

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);

        expect(response.body.success).toBe(true);
      }

      // Assert
      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / iterations;
      const maxResponseTimeActual = Math.max(...responseTimes);

      console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`Max response time: ${maxResponseTimeActual}ms`);
      console.log(`Min response time: ${Math.min(...responseTimes)}ms`);

      expect(averageResponseTime).toBeLessThan(maxResponseTime);
      expect(maxResponseTimeActual).toBeLessThan(maxResponseTime * 2); // Allow some variance
    });
  });

  describe('Message Retrieval Performance', () => {
    beforeAll(async () => {
      // Create test messages for retrieval performance testing
      const messageCount = 50;
      const promises = Array.from({ length: messageCount }, (_, index) =>
        request(app)
          .post('/api/v1/messages')
          .set('x-organization-id', 'retrieval-test-org')
          .set('x-integration-id', 'retrieval-test-integration')
          .send({
            conversationId: '123e4567-e89b-12d3-a456-426614174000',
            direction: 'inbound',
            content: {
              text: `Retrieval test message ${index + 1}`,
              format: 'text',
            },
            sender: {
              email: 'retrieval-test@example.com',
              name: 'Retrieval Tester',
              type: 'customer',
            },
            metadata: {
              source: 'retrieval-test',
              messageIndex: index,
            },
          })
          .expect(201)
      );

      await Promise.all(promises);
    });

    it('should retrieve message list within 200ms', async () => {
      // Arrange
      const maxResponseTime = 200; // 200ms
      const iterations = 5;
      const responseTimes: number[] = [];

      // Act
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/v1/messages')
          .query({
            organizationId: 'retrieval-test-org',
            conversationId: '123e4567-e89b-12d3-a456-426614174000',
            limit: 20,
            page: 1,
          })
          .expect(200);

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);

        expect(response.body.success).toBe(true);
        expect(response.body.data.messages).toBeDefined();
      }

      // Assert
      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / iterations;
      
      console.log(`Message list average response time: ${averageResponseTime.toFixed(2)}ms`);
      
      expect(averageResponseTime).toBeLessThan(maxResponseTime);
    });

    it('should handle concurrent message retrievals efficiently', async () => {
      // Arrange
      const concurrentRequests = 20;
      const maxDuration = 2000; // 2 seconds
      const startTime = Date.now();

      // Act
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/v1/messages')
          .query({
            organizationId: 'retrieval-test-org',
            conversationId: '123e4567-e89b-12d3-a456-426614174000',
            limit: 10,
            page: 1,
          })
          .expect(200)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(responses).toHaveLength(concurrentRequests);
      expect(duration).toBeLessThan(maxDuration);

      responses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.messages).toBeDefined();
      });

      console.log(`Concurrent retrieval duration: ${duration}ms`);
    });
  });

  describe('Message Processing Performance', () => {
    it('should process messages through the queue efficiently', async () => {
      // Arrange
      const messageCount = 50;
      const maxProcessingTime = 10000; // 10 seconds
      const startTime = Date.now();

      // Mock queue processing for performance testing
      const messageQueue = MessageQueueService.getInstance();
      let processedCount = 0;

      const mockProcessor = jest.fn().mockImplementation(async (job) => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));
        processedCount++;
        return Promise.resolve();
      });

      // Act
      // Simulate publishing messages to queue
      const publishPromises = Array.from({ length: messageCount }, (_, index) =>
        messageQueue.publishMessage('message.processing', {
          id: `perf-msg-${index}`,
          content: `Performance test message ${index}`,
          organizationId: 'perf-test-org',
          timestamp: new Date(),
        })
      );

      await Promise.all(publishPromises);

      // Simulate processing messages
      await messageQueue.consume('message.processing', mockProcessor, { noAck: false });

      // Wait for all messages to be processed
      while (processedCount < messageCount && (Date.now() - startTime) < maxProcessingTime) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(processedCount).toBe(messageCount);
      expect(duration).toBeLessThan(maxProcessingTime);

      const throughput = (messageCount / duration) * 1000;
      console.log(`Processing throughput: ${throughput.toFixed(2)} messages/second`);

      // Expect at least 5 messages per second processing
      expect(throughput).toBeGreaterThan(5);
    });
  });

  describe('Memory Usage Performance', () => {
    it('should maintain stable memory usage during high load', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();
      const messageCount = 200;
      const maxMemoryIncrease = 50 * 1024 * 1024; // 50MB

      // Act
      const promises = Array.from({ length: messageCount }, (_, index) =>
        request(app)
          .post('/api/v1/messages')
          .set('x-organization-id', 'memory-test-org')
          .set('x-integration-id', 'memory-test-integration')
          .send({
            conversationId: '123e4567-e89b-12d3-a456-426614174000',
            direction: 'inbound',
            content: {
              text: `Memory test message ${index + 1}`,
              format: 'text',
            },
            sender: {
              email: 'memory-test@example.com',
              name: 'Memory Tester',
              type: 'customer',
            },
            metadata: {
              source: 'memory-test',
              messageIndex: index,
            },
          })
          .expect(201)
      );

      await Promise.all(promises);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();

      // Assert
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Final memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

      expect(memoryIncrease).toBeLessThan(maxMemoryIncrease);
    }, 15000);
  });

  describe('Database Connection Performance', () => {
    it('should handle database operations efficiently under load', async () => {
      // Arrange
      const operationCount = 100;
      const maxDuration = 3000; // 3 seconds
      const startTime = Date.now();

      // Act
      const promises = Array.from({ length: operationCount }, async (_, index) => {
        // Simulate database operations
        const key = `perf-test:${index}`;
        const value = { messageId: `msg-${index}`, timestamp: Date.now() };
        
        await redis.set(key, JSON.stringify(value), { ttl: 60 });
        const retrieved = await redis.get(key);
        await redis.del(key);
        
        return retrieved;
      });

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(results).toHaveLength(operationCount);
      expect(duration).toBeLessThan(maxDuration);

      const throughput = (operationCount / duration) * 1000;
      console.log(`Database operation throughput: ${throughput.toFixed(2)} ops/second`);

      // Expect at least 30 operations per second
      expect(throughput).toBeGreaterThan(30);
    });
  });
});
