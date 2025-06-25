/**
 * Jest Global Setup
 * Common setup for all test types
 */

import { config } from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Redis from 'ioredis-mock';

// Load test environment variables
config({ path: '.env.test' });

// Global test configuration
global.testConfig = {
  timeout: 30000,
  retries: 3,
  parallel: true,
};

// Mock external services
jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('amqplib');
jest.mock('twilio');
jest.mock('@google-cloud/speech');
jest.mock('@google-cloud/text-to-speech');
jest.mock('aws-sdk');

// Global test utilities
global.testUtils = {
  // Generate test data
  generateTestUser: () => ({
    id: `test_user_${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    organizationId: `test_org_${Date.now()}`,
    role: 'user',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  generateTestOrganization: () => ({
    id: `test_org_${Date.now()}`,
    name: `Test Organization ${Date.now()}`,
    slug: `test-org-${Date.now()}`,
    status: 'active',
    tier: 'professional',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  generateTestMessage: () => ({
    id: `test_msg_${Date.now()}`,
    organizationId: `test_org_${Date.now()}`,
    conversationId: `test_conv_${Date.now()}`,
    content: 'Test message content',
    type: 'text',
    direction: 'inbound',
    channel: 'email',
    status: 'delivered',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  // Wait for async operations
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Retry function for flaky tests
  retry: async (fn: () => Promise<any>, retries: number = 3): Promise<any> => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await global.testUtils.waitFor(1000 * (i + 1));
      }
    }
  },

  // Clean up test data
  cleanup: {
    database: async () => {
      // Clean up test database
      if (global.mongoServer) {
        await global.mongoServer.stop();
      }
    },
    redis: async () => {
      // Clean up Redis
      if (global.redisClient) {
        await global.redisClient.flushall();
      }
    },
    files: async () => {
      // Clean up test files
      const fs = require('fs').promises;
      const path = require('path');
      const testDir = path.join(__dirname, '../../temp/test');
      try {
        await fs.rmdir(testDir, { recursive: true });
      } catch (error) {
        // Directory might not exist
      }
    },
  },
};

// Global test hooks
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Increase timeout for setup
  jest.setTimeout(60000);
  
  console.log('🧪 Setting up test environment...');
});

afterAll(async () => {
  // Clean up global resources
  await global.testUtils.cleanup.database();
  await global.testUtils.cleanup.redis();
  await global.testUtils.cleanup.files();
  
  console.log('🧹 Test environment cleaned up');
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Extend Jest matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },

  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid email`,
        pass: false,
      };
    }
  },

  toBeWithinTimeRange(received: Date, expected: Date, toleranceMs: number = 1000) {
    const diff = Math.abs(received.getTime() - expected.getTime());
    const pass = diff <= toleranceMs;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be within ${toleranceMs}ms of ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within ${toleranceMs}ms of ${expected}, but was ${diff}ms away`,
        pass: false,
      };
    }
  },

  toHaveValidStructure(received: any, expectedStructure: any) {
    const hasValidStructure = (obj: any, structure: any): boolean => {
      for (const key in structure) {
        if (!(key in obj)) return false;
        
        if (typeof structure[key] === 'object' && structure[key] !== null) {
          if (!hasValidStructure(obj[key], structure[key])) return false;
        } else if (typeof obj[key] !== structure[key]) {
          return false;
        }
      }
      return true;
    };

    const pass = hasValidStructure(received, expectedStructure);
    
    if (pass) {
      return {
        message: () => `expected object not to have valid structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected object to have valid structure`,
        pass: false,
      };
    }
  },
});

// Declare global types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidEmail(): R;
      toBeWithinTimeRange(expected: Date, toleranceMs?: number): R;
      toHaveValidStructure(expectedStructure: any): R;
    }
  }

  var testConfig: {
    timeout: number;
    retries: number;
    parallel: boolean;
  };

  var testUtils: {
    generateTestUser: () => any;
    generateTestOrganization: () => any;
    generateTestMessage: () => any;
    waitFor: (ms: number) => Promise<void>;
    retry: (fn: () => Promise<any>, retries?: number) => Promise<any>;
    cleanup: {
      database: () => Promise<void>;
      redis: () => Promise<void>;
      files: () => Promise<void>;
    };
  };

  var mongoServer: MongoMemoryServer;
  var redisClient: any;
}
