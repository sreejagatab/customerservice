import { describe, test, expect, beforeEach } from '@jest/globals';

describe('Authentication Integration Tests', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    // Create a fresh test user for each test
    const userData = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      organizationName: 'Test Organization',
    };

    const result = await global.testServices.createTestUser(userData);
    testUser = result.user;
    authToken = result.token;
  });

  describe('User Registration', () => {
    test('should register a new user successfully', async () => {
      const userData = {
        email: `new-user-${Date.now()}@example.com`,
        password: 'NewPassword123!',
        firstName: 'New',
        lastName: 'User',
        organizationName: 'New Organization',
      };

      const response = await global.testServices.makeRequest(
        'POST',
        '/api/v1/auth/register',
        userData
      );

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.user).toMatchObject({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: 'admin', // First user in organization becomes admin
        status: 'active',
      });
      expect(response.data.data.tokens).toHaveProperty('accessToken');
      expect(response.data.data.tokens).toHaveProperty('refreshToken');
    });

    test('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Test Org',
      };

      const response = await global.testServices.makeRequest(
        'POST',
        '/api/v1/auth/register',
        userData
      );

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject registration with weak password', async () => {
      const userData = {
        email: `weak-pass-${Date.now()}@example.com`,
        password: '123',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Test Org',
      };

      const response = await global.testServices.makeRequest(
        'POST',
        '/api/v1/auth/register',
        userData
      );

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject duplicate email registration', async () => {
      const userData = {
        email: testUser.email,
        password: 'Password123!',
        firstName: 'Duplicate',
        lastName: 'User',
        organizationName: 'Duplicate Org',
      };

      const response = await global.testServices.makeRequest(
        'POST',
        '/api/v1/auth/register',
        userData
      );

      expect(response.status).toBe(409);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('ALREADY_EXISTS');
    });
  });

  describe('User Login', () => {
    test('should login with valid credentials', async () => {
      const response = await global.testServices.makeRequest(
        'POST',
        '/api/v1/auth/login',
        {
          email: testUser.email,
          password: 'TestPassword123!',
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.user).toMatchObject({
        id: testUser.id,
        email: testUser.email,
      });
      expect(response.data.data.tokens).toHaveProperty('accessToken');
      expect(response.data.data.tokens).toHaveProperty('refreshToken');
    });

    test('should reject login with invalid email', async () => {
      const response = await global.testServices.makeRequest(
        'POST',
        '/api/v1/auth/login',
        {
          email: 'nonexistent@example.com',
          password: 'TestPassword123!',
        }
      );

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('should reject login with invalid password', async () => {
      const response = await global.testServices.makeRequest(
        'POST',
        '/api/v1/auth/login',
        {
          email: testUser.email,
          password: 'WrongPassword123!',
        }
      );

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Token Management', () => {
    test('should access protected route with valid token', async () => {
      const response = await global.testServices.makeAuthenticatedRequest(
        'GET',
        '/api/v1/auth/profile',
        authToken
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.user).toMatchObject({
        id: testUser.id,
        email: testUser.email,
      });
    });

    test('should reject access with invalid token', async () => {
      const response = await global.testServices.makeAuthenticatedRequest(
        'GET',
        '/api/v1/auth/profile',
        'invalid-token'
      );

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('INVALID_TOKEN');
    });

    test('should reject access without token', async () => {
      const response = await global.testServices.makeRequest(
        'GET',
        '/api/v1/auth/profile'
      );

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('User Logout', () => {
    test('should logout successfully', async () => {
      const response = await global.testServices.makeAuthenticatedRequest(
        'POST',
        '/api/v1/auth/logout',
        authToken
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    test('should reject access with logged out token', async () => {
      // First logout
      await global.testServices.makeAuthenticatedRequest(
        'POST',
        '/api/v1/auth/logout',
        authToken
      );

      // Then try to access protected route
      const response = await global.testServices.makeAuthenticatedRequest(
        'GET',
        '/api/v1/auth/profile',
        authToken
      );

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
    });
  });
});
