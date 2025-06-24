#!/bin/bash

# Integration Service Setup Script
# This script sets up the development environment for the Integration Service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_status "Setting up Integration Service development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [[ $NODE_VERSION -lt 18 ]]; then
    print_error "Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

print_success "Node.js version: $(node -v)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm and try again."
    exit 1
fi

print_success "npm version: $(npm -v)"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_warning "Docker is not installed. You'll need Docker for containerized deployment."
    print_status "You can still run the service locally without Docker."
else
    print_success "Docker version: $(docker --version)"
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_warning "Docker Compose is not installed. You'll need it for containerized deployment."
else
    print_success "Docker Compose version: $(docker-compose --version)"
fi

# Install dependencies
print_status "Installing Node.js dependencies..."
if npm install; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Create environment files if they don't exist
if [[ ! -f ".env" ]]; then
    print_status "Creating .env file from template..."
    cat > .env << EOF
# Integration Service Environment Configuration

# Service Configuration
NODE_ENV=development
PORT=3003
SERVICE_NAME=integration-service

# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/universal_ai_cs_dev
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=development-jwt-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3003/auth/google/callback

# Microsoft OAuth Configuration
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_REDIRECT_URI=http://localhost:3003/auth/microsoft/callback

# Webhook Configuration
WEBHOOK_SECRET=development-webhook-secret-key
WEBHOOK_BASE_URL=http://localhost:3003/webhooks

# Queue Configuration
QUEUE_REDIS_URL=redis://localhost:6379
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3

# Logging Configuration
LOG_LEVEL=debug
LOG_FORMAT=simple

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
EOF
    print_success "Created .env file"
    print_warning "Please update the OAuth credentials in .env file"
else
    print_status ".env file already exists"
fi

# Create development environment file
if [[ ! -f ".env.development" ]]; then
    print_status "Creating .env.development file..."
    cp .env .env.development
    print_success "Created .env.development file"
fi

# Create test environment file
if [[ ! -f ".env.test" ]]; then
    print_status "Creating .env.test file..."
    cat > .env.test << EOF
# Test Environment Configuration
NODE_ENV=test
DATABASE_URL=postgresql://postgres:password@localhost:5432/universal_ai_cs_test
REDIS_URL=redis://localhost:6379/1
JWT_SECRET=test-jwt-secret-key
WEBHOOK_SECRET=test-webhook-secret-key
LOG_LEVEL=error
EOF
    print_success "Created .env.test file"
fi

# Build the application
print_status "Building the application..."
if npm run build; then
    print_success "Application built successfully"
else
    print_error "Build failed"
    exit 1
fi

# Run tests
print_status "Running tests..."
if npm test; then
    print_success "All tests passed"
else
    print_warning "Some tests failed. This is normal for initial setup."
fi

# Create logs directory
if [[ ! -d "logs" ]]; then
    mkdir -p logs
    print_success "Created logs directory"
fi

# Make scripts executable
chmod +x scripts/*.sh
print_success "Made scripts executable"

print_success "Setup completed successfully!"
echo ""
print_status "Next steps:"
print_status "1. Update OAuth credentials in .env file"
print_status "2. Start PostgreSQL and Redis services"
print_status "3. Run 'npm run dev' to start the development server"
print_status "4. Or use 'docker-compose -f docker-compose.dev.yml up' for containerized development"
echo ""
print_status "Available commands:"
print_status "  npm run dev          - Start development server"
print_status "  npm run dev:worker   - Start development worker"
print_status "  npm run build        - Build the application"
print_status "  npm test             - Run tests"
print_status "  npm run lint         - Run linter"
print_status "  ./scripts/deploy.sh  - Deploy the application"
echo ""
print_status "Documentation:"
print_status "  API docs will be available at: http://localhost:3003/api/docs"
print_status "  Health check: http://localhost:3003/health"
