/**
 * API Endpoints Integration Tests
 */

import request from 'supertest';
import express from 'express';
import { DatabaseService } from '../../src/services/database';
import { QueueService } from '../../src/services/queue';
import { IntegrationManager } from '../../src/services/integration-manager';

// Import routes
import integrationRoutes from '../../src/routes/integrations';
import webhookRoutes from '../../src/routes/webhooks';
import authRoutes from '../../src/routes/auth';
import healthRoutes from '../../src/routes/health';

describe('API Endpoints Integration Tests', () => {
  let app: express.Application;
  let mockUser: any;
  let mockIntegration: any;

  beforeAll(async () => {
    // Initialize services with retry logic for database
    let retries = 10;
    while (retries > 0) {
      try {
        await DatabaseService.initialize();
        break;
      } catch (error) {
        console.log(`Database connection attempt failed, retries left: ${retries - 1}`);
        retries--;
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    await QueueService.initialize();
    await IntegrationManager.initialize();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    
    // Add mock auth middleware for testing
    app.use((req: any, res, next) => {
      req.user = mockUser;
      req.organizationId = mockUser?.organizationId;
      next();
    });

    app.use('/api/v1/integrations', integrationRoutes);
    app.use('/webhooks', webhookRoutes);
    app.use('/auth', authRoutes);
    app.use('/health', healthRoutes);
  }, 30000);

  afterAll(async () => {
    await IntegrationManager.close();
    await QueueService.close();
    await DatabaseService.close();
  });

  beforeEach(() => {
    mockUser = global.testUtils.createMockUser();
    mockIntegration = global.testUtils.createMockIntegration();
  });

  describe('Health Endpoints', () => {
    test('GET /health should return basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service', 'integration-service');
    });

    test('GET /health/detailed should return detailed health status', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('queue');
      expect(response.body.checks).toHaveProperty('integrationManager');
    });

    test('GET /health/ready should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
    });

    test('GET /health/live should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
    });
  });

  describe('Integration Endpoints', () => {
    test('GET /api/v1/integrations should return integrations list', async () => {
      const response = await request(app)
        .get('/api/v1/integrations')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('integrations');
      expect(response.body.data).toHaveProperty('pagination');
    });

    test('POST /api/v1/integrations should create new integration', async () => {
      const integrationData = {
        name: 'Test Gmail Integration',
        type: 'email',
        provider: 'gmail',
        config: {
          autoSync: true,
          syncInterval: 300000,
        },
        credentials: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
      };

      const response = await request(app)
        .post('/api/v1/integrations')
        .send(integrationData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', integrationData.name);
      expect(response.body.data).toHaveProperty('provider', integrationData.provider);
    });

    test('GET /api/v1/integrations/:id should return specific integration', async () => {
      // This test assumes the integration exists in the database
      // In a real test, you would create it first
      const integrationId = 'test-integration-id';
      
      const response = await request(app)
        .get(`/api/v1/integrations/${integrationId}`)
        .expect(404); // Expecting 404 since integration doesn't exist

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Integration not found');
    });

    test('PUT /api/v1/integrations/:id should update integration', async () => {
      const integrationId = 'test-integration-id';
      const updateData = {
        name: 'Updated Integration Name',
        config: {
          autoSync: false,
        },
      };

      const response = await request(app)
        .put(`/api/v1/integrations/${integrationId}`)
        .send(updateData)
        .expect(404); // Expecting 404 since integration doesn't exist

      expect(response.body).toHaveProperty('success', false);
    });

    test('DELETE /api/v1/integrations/:id should delete integration', async () => {
      const integrationId = 'test-integration-id';

      const response = await request(app)
        .delete(`/api/v1/integrations/${integrationId}`)
        .expect(404); // Expecting 404 since integration doesn't exist

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Webhook Endpoints', () => {
    test('POST /webhooks/gmail should handle Gmail webhook', async () => {
      const webhookPayload = {
        message: {
          data: Buffer.from(JSON.stringify({ historyId: '12345' })).toString('base64'),
          messageId: 'test-message-id',
          publishTime: new Date().toISOString(),
        },
        subscription: 'test-subscription',
      };

      const response = await request(app)
        .post('/webhooks/gmail')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toBe('OK');
    });

    test('POST /webhooks/microsoft should handle Microsoft webhook', async () => {
      const webhookPayload = {
        value: [
          {
            subscriptionId: 'test-subscription',
            changeType: 'created',
            resource: '/me/messages/test-message',
            resourceData: {
              id: 'test-message-id',
            },
          },
        ],
      };

      const response = await request(app)
        .post('/webhooks/microsoft')
        .send(webhookPayload)
        .expect(202);

      expect(response.text).toBe('Accepted');
    });

    test('GET /webhooks/status should return webhook status', async () => {
      const response = await request(app)
        .get('/webhooks/status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('webhookQueue');
      expect(response.body.data).toHaveProperty('supportedProviders');
      expect(response.body.data).toHaveProperty('endpoints');
    });
  });

  describe('Auth Endpoints', () => {
    test('GET /auth/google/authorize should return Google auth URL', async () => {
      const response = await request(app)
        .get('/auth/google/authorize')
        .query({ organizationId: 'test-org-id' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('authUrl');
      expect(response.body.data).toHaveProperty('provider', 'google');
      expect(response.body.data).toHaveProperty('scopes');
    });

    test('GET /auth/microsoft/authorize should return Microsoft auth URL', async () => {
      const response = await request(app)
        .get('/auth/microsoft/authorize')
        .query({ organizationId: 'test-org-id' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('authUrl');
      expect(response.body.data).toHaveProperty('provider', 'microsoft');
      expect(response.body.data).toHaveProperty('scopes');
    });

    test('POST /auth/google/refresh should refresh Google token', async () => {
      const refreshData = {
        refreshToken: 'mock-refresh-token',
      };

      const response = await request(app)
        .post('/auth/google/refresh')
        .send(refreshData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid JSON payload', async () => {
      const response = await request(app)
        .post('/api/v1/integrations')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);

      // Express should handle this automatically
    });

    test('should handle missing required fields', async () => {
      const invalidData = {
        name: 'Test Integration',
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/v1/integrations')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    test('should handle invalid UUID in params', async () => {
      const response = await request(app)
        .get('/api/v1/integrations/invalid-uuid')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });
});
