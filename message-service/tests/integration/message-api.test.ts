/**
 * Integration Tests for Message API
 */

import request from 'supertest';
import messageService from '../../src/index';

const app = messageService.getApp();

describe('Message API Integration Tests', () => {
  describe('POST /api/v1/messages', () => {
    it('should create a new message successfully', async () => {
      const messageData = {
        conversationId: '123e4567-e89b-12d3-a456-426614174000',
        direction: 'inbound',
        content: {
          text: 'Hello, I need help with my order',
          format: 'text',
        },
        sender: {
          email: 'customer@example.com',
          name: 'John Doe',
          type: 'customer',
        },
        metadata: {
          source: 'email',
        },
      };

      const response = await request(app)
        .post('/api/v1/messages')
        .set('x-organization-id', 'test-org')
        .set('x-integration-id', 'test-integration')
        .send(messageData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messageId).toBeDefined();
      expect(response.body.data.status).toBe('queued');
      expect(response.body.data.processingTime).toBeGreaterThan(0);
    });

    it('should validate required fields', async () => {
      const invalidMessageData = {
        direction: 'inbound',
        content: {
          text: '', // Empty text should fail validation
          format: 'text',
        },
        sender: {
          type: 'customer',
        },
      };

      const response = await request(app)
        .post('/api/v1/messages')
        .set('x-organization-id', 'test-org')
        .set('x-integration-id', 'test-integration')
        .send(invalidMessageData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ValidationError');
    });

    it('should validate email format', async () => {
      const messageData = {
        conversationId: '123e4567-e89b-12d3-a456-426614174000',
        direction: 'inbound',
        content: {
          text: 'Test message',
          format: 'text',
        },
        sender: {
          email: 'invalid-email', // Invalid email format
          type: 'customer',
        },
      };

      const response = await request(app)
        .post('/api/v1/messages')
        .set('x-organization-id', 'test-org')
        .set('x-integration-id', 'test-integration')
        .send(messageData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('validation failed');
    });

    it('should handle rate limiting', async () => {
      const messageData = {
        conversationId: '123e4567-e89b-12d3-a456-426614174000',
        direction: 'inbound',
        content: {
          text: 'Rate limit test message',
          format: 'text',
        },
        sender: {
          email: 'test@example.com',
          type: 'customer',
        },
      };

      // Send multiple requests rapidly to trigger rate limiting
      const requests = Array(105).fill(null).map(() =>
        request(app)
          .post('/api/v1/messages')
          .set('x-organization-id', 'test-org')
          .set('x-integration-id', 'test-integration')
          .send(messageData)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      // Rate limited responses should have proper error structure
      if (rateLimitedResponses.length > 0) {
        const rateLimitedResponse = rateLimitedResponses[0];
        expect(rateLimitedResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(rateLimitedResponse.headers['x-ratelimit-limit']).toBeDefined();
        expect(rateLimitedResponse.headers['x-ratelimit-remaining']).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/messages', () => {
    it('should list messages with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/messages')
        .query({
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toBeInstanceOf(Array);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('should filter messages by conversation ID', async () => {
      const conversationId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .get('/api/v1/messages')
        .query({
          conversationId,
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toBeInstanceOf(Array);
      
      // All returned messages should belong to the specified conversation
      response.body.data.messages.forEach((message: any) => {
        expect(message.conversationId).toBe(conversationId);
      });
    });

    it('should filter messages by direction', async () => {
      const response = await request(app)
        .get('/api/v1/messages')
        .query({
          direction: 'inbound',
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // All returned messages should have inbound direction
      response.body.data.messages.forEach((message: any) => {
        expect(message.direction).toBe('inbound');
      });
    });

    it('should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/messages')
        .query({
          page: 0, // Invalid page number
          limit: 10,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('validation failed');
    });
  });

  describe('GET /api/v1/messages/:id', () => {
    it('should retrieve a specific message', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .get(`/api/v1/messages/${messageId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBeDefined();
      expect(response.body.data.message.id).toBe(messageId);
    });

    it('should return 404 for non-existent message', async () => {
      const nonExistentId = '999e4567-e89b-12d3-a456-426614174999';
      
      const response = await request(app)
        .get(`/api/v1/messages/${nonExistentId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NotFoundError');
    });

    it('should validate UUID format', async () => {
      const invalidId = 'invalid-uuid';
      
      const response = await request(app)
        .get(`/api/v1/messages/${invalidId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('validation failed');
    });
  });

  describe('PUT /api/v1/messages/:id', () => {
    it('should update message status', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174000';
      const updateData = {
        status: 'read',
        metadata: {
          readBy: 'agent-123',
          readAt: new Date().toISOString(),
        },
      };

      const response = await request(app)
        .put(`/api/v1/messages/${messageId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message.status).toBe('read');
      expect(response.body.data.message.metadata.readBy).toBe('agent-123');
    });

    it('should validate status values', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174000';
      const updateData = {
        status: 'invalid-status',
      };

      const response = await request(app)
        .put(`/api/v1/messages/${messageId}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('validation failed');
    });
  });

  describe('DELETE /api/v1/messages/:id', () => {
    it('should delete a message', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .delete(`/api/v1/messages/${messageId}`)
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('should return 404 when deleting non-existent message', async () => {
      const nonExistentId = '999e4567-e89b-12d3-a456-426614174999';
      
      const response = await request(app)
        .delete(`/api/v1/messages/${nonExistentId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NotFoundError');
    });
  });

  describe('POST /api/v1/messages/:id/process', () => {
    it('should process message with AI', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .post(`/api/v1/messages/${messageId}/process`)
        .send({
          forceReprocess: false,
          skipAi: false,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBeDefined();
      expect(response.body.data.processingTime).toBeGreaterThan(0);
    });

    it('should handle force reprocess', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .post(`/api/v1/messages/${messageId}/process`)
        .send({
          forceReprocess: true,
          skipAi: false,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message.status).toBe('processed');
    });

    it('should respect rate limiting for AI processing', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174000';
      
      // Send multiple AI processing requests rapidly
      const requests = Array(25).fill(null).map(() =>
        request(app)
          .post(`/api/v1/messages/${messageId}/process`)
          .set('x-organization-id', 'test-org')
          .send({ forceReprocess: true })
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/messages/search', () => {
    it('should search messages by text content', async () => {
      const searchData = {
        query: 'help with order',
        filters: {},
        page: 1,
        limit: 10,
      };

      const response = await request(app)
        .post('/api/v1/messages/search')
        .set('x-organization-id', 'test-org')
        .send(searchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toBeInstanceOf(Array);
      expect(response.body.data.searchTime).toBeGreaterThan(0);
      expect(response.body.data.query).toBe('help with order');
    });

    it('should apply search filters', async () => {
      const searchData = {
        query: 'test',
        filters: {
          direction: 'inbound',
          status: 'processed',
        },
        page: 1,
        limit: 10,
      };

      const response = await request(app)
        .post('/api/v1/messages/search')
        .set('x-organization-id', 'test-org')
        .send(searchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // All returned messages should match the filters
      response.body.data.messages.forEach((message: any) => {
        expect(message.direction).toBe('inbound');
        expect(message.status).toBe('processed');
      });
    });

    it('should validate search query', async () => {
      const searchData = {
        query: '', // Empty query should fail
        page: 1,
        limit: 10,
      };

      const response = await request(app)
        .post('/api/v1/messages/search')
        .send(searchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('validation failed');
    });

    it('should respect search rate limiting', async () => {
      const searchData = {
        query: 'rate limit test',
        page: 1,
        limit: 10,
      };

      // Send multiple search requests rapidly
      const requests = Array(55).fill(null).map(() =>
        request(app)
          .post('/api/v1/messages/search')
          .set('x-organization-id', 'test-org')
          .send(searchData)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/messages')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle missing headers', async () => {
      const messageData = {
        conversationId: '123e4567-e89b-12d3-a456-426614174000',
        direction: 'inbound',
        content: {
          text: 'Test message',
          format: 'text',
        },
        sender: {
          type: 'customer',
        },
      };

      const response = await request(app)
        .post('/api/v1/messages')
        // Missing x-organization-id and x-integration-id headers
        .send(messageData)
        .expect(201); // Should still work with defaults

      expect(response.body.success).toBe(true);
    });

    it('should return proper error format', async () => {
      const response = await request(app)
        .get('/api/v1/messages/invalid-uuid')
        .expect(400);

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
