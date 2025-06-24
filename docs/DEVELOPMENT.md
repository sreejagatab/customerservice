# Universal AI Customer Service Platform - Development Guide

## 🛠️ Development Environment Setup

This guide provides comprehensive instructions for setting up a local development environment for the Universal AI Customer Service Platform.

## 📋 Prerequisites

### Required Software
- **Node.js**: Version 18.0 or higher
- **npm**: Version 8.0 or higher (comes with Node.js)
- **PostgreSQL**: Version 15 or higher
- **Redis**: Version 7 or higher
- **Git**: Latest version
- **Docker**: Version 20.10+ (optional but recommended)
- **Docker Compose**: Version 2.0+ (optional but recommended)

### Development Tools (Recommended)
- **VS Code**: With recommended extensions
- **Postman**: For API testing
- **pgAdmin**: PostgreSQL administration
- **Redis Commander**: Redis GUI client

## 🚀 Quick Setup

### 1. Clone the Repository
```bash
git clone https://github.com/universalai-cs/platform.git
cd platform
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install service dependencies
npm run install:all
```

### 3. Environment Configuration
```bash
# Copy environment template
cp .env.example .env.development

# Edit environment variables
nano .env.development
```

**Required Environment Variables:**
```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/universalai_cs_dev
POSTGRES_DB=universalai_cs_dev
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Security
JWT_SECRET=your-super-secure-jwt-secret-key-for-development
SESSION_SECRET=your-super-secure-session-key-for-development

# AI Services (Optional for basic development)
OPENAI_API_KEY=sk-your-openai-api-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key
GOOGLE_AI_API_KEY=your-google-ai-api-key

# Email Integration (Optional)
GMAIL_CLIENT_ID=your-gmail-client-id
GMAIL_CLIENT_SECRET=your-gmail-client-secret
OUTLOOK_CLIENT_ID=your-outlook-client-id
OUTLOOK_CLIENT_SECRET=your-outlook-client-secret

# Development Settings
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
```

### 4. Database Setup
```bash
# Start PostgreSQL (if using Docker)
docker run --name postgres-dev -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15

# Run database migrations
npm run db:migrate

# Seed development data
npm run db:seed
```

### 5. Start Development Services
```bash
# Option 1: Start all services with Docker Compose
docker-compose -f docker-compose.dev.yml up -d

# Option 2: Start services individually
npm run dev:api-gateway
npm run dev:ai-service
npm run dev:integration-service
npm run dev:analytics-service
npm run dev:workflow-service
```

### 6. Verify Setup
```bash
# Check service health
curl http://localhost:3000/health

# Run tests
npm test

# Check database connection
npm run db:test
```

## 🏗️ Project Structure

```
universal-ai-cs/
├── api-gateway/              # API Gateway service
│   ├── src/
│   │   ├── controllers/      # Request handlers
│   │   ├── middleware/       # Custom middleware
│   │   ├── routes/          # Route definitions
│   │   └── utils/           # Utility functions
│   ├── tests/               # Service tests
│   └── package.json
├── ai-service/              # AI processing service
│   ├── src/
│   │   ├── models/          # AI models and logic
│   │   ├── processors/      # Message processors
│   │   └── providers/       # AI provider integrations
│   └── tests/
├── integration-service/     # Email integration service
│   ├── src/
│   │   ├── connectors/      # Email provider connectors
│   │   ├── sync/           # Synchronization logic
│   │   └── webhooks/       # Webhook handlers
│   └── tests/
├── analytics-service/       # Analytics and reporting
├── workflow-service/        # Workflow automation
├── shared/                  # Shared utilities and types
│   ├── middleware/          # Common middleware
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Shared utility functions
│   └── constants/          # Application constants
├── database/               # Database schemas and migrations
│   ├── migrations/         # Database migration files
│   ├── seeds/             # Development seed data
│   └── schema.sql         # Database schema
├── frontend/              # React frontend application
├── tests/                 # Integration and E2E tests
├── docs/                  # Documentation
├── scripts/               # Development and deployment scripts
└── docker-compose.dev.yml # Development environment
```

## 🔧 Development Workflow

### Code Style and Standards
**TypeScript Configuration:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist"
  }
}
```

**ESLint Configuration:**
```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "airbnb-typescript/base",
    "prettier"
  ],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-unused-vars": "error",
    "prefer-const": "error"
  }
}
```

### Git Workflow
**Branch Naming Convention:**
- `feature/feature-name` - New features
- `bugfix/bug-description` - Bug fixes
- `hotfix/critical-fix` - Critical production fixes
- `refactor/component-name` - Code refactoring
- `docs/documentation-update` - Documentation updates

**Commit Message Format:**
```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Development Commands

**Service Management:**
```bash
# Start all services in development mode
npm run dev

# Start specific service
npm run dev:api-gateway
npm run dev:ai-service
npm run dev:integration-service

# Build all services
npm run build

# Build specific service
npm run build:api-gateway
```

**Database Operations:**
```bash
# Create new migration
npm run db:migration:create -- --name add_user_preferences

# Run migrations
npm run db:migrate

# Rollback migration
npm run db:migrate:rollback

# Reset database
npm run db:reset

# Seed development data
npm run db:seed
```

**Testing:**
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Generate coverage report
npm run test:coverage

# Run tests for specific service
npm run test:api-gateway
```

**Code Quality:**
```bash
# Lint all code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Type check
npm run type-check

# Run all quality checks
npm run quality-check
```

## 🧪 Testing Strategy

### Test Structure
```
tests/
├── unit/                   # Unit tests
│   ├── api-gateway/
│   ├── ai-service/
│   └── shared/
├── integration/            # Integration tests
│   ├── api/
│   ├── database/
│   └── services/
├── e2e/                   # End-to-end tests
│   ├── user-flows/
│   └── api-workflows/
├── performance/           # Performance tests
└── fixtures/             # Test data and mocks
```

### Writing Tests
**Unit Test Example:**
```typescript
// tests/unit/ai-service/classifier.test.ts
import { MessageClassifier } from '../../../ai-service/src/models/classifier';

describe('MessageClassifier', () => {
  let classifier: MessageClassifier;

  beforeEach(() => {
    classifier = new MessageClassifier();
  });

  describe('classifyMessage', () => {
    it('should classify order-related messages correctly', async () => {
      const message = 'I have an issue with my order #12345';
      
      const result = await classifier.classifyMessage(message);
      
      expect(result.category).toBe('order_issue');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should handle empty messages gracefully', async () => {
      const message = '';
      
      const result = await classifier.classifyMessage(message);
      
      expect(result.category).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});
```

**Integration Test Example:**
```typescript
// tests/integration/api/messages.test.ts
import request from 'supertest';
import { app } from '../../../api-gateway/src/app';
import { setupTestDatabase, cleanupTestDatabase } from '../../helpers/database';

describe('Messages API', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('POST /api/messages', () => {
    it('should create a new message', async () => {
      const messageData = {
        subject: 'Test Message',
        content: 'This is a test message',
        from: 'test@example.com',
        to: 'support@company.com'
      };

      const response = await request(app)
        .post('/api/messages')
        .set('Authorization', 'Bearer valid-token')
        .send(messageData)
        .expect(201);

      expect(response.body.data.subject).toBe(messageData.subject);
      expect(response.body.data.id).toBeDefined();
    });
  });
});
```

### Test Data Management
**Database Fixtures:**
```typescript
// tests/fixtures/users.ts
export const testUsers = [
  {
    id: 'user-1',
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'admin',
    organizationId: 'org-1'
  },
  {
    id: 'user-2',
    email: 'agent@test.com',
    name: 'Test Agent',
    role: 'agent',
    organizationId: 'org-1'
  }
];
```

## 🔍 Debugging

### VS Code Configuration
**.vscode/launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug API Gateway",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/api-gateway/src/index.ts",
      "outFiles": ["${workspaceFolder}/api-gateway/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development"
      },
      "runtimeArgs": ["-r", "ts-node/register"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Logging Configuration
```typescript
// shared/utils/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});
```

### Common Debugging Scenarios
**Database Connection Issues:**
```bash
# Check PostgreSQL status
docker ps | grep postgres

# Test database connection
npm run db:test

# View database logs
docker logs postgres-dev
```

**Service Communication Issues:**
```bash
# Check service health
curl http://localhost:3000/health
curl http://localhost:3001/health

# View service logs
docker-compose logs -f api-gateway
docker-compose logs -f ai-service
```

## 📦 Package Management

### Dependency Management
**Adding Dependencies:**
```bash
# Add production dependency
npm install --save package-name

# Add development dependency
npm install --save-dev package-name

# Add dependency to specific service
cd api-gateway && npm install package-name
```

**Updating Dependencies:**
```bash
# Check for outdated packages
npm outdated

# Update all dependencies
npm update

# Update specific package
npm install package-name@latest
```

### Security Auditing
```bash
# Run security audit
npm audit

# Fix security issues automatically
npm audit fix

# Force fix (use with caution)
npm audit fix --force
```

## 🚀 Performance Optimization

### Development Performance
**Hot Reloading:**
```typescript
// Use nodemon for automatic restarts
// nodemon.json
{
  "watch": ["src"],
  "ext": "ts,js,json",
  "ignore": ["src/**/*.test.ts"],
  "exec": "ts-node src/index.ts"
}
```

**Build Optimization:**
```bash
# Use TypeScript incremental compilation
tsc --build --incremental

# Use webpack for frontend bundling
npm run build:frontend -- --mode development
```

### Monitoring Development Environment
```bash
# Monitor resource usage
docker stats

# Check service performance
npm run perf:check

# Profile application
node --prof src/index.js
```

## 🤝 Contributing Guidelines

### Code Review Process
1. **Create Feature Branch**: From `develop` branch
2. **Implement Changes**: Follow coding standards
3. **Write Tests**: Ensure adequate test coverage
4. **Run Quality Checks**: Lint, format, and test
5. **Create Pull Request**: With detailed description
6. **Code Review**: Address reviewer feedback
7. **Merge**: After approval and CI passes

### Pull Request Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes
```

This development guide provides everything needed to set up and contribute to the Universal AI Customer Service Platform. Happy coding! 🎉
