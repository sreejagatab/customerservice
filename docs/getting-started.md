# 🚀 Getting Started Guide

Welcome to the Universal AI Customer Service Platform! This guide will help you get up and running quickly.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### Required Software
- **Node.js**: 18.0+ (LTS recommended)
- **npm**: 9.0+ or **yarn**: 1.22+
- **PostgreSQL**: 14+ with extensions
- **Redis**: 6+ for caching and sessions
- **Docker**: 20+ with Docker Compose
- **Git**: Latest version

### Optional (for production)
- **Kubernetes**: 1.25+ for container orchestration
- **Helm**: 3.0+ for Kubernetes package management
- **Terraform**: 1.0+ for infrastructure as code

## ⚡ Quick Start (5 minutes)

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/universal-ai-customer-service.git
cd universal-ai-customer-service
```

### 2. Install Dependencies
```bash
# Install all workspace dependencies
npm install

# Or using yarn
yarn install
```

### 3. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit the .env file with your configuration
nano .env
```

### 4. Start Infrastructure Services
```bash
# Start PostgreSQL, Redis, and RabbitMQ
docker-compose up -d postgres redis rabbitmq

# Wait for services to be ready (about 30 seconds)
npm run wait-for-services
```

### 5. Initialize Database
```bash
# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

### 6. Start Development Server
```bash
# Start all services in development mode
npm run dev

# Or start services individually
npm run dev:api-gateway
npm run dev:auth-service
npm run dev:frontend
```

### 7. Access the Platform
- **Frontend Dashboard**: http://localhost:3000
- **API Gateway**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api-docs

## 🔑 Initial Configuration

### Default Admin Account
```
Email: admin@example.com
Password: admin123
```

### API Keys Setup
You'll need to configure the following API keys in your `.env` file:

```bash
# AI Providers (at least one required)
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_AI_API_KEY=your_google_ai_api_key

# Email Integration (optional)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret

# Voice Integration (optional)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
```

## 🧪 Verify Installation

### Run Health Checks
```bash
# Check all services
npm run health-check

# Check specific service
curl http://localhost:3001/health
```

### Run Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## 📚 Next Steps

### 1. Explore the Dashboard
- Navigate to http://localhost:3000
- Log in with the default admin account
- Explore the main features and settings

### 2. Set Up Your First Integration
- Go to **Integrations** → **Add Integration**
- Choose your preferred platform (Gmail, Slack, etc.)
- Follow the setup wizard

### 3. Configure AI Settings
- Navigate to **AI Settings**
- Configure your AI providers
- Test message classification and response generation

### 4. Create Your First Workflow
- Go to **Workflows** → **Create Workflow**
- Use the visual builder to create automation
- Test with sample data

### 5. Invite Team Members
- Go to **Team** → **Invite Members**
- Set up roles and permissions
- Configure notification preferences

## 🔧 Development Workflow

### Working with Services
```bash
# Start specific services
npm run dev:api-gateway
npm run dev:ai-service
npm run dev:frontend

# View service logs
npm run logs:api-gateway
npm run logs:ai-service

# Restart specific service
npm run restart:ai-service
```

### Database Operations
```bash
# Create new migration
npm run db:migration:create add_new_table

# Run migrations
npm run db:migrate

# Rollback migration
npm run db:rollback

# Reset database
npm run db:reset
```

### Testing
```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e

# Watch mode for development
npm run test:watch
```

## 🐳 Docker Development

### Using Docker Compose
```bash
# Build and start all services
npm run docker:build
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down

# Rebuild specific service
docker-compose build ai-service
docker-compose up -d ai-service
```

### Individual Service Development
```bash
# Build specific service
docker build -t ai-service ./ai-service

# Run with environment variables
docker run -p 3004:3004 --env-file .env ai-service

# Debug mode
docker run -it --entrypoint /bin/bash ai-service
```

## 🚨 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or use different ports in .env
API_GATEWAY_PORT=3101
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Reset database
npm run db:reset
```

#### Service Won't Start
```bash
# Check service logs
npm run logs:service-name

# Restart service
npm run restart:service-name

# Check dependencies
npm run health-check
```

#### Memory Issues
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Or in package.json scripts
"dev": "NODE_OPTIONS='--max-old-space-size=4096' npm run dev"
```

### Getting Help

1. **Check the logs**: Most issues are visible in service logs
2. **Verify environment**: Ensure all required environment variables are set
3. **Check dependencies**: Make sure all external services are running
4. **Review documentation**: Check specific service documentation
5. **Community support**: Join our Discord for help

## 📖 Additional Resources

- [Architecture Overview](./architecture.md)
- [API Reference](./api.md)
- [Integration Guide](./integrations.md)
- [Deployment Guide](./deployment.md)
- [Contributing Guide](./contributing.md)

## 🎯 What's Next?

Once you have the platform running:

1. **Configure your first integration** (Gmail, Slack, etc.)
2. **Set up AI providers** for intelligent message processing
3. **Create workflows** for automation
4. **Invite team members** and set up permissions
5. **Explore advanced features** like voice integration and analytics

Welcome to the future of customer service! 🚀
