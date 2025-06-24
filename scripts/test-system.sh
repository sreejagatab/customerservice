#!/bin/bash

# Universal AI Customer Service Platform - System Testing Script
# Comprehensive testing of all system components

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:5173"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    ((TESTS_PASSED++))
    TEST_RESULTS+=("✓ $1")
}

failure() {
    echo -e "${RED}[FAILURE]${NC} $1"
    ((TESTS_FAILED++))
    TEST_RESULTS+=("✗ $1")
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

# Test function wrapper
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    printf "%-50s " "$test_name:"
    
    if eval "$test_command" &>/dev/null; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        TEST_RESULTS+=("✓ $test_name")
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
        TEST_RESULTS+=("✗ $test_name")
    fi
}

# Banner
show_banner() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        🧪 Universal AI CS Platform - System Tests 🧪        ║"
    echo "║                                                              ║"
    echo "║                  Testing All Components...                   ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Test infrastructure services
test_infrastructure() {
    echo ""
    echo -e "${CYAN}🏗️  Testing Infrastructure Services:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    run_test "PostgreSQL Database" "docker exec universal-ai-cs-postgres pg_isready -U postgres"
    run_test "Redis Cache" "docker exec universal-ai-cs-redis redis-cli ping"
    run_test "RabbitMQ Message Queue" "curl -s http://localhost:15672/api/overview -u guest:guest"
    run_test "Prometheus Metrics" "curl -s http://localhost:9090/-/healthy"
    run_test "Grafana Dashboard" "curl -s http://localhost:3001/api/health"
}

# Test application services
test_application_services() {
    echo ""
    echo -e "${CYAN}🚀 Testing Application Services:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    run_test "API Gateway Health" "curl -s http://localhost:3000/health"
    run_test "Auth Service Health" "curl -s http://localhost:3001/health"
    run_test "Integration Service Health" "curl -s http://localhost:3002/health"
    run_test "AI Service Health" "curl -s http://localhost:3003/health"
    run_test "Message Service Health" "curl -s http://localhost:3004/health"
    run_test "Frontend Application" "curl -s http://localhost:5173"
}

# Test API endpoints
test_api_endpoints() {
    echo ""
    echo -e "${CYAN}🔌 Testing API Endpoints:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test service discovery
    run_test "Service Discovery" "curl -s ${BASE_URL}/services | jq -e '.success'"
    
    # Test API documentation
    run_test "API Documentation" "curl -s ${BASE_URL}/docs"
    
    # Test metrics endpoint
    run_test "Metrics Endpoint" "curl -s ${BASE_URL}/metrics"
    
    # Test CORS headers
    run_test "CORS Headers" "curl -s -H 'Origin: http://localhost:3000' ${BASE_URL}/health | grep -i 'access-control'"
}

# Test authentication flow
test_authentication() {
    echo ""
    echo -e "${CYAN}🔐 Testing Authentication Flow:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test registration endpoint
    run_test "Registration Endpoint" "curl -s -X POST ${BASE_URL}/api/v1/auth/register -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\",\"password\":\"password123\",\"name\":\"Test User\"}'"
    
    # Test login endpoint
    run_test "Login Endpoint" "curl -s -X POST ${BASE_URL}/api/v1/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\",\"password\":\"password123\"}'"
    
    # Test protected route (should fail without token)
    run_test "Protected Route (No Token)" "! curl -s ${BASE_URL}/api/v1/conversations | jq -e '.success'"
}

# Test message processing
test_message_processing() {
    echo ""
    echo -e "${CYAN}💬 Testing Message Processing:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test message service health
    run_test "Message Service Ready" "curl -s http://localhost:3004/health | jq -e '.status == \"healthy\"'"
    
    # Test message queue connection
    run_test "Message Queue Connection" "curl -s http://localhost:15672/api/queues -u guest:guest | jq -e 'length >= 0'"
}

# Test AI services
test_ai_services() {
    echo ""
    echo -e "${CYAN}🤖 Testing AI Services:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test AI service health
    run_test "AI Service Ready" "curl -s http://localhost:3003/health | jq -e '.status == \"healthy\"'"
    
    # Test AI providers endpoint
    run_test "AI Providers Endpoint" "curl -s http://localhost:3003/api/v1/providers"
    
    # Test classification endpoint (without API key)
    run_test "Classification Endpoint" "curl -s -X POST http://localhost:3003/api/v1/classify -H 'Content-Type: application/json' -d '{\"text\":\"Hello, I need help\"}'"
}

# Test integrations
test_integrations() {
    echo ""
    echo -e "${CYAN}🔗 Testing Integration Services:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test integration service health
    run_test "Integration Service Ready" "curl -s http://localhost:3002/health | jq -e '.status == \"healthy\"'"
    
    # Test available integrations
    run_test "Available Integrations" "curl -s http://localhost:3002/api/v1/integrations"
    
    # Test webhook endpoint
    run_test "Webhook Endpoint" "curl -s -X POST http://localhost:3002/api/v1/webhooks/test -H 'Content-Type: application/json' -d '{\"test\":true}'"
}

# Test frontend application
test_frontend() {
    echo ""
    echo -e "${CYAN}🌐 Testing Frontend Application:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test frontend accessibility
    run_test "Frontend Accessible" "curl -s ${FRONTEND_URL}"
    
    # Test static assets
    run_test "Static Assets" "curl -s ${FRONTEND_URL}/vite.svg"
    
    # Test API connectivity from frontend
    run_test "Frontend API Config" "curl -s ${FRONTEND_URL} | grep -i 'vite'"
}

# Test performance
test_performance() {
    echo ""
    echo -e "${CYAN}⚡ Testing Performance:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test response times
    local start_time=$(date +%s%N)
    curl -s ${BASE_URL}/health > /dev/null
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [ $response_time -lt 500 ]; then
        success "API Response Time: ${response_time}ms (< 500ms)"
    else
        failure "API Response Time: ${response_time}ms (>= 500ms)"
    fi
    
    # Test concurrent requests
    run_test "Concurrent Requests" "for i in {1..10}; do curl -s ${BASE_URL}/health & done; wait"
}

# Test monitoring and observability
test_monitoring() {
    echo ""
    echo -e "${CYAN}📊 Testing Monitoring & Observability:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test Prometheus metrics
    run_test "Prometheus Metrics" "curl -s http://localhost:9090/api/v1/query?query=up | jq -e '.status == \"success\"'"
    
    # Test Grafana API
    run_test "Grafana API" "curl -s http://admin:admin@localhost:3001/api/health | jq -e '.database == \"ok\"'"
    
    # Test application metrics
    run_test "Application Metrics" "curl -s ${BASE_URL}/metrics | grep -E '(http_requests|response_time)'"
}

# Generate test report
generate_report() {
    echo ""
    echo -e "${PURPLE}📋 Test Report Summary:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
    echo -e "${GREEN}Passed: ${TESTS_PASSED}${NC}"
    echo -e "${RED}Failed: ${TESTS_FAILED}${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! System is healthy.${NC}"
    else
        echo -e "${YELLOW}⚠️  Some tests failed. Check the details above.${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}📝 Detailed Results:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for result in "${TEST_RESULTS[@]}"; do
        echo "  $result"
    done
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main execution
main() {
    show_banner
    
    # Check if jq is available for JSON parsing
    if ! command -v jq &> /dev/null; then
        log "Installing jq for JSON parsing..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y jq
        elif command -v brew &> /dev/null; then
            brew install jq
        else
            info "jq not available. Some tests may not work properly."
        fi
    fi
    
    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 5
    
    # Run all test suites
    test_infrastructure
    test_application_services
    test_api_endpoints
    test_authentication
    test_message_processing
    test_ai_services
    test_integrations
    test_frontend
    test_performance
    test_monitoring
    
    # Generate report
    generate_report
    
    # Exit with appropriate code
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"
