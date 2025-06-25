/**
 * Jest Test Setup
 * Universal AI Customer Service Platform - Message Service
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock external services
jest.mock('../services/ai-client', () => ({
  classifyMessage: jest.fn(),
  generateResponse: jest.fn(),
  analyzeIntent: jest.fn(),
  extractEntities: jest.fn(),
}));

jest.mock('../services/webhook-client', () => ({
  deliverWebhook: jest.fn(),
  validateWebhookSignature: jest.fn(),
}));

// Mock Redis
jest.mock('../services/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    flushall: jest.fn(),
    quit: jest.fn(),
    ping: jest.fn(),
    keys: jest.fn(),
    mget: jest.fn(),
    mset: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    lpush: jest.fn(),
    rpop: jest.fn(),
    llen: jest.fn(),
    sadd: jest.fn(),
    smembers: jest.fn(),
    srem: jest.fn(),
    zadd: jest.fn(),
    zrange: jest.fn(),
    zrem: jest.fn(),
  },
}));

// Mock database
jest.mock('../services/database', () => ({
  db: {
    query: jest.fn(),
    transaction: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
  },
}));

// Mock logger to reduce noise in tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test utilities
global.testUtils = {
  // Create a mock message
  createMockMessage: (overrides = {}) => ({
    id: 'msg_123',
    organizationId: 'org_123',
    conversationId: 'conv_456',
    direction: 'inbound',
    channel: 'email',
    content: {
      text: 'Test message',
      format: 'text',
    },
    sender: {
      type: 'customer',
      email: 'test@example.com',
      name: 'Test User',
    },
    status: 'pending',
    metadata: {
      source: 'test',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  // Create a mock conversation
  createMockConversation: (overrides = {}) => ({
    id: 'conv_456',
    organizationId: 'org_123',
    channel: 'email',
    status: 'active',
    participants: [
      {
        type: 'customer',
        email: 'test@example.com',
        name: 'Test User',
      },
    ],
    metadata: {
      source: 'test',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  // Create a mock organization
  createMockOrganization: (overrides = {}) => ({
    id: 'org_123',
    name: 'Test Organization',
    settings: {
      aiEnabled: true,
      autoResponse: false,
      workingHours: {
        enabled: false,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  // Create a mock agent
  createMockAgent: (overrides = {}) => ({
    id: 'agent_123',
    organizationId: 'org_123',
    name: 'Test Agent',
    email: 'agent@example.com',
    status: 'available',
    skills: ['general'],
    workload: 0,
    maxWorkload: 10,
    ...overrides,
  }),

  // Create a mock AI classification
  createMockClassification: (overrides = {}) => ({
    intent: 'support_request',
    sentiment: 'neutral',
    confidence: 0.95,
    entities: [],
    urgency: 'normal',
    category: 'general',
    language: 'en',
    ...overrides,
  }),

  // Wait for a specified time
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate a random ID
  generateId: (prefix = 'test') => `${prefix}_${Math.random().toString(36).substr(2, 9)}`,

  // Create a mock queue job
  createMockQueueJob: (overrides = {}) => ({
    id: 'job_123',
    type: 'message.processing',
    data: {
      messageId: 'msg_123',
      organizationId: 'org_123',
    },
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(),
    ...overrides,
  }),

  // Mock HTTP request/response
  createMockRequest: (overrides = {}) => ({
    headers: {
      'x-organization-id': 'org_123',
      'x-integration-id': 'int_123',
      'x-request-id': 'req_123',
    },
    body: {},
    params: {},
    query: {},
    ...overrides,
  }),

  createMockResponse: () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
  },

  // Mock WebSocket
  createMockSocket: (overrides = {}) => ({
    id: 'socket_123',
    handshake: {
      address: '127.0.0.1',
    },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    on: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  }),
};

// Global test configuration
global.testConfig = {
  timeout: {
    short: 1000,
    medium: 5000,
    long: 10000,
  },
  retries: {
    default: 3,
    flaky: 5,
  },
  thresholds: {
    coverage: 90,
    performance: {
      responseTime: 100, // ms
      throughput: 20, // requests/second
    },
  },
};

// Setup and teardown hooks
beforeAll(async () => {
  // Global setup
});

afterAll(async () => {
  // Global cleanup
});

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  jest.restoreAllMocks();
});

// Custom matchers
expect.extend({
  toBeValidMessage(received) {
    const requiredFields = ['id', 'organizationId', 'conversationId', 'content', 'sender'];
    const missingFields = requiredFields.filter(field => !received[field]);
    
    if (missingFields.length > 0) {
      return {
        message: () => `Expected message to have required fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
    
    return {
      message: () => 'Expected message to be invalid',
      pass: true,
    };
  },

  toBeValidQueueJob(received) {
    const requiredFields = ['id', 'type', 'data'];
    const missingFields = requiredFields.filter(field => !received[field]);
    
    if (missingFields.length > 0) {
      return {
        message: () => `Expected queue job to have required fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
    
    return {
      message: () => 'Expected queue job to be invalid',
      pass: true,
    };
  },

  toHaveValidTimestamp(received, field = 'createdAt') {
    const timestamp = received[field];
    
    if (!timestamp) {
      return {
        message: () => `Expected ${field} to be present`,
        pass: false,
      };
    }
    
    if (!(timestamp instanceof Date) && typeof timestamp !== 'string') {
      return {
        message: () => `Expected ${field} to be a Date or string`,
        pass: false,
      };
    }
    
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return {
        message: () => `Expected ${field} to be a valid date`,
        pass: false,
      };
    }
    
    return {
      message: () => `Expected ${field} to be invalid`,
      pass: true,
    };
  },
});

// Type declarations for global utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidMessage(): R;
      toBeValidQueueJob(): R;
      toHaveValidTimestamp(field?: string): R;
    }
  }

  var testUtils: {
    createMockMessage: (overrides?: any) => any;
    createMockConversation: (overrides?: any) => any;
    createMockOrganization: (overrides?: any) => any;
    createMockAgent: (overrides?: any) => any;
    createMockClassification: (overrides?: any) => any;
    wait: (ms: number) => Promise<void>;
    generateId: (prefix?: string) => string;
    createMockQueueJob: (overrides?: any) => any;
    createMockRequest: (overrides?: any) => any;
    createMockResponse: () => any;
    createMockSocket: (overrides?: any) => any;
  };

  var testConfig: {
    timeout: {
      short: number;
      medium: number;
      long: number;
    };
    retries: {
      default: number;
      flaky: number;
    };
    thresholds: {
      coverage: number;
      performance: {
        responseTime: number;
        throughput: number;
      };
    };
  };
}
