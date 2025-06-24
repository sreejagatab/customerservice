#!/bin/bash

# Production Rollback Script for Universal AI Customer Service Platform
# Quickly rollback to previous stable version in case of deployment issues

set -e  # Exit on any error

# Configuration
CLUSTER_NAME="universal-ai-cs-production"
REGION="us-east-1"
ROLLBACK_TIMEOUT=300  # 5 minutes
HEALTH_CHECK_RETRIES=20
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

# Get deployment history
get_deployment_history() {
    log_info "Getting deployment history..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        log_info "Getting deployment history for $service..."
        
        # Get service deployments
        deployments=$(aws ecs describe-services \
            --cluster $CLUSTER_NAME \
            --services $service \
            --region $REGION \
            --query 'services[0].deployments' \
            --output json)
        
        # Find the previous stable deployment
        previous_task_def=$(echo "$deployments" | jq -r '
            map(select(.status == "PRIMARY" and .rolloutState == "COMPLETED")) |
            sort_by(.createdAt) | reverse | .[1].taskDefinition // empty
        ')
        
        if [[ -n "$previous_task_def" && "$previous_task_def" != "null" ]]; then
            log_info "Previous stable task definition for $service: $previous_task_def"
            eval "previous_${service//-/_}_task_def=$previous_task_def"
        else
            log_warning "No previous stable deployment found for $service"
        fi
    done
}

# Rollback services
rollback_services() {
    log_info "Starting rollback process..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    rollback_initiated=false
    
    for service in "${services[@]}"; do
        previous_task_def_var="previous_${service//-/_}_task_def"
        previous_task_def="${!previous_task_def_var}"
        
        if [[ -n "$previous_task_def" && "$previous_task_def" != "null" ]]; then
            log_info "Rolling back $service to $previous_task_def"
            
            # Update ECS service to previous task definition
            aws ecs update-service \
                --cluster $CLUSTER_NAME \
                --service $service \
                --task-definition $previous_task_def \
                --region $REGION \
                --query 'service.serviceName' \
                --output text
            
            log_success "Rollback initiated for $service"
            rollback_initiated=true
        else
            log_warning "Cannot rollback $service - no previous stable version found"
        fi
    done
    
    if [[ "$rollback_initiated" == "false" ]]; then
        log_error "No services could be rolled back"
        exit 1
    fi
}

# Wait for rollback to complete
wait_for_rollback() {
    log_info "Waiting for rollback to complete..."
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        previous_task_def_var="previous_${service//-/_}_task_def"
        previous_task_def="${!previous_task_def_var}"
        
        if [[ -n "$previous_task_def" && "$previous_task_def" != "null" ]]; then
            log_info "Waiting for $service rollback to stabilize..."
            
            # Wait for service to reach steady state
            timeout $ROLLBACK_TIMEOUT aws ecs wait services-stable \
                --cluster $CLUSTER_NAME \
                --services $service \
                --region $REGION
            
            if [[ $? -eq 0 ]]; then
                log_success "$service rollback completed successfully"
            else
                log_error "$service rollback failed or timed out"
                return 1
            fi
        fi
    done
    
    log_success "All service rollbacks completed successfully"
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

# Verify rollback success
verify_rollback() {
    log_info "Verifying rollback success..."
    
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
    
    # Health check main endpoint
    health_check "https://$ALB_URL" "API Gateway"
    
    # Test critical endpoints
    log_info "Testing critical endpoints..."
    
    # Test health endpoint
    health_response=$(curl -s -o /dev/null -w "%{http_code}" "https://$ALB_URL/health")
    
    if [[ "$health_response" == "200" ]]; then
        log_success "Health endpoint responding correctly"
    else
        log_error "Health endpoint not responding correctly (got $health_response)"
        return 1
    fi
    
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
    
    log_success "Rollback verification completed successfully"
}

# Create rollback report
create_rollback_report() {
    log_info "Creating rollback report..."
    
    report_file="/tmp/rollback-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "rollback_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cluster": "$CLUSTER_NAME",
  "region": "$REGION",
  "services_rolled_back": [
EOF

    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    first=true
    
    for service in "${services[@]}"; do
        previous_task_def_var="previous_${service//-/_}_task_def"
        previous_task_def="${!previous_task_def_var}"
        
        if [[ -n "$previous_task_def" && "$previous_task_def" != "null" ]]; then
            if [[ "$first" == "false" ]]; then
                echo "," >> "$report_file"
            fi
            
            cat >> "$report_file" << EOF
    {
      "service": "$service",
      "rolled_back_to": "$previous_task_def",
      "status": "success"
    }
EOF
            first=false
        fi
    done
    
    cat >> "$report_file" << EOF
  ],
  "verification_status": "passed",
  "rollback_duration": "$(date +%s) seconds"
}
EOF

    log_info "Rollback report created: $report_file"
    
    # Display report summary
    echo
    log_info "=== ROLLBACK SUMMARY ==="
    cat "$report_file" | jq '.'
}

# Send notifications
send_notifications() {
    log_info "Sending rollback notifications..."
    
    # Slack notification
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"⚠️ Production rollback completed successfully. System restored to previous stable version."}' \
            "$SLACK_WEBHOOK_URL"
    fi
    
    # Email notification (if configured)
    if [[ -n "$NOTIFICATION_EMAIL" ]]; then
        echo "Production rollback completed at $(date)" | \
        mail -s "Production Rollback Notification" "$NOTIFICATION_EMAIL"
    fi
}

# Emergency stop all services
emergency_stop() {
    log_error "Emergency stop initiated - scaling down all services"
    
    services=("api-gateway" "ai-service" "integration-service" "analytics-service" "workflow-service")
    
    for service in "${services[@]}"; do
        log_info "Scaling down $service to 0 tasks"
        
        aws ecs update-service \
            --cluster $CLUSTER_NAME \
            --service $service \
            --desired-count 0 \
            --region $REGION \
            --query 'service.serviceName' \
            --output text
    done
    
    log_warning "All services scaled down to 0. Manual intervention required."
}

# Main rollback function
main() {
    local rollback_type="${1:-auto}"
    
    log_info "Starting production rollback for Universal AI Customer Service Platform"
    log_info "Rollback type: $rollback_type"
    log_info "Cluster: $CLUSTER_NAME"
    log_info "Region: $REGION"
    
    case "$rollback_type" in
        "auto"|"")
            # Automatic rollback to previous version
            get_deployment_history
            rollback_services
            
            if wait_for_rollback; then
                if verify_rollback; then
                    log_success "🔄 Production rollback completed successfully!"
                    create_rollback_report
                    send_notifications
                    exit 0
                else
                    log_error "Rollback verification failed"
                    exit 1
                fi
            else
                log_error "Rollback failed"
                exit 1
            fi
            ;;
        "emergency")
            # Emergency stop - scale down all services
            emergency_stop
            exit 0
            ;;
        "manual")
            # Manual rollback with user confirmation
            echo "Manual rollback mode - please confirm the following actions:"
            get_deployment_history
            
            read -p "Proceed with rollback? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                rollback_services
                wait_for_rollback
                verify_rollback
                create_rollback_report
                send_notifications
            else
                log_info "Rollback cancelled by user"
                exit 0
            fi
            ;;
        *)
            log_error "Invalid rollback type: $rollback_type"
            log_info "Usage: $0 [auto|manual|emergency]"
            exit 1
            ;;
    esac
}

# Handle script interruption
trap 'log_error "Rollback interrupted"; exit 1' INT TERM

# Run main function
main "$@"
