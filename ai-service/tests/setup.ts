/**
 * Test Setup
 * Global test configuration and utilities
 */

import { config } from '@/config';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock external dependencies for testing
jest.mock('@/services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      query: jest.fn(),
      healthCheck: jest.fn(() => Promise.resolve(true)),
      getPoolStats: jest.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
    })),
    initialize: jest.fn(),
    close: jest.fn(),
  },
  BaseRepository: class MockBaseRepository {
    protected async query(text: string, params?: any[]) {
      return { rows: [] };
    }
  },
}));

jest.mock('@/services/queue', () => ({
  AiQueueService: {
    getInstance: jest.fn(() => ({
      init: jest.fn(),
      close: jest.fn(),
      addJob: jest.fn(),
      getQueueStats: jest.fn(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
      getAllQueueStats: jest.fn(() => ({})),
      getQueues: jest.fn(() => ['ai-classification', 'ai-response-generation']),
      isInitialized: jest.fn(() => true),
    })),
    initialize: jest.fn(),
    close: jest.fn(),
  },
  AiJobType: {
    CLASSIFY_MESSAGE: 'classify_message',
    GENERATE_RESPONSE: 'generate_response',
    ANALYZE_SENTIMENT: 'analyze_sentiment',
  },
}));

// Global test utilities
global.testUtils = {
  createMockMessage: () => ({
    messageId: 'test-message-123',
    organizationId: 'test-org-456',
    integrationId: 'test-integration-789',
    messageText: 'Hello, I need help with my order',
    messageHtml: '<p>Hello, I need help with my order</p>',
  }),

  createMockClassificationResult: () => ({
    messageId: 'test-message-123',
    classification: {
      category: 'inquiry',
      subcategory: 'order_status',
      intent: 'check_order',
      confidence: 0.85,
      urgency: 'normal' as const,
      topics: ['order', 'status'],
      reasoning: 'Customer is asking about order status',
    },
    sentiment: {
      score: 0.1,
      label: 'neutral' as const,
      confidence: 0.8,
    },
    language: {
      detected: 'en',
      confidence: 0.95,
    },
    priority: {
      score: 45,
      level: 'normal' as const,
      factors: ['normal urgency'],
    },
    processingTime: 1500,
    cost: 0.002,
    modelUsed: 'gpt-3.5-turbo',
    requiresHumanReview: false,
  }),

  createMockResponseResult: () => ({
    messageId: 'test-message-123',
    response: {
      content: 'Thank you for contacting us. I can help you check your order status. Could you please provide your order number?',
      confidence: 0.9,
      reasoning: 'Generated helpful response asking for order details',
      suggestedActions: ['Request order number', 'Check order status'],
      requiresHumanReview: false,
    },
    knowledgeBaseUsed: [
      {
        id: 'kb-1',
        title: 'Order Status FAQ',
        relevanceScore: 0.8,
      },
    ],
    processingTime: 2000,
    cost: 0.005,
    modelUsed: 'gpt-3.5-turbo',
    qualityScore: 85,
  }),

  createMockOrganizationContext: () => ({
    businessInfo: {
      name: 'Test Company',
      industry: 'E-commerce',
      businessType: 'B2C',
      website: 'https://testcompany.com',
      supportHours: '9 AM - 5 PM EST',
    },
    policies: {
      returnPolicy: '30-day return policy',
      shippingPolicy: 'Free shipping on orders over $50',
    },
    knowledgeBase: [
      {
        id: 'kb-1',
        title: 'Order Status FAQ',
        content: 'To check your order status, please provide your order number.',
        category: 'orders',
        tags: ['order', 'status', 'tracking'],
      },
    ],
    brandVoice: {
      tone: 'friendly' as const,
      style: 'Professional but approachable',
      preferredPhrases: ['Thank you for contacting us', 'Happy to help'],
    },
  }),

  createMockConversationContext: () => ({
    history: [
      {
        role: 'customer' as const,
        content: 'Hello, I need help',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      },
    ],
    customerInfo: {
      id: 'customer-123',
      name: 'John Doe',
      email: 'john@example.com',
      tier: 'standard',
      language: 'en',
      timezone: 'America/New_York',
    },
  }),

  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidClassificationResult(): R;
      toBeValidResponseResult(): R;
    }
  }

  var testUtils: {
    createMockMessage: () => any;
    createMockClassificationResult: () => any;
    createMockResponseResult: () => any;
    createMockOrganizationContext: () => any;
    createMockConversationContext: () => any;
    delay: (ms: number) => Promise<void>;
  };
}

// Custom matchers
expect.extend({
  toBeValidClassificationResult(received) {
    const required = [
      'messageId',
      'classification',
      'sentiment',
      'language',
      'priority',
      'processingTime',
      'cost',
      'modelUsed',
      'requiresHumanReview',
    ];

    const missing = required.filter(field => !(field in received));
    
    if (missing.length > 0) {
      return {
        message: () => `Expected classification result to have required fields: ${missing.join(', ')}`,
        pass: false,
      };
    }

    // Validate classification structure
    const classificationRequired = ['category', 'intent', 'confidence', 'urgency', 'topics'];
    const classificationMissing = classificationRequired.filter(field => !(field in received.classification));
    
    if (classificationMissing.length > 0) {
      return {
        message: () => `Expected classification to have required fields: ${classificationMissing.join(', ')}`,
        pass: false,
      };
    }

    return {
      message: () => 'Expected classification result to be invalid',
      pass: true,
    };
  },

  toBeValidResponseResult(received) {
    const required = [
      'messageId',
      'response',
      'knowledgeBaseUsed',
      'processingTime',
      'cost',
      'modelUsed',
      'qualityScore',
    ];

    const missing = required.filter(field => !(field in received));
    
    if (missing.length > 0) {
      return {
        message: () => `Expected response result to have required fields: ${missing.join(', ')}`,
        pass: false,
      };
    }

    // Validate response structure
    const responseRequired = ['content', 'confidence', 'suggestedActions', 'requiresHumanReview'];
    const responseMissing = responseRequired.filter(field => !(field in received.response));
    
    if (responseMissing.length > 0) {
      return {
        message: () => `Expected response to have required fields: ${responseMissing.join(', ')}`,
        pass: false,
      };
    }

    return {
      message: () => 'Expected response result to be invalid',
      pass: true,
    };
  },
});

// Setup and teardown
beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global test cleanup
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

export {};
