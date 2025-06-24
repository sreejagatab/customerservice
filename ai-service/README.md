# AI Service

**Phase 3: AI Processing Engine** for the Universal AI Customer Service Platform

## Overview

The AI Service is the core intelligence engine that provides:

- **Multi-Provider AI Integration**: OpenAI, Anthropic Claude, Google Gemini support
- **Message Classification**: Intelligent categorization with sentiment analysis
- **Response Generation**: Context-aware AI responses with company knowledge
- **Cost Optimization**: Automatic routing to most cost-effective providers
- **Performance Monitoring**: Real-time accuracy and cost tracking

## Features

### 🤖 AI Capabilities
- Message classification and intent detection
- Sentiment analysis and urgency scoring
- Automated response generation
- Language detection and translation
- Entity extraction and topic analysis
- Content moderation and compliance checking

### 🔄 Multi-Provider Support
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **Google AI**: Gemini Pro, Gemini Pro Vision
- **Azure OpenAI**: Enterprise-grade OpenAI models
- Automatic failover and load balancing

### 📊 Performance & Monitoring
- Real-time accuracy tracking
- Cost monitoring and optimization
- Response quality scoring
- A/B testing capabilities
- Detailed analytics and reporting

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI SERVICE                           │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ AI Provider │ │ Message     │ │ Response        │   │
│  │ Manager     │ │ Classifier  │ │ Generator       │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ Queue       │ │ Performance │ │ Cost            │   │
│  │ Processor   │ │ Monitor     │ │ Optimizer       │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼──┐ ┌────▼────┐ ┌──▼──────┐
            │ OpenAI   │ │ Claude  │ │ Gemini  │
            │ API      │ │ API     │ │ API     │
            └──────────┘ └─────────┘ └─────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- AI Provider API Keys

### Installation

1. **Clone and install dependencies**:
```bash
cd ai-service
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Set up database**:
```bash
# Run the database schema
psql -d universal_ai_cs -f init-db.sql
```

4. **Start the service**:
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Docker Setup

```bash
# Development
docker build -f Dockerfile.dev -t ai-service:dev .
docker run -p 3003:3003 ai-service:dev

# Production
docker build -t ai-service .
docker run -p 3003:3003 ai-service
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Service port | `3003` |
| `DATABASE_URL` | PostgreSQL connection | Required |
| `REDIS_URL` | Redis connection | Required |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `ANTHROPIC_API_KEY` | Anthropic API key | Optional |
| `GOOGLE_AI_API_KEY` | Google AI API key | Optional |
| `DEFAULT_AI_PROVIDER` | Default provider | `openai` |

### AI Provider Configuration

```javascript
// Example provider configuration
{
  "provider": "openai",
  "apiKey": "sk-...",
  "models": [
    {
      "name": "gpt-4",
      "type": "chat",
      "maxTokens": 8192,
      "costPerInputToken": 0.00003,
      "costPerOutputToken": 0.00006
    }
  ],
  "rateLimits": {
    "requestsPerMinute": 500,
    "tokensPerMinute": 150000
  }
}
```

## API Endpoints

### Health Check
```http
GET /health
```

### AI Processing
```http
POST /api/v1/ai/classify
POST /api/v1/ai/generate-response
POST /api/v1/ai/analyze-sentiment
POST /api/v1/ai/extract-entities
POST /api/v1/ai/detect-language
POST /api/v1/ai/translate
```

### Provider Management
```http
GET /api/v1/ai/providers
POST /api/v1/ai/providers
PUT /api/v1/ai/providers/:id
DELETE /api/v1/ai/providers/:id
```

### Performance Metrics
```http
GET /api/v1/ai/metrics
GET /api/v1/ai/costs
GET /api/v1/ai/performance
```

## Development

### Project Structure
```
ai-service/
├── src/
│   ├── config/          # Configuration
│   ├── services/        # Core services
│   ├── providers/       # AI provider implementations
│   ├── processors/      # Queue job processors
│   ├── routes/          # API routes
│   ├── middleware/      # Express middleware
│   ├── utils/           # Utilities
│   └── types/           # TypeScript types
├── tests/               # Test files
├── dist/                # Compiled JavaScript
└── docs/                # Documentation
```

### Running Tests
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Code Quality
```bash
# Linting
npm run lint
npm run lint:fix

# Type checking
npm run type-check

# Build
npm run build
```

## Integration

### With Integration Service

The AI Service integrates with the Integration Service through:

1. **Queue-based Processing**: Messages are processed asynchronously
2. **Webhook Callbacks**: Results are sent back via webhooks
3. **Shared Database**: Common data structures and relationships

### Message Flow

```
Integration Service → AI Queue → AI Processing → Results → Integration Service
```

## Monitoring

### Health Checks
- Service health: `GET /health`
- Database connectivity
- Redis connectivity
- AI provider availability

### Metrics
- Request latency and throughput
- AI processing times
- Cost tracking per provider
- Accuracy and quality scores
- Error rates and types

### Logging
- Structured JSON logging
- Request/response tracking
- Performance metrics
- Cost tracking
- Error reporting

## Security

- API key encryption at rest
- Rate limiting per organization
- Request validation and sanitization
- Audit logging for all operations
- Secure communication with AI providers

## Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] Database schema applied
- [ ] Redis connection tested
- [ ] AI provider keys validated
- [ ] Health checks passing
- [ ] Monitoring configured
- [ ] Logging configured
- [ ] Security settings applied

### Scaling
- Horizontal scaling with multiple instances
- Queue-based processing for high throughput
- Database connection pooling
- Redis clustering support
- Load balancing across AI providers

## Support

For issues and questions:
- Check the logs: `docker logs ai-service`
- Review configuration: Environment variables and database
- Test AI providers: Verify API keys and connectivity
- Monitor queues: Check Redis for stuck jobs

## License

MIT License - see LICENSE file for details.
