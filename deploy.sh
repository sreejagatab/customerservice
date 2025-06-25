#!/bin/bash

# Universal AI Customer Service Platform - Deployment Script
# Deploys all services with proper configuration and health checks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"localhost:5000"}
VERSION=${VERSION:-"latest"}
NAMESPACE=${NAMESPACE:-"universal-ai-cs"}

# Service configurations
SERVICES=(
    "message-service:3004"
    "integration-service:3002"
    "ai-service:3003"
    "notification-service:3005"
    "admin-service:3001"
)

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for service to be healthy
wait_for_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=1

    print_status "Waiting for $service_name to be healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://localhost:$port/health" >/dev/null 2>&1; then
            print_success "$service_name is healthy"
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts - $service_name not ready yet..."
        sleep 10
        ((attempt++))
    done
    
    print_error "$service_name failed to become healthy after $max_attempts attempts"
    return 1
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check required commands
    local required_commands=("docker" "docker-compose" "node" "npm")
    
    for cmd in "${required_commands[@]}"; do
        if ! command_exists "$cmd"; then
            print_error "$cmd is required but not installed"
            exit 1
        fi
    done
    
    # Check Docker daemon
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js 18+ is required (current: $(node --version))"
        exit 1
    fi
    
    print_success "All prerequisites met"
}

# Function to setup environment
setup_environment() {
    print_status "Setting up environment for $ENVIRONMENT..."
    
    # Create environment file if it doesn't exist
    if [ ! -f ".env.$ENVIRONMENT" ]; then
        print_warning ".env.$ENVIRONMENT not found, creating from template..."
        cp .env.example ".env.$ENVIRONMENT"
        print_warning "Please update .env.$ENVIRONMENT with your configuration"
    fi
    
    # Create necessary directories
    mkdir -p logs
    mkdir -p data/postgres
    mkdir -p data/redis
    mkdir -p uploads
    mkdir -p backups
    
    print_success "Environment setup complete"
}

# Function to build services
build_services() {
    print_status "Building services..."
    
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo $service_config | cut -d':' -f1)
        
        print_status "Building $service_name..."
        
        if [ -d "$service_name" ]; then
            cd "$service_name"
            
            # Install dependencies
            npm ci --only=production
            
            # Build TypeScript
            npm run build
            
            # Build Docker image
            docker build -t "$DOCKER_REGISTRY/$service_name:$VERSION" .
            
            cd ..
            print_success "$service_name built successfully"
        else
            print_warning "$service_name directory not found, skipping..."
        fi
    done
}

# Function to start infrastructure services
start_infrastructure() {
    print_status "Starting infrastructure services..."
    
    # Start PostgreSQL and Redis
    docker-compose -f docker-compose.infrastructure.yml up -d
    
    # Wait for PostgreSQL
    print_status "Waiting for PostgreSQL..."
    while ! docker-compose -f docker-compose.infrastructure.yml exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
        sleep 2
    done
    print_success "PostgreSQL is ready"
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    while ! docker-compose -f docker-compose.infrastructure.yml exec -T redis redis-cli ping >/dev/null 2>&1; do
        sleep 2
    done
    print_success "Redis is ready"
    
    # Start RabbitMQ
    print_status "Waiting for RabbitMQ..."
    while ! docker-compose -f docker-compose.infrastructure.yml exec -T rabbitmq rabbitmqctl status >/dev/null 2>&1; do
        sleep 2
    done
    print_success "RabbitMQ is ready"
}

# Function to run database migrations
run_migrations() {
    print_status "Running database migrations..."
    
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo $service_config | cut -d':' -f1)
        
        if [ -d "$service_name" ] && [ -f "$service_name/package.json" ]; then
            if grep -q "migrate" "$service_name/package.json"; then
                print_status "Running migrations for $service_name..."
                cd "$service_name"
                npm run migrate
                cd ..
                print_success "Migrations completed for $service_name"
            fi
        fi
    done
}

# Function to start application services
start_services() {
    print_status "Starting application services..."
    
    # Start services in dependency order
    local service_order=(
        "ai-service"
        "integration-service"
        "message-service"
        "notification-service"
        "admin-service"
    )
    
    for service_name in "${service_order[@]}"; do
        local port=$(echo "${SERVICES[@]}" | tr ' ' '\n' | grep "$service_name" | cut -d':' -f2)
        
        if [ -d "$service_name" ]; then
            print_status "Starting $service_name..."
            
            # Start service using Docker Compose
            docker-compose -f "docker-compose.$ENVIRONMENT.yml" up -d "$service_name"
            
            # Wait for service to be healthy
            wait_for_service "$service_name" "$port"
        else
            print_warning "$service_name directory not found, skipping..."
        fi
    done
}

# Function to run health checks
run_health_checks() {
    print_status "Running comprehensive health checks..."
    
    local all_healthy=true
    
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo $service_config | cut -d':' -f1)
        local port=$(echo $service_config | cut -d':' -f2)
        
        print_status "Checking $service_name health..."
        
        if curl -f -s "http://localhost:$port/health" >/dev/null 2>&1; then
            local health_response=$(curl -s "http://localhost:$port/health")
            local status=$(echo "$health_response" | jq -r '.status // .data.overall // "unknown"' 2>/dev/null || echo "unknown")
            
            if [ "$status" = "healthy" ] || [ "$status" = "ok" ]; then
                print_success "$service_name is healthy"
            else
                print_warning "$service_name status: $status"
                all_healthy=false
            fi
        else
            print_error "$service_name health check failed"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        print_success "All services are healthy"
    else
        print_warning "Some services may have issues"
    fi
}

# Function to setup monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."
    
    # Start monitoring stack (Prometheus, Grafana, etc.)
    if [ -f "docker-compose.monitoring.yml" ]; then
        docker-compose -f docker-compose.monitoring.yml up -d
        print_success "Monitoring stack started"
        print_status "Grafana available at: http://localhost:3000"
        print_status "Prometheus available at: http://localhost:9090"
    else
        print_warning "Monitoring configuration not found, skipping..."
    fi
}

# Function to display deployment summary
display_summary() {
    print_success "Deployment completed successfully!"
    echo
    echo "=== Service Endpoints ==="
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo $service_config | cut -d':' -f1)
        local port=$(echo $service_config | cut -d':' -f2)
        echo "  $service_name: http://localhost:$port"
    done
    echo
    echo "=== Management URLs ==="
    echo "  Admin Dashboard: http://localhost:3001"
    echo "  API Documentation: http://localhost:3001/docs"
    echo "  Health Status: http://localhost:3001/health"
    echo
    echo "=== Monitoring ==="
    echo "  Grafana: http://localhost:3000 (admin/admin)"
    echo "  Prometheus: http://localhost:9090"
    echo
    echo "=== Logs ==="
    echo "  View logs: docker-compose logs -f [service-name]"
    echo "  All logs: docker-compose logs -f"
    echo
    print_status "Deployment environment: $ENVIRONMENT"
    print_status "Version: $VERSION"
}

# Function to cleanup on failure
cleanup_on_failure() {
    print_error "Deployment failed, cleaning up..."
    
    # Stop all services
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" down
    docker-compose -f docker-compose.infrastructure.yml down
    
    # Remove any dangling containers
    docker container prune -f
    
    print_status "Cleanup completed"
}

# Main deployment function
main() {
    echo "=========================================="
    echo "Universal AI Customer Service Platform"
    echo "Deployment Script"
    echo "=========================================="
    echo
    
    # Set trap for cleanup on failure
    trap cleanup_on_failure ERR
    
    # Deployment steps
    check_prerequisites
    setup_environment
    build_services
    start_infrastructure
    run_migrations
    start_services
    run_health_checks
    setup_monitoring
    display_summary
    
    print_success "Deployment completed successfully!"
}

# Script usage
usage() {
    echo "Usage: $0 [environment]"
    echo
    echo "Environments:"
    echo "  development (default)"
    echo "  staging"
    echo "  production"
    echo
    echo "Environment variables:"
    echo "  DOCKER_REGISTRY - Docker registry URL (default: localhost:5000)"
    echo "  VERSION - Image version tag (default: latest)"
    echo "  NAMESPACE - Kubernetes namespace (default: universal-ai-cs)"
    echo
    echo "Examples:"
    echo "  $0                    # Deploy to development"
    echo "  $0 staging           # Deploy to staging"
    echo "  VERSION=v1.2.3 $0   # Deploy specific version"
}

# Handle script arguments
case "${1:-}" in
    -h|--help)
        usage
        exit 0
        ;;
    development|staging|production)
        main
        ;;
    "")
        main
        ;;
    *)
        print_error "Invalid environment: $1"
        usage
        exit 1
        ;;
esac
