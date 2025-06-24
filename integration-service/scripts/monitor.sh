#!/bin/bash

# Integration Service Monitoring Script
# This script monitors the health and performance of the Integration Service

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

# Default values
ENVIRONMENT="production"
WATCH_MODE=false
INTERVAL=30
SERVICE_URL="http://localhost:3003"

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment to monitor [default: production]"
    echo "  -w, --watch              Watch mode (continuous monitoring)"
    echo "  -i, --interval SECONDS   Monitoring interval in watch mode [default: 30]"
    echo "  -u, --url URL            Service URL [default: http://localhost:3003]"
    echo "  -h, --help               Show this help message"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -w|--watch)
            WATCH_MODE=true
            shift
            ;;
        -i|--interval)
            INTERVAL="$2"
            shift 2
            ;;
        -u|--url)
            SERVICE_URL="$2"
            shift 2
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

# Function to check service health
check_health() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "=== Health Check at $timestamp ==="
    
    # Basic health check
    if curl -s -f "$SERVICE_URL/health" > /dev/null; then
        print_success "Service is responding"
        
        # Get detailed health information
        local health_response=$(curl -s "$SERVICE_URL/health/detailed")
        echo "$health_response" | jq '.' 2>/dev/null || echo "$health_response"
        
    else
        print_error "Service is not responding"
        return 1
    fi
    
    echo ""
}

# Function to check queue statistics
check_queues() {
    echo "=== Queue Statistics ==="
    
    local queue_response=$(curl -s "$SERVICE_URL/health/queue-stats" 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        echo "$queue_response" | jq '.' 2>/dev/null || echo "$queue_response"
    else
        print_warning "Could not retrieve queue statistics"
    fi
    
    echo ""
}

# Function to check integration statistics
check_integrations() {
    echo "=== Integration Statistics ==="
    
    local integration_response=$(curl -s "$SERVICE_URL/health/integration-stats" 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        echo "$integration_response" | jq '.' 2>/dev/null || echo "$integration_response"
    else
        print_warning "Could not retrieve integration statistics"
    fi
    
    echo ""
}

# Function to check Docker containers (if running in Docker)
check_containers() {
    echo "=== Container Status ==="
    
    local compose_file="docker-compose.yml"
    if [[ "$ENVIRONMENT" == "development" ]]; then
        compose_file="docker-compose.dev.yml"
    fi
    
    if [[ -f "$compose_file" ]]; then
        if command -v docker-compose &> /dev/null; then
            docker-compose -f "$compose_file" ps
        else
            print_warning "docker-compose not available"
        fi
    else
        print_warning "Docker Compose file not found"
    fi
    
    echo ""
}

# Function to check system resources
check_resources() {
    echo "=== System Resources ==="
    
    # Memory usage
    echo "Memory Usage:"
    free -h | grep -E "Mem|Swap"
    
    echo ""
    
    # Disk usage
    echo "Disk Usage:"
    df -h | grep -E "/$|/var|/tmp"
    
    echo ""
    
    # Load average
    echo "Load Average:"
    uptime
    
    echo ""
}

# Function to check logs for errors
check_logs() {
    echo "=== Recent Errors ==="
    
    local compose_file="docker-compose.yml"
    if [[ "$ENVIRONMENT" == "development" ]]; then
        compose_file="docker-compose.dev.yml"
    fi
    
    if [[ -f "$compose_file" ]] && command -v docker-compose &> /dev/null; then
        # Check for errors in the last 100 lines
        local errors=$(docker-compose -f "$compose_file" logs --tail=100 integration-api 2>/dev/null | grep -i error | tail -5)
        if [[ -n "$errors" ]]; then
            echo "$errors"
        else
            print_success "No recent errors found"
        fi
    else
        # Check local log files
        if [[ -d "logs" ]]; then
            local errors=$(tail -100 logs/*.log 2>/dev/null | grep -i error | tail -5)
            if [[ -n "$errors" ]]; then
                echo "$errors"
            else
                print_success "No recent errors found"
            fi
        else
            print_warning "No log files found"
        fi
    fi
    
    echo ""
}

# Function to perform full monitoring check
perform_monitoring() {
    clear
    echo "Integration Service Monitoring - Environment: $ENVIRONMENT"
    echo "============================================================"
    echo ""
    
    check_health
    check_queues
    check_integrations
    check_containers
    check_resources
    check_logs
    
    echo "============================================================"
    
    if [[ "$WATCH_MODE" == true ]]; then
        echo "Next check in $INTERVAL seconds... (Press Ctrl+C to stop)"
    fi
}

# Function to setup monitoring alerts
setup_alerts() {
    echo "=== Setting up monitoring alerts ==="
    
    # Create a simple monitoring script that can be run via cron
    cat > monitor_alerts.sh << 'EOF'
#!/bin/bash
# Simple monitoring alerts for Integration Service

SERVICE_URL="http://localhost:3003"
ALERT_EMAIL="admin@example.com"

# Check if service is responding
if ! curl -s -f "$SERVICE_URL/health" > /dev/null; then
    echo "ALERT: Integration Service is down at $(date)" | mail -s "Integration Service Alert" "$ALERT_EMAIL"
fi

# Check for high error rate
error_count=$(curl -s "$SERVICE_URL/health/detailed" | jq '.checks.database' 2>/dev/null)
if [[ "$error_count" == "false" ]]; then
    echo "ALERT: Database connection failed at $(date)" | mail -s "Integration Service Database Alert" "$ALERT_EMAIL"
fi
EOF
    
    chmod +x monitor_alerts.sh
    print_success "Created monitor_alerts.sh"
    print_status "Add this to crontab for automated monitoring:"
    print_status "*/5 * * * * /path/to/monitor_alerts.sh"
}

# Main execution
print_status "Starting Integration Service monitoring..."
print_status "Environment: $ENVIRONMENT"
print_status "Service URL: $SERVICE_URL"

if [[ "$WATCH_MODE" == true ]]; then
    print_status "Watch mode enabled (interval: ${INTERVAL}s)"
    
    # Trap Ctrl+C to exit gracefully
    trap 'echo ""; print_status "Monitoring stopped."; exit 0' INT
    
    while true; do
        perform_monitoring
        sleep "$INTERVAL"
    done
else
    perform_monitoring
fi
