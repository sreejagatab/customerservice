/**
 * Partner Ecosystem Integration Tests
 * Tests the complete partner ecosystem functionality
 */

import request from 'supertest';
import { PartnerService } from '../index';
import { PartnerPortalService } from '../services/partner-portal';
import { RevenueSharingService } from '../services/revenue-sharing';
import { MarketplaceService } from '../services/marketplace';

describe('Partner Ecosystem Integration Tests', () => {
  let partnerService: PartnerService;
  let app: any;
  let testPartnerId: string;
  let testUserId: string;
  let testOrganizationId: string;

  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/partner_service_test';
    process.env.REDIS_URL = 'redis://localhost:6379/1';

    partnerService = new PartnerService();
    app = partnerService.getApp();

    // Create test data
    testPartnerId = 'partner_test_123';
    testUserId = 'user_test_123';
    testOrganizationId = 'org_test_123';
  });

  afterAll(async () => {
    if (partnerService) {
      await partnerService.close();
    }
  });

  describe('Partner Management', () => {
    it('should create a new partner', async () => {
      const partnerData = {
        name: 'Test Partner',
        email: 'test@partner.com',
        contactPerson: 'John Doe',
        phone: '+1234567890',
        partnerType: 'reseller',
        commissionRate: 25,
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US',
        },
      };

      const response = await request(app)
        .post('/api/v1/partners')
        .set('X-Organization-ID', testOrganizationId)
        .send(partnerData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          name: partnerData.name,
          email: partnerData.email,
          partnerType: partnerData.partnerType,
          commissionRate: partnerData.commissionRate,
        },
      });

      testPartnerId = response.body.data.id;
    });

    it('should get partner details', async () => {
      const response = await request(app)
        .get(`/api/v1/partners/${testPartnerId}`)
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testPartnerId,
          name: 'Test Partner',
          email: 'test@partner.com',
        },
      });
    });

    it('should update partner information', async () => {
      const updateData = {
        commissionRate: 30,
        tier: 'gold',
      };

      const response = await request(app)
        .put(`/api/v1/partners/${testPartnerId}`)
        .set('X-Organization-ID', testOrganizationId)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testPartnerId,
          commissionRate: 30,
          tier: 'gold',
        },
      });
    });

    it('should list partners with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/partners')
        .set('X-Organization-ID', testOrganizationId)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          partners: expect.any(Array),
          pagination: {
            page: 1,
            limit: 10,
            total: expect.any(Number),
            totalPages: expect.any(Number),
          },
        },
      });
    });
  });

  describe('Partner Portal', () => {
    it('should get partner dashboard', async () => {
      const response = await request(app)
        .get(`/api/v1/partners/${testPartnerId}/dashboard`)
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          partnerId: testPartnerId,
          overview: {
            totalRevenue: expect.any(Number),
            monthlyRevenue: expect.any(Number),
            customerCount: expect.any(Number),
            apiUsage: expect.any(Number),
          },
          recentActivity: expect.any(Array),
          alerts: expect.any(Array),
          quickActions: expect.any(Array),
        },
      });
    });

    it('should get partner onboarding status', async () => {
      const response = await request(app)
        .get(`/api/v1/partners/${testPartnerId}/onboarding`)
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          partnerId: testPartnerId,
          currentStep: expect.any(Number),
          totalSteps: expect.any(Number),
          steps: expect.any(Array),
          progress: expect.any(Number),
        },
      });
    });

    it('should update onboarding step', async () => {
      const response = await request(app)
        .put(`/api/v1/partners/${testPartnerId}/onboarding/profile_setup`)
        .set('X-Organization-ID', testOrganizationId)
        .send({ status: 'completed' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Onboarding step updated successfully',
      });
    });

    it('should get partner resources', async () => {
      const response = await request(app)
        .get(`/api/v1/partners/${testPartnerId}/resources`)
        .set('X-Organization-ID', testOrganizationId)
        .query({ category: 'getting_started' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should create portal user', async () => {
      const userData = {
        email: 'portal-user@partner.com',
        firstName: 'Portal',
        lastName: 'User',
        role: 'manager',
      };

      const response = await request(app)
        .post(`/api/v1/partners/${testPartnerId}/users`)
        .set('X-Organization-ID', testOrganizationId)
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          partnerId: testPartnerId,
          email: userData.email,
          role: userData.role,
        },
      });
    });
  });

  describe('Revenue Sharing', () => {
    it('should calculate revenue for a partner', async () => {
      const period = {
        start: '2024-01-01',
        end: '2024-01-31',
        type: 'monthly',
      };

      const response = await request(app)
        .post(`/api/v1/revenue/${testPartnerId}/calculate`)
        .set('X-Organization-ID', testOrganizationId)
        .send({ period })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          partnerId: testPartnerId,
          period: {
            start: expect.any(String),
            end: expect.any(String),
            type: 'monthly',
          },
          revenue: {
            gross: expect.any(Number),
            net: expect.any(Number),
            currency: expect.any(String),
          },
          commission: {
            rate: expect.any(Number),
            amount: expect.any(Number),
          },
          finalPayout: expect.any(Number),
        },
      });
    });

    it('should generate revenue report', async () => {
      const period = {
        start: '2024-01-01',
        end: '2024-03-31',
        type: 'quarterly',
      };

      const response = await request(app)
        .get(`/api/v1/revenue/${testPartnerId}/report`)
        .set('X-Organization-ID', testOrganizationId)
        .query(period)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          partnerId: testPartnerId,
          period,
          summary: {
            totalRevenue: expect.any(Number),
            totalCommission: expect.any(Number),
            customerCount: expect.any(Number),
          },
          breakdown: {
            byMonth: expect.any(Array),
            byProduct: expect.any(Array),
            byCustomer: expect.any(Array),
          },
          trends: expect.any(Object),
          forecasts: expect.any(Object),
        },
      });
    });

    it('should add payout method', async () => {
      const payoutMethod = {
        type: 'bank_transfer',
        name: 'Primary Bank Account',
        details: {
          bankAccount: {
            accountNumber: '1234567890',
            routingNumber: '123456789',
            bankName: 'Test Bank',
            accountType: 'checking',
          },
        },
        currency: 'USD',
        minimumAmount: 100,
        isDefault: true,
      };

      const response = await request(app)
        .post(`/api/v1/revenue/${testPartnerId}/payout-methods`)
        .set('X-Organization-ID', testOrganizationId)
        .send(payoutMethod)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          partnerId: testPartnerId,
          type: payoutMethod.type,
          name: payoutMethod.name,
          currency: payoutMethod.currency,
          isDefault: true,
        },
      });
    });

    it('should get payout methods', async () => {
      const response = await request(app)
        .get(`/api/v1/revenue/${testPartnerId}/payout-methods`)
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });

      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Marketplace', () => {
    let testAppId: string;

    it('should get marketplace categories', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/categories')
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should search marketplace apps', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/apps')
        .set('X-Organization-ID', testOrganizationId)
        .query({
          category: 'crm',
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          apps: expect.any(Array),
          total: expect.any(Number),
          page: 1,
          limit: 10,
          totalPages: expect.any(Number),
          facets: expect.any(Object),
        },
      });
    });

    it('should get featured apps', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/featured')
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should get app details', async () => {
      // First, get an app from the search results
      const searchResponse = await request(app)
        .get('/api/v1/marketplace/apps')
        .set('X-Organization-ID', testOrganizationId)
        .query({ limit: 1 });

      if (searchResponse.body.data.apps.length > 0) {
        testAppId = searchResponse.body.data.apps[0].id;

        const response = await request(app)
          .get(`/api/v1/marketplace/apps/${testAppId}`)
          .set('X-Organization-ID', testOrganizationId)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            id: testAppId,
            name: expect.any(String),
            description: expect.any(String),
            category: expect.any(String),
            pricing: expect.any(Object),
            media: expect.any(Object),
          },
        });
      }
    });

    it('should install an app', async () => {
      if (testAppId) {
        const response = await request(app)
          .post(`/api/v1/marketplace/apps/${testAppId}/install`)
          .set('X-Organization-ID', testOrganizationId)
          .send({
            configuration: {
              apiKey: 'test-api-key',
              webhookUrl: 'https://example.com/webhook',
            },
          })
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            id: expect.any(String),
            appId: testAppId,
            organizationId: testOrganizationId,
            status: 'active',
          },
        });
      }
    });

    it('should get installed apps', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/installations')
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('White-Label Branding', () => {
    it('should set branding configuration', async () => {
      const brandingData = {
        logo: 'https://example.com/logo.png',
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
        customDomain: 'partner.example.com',
        customCss: '.header { background-color: #007bff; }',
      };

      const response = await request(app)
        .put(`/api/v1/branding/${testOrganizationId}`)
        .set('X-Organization-ID', testOrganizationId)
        .send(brandingData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          organizationId: testOrganizationId,
          logo: brandingData.logo,
          primaryColor: brandingData.primaryColor,
          customDomain: brandingData.customDomain,
        },
      });
    });

    it('should get branding configuration', async () => {
      const response = await request(app)
        .get(`/api/v1/branding/${testOrganizationId}`)
        .set('X-Organization-ID', testOrganizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          organizationId: testOrganizationId,
          logo: expect.any(String),
          primaryColor: expect.any(String),
        },
      });
    });

    it('should preview branding changes', async () => {
      const previewData = {
        logo: 'https://example.com/new-logo.png',
        primaryColor: '#28a745',
      };

      const response = await request(app)
        .post(`/api/v1/branding/${testOrganizationId}/preview`)
        .set('X-Organization-ID', testOrganizationId)
        .send(previewData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          previewUrl: expect.any(String),
          expiresAt: expect.any(String),
        },
      });
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent partner dashboard requests', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get(`/api/v1/partners/${testPartnerId}/dashboard`)
          .set('X-Organization-ID', testOrganizationId)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds

      console.log(`Handled ${concurrentRequests} concurrent dashboard requests in ${duration}ms`);
    });

    it('should maintain low response times for marketplace search', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        await request(app)
          .get('/api/v1/marketplace/apps')
          .set('X-Organization-ID', testOrganizationId)
          .query({ page: 1, limit: 20 })
          .expect(200);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / iterations;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Marketplace search average response time: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`Marketplace search max response time: ${maxResponseTime}ms`);

      // Response times should be reasonable
      expect(averageResponseTime).toBeLessThan(200); // 200ms average
      expect(maxResponseTime).toBeLessThan(1000); // 1 second max
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid partner ID gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/partners/invalid-id')
        .set('X-Organization-ID', testOrganizationId)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.stringContaining('not found'),
        },
      });
    });

    it('should validate revenue calculation parameters', async () => {
      const invalidPeriod = {
        start: 'invalid-date',
        end: '2024-01-31',
        type: 'monthly',
      };

      const response = await request(app)
        .post(`/api/v1/revenue/${testPartnerId}/calculate`)
        .set('X-Organization-ID', testOrganizationId)
        .send({ period: invalidPeriod })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.stringContaining('Invalid'),
        },
      });
    });

    it('should handle marketplace app installation errors', async () => {
      const response = await request(app)
        .post('/api/v1/marketplace/apps/invalid-app-id/install')
        .set('X-Organization-ID', testOrganizationId)
        .send({})
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.stringContaining('not found'),
        },
      });
    });
  });
});
