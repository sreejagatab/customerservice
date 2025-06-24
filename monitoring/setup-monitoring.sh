#!/bin/bash

# Monitoring Setup Script for Universal AI Customer Service Platform
# Sets up comprehensive monitoring with Prometheus, Grafana, and Alertmanager

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Configuration
MONITORING_NAMESPACE="monitoring"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_PASSWORD:-admin123}"
PROMETHEUS_RETENTION="${PROMETHEUS_RETENTION:-30d}"
ALERTMANAGER_SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if running in Docker environment
    if command -v docker &> /dev/null; then
        log_success "Docker found"
    else
        log_error "Docker not found. Please install Docker."
        exit 1
    fi
    
    # Check if running in Kubernetes environment
    if command -v kubectl &> /dev/null; then
        log_info "Kubernetes environment detected"
        DEPLOYMENT_TYPE="kubernetes"
    else
        log_info "Using Docker Compose deployment"
        DEPLOYMENT_TYPE="docker"
    fi
}

# Setup monitoring directories
setup_directories() {
    log_info "Setting up monitoring directories..."
    
    mkdir -p monitoring/{prometheus,grafana,alertmanager}/{data,config}
    mkdir -p monitoring/grafana/{dashboards,datasources}
    mkdir -p monitoring/exporters
    
    # Set proper permissions
    chmod 777 monitoring/prometheus/data
    chmod 777 monitoring/grafana/data
    chmod 777 monitoring/alertmanager/data
    
    log_success "Monitoring directories created"
}

# Setup Prometheus configuration
setup_prometheus() {
    log_info "Setting up Prometheus configuration..."
    
    # Copy configuration files
    cp monitoring/prometheus.yml monitoring/prometheus/config/
    cp monitoring/alert_rules.yml monitoring/prometheus/config/
    
    # Create recording rules
    cat > monitoring/prometheus/config/recording_rules.yml << EOF
groups:
  - name: recording_rules
    rules:
      - record: instance:node_cpu_utilisation:rate5m
        expr: 1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance)
      
      - record: instance:node_memory_utilisation:ratio
        expr: 1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
      
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)
      
      - record: job:http_request_duration:p95
        expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (job, le))
EOF
    
    log_success "Prometheus configuration ready"
}

# Setup Grafana
setup_grafana() {
    log_info "Setting up Grafana..."
    
    # Create datasource configuration
    cat > monitoring/grafana/datasources/prometheus.yml << EOF
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
EOF
    
    # Create dashboard provisioning
    cat > monitoring/grafana/dashboards/dashboard.yml << EOF
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
EOF
    
    # Copy dashboard files
    cp monitoring/grafana/dashboards/*.json monitoring/grafana/dashboards/
    
    log_success "Grafana configuration ready"
}

# Setup Alertmanager
setup_alertmanager() {
    log_info "Setting up Alertmanager..."
    
    # Update Slack webhook in alertmanager config
    if [[ -n "$ALERTMANAGER_SLACK_WEBHOOK" ]]; then
        sed -i "s|YOUR/SLACK/WEBHOOK|$ALERTMANAGER_SLACK_WEBHOOK|g" monitoring/alertmanager.yml
    fi
    
    cp monitoring/alertmanager.yml monitoring/alertmanager/config/
    
    # Create notification templates
    mkdir -p monitoring/alertmanager/templates
    cat > monitoring/alertmanager/templates/default.tmpl << EOF
{{ define "slack.default.title" }}
{{ if eq .Status "firing" }}🔥{{ else }}✅{{ end }} {{ .GroupLabels.alertname }}
{{ end }}

{{ define "slack.default.text" }}
{{ range .Alerts }}
*Alert:* {{ .Annotations.summary }}
*Description:* {{ .Annotations.description }}
*Severity:* {{ .Labels.severity }}
*Service:* {{ .Labels.job }}
{{ if .Annotations.runbook_url }}*Runbook:* {{ .Annotations.runbook_url }}{{ end }}
{{ end }}
{{ end }}
EOF
    
    log_success "Alertmanager configuration ready"
}

# Setup exporters
setup_exporters() {
    log_info "Setting up monitoring exporters..."
    
    # Create node exporter configuration
    cat > monitoring/exporters/node-exporter.yml << EOF
version: '3.8'
services:
  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    restart: unless-stopped
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    ports:
      - "9100:9100"
    networks:
      - monitoring
EOF
    
    # Create postgres exporter configuration
    cat > monitoring/exporters/postgres-exporter.yml << EOF
version: '3.8'
services:
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres-exporter
    restart: unless-stopped
    environment:
      DATA_SOURCE_NAME: "${DATABASE_URL}"
    ports:
      - "9187:9187"
    networks:
      - monitoring
EOF
    
    # Create redis exporter configuration
    cat > monitoring/exporters/redis-exporter.yml << EOF
version: '3.8'
services:
  redis-exporter:
    image: oliver006/redis_exporter:latest
    container_name: redis-exporter
    restart: unless-stopped
    environment:
      REDIS_ADDR: "${REDIS_URL}"
    ports:
      - "9121:9121"
    networks:
      - monitoring
EOF
    
    log_success "Monitoring exporters configured"
}

# Deploy with Docker Compose
deploy_docker() {
    log_info "Deploying monitoring stack with Docker Compose..."
    
    # Create monitoring docker-compose file
    cat > monitoring/docker-compose.monitoring.yml << EOF
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/config:/etc/prometheus
      - ./prometheus/data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=${PROMETHEUS_RETENTION}'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_INSTALL_PLUGINS=grafana-piechart-panel,grafana-worldmap-panel
    volumes:
      - ./grafana/data:/var/lib/grafana
      - ./grafana/datasources:/etc/grafana/provisioning/datasources
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    restart: unless-stopped
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager/config:/etc/alertmanager
      - ./alertmanager/data:/alertmanager
      - ./alertmanager/templates:/etc/alertmanager/templates
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
      - '--web.external-url=http://localhost:9093'
    networks:
      - monitoring

networks:
  monitoring:
    driver: bridge

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:
EOF
    
    # Start monitoring stack
    cd monitoring
    docker-compose -f docker-compose.monitoring.yml up -d
    cd ..
    
    log_success "Monitoring stack deployed with Docker Compose"
}

# Deploy with Kubernetes
deploy_kubernetes() {
    log_info "Deploying monitoring stack with Kubernetes..."
    
    # Create namespace
    kubectl create namespace $MONITORING_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy Prometheus
    kubectl apply -f - << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: $MONITORING_NAMESPACE
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:latest
        ports:
        - containerPort: 9090
        volumeMounts:
        - name: config
          mountPath: /etc/prometheus
        - name: data
          mountPath: /prometheus
        command:
        - '--config.file=/etc/prometheus/prometheus.yml'
        - '--storage.tsdb.path=/prometheus'
        - '--storage.tsdb.retention.time=$PROMETHEUS_RETENTION'
        - '--web.enable-lifecycle'
      volumes:
      - name: config
        configMap:
          name: prometheus-config
      - name: data
        persistentVolumeClaim:
          claimName: prometheus-data
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: $MONITORING_NAMESPACE
spec:
  selector:
    app: prometheus
  ports:
  - port: 9090
    targetPort: 9090
  type: ClusterIP
EOF
    
    log_success "Monitoring stack deployed with Kubernetes"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying monitoring deployment..."
    
    if [[ "$DEPLOYMENT_TYPE" == "docker" ]]; then
        # Check Docker containers
        if docker ps | grep -q prometheus; then
            log_success "Prometheus is running"
        else
            log_error "Prometheus is not running"
        fi
        
        if docker ps | grep -q grafana; then
            log_success "Grafana is running"
        else
            log_error "Grafana is not running"
        fi
        
        if docker ps | grep -q alertmanager; then
            log_success "Alertmanager is running"
        else
            log_error "Alertmanager is not running"
        fi
        
        # Test endpoints
        sleep 10
        if curl -f -s http://localhost:9090/-/healthy > /dev/null; then
            log_success "Prometheus health check passed"
        else
            log_warning "Prometheus health check failed"
        fi
        
        if curl -f -s http://localhost:3001/api/health > /dev/null; then
            log_success "Grafana health check passed"
        else
            log_warning "Grafana health check failed"
        fi
        
    else
        # Check Kubernetes pods
        kubectl get pods -n $MONITORING_NAMESPACE
    fi
}

# Print access information
print_access_info() {
    log_info "Monitoring stack access information:"
    echo
    echo "📊 Prometheus: http://localhost:9090"
    echo "📈 Grafana: http://localhost:3001 (admin / $GRAFANA_ADMIN_PASSWORD)"
    echo "🚨 Alertmanager: http://localhost:9093"
    echo
    echo "Default dashboards available in Grafana:"
    echo "  - System Overview"
    echo "  - Application Metrics"
    echo "  - Database Performance"
    echo
    echo "Alert channels configured:"
    echo "  - Slack notifications"
    echo "  - Email alerts"
    echo "  - PagerDuty integration"
}

# Main function
main() {
    log_info "Setting up monitoring for Universal AI Customer Service Platform"
    
    check_prerequisites
    setup_directories
    setup_prometheus
    setup_grafana
    setup_alertmanager
    setup_exporters
    
    if [[ "$DEPLOYMENT_TYPE" == "docker" ]]; then
        deploy_docker
    else
        deploy_kubernetes
    fi
    
    verify_deployment
    print_access_info
    
    log_success "🎉 Monitoring setup completed successfully!"
}

# Run main function
main "$@"
