/**
 * Jest test setup file
 */

import 'dotenv/config';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/test_db';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-key-for-testing';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3003/auth/google/callback';
process.env.MICROSOFT_REDIRECT_URI = 'http://localhost:3003/auth/microsoft/callback';
process.env.WEBHOOK_BASE_URL = 'http://localhost:3003/webhooks';

// Mock Database Service for integration tests
jest.mock('../src/services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      transaction: jest.fn().mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
          release: jest.fn(),
        };
        return await callback(mockClient);
      }),
      healthCheck: jest.fn().mockResolvedValue(true),
      getStats: jest.fn().mockReturnValue({
        totalConnections: 1,
        idleConnections: 0,
        waitingCount: 0,
      }),
    }),
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  },
  integrationRepo: {
    getIntegration: jest.fn().mockResolvedValue({
      rows: [{
        id: 'test-integration-id',
        organization_id: 'test-org-id',
        name: 'Test Integration',
        type: 'email',
        provider: 'gmail',
        config: { autoSync: true },
        credentials: { accessToken: 'mock-token' },
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    }),
    createIntegration: jest.fn().mockResolvedValue({
      rows: [{
        id: 'new-integration-id',
        organization_id: 'test-org-id',
        name: 'New Integration',
        type: 'email',
        provider: 'gmail',
        config: {},
        credentials: {},
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    }),
    updateIntegration: jest.fn().mockResolvedValue({
      rows: [{
        id: 'test-integration-id',
        organization_id: 'test-org-id',
        name: 'Updated Integration',
        type: 'email',
        provider: 'gmail',
        config: { autoSync: false },
        credentials: { accessToken: 'updated-token' },
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    }),
    deleteIntegration: jest.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    }),
    listIntegrations: jest.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    }),
    logSyncEvent: jest.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    }),
  },
}));

// Mock Google Auth Library
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
    getAccessToken: jest.fn().mockResolvedValue({
      token: 'mock-access-token',
    }),
    refreshAccessToken: jest.fn().mockResolvedValue({
      credentials: {
        access_token: 'mock-refreshed-access-token',
        refresh_token: 'mock-refresh-token',
        expiry_date: Date.now() + 3600000,
      },
    }),
    generateAuthUrl: jest.fn().mockReturnValue('https://mock-auth-url.com'),
  })),
}));

// Mock Axios for Outlook connector
const mockAxiosInstance = {
  get: jest.fn().mockResolvedValue({
    data: {
      id: 'test-user-id',
      mail: 'test@example.com',
      userPrincipalName: 'test@example.com',
      displayName: 'Test User',
      value: [
        {
          id: 'msg1',
          subject: 'Test Subject',
          from: {
            emailAddress: {
              address: 'sender@example.com',
              name: 'Test Sender',
            },
          },
          toRecipients: [
            {
              emailAddress: {
                address: 'recipient@example.com',
                name: 'Test Recipient',
              },
            },
          ],
          body: {
            content: 'Test message content',
            contentType: 'text',
          },
          receivedDateTime: new Date().toISOString(),
          isRead: false,
        },
      ],
    },
  }),
  post: jest.fn().mockResolvedValue({
    data: {
      id: 'sent-msg-id',
      subject: 'Test Subject',
    },
  }),
  patch: jest.fn().mockResolvedValue({
    data: {
      id: 'msg1',
      isRead: true,
    },
  }),
  delete: jest.fn().mockResolvedValue({
    data: {},
  }),
  interceptors: {
    request: {
      use: jest.fn(),
    },
    response: {
      use: jest.fn(),
    },
  },
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
  post: jest.fn().mockResolvedValue({
    data: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
    },
  }),
  default: {
    create: jest.fn(() => mockAxiosInstance),
    post: jest.fn().mockResolvedValue({
      data: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
      },
    }),
  },
}));

// Mock external services in test environment
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expiry_date: Date.now() + 3600000,
          },
        }),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'mock-refreshed-access-token',
            refresh_token: 'mock-refresh-token',
            expiry_date: Date.now() + 3600000,
          },
        }),
        generateAuthUrl: jest.fn().mockReturnValue('https://mock-auth-url.com'),
      })),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        getProfile: jest.fn().mockResolvedValue({
          data: {
            emailAddress: 'test@example.com',
            messagesTotal: 100,
            threadsTotal: 50,
            historyId: '12345',
          },
        }),
        messages: {
          list: jest.fn().mockResolvedValue({
            data: {
              messages: [
                { id: 'msg1', threadId: 'thread1' },
                { id: 'msg2', threadId: 'thread2' },
              ],
            },
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              id: 'msg1',
              threadId: 'thread1',
              payload: {
                headers: [
                  { name: 'From', value: 'sender@example.com' },
                  { name: 'To', value: 'recipient@example.com' },
                  { name: 'Subject', value: 'Test Subject' },
                ],
                body: {
                  data: Buffer.from('Test message body').toString('base64'),
                },
              },
              internalDate: Date.now().toString(),
              labelIds: ['INBOX'],
            },
          }),
          send: jest.fn().mockResolvedValue({
            data: {
              id: 'sent-msg-id',
              threadId: 'sent-thread-id',
            },
          }),
          modify: jest.fn().mockResolvedValue({
            data: {
              id: 'msg1',
              labelIds: ['INBOX'],
            },
          }),
          delete: jest.fn().mockResolvedValue({
            data: {},
          }),
        },
        watch: jest.fn().mockResolvedValue({
          data: {
            historyId: '12345',
            expiration: (Date.now() + 604800000).toString(), // 7 days
          },
        }),
        history: {
          list: jest.fn().mockResolvedValue({
            data: {
              history: [
                {
                  id: '12345',
                  messagesAdded: [
                    {
                      message: {
                        id: 'msg1',
                        threadId: 'thread1',
                      },
                    },
                  ],
                },
              ],
            },
          }),
        },
      },
    }),
  },
}));

// Mock axios for Microsoft Graph API
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn().mockReturnValue({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'mock-message-id',
      accepted: ['recipient@example.com'],
      rejected: [],
    }),
    close: jest.fn(),
  }),
}));

// Mock IMAP
jest.mock('imap', () => {
  return jest.fn().mockImplementation(() => ({
    once: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    openBox: jest.fn(),
    search: jest.fn(),
    fetch: jest.fn(),
    addFlags: jest.fn(),
    expunge: jest.fn(),
  }));
});

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  createMockIntegration: (overrides = {}) => ({
    id: 'test-integration-id',
    organizationId: 'test-org-id',
    name: 'Test Integration',
    type: 'email',
    provider: 'gmail',
    config: {
      autoSync: true,
      syncInterval: 300000,
      maxResults: 100,
    },
    credentials: {
      type: 'oauth2',
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    },
    status: 'active',
    ...overrides,
  }),

  createMockMessage: (overrides = {}) => ({
    id: 'test-message-id',
    threadId: 'test-thread-id',
    from: {
      email: 'sender@example.com',
      name: 'Test Sender',
    },
    to: [
      {
        email: 'recipient@example.com',
        name: 'Test Recipient',
      },
    ],
    subject: 'Test Subject',
    body: {
      text: 'Test message body',
      html: '<p>Test message body</p>',
    },
    date: new Date(),
    isRead: false,
    labels: ['INBOX'],
    ...overrides,
  }),

  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    organizationId: 'test-org-id',
    role: 'admin',
    permissions: ['integration:read', 'integration:write'],
    ...overrides,
  }),

  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Declare global types
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockIntegration: (overrides?: any) => any;
        createMockMessage: (overrides?: any) => any;
        createMockUser: (overrides?: any) => any;
        delay: (ms: number) => Promise<void>;
      };
    }
  }
}
