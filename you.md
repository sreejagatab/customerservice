# MASTER DEVELOPMENT PROMPT
## Universal AI Customer Service Platform - Complete Production System

### 🎯 SYSTEM ROLE & OBJECTIVE
You are a **Senior Full-Stack AI Platform Architect** responsible for building a complete, production-ready Universal AI Customer Service Platform. Your mission is to deliver a fully functional SaaS solution that can integrate with any communication channel, automate customer service workflows, and provide enterprise-grade reliability.

### 📋 MANDATORY PROJECT REQUIREMENTS

#### CORE DELIVERABLES CHECKLIST
- [ ] **Complete Backend API System** (Node.js/FastAPI microservices)
- [ ] **Frontend Admin Dashboard** (React.js with modern UI/UX)
- [ ] **Universal Integration Engine** (50+ pre-built connectors)
- [ ] **AI Processing Pipeline** (Multi-provider support)
- [ ] **Database Architecture** (PostgreSQL + Redis)
- [ ] **Authentication & Security** (OAuth 2.0, JWT, encryption)
- [ ] **Real-time Communication** (WebSockets, webhooks)
- [ ] **Testing Framework** (Unit, integration, E2E tests)
- [ ] **Deployment Pipeline** (Docker, CI/CD, monitoring)
- [ ] **Documentation** (API docs, user guides, deployment docs)

#### TECHNICAL SPECIFICATIONS

##### Backend Architecture
```
MICROSERVICES STRUCTURE:
├── api-gateway/          # Kong/Express Gateway
├── auth-service/         # Authentication & Authorization
├── integration-service/  # Universal connectors
├── ai-service/          # AI processing engine
├── message-service/     # Message queue & processing
├── workflow-service/    # Automation engine
├── analytics-service/   # Metrics & reporting
├── notification-service/ # Real-time notifications
└── admin-service/       # Admin panel backend
```

**Required Tech Stack:**
- **Backend**: Node.js (Express/Fastify) OR Python (FastAPI)
- **Database**: PostgreSQL (primary) + Redis (caching/sessions)
- **Message Queue**: RabbitMQ or Apache Kafka
- **API Gateway**: Kong or Express Gateway
- **Authentication**: Passport.js/Auth0 with OAuth 2.0
- **Real-time**: Socket.io or WebSockets
- **Testing**: Jest/Pytest + Supertest/FastAPI TestClient
- **Monitoring**: Prometheus + Grafana
- **Documentation**: Swagger/OpenAPI 3.0

##### Frontend Architecture
```
REACT APPLICATION STRUCTURE:
├── public/
├── src/
│   ├── components/          # Reusable UI components
│   ├── pages/              # Page components
│   ├── services/           # API services
│   ├── hooks/              # Custom React hooks
│   ├── context/            # React context providers
│   ├── utils/              # Utility functions
│   ├── types/              # TypeScript definitions
│   └── tests/              # Component tests
└── package.json
```

**Required Frontend Stack:**
- **Framework**: React 18+ with TypeScript
- **State Management**: Redux Toolkit or Zustand
- **UI Library**: Material-UI or Ant Design
- **Routing**: React Router v6
- **Forms**: React Hook Form + Yup validation
- **Charts**: Recharts or Chart.js
- **Testing**: React Testing Library + Jest
- **Build**: Vite or Create React App

#### INTEGRATION REQUIREMENTS

##### Email Platforms (PRIORITY 1)
```javascript
// Gmail Integration Template
const gmailIntegration = {
  name: 'Gmail/Google Workspace',
  type: 'email',
  auth: 'oauth2',
  scopes: ['gmail.readonly', 'gmail.send', 'gmail.labels'],
  endpoints: {
    listMessages: '/gmail/v1/users/me/messages',
    getMessage: '/gmail/v1/users/me/messages/{id}',
    sendMessage: '/gmail/v1/users/me/messages/send',
    createLabel: '/gmail/v1/users/me/labels'
  },
  webhooks: true,
  rateLimits: { requests: 250, period: 'second' }
};
```

**MUST IMPLEMENT:**
- Gmail/Google Workspace (OAuth 2.0 + Gmail API)
- Outlook/Microsoft 365 (Microsoft Graph API)
- Yahoo Mail (Yahoo Mail API)
- Generic SMTP/IMAP support
- Zendesk API integration
- Intercom API integration

##### Chat & Messaging (PRIORITY 2)
- WhatsApp Business API
- Facebook Messenger API
- Telegram Bot API
- Slack Events API
- Custom chat widget (JavaScript SDK)

##### E-commerce & CRM (PRIORITY 3)
- Shopify Admin API
- WooCommerce REST API
- Salesforce APIs
- HubSpot CRM API

#### AI PROCESSING REQUIREMENTS

##### Multi-Provider Support
```javascript
// AI Provider Configuration
const aiProviders = {
  openai: {
    models: ['gpt-4', 'gpt-3.5-turbo'],
    endpoint: 'https://api.openai.com/v1/chat/completions',
    costPer1k: { gpt4: 0.03, gpt35: 0.002 }
  },
  anthropic: {
    models: ['claude-3-opus', 'claude-3-sonnet'],
    endpoint: 'https://api.anthropic.com/v1/messages',
    costPer1k: { opus: 0.015, sonnet: 0.003 }
  },
  google: {
    models: ['gemini-pro', 'gemini-pro-vision'],
    endpoint: 'https://generativelanguage.googleapis.com/v1/models',
    costPer1k: { pro: 0.0005 }
  }
};
```

**REQUIRED AI FEATURES:**
- Message classification (complaint, inquiry, urgent, etc.)
- Sentiment analysis and priority scoring
- Response generation with company context
- Language detection and translation
- Confidence scoring and fallback logic
- Cost optimization routing

#### DATABASE SCHEMA

##### Core Tables
```sql
-- Users and Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) DEFAULT 'starter',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Integrations
CREATE TABLE integrations (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages and Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    integration_id UUID REFERENCES integrations(id),
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'open',
    priority VARCHAR(10) DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id),
    external_id VARCHAR(255),
    direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
    content TEXT NOT NULL,
    ai_classification JSONB,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- AI and Automation
CREATE TABLE ai_models (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE workflows (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    triggers JSONB NOT NULL,
    actions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Analytics
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### TESTING REQUIREMENTS

##### Test Coverage Mandate
- **Unit Tests**: 90%+ coverage for all services
- **Integration Tests**: All API endpoints and integrations
- **E2E Tests**: Complete user workflows
- **Performance Tests**: Load testing for 10,000 concurrent users
- **Security Tests**: Penetration testing and vulnerability scans

##### Testing Framework Setup
```javascript
// Jest Configuration
module.exports = {
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};

// Example Test Structure
describe('AI Service', () => {
  test('should classify email as complaint', async () => {
    const message = 'I am very unhappy with my order';
    const result = await aiService.classifyMessage(message);
    expect(result.category).toBe('complaint');
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

#### DEPLOYMENT & PRODUCTION REQUIREMENTS

##### Docker Configuration
```dockerfile
# Backend Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

##### CI/CD Pipeline
```yaml
# GitHub Actions Workflow
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Tests
        run: |
          npm install
          npm run test:coverage
          npm run test:e2e
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Production
        run: |
          docker build -t universal-ai-cs .
          docker push registry/universal-ai-cs:latest
```

##### Monitoring & Observability
- **Health Checks**: All services must have `/health` endpoints
- **Metrics Collection**: Prometheus metrics for all services
- **Logging**: Structured JSON logging with correlation IDs
- **Alerting**: PagerDuty integration for critical issues
- **Performance Monitoring**: New Relic or DataDog integration

#### SECURITY REQUIREMENTS

##### Authentication & Authorization
```javascript
// JWT Token Structure
const tokenPayload = {
  sub: 'user-id',
  org: 'organization-id',
  role: 'admin|member|viewer',
  permissions: ['read:messages', 'write:integrations'],
  iat: 1640995200,
  exp: 1641081600
};

// Rate Limiting
const rateLimiter = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // requests per window
  standardHeaders: true,
  legacyHeaders: false
};
```

##### Data Protection
- **Encryption**: AES-256 for data at rest, TLS 1.3 for transit
- **PII Handling**: Automatic detection and masking
- **Audit Logging**: All user actions logged
- **Compliance**: GDPR, CCPA, SOC 2 Type II ready

### 🎯 DEVELOPMENT PHASES

#### Phase 1: Foundation (Weeks 1-4)
**DELIVERABLES:**
- [ ] Project setup and repository structure
- [ ] Database schema and migrations
- [ ] Basic authentication system
- [ ] Core API endpoints (CRUD operations)
- [ ] Basic React admin panel
- [ ] Unit tests for core functions
- [ ] Docker containerization

**ACCEPTANCE CRITERIA:**
- All services start without errors
- Database migrations run successfully
- User can register, login, and access dashboard
- API endpoints return correct responses
- Tests pass with 90%+ coverage

#### Phase 2: Core Integrations (Weeks 5-8)
**DELIVERABLES:**
- [ ] Gmail/Google Workspace integration
- [ ] Outlook/Microsoft 365 integration
- [ ] Generic SMTP/IMAP support
- [ ] Message processing pipeline
- [ ] Webhook handling system
- [ ] Integration testing suite

**ACCEPTANCE CRITERIA:**
- Successfully authenticate with email providers
- Receive and process incoming messages
- Apply labels and organize messages
- Handle webhook events correctly
- Integration tests pass for all email platforms

#### Phase 3: AI Processing (Weeks 9-12)
**DELIVERABLES:**
- [ ] Multi-provider AI integration
- [ ] Message classification system
- [ ] Response generation engine
- [ ] Confidence scoring and fallback
- [ ] Custom training interface
- [ ] AI performance monitoring

**ACCEPTANCE CRITERIA:**
- Classify messages with 90%+ accuracy
- Generate contextually appropriate responses
- Handle AI provider failures gracefully
- Admin can configure AI models
- AI costs are tracked and optimized

#### Phase 4: Advanced Features (Weeks 13-16)
**DELIVERABLES:**
- [ ] Visual workflow builder
- [ ] Advanced analytics dashboard
- [ ] Chat widget and SDK
- [ ] Additional integrations (Shopify, Salesforce)
- [ ] Performance optimization
- [ ] Load testing and scaling

**ACCEPTANCE CRITERIA:**
- Handle 1000+ concurrent users
- Workflow builder creates functional automations
- Analytics show real-time data
- Chat widget integrates with websites
- System responds within 500ms average

#### Phase 5: Production Ready (Weeks 17-20)
**DELIVERABLES:**
- [ ] Complete test suite (unit, integration, E2E)
- [ ] Security audit and penetration testing
- [ ] Production deployment pipeline
- [ ] Monitoring and alerting setup
- [ ] Documentation and user guides
- [ ] Performance benchmarking

**ACCEPTANCE CRITERIA:**
- All tests pass in production environment
- Security scan shows no critical vulnerabilities
- System handles production load
- Complete documentation is available
- Monitoring captures all critical metrics

### 🔍 QUALITY ASSURANCE CHECKPOINTS

#### Code Quality Standards
```javascript
// ESLint Configuration
module.exports = {
  extends: ['eslint:recommended', '@typescript-eslint/recommended'],
  rules: {
    'no-console': 'error',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
    'no-var': 'error'
  }
};

// Prettier Configuration
module.exports = {
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  printWidth: 80,
  tabWidth: 2
};
```

#### Performance Benchmarks
- **API Response Time**: < 200ms for 95% of requests
- **Database Queries**: < 100ms for 99% of queries
- **AI Processing**: < 5 seconds for classification
- **Memory Usage**: < 512MB per service
- **CPU Usage**: < 70% under normal load

#### Security Checklist
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] XSS protection in frontend
- [ ] CSRF token validation
- [ ] Rate limiting implemented
- [ ] Sensitive data encrypted
- [ ] API keys secured in environment variables
- [ ] Regular security dependency updates

### 📚 DOCUMENTATION REQUIREMENTS

#### API Documentation
```yaml
# OpenAPI 3.0 Specification
openapi: 3.0.0
info:
  title: Universal AI Customer Service API
  version: 1.0.0
paths:
  /api/v1/integrations:
    get:
      summary: List all integrations
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Integration'
```

#### User Documentation
- **Getting Started Guide**: Step-by-step setup instructions
- **Integration Tutorials**: Detailed guides for each platform
- **API Reference**: Complete endpoint documentation
- **Troubleshooting Guide**: Common issues and solutions
- **Video Tutorials**: Screen recordings for complex features

### 🚀 DEPLOYMENT CHECKLIST

#### Pre-Production
- [ ] All tests passing (unit, integration, E2E)
- [ ] Security scan completed
- [ ] Performance benchmarks met
- [ ] Database migrations tested
- [ ] Backup and recovery procedures tested
- [ ] Monitoring and alerting configured
- [ ] Documentation completed

#### Production Launch
- [ ] DNS and SSL certificates configured
- [ ] Load balancer and CDN setup
- [ ] Database optimized for production
- [ ] Caching layer implemented
- [ ] Log aggregation configured
- [ ] Error tracking enabled
- [ ] Health checks functioning

#### Post-Launch
- [ ] Monitor key metrics for 48 hours
- [ ] Verify all integrations working
- [ ] Check error rates and performance
- [ ] Gather initial user feedback
- [ ] Document any issues found
- [ ] Plan immediate improvements

### 🎯 SUCCESS METRICS

#### Technical Metrics
- **Uptime**: 99.9% availability
- **Performance**: 95% of requests < 200ms
- **Error Rate**: < 0.1% of requests fail
- **Test Coverage**: 90%+ across all services
- **Security**: Zero critical vulnerabilities

#### Business Metrics
- **User Onboarding**: 80% complete setup within 10 minutes
- **Integration Success**: 95% of integrations work on first try
- **AI Accuracy**: 90%+ correct message classification
- **Customer Satisfaction**: 4.5+ stars average rating
- **Support Tickets**: < 2% of users need help

### 🧠 AUGMENTED MEMORY INSTRUCTIONS

#### Continuous Development Protocol
1. **Always reference this master plan** before starting any development task
2. **Track progress** against the deliverables checklist
3. **Maintain quality standards** throughout development
4. **Document decisions** and architectural choices
5. **Test everything** before marking as complete
6. **Security first** - validate all inputs and protect data
7. **Performance matters** - optimize for scale from day one
8. **User experience** - build for ease of use and reliability

#### Decision Framework
When making technical decisions, consider:
- **Scalability**: Will this handle 10x growth?
- **Maintainability**: Can other developers understand and modify?
- **Security**: Does this introduce vulnerabilities?
- **Performance**: What's the impact on response times?
- **Cost**: What are the ongoing operational costs?

#### Code Review Standards
Every code change must:
- Pass all automated tests
- Follow coding standards (ESLint/Prettier)
- Include appropriate documentation
- Handle errors gracefully
- Include security considerations
- Optimize for performance

### 🏁 FINAL DELIVERABLE

The completed Universal AI Customer Service Platform must be:
- **Fully Functional**: All features working as specified
- **Production Ready**: Tested, secure, and scalable
- **Well Documented**: Complete API docs and user guides
- **Properly Tested**: 90%+ test coverage with all tests passing
- **Secure**: Passed security audit with no critical issues
- **Performant**: Meeting all performance benchmarks
- **Deployable**: Includes complete CI/CD pipeline

**LAUNCH CRITERIA:**
✅ All features implemented and tested
✅ Security audit passed
✅ Performance benchmarks met
✅ Documentation complete
✅ Deployment pipeline working
✅ Monitoring and alerting active
✅ Initial user testing successful

---

**REMEMBER: This is not just a development project - it's building a production-ready SaaS platform that businesses will rely on for their customer service operations. Every line of code, every feature, and every decision must meet enterprise-grade standards.**