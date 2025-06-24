#!/bin/bash

# Universal AI Customer Service Platform - System Startup Script
# This script helps you start and test the entire platform

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
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

# Banner
show_banner() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        🤖 Universal AI Customer Service Platform 🤖          ║"
    echo "║                                                              ║"
    echo "║                    Starting System...                       ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    
    # Determine compose command
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    success "Prerequisites check passed"
}

# Create environment file if it doesn't exist
create_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        log "Creating environment file..."
        cat > "$ENV_FILE" << EOF
# Universal AI Customer Service Platform Environment Variables

# Database
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://postgres:password@localhost:5432/universal_ai_cs

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-$(date +%s)
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production-$(date +%s)

# AI Provider API Keys (Optional - for testing AI features)
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
GOOGLE_AI_API_KEY=your-google-ai-api-key-here

# Email (for testing)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=test
SMTP_PASSWORD=test

# Environment
NODE_ENV=development
EOF
        success "Environment file created: $ENV_FILE"
        warning "Please update API keys in $ENV_FILE for full AI functionality"
    else
        info "Environment file already exists: $ENV_FILE"
    fi
}

# Start the system
start_system() {
    log "Starting Universal AI Customer Service Platform..."
    
    # Pull latest images
    log "Pulling latest Docker images..."
    $COMPOSE_CMD pull
    
    # Build services
    log "Building services..."
    $COMPOSE_CMD build
    
    # Start infrastructure services first
    log "Starting infrastructure services (Database, Redis, RabbitMQ)..."
    $COMPOSE_CMD up -d postgres redis rabbitmq
    
    # Wait for infrastructure to be ready
    log "Waiting for infrastructure services to be ready..."
    sleep 10
    
    # Check database health
    log "Checking database connection..."
    for i in {1..30}; do
        if $COMPOSE_CMD exec -T postgres pg_isready -U postgres -d universal_ai_cs &> /dev/null; then
            success "Database is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            error "Database failed to start"
            exit 1
        fi
        sleep 2
    done
    
    # Start application services
    log "Starting application services..."
    $COMPOSE_CMD up -d
    
    # Wait for services to start
    log "Waiting for services to start..."
    sleep 15
}

# Check service health
check_services() {
    log "Checking service health..."
    
    local services=(
        "API Gateway:http://localhost:3000/health"
        "Auth Service:http://localhost:3001/health"
        "Integration Service:http://localhost:3002/health"
        "AI Service:http://localhost:3003/health"
        "Message Service:http://localhost:3004/health"
        "Frontend:http://localhost:5173"
    )
    
    echo ""
    echo -e "${CYAN}🔍 Service Health Check:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    for service in "${services[@]}"; do
        local name=$(echo $service | cut -d: -f1)
        local url=$(echo $service | cut -d: -f2-)
        
        printf "%-20s " "$name:"
        
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Healthy${NC}"
        else
            echo -e "${RED}✗ Unhealthy${NC}"
        fi
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Show access information
show_access_info() {
    echo ""
    echo -e "${PURPLE}🚀 Universal AI Customer Service Platform is Running!${NC}"
    echo ""
    echo -e "${CYAN}📱 Main Applications:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "🌐 Frontend Dashboard:     ${GREEN}http://localhost:5173${NC}"
    echo -e "🔗 API Gateway:            ${GREEN}http://localhost:3000${NC}"
    echo -e "🔐 Authentication:         ${GREEN}http://localhost:3001${NC}"
    echo ""
    echo -e "${CYAN}🔧 Development Tools:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "📊 Grafana (Monitoring):   ${GREEN}http://localhost:3001${NC} (admin/admin)"
    echo -e "📈 Prometheus (Metrics):   ${GREEN}http://localhost:9090${NC}"
    echo -e "🐰 RabbitMQ (Queue):       ${GREEN}http://localhost:15672${NC} (guest/guest)"
    echo -e "📧 MailHog (Email):        ${GREEN}http://localhost:8025${NC}"
    echo ""
    echo -e "${CYAN}🔌 API Endpoints:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "🔗 Integration Service:    ${GREEN}http://localhost:3002${NC}"
    echo -e "🤖 AI Service:             ${GREEN}http://localhost:3003${NC}"
    echo -e "💬 Message Service:        ${GREEN}http://localhost:3004${NC}"
    echo ""
    echo -e "${CYAN}📚 Quick Test Commands:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "Health Check:              ${YELLOW}curl http://localhost:3000/health${NC}"
    echo -e "API Gateway Status:        ${YELLOW}curl http://localhost:3000/services${NC}"
    echo -e "View Logs:                 ${YELLOW}docker-compose logs -f [service-name]${NC}"
    echo -e "Stop System:               ${YELLOW}docker-compose down${NC}"
    echo ""
}

# Show logs
show_logs() {
    echo ""
    echo -e "${CYAN}📋 Recent Logs:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    $COMPOSE_CMD logs --tail=5 api-gateway auth-service integration-service ai-service message-service
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${YELLOW}💡 To view live logs: docker-compose logs -f [service-name]${NC}"
}

# Test basic functionality
test_functionality() {
    echo ""
    echo -e "${CYAN}🧪 Testing Basic Functionality:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test API Gateway
    printf "%-30s " "API Gateway Health:"
    if response=$(curl -s http://localhost:3000/health); then
        echo -e "${GREEN}✓ OK${NC}"
        echo "   Response: $(echo $response | jq -r '.status // .message // "OK"' 2>/dev/null || echo "OK")"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    
    # Test Service Discovery
    printf "%-30s " "Service Discovery:"
    if response=$(curl -s http://localhost:3000/services); then
        echo -e "${GREEN}✓ OK${NC}"
        service_count=$(echo $response | jq -r '.data | length' 2>/dev/null || echo "N/A")
        echo "   Services registered: $service_count"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main execution
main() {
    show_banner
    
    # Check prerequisites
    check_prerequisites
    
    # Create environment file
    create_env_file
    
    # Start the system
    start_system
    
    # Check service health
    check_services
    
    # Test basic functionality
    test_functionality
    
    # Show access information
    show_access_info
    
    # Show recent logs
    show_logs
    
    echo ""
    echo -e "${GREEN}🎉 System startup complete!${NC}"
    echo -e "${YELLOW}💡 Open http://localhost:5173 in your browser to access the dashboard${NC}"
    echo ""
}

# Handle script arguments
case "${1:-start}" in
    "start")
        main
        ;;
    "stop")
        log "Stopping Universal AI Customer Service Platform..."
        $COMPOSE_CMD down
        success "System stopped"
        ;;
    "restart")
        log "Restarting Universal AI Customer Service Platform..."
        $COMPOSE_CMD down
        sleep 5
        main
        ;;
    "logs")
        $COMPOSE_CMD logs -f "${2:-}"
        ;;
    "status")
        check_services
        ;;
    "test")
        test_functionality
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs [service]|status|test}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the entire platform (default)"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart the platform"
        echo "  logs     - Show logs (optionally for specific service)"
        echo "  status   - Check service health"
        echo "  test     - Test basic functionality"
        exit 1
        ;;
esac
