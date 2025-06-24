@echo off
REM Universal AI Customer Service Platform - Windows Startup Script

setlocal enabledelayedexpansion

REM Configuration
set COMPOSE_FILE=docker-compose.yml
set ENV_FILE=.env

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                                                              ║
echo ║        🤖 Universal AI Customer Service Platform 🤖          ║
echo ║                                                              ║
echo ║                    Starting System...                       ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Check if Docker is running
echo [INFO] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)
echo [SUCCESS] Docker is running

REM Check if Docker Compose is available
docker-compose --version >nul 2>&1
if errorlevel 1 (
    docker compose version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Docker Compose is not available.
        pause
        exit /b 1
    )
    set COMPOSE_CMD=docker compose
) else (
    set COMPOSE_CMD=docker-compose
)

REM Create environment file if it doesn't exist
if not exist "%ENV_FILE%" (
    echo [INFO] Creating environment file...
    (
        echo # Universal AI Customer Service Platform Environment Variables
        echo.
        echo # Database
        echo POSTGRES_PASSWORD=password
        echo DATABASE_URL=postgresql://postgres:password@localhost:5432/universal_ai_cs
        echo.
        echo # Redis
        echo REDIS_URL=redis://localhost:6379
        echo.
        echo # JWT
        echo JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
        echo JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
        echo.
        echo # AI Provider API Keys ^(Optional - for testing AI features^)
        echo OPENAI_API_KEY=your-openai-api-key-here
        echo ANTHROPIC_API_KEY=your-anthropic-api-key-here
        echo GOOGLE_AI_API_KEY=your-google-ai-api-key-here
        echo.
        echo # Email ^(for testing^)
        echo SMTP_HOST=mailhog
        echo SMTP_PORT=1025
        echo SMTP_USER=test
        echo SMTP_PASSWORD=test
        echo.
        echo # Environment
        echo NODE_ENV=development
    ) > "%ENV_FILE%"
    echo [SUCCESS] Environment file created: %ENV_FILE%
    echo [WARNING] Please update API keys in %ENV_FILE% for full AI functionality
) else (
    echo [INFO] Environment file already exists: %ENV_FILE%
)

REM Start the system
echo [INFO] Starting Universal AI Customer Service Platform...

REM Pull latest images
echo [INFO] Pulling latest Docker images...
%COMPOSE_CMD% pull

REM Build services
echo [INFO] Building services...
%COMPOSE_CMD% build

REM Start infrastructure services first
echo [INFO] Starting infrastructure services...
%COMPOSE_CMD% up -d postgres redis rabbitmq

REM Wait for infrastructure
echo [INFO] Waiting for infrastructure services to be ready...
timeout /t 15 /nobreak >nul

REM Start application services
echo [INFO] Starting application services...
%COMPOSE_CMD% up -d

REM Wait for services to start
echo [INFO] Waiting for services to start...
timeout /t 20 /nobreak >nul

REM Check service health
echo.
echo 🔍 Service Health Check:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

curl -s -f http://localhost:3000/health >nul 2>&1
if errorlevel 1 (
    echo API Gateway:          ✗ Unhealthy
) else (
    echo API Gateway:          ✓ Healthy
)

curl -s -f http://localhost:3001/health >nul 2>&1
if errorlevel 1 (
    echo Auth Service:         ✗ Unhealthy
) else (
    echo Auth Service:         ✓ Healthy
)

curl -s -f http://localhost:5173 >nul 2>&1
if errorlevel 1 (
    echo Frontend:             ✗ Unhealthy
) else (
    echo Frontend:             ✓ Healthy
)

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo.
echo 🚀 Universal AI Customer Service Platform is Running!
echo.
echo 📱 Main Applications:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🌐 Frontend Dashboard:     http://localhost:5173
echo 🔗 API Gateway:            http://localhost:3000
echo 🔐 Authentication:         http://localhost:3001
echo.
echo 🔧 Development Tools:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 📊 Grafana (Monitoring):   http://localhost:3001 (admin/admin)
echo 📈 Prometheus (Metrics):   http://localhost:9090
echo 🐰 RabbitMQ (Queue):       http://localhost:15672 (guest/guest)
echo 📧 MailHog (Email):        http://localhost:8025
echo.
echo 🔌 API Endpoints:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🔗 Integration Service:    http://localhost:3002
echo 🤖 AI Service:             http://localhost:3003
echo 💬 Message Service:        http://localhost:3004
echo.
echo 📚 Quick Commands:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Health Check:              curl http://localhost:3000/health
echo View Logs:                 docker-compose logs -f [service-name]
echo Stop System:               docker-compose down
echo.
echo 🎉 System startup complete!
echo 💡 Open http://localhost:5173 in your browser to access the dashboard
echo.

REM Show recent logs
echo 📋 Recent Logs:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
%COMPOSE_CMD% logs --tail=3 api-gateway auth-service integration-service ai-service message-service
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo.
echo Press any key to exit...
pause >nul
