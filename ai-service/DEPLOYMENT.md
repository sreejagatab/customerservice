# AI Service Deployment Guide

## 🚀 Production Deployment

### Prerequisites

- **Node.js**: 18+ LTS
- **PostgreSQL**: 13+ with UUID extension
- **Redis**: 6+ for queue management
- **Docker**: 20+ (optional but recommended)
- **AI Provider API Keys**: OpenAI, Anthropic, Google AI

### Environment Setup

1. **Clone and Install**:
```bash
cd ai-service
npm install
```

2. **Environment Configuration**:
```bash
cp .env.example .env
# Edit .env with your production values
```

3. **Database Setup**:
```bash
# Create database
createdb universal_ai_cs

# Run schema
psql -d universal_ai_cs -f init-db.sql
```

4. **Build Application**:
```bash
npm run build
```

### Docker Deployment

1. **Build Production Image**:
```bash
docker build -t ai-service:latest .
```

2. **Run with Docker Compose**:
```yaml
version: '3.8'
services:
  ai-service:
    image: ai-service:latest
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/universal_ai_cs
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: universal_ai_cs
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Kubernetes Deployment

1. **ConfigMap**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ai-service-config
data:
  NODE_ENV: "production"
  PORT: "3003"
  LOG_LEVEL: "info"
  RATE_LIMIT_WINDOW_MS: "60000"
  RATE_LIMIT_MAX_REQUESTS: "100"
```

2. **Secret**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-service-secrets
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:pass@postgres:5432/universal_ai_cs"
  REDIS_URL: "redis://redis:6379"
  OPENAI_API_KEY: "your-openai-key"
  ANTHROPIC_API_KEY: "your-anthropic-key"
  JWT_SECRET: "your-jwt-secret"
```

3. **Deployment**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-service
  template:
    metadata:
      labels:
        app: ai-service
    spec:
      containers:
      - name: ai-service
        image: ai-service:latest
        ports:
        - containerPort: 3003
        envFrom:
        - configMapRef:
            name: ai-service-config
        - secretRef:
            name: ai-service-secrets
        livenessProbe:
          httpGet:
            path: /api/v1/health/live
            port: 3003
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/v1/health/ready
            port: 3003
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

4. **Service**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: ai-service
spec:
  selector:
    app: ai-service
  ports:
  - port: 80
    targetPort: 3003
  type: ClusterIP
```

### Monitoring Setup

1. **Prometheus Metrics** (add to package.json):
```bash
npm install prom-client
```

2. **Health Check Endpoints**:
- `/health` - Basic health
- `/api/v1/health/detailed` - Comprehensive health
- `/api/v1/health/ready` - Kubernetes readiness
- `/api/v1/health/live` - Kubernetes liveness

3. **Logging**:
- Structured JSON logging
- Configurable log levels
- Request/response tracking
- Performance metrics
- Cost tracking

### Security Considerations

1. **API Key Management**:
- Store API keys in secure secret management
- Rotate keys regularly
- Use environment-specific keys

2. **Network Security**:
- Use HTTPS in production
- Implement rate limiting
- Configure CORS properly
- Use VPC/private networks

3. **Database Security**:
- Encrypt API keys at rest
- Use connection pooling
- Regular backups
- Access controls

### Performance Optimization

1. **Scaling**:
- Horizontal scaling with multiple instances
- Queue-based processing for high throughput
- Database connection pooling
- Redis clustering for high availability

2. **Caching**:
- Redis for session data
- Response caching for repeated queries
- Provider response caching

3. **Cost Optimization**:
- Automatic provider selection
- Model optimization based on task complexity
- Batch processing for efficiency
- Cost monitoring and alerts

### Backup and Recovery

1. **Database Backups**:
```bash
# Daily backup
pg_dump universal_ai_cs > backup_$(date +%Y%m%d).sql

# Restore
psql universal_ai_cs < backup_20240101.sql
```

2. **Configuration Backups**:
- Version control all configuration
- Backup environment variables
- Document provider configurations

### Troubleshooting

1. **Common Issues**:
- Provider API key issues
- Database connection problems
- Queue processing delays
- Memory/CPU constraints

2. **Debug Commands**:
```bash
# Check service health
curl http://localhost:3003/health

# Check detailed health
curl http://localhost:3003/api/v1/health/detailed

# Check logs
docker logs ai-service

# Check queue status
curl http://localhost:3003/api/v1/ai/providers
```

3. **Performance Monitoring**:
- Monitor response times
- Track error rates
- Monitor cost metrics
- Queue processing metrics

### Maintenance

1. **Regular Tasks**:
- Update dependencies
- Rotate API keys
- Clean up old logs
- Database maintenance
- Performance optimization

2. **Monitoring Alerts**:
- High error rates
- Slow response times
- High costs
- Queue backlogs
- Provider failures

### Integration with Other Services

1. **Integration Service**:
- Webhook endpoints for results
- Shared database for message data
- Queue-based communication

2. **Admin Service**:
- Provider management APIs
- Performance monitoring
- Cost tracking
- A/B testing configuration

This deployment guide ensures a robust, scalable, and secure AI service deployment suitable for production environments.
