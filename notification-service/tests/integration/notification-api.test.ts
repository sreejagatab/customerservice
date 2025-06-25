/**
 * Integration Tests for Notification API
 */

import request from 'supertest';
import { NotificationService } from '../../src/index';

const app = new NotificationService().getApp();

describe('Notification API Integration Tests', () => {
  describe('POST /api/v1/notifications', () => {
    it('should create and queue email notification successfully', async () => {
      const notificationData = {
        type: 'email',
        recipientId: 'user-123',
        organizationId: 'org-456',
        data: {
          to: 'test@example.com',
          subject: 'Test Email Notification',
          content: 'This is a test email notification',
          priority: 'normal',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications')
        .send(notificationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notificationId).toBeDefined();
      expect(response.body.data.status).toBe('queued');
      expect(response.body.data.queuedAt).toBeDefined();
    });

    it('should create and queue SMS notification successfully', async () => {
      const notificationData = {
        type: 'sms',
        recipientId: 'user-123',
        organizationId: 'org-456',
        data: {
          to: '+1234567890',
          content: 'This is a test SMS notification',
          priority: 'high',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications')
        .send(notificationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notificationId).toBeDefined();
      expect(response.body.data.status).toBe('queued');
    });

    it('should create and queue push notification successfully', async () => {
      const notificationData = {
        type: 'push',
        recipientId: 'user-123',
        organizationId: 'org-456',
        data: {
          to: ['device-token-1', 'device-token-2'],
          subject: 'Test Push Notification',
          content: 'This is a test push notification',
          priority: 'urgent',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications')
        .send(notificationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notificationId).toBeDefined();
      expect(response.body.data.status).toBe('queued');
    });

    it('should validate required fields', async () => {
      const invalidNotificationData = {
        type: 'email',
        // Missing recipientId and organizationId
        data: {
          to: 'test@example.com',
          content: 'Test content',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications')
        .send(invalidNotificationData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('recipientId is required');
      expect(response.body.error.details).toContain('organizationId is required');
    });

    it('should validate email format for email notifications', async () => {
      const notificationData = {
        type: 'email',
        recipientId: 'user-123',
        organizationId: 'org-456',
        data: {
          to: 'invalid-email',
          subject: 'Test Subject',
          content: 'Test content',
          priority: 'normal',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications')
        .send(notificationData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid email format');
    });

    it('should validate phone number format for SMS notifications', async () => {
      const notificationData = {
        type: 'sms',
        recipientId: 'user-123',
        organizationId: 'org-456',
        data: {
          to: 'invalid-phone',
          content: 'Test SMS',
          priority: 'normal',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications')
        .send(notificationData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid phone number format');
    });

    it('should handle scheduled notifications', async () => {
      const scheduledTime = new Date(Date.now() + 60000); // 1 minute from now
      
      const notificationData = {
        type: 'email',
        recipientId: 'user-123',
        organizationId: 'org-456',
        data: {
          to: 'test@example.com',
          subject: 'Scheduled Email',
          content: 'This is a scheduled email',
          priority: 'normal',
        },
        scheduledAt: scheduledTime.toISOString(),
      };

      const response = await request(app)
        .post('/api/v1/notifications')
        .send(notificationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('scheduled');
      expect(response.body.data.scheduledAt).toBe(scheduledTime.toISOString());
    });

    it('should respect rate limiting', async () => {
      const notificationData = {
        type: 'email',
        recipientId: 'user-123',
        organizationId: 'org-456',
        data: {
          to: 'test@example.com',
          subject: 'Rate Limit Test',
          content: 'Testing rate limits',
          priority: 'normal',
        },
      };

      // Send multiple requests rapidly
      const requests = Array(105).fill(null).map(() =>
        request(app)
          .post('/api/v1/notifications')
          .send(notificationData)
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

  describe('GET /api/v1/notifications', () => {
    it('should list notifications with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({
          organizationId: 'org-456',
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notifications).toBeInstanceOf(Array);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('should filter notifications by type', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({
          organizationId: 'org-456',
          type: 'email',
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // All returned notifications should be email type
      response.body.data.notifications.forEach((notification: any) => {
        expect(notification.type).toBe('email');
      });
    });

    it('should filter notifications by status', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({
          organizationId: 'org-456',
          status: 'delivered',
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // All returned notifications should have delivered status
      response.body.data.notifications.forEach((notification: any) => {
        expect(notification.status).toBe('delivered');
      });
    });

    it('should require organizationId parameter', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({
          page: 1,
          limit: 10,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('organizationId is required');
    });
  });

  describe('GET /api/v1/notifications/:id', () => {
    it('should retrieve a specific notification', async () => {
      const notificationId = 'notification-123';
      
      const response = await request(app)
        .get(`/api/v1/notifications/${notificationId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notification).toBeDefined();
      expect(response.body.data.notification.id).toBe(notificationId);
    });

    it('should return 404 for non-existent notification', async () => {
      const nonExistentId = 'non-existent-notification';
      
      const response = await request(app)
        .get(`/api/v1/notifications/${nonExistentId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/v1/notifications/:id/cancel', () => {
    it('should cancel a scheduled notification', async () => {
      const notificationId = 'scheduled-notification-123';
      
      const response = await request(app)
        .put(`/api/v1/notifications/${notificationId}/cancel`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notification.status).toBe('cancelled');
      expect(response.body.data.notification.cancelledAt).toBeDefined();
    });

    it('should return 404 for non-existent notification', async () => {
      const nonExistentId = 'non-existent-notification';
      
      const response = await request(app)
        .put(`/api/v1/notifications/${nonExistentId}/cancel`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should not allow cancelling already sent notifications', async () => {
      const sentNotificationId = 'sent-notification-123';
      
      const response = await request(app)
        .put(`/api/v1/notifications/${sentNotificationId}/cancel`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Cannot cancel notification that has already been sent');
    });
  });

  describe('POST /api/v1/notifications/batch', () => {
    it('should create multiple notifications in batch', async () => {
      const batchData = {
        notifications: [
          {
            type: 'email',
            recipientId: 'user-1',
            organizationId: 'org-456',
            data: {
              to: 'user1@example.com',
              subject: 'Batch Email 1',
              content: 'First batch email',
              priority: 'normal',
            },
          },
          {
            type: 'sms',
            recipientId: 'user-2',
            organizationId: 'org-456',
            data: {
              to: '+1234567890',
              content: 'Batch SMS 1',
              priority: 'normal',
            },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/notifications/batch')
        .send(batchData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created).toBe(2);
      expect(response.body.data.failed).toBe(0);
      expect(response.body.data.notifications).toHaveLength(2);
      
      response.body.data.notifications.forEach((notification: any) => {
        expect(notification.id).toBeDefined();
        expect(notification.status).toBe('queued');
      });
    });

    it('should handle partial failures in batch creation', async () => {
      const batchData = {
        notifications: [
          {
            type: 'email',
            recipientId: 'user-1',
            organizationId: 'org-456',
            data: {
              to: 'user1@example.com',
              subject: 'Valid Email',
              content: 'Valid email content',
              priority: 'normal',
            },
          },
          {
            type: 'email',
            recipientId: 'user-2',
            organizationId: 'org-456',
            data: {
              to: 'invalid-email', // Invalid email
              subject: 'Invalid Email',
              content: 'Invalid email content',
              priority: 'normal',
            },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/notifications/batch')
        .send(batchData)
        .expect(207); // Multi-status

      expect(response.body.success).toBe(true);
      expect(response.body.data.created).toBe(1);
      expect(response.body.data.failed).toBe(1);
      expect(response.body.data.errors).toHaveLength(1);
      expect(response.body.data.errors[0].index).toBe(1);
      expect(response.body.data.errors[0].error).toContain('Invalid email format');
    });

    it('should validate batch size limits', async () => {
      const batchData = {
        notifications: Array(101).fill({
          type: 'email',
          recipientId: 'user-1',
          organizationId: 'org-456',
          data: {
            to: 'test@example.com',
            subject: 'Batch Test',
            content: 'Batch test content',
            priority: 'normal',
          },
        }),
      };

      const response = await request(app)
        .post('/api/v1/notifications/batch')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Batch size exceeds maximum limit');
    });
  });

  describe('GET /api/v1/notifications/analytics', () => {
    it('should return analytics data for organization', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const endDate = new Date();

      const response = await request(app)
        .get('/api/v1/notifications/analytics')
        .query({
          organizationId: 'org-456',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary).toMatchObject({
        totalSent: expect.any(Number),
        totalDelivered: expect.any(Number),
        totalFailed: expect.any(Number),
        deliveryRate: expect.any(Number),
        avgDeliveryTime: expect.any(Number),
        totalCost: expect.any(Number),
      });
      expect(response.body.data.byChannel).toBeDefined();
      expect(response.body.data.byDay).toBeInstanceOf(Array);
    });

    it('should filter analytics by channel', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const response = await request(app)
        .get('/api/v1/notifications/analytics')
        .query({
          organizationId: 'org-456',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          channels: 'email,sms',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Object.keys(response.body.data.byChannel)).toEqual(
        expect.arrayContaining(['email', 'sms'])
      );
    });

    it('should require organizationId for analytics', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/analytics')
        .query({
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('organizationId is required');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/notifications')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_JSON');
    });

    it('should handle internal server errors gracefully', async () => {
      // This would require mocking internal services to throw errors
      // For now, we'll test the error response format
      const response = await request(app)
        .get('/api/v1/notifications/trigger-error') // Hypothetical error endpoint
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });

    it('should return proper error format for all errors', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/non-existent-endpoint')
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
