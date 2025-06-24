# Integration Service

The Integration Service is a core component of the Universal AI Customer Service Platform that handles all third-party integrations, including email providers (Gmail, Outlook, SMTP/IMAP), messaging platforms, and other external services.

## Features

- **Universal Email Integration**: Gmail/Google Workspace, Outlook/Microsoft 365, and generic SMTP/IMAP support
- **Real-time Webhook Processing**: Handle incoming webhooks from various providers
- **Message Processing Pipeline**: Asynchronous job processing with Redis queues
- **OAuth 2.0 Authentication**: Secure authentication flows for Google and Microsoft
- **Rate Limiting**: Redis-based rate limiting with different tiers
- **Health Monitoring**: Comprehensive health checks and monitoring endpoints
- **Production Ready**: Docker containerization, logging, error handling, and testing

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │    │  Integration    │    │   Queue Workers │
│                 │────│    Service      │────│                 │
│  (Rate Limiting)│    │                 │    │ (Job Processing)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                │
                    ┌─────────────────┐
                    │   Connectors    │
                    │                 │
                    │ Gmail │ Outlook │
                    │ SMTP  │  IMAP   │
                    └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+
- Docker & Docker Compose (optional)

### Development Setup

1. **Clone and setup the project:**
   ```bash
   git clone <repository-url>
   cd integration-service
   chmod +x scripts/*.sh
   ./scripts/setup.sh
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your OAuth credentials and database settings
   ```

3. **Start development services:**
   ```bash
   # Option 1: Using Docker Compose (recommended)
   docker-compose -f docker-compose.dev.yml up -d
   
   # Option 2: Local development
   npm run dev
   npm run dev:worker  # In another terminal
   ```

4. **Verify the setup:**
   ```bash
   curl http://localhost:3003/health
   ```

### Production Deployment

1. **Deploy using the deployment script:**
   ```bash
   ./scripts/deploy.sh -e production
   ```

2. **Or manually with Docker Compose:**
   ```bash
   docker-compose up -d --build
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/staging/production) | `development` |
| `PORT` | Service port | `3003` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Required for Gmail |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Required for Gmail |
| `MICROSOFT_CLIENT_ID` | Microsoft OAuth client ID | Required for Outlook |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client secret | Required for Outlook |

### OAuth Setup

#### Google OAuth (Gmail Integration)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add redirect URI: `http://localhost:3003/auth/google/callback`
6. Update `.env` with client ID and secret

#### Microsoft OAuth (Outlook Integration)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add Microsoft Graph permissions: `Mail.Read`, `Mail.Send`
4. Add redirect URI: `http://localhost:3003/auth/microsoft/callback`
5. Update `.env` with client ID and secret

## API Documentation

### Health Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health status
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

### Integration Management

- `GET /api/v1/integrations` - List integrations
- `POST /api/v1/integrations` - Create integration
- `GET /api/v1/integrations/:id` - Get integration
- `PUT /api/v1/integrations/:id` - Update integration
- `DELETE /api/v1/integrations/:id` - Delete integration
- `POST /api/v1/integrations/:id/test` - Test integration
- `POST /api/v1/integrations/:id/sync` - Sync integration

### Authentication

- `GET /auth/google/authorize` - Start Google OAuth flow
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/microsoft/authorize` - Start Microsoft OAuth flow
- `GET /auth/microsoft/callback` - Microsoft OAuth callback

### Webhooks

- `POST /webhooks/gmail` - Gmail webhook endpoint
- `POST /webhooks/microsoft` - Microsoft webhook endpoint
- `POST /webhooks/custom/:integrationId` - Custom webhook endpoint

## Development

### Project Structure

```
integration-service/
├── src/
│   ├── connectors/          # Integration connectors
│   │   ├── base.ts         # Base connector class
│   │   ├── gmail.ts        # Gmail connector
│   │   ├── outlook.ts      # Outlook connector
│   │   ├── smtp.ts         # SMTP connector
│   │   └── imap.ts         # IMAP connector
│   ├── middleware/         # Express middleware
│   │   ├── auth.ts         # Authentication middleware
│   │   ├── validation.ts   # Request validation
│   │   ├── error-handler.ts # Error handling
│   │   └── rate-limiter.ts # Rate limiting
│   ├── routes/             # API routes
│   │   ├── integrations.ts # Integration management
│   │   ├── webhooks.ts     # Webhook handling
│   │   ├── auth.ts         # OAuth flows
│   │   └── health.ts       # Health checks
│   ├── services/           # Core services
│   │   ├── database.ts     # Database service
│   │   ├── queue.ts        # Queue service
│   │   └── integration-manager.ts # Integration manager
│   ├── processors/         # Job processors
│   │   └── index.ts        # Queue job processors
│   ├── workers/            # Worker processes
│   │   └── index.ts        # Worker service
│   └── utils/              # Utilities
│       ├── logger.ts       # Logging utilities
│       └── config.ts       # Configuration
├── tests/                  # Test files
├── scripts/                # Deployment scripts
├── docker-compose.yml      # Production Docker Compose
├── docker-compose.dev.yml  # Development Docker Compose
└── Dockerfile              # Production Dockerfile
```

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run dev:worker       # Start development worker
npm run build            # Build the application
npm run test             # Run tests
npm run test:watch       # Run tests in watch mode
npm run lint             # Run linter

# Deployment
./scripts/setup.sh       # Initial setup
./scripts/deploy.sh      # Deploy application
./scripts/backup.sh      # Backup database
./scripts/monitor.sh     # Monitor service
```

### Testing

```bash
# Run all tests
npm test

# Run specific test files
npm test -- --testPathPattern=gmail

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## Monitoring

### Health Monitoring

The service provides comprehensive health monitoring:

```bash
# Check service health
curl http://localhost:3003/health

# Get detailed health information
curl http://localhost:3003/health/detailed

# Monitor continuously
./scripts/monitor.sh -w
```

### Logging

Logs are structured JSON in production and human-readable in development:

```bash
# View logs in Docker
docker-compose logs -f integration-api

# View worker logs
docker-compose logs -f integration-worker
```

### Metrics

Key metrics to monitor:

- **Response Time**: API endpoint response times
- **Queue Depth**: Number of pending jobs in queues
- **Error Rate**: Rate of failed requests/jobs
- **Integration Health**: Status of active integrations
- **Database Performance**: Query execution times
- **Memory Usage**: Service memory consumption

## Troubleshooting

### Common Issues

1. **OAuth Authentication Fails**
   - Verify client ID and secret in `.env`
   - Check redirect URIs in OAuth provider settings
   - Ensure proper scopes are configured

2. **Database Connection Issues**
   - Verify `DATABASE_URL` format
   - Check PostgreSQL service is running
   - Verify database exists and user has permissions

3. **Queue Jobs Not Processing**
   - Check Redis connection
   - Verify worker service is running
   - Check queue statistics: `curl http://localhost:3003/health/queue-stats`

4. **High Memory Usage**
   - Monitor queue depth
   - Check for memory leaks in connectors
   - Adjust worker concurrency settings

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

### Performance Tuning

1. **Queue Concurrency**: Adjust `QUEUE_CONCURRENCY` based on system resources
2. **Database Pool**: Tune PostgreSQL connection pool size
3. **Rate Limits**: Adjust rate limiting based on usage patterns
4. **Worker Scaling**: Scale worker instances based on queue depth

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

This project is part of the Universal AI Customer Service Platform.

## Support

For support and questions:
- Check the troubleshooting section
- Review logs for error details
- Monitor service health endpoints
- Use the monitoring script for diagnostics
