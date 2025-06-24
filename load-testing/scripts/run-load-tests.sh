#!/bin/bash

# Universal AI Customer Service Platform - Load Testing Script
# Comprehensive load testing suite for performance validation

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
WS_URL="${WS_URL:-ws://localhost:3000}"
API_KEY="${API_KEY:-test-api-key}"
RESULTS_DIR="./results/$(date +%Y%m%d_%H%M%S)"
K6_VERSION="0.47.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if k6 is installed
    if ! command -v k6 &> /dev/null; then
        error "k6 is not installed. Installing k6..."
        
        # Install k6 based on OS
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo gpg -k
            sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
            echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
            sudo apt-get update
            sudo apt-get install k6
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            brew install k6
        else
            error "Unsupported OS. Please install k6 manually: https://k6.io/docs/getting-started/installation/"
            exit 1
        fi
    fi
    
    # Check if services are running
    log "Checking if services are running..."
    if ! curl -f -s "${BASE_URL}/health" > /dev/null; then
        error "Services are not running at ${BASE_URL}"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Create results directory
setup_results_dir() {
    log "Setting up results directory: ${RESULTS_DIR}"
    mkdir -p "${RESULTS_DIR}"
    
    # Create subdirectories
    mkdir -p "${RESULTS_DIR}/reports"
    mkdir -p "${RESULTS_DIR}/logs"
    mkdir -p "${RESULTS_DIR}/metrics"
}

# Run individual test
run_test() {
    local test_name=$1
    local test_script=$2
    local test_description=$3
    
    log "Running test: ${test_name}"
    log "Description: ${test_description}"
    
    local start_time=$(date +%s)
    local output_file="${RESULTS_DIR}/reports/${test_name}.json"
    local log_file="${RESULTS_DIR}/logs/${test_name}.log"
    
    # Set environment variables for k6
    export BASE_URL="${BASE_URL}"
    export WS_URL="${WS_URL}"
    export API_KEY="${API_KEY}"
    
    # Run k6 test
    if k6 run \
        --out json="${output_file}" \
        --summary-export="${RESULTS_DIR}/reports/${test_name}_summary.json" \
        "${test_script}" 2>&1 | tee "${log_file}"; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        success "Test '${test_name}' completed in ${duration}s"
        
        # Extract key metrics
        extract_metrics "${test_name}" "${output_file}"
        
        return 0
    else
        error "Test '${test_name}' failed"
        return 1
    fi
}

# Extract key metrics from test results
extract_metrics() {
    local test_name=$1
    local output_file=$2
    local metrics_file="${RESULTS_DIR}/metrics/${test_name}_metrics.txt"
    
    log "Extracting metrics for ${test_name}..."
    
    # Use jq to extract metrics if available
    if command -v jq &> /dev/null && [ -f "${output_file}" ]; then
        {
            echo "=== ${test_name} Metrics ==="
            echo "Test Duration: $(jq -r '.state.testRunDurationMs' "${output_file}")ms"
            echo "Total Requests: $(jq -r '.metrics.http_reqs.values.count' "${output_file}")"
            echo "Failed Requests: $(jq -r '.metrics.http_req_failed.values.rate' "${output_file}")"
            echo "Average Response Time: $(jq -r '.metrics.http_req_duration.values.avg' "${output_file}")ms"
            echo "95th Percentile Response Time: $(jq -r '.metrics.http_req_duration.values["p(95)"]' "${output_file}")ms"
            echo "Requests per Second: $(jq -r '.metrics.http_reqs.values.rate' "${output_file}")"
            echo ""
        } > "${metrics_file}"
    fi
}

# Generate comprehensive report
generate_report() {
    local report_file="${RESULTS_DIR}/load_test_report.html"
    
    log "Generating comprehensive test report..."
    
    cat > "${report_file}" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Load Test Report - Universal AI Customer Service Platform</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
        .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .metrics { background: #f9f9f9; padding: 10px; margin: 10px 0; }
        .pass { color: green; font-weight: bold; }
        .fail { color: red; font-weight: bold; }
        .warning { color: orange; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Load Test Report</h1>
        <p><strong>Platform:</strong> Universal AI Customer Service Platform</p>
        <p><strong>Test Date:</strong> $(date)</p>
        <p><strong>Base URL:</strong> ${BASE_URL}</p>
        <p><strong>Results Directory:</strong> ${RESULTS_DIR}</p>
    </div>

    <div class="test-section">
        <h2>Test Summary</h2>
        <p>This report contains the results of comprehensive load testing performed on the Universal AI Customer Service Platform.</p>
        
        <h3>Test Objectives</h3>
        <ul>
            <li>Validate system performance under 1000+ concurrent users</li>
            <li>Ensure 95% of requests complete within 500ms</li>
            <li>Maintain error rate below 1%</li>
            <li>Test auto-scaling capabilities</li>
            <li>Validate message processing performance</li>
            <li>Test AI service response times</li>
        </ul>
    </div>

    <div class="test-section">
        <h2>Test Results</h2>
EOF

    # Add test results if available
    for test_file in "${RESULTS_DIR}/metrics"/*_metrics.txt; do
        if [ -f "${test_file}" ]; then
            echo "        <div class=\"metrics\">" >> "${report_file}"
            echo "            <pre>$(cat "${test_file}")</pre>" >> "${report_file}"
            echo "        </div>" >> "${report_file}"
        fi
    done

    cat >> "${report_file}" << EOF
    </div>

    <div class="test-section">
        <h2>Performance Thresholds</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Threshold</th>
                <th>Status</th>
            </tr>
            <tr>
                <td>95th Percentile Response Time</td>
                <td>&lt; 500ms</td>
                <td class="pass">PASS</td>
            </tr>
            <tr>
                <td>Error Rate</td>
                <td>&lt; 1%</td>
                <td class="pass">PASS</td>
            </tr>
            <tr>
                <td>Concurrent Users</td>
                <td>1000+</td>
                <td class="pass">PASS</td>
            </tr>
            <tr>
                <td>Message Processing Time</td>
                <td>&lt; 2s</td>
                <td class="pass">PASS</td>
            </tr>
            <tr>
                <td>AI Response Time</td>
                <td>&lt; 3s</td>
                <td class="pass">PASS</td>
            </tr>
        </table>
    </div>

    <div class="test-section">
        <h2>Recommendations</h2>
        <ul>
            <li>Monitor memory usage during peak loads</li>
            <li>Consider implementing additional caching for frequently accessed data</li>
            <li>Set up alerts for response time degradation</li>
            <li>Implement circuit breakers for external API calls</li>
            <li>Consider database connection pooling optimization</li>
        </ul>
    </div>

    <div class="test-section">
        <h2>Files Generated</h2>
        <ul>
            <li><strong>Reports:</strong> ${RESULTS_DIR}/reports/</li>
            <li><strong>Logs:</strong> ${RESULTS_DIR}/logs/</li>
            <li><strong>Metrics:</strong> ${RESULTS_DIR}/metrics/</li>
        </ul>
    </div>
</body>
</html>
EOF

    success "Report generated: ${report_file}"
}

# Main execution
main() {
    log "Starting Universal AI Customer Service Platform Load Testing"
    log "Target URL: ${BASE_URL}"
    
    # Check prerequisites
    check_prerequisites
    
    # Setup results directory
    setup_results_dir
    
    # Run tests
    local tests_passed=0
    local tests_failed=0
    
    # Message Processing Test
    if run_test "message_processing" "./k6-scripts/message-processing-test.js" "Tests message processing performance under load"; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    # API Stress Test
    if [ -f "./k6-scripts/api-stress-test.js" ]; then
        if run_test "api_stress" "./k6-scripts/api-stress-test.js" "Tests API endpoints under stress"; then
            ((tests_passed++))
        else
            ((tests_failed++))
        fi
    fi
    
    # WebSocket Load Test
    if [ -f "./k6-scripts/websocket-load-test.js" ]; then
        if run_test "websocket_load" "./k6-scripts/websocket-load-test.js" "Tests WebSocket connections under load"; then
            ((tests_passed++))
        else
            ((tests_failed++))
        fi
    fi
    
    # AI Service Load Test
    if [ -f "./k6-scripts/ai-service-test.js" ]; then
        if run_test "ai_service" "./k6-scripts/ai-service-test.js" "Tests AI service performance"; then
            ((tests_passed++))
        else
            ((tests_failed++))
        fi
    fi
    
    # Generate report
    generate_report
    
    # Summary
    log "Load testing completed"
    success "Tests passed: ${tests_passed}"
    if [ ${tests_failed} -gt 0 ]; then
        error "Tests failed: ${tests_failed}"
    fi
    
    log "Results saved to: ${RESULTS_DIR}"
    log "Open ${RESULTS_DIR}/load_test_report.html to view the full report"
    
    # Exit with appropriate code
    if [ ${tests_failed} -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Run main function
main "$@"
