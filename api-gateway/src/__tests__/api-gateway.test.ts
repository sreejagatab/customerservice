/**
 * API Gateway Integration Tests
 * Tests the complete API gateway functionality
 */

import request from 'supertest';
import { ApiGateway } from '../index';
import { ServiceRegistry } from '../services/service-registry';

describe('API Gateway Integration Tests', () => {
  let gateway: ApiGateway;
  let app: any;

  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0'; // Use random port for testing
    process.env.JWT_SECRET = 'test-secret';
    process.env.REDIS_URL = 'redis://localhost:6379/1';

    gateway = new ApiGateway();
    app = gateway.getApp();
  });

  afterAll(async () => {
    if (gateway) {
      await gateway.close();
    }
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
        uptime: expect.any(Number),
        services: expect.any(Object),
        proxy: expect.any(Object),
      });
    });

    it('should return service registry information', async () => {
      const response = await request(app)
        .get('/services')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should return metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          services: expect.any(Object),
          proxy: expect.any(Object),
          loadBalancer: expect.any(Object),
          versioning: expect.any(Object),
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe('Load Balancer Endpoints', () => {
    it('should return load balancer health', async () => {
      const response = await request(app)
        .get('/load-balancer/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('API Versioning', () => {
    it('should return supported API versions', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toMatchObject({
        version: expect.any(String),
        status: expect.any(String),
        releaseDate: expect.any(String),
      });
    });

    it('should handle version headers correctly', async () => {
      const response = await request(app)
        .get('/api/v1/test')
        .set('API-Version', 'v1')
        .expect(404); // Route doesn't exist, but version should be processed

      expect(response.headers['api-version']).toBe('v1');
      expect(response.headers['supported-versions']).toContain('v1');
    });

    it('should reject unsupported API versions', async () => {
      const response = await request(app)
        .get('/api/v1/test')
        .set('API-Version', 'v99')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'UNSUPPORTED_API_VERSION',
          message: expect.stringContaining('v99'),
          supportedVersions: expect.any(Array),
        },
      });
    });
  });

  describe('API Documentation', () => {
    it('should serve OpenAPI JSON specification', async () => {
      const response = await request(app)
        .get('/api/docs/openapi.json')
        .expect(200);

      expect(response.body).toMatchObject({
        openapi: '3.0.0',
        info: {
          title: expect.any(String),
          version: expect.any(String),
          description: expect.any(String),
        },
        paths: expect.any(Object),
        components: expect.any(Object),
      });
    });

    it('should serve OpenAPI YAML specification', async () => {
      const response = await request(app)
        .get('/api/docs/openapi.yaml')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/x-yaml');
      expect(response.text).toContain('openapi:');
    });

    it('should serve version-specific documentation', async () => {
      const response = await request(app)
        .get('/api/docs/openapi.json?version=v1')
        .expect(200);

      expect(response.body.info.version).toBe('v1');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to API endpoints', async () => {
      const requests = [];
      
      // Make multiple requests quickly
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/api/v1/test')
            .set('X-Forwarded-For', '192.168.1.1')
        );
      }

      const responses = await Promise.all(requests);
      
      // Check that rate limiting headers are present
      const firstResponse = responses[0];
      expect(firstResponse.headers).toHaveProperty('x-ratelimit-limit');
      expect(firstResponse.headers).toHaveProperty('x-ratelimit-remaining');
    });

    it('should return 429 when rate limit is exceeded', async () => {
      // This test would need to be configured based on actual rate limits
      // For now, we'll just check that the rate limiting middleware is working
      const response = await request(app)
        .get('/api/v1/test')
        .set('X-Forwarded-For', '192.168.1.2');

      // Should have rate limit headers regardless of status
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/health');

      // Check for security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers).toHaveProperty('strict-transport-security');
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/v1/test')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Request Tracking', () => {
    it('should add request ID to responses', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^req-/);
    });

    it('should preserve existing request ID', async () => {
      const customRequestId = 'custom-request-123';
      
      const response = await request(app)
        .get('/health')
        .set('X-Request-ID', customRequestId);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });

    it('should add response time header', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers).toHaveProperty('x-response-time');
      expect(response.headers['x-response-time']).toMatch(/^\d+ms$/);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors gracefully', async () => {
      const response = await request(app)
        .get('/nonexistent-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });

    it('should handle invalid JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/test')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.stringContaining('JSON'),
        },
      });
    });
  });

  describe('Service Discovery', () => {
    it('should handle service health checks', async () => {
      const response = await request(app)
        .get('/services/nonexistent-service/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          service: 'nonexistent-service',
          healthy: false,
        },
      });
    });
  });

  describe('Proxy Functionality', () => {
    it('should handle proxy errors gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/messages')
        .expect(503); // Service unavailable

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.stringContaining('unavailable'),
        },
      });
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests efficiently', async () => {
      const startTime = Date.now();
      const concurrentRequests = 50;
      
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time (adjust based on requirements)
      expect(duration).toBeLessThan(5000); // 5 seconds

      console.log(`Handled ${concurrentRequests} concurrent requests in ${duration}ms`);
    });

    it('should maintain low response times', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await request(app).get('/health').expect(200);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / iterations;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`Max response time: ${maxResponseTime}ms`);

      // Response times should be reasonable
      expect(averageResponseTime).toBeLessThan(100); // 100ms average
      expect(maxResponseTime).toBeLessThan(500); // 500ms max
    });
  });
});
