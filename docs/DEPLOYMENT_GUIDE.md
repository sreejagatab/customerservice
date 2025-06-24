# Universal AI Customer Service Platform - Deployment Guide

## Overview

This guide covers deploying the Universal AI Customer Service Platform in production environments. The platform consists of multiple microservices that can be deployed using Docker, Kubernetes, or traditional server setups.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Auth Service  │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (Node.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
        │ Integration  │ │ AI Service  │ │ Analytics  │
        │ Service      │ │ (Python)    │ │ Service    │
        │ (Node.js)    │ └─────────────┘ │ (Node.js)  │
        └──────────────┘                 └────────────┘
                │
        ┌───────▼──────┐ ┌─────────────┐ ┌─────────────┐
        │ PostgreSQL   │ │    Redis    │ │ Elasticsearch│
        │ Database     │ │   Cache     │ │   Search    │
        └──────────────┘ └─────────────┘ └─────────────┘
```

## Prerequisites

### System Requirements
- **CPU**: 4+ cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 100GB minimum, SSD recommended
- **Network**: Stable internet connection

### Software Requirements
- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for development)
- Python 3.9+ (for AI service)
- PostgreSQL 14+
- Redis 6+

## Environment Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/universal-ai-cs.git
cd universal-ai-cs
```

### 2. Environment Configuration
Create environment files for each service:

#### `.env.production`
```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/uaics_prod
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12

# AI Providers
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
GOOGLE_AI_API_KEY=your-google-ai-api-key

# Email Configuration
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=your-smtp-password

# External Services
ELASTICSEARCH_URL=http://localhost:9200
WEBHOOK_SECRET=your-webhook-secret

# Security
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_WINDOW=3600000
RATE_LIMIT_MAX=1000

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

## Deployment Options

### Option 1: Docker Compose (Recommended for Small-Medium Scale)

#### 1. Production Docker Compose
Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  # Database
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: uaics_prod
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  # Cache
  redis:
    image: redis:6-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

  # Search
  elasticsearch:
    image: elasticsearch:8.5.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    restart: unless-stopped

  # API Gateway
  api-gateway:
    build:
      context: ./api-gateway
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    ports:
      - "3000:3000"

  # Auth Service
  auth-service:
    build:
      context: ./auth-service
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  # Integration Service
  integration-service:
    build:
      context: ./integration-service
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  # AI Service
  ai-service:
    build:
      context: ./ai-service
      dockerfile: Dockerfile.prod
    environment:
      - ENVIRONMENT=production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  # Analytics Service
  analytics-service:
    build:
      context: ./analytics-service
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - elasticsearch
    restart: unless-stopped

  # Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
      - VITE_API_URL=https://api.your-domain.com
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/ssl/certs

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
```

#### 2. Deploy with Docker Compose
```bash
# Build and start services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Option 2: Kubernetes (Recommended for Large Scale)

#### 1. Kubernetes Manifests

Create `k8s/namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: uaics-prod
```

Create `k8s/configmap.yaml`:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: uaics-config
  namespace: uaics-prod
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  CORS_ORIGIN: "https://your-domain.com"
```

Create `k8s/secrets.yaml`:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: uaics-secrets
  namespace: uaics-prod
type: Opaque
data:
  DATABASE_URL: <base64-encoded-database-url>
  JWT_SECRET: <base64-encoded-jwt-secret>
  OPENAI_API_KEY: <base64-encoded-openai-key>
```

#### 2. Deploy to Kubernetes
```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n uaics-prod

# View logs
kubectl logs -f deployment/api-gateway -n uaics-prod
```

## Database Setup

### 1. Initialize Database
```bash
# Run migrations
npm run migrate:prod

# Seed initial data
npm run seed:prod
```

### 2. Database Backup Strategy
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > backups/uaics_backup_$DATE.sql
```

## SSL/TLS Configuration

### 1. Obtain SSL Certificate
```bash
# Using Let's Encrypt
certbot certonly --webroot -w /var/www/html -d your-domain.com
```

### 2. Configure Nginx (if using)
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring and Logging

### 1. Health Checks
Each service exposes health check endpoints:
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health information

### 2. Logging Configuration
```javascript
// logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});
```

### 3. Monitoring with Prometheus
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'uaics-services'
    static_configs:
      - targets: ['localhost:3000', 'localhost:3001', 'localhost:3002']
```

## Performance Optimization

### 1. Database Optimization
```sql
-- Create indexes for frequently queried columns
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_integrations_organization_id ON integrations(organization_id);
```

### 2. Redis Caching Strategy
```javascript
// Cache frequently accessed data
const cacheKey = `user:${userId}:profile`;
const cachedData = await redis.get(cacheKey);

if (!cachedData) {
  const userData = await database.getUser(userId);
  await redis.setex(cacheKey, 3600, JSON.stringify(userData));
  return userData;
}

return JSON.parse(cachedData);
```

### 3. Load Balancing
```nginx
upstream uaics_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    location / {
        proxy_pass http://uaics_backend;
    }
}
```

## Security Hardening

### 1. Environment Security
```bash
# Set proper file permissions
chmod 600 .env.production
chown root:root .env.production

# Use secrets management
export DATABASE_URL=$(vault kv get -field=url secret/uaics/database)
```

### 2. Network Security
```bash
# Configure firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 5432/tcp  # Block direct database access
ufw enable
```

### 3. Application Security
```javascript
// Rate limiting
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

## Backup and Recovery

### 1. Automated Backups
```bash
#!/bin/bash
# backup.sh

# Database backup
pg_dump $DATABASE_URL | gzip > /backups/db_$(date +%Y%m%d_%H%M%S).sql.gz

# File system backup
tar -czf /backups/files_$(date +%Y%m%d_%H%M%S).tar.gz /app/uploads

# Upload to cloud storage
aws s3 cp /backups/ s3://your-backup-bucket/ --recursive
```

### 2. Recovery Procedures
```bash
# Restore database
gunzip -c backup.sql.gz | psql $DATABASE_URL

# Restore files
tar -xzf files_backup.tar.gz -C /app/
```

## Scaling Considerations

### 1. Horizontal Scaling
- Use load balancers for API services
- Implement database read replicas
- Use Redis Cluster for caching
- Consider microservice decomposition

### 2. Vertical Scaling
- Monitor resource usage
- Optimize database queries
- Implement connection pooling
- Use CDN for static assets

## Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check logs
docker-compose logs service-name

# Check environment variables
docker-compose exec service-name env

# Verify database connection
docker-compose exec service-name npm run db:test
```

#### High Memory Usage
```bash
# Monitor memory usage
docker stats

# Check for memory leaks
node --inspect app.js
```

#### Database Connection Issues
```bash
# Test database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool
SELECT * FROM pg_stat_activity;
```

## Maintenance

### 1. Regular Updates
```bash
# Update dependencies
npm audit fix

# Update Docker images
docker-compose pull
docker-compose up -d
```

### 2. Database Maintenance
```sql
-- Analyze tables
ANALYZE;

-- Vacuum tables
VACUUM ANALYZE;

-- Reindex if needed
REINDEX DATABASE uaics_prod;
```

### 3. Log Rotation
```bash
# Configure logrotate
/var/log/uaics/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 uaics uaics
}
```

## Support and Maintenance

- **Documentation**: https://docs.universalai-cs.com
- **Support**: support@universalai-cs.com
- **Status Page**: https://status.universalai-cs.com
- **Emergency Contact**: emergency@universalai-cs.com
