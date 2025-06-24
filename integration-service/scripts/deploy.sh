#!/bin/bash

# Integration Service Deployment Script
# This script handles deployment of the Integration Service to various environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="production"
BUILD_ONLY=false
SKIP_TESTS=false
SKIP_BUILD=false
FORCE_DEPLOY=false

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

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Target environment (development|staging|production) [default: production]"
    echo "  -b, --build-only         Only build the application, don't deploy"
    echo "  -s, --skip-tests         Skip running tests"
    echo "  -n, --skip-build         Skip building the application"
    echo "  -f, --force              Force deployment without confirmation"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e development        Deploy to development environment"
    echo "  $0 -b                    Build only, don't deploy"
    echo "  $0 -f -e production      Force deploy to production"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -b|--build-only)
            BUILD_ONLY=true
            shift
            ;;
        -s|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -n|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -f|--force)
            FORCE_DEPLOY=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Valid environments: development, staging, production"
    exit 1
fi

print_status "Starting deployment for environment: $ENVIRONMENT"

# Check if required files exist
if [[ ! -f "package.json" ]]; then
    print_error "package.json not found. Are you in the correct directory?"
    exit 1
fi

if [[ ! -f "Dockerfile" ]]; then
    print_error "Dockerfile not found. Cannot build container."
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed. Please install it and try again."
    exit 1
fi

# Load environment variables
ENV_FILE=".env"
if [[ "$ENVIRONMENT" != "production" ]]; then
    ENV_FILE=".env.$ENVIRONMENT"
fi

if [[ -f "$ENV_FILE" ]]; then
    print_status "Loading environment variables from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
else
    print_warning "Environment file $ENV_FILE not found. Using default values."
fi

# Run tests (unless skipped)
if [[ "$SKIP_TESTS" == false ]]; then
    print_status "Running tests..."
    if npm test; then
        print_success "All tests passed"
    else
        print_error "Tests failed. Deployment aborted."
        exit 1
    fi
fi

# Build application (unless skipped)
if [[ "$SKIP_BUILD" == false ]]; then
    print_status "Building application..."
    if npm run build; then
        print_success "Build completed successfully"
    else
        print_error "Build failed. Deployment aborted."
        exit 1
    fi
fi

# If build-only mode, exit here
if [[ "$BUILD_ONLY" == true ]]; then
    print_success "Build completed. Exiting (build-only mode)."
    exit 0
fi

# Deployment confirmation
if [[ "$FORCE_DEPLOY" == false ]]; then
    echo ""
    print_warning "You are about to deploy to: $ENVIRONMENT"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Deployment cancelled."
        exit 0
    fi
fi

# Choose Docker Compose file based on environment
COMPOSE_FILE="docker-compose.yml"
if [[ "$ENVIRONMENT" == "development" ]]; then
    COMPOSE_FILE="docker-compose.dev.yml"
fi

print_status "Using Docker Compose file: $COMPOSE_FILE"

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f "$COMPOSE_FILE" down

# Build and start containers
print_status "Building and starting containers..."
if docker-compose -f "$COMPOSE_FILE" up -d --build; then
    print_success "Containers started successfully"
else
    print_error "Failed to start containers"
    exit 1
fi

# Wait for services to be healthy
print_status "Waiting for services to be healthy..."
sleep 10

# Check service health
print_status "Checking service health..."
if curl -f http://localhost:3003/health > /dev/null 2>&1; then
    print_success "Integration Service is healthy"
else
    print_error "Integration Service health check failed"
    print_status "Checking container logs..."
    docker-compose -f "$COMPOSE_FILE" logs integration-api
    exit 1
fi

# Show deployment status
print_status "Deployment Status:"
docker-compose -f "$COMPOSE_FILE" ps

print_success "Deployment completed successfully!"
print_status "Integration Service is running at: http://localhost:3003"

if [[ "$ENVIRONMENT" == "development" ]]; then
    print_status "Development tools:"
    print_status "  - pgAdmin: http://localhost:8080 (admin@example.com / admin)"
    print_status "  - Redis Commander: http://localhost:8081"
    print_status "  - Mailhog: http://localhost:8025"
fi

print_status "To view logs: docker-compose -f $COMPOSE_FILE logs -f"
print_status "To stop services: docker-compose -f $COMPOSE_FILE down"
