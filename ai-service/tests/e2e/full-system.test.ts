/**
 * End-to-End System Tests
 * Comprehensive tests for the entire AI Service system
 */

import request from 'supertest';
import AiService from '@/index';
import { DatabaseService } from '@/services/database';
import { AiQueueService } from '@/services/queue';

describe('AI Service E2E Tests', () => {
  let app: any;
  let server: any;
  let aiService: AiService;

  beforeAll(async () => {
    // Initialize test environment
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    
    // Create and start AI service
    aiService = new AiService();
    app = aiService.getApp();
    server = app.listen(0);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    
    // Cleanup services
    await AiQueueService.close();
    await DatabaseService.close();
  });

  describe('System Health', () => {
    test('should have all services healthy', async () => {
      const response = await request(app)
        .get('/api/v1/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.components.database.healthy).toBe(true);
      expect(response.body.components.queue.healthy).toBe(true);
    });

    test('should be ready for requests', async () => {
      const response = await request(app)
        .get('/api/v1/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
    });
  });

  describe('Complete Message Processing Workflow', () => {
    test('should process message from classification to response generation', async () => {
      // Step 1: Classify message
      const classificationRequest = {
        messageId: 'e2e_test_msg_001',
        organizationId: 'e2e_test_org',
        integrationId: 'e2e_test_integration',
        messageText: 'I am very frustrated with my delayed order and need immediate assistance',
        sender: {
          email: 'test@example.com',
          name: 'Test Customer',
          tier: 'premium',
        },
        context: {
          conversationHistory: [],
          customerInfo: {
            previousInteractions: 3,
            satisfactionScore: 2.5,
          },
        },
        options: {
          includeEntities: true,
          includeSentiment: true,
          confidenceThreshold: 0.7,
        },
      };

      const classificationResponse = await request(app)
        .post('/api/v1/ai/classify')
        .send(classificationRequest)
        .expect(200);

      expect(classificationResponse.body.success).toBe(true);
      expect(classificationResponse.body.data).toBeValidClassificationResult();
      
      const classification = classificationResponse.body.data;
      expect(classification.classification.category).toMatch(/complaint|technical_support/);
      expect(classification.sentiment.label).toBe('negative');
      expect(classification.priority.level).toMatch(/high|urgent|critical/);
      expect(classification.requiresHumanReview).toBe(true);

      // Step 2: Generate response using classification
      const responseRequest = {
        messageId: 'e2e_test_msg_001',
        organizationId: 'e2e_test_org',
        integrationId: 'e2e_test_integration',
        messageText: classificationRequest.messageText,
        classification: classification.classification,
        conversationContext: {
          history: [
            {
              role: 'customer' as const,
              content: classificationRequest.messageText,
              timestamp: new Date(),
            },
          ],
          customerInfo: {
            id: 'test_customer_001',
            name: 'Test Customer',
            email: 'test@example.com',
            tier: 'premium',
            language: 'en',
            timezone: 'America/New_York',
            previousInteractions: 3,
            satisfactionScore: 2.5,
          },
        },
        organizationContext: {
          businessInfo: {
            name: 'E2E Test Company',
            industry: 'E-commerce',
            businessType: 'B2C',
            website: 'https://e2etest.com',
            supportHours: '24/7',
          },
          policies: {
            returnPolicy: '30-day hassle-free returns',
            shippingPolicy: 'Free shipping on orders over $50',
            privacyPolicy: 'We protect your privacy',
          },
          knowledgeBase: [
            {
              id: 'kb_shipping_delays',
              title: 'Shipping Delays FAQ',
              content: 'Due to high demand, some orders may experience delays. We apologize for any inconvenience and are working to resolve this quickly.',
              category: 'shipping',
              tags: ['shipping', 'delays', 'orders'],
            },
            {
              id: 'kb_premium_support',
              title: 'Premium Customer Support',
              content: 'Premium customers receive priority support with dedicated agents and expedited resolution.',
              category: 'support',
              tags: ['premium', 'support', 'priority'],
            },
          ],
          brandVoice: {
            tone: 'professional' as const,
            style: 'Empathetic and solution-focused',
            doNotUse: ['Unfortunately', 'I apologize for the inconvenience'],
            preferredPhrases: ['I understand your frustration', 'Let me help you resolve this'],
          },
        },
        options: {
          tone: 'professional',
          length: 'medium',
          includeReasoning: true,
          includeAlternatives: false,
        },
      };

      const responseResponse = await request(app)
        .post('/api/v1/ai/generate-response')
        .send(responseRequest)
        .expect(200);

      expect(responseResponse.body.success).toBe(true);
      expect(responseResponse.body.data).toBeValidResponseResult();
      
      const response = responseResponse.body.data;
      expect(response.response.content).toContain('Test Customer'); // Personalized
      expect(response.response.confidence).toBeGreaterThan(0.7);
      expect(response.qualityScore).toBeGreaterThan(70);
      expect(response.knowledgeBaseUsed.length).toBeGreaterThan(0);
      expect(response.response.suggestedActions.length).toBeGreaterThan(0);

      // Step 3: Verify cost tracking
      expect(classification.cost).toBeGreaterThan(0);
      expect(response.cost).toBeGreaterThan(0);
      
      // Step 4: Verify performance metrics
      expect(classification.processingTime).toBeGreaterThan(0);
      expect(response.processingTime).toBeGreaterThan(0);
    });

    test('should handle batch processing efficiently', async () => {
      const messages = [
        {
          messageId: 'batch_001',
          organizationId: 'e2e_test_org',
          messageText: 'Thank you for the excellent service!',
          sender: { tier: 'standard' },
        },
        {
          messageId: 'batch_002',
          organizationId: 'e2e_test_org',
          messageText: 'My order is missing items, please help',
          sender: { tier: 'premium' },
        },
        {
          messageId: 'batch_003',
          organizationId: 'e2e_test_org',
          messageText: 'How do I track my shipment?',
          sender: { tier: 'standard' },
        },
      ];

      const response = await request(app)
        .post('/api/v1/ai/classify-batch')
        .send({ messages })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(3);
      expect(response.body.data.processed).toBe(3);
      expect(response.body.data.total).toBe(3);

      // Verify different classifications
      const results = response.body.data.results;
      expect(results[0].classification.category).toMatch(/compliment|positive/);
      expect(results[1].classification.category).toMatch(/complaint|issue/);
      expect(results[2].classification.category).toMatch(/inquiry|question/);
    });
  });

  describe('Provider Management', () => {
    test('should manage AI providers', async () => {
      // Get current providers
      const getResponse = await request(app)
        .get('/api/v1/ai/providers')
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(Array.isArray(getResponse.body.data)).toBe(true);

      // Add new provider
      const newProvider = {
        organizationId: 'e2e_test_org',
        name: 'Test OpenAI Provider',
        provider: 'openai',
        apiKey: 'sk-test-key-for-e2e',
        baseUrl: 'https://api.openai.com/v1',
        rateLimits: {
          requestsPerMinute: 60,
          tokensPerMinute: 40000,
        },
        costConfig: {
          inputTokenCost: 0.0015,
          outputTokenCost: 0.002,
        },
        features: ['text_generation', 'classification'],
        priority: 5,
      };

      const addResponse = await request(app)
        .post('/api/v1/ai/providers')
        .send(newProvider)
        .expect(201);

      expect(addResponse.body.success).toBe(true);
      expect(addResponse.body.data.id).toBeDefined();

      const providerId = addResponse.body.data.id;

      // Remove provider
      const deleteResponse = await request(app)
        .delete(`/api/v1/ai/providers/${providerId}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    test('should manage model configurations', async () => {
      const modelConfig = {
        organizationId: 'e2e_test_org',
        providerId: 'test_provider',
        name: 'test_model',
        displayName: 'Test Model',
        type: 'chat',
        isActive: true,
        configuration: {
          maxTokens: 2048,
          temperature: 0.7,
          topP: 0.9,
          systemPrompt: 'You are a helpful assistant.',
        },
        capabilities: ['text_generation', 'classification'],
        costSettings: {
          inputTokenCost: 0.001,
          outputTokenCost: 0.002,
        },
        performanceSettings: {
          timeoutMs: 30000,
          maxRetries: 3,
          confidenceThreshold: 0.8,
          qualityThreshold: 75,
        },
        metadata: {
          description: 'Test model for E2E testing',
        },
      };

      const response = await request(app)
        .post('/api/v1/ai/config/models')
        .send(modelConfig)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
    });

    test('should manage training data', async () => {
      const trainingData = {
        organizationId: 'e2e_test_org',
        type: 'classification',
        category: 'complaint',
        input: 'This product is terrible and I want my money back',
        expectedOutput: 'complaint',
        metadata: {
          source: 'e2e_test',
          verified: true,
          confidence: 0.95,
        },
        isActive: true,
      };

      const response = await request(app)
        .post('/api/v1/ai/config/training-data')
        .send(trainingData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
    });

    test('should manage prompt templates', async () => {
      const promptTemplate = {
        organizationId: 'e2e_test_org',
        name: 'Customer Response Template',
        description: 'Template for generating customer responses',
        type: 'response',
        template: 'Hello {{customerName}}, thank you for contacting {{companyName}}. {{responseContent}}',
        variables: [
          {
            name: 'customerName',
            type: 'string',
            required: true,
            description: 'Customer name',
          },
          {
            name: 'companyName',
            type: 'string',
            required: true,
            description: 'Company name',
          },
          {
            name: 'responseContent',
            type: 'string',
            required: true,
            description: 'Main response content',
          },
        ],
        examples: [
          {
            input: {
              customerName: 'John',
              companyName: 'Acme Corp',
              responseContent: 'We have received your inquiry.',
            },
            expectedOutput: 'Hello John, thank you for contacting Acme Corp. We have received your inquiry.',
          },
        ],
        isActive: true,
      };

      const response = await request(app)
        .post('/api/v1/ai/config/prompt-templates')
        .send(promptTemplate)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
    });
  });

  describe('Performance Monitoring', () => {
    test('should track and report performance metrics', async () => {
      // Get accuracy metrics
      const accuracyResponse = await request(app)
        .get('/api/v1/ai/monitoring/accuracy')
        .query({ organizationId: 'e2e_test_org', timeRange: 'day' })
        .expect(200);

      expect(accuracyResponse.body.success).toBe(true);
      expect(accuracyResponse.body.data).toMatchObject({
        classificationAccuracy: expect.any(Number),
        sentimentAccuracy: expect.any(Number),
        overallAccuracy: expect.any(Number),
        sampleSize: expect.any(Number),
        timeRange: 'day',
      });

      // Get cost metrics
      const costResponse = await request(app)
        .get('/api/v1/ai/monitoring/costs')
        .query({ organizationId: 'e2e_test_org', timeRange: 'day' })
        .expect(200);

      expect(costResponse.body.success).toBe(true);
      expect(costResponse.body.data).toMatchObject({
        totalCost: expect.any(Number),
        costByProvider: expect.any(Object),
        averageCostPerRequest: expect.any(Number),
        timeRange: 'day',
      });

      // Get quality metrics
      const qualityResponse = await request(app)
        .get('/api/v1/ai/monitoring/quality')
        .query({ organizationId: 'e2e_test_org', timeRange: 'day' })
        .expect(200);

      expect(qualityResponse.body.success).toBe(true);
      expect(qualityResponse.body.data).toMatchObject({
        averageQualityScore: expect.any(Number),
        humanReviewRate: expect.any(Number),
        customerSatisfactionScore: expect.any(Number),
        timeRange: 'day',
      });
    });
  });

  describe('Cost Optimization', () => {
    test('should optimize costs and generate predictions', async () => {
      // Get cost predictions
      const predictionResponse = await request(app)
        .get('/api/v1/ai/monitoring/cost-predictions')
        .query({ organizationId: 'e2e_test_org', period: 'day' })
        .expect(200);

      expect(predictionResponse.body.success).toBe(true);
      expect(predictionResponse.body.data).toMatchObject({
        organizationId: 'e2e_test_org',
        period: 'day',
        predictedCost: expect.any(Number),
        confidence: expect.any(Number),
        factors: expect.any(Array),
        recommendations: expect.any(Array),
      });

      // Check budget alerts
      const alertsResponse = await request(app)
        .get('/api/v1/ai/monitoring/budget-alerts')
        .query({ organizationId: 'e2e_test_org' })
        .expect(200);

      expect(alertsResponse.body.success).toBe(true);
      expect(Array.isArray(alertsResponse.body.data)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid requests gracefully', async () => {
      // Invalid classification request
      const invalidResponse = await request(app)
        .post('/api/v1/ai/classify')
        .send({
          messageId: '',
          organizationId: '',
          messageText: '',
        })
        .expect(400);

      expect(invalidResponse.body.success).toBe(false);
      expect(invalidResponse.body.error).toBeDefined();
    });

    test('should handle service errors gracefully', async () => {
      // Request with very long text (should trigger validation)
      const longTextResponse = await request(app)
        .post('/api/v1/ai/classify')
        .send({
          messageId: 'test_long',
          organizationId: 'test_org',
          messageText: 'a'.repeat(100000), // Very long text
        })
        .expect(400);

      expect(longTextResponse.body.success).toBe(false);
      expect(longTextResponse.body.error.message).toContain('too long');
    });
  });
});
