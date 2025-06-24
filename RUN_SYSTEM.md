# 🚀 Running the Universal AI Customer Service Platform

This guide will help you start and test the Universal AI Customer Service Platform on your local machine.

## 📋 Prerequisites

Before running the system, ensure you have the following installed:

- **Docker Desktop** (latest version)
- **Docker Compose** (included with Docker Desktop)
- **Git** (for cloning the repository)
- **curl** (for testing APIs)

### Windows Users
- Use **PowerShell** or **Command Prompt** as Administrator
- Ensure Docker Desktop is running

### macOS/Linux Users
- Use **Terminal**
- Ensure Docker daemon is running

## 🎯 Quick Start

### Option 1: Windows Batch Script
```cmd
# Navigate to the project directory
cd path\to\universal-ai-customer-service

# Run the startup script
scripts\start-system.bat
```

### Option 2: Bash Script (macOS/Linux/WSL)
```bash
# Navigate to the project directory
cd path/to/universal-ai-customer-service

# Make scripts executable
chmod +x scripts/start-system.sh scripts/test-system.sh

# Run the startup script
./scripts/start-system.sh
```

### Option 3: Manual Docker Compose
```bash
# Create environment file
cp .env.example .env

# Start the system
docker-compose up -d

# Check status
docker-compose ps
```

## 🌐 Access Points

Once the system is running, you can access:

### 📱 Main Applications
- **Frontend Dashboard**: http://localhost:5173
- **API Gateway**: http://localhost:3000
- **Authentication Service**: http://localhost:3001

### 🔧 Development Tools
- **Grafana (Monitoring)**: http://localhost:3001 (admin/admin)
- **Prometheus (Metrics)**: http://localhost:9090
- **RabbitMQ (Message Queue)**: http://localhost:15672 (guest/guest)
- **MailHog (Email Testing)**: http://localhost:8025

### 🔌 API Services
- **Integration Service**: http://localhost:3002
- **AI Service**: http://localhost:3003
- **Message Service**: http://localhost:3004
- **Workflow Service**: http://localhost:3006
- **Analytics Service**: http://localhost:3008

## 🧪 Testing the System

### Automated Testing
```bash
# Run comprehensive system tests
./scripts/test-system.sh

# Or on Windows
scripts\test-system.bat
```

### Manual Testing

#### 1. Health Check
```bash
# Check overall system health
curl http://localhost:3000/health

# Check individual services
curl http://localhost:3001/health  # Auth Service
curl http://localhost:3002/health  # Integration Service
curl http://localhost:3003/health  # AI Service
curl http://localhost:3004/health  # Message Service
```

#### 2. API Documentation
Visit http://localhost:3000/docs to see the interactive API documentation.

#### 3. Service Discovery
```bash
# Check registered services
curl http://localhost:3000/services
```

#### 4. Frontend Testing
1. Open http://localhost:5173 in your browser
2. You should see the Universal AI CS Platform dashboard
3. Try navigating through different sections

#### 5. Authentication Flow
```bash
# Register a new user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## 🔧 Configuration

### Environment Variables
The system uses a `.env` file for configuration. Key variables include:

```env
# Database
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://postgres:password@localhost:5432/universal_ai_cs

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# AI Provider API Keys (Optional)
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
GOOGLE_AI_API_KEY=your-google-ai-api-key-here
```

### AI Provider Setup (Optional)
To test AI features, add your API keys to the `.env` file:

1. **OpenAI**: Get API key from https://platform.openai.com/api-keys
2. **Anthropic**: Get API key from https://console.anthropic.com/
3. **Google AI**: Get API key from https://makersuite.google.com/app/apikey

## 📊 Monitoring and Logs

### View Logs
```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api-gateway
docker-compose logs -f ai-service
docker-compose logs -f message-service
```

### Monitoring Dashboards
- **Grafana**: http://localhost:3001 (admin/admin)
  - Pre-configured dashboards for system metrics
  - Service health monitoring
  - Performance analytics

- **Prometheus**: http://localhost:9090
  - Raw metrics and queries
  - Service discovery status
  - Custom metric exploration

## 🛠️ Troubleshooting

### Common Issues

#### 1. Port Conflicts
If you get port binding errors:
```bash
# Check what's using the ports
netstat -tulpn | grep :3000
# or on Windows
netstat -an | findstr :3000

# Stop conflicting services or change ports in docker-compose.yml
```

#### 2. Docker Issues
```bash
# Restart Docker Desktop
# Or restart Docker daemon on Linux

# Clean up Docker resources
docker system prune -a
docker volume prune
```

#### 3. Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Reset database
docker-compose down -v
docker-compose up -d postgres
```

#### 4. Service Not Starting
```bash
# Check service logs
docker-compose logs [service-name]

# Restart specific service
docker-compose restart [service-name]

# Rebuild service
docker-compose build [service-name]
docker-compose up -d [service-name]
```

### Performance Issues
If the system is slow:
1. Ensure Docker has enough resources (4GB+ RAM recommended)
2. Close unnecessary applications
3. Check system resource usage: `docker stats`

## 🔄 System Management

### Stop the System
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (resets database)
docker-compose down -v
```

### Restart the System
```bash
# Restart all services
docker-compose restart

# Or stop and start
docker-compose down
docker-compose up -d
```

### Update the System
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d
```

## 🎯 What to Test

### Core Functionality
1. **User Registration/Login** - Test authentication flow
2. **Dashboard Access** - Verify frontend loads correctly
3. **API Responses** - Check all health endpoints
4. **Service Communication** - Verify inter-service connectivity

### Advanced Features
1. **Workflow Builder** - Test drag-and-drop interface
2. **Analytics Dashboard** - Check real-time metrics
3. **Chat Widget** - Test embedded widget functionality
4. **AI Processing** - Test message classification (requires API keys)

### Integration Testing
1. **Database Operations** - CRUD operations work
2. **Message Queue** - Messages are processed
3. **Caching** - Redis caching functions
4. **Monitoring** - Metrics are collected

## 📞 Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify all services are running: `docker-compose ps`
3. Test individual service health endpoints
4. Check the troubleshooting section above
5. Review the system requirements

## 🎉 Success Indicators

The system is working correctly when:

- ✅ All services show "Healthy" status
- ✅ Frontend dashboard loads at http://localhost:5173
- ✅ API Gateway responds at http://localhost:3000/health
- ✅ You can register and login users
- ✅ Monitoring dashboards show data
- ✅ No error messages in logs

**Happy testing! 🚀**
