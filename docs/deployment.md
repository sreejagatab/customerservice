# ⚡ Deployment Guide

Complete guide for deploying the Universal AI Customer Service Platform to production.

## 📋 Overview

This guide covers deployment options from simple Docker setups to enterprise Kubernetes clusters with high availability and auto-scaling.

## 🎯 Deployment Options

### 1. Docker Compose (Development/Small Scale)
- **Use Case**: Development, testing, small deployments
- **Capacity**: Up to 1,000 concurrent users
- **Complexity**: Low
- **Cost**: Low

### 2. Kubernetes (Production/Enterprise)
- **Use Case**: Production, enterprise deployments
- **Capacity**: 100,000+ concurrent users
- **Complexity**: Medium to High
- **Cost**: Medium to High

### 3. Cloud Managed Services
- **Use Case**: Fully managed deployment
- **Capacity**: Unlimited scaling
- **Complexity**: Low to Medium
- **Cost**: Variable

## 🐳 Docker Compose Deployment

### Prerequisites
- Docker 20.0+
- Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ disk space

### Quick Deployment

1. **Clone Repository**
```bash
git clone https://github.com/your-org/universal-ai-customer-service.git
cd universal-ai-customer-service
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Deploy Services**
```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### Production Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  # Database
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: universal_ai_cs
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  # Cache
  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

  # Message Queue
  rabbitmq:
    image: rabbitmq:3-management
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    ports:
      - "5672:5672"
      - "15672:15672"
    restart: unless-stopped

  # API Gateway
  api-gateway:
    build: ./api-gateway
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  # Auth Service
  auth-service:
    build: ./auth-service
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "3002:3002"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  # AI Service
  ai-service:
    build: ./ai-service
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "3004:3004"
    restart: unless-stopped

  # Frontend
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - api-gateway
    restart: unless-stopped

  # Load Balancer
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api-gateway
      - frontend
    restart: unless-stopped

volumes:
  postgres_data:
```

## ☸️ Kubernetes Deployment

### Prerequisites
- Kubernetes cluster 1.25+
- kubectl configured
- Helm 3.0+
- 8GB+ RAM per node
- 50GB+ disk space

### Cluster Setup

1. **Create Namespace**
```bash
kubectl create namespace universal-ai-cs
kubectl config set-context --current --namespace=universal-ai-cs
```

2. **Install Dependencies**
```bash
# PostgreSQL
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install postgres bitnami/postgresql \
  --set auth.postgresPassword=your-password \
  --set primary.persistence.size=100Gi

# Redis
helm install redis bitnami/redis \
  --set auth.password=your-redis-password

# RabbitMQ
helm install rabbitmq bitnami/rabbitmq \
  --set auth.username=admin \
  --set auth.password=your-rabbitmq-password
```

3. **Deploy Application**
```bash
# Apply Kubernetes manifests
kubectl apply -f infrastructure/kubernetes/

# Or use Helm chart
helm install universal-ai-cs ./infrastructure/helm/
```

### Kubernetes Manifests

#### ConfigMap
```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  NODE_ENV: "production"
  DATABASE_HOST: "postgres-postgresql"
  REDIS_HOST: "redis-master"
  RABBITMQ_HOST: "rabbitmq"
```

#### Secrets
```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  DATABASE_PASSWORD: <base64-encoded-password>
  JWT_SECRET: <base64-encoded-secret>
  OPENAI_API_KEY: <base64-encoded-key>
```

#### Deployment
```yaml
# api-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: universal-ai-cs/api-gateway:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: NODE_ENV
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: DATABASE_PASSWORD
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### Service
```yaml
# api-gateway-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-gateway-service
spec:
  selector:
    app: api-gateway
  ports:
  - port: 80
    targetPort: 3001
  type: ClusterIP
```

#### Ingress
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    - app.yourdomain.com
    secretName: app-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway-service
            port:
              number: 80
  - host: app.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 80
```

### Auto-scaling

#### Horizontal Pod Autoscaler
```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## ☁️ Cloud Deployments

### AWS EKS

1. **Create EKS Cluster**
```bash
# Install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Create cluster
eksctl create cluster \
  --name universal-ai-cs \
  --region us-west-2 \
  --nodegroup-name workers \
  --node-type m5.large \
  --nodes 3 \
  --nodes-min 1 \
  --nodes-max 10
```

2. **Configure Load Balancer**
```bash
# Install AWS Load Balancer Controller
kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=universal-ai-cs
```

### Google GKE

1. **Create GKE Cluster**
```bash
# Create cluster
gcloud container clusters create universal-ai-cs \
  --zone us-central1-a \
  --num-nodes 3 \
  --enable-autoscaling \
  --min-nodes 1 \
  --max-nodes 10 \
  --machine-type n1-standard-2
```

2. **Configure Ingress**
```bash
# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```

### Azure AKS

1. **Create AKS Cluster**
```bash
# Create resource group
az group create --name universal-ai-cs-rg --location eastus

# Create AKS cluster
az aks create \
  --resource-group universal-ai-cs-rg \
  --name universal-ai-cs \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys
```

## 🔒 Security Configuration

### SSL/TLS Setup

1. **Install cert-manager**
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

2. **Configure Let's Encrypt**
```yaml
# cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

### Network Policies

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-gateway-netpol
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx-ingress
    ports:
    - protocol: TCP
      port: 3001
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
```

## 📊 Monitoring Setup

### Prometheus & Grafana

1. **Install Monitoring Stack**
```bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

# Install kube-prometheus-stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

2. **Configure Service Monitors**
```yaml
# service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: api-gateway-monitor
spec:
  selector:
    matchLabels:
      app: api-gateway
  endpoints:
  - port: metrics
    path: /metrics
```

## 🚀 CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-west-2
    
    - name: Build and push Docker images
      run: |
        docker build -t $ECR_REGISTRY/api-gateway:$GITHUB_SHA ./api-gateway
        docker push $ECR_REGISTRY/api-gateway:$GITHUB_SHA
    
    - name: Deploy to EKS
      run: |
        aws eks update-kubeconfig --name universal-ai-cs
        kubectl set image deployment/api-gateway api-gateway=$ECR_REGISTRY/api-gateway:$GITHUB_SHA
```

## 🔧 Environment Configuration

### Production Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@postgres:5432/universal_ai_cs
REDIS_URL=redis://redis:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# AI Providers
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# External Services
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

# Monitoring
PROMETHEUS_ENDPOINT=http://prometheus:9090
GRAFANA_URL=http://grafana:3000

# Security
ENCRYPTION_KEY=your-encryption-key
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

## 📋 Post-Deployment Checklist

### Health Checks
- [ ] All services are running
- [ ] Database connections working
- [ ] Redis cache accessible
- [ ] External API integrations working
- [ ] SSL certificates valid

### Performance Tests
- [ ] Load testing completed
- [ ] Response times under 100ms
- [ ] Auto-scaling working
- [ ] Database performance optimized

### Security Verification
- [ ] Network policies applied
- [ ] Secrets properly configured
- [ ] HTTPS enforced
- [ ] Security headers configured

### Monitoring Setup
- [ ] Prometheus collecting metrics
- [ ] Grafana dashboards configured
- [ ] Alerts configured
- [ ] Log aggregation working

## 🚨 Troubleshooting

### Common Issues

#### Pod Startup Failures
```bash
# Check pod status
kubectl get pods

# View pod logs
kubectl logs <pod-name>

# Describe pod for events
kubectl describe pod <pod-name>
```

#### Database Connection Issues
```bash
# Test database connectivity
kubectl exec -it <pod-name> -- psql $DATABASE_URL

# Check database service
kubectl get svc postgres-postgresql
```

#### SSL Certificate Issues
```bash
# Check certificate status
kubectl get certificates

# View cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager
```

For deployment support, contact our DevOps team at devops@universalai-cs.com
