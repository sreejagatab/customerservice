/**
 * Integration Tests for Admin API
 */

import request from 'supertest';
import { AdminService } from '../../src/index';

const app = new AdminService().getApp();

describe('Admin API Integration Tests', () => {
  let authToken: string;
  let organizationId: string;
  let userId: string;

  beforeAll(async () => {
    // Setup test data and authentication
    // This would typically involve creating test organization and admin user
    authToken = 'test-jwt-token';
    organizationId = 'test-org-123';
    userId = 'test-user-123';
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/v1/auth/login', () => {
      it('should login successfully with valid credentials', async () => {
        const loginData = {
          email: 'admin@test.com',
          password: 'TestPassword123!',
          organizationId: organizationId,
        };

        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(loginData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toBeDefined();
        expect(response.body.data.accessToken).toBeDefined();
        expect(response.body.data.refreshToken).toBeDefined();
        expect(response.body.data.expiresIn).toBeDefined();
      });

      it('should fail login with invalid credentials', async () => {
        const loginData = {
          email: 'admin@test.com',
          password: 'WrongPassword',
          organizationId: organizationId,
        };

        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(loginData)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Invalid credentials');
      });

      it('should require two-factor code when enabled', async () => {
        const loginData = {
          email: 'admin-2fa@test.com',
          password: 'TestPassword123!',
          organizationId: organizationId,
        };

        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(loginData)
          .expect(200);

        expect(response.body.success).toBe(false);
        expect(response.body.requiresTwoFactor).toBe(true);
        expect(response.body.error.message).toContain('Two-factor authentication code required');
      });

      it('should validate input fields', async () => {
        const invalidData = {
          email: 'invalid-email',
          password: '123', // Too short
          organizationId: '',
        };

        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(invalidData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.details).toContain('Invalid email format');
        expect(response.body.error.details).toContain('Password too short');
        expect(response.body.error.details).toContain('Organization ID is required');
      });
    });

    describe('POST /api/v1/auth/refresh', () => {
      it('should refresh token successfully', async () => {
        const refreshData = {
          refreshToken: 'valid-refresh-token',
        };

        const response = await request(app)
          .post('/api/v1/auth/refresh')
          .send(refreshData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.accessToken).toBeDefined();
      });

      it('should fail with invalid refresh token', async () => {
        const refreshData = {
          refreshToken: 'invalid-refresh-token',
        };

        const response = await request(app)
          .post('/api/v1/auth/refresh')
          .send(refreshData)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Invalid refresh token');
      });
    });

    describe('POST /api/v1/auth/logout', () => {
      it('should logout successfully', async () => {
        const response = await request(app)
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Logged out successfully');
      });
    });
  });

  describe('User Management Endpoints', () => {
    describe('POST /api/v1/users', () => {
      it('should create user successfully', async () => {
        const userData = {
          email: 'newuser@test.com',
          firstName: 'New',
          lastName: 'User',
          password: 'NewPassword123!',
          organizationId: organizationId,
          roles: ['user'],
        };

        const response = await request(app)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .send(userData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toBeDefined();
        expect(response.body.data.user.email).toBe(userData.email);
        expect(response.body.data.user.firstName).toBe(userData.firstName);
        expect(response.body.data.user.lastName).toBe(userData.lastName);
        expect(response.body.data.user.password).toBeUndefined(); // Password should not be returned
      });

      it('should fail to create user with duplicate email', async () => {
        const userData = {
          email: 'admin@test.com', // Already exists
          firstName: 'Duplicate',
          lastName: 'User',
          password: 'Password123!',
          organizationId: organizationId,
        };

        const response = await request(app)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .send(userData)
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('User with this email already exists');
      });

      it('should validate password strength', async () => {
        const userData = {
          email: 'weakpassword@test.com',
          firstName: 'Weak',
          lastName: 'Password',
          password: 'weak', // Weak password
          organizationId: organizationId,
        };

        const response = await request(app)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .send(userData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Password must be at least');
      });

      it('should require authentication', async () => {
        const userData = {
          email: 'unauthorized@test.com',
          firstName: 'Unauthorized',
          lastName: 'User',
          password: 'Password123!',
          organizationId: organizationId,
        };

        const response = await request(app)
          .post('/api/v1/users')
          .send(userData)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('GET /api/v1/users', () => {
      it('should list users with pagination', async () => {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            organizationId: organizationId,
            page: 1,
            limit: 10,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.users).toBeInstanceOf(Array);
        expect(response.body.data.pagination).toMatchObject({
          page: 1,
          limit: 10,
          total: expect.any(Number),
          totalPages: expect.any(Number),
        });
      });

      it('should filter users by role', async () => {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            organizationId: organizationId,
            role: 'admin',
            page: 1,
            limit: 10,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        // All returned users should have admin role
        response.body.data.users.forEach((user: any) => {
          expect(user.roles).toContain('admin');
        });
      });

      it('should search users by name or email', async () => {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            organizationId: organizationId,
            search: 'admin',
            page: 1,
            limit: 10,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        // Results should contain the search term
        response.body.data.users.forEach((user: any) => {
          const searchableText = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
          expect(searchableText).toContain('admin');
        });
      });
    });

    describe('GET /api/v1/users/:id', () => {
      it('should get user by ID', async () => {
        const response = await request(app)
          .get(`/api/v1/users/${userId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toBeDefined();
        expect(response.body.data.user.id).toBe(userId);
        expect(response.body.data.user.password).toBeUndefined();
      });

      it('should return 404 for non-existent user', async () => {
        const response = await request(app)
          .get('/api/v1/users/non-existent-user')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('PUT /api/v1/users/:id', () => {
      it('should update user successfully', async () => {
        const updateData = {
          firstName: 'Updated',
          lastName: 'Name',
          timezone: 'America/New_York',
        };

        const response = await request(app)
          .put(`/api/v1/users/${userId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.firstName).toBe(updateData.firstName);
        expect(response.body.data.user.lastName).toBe(updateData.lastName);
        expect(response.body.data.user.timezone).toBe(updateData.timezone);
      });

      it('should not allow updating email to existing email', async () => {
        const updateData = {
          email: 'admin@test.com', // Already exists
        };

        const response = await request(app)
          .put(`/api/v1/users/${userId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Email already in use');
      });
    });

    describe('DELETE /api/v1/users/:id', () => {
      it('should deactivate user successfully', async () => {
        const response = await request(app)
          .delete(`/api/v1/users/${userId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('User deactivated successfully');
      });

      it('should not allow deleting own account', async () => {
        const response = await request(app)
          .delete(`/api/v1/users/${userId}`) // Same as authenticated user
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Cannot delete own account');
      });
    });
  });

  describe('Organization Management Endpoints', () => {
    describe('POST /api/v1/organizations', () => {
      it('should create organization successfully', async () => {
        const orgData = {
          name: 'Test Organization',
          description: 'A test organization',
          industry: 'Technology',
          size: 'small',
          adminUser: {
            email: 'orgadmin@test.com',
            firstName: 'Org',
            lastName: 'Admin',
            password: 'OrgPassword123!',
          },
        };

        const response = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(orgData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.organization).toBeDefined();
        expect(response.body.data.organization.name).toBe(orgData.name);
        expect(response.body.data.organization.slug).toBeDefined();
        expect(response.body.data.adminUser).toBeDefined();
      });

      it('should validate organization data', async () => {
        const invalidOrgData = {
          name: '', // Empty name
          size: 'invalid-size',
          adminUser: {
            email: 'invalid-email',
            firstName: '',
            lastName: '',
            password: '123', // Weak password
          },
        };

        const response = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidOrgData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/v1/organizations', () => {
      it('should list organizations with pagination', async () => {
        const response = await request(app)
          .get('/api/v1/organizations')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: 1,
            limit: 10,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.organizations).toBeInstanceOf(Array);
        expect(response.body.data.pagination).toBeDefined();
      });

      it('should filter organizations by status', async () => {
        const response = await request(app)
          .get('/api/v1/organizations')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            status: 'active',
            page: 1,
            limit: 10,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        response.body.data.organizations.forEach((org: any) => {
          expect(org.status).toBe('active');
        });
      });
    });

    describe('GET /api/v1/organizations/:id', () => {
      it('should get organization by ID', async () => {
        const response = await request(app)
          .get(`/api/v1/organizations/${organizationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.organization).toBeDefined();
        expect(response.body.data.organization.id).toBe(organizationId);
      });
    });

    describe('PUT /api/v1/organizations/:id', () => {
      it('should update organization successfully', async () => {
        const updateData = {
          description: 'Updated description',
          website: 'https://updated.example.com',
        };

        const response = await request(app)
          .put(`/api/v1/organizations/${organizationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.organization.description).toBe(updateData.description);
        expect(response.body.data.organization.website).toBe(updateData.website);
      });
    });

    describe('GET /api/v1/organizations/:id/usage', () => {
      it('should get organization usage statistics', async () => {
        const response = await request(app)
          .get(`/api/v1/organizations/${organizationId}/usage`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.usage).toMatchObject({
          users: { current: expect.any(Number), limit: expect.any(Number) },
          integrations: { current: expect.any(Number), limit: expect.any(Number) },
          messages: { currentMonth: expect.any(Number), limit: expect.any(Number) },
          notifications: { currentMonth: expect.any(Number), limit: expect.any(Number) },
          storage: { currentGB: expect.any(Number), limitGB: expect.any(Number) },
          apiCalls: { currentHour: expect.any(Number), limit: expect.any(Number) },
        });
      });
    });
  });

  describe('Analytics Endpoints', () => {
    describe('GET /api/v1/analytics/reports', () => {
      it('should generate analytics report', async () => {
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        const endDate = new Date();

        const response = await request(app)
          .get('/api/v1/analytics/reports')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            organizationId: organizationId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            granularity: 'day',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.report).toBeDefined();
        expect(response.body.data.report.metrics).toMatchObject({
          messages: expect.any(Object),
          notifications: expect.any(Object),
          users: expect.any(Object),
          performance: expect.any(Object),
          costs: expect.any(Object),
          satisfaction: expect.any(Object),
        });
      });
    });

    describe('POST /api/v1/analytics/dashboards', () => {
      it('should create custom dashboard', async () => {
        const dashboardData = {
          name: 'Test Dashboard',
          description: 'A test dashboard',
          organizationId: organizationId,
          isPublic: false,
          widgets: [
            {
              type: 'metric',
              title: 'Total Messages',
              position: { x: 0, y: 0, width: 4, height: 2 },
              config: {
                metricName: 'messages.total',
                timeRange: '7d',
              },
              refreshInterval: 300,
            },
          ],
          layout: {
            columns: 12,
            rows: 8,
          },
        };

        const response = await request(app)
          .post('/api/v1/analytics/dashboards')
          .set('Authorization', `Bearer ${authToken}`)
          .send(dashboardData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.dashboard).toBeDefined();
        expect(response.body.data.dashboard.name).toBe(dashboardData.name);
        expect(response.body.data.dashboard.widgets).toHaveLength(1);
      });
    });
  });

  describe('Health and Monitoring Endpoints', () => {
    describe('GET /api/v1/health', () => {
      it('should return system health status', async () => {
        const response = await request(app)
          .get('/api/v1/health')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.health).toMatchObject({
          overall: expect.stringMatching(/^(healthy|unhealthy|degraded)$/),
          services: expect.any(Array),
          infrastructure: expect.any(Object),
          metrics: expect.any(Object),
          timestamp: expect.any(String),
        });
      });
    });

    describe('GET /api/v1/health/alerts', () => {
      it('should return active alerts', async () => {
        const response = await request(app)
          .get('/api/v1/health/alerts')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.alerts).toBeInstanceOf(Array);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_JSON');
    });

    it('should handle rate limiting', async () => {
      // Send multiple requests rapidly
      const requests = Array(105).fill(null).map(() =>
        request(app)
          .get('/api/v1/health')
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should return proper error format for all errors', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent-endpoint')
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
  });
});
