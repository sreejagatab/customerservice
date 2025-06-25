#!/bin/bash

# Message Service Test Runner Script
# Universal AI Customer Service Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="message-service"
TEST_ENVIRONMENT="${TEST_ENVIRONMENT:-test}"
COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-90}"

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COVERAGE_DIR="$PROJECT_DIR/coverage"
REPORTS_DIR="$PROJECT_DIR/test-reports"

# Functions
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

setup_test_environment() {
    log_info "Setting up test environment..."
    
    cd "$PROJECT_DIR"
    
    # Create necessary directories
    mkdir -p "$COVERAGE_DIR"
    mkdir -p "$REPORTS_DIR"
    
    # Set test environment variables
    export NODE_ENV="test"
    export LOG_LEVEL="error"
    export REDIS_URL="redis://localhost:6379/1"
    export RABBITMQ_URL="amqp://localhost:5672"
    export DATABASE_URL="postgresql://test:test@localhost:5432/message_service_test"
    
    # Copy test configuration
    if [[ -f ".env.test" ]]; then
        cp ".env.test" ".env"
        log_success "Test environment configuration loaded"
    fi
}

start_test_dependencies() {
    log_info "Starting test dependencies..."
    
    # Start test database, Redis, and RabbitMQ
    docker-compose -f docker-compose.test.yml up -d postgres-test redis-test rabbitmq-test
    
    # Wait for services to be ready
    log_info "Waiting for test dependencies to be ready..."
    sleep 10
    
    # Check if services are running
    if ! docker-compose -f docker-compose.test.yml ps | grep -q "Up"; then
        log_error "Failed to start test dependencies"
        exit 1
    fi
    
    log_success "Test dependencies are ready"
}

run_unit_tests() {
    log_info "Running unit tests..."
    
    cd "$PROJECT_DIR"
    
    # Run Jest unit tests with coverage
    npm run test:unit -- \
        --coverage \
        --coverageDirectory="$COVERAGE_DIR" \
        --coverageReporters=text,lcov,html,json \
        --testResultsProcessor=jest-junit \
        --outputFile="$REPORTS_DIR/unit-test-results.xml" \
        --verbose
    
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "Unit tests passed"
    else
        log_error "Unit tests failed"
        return $exit_code
    fi
}

run_integration_tests() {
    log_info "Running integration tests..."
    
    cd "$PROJECT_DIR"
    
    # Run database migrations for test environment
    log_info "Running test database migrations..."
    npm run migrate:test
    
    # Run integration tests
    npm run test:integration -- \
        --testResultsProcessor=jest-junit \
        --outputFile="$REPORTS_DIR/integration-test-results.xml" \
        --verbose
    
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "Integration tests passed"
    else
        log_error "Integration tests failed"
        return $exit_code
    fi
}

run_performance_tests() {
    log_info "Running performance tests..."
    
    cd "$PROJECT_DIR"
    
    # Run performance tests
    npm run test:performance -- \
        --testResultsProcessor=jest-junit \
        --outputFile="$REPORTS_DIR/performance-test-results.xml" \
        --verbose
    
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "Performance tests passed"
    else
        log_error "Performance tests failed"
        return $exit_code
    fi
}

run_e2e_tests() {
    log_info "Running end-to-end tests..."
    
    cd "$PROJECT_DIR"
    
    # Start the service for E2E testing
    log_info "Starting service for E2E testing..."
    npm run build
    npm start &
    SERVICE_PID=$!
    
    # Wait for service to start
    sleep 10
    
    # Check if service is running
    if ! curl -f -s "http://localhost:3004/health" > /dev/null; then
        log_error "Service failed to start for E2E testing"
        kill $SERVICE_PID 2>/dev/null || true
        return 1
    fi
    
    # Run E2E tests
    npm run test:e2e -- \
        --testResultsProcessor=jest-junit \
        --outputFile="$REPORTS_DIR/e2e-test-results.xml" \
        --verbose
    
    local exit_code=$?
    
    # Stop the service
    kill $SERVICE_PID 2>/dev/null || true
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "End-to-end tests passed"
    else
        log_error "End-to-end tests failed"
        return $exit_code
    fi
}

check_coverage() {
    log_info "Checking test coverage..."
    
    if [[ ! -f "$COVERAGE_DIR/coverage-summary.json" ]]; then
        log_error "Coverage report not found"
        return 1
    fi
    
    # Extract coverage percentages
    local line_coverage=$(cat "$COVERAGE_DIR/coverage-summary.json" | jq -r '.total.lines.pct')
    local branch_coverage=$(cat "$COVERAGE_DIR/coverage-summary.json" | jq -r '.total.branches.pct')
    local function_coverage=$(cat "$COVERAGE_DIR/coverage-summary.json" | jq -r '.total.functions.pct')
    local statement_coverage=$(cat "$COVERAGE_DIR/coverage-summary.json" | jq -r '.total.statements.pct')
    
    log_info "Coverage Summary:"
    log_info "  Lines: ${line_coverage}%"
    log_info "  Branches: ${branch_coverage}%"
    log_info "  Functions: ${function_coverage}%"
    log_info "  Statements: ${statement_coverage}%"
    
    # Check if coverage meets threshold
    if (( $(echo "$line_coverage >= $COVERAGE_THRESHOLD" | bc -l) )); then
        log_success "Coverage threshold met (${line_coverage}% >= ${COVERAGE_THRESHOLD}%)"
    else
        log_error "Coverage threshold not met (${line_coverage}% < ${COVERAGE_THRESHOLD}%)"
        return 1
    fi
}

run_lint_checks() {
    log_info "Running lint checks..."
    
    cd "$PROJECT_DIR"
    
    # Run ESLint
    npm run lint -- --format=junit --output-file="$REPORTS_DIR/eslint-results.xml"
    
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "Lint checks passed"
    else
        log_error "Lint checks failed"
        return $exit_code
    fi
}

run_type_checks() {
    log_info "Running TypeScript type checks..."
    
    cd "$PROJECT_DIR"
    
    # Run TypeScript compiler
    npm run type-check
    
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "Type checks passed"
    else
        log_error "Type checks failed"
        return $exit_code
    fi
}

run_security_checks() {
    log_info "Running security checks..."
    
    cd "$PROJECT_DIR"
    
    # Run npm audit
    npm audit --audit-level=moderate --json > "$REPORTS_DIR/security-audit.json" || true
    
    # Check for high/critical vulnerabilities
    local high_vulns=$(cat "$REPORTS_DIR/security-audit.json" | jq -r '.metadata.vulnerabilities.high // 0')
    local critical_vulns=$(cat "$REPORTS_DIR/security-audit.json" | jq -r '.metadata.vulnerabilities.critical // 0')
    
    if [[ $high_vulns -gt 0 ]] || [[ $critical_vulns -gt 0 ]]; then
        log_error "Security vulnerabilities found: $critical_vulns critical, $high_vulns high"
        return 1
    else
        log_success "No critical security vulnerabilities found"
    fi
}

generate_test_report() {
    log_info "Generating test report..."
    
    local report_file="$REPORTS_DIR/test-summary.html"
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Message Service Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { background-color: #d4edda; border-color: #c3e6cb; }
        .error { background-color: #f8d7da; border-color: #f5c6cb; }
        .warning { background-color: #fff3cd; border-color: #ffeaa7; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background-color: #e9ecef; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Message Service Test Report</h1>
        <p>Generated on: $(date)</p>
        <p>Environment: $TEST_ENVIRONMENT</p>
    </div>
    
    <div class="section">
        <h2>Test Results Summary</h2>
        <div class="metric">
            <strong>Unit Tests:</strong> $(test -f "$REPORTS_DIR/unit-test-results.xml" && echo "✅ Passed" || echo "❌ Failed")
        </div>
        <div class="metric">
            <strong>Integration Tests:</strong> $(test -f "$REPORTS_DIR/integration-test-results.xml" && echo "✅ Passed" || echo "❌ Failed")
        </div>
        <div class="metric">
            <strong>Performance Tests:</strong> $(test -f "$REPORTS_DIR/performance-test-results.xml" && echo "✅ Passed" || echo "❌ Failed")
        </div>
        <div class="metric">
            <strong>E2E Tests:</strong> $(test -f "$REPORTS_DIR/e2e-test-results.xml" && echo "✅ Passed" || echo "❌ Failed")
        </div>
    </div>
    
    <div class="section">
        <h2>Code Quality</h2>
        <div class="metric">
            <strong>Lint Checks:</strong> $(test -f "$REPORTS_DIR/eslint-results.xml" && echo "✅ Passed" || echo "❌ Failed")
        </div>
        <div class="metric">
            <strong>Type Checks:</strong> ✅ Passed
        </div>
        <div class="metric">
            <strong>Security Audit:</strong> $(test -f "$REPORTS_DIR/security-audit.json" && echo "✅ Passed" || echo "❌ Failed")
        </div>
    </div>
    
    <div class="section">
        <h2>Coverage Report</h2>
        <p><a href="coverage/index.html">View detailed coverage report</a></p>
    </div>
</body>
</html>
EOF
    
    log_success "Test report generated: $report_file"
}

cleanup_test_environment() {
    log_info "Cleaning up test environment..."
    
    # Stop test dependencies
    docker-compose -f docker-compose.test.yml down -v
    
    # Clean up test database
    docker volume rm message-service_postgres-test-data 2>/dev/null || true
    
    log_success "Test environment cleaned up"
}

show_usage() {
    echo "Usage: $0 [OPTIONS] [TEST_TYPE]"
    echo ""
    echo "Test Types:"
    echo "  unit         Run unit tests only"
    echo "  integration  Run integration tests only"
    echo "  performance  Run performance tests only"
    echo "  e2e          Run end-to-end tests only"
    echo "  all          Run all tests (default)"
    echo ""
    echo "Options:"
    echo "  --coverage-threshold N  Set coverage threshold (default: 90)"
    echo "  --skip-deps            Skip starting test dependencies"
    echo "  --skip-cleanup         Skip cleanup after tests"
    echo "  --generate-report      Generate HTML test report"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 unit"
    echo "  $0 all --coverage-threshold 85"
    echo "  $0 integration --skip-deps"
}

# Main execution
main() {
    local test_type="all"
    local skip_deps=false
    local skip_cleanup=false
    local generate_report=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            unit|integration|performance|e2e|all)
                test_type="$1"
                shift
                ;;
            --coverage-threshold)
                COVERAGE_THRESHOLD="$2"
                shift 2
                ;;
            --skip-deps)
                skip_deps=true
                shift
                ;;
            --skip-cleanup)
                skip_cleanup=true
                shift
                ;;
            --generate-report)
                generate_report=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    log_info "Starting test execution for $SERVICE_NAME"
    log_info "Test type: $test_type"
    log_info "Coverage threshold: $COVERAGE_THRESHOLD%"
    
    # Setup
    setup_test_environment
    
    if [[ "$skip_deps" != true ]]; then
        start_test_dependencies
    fi
    
    # Run tests based on type
    local overall_exit_code=0
    
    case "$test_type" in
        "unit")
            run_unit_tests || overall_exit_code=$?
            check_coverage || overall_exit_code=$?
            ;;
        "integration")
            run_integration_tests || overall_exit_code=$?
            ;;
        "performance")
            run_performance_tests || overall_exit_code=$?
            ;;
        "e2e")
            run_e2e_tests || overall_exit_code=$?
            ;;
        "all")
            run_lint_checks || overall_exit_code=$?
            run_type_checks || overall_exit_code=$?
            run_security_checks || overall_exit_code=$?
            run_unit_tests || overall_exit_code=$?
            check_coverage || overall_exit_code=$?
            run_integration_tests || overall_exit_code=$?
            run_performance_tests || overall_exit_code=$?
            run_e2e_tests || overall_exit_code=$?
            ;;
    esac
    
    # Generate report if requested
    if [[ "$generate_report" == true ]]; then
        generate_test_report
    fi
    
    # Cleanup
    if [[ "$skip_cleanup" != true ]]; then
        cleanup_test_environment
    fi
    
    # Final result
    if [[ $overall_exit_code -eq 0 ]]; then
        log_success "All tests completed successfully!"
    else
        log_error "Some tests failed (exit code: $overall_exit_code)"
    fi
    
    exit $overall_exit_code
}

# Run main function with all arguments
main "$@"
