#!/bin/bash

# Message Service Deployment Script
# Universal AI Customer Service Platform

set -e

# Configuration
SERVICE_NAME="message-service"
DOCKER_IMAGE="universal-ai-cs/message-service"
DOCKER_TAG="${DOCKER_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"
HEALTH_CHECK_URL="http://localhost:3004/health"
MAX_HEALTH_CHECK_ATTEMPTS=30
HEALTH_CHECK_INTERVAL=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is not installed"
        exit 1
    fi
    
    log_success "All dependencies are available"
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."
    
    # Build the image
    docker build -t "${DOCKER_IMAGE}:${DOCKER_TAG}" .
    
    if [ $? -eq 0 ]; then
        log_success "Docker image built successfully"
    else
        log_error "Failed to build Docker image"
        exit 1
    fi
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    # Install dependencies
    npm ci
    
    # Run linting
    npm run lint
    if [ $? -ne 0 ]; then
        log_error "Linting failed"
        exit 1
    fi
    
    # Run type checking
    npm run type-check
    if [ $? -ne 0 ]; then
        log_error "Type checking failed"
        exit 1
    fi
    
    # Run unit tests
    npm run test
    if [ $? -ne 0 ]; then
        log_error "Unit tests failed"
        exit 1
    fi
    
    # Run integration tests
    npm run test:integration
    if [ $? -ne 0 ]; then
        log_error "Integration tests failed"
        exit 1
    fi
    
    log_success "All tests passed"
}

# Stop existing containers
stop_existing() {
    log_info "Stopping existing containers..."
    
    # Stop the service if it's running
    docker-compose -f docker-compose.yml -f docker-compose.${ENVIRONMENT}.yml down
    
    # Remove old containers
    docker container prune -f
    
    log_success "Existing containers stopped"
}

# Deploy the service
deploy_service() {
    log_info "Deploying ${SERVICE_NAME}..."
    
    # Set environment variables
    export DOCKER_TAG
    export ENVIRONMENT
    
    # Start the service
    docker-compose -f docker-compose.yml -f docker-compose.${ENVIRONMENT}.yml up -d
    
    if [ $? -eq 0 ]; then
        log_success "Service deployed successfully"
    else
        log_error "Failed to deploy service"
        exit 1
    fi
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local attempt=1
    
    while [ $attempt -le $MAX_HEALTH_CHECK_ATTEMPTS ]; do
        log_info "Health check attempt $attempt/$MAX_HEALTH_CHECK_ATTEMPTS"
        
        if curl -f -s "$HEALTH_CHECK_URL" > /dev/null; then
            log_success "Service is healthy"
            return 0
        fi
        
        if [ $attempt -eq $MAX_HEALTH_CHECK_ATTEMPTS ]; then
            log_error "Health check failed after $MAX_HEALTH_CHECK_ATTEMPTS attempts"
            return 1
        fi
        
        log_warning "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL}s..."
        sleep $HEALTH_CHECK_INTERVAL
        ((attempt++))
    done
}

# Rollback function
rollback() {
    log_warning "Rolling back deployment..."
    
    # Stop current deployment
    docker-compose -f docker-compose.yml -f docker-compose.${ENVIRONMENT}.yml down
    
    # Start previous version (if available)
    if docker image inspect "${DOCKER_IMAGE}:previous" &> /dev/null; then
        export DOCKER_TAG="previous"
        docker-compose -f docker-compose.yml -f docker-compose.${ENVIRONMENT}.yml up -d
        log_success "Rollback completed"
    else
        log_error "No previous version available for rollback"
        exit 1
    fi
}

# Cleanup old images
cleanup() {
    log_info "Cleaning up old Docker images..."
    
    # Tag current image as previous
    docker tag "${DOCKER_IMAGE}:${DOCKER_TAG}" "${DOCKER_IMAGE}:previous"
    
    # Remove dangling images
    docker image prune -f
    
    log_success "Cleanup completed"
}

# Show service status
show_status() {
    log_info "Service Status:"
    docker-compose -f docker-compose.yml -f docker-compose.${ENVIRONMENT}.yml ps
    
    log_info "Service Logs (last 20 lines):"
    docker-compose -f docker-compose.yml -f docker-compose.${ENVIRONMENT}.yml logs --tail=20 message-service
}

# Main deployment function
main() {
    log_info "Starting deployment of ${SERVICE_NAME} (${ENVIRONMENT})"
    
    # Check dependencies
    check_dependencies
    
    # Run tests (skip in production if specified)
    if [ "${SKIP_TESTS:-false}" != "true" ]; then
        run_tests
    else
        log_warning "Skipping tests (SKIP_TESTS=true)"
    fi
    
    # Build image
    build_image
    
    # Stop existing containers
    stop_existing
    
    # Deploy service
    deploy_service
    
    # Health check
    if health_check; then
        log_success "Deployment completed successfully"
        cleanup
        show_status
    else
        log_error "Deployment failed health check"
        if [ "${AUTO_ROLLBACK:-true}" == "true" ]; then
            rollback
        fi
        exit 1
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback
        ;;
    "status")
        show_status
        ;;
    "health")
        health_check
        ;;
    "cleanup")
        cleanup
        ;;
    "build")
        check_dependencies
        build_image
        ;;
    "test")
        run_tests
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|status|health|cleanup|build|test}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Full deployment (default)"
        echo "  rollback - Rollback to previous version"
        echo "  status   - Show service status"
        echo "  health   - Perform health check"
        echo "  cleanup  - Clean up old Docker images"
        echo "  build    - Build Docker image only"
        echo "  test     - Run tests only"
        echo ""
        echo "Environment Variables:"
        echo "  ENVIRONMENT - Deployment environment (default: production)"
        echo "  DOCKER_TAG  - Docker image tag (default: latest)"
        echo "  SKIP_TESTS  - Skip running tests (default: false)"
        echo "  AUTO_ROLLBACK - Auto rollback on failure (default: true)"
        exit 1
        ;;
esac
