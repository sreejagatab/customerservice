# Universal AI Customer Service Platform - Testing Guide

## 🧪 Testing Strategy Overview

This comprehensive testing guide covers all aspects of testing for the Universal AI Customer Service Platform, including unit tests, integration tests, end-to-end tests, and performance testing.

## 📋 Testing Philosophy

### Testing Pyramid
```
    /\
   /  \     E2E Tests (Few)
  /____\    - User workflows
 /      \   - Critical paths
/________\  Integration Tests (Some)
           - API endpoints
           - Service communication
           - Database operations
___________
           Unit Tests (Many)
           - Individual functions
           - Business logic
           - Edge cases
```

### Testing Principles
- **Test Early, Test Often**: Write tests alongside code
- **Test Behavior, Not Implementation**: Focus on what the code does
- **Maintainable Tests**: Keep tests simple and readable
- **Fast Feedback**: Unit tests should run quickly
- **Reliable Tests**: Tests should be deterministic and stable

## 🏗️ Test Structure

### Directory Organization
```
tests/
├── unit/                   # Unit tests (fast, isolated)
│   ├── api-gateway/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   └── utils/
│   ├── ai-service/
│   │   ├── models/
│   │   ├── processors/
│   │   └── providers/
│   ├── integration-service/
│   ├── analytics-service/
│   ├── workflow-service/
│   └── shared/
├── integration/            # Integration tests (medium speed)
│   ├── api/               # API endpoint tests
│   ├── database/          # Database integration
│   ├── services/          # Service-to-service
│   └── external/          # External API mocks
├── e2e/                   # End-to-end tests (slow)
│   ├── user-flows/        # Complete user journeys
│   ├── admin-flows/       # Admin workflows
│   └── api-workflows/     # API workflow tests
├── performance/           # Performance tests
│   ├── load/             # Load testing
│   ├── stress/           # Stress testing
│   └── spike/            # Spike testing
├── fixtures/              # Test data and mocks
│   ├── data/             # Sample data
│   ├── mocks/            # Mock implementations
│   └── factories/        # Data factories
└── helpers/               # Test utilities
    ├── database.ts       # Database test helpers
    ├── auth.ts          # Authentication helpers
    └── assertions.ts    # Custom assertions
```

## 🔧 Testing Tools and Setup

### Core Testing Stack
- **Test Runner**: Jest 29+
- **Assertion Library**: Jest built-in + custom matchers
- **Mocking**: Jest mocks + MSW for HTTP mocking
- **E2E Testing**: Playwright
- **Performance Testing**: Artillery.js
- **Coverage**: Istanbul (built into Jest)

### Test Configuration

**jest.config.js:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  maxWorkers: '50%'
};
```

**tests/setup.ts:**
```typescript
import { setupTestDatabase, cleanupTestDatabase } from './helpers/database';
import { setupMocks } from './helpers/mocks';

// Global test setup
beforeAll(async () => {
  await setupTestDatabase();
  setupMocks();
});

// Global test cleanup
afterAll(async () => {
  await cleanupTestDatabase();
});

// Custom Jest matchers
expect.extend({
  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid email`,
      pass
    };
  }
});
```

## 🧪 Unit Testing

### Writing Unit Tests

**Example: Testing a Service Class**
```typescript
// tests/unit/ai-service/message-classifier.test.ts
import { MessageClassifier } from '../../../ai-service/src/services/message-classifier';
import { mockOpenAIProvider } from '../../fixtures/mocks/ai-providers';

describe('MessageClassifier', () => {
  let classifier: MessageClassifier;

  beforeEach(() => {
    classifier = new MessageClassifier({
      provider: mockOpenAIProvider
    });
  });

  describe('classifyMessage', () => {
    it('should classify order-related messages correctly', async () => {
      // Arrange
      const message = {
        subject: 'Order Issue',
        content: 'I have a problem with my order #12345',
        from: 'customer@example.com'
      };

      mockOpenAIProvider.classify.mockResolvedValue({
        category: 'order_issue',
        confidence: 0.92,
        sentiment: 'negative'
      });

      // Act
      const result = await classifier.classifyMessage(message);

      // Assert
      expect(result.category).toBe('order_issue');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.sentiment).toBe('negative');
      expect(mockOpenAIProvider.classify).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('order #12345')
        })
      );
    });

    it('should handle classification errors gracefully', async () => {
      // Arrange
      const message = {
        subject: 'Test',
        content: 'Test message',
        from: 'test@example.com'
      };

      mockOpenAIProvider.classify.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      // Act & Assert
      await expect(classifier.classifyMessage(message))
        .rejects.toThrow('Classification failed');
    });

    it('should return low confidence for ambiguous messages', async () => {
      // Arrange
      const message = {
        subject: 'Hi',
        content: 'Hello',
        from: 'user@example.com'
      };

      mockOpenAIProvider.classify.mockResolvedValue({
        category: 'general',
        confidence: 0.3,
        sentiment: 'neutral'
      });

      // Act
      const result = await classifier.classifyMessage(message);

      // Assert
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.category).toBe('general');
    });
  });

  describe('validateMessage', () => {
    it('should validate required message fields', () => {
      // Arrange
      const invalidMessage = {
        subject: '',
        content: 'Test',
        from: 'invalid-email'
      };

      // Act & Assert
      expect(() => classifier.validateMessage(invalidMessage))
        .toThrow('Invalid message format');
    });

    it('should accept valid messages', () => {
      // Arrange
      const validMessage = {
        subject: 'Valid Subject',
        content: 'Valid content',
        from: 'valid@example.com'
      };

      // Act & Assert
      expect(() => classifier.validateMessage(validMessage))
        .not.toThrow();
    });
  });
});
```

### Testing Utilities and Helpers

**Database Test Helpers:**
```typescript
// tests/helpers/database.ts
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

export async function setupTestDatabase() {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.TEST_DATABASE_URL
      }
    }
  });

  // Run migrations
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  
  // Clear existing data
  await cleanupTestDatabase();
}

export async function cleanupTestDatabase() {
  if (!prisma) return;

  // Clean up in reverse dependency order
  await prisma.message.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

export function createTestUser(overrides = {}) {
  return {
    id: 'test-user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'agent',
    organizationId: 'test-org-1',
    ...overrides
  };
}

export function createTestMessage(overrides = {}) {
  return {
    id: 'test-message-1',
    subject: 'Test Message',
    content: 'This is a test message',
    from: 'customer@example.com',
    to: 'support@company.com',
    status: 'unread',
    organizationId: 'test-org-1',
    ...overrides
  };
}
```

## 🔗 Integration Testing

### API Integration Tests

**Example: Testing API Endpoints**
```typescript
// tests/integration/api/messages.test.ts
import request from 'supertest';
import { app } from '../../../api-gateway/src/app';
import { setupTestDatabase, cleanupTestDatabase, createTestUser } from '../../helpers/database';
import { generateAuthToken } from '../../helpers/auth';

describe('Messages API Integration', () => {
  let authToken: string;

  beforeAll(async () => {
    await setupTestDatabase();
    const testUser = createTestUser();
    authToken = generateAuthToken(testUser);
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('POST /api/messages', () => {
    it('should create a new message successfully', async () => {
      // Arrange
      const messageData = {
        subject: 'Integration Test Message',
        content: 'This is an integration test message',
        from: 'customer@example.com',
        to: 'support@company.com',
        type: 'email'
      };

      // Act
      const response = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send(messageData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        subject: messageData.subject,
        content: messageData.content,
        from: messageData.from,
        to: messageData.to,
        status: 'unread'
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidMessageData = {
        subject: '', // Empty subject
        content: 'Test content'
        // Missing required fields
      };

      // Act
      const response = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidMessageData)
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({
          field: 'subject',
          message: expect.stringContaining('required')
        })
      );
    });

    it('should require authentication', async () => {
      // Arrange
      const messageData = {
        subject: 'Test Message',
        content: 'Test content',
        from: 'test@example.com',
        to: 'support@company.com'
      };

      // Act
      const response = await request(app)
        .post('/api/messages')
        .send(messageData)
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('GET /api/messages', () => {
    beforeEach(async () => {
      // Create test messages
      await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Test Message 1',
          content: 'Content 1',
          from: 'customer1@example.com',
          to: 'support@company.com'
        });

      await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Test Message 2',
          content: 'Content 2',
          from: 'customer2@example.com',
          to: 'support@company.com'
        });
    });

    it('should return paginated messages', async () => {
      // Act
      const response = await request(app)
        .get('/api/messages?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(2);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1
      });
    });

    it('should filter messages by status', async () => {
      // Act
      const response = await request(app)
        .get('/api/messages?status=unread')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(2);
      expect(response.body.data.messages.every(m => m.status === 'unread')).toBe(true);
    });
  });
});
```

### Service Integration Tests

**Example: Testing Service Communication**
```typescript
// tests/integration/services/ai-integration.test.ts
import { AIService } from '../../../ai-service/src/services/ai-service';
import { IntegrationService } from '../../../integration-service/src/services/integration-service';
import { setupTestDatabase } from '../../helpers/database';

describe('AI Service Integration', () => {
  let aiService: AIService;
  let integrationService: IntegrationService;

  beforeAll(async () => {
    await setupTestDatabase();
    aiService = new AIService();
    integrationService = new IntegrationService();
  });

  it('should process messages end-to-end', async () => {
    // Arrange
    const rawMessage = {
      subject: 'Order Problem',
      content: 'I am very upset about my delayed order #12345',
      from: 'angry.customer@example.com',
      to: 'support@company.com'
    };

    // Act
    // 1. Integration service receives message
    const storedMessage = await integrationService.storeMessage(rawMessage);
    
    // 2. AI service processes message
    const classification = await aiService.classifyMessage(storedMessage);
    
    // 3. AI service generates response
    const response = await aiService.generateResponse(storedMessage, classification);

    // Assert
    expect(storedMessage.id).toBeDefined();
    expect(classification.category).toBe('order_issue');
    expect(classification.sentiment).toBe('negative');
    expect(classification.priority).toBe('high');
    expect(response.content).toContain('apologize');
    expect(response.tone).toBe('empathetic');
  });
});
```

## 🎭 End-to-End Testing

### E2E Test Setup with Playwright

**playwright.config.ts:**
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI
  }
});
```

**Example E2E Test:**
```typescript
// tests/e2e/user-flows/message-processing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Message Processing Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await page.goto('/login');
    await page.fill('[data-testid=email-input]', 'admin@test.com');
    await page.fill('[data-testid=password-input]', 'password123');
    await page.click('[data-testid=login-button]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should process a new message from inbox to resolution', async ({ page }) => {
    // Navigate to messages
    await page.click('[data-testid=messages-nav]');
    await expect(page).toHaveURL('/messages');

    // Create a new message (simulating email integration)
    await page.click('[data-testid=new-message-button]');
    await page.fill('[data-testid=subject-input]', 'Order Issue - E2E Test');
    await page.fill('[data-testid=content-input]', 'I need help with my order #12345');
    await page.fill('[data-testid=from-input]', 'customer@example.com');
    await page.click('[data-testid=create-message-button]');

    // Verify message appears in inbox
    await expect(page.locator('[data-testid=message-list]')).toContainText('Order Issue - E2E Test');

    // Click on the message to open details
    await page.click('[data-testid=message-item]:has-text("Order Issue - E2E Test")');

    // Verify AI classification
    await expect(page.locator('[data-testid=ai-category]')).toContainText('order_issue');
    await expect(page.locator('[data-testid=ai-sentiment]')).toContainText('neutral');

    // Generate AI response
    await page.click('[data-testid=generate-response-button]');
    await expect(page.locator('[data-testid=ai-response]')).toBeVisible();
    await expect(page.locator('[data-testid=ai-response]')).toContainText('order');

    // Customize and send response
    await page.fill('[data-testid=response-editor]', 'Thank you for contacting us about order #12345. I will look into this immediately.');
    await page.click('[data-testid=send-response-button]');

    // Mark as resolved
    await page.selectOption('[data-testid=status-select]', 'resolved');
    await page.click('[data-testid=update-status-button]');

    // Verify message status updated
    await expect(page.locator('[data-testid=message-status]')).toContainText('resolved');

    // Verify message moved to resolved section
    await page.click('[data-testid=resolved-filter]');
    await expect(page.locator('[data-testid=message-list]')).toContainText('Order Issue - E2E Test');
  });

  test('should handle bulk message operations', async ({ page }) => {
    // Navigate to messages
    await page.goto('/messages');

    // Select multiple messages
    await page.check('[data-testid=message-checkbox]:nth-child(1)');
    await page.check('[data-testid=message-checkbox]:nth-child(2)');

    // Bulk assign to agent
    await page.click('[data-testid=bulk-actions-button]');
    await page.click('[data-testid=bulk-assign-option]');
    await page.selectOption('[data-testid=agent-select]', 'agent@test.com');
    await page.click('[data-testid=confirm-assign-button]');

    // Verify assignment
    await expect(page.locator('[data-testid=message-item]:nth-child(1) [data-testid=assigned-agent]'))
      .toContainText('agent@test.com');
  });
});
```

## ⚡ Performance Testing

### Load Testing with Artillery

**performance/load-tests/api-load-test.yml:**
```yaml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load test"
  variables:
    authToken: "Bearer test-token"

scenarios:
  - name: "Message API Load Test"
    weight: 70
    flow:
      - post:
          url: "/api/messages"
          headers:
            Authorization: "{{ authToken }}"
          json:
            subject: "Load Test Message {{ $randomString() }}"
            content: "This is a load test message"
            from: "loadtest{{ $randomInt(1, 1000) }}@example.com"
            to: "support@company.com"
          expect:
            - statusCode: 201

  - name: "Message List Load Test"
    weight: 30
    flow:
      - get:
          url: "/api/messages?page={{ $randomInt(1, 10) }}&limit=20"
          headers:
            Authorization: "{{ authToken }}"
          expect:
            - statusCode: 200
```

### Performance Test Runner

```typescript
// tests/performance/runner.ts
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

interface PerformanceResults {
  averageResponseTime: number;
  p95ResponseTime: number;
  errorRate: number;
  throughput: number;
}

export async function runPerformanceTests(): Promise<PerformanceResults> {
  console.log('Starting performance tests...');

  // Run Artillery load test
  const output = execSync('artillery run performance/load-tests/api-load-test.yml --output results.json', {
    encoding: 'utf-8'
  });

  // Parse results
  const results = JSON.parse(output);
  
  const performanceResults: PerformanceResults = {
    averageResponseTime: results.aggregate.latency.mean,
    p95ResponseTime: results.aggregate.latency.p95,
    errorRate: (results.aggregate.errors / results.aggregate.requests) * 100,
    throughput: results.aggregate.rps.mean
  };

  // Generate report
  generatePerformanceReport(performanceResults);

  return performanceResults;
}

function generatePerformanceReport(results: PerformanceResults) {
  const report = `
# Performance Test Report

## Results Summary
- Average Response Time: ${results.averageResponseTime}ms
- 95th Percentile: ${results.p95ResponseTime}ms
- Error Rate: ${results.errorRate}%
- Throughput: ${results.throughput} requests/second

## Performance Targets
- ✅ Average Response Time < 200ms: ${results.averageResponseTime < 200 ? 'PASS' : 'FAIL'}
- ✅ 95th Percentile < 500ms: ${results.p95ResponseTime < 500 ? 'PASS' : 'FAIL'}
- ✅ Error Rate < 1%: ${results.errorRate < 1 ? 'PASS' : 'FAIL'}
- ✅ Throughput > 100 rps: ${results.throughput > 100 ? 'PASS' : 'FAIL'}
`;

  writeFileSync('performance-report.md', report);
  console.log('Performance report generated: performance-report.md');
}
```

## 📊 Test Coverage and Quality

### Coverage Configuration
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    },
    "./src/controllers/": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    }
  }
}
```

### Quality Gates
```bash
# Run all quality checks
npm run test:quality

# Individual checks
npm run test:unit -- --coverage
npm run test:integration
npm run test:e2e
npm run test:performance
npm run lint
npm run type-check
```

This comprehensive testing guide ensures high-quality, reliable code through thorough testing at all levels of the application. 🎯
