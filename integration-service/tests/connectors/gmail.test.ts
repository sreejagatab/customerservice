/**
 * Gmail Connector Tests
 */

import { GmailConnector } from '../../src/connectors/gmail';

describe('GmailConnector', () => {
  let connector: GmailConnector;
  let mockCredentials: any;
  let mockConfig: any;

  beforeEach(() => {
    connector = new GmailConnector();
    
    mockCredentials = {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    };

    mockConfig = {
      autoSync: true,
      syncInterval: 300000,
      maxResults: 100,
      labelIds: ['INBOX'],
    };
  });

  afterEach(async () => {
    if (connector) {
      await connector.destroy();
    }
  });

  describe('Connector Properties', () => {
    test('should have correct connector properties', () => {
      expect(connector.id).toBe('gmail-connector');
      expect(connector.type).toBe('email');
      expect(connector.provider).toBe('gmail');
      expect(connector.name).toBe('Gmail/Google Workspace');
      expect(connector.version).toBe('1.0.0');
      expect(connector.supportedFeatures).toContain('read_messages');
      expect(connector.supportedFeatures).toContain('send_messages');
      expect(connector.supportedFeatures).toContain('webhooks');
    });
  });

  describe('Authentication', () => {
    test('should authenticate with valid credentials', async () => {
      const result = await connector.authenticate(mockCredentials);
      
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresAt');
    });

    test('should throw error with invalid credentials', async () => {
      const invalidCredentials = { accessToken: null };
      
      await expect(connector.authenticate(invalidCredentials))
        .rejects
        .toThrow('Access token is required for Gmail authentication');
    });

    test('should validate auth credentials', async () => {
      const isValid = await connector.validateAuth(mockCredentials);
      expect(isValid).toBe(true);
    });

    test('should refresh auth tokens', async () => {
      const refreshCredentials = {
        refreshToken: 'mock-refresh-token',
      };

      const result = await connector.refreshAuth(refreshCredentials);
      
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresAt');
    });
  });

  describe('Connection', () => {
    test('should initialize connector successfully', async () => {
      await connector.initialize(mockConfig, mockCredentials);
      
      expect(connector.isHealthy).toBe(true);
      expect(connector.status).toBe('connected');
    });

    test('should connect to Gmail service', async () => {
      await connector.initialize(mockConfig, mockCredentials);
      await connector.connect();
      
      expect(connector.status).toBe('connected');
    });

    test('should perform health check', async () => {
      await connector.initialize(mockConfig, mockCredentials);
      
      const isHealthy = await connector.healthCheck();
      expect(isHealthy).toBe(true);
    });

    test('should test connection', async () => {
      await connector.initialize(mockConfig, mockCredentials);
      
      const testResult = await connector.test();
      expect(testResult).toBe(true);
    });
  });

  describe('Message Operations', () => {
    beforeEach(async () => {
      await connector.initialize(mockConfig, mockCredentials);
    });

    test('should fetch messages', async () => {
      const messages = await connector.fetchMessages({
        limit: 10,
        labels: ['INBOX'],
      });

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(0);
      
      if (messages.length > 0) {
        const message = messages[0];
        expect(message).toHaveProperty('id');
        expect(message).toHaveProperty('from');
        expect(message).toHaveProperty('subject');
        expect(message).toHaveProperty('body');
        expect(message).toHaveProperty('date');
      }
    });

    test('should send message', async () => {
      const messageRequest = {
        to: [{ email: 'recipient@example.com', name: 'Test Recipient' }],
        subject: 'Test Subject',
        body: {
          text: 'Test message body',
          html: '<p>Test message body</p>',
        },
      };

      const result = await connector.sendMessage(messageRequest);
      
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('threadId');
    });

    test('should mark message as read', async () => {
      const messageId = 'test-message-id';
      
      await expect(connector.markAsRead(messageId)).resolves.not.toThrow();
    });

    test('should delete message', async () => {
      const messageId = 'test-message-id';
      
      await expect(connector.deleteMessage(messageId)).resolves.not.toThrow();
    });
  });

  describe('Webhook Operations', () => {
    beforeEach(async () => {
      await connector.initialize(mockConfig, mockCredentials);
    });

    test('should setup webhook', async () => {
      const webhookUrl = 'https://example.com/webhook';
      
      const result = await connector.setupWebhook(webhookUrl);
      
      expect(result).toHaveProperty('historyId');
      expect(result).toHaveProperty('expiration');
    });

    test('should process webhook payload', async () => {
      const webhookPayload = {
        message: {
          data: Buffer.from(JSON.stringify({ historyId: '12345' })).toString('base64'),
          messageId: 'test-message-id',
          publishTime: new Date().toISOString(),
        },
        subscription: 'test-subscription',
      };

      const result = await connector.processWebhook(webhookPayload);
      
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('historyId');
      expect(Array.isArray(result.messages)).toBe(true);
    });
  });

  describe('Sync Operations', () => {
    beforeEach(async () => {
      await connector.initialize(mockConfig, mockCredentials);
    });

    test('should sync messages', async () => {
      const lastSyncAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const result = await connector.sync(lastSyncAt);
      
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');
    });

    test('should sync without lastSyncAt', async () => {
      const result = await connector.sync();
      
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.messages)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle authentication errors gracefully', async () => {
      // Mock the OAuth2Client to throw an error for invalid credentials
      const mockOAuth2Client = (connector as any).oauth2Client;
      mockOAuth2Client.setCredentials.mockImplementationOnce(() => {
        throw new Error('Invalid credentials');
      });

      const invalidCredentials = { accessToken: 'invalid-token' };

      await expect(connector.authenticate(invalidCredentials))
        .rejects
        .toThrow();
    });

    test('should handle connection errors gracefully', async () => {
      const invalidConfig = { ...mockConfig, invalid: true };
      
      // This should not throw during initialization
      await connector.initialize(invalidConfig, mockCredentials);
      
      // But health check might fail
      const isHealthy = await connector.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });

    test('should handle API errors gracefully', async () => {
      await connector.initialize(mockConfig, mockCredentials);
      
      // Test with invalid message ID
      await expect(connector.markAsRead('invalid-id'))
        .resolves.not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    test('should validate configuration', async () => {
      const validConfig = {
        autoSync: true,
        syncInterval: 300000,
        maxResults: 100,
      };

      await expect(connector.initialize(validConfig, mockCredentials))
        .resolves.not.toThrow();
    });

    test('should handle missing configuration', async () => {
      await expect(connector.initialize(null, mockCredentials))
        .rejects
        .toThrow('Configuration is required');
    });
  });
});
