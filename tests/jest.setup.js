/**
 * Global Jest Setup
 * Configuration and utilities for all unit tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Test database configuration
process.env.TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/test_db';
process.env.TEST_REDIS_URL = 'redis://localhost:6380';
process.env.TEST_RABBITMQ_URL = 'amqp://guest:guest@localhost:5673';

// JWT secrets for testing
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-unit-tests';

// Disable external services in tests
process.env.DISABLE_EXTERNAL_APIS = 'true';
process.env.MOCK_EMAIL_SERVICE = 'true';
process.env.MOCK_AI_SERVICES = 'true';

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Database utilities
  createMockDbResult: (rows = [], rowCount = null) => ({
    rows,
    rowCount: rowCount !== null ? rowCount : rows.length,
    command: 'SELECT',
    oid: null,
    fields: []
  }),

  // User utilities
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    organizationId: 'test-org-id',
    role: 'admin',
    permissions: ['read', 'write'],
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides
  }),

  // Organization utilities
  createMockOrganization: (overrides = {}) => ({
    id: 'test-org-id',
    name: 'Test Organization',
    plan: 'professional',
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides
  }),

  // Integration utilities
  createMockIntegration: (overrides = {}) => ({
    id: 'test-integration-id',
    organizationId: 'test-org-id',
    name: 'Test Integration',
    type: 'email',
    provider: 'gmail',
    config: {
      autoSync: true,
      syncInterval: 300000,
      maxResults: 100
    },
    credentials: {
      type: 'oauth2',
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000)
    },
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides
  }),

  // Message utilities
  createMockMessage: (overrides = {}) => ({
    id: 'test-message-id',
    conversationId: 'test-conversation-id',
    integrationId: 'test-integration-id',
    externalId: 'external-msg-123',
    direction: 'inbound',
    from: {
      email: 'customer@example.com',
      name: 'Test Customer'
    },
    to: [{
      email: 'support@company.com',
      name: 'Support Team'
    }],
    subject: 'Test Subject',
    content: {
      text: 'Test message content',
      html: '<p>Test message content</p>'
    },
    metadata: {
      labels: ['INBOX'],
      isRead: false,
      isImportant: false
    },
    aiClassification: null,
    processedAt: null,
    createdAt: new Date('2024-01-01'),
    ...overrides
  }),

  // AI utilities
  createMockAiClassification: (overrides = {}) => ({
    category: 'inquiry',
    subcategory: 'general',
    intent: 'get_information',
    confidence: 0.85,
    urgency: 'normal',
    sentiment: {
      score: 0.1,
      label: 'neutral',
      confidence: 0.8
    },
    topics: ['general', 'information'],
    language: {
      detected: 'en',
      confidence: 0.95
    },
    priority: {
      score: 50,
      level: 'normal'
    },
    requiresHumanReview: false,
    processingTime: 1500,
    cost: 0.002,
    modelUsed: 'gpt-3.5-turbo',
    ...overrides
  }),

  // HTTP utilities
  createMockRequest: (overrides = {}) => ({
    method: 'GET',
    url: '/test',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'test-agent'
    },
    body: {},
    params: {},
    query: {},
    user: null,
    ...overrides
  }),

  createMockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      locals: {}
    };
    return res;
  },

  // Async utilities
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock external services
  mockExternalServices: () => {
    // Mock OpenAI
    jest.mock('openai', () => ({
      OpenAI: jest.fn().mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    category: 'inquiry',
                    confidence: 0.85,
                    intent: 'get_information'
                  })
                }
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150
              }
            })
          }
        }
      }))
    }));

    // Mock Anthropic
    jest.mock('@anthropic-ai/sdk', () => ({
      Anthropic: jest.fn().mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{
              text: JSON.stringify({
                category: 'inquiry',
                confidence: 0.85,
                intent: 'get_information'
              })
            }],
            usage: {
              input_tokens: 100,
              output_tokens: 50
            }
          })
        }
      }))
    }));

    // Mock Google AI
    jest.mock('@google/generative-ai', () => ({
      GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () => JSON.stringify({
                category: 'inquiry',
                confidence: 0.85,
                intent: 'get_information'
              })
            }
          })
        })
      }))
    }));
  }
};

// Custom Jest matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);
    
    return {
      message: () => `expected ${received} to be a valid UUID`,
      pass
    };
  },

  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = typeof received === 'string' && emailRegex.test(received);
    
    return {
      message: () => `expected ${received} to be a valid email`,
      pass
    };
  },

  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    
    return {
      message: () => `expected ${received} to be a valid Date`,
      pass
    };
  },

  toHaveValidStructure(received, expectedKeys) {
    const receivedKeys = Object.keys(received || {});
    const missingKeys = expectedKeys.filter(key => !receivedKeys.includes(key));
    const pass = missingKeys.length === 0;
    
    return {
      message: () => `expected object to have keys: ${expectedKeys.join(', ')}, missing: ${missingKeys.join(', ')}`,
      pass
    };
  }
});

// Global setup and teardown
beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global test cleanup
  // Restore console
  global.console = originalConsole;
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  jest.restoreAllMocks();
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Export for use in other test files
module.exports = {
  testUtils: global.testUtils
};
