/**
 * Test Setup Configuration
 * Sets up the testing environment for Message Service
 */

import { config } from '../src/config';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock Redis for tests
jest.mock('../src/services/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    incr: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    lpush: jest.fn(),
    rpop: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
    isReady: jest.fn().mockReturnValue(true),
    initialize: jest.fn(),
    close: jest.fn(),
  },
}));

// Mock Database for tests
jest.mock('../src/services/database', () => ({
  db: {
    query: jest.fn(),
    getClient: jest.fn(),
    transaction: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
    getPoolStats: jest.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    }),
    initialize: jest.fn(),
    close: jest.fn(),
  },
}));

// Mock Message Queue for tests
jest.mock('../src/services/queue', () => ({
  messageQueue: {
    publishMessage: jest.fn(),
    publishToExchange: jest.fn(),
    consume: jest.fn(),
    getQueueInfo: jest.fn(),
    purgeQueue: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
    initialize: jest.fn(),
    close: jest.fn(),
  },
  MessageQueueService: {
    QUEUES: {
      MESSAGE_PROCESSING: 'message.processing',
      MESSAGE_ROUTING: 'message.routing',
      MESSAGE_DELIVERY: 'message.delivery',
      MESSAGE_RETRY: 'message.retry',
      MESSAGE_DLQ: 'message.dlq',
      WEBHOOK_DELIVERY: 'webhook.delivery',
      AI_PROCESSING: 'ai.processing',
    },
    EXCHANGES: {
      MESSAGE_EVENTS: 'message.events',
      MESSAGE_ROUTING: 'message.routing',
      WEBHOOK_EVENTS: 'webhook.events',
    },
  },
}));

// Mock WebSocket service for tests
jest.mock('../src/services/websocket', () => ({
  webSocketService: {
    initialize: jest.fn(),
    broadcastMessageUpdate: jest.fn(),
    sendTypingIndicator: jest.fn(),
    sendPresenceUpdate: jest.fn(),
    getConnectedClientsCount: jest.fn().mockReturnValue(0),
    getOrganizationClients: jest.fn().mockReturnValue([]),
    getConversationClients: jest.fn().mockReturnValue([]),
    close: jest.fn(),
  },
}));

// Mock external HTTP calls
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  })),
}));

// Global test utilities
global.testUtils = {
  createMockMessage: () => ({
    id: 'test-message-id',
    conversationId: 'test-conversation-id',
    externalId: 'external-123',
    direction: 'inbound' as const,
    content: {
      text: 'Test message content',
      format: 'text' as const,
    },
    sender: {
      email: 'test@example.com',
      name: 'Test User',
      type: 'customer' as const,
    },
    status: 'received' as const,
    attachments: [],
    metadata: {
      organizationId: 'test-org',
      integrationId: 'test-integration',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  createMockConversation: () => ({
    id: 'test-conversation-id',
    organizationId: 'test-org',
    integrationId: 'test-integration',
    customerEmail: 'customer@example.com',
    customerName: 'Test Customer',
    status: 'open' as const,
    priority: 'normal' as const,
    tags: [],
    metadata: {},
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  createMockIncomingMessage: () => ({
    conversationId: 'test-conversation-id',
    direction: 'inbound' as const,
    content: {
      text: 'Test incoming message',
      format: 'text' as const,
    },
    sender: {
      email: 'sender@example.com',
      name: 'Test Sender',
      type: 'customer' as const,
    },
    organizationId: 'test-org',
    integrationId: 'test-integration',
  }),

  createMockQueueMessage: () => ({
    id: 'test-queue-message-id',
    type: 'message.process',
    data: {
      messageId: 'test-message-id',
      conversationId: 'test-conversation-id',
    },
    timestamp: new Date(),
    attempts: 0,
    maxAttempts: 3,
  }),

  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Setup and teardown
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
});

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidEmail(): R;
      toBeValidDate(): R;
    }
  }

  var testUtils: {
    createMockMessage: () => any;
    createMockConversation: () => any;
    createMockIncomingMessage: () => any;
    createMockQueueMessage: () => any;
    delay: (ms: number) => Promise<void>;
  };
}

// Custom matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid UUID`,
      pass,
    };
  },

  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid email`,
      pass,
    };
  },

  toBeValidDate(received: any) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid date`,
      pass,
    };
  },
});
