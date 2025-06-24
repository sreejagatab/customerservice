#!/bin/bash

# Production Deployment Script for Universal AI Customer Service Platform
# Implements Blue-Green deployment strategy with health checks and rollback capability

set -e  # Exit on any error

# Configuration
CLUSTER_NAME="universal-ai-cs-production"
REGION="us-east-1"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DEPLOYMENT_TIMEOUT=600  # 10 minutes
HEALTH_CHECK_RETRIES=30
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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check required environment variables
    required_vars=("AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" "DATABASE_URL" "REDIS_URL" "JWT_SECRET")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    log_success "Prerequisites check passed"
}

# Get current ECS service configuration
get_current_services() {
    log_info "Getting current ECS service configuration..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        current_task_def=$(aws ecs describe-services \
            --cluster $CLUSTER_NAME \
            --services $service \
            --region $REGION \
            --query 'services[0].taskDefinition' \
            --output text)
        
        if [[ "$current_task_def" == "None" ]]; then
            log_warning "Service $service not found in cluster"
        else
            log_info "Current task definition for $service: $current_task_def"
            eval "current_${service//-/_}_task_def=$current_task_def"
        fi
    done
}

# Update task definitions with new image tags
update_task_definitions() {
    log_info "Updating task definitions with new image tags..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        log_info "Updating task definition for $service..."
        
        # Get current task definition
        current_task_def_var="current_${service//-/_}_task_def"
        current_task_def="${!current_task_def_var}"
        
        if [[ -z "$current_task_def" || "$current_task_def" == "None" ]]; then
            log_warning "Skipping $service - no current task definition found"
            continue
        fi
        
        # Download current task definition
        aws ecs describe-task-definition \
            --task-definition $current_task_def \
            --region $REGION \
            --query 'taskDefinition' > /tmp/${service}-task-def.json
        
        # Update image tag in task definition
        new_image="ghcr.io/universal-ai-cs/${service}:${IMAGE_TAG}"
        
        # Create new task definition with updated image
        jq --arg image "$new_image" \
           '.containerDefinitions[0].image = $image | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .placementConstraints, .compatibilities, .registeredAt, .registeredBy)' \
           /tmp/${service}-task-def.json > /tmp/${service}-new-task-def.json
        
        # Register new task definition
        new_task_def_arn=$(aws ecs register-task-definition \
            --cli-input-json file:///tmp/${service}-new-task-def.json \
            --region $REGION \
            --query 'taskDefinition.taskDefinitionArn' \
            --output text)
        
        log_success "New task definition registered for $service: $new_task_def_arn"
        eval "new_${service//-/_}_task_def=$new_task_def_arn"
    done
}

# Deploy services with blue-green strategy
deploy_services() {
    log_info "Starting blue-green deployment..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        new_task_def_var="new_${service//-/_}_task_def"
        new_task_def="${!new_task_def_var}"
        
        if [[ -z "$new_task_def" ]]; then
            log_warning "Skipping deployment for $service - no new task definition"
            continue
        fi
        
        log_info "Deploying $service with task definition: $new_task_def"
        
        # Update ECS service
        aws ecs update-service \
            --cluster $CLUSTER_NAME \
            --service $service \
            --task-definition $new_task_def \
            --region $REGION \
            --query 'service.serviceName' \
            --output text
        
        log_success "Service $service deployment initiated"
    done
}

# Wait for deployment to complete
wait_for_deployment() {
    log_info "Waiting for deployment to complete..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        log_info "Waiting for $service deployment to stabilize..."
        
        # Wait for service to reach steady state
        aws ecs wait services-stable \
            --cluster $CLUSTER_NAME \
            --services $service \
            --region $REGION \
            --cli-read-timeout $DEPLOYMENT_TIMEOUT \
            --cli-connect-timeout 60
        
        if [[ $? -eq 0 ]]; then
            log_success "$service deployment completed successfully"
        else
            log_error "$service deployment failed or timed out"
            return 1
        fi
    done
    
    log_success "All services deployed successfully"
}

# Health check function
health_check() {
    local service_url=$1
    local service_name=$2
    
    log_info "Performing health check for $service_name..."
    
    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        if curl -f -s "$service_url/health" > /dev/null; then
            log_success "$service_name health check passed"
            return 0
        else
            log_warning "$service_name health check failed (attempt $i/$HEALTH_CHECK_RETRIES)"
            sleep $HEALTH_CHECK_INTERVAL
        fi
    done
    
    log_error "$service_name health check failed after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

# Comprehensive health checks
run_health_checks() {
    log_info "Running comprehensive health checks..."
    
    # Get load balancer URL
    ALB_URL=$(aws elbv2 describe-load-balancers \
        --names universal-ai-cs-production \
        --region $REGION \
        --query 'LoadBalancers[0].DNSName' \
        --output text)
    
    if [[ "$ALB_URL" == "None" ]]; then
        log_error "Load balancer not found"
        return 1
    fi
    
    # Health check endpoints
    health_check "https://$ALB_URL" "API Gateway"
    
    # Additional smoke tests
    log_info "Running smoke tests..."
    
    # Test authentication endpoint
    auth_response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "https://$ALB_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"invalid"}')
    
    if [[ "$auth_response" == "401" ]]; then
        log_success "Authentication endpoint responding correctly"
    else
        log_error "Authentication endpoint not responding correctly (got $auth_response)"
        return 1
    fi
    
    # Test health endpoint
    health_response=$(curl -s -o /dev/null -w "%{http_code}" "https://$ALB_URL/health")
    
    if [[ "$health_response" == "200" ]]; then
        log_success "Health endpoint responding correctly"
    else
        log_error "Health endpoint not responding correctly (got $health_response)"
        return 1
    fi
    
    log_success "All health checks passed"
}

# Rollback function
rollback_deployment() {
    log_error "Deployment failed, initiating rollback..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        current_task_def_var="current_${service//-/_}_task_def"
        current_task_def="${!current_task_def_var}"
        
        if [[ -n "$current_task_def" && "$current_task_def" != "None" ]]; then
            log_info "Rolling back $service to $current_task_def"
            
            aws ecs update-service \
                --cluster $CLUSTER_NAME \
                --service $service \
                --task-definition $current_task_def \
                --region $REGION \
                --query 'service.serviceName' \
                --output text
        fi
    done
    
    log_info "Rollback initiated for all services"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/*-task-def.json /tmp/*-new-task-def.json
}

# Main deployment function
main() {
    log_info "Starting production deployment for Universal AI Customer Service Platform"
    log_info "Image tag: $IMAGE_TAG"
    log_info "Cluster: $CLUSTER_NAME"
    log_info "Region: $REGION"
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Execute deployment steps
    check_prerequisites
    get_current_services
    update_task_definitions
    deploy_services
    
    if wait_for_deployment; then
        if run_health_checks; then
            log_success "🚀 Production deployment completed successfully!"
            log_info "Services are now running with image tag: $IMAGE_TAG"
            
            # Send success notification
            if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
                curl -X POST -H 'Content-type: application/json' \
                    --data '{"text":"🚀 Production deployment successful! Image tag: '${IMAGE_TAG}'"}' \
                    "$SLACK_WEBHOOK_URL"
            fi
            
            exit 0
        else
            log_error "Health checks failed"
            rollback_deployment
            exit 1
        fi
    else
        log_error "Deployment failed"
        rollback_deployment
        exit 1
    fi
}

# Run main function
main "$@"
