/**
 * AI Service Integration Tests
 * Comprehensive tests for the AI Processing Engine
 */

import request from 'supertest';
import AiService from '@/index';
import { messageClassificationService } from '@/services/classification';
import { responseGenerationService } from '@/services/response-generation';
import { performanceMonitoringService } from '@/services/performance-monitoring';

describe('AI Service Integration Tests', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    // Create test app instance
    const aiService = new AiService();
    app = aiService.getApp();
    
    // Start test server
    server = app.listen(0); // Use random port for testing
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Health Checks', () => {
    test('GET /health should return service status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'ai-service',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String),
      });
    });

    test('GET /api/v1/health/detailed should return detailed health status', async () => {
      const response = await request(app)
        .get('/api/v1/health/detailed')
        .expect(200);

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/healthy|unhealthy/),
        service: 'ai-service',
        components: {
          database: expect.objectContaining({
            healthy: expect.any(Boolean),
          }),
          queue: expect.objectContaining({
            healthy: expect.any(Boolean),
          }),
          providers: expect.any(Array),
          memory: expect.objectContaining({
            healthy: expect.any(Boolean),
          }),
        },
      });
    });

    test('GET /api/v1/health/ready should return readiness status', async () => {
      const response = await request(app)
        .get('/api/v1/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ready',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Message Classification API', () => {
    test('POST /api/v1/ai/classify should classify a message', async () => {
      const mockMessage = testUtils.createMockMessage();
      
      // Mock the classification service
      const mockResult = testUtils.createMockClassificationResult();
      jest.spyOn(messageClassificationService, 'classifyMessage')
        .mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/ai/classify')
        .send(mockMessage)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Object),
        timestamp: expect.any(String),
      });

      expect(response.body.data).toBeValidClassificationResult();
    });

    test('POST /api/v1/ai/classify should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/ai/classify')
        .send({
          messageId: 'test-123',
          // Missing organizationId and messageText
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('required'),
        }),
      });
    });

    test('POST /api/v1/ai/classify-batch should handle batch classification', async () => {
      const messages = [
        testUtils.createMockMessage(),
        { ...testUtils.createMockMessage(), messageId: 'test-message-456' },
      ];

      const mockResults = [
        testUtils.createMockClassificationResult(),
        { ...testUtils.createMockClassificationResult(), messageId: 'test-message-456' },
      ];

      jest.spyOn(messageClassificationService, 'classifyMessages')
        .mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/api/v1/ai/classify-batch')
        .send({ messages })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          results: expect.any(Array),
          processed: 2,
          total: 2,
        },
      });
    });

    test('POST /api/v1/ai/classify-batch should limit batch size', async () => {
      const messages = Array.from({ length: 101 }, (_, i) => ({
        ...testUtils.createMockMessage(),
        messageId: `test-message-${i}`,
      }));

      const response = await request(app)
        .post('/api/v1/ai/classify-batch')
        .send({ messages })
        .expect(400);

      expect(response.body.error.message).toContain('Maximum 100 messages');
    });
  });

  describe('Response Generation API', () => {
    test('POST /api/v1/ai/generate-response should generate a response', async () => {
      const mockRequest = {
        ...testUtils.createMockMessage(),
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: testUtils.createMockOrganizationContext(),
      };

      const mockResult = testUtils.createMockResponseResult();
      jest.spyOn(responseGenerationService, 'generateResponse')
        .mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/ai/generate-response')
        .send(mockRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Object),
        timestamp: expect.any(String),
      });

      expect(response.body.data).toBeValidResponseResult();
    });

    test('POST /api/v1/ai/generate-alternatives should generate multiple responses', async () => {
      const mockRequest = {
        ...testUtils.createMockMessage(),
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: testUtils.createMockOrganizationContext(),
        count: 3,
      };

      const mockResults = [
        testUtils.createMockResponseResult(),
        testUtils.createMockResponseResult(),
        testUtils.createMockResponseResult(),
      ];

      jest.spyOn(responseGenerationService, 'generateResponseAlternatives')
        .mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/api/v1/ai/generate-alternatives')
        .send(mockRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          alternatives: expect.any(Array),
          count: 3,
        },
      });

      expect(response.body.data.alternatives).toHaveLength(3);
    });
  });

  describe('Provider Management API', () => {
    test('GET /api/v1/ai/providers should return provider status', async () => {
      const response = await request(app)
        .get('/api/v1/ai/providers')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        timestamp: expect.any(String),
      });
    });

    test('GET /api/v1/ai/provider-types should return available provider types', async () => {
      const response = await request(app)
        .get('/api/v1/ai/provider-types')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        timestamp: expect.any(String),
      });
    });
  });

  describe('Analytics API', () => {
    test('GET /api/v1/ai/stats/classification should return classification stats', async () => {
      const mockStats = {
        totalClassifications: 100,
        categoryBreakdown: { inquiry: 50, complaint: 30, compliment: 20 },
        urgencyBreakdown: { normal: 70, high: 20, urgent: 10 },
        sentimentBreakdown: { positive: 40, neutral: 40, negative: 20 },
        averageConfidence: 0.85,
        averageProcessingTime: 1500,
        totalCost: 0.50,
      };

      jest.spyOn(messageClassificationService, 'getClassificationStats')
        .mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/ai/stats/classification')
        .query({ organizationId: 'test-org-456' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockStats,
        timestamp: expect.any(String),
      });
    });

    test('GET /api/v1/ai/stats/responses should return response stats', async () => {
      const mockStats = {
        totalResponses: 80,
        averageConfidence: 0.9,
        averageProcessingTime: 2000,
        totalCost: 1.20,
        humanReviewRate: 0.15,
        qualityScoreDistribution: {},
      };

      jest.spyOn(responseGenerationService, 'getResponseStats')
        .mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/ai/stats/responses')
        .query({ organizationId: 'test-org-456' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockStats,
        timestamp: expect.any(String),
      });
    });

    test('GET /api/v1/ai/history/classification should return classification history', async () => {
      const mockHistory = [testUtils.createMockClassificationResult()];

      jest.spyOn(messageClassificationService, 'getClassificationHistory')
        .mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/v1/ai/history/classification')
        .query({ organizationId: 'test-org-456', limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        timestamp: expect.any(String),
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'Endpoint not found',
          path: '/api/v1/unknown-endpoint',
          method: 'GET',
        },
      });
    });

    test('should handle validation errors gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/ai/classify')
        .send({}) // Empty body
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.any(String),
        }),
      });
    });

    test('should handle internal server errors gracefully', async () => {
      // Mock a service to throw an error
      jest.spyOn(messageClassificationService, 'classifyMessage')
        .mockRejectedValue(new Error('Internal service error'));

      const response = await request(app)
        .post('/api/v1/ai/classify')
        .send(testUtils.createMockMessage())
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.any(String),
        }),
      });
    });
  });
});
