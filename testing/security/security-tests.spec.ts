/**
 * Security Tests
 * Tests for authentication, authorization, input validation, and security vulnerabilities
 */

import { test, expect } from '@playwright/test';
import axios from 'axios';
import jwt from 'jsonwebtoken';

const API_BASE_URL = process.env.SECURITY_TEST_API_URL || 'http://localhost:8000';

test.describe('Authentication Security Tests', () => {
  test('Should reject requests without authentication', async () => {
    const response = await axios.get(`${API_BASE_URL}/api/v1/messages`, {
      validateStatus: () => true, // Don't throw on 4xx/5xx
    });

    expect(response.status).toBe(401);
    expect(response.data.error).toContain('authentication');
  });

  test('Should reject invalid JWT tokens', async () => {
    const invalidTokens = [
      'invalid.jwt.token',
      'Bearer invalid-token',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
      '', // Empty token
      'Bearer ', // Bearer without token
    ];

    for (const token of invalidTokens) {
      const response = await axios.get(`${API_BASE_URL}/api/v1/messages`, {
        headers: { Authorization: token },
        validateStatus: () => true,
      });

      expect(response.status).toBe(401);
    }
  });

  test('Should reject expired JWT tokens', async () => {
    // Create an expired token
    const expiredToken = jwt.sign(
      { 
        userId: 'test-user',
        organizationId: 'test-org',
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      },
      'test-secret'
    );

    const response = await axios.get(`${API_BASE_URL}/api/v1/messages`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
      validateStatus: () => true,
    });

    expect(response.status).toBe(401);
    expect(response.data.error).toContain('expired');
  });

  test('Should enforce rate limiting', async () => {
    const requests = Array.from({ length: 100 }, () =>
      axios.post(`${API_BASE_URL}/api/v1/auth/login`, {
        email: 'test@example.com',
        password: 'wrong-password',
      }, {
        validateStatus: () => true,
      })
    );

    const responses = await Promise.all(requests);
    const rateLimitedResponses = responses.filter(r => r.status === 429);

    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  });

  test('Should prevent brute force attacks', async () => {
    const bruteForceAttempts = Array.from({ length: 10 }, () =>
      axios.post(`${API_BASE_URL}/api/v1/auth/login`, {
        email: 'admin@example.com',
        password: `wrong-password-${Math.random()}`,
      }, {
        validateStatus: () => true,
      })
    );

    const responses = await Promise.all(bruteForceAttempts);
    
    // After multiple failed attempts, account should be locked
    const lastResponse = responses[responses.length - 1];
    expect([423, 429]).toContain(lastResponse.status); // Locked or rate limited
  });
});

test.describe('Authorization Security Tests', () => {
  test('Should enforce organization isolation', async () => {
    // Create tokens for different organizations
    const org1Token = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'admin' },
      'test-secret'
    );
    
    const org2Token = jwt.sign(
      { userId: 'user2', organizationId: 'org2', role: 'admin' },
      'test-secret'
    );

    // Try to access org1 data with org2 token
    const response = await axios.get(`${API_BASE_URL}/api/v1/messages?organizationId=org1`, {
      headers: { Authorization: `Bearer ${org2Token}` },
      validateStatus: () => true,
    });

    expect(response.status).toBe(403);
    expect(response.data.error).toContain('access denied');
  });

  test('Should enforce role-based access control', async () => {
    const userToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    // Try to access admin-only endpoint with user token
    const response = await axios.get(`${API_BASE_URL}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${userToken}` },
      validateStatus: () => true,
    });

    expect(response.status).toBe(403);
    expect(response.data.error).toContain('insufficient privileges');
  });

  test('Should prevent privilege escalation', async () => {
    const userToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    // Try to modify user role
    const response = await axios.patch(`${API_BASE_URL}/api/v1/users/user1`, {
      role: 'admin',
    }, {
      headers: { Authorization: `Bearer ${userToken}` },
      validateStatus: () => true,
    });

    expect(response.status).toBe(403);
  });
});

test.describe('Input Validation Security Tests', () => {
  test('Should prevent SQL injection attacks', async () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE messages; --",
      "' OR '1'='1",
      "'; INSERT INTO users (email, role) VALUES ('hacker@evil.com', 'admin'); --",
      "' UNION SELECT * FROM users --",
    ];

    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    for (const payload of sqlInjectionPayloads) {
      const response = await axios.get(`${API_BASE_URL}/api/v1/messages`, {
        params: { search: payload },
        headers: { Authorization: `Bearer ${validToken}` },
        validateStatus: () => true,
      });

      // Should either reject the input or sanitize it safely
      expect([400, 422]).toContain(response.status);
    }
  });

  test('Should prevent XSS attacks', async () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      'javascript:alert("XSS")',
      '<svg onload="alert(1)">',
      '"><script>alert("XSS")</script>',
    ];

    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    for (const payload of xssPayloads) {
      const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, {
        organizationId: 'org1',
        conversationId: 'test-conv',
        content: payload,
        type: 'text',
        direction: 'inbound',
        channel: 'api',
      }, {
        headers: { Authorization: `Bearer ${validToken}` },
        validateStatus: () => true,
      });

      if (response.status === 201) {
        // If message was created, verify content is sanitized
        const messageId = response.data.data.id;
        const getMessage = await axios.get(`${API_BASE_URL}/api/v1/messages/${messageId}`, {
          headers: { Authorization: `Bearer ${validToken}` },
        });

        const content = getMessage.data.data.content;
        expect(content).not.toContain('<script>');
        expect(content).not.toContain('javascript:');
        expect(content).not.toContain('onerror=');
      }
    }
  });

  test('Should validate file uploads', async () => {
    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    // Test malicious file types
    const maliciousFiles = [
      { name: 'malware.exe', content: 'MZ\x90\x00', type: 'application/x-executable' },
      { name: 'script.php', content: '<?php system($_GET["cmd"]); ?>', type: 'application/x-php' },
      { name: 'payload.js', content: 'eval(atob("YWxlcnQoIlhTUyIp"))', type: 'application/javascript' },
    ];

    for (const file of maliciousFiles) {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', Buffer.from(file.content), {
        filename: file.name,
        contentType: file.type,
      });

      const response = await axios.post(`${API_BASE_URL}/api/v1/files/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${validToken}`,
        },
        validateStatus: () => true,
      });

      expect(response.status).toBe(400); // Should reject malicious files
    }
  });

  test('Should prevent command injection', async () => {
    const commandInjectionPayloads = [
      '; ls -la',
      '| cat /etc/passwd',
      '&& rm -rf /',
      '`whoami`',
      '$(id)',
    ];

    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'admin' },
      'test-secret'
    );

    for (const payload of commandInjectionPayloads) {
      const response = await axios.post(`${API_BASE_URL}/api/v1/admin/export`, {
        format: 'csv',
        filename: `export${payload}.csv`,
      }, {
        headers: { Authorization: `Bearer ${validToken}` },
        validateStatus: () => true,
      });

      expect([400, 422]).toContain(response.status);
    }
  });
});

test.describe('Data Protection Security Tests', () => {
  test('Should encrypt sensitive data', async () => {
    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    // Create message with sensitive data
    const sensitiveData = {
      organizationId: 'org1',
      conversationId: 'test-conv',
      content: 'My credit card number is 4532-1234-5678-9012',
      type: 'text',
      direction: 'inbound',
      channel: 'api',
    };

    const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, sensitiveData, {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(response.status).toBe(201);

    // Verify sensitive data is masked/encrypted in storage
    const messageId = response.data.data.id;
    const storedMessage = await axios.get(`${API_BASE_URL}/api/v1/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    const content = storedMessage.data.data.content;
    expect(content).not.toContain('4532-1234-5678-9012'); // Should be masked
    expect(content).toContain('****'); // Should show masked version
  });

  test('Should prevent data leakage in error messages', async () => {
    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    // Try to access non-existent resource
    const response = await axios.get(`${API_BASE_URL}/api/v1/messages/non-existent-id`, {
      headers: { Authorization: `Bearer ${validToken}` },
      validateStatus: () => true,
    });

    expect(response.status).toBe(404);
    
    // Error message should not reveal internal details
    const errorMessage = response.data.error.toLowerCase();
    expect(errorMessage).not.toContain('database');
    expect(errorMessage).not.toContain('sql');
    expect(errorMessage).not.toContain('table');
    expect(errorMessage).not.toContain('column');
  });

  test('Should implement proper session management', async () => {
    // Test session fixation
    const response1 = await axios.post(`${API_BASE_URL}/api/v1/auth/login`, {
      email: 'test@example.com',
      password: 'correct-password',
    });

    const sessionToken1 = response1.data.token;

    // Login again - should get new session token
    const response2 = await axios.post(`${API_BASE_URL}/api/v1/auth/login`, {
      email: 'test@example.com',
      password: 'correct-password',
    });

    const sessionToken2 = response2.data.token;
    expect(sessionToken1).not.toBe(sessionToken2);

    // Test session timeout
    const expiredToken = jwt.sign(
      { 
        userId: 'user1',
        organizationId: 'org1',
        iat: Math.floor(Date.now() / 1000) - 86400, // Issued 24 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600   // Expired 1 hour ago
      },
      'test-secret'
    );

    const expiredResponse = await axios.get(`${API_BASE_URL}/api/v1/messages`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
      validateStatus: () => true,
    });

    expect(expiredResponse.status).toBe(401);
  });
});

test.describe('API Security Tests', () => {
  test('Should implement proper CORS headers', async () => {
    const response = await axios.options(`${API_BASE_URL}/api/v1/messages`, {
      headers: {
        'Origin': 'https://malicious-site.com',
        'Access-Control-Request-Method': 'GET',
      },
      validateStatus: () => true,
    });

    // Should not allow arbitrary origins
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers['access-control-allow-origin']).not.toBe('https://malicious-site.com');
  });

  test('Should implement security headers', async () => {
    const response = await axios.get(`${API_BASE_URL}/api/v1/health`);

    // Check for security headers
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });

  test('Should prevent information disclosure', async () => {
    // Test server header
    const response = await axios.get(`${API_BASE_URL}/api/v1/health`);
    
    // Should not reveal server technology details
    expect(response.headers['server']).not.toContain('Express');
    expect(response.headers['server']).not.toContain('Node.js');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  test('Should validate content types', async () => {
    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    // Try to send XML when expecting JSON
    const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, 
      '<?xml version="1.0"?><message>test</message>', {
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/xml',
      },
      validateStatus: () => true,
    });

    expect(response.status).toBe(415); // Unsupported Media Type
  });
});

test.describe('Infrastructure Security Tests', () => {
  test('Should not expose sensitive endpoints', async () => {
    const sensitiveEndpoints = [
      '/admin',
      '/debug',
      '/metrics',
      '/health/detailed',
      '/api/internal',
      '/.env',
      '/config',
      '/logs',
    ];

    for (const endpoint of sensitiveEndpoints) {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
        validateStatus: () => true,
      });

      // Should either be not found or require authentication
      expect([401, 403, 404]).toContain(response.status);
    }
  });

  test('Should implement request size limits', async () => {
    const validToken = jwt.sign(
      { userId: 'user1', organizationId: 'org1', role: 'user' },
      'test-secret'
    );

    // Try to send very large payload
    const largePayload = 'x'.repeat(10 * 1024 * 1024); // 10MB

    const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, {
      organizationId: 'org1',
      conversationId: 'test-conv',
      content: largePayload,
      type: 'text',
      direction: 'inbound',
      channel: 'api',
    }, {
      headers: { Authorization: `Bearer ${validToken}` },
      validateStatus: () => true,
    });

    expect(response.status).toBe(413); // Payload Too Large
  });
});
