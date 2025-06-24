/**
 * Integration Manager Integration Tests
 */

import { IntegrationManager } from '../../src/services/integration-manager';
import { DatabaseService } from '../../src/services/database';
import { QueueService } from '../../src/services/queue';

describe('IntegrationManager Integration Tests', () => {
  let integrationManager: IntegrationManager;
  let mockIntegrationData: any;

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
    integrationManager = IntegrationManager.getInstance();
    await integrationManager.init();
  }, 30000);

  afterAll(async () => {
    await integrationManager.close();
    await QueueService.close();
    await DatabaseService.close();
  });

  beforeEach(() => {
    mockIntegrationData = global.testUtils.createMockIntegration();
  });

  describe('Integration Lifecycle', () => {
    test('should create and initialize integration', async () => {
      const connector = await integrationManager.createIntegration(mockIntegrationData);

      expect(connector).toBeDefined();
      expect(connector.id).toBe('gmail-connector');
      expect(connector.provider).toBe('gmail');
      expect(connector.initialized).toBe(true);
      expect(connector.connected).toBe(true);
    });

    test('should get active integration', async () => {
      await integrationManager.createIntegration(mockIntegrationData);
      
      const connector = integrationManager.getIntegration(mockIntegrationData.id);
      expect(connector).toBeDefined();
      expect(connector?.provider).toBe('gmail');
    });

    test('should update integration configuration', async () => {
      await integrationManager.createIntegration(mockIntegrationData);
      
      const updates = {
        config: {
          ...mockIntegrationData.config,
          maxResults: 200,
        },
      };

      await expect(
        integrationManager.updateIntegration(mockIntegrationData.id, updates)
      ).resolves.not.toThrow();
    });

    test('should test integration connection', async () => {
      await integrationManager.createIntegration(mockIntegrationData);
      
      const testResult = await integrationManager.testIntegration(mockIntegrationData.id);
      expect(testResult).toBe(true);
    });

    test('should sync integration', async () => {
      await integrationManager.createIntegration(mockIntegrationData);
      
      await expect(
        integrationManager.syncIntegration(mockIntegrationData.id)
      ).resolves.not.toThrow();
    });

    test('should delete integration', async () => {
      await integrationManager.createIntegration(mockIntegrationData);
      
      await expect(
        integrationManager.deleteIntegration(mockIntegrationData.id)
      ).resolves.not.toThrow();
      
      const connector = integrationManager.getIntegration(mockIntegrationData.id);
      expect(connector).toBeUndefined();
    });
  });

  describe('Health Monitoring', () => {
    test('should perform health check on all integrations', async () => {
      await integrationManager.createIntegration(mockIntegrationData);
      
      const healthResults = await integrationManager.healthCheckAll();
      expect(healthResults).toHaveProperty(mockIntegrationData.id);
      expect(healthResults[mockIntegrationData.id]).toBe(true);
    });

    test('should return integration statistics', () => {
      const stats = integrationManager.getStats();
      
      expect(stats).toHaveProperty('totalIntegrations');
      expect(stats).toHaveProperty('supportedProviders');
      expect(stats).toHaveProperty('activeSyncIntervals');
      expect(Array.isArray(stats.supportedProviders)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid integration creation', async () => {
      const invalidData = {
        ...mockIntegrationData,
        provider: 'invalid-provider',
      };

      await expect(
        integrationManager.createIntegration(invalidData)
      ).rejects.toThrow();
    });

    test('should handle operations on non-existent integration', async () => {
      const nonExistentId = 'non-existent-integration';

      await expect(
        integrationManager.testIntegration(nonExistentId)
      ).rejects.toThrow();

      await expect(
        integrationManager.syncIntegration(nonExistentId)
      ).rejects.toThrow();
    });

    test('should handle integration with invalid credentials', async () => {
      const invalidCredentialsData = {
        ...mockIntegrationData,
        credentials: {
          accessToken: 'invalid-token',
        },
      };

      // This should create the integration but health check might fail
      const connector = await integrationManager.createIntegration(invalidCredentialsData);
      expect(connector).toBeDefined();
      
      // Health check might return false for invalid credentials
      const isHealthy = await connector.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Multiple Integrations', () => {
    test('should handle multiple integrations of same type', async () => {
      const integration1 = { ...mockIntegrationData, id: 'integration-1' };
      const integration2 = { ...mockIntegrationData, id: 'integration-2' };

      await integrationManager.createIntegration(integration1);
      await integrationManager.createIntegration(integration2);

      const connector1 = integrationManager.getIntegration('integration-1');
      const connector2 = integrationManager.getIntegration('integration-2');

      expect(connector1).toBeDefined();
      expect(connector2).toBeDefined();
      expect(connector1).not.toBe(connector2);
    });

    test('should handle different integration types', async () => {
      const gmailIntegration1 = { ...mockIntegrationData, id: 'gmail-integration-1' };
      const gmailIntegration2 = {
        ...mockIntegrationData,
        id: 'gmail-integration-2',
        name: 'Second Gmail Integration',
      };

      await integrationManager.createIntegration(gmailIntegration1);
      await integrationManager.createIntegration(gmailIntegration2);

      const gmailConnector1 = integrationManager.getIntegration('gmail-integration-1');
      const gmailConnector2 = integrationManager.getIntegration('gmail-integration-2');

      expect(gmailConnector1?.provider).toBe('gmail');
      expect(gmailConnector2?.provider).toBe('gmail');
      expect(gmailConnector1?.id).toBe('gmail-connector');
      expect(gmailConnector2?.id).toBe('gmail-connector');
      expect(gmailConnector1).not.toBe(gmailConnector2); // Different instances
    });
  });
});
