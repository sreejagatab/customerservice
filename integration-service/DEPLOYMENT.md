# Integration Service Deployment Guide

This guide covers deployment of the Integration Service to various environments.

## Prerequisites

- Docker & Docker Compose
- PostgreSQL 12+
- Redis 6+
- Node.js 18+ (for local development)

## Environment Setup

### 1. Clone and Setup

```bash
git clone <repository-url>
cd integration-service
chmod +x scripts/*.sh
./scripts/setup.sh
```

### 2. Configure Environment Variables

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

**Required Configuration:**

```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Redis
REDIS_URL=redis://host:port

# JWT Secret (use a strong random string)
JWT_SECRET=your-super-secret-jwt-key

# Google OAuth (for Gmail integration)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Microsoft OAuth (for Outlook integration)
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

#### Development Environment

```bash
# Start all services including databases
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

#### Production Environment

```bash
# Deploy to production
./scripts/deploy.sh -e production

# Or manually
docker-compose up -d --build

# Monitor deployment
./scripts/monitor.sh
```

### Option 2: Manual Deployment

#### 1. Install Dependencies

```bash
npm install
npm run build
```

#### 2. Start Services

```bash
# Start API server
npm start

# Start worker (in another terminal)
npm run start:worker
```

### Option 3: Kubernetes Deployment

Create Kubernetes manifests:

```yaml
# integration-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: integration-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: integration-service
  template:
    metadata:
      labels:
        app: integration-service
    spec:
      containers:
      - name: integration-service
        image: integration-service:latest
        ports:
        - containerPort: 3003
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: integration-secrets
              key: database-url
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3003
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3003
          initialDelaySeconds: 5
          periodSeconds: 5
```

## OAuth Provider Setup

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - Development: `http://localhost:3003/auth/google/callback`
   - Production: `https://yourdomain.com/auth/google/callback`
7. Copy Client ID and Client Secret to your `.env` file

### Microsoft OAuth Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" → "App registrations"
3. Click "New registration"
4. Set redirect URI: `https://yourdomain.com/auth/microsoft/callback`
5. Go to "API permissions" and add:
   - Microsoft Graph → Delegated permissions → Mail.Read
   - Microsoft Graph → Delegated permissions → Mail.Send
6. Go to "Certificates & secrets" → "New client secret"
7. Copy Application (client) ID and client secret to your `.env` file

## Database Setup

### PostgreSQL Setup

1. **Create Database:**
   ```sql
   CREATE DATABASE universal_ai_cs;
   CREATE USER integration_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE universal_ai_cs TO integration_user;
   ```

2. **Run Migrations:**
   ```bash
   # Database schema is automatically created via init-db.sql
   # when using Docker Compose
   ```

### Redis Setup

Redis is used for caching, rate limiting, and job queues:

```bash
# Install Redis
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test connection
redis-cli ping
```

## SSL/TLS Configuration

### Using Let's Encrypt with Nginx

1. **Install Certbot:**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   ```

2. **Obtain Certificate:**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

3. **Update nginx.conf:**
   ```nginx
   server {
       listen 443 ssl http2;
       server_name yourdomain.com;
       
       ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
       
       # SSL configuration
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
       ssl_prefer_server_ciphers off;
       
       # Your location blocks here
   }
   ```

## Monitoring and Logging

### Health Monitoring

```bash
# Basic health check
curl https://yourdomain.com/health

# Detailed health check
curl https://yourdomain.com/health/detailed

# Continuous monitoring
./scripts/monitor.sh -w -u https://yourdomain.com
```

### Log Management

```bash
# View application logs
docker-compose logs -f integration-api

# View worker logs
docker-compose logs -f integration-worker

# View specific service logs
docker logs integration-api-container
```

### Setting Up Log Rotation

```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/integration-service << EOF
/var/log/integration-service/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker kill -s USR1 integration-api-container
    endscript
}
EOF
```

## Backup and Recovery

### Automated Backups

```bash
# Create backup
./scripts/backup.sh -e production

# Schedule daily backups (add to crontab)
0 2 * * * /path/to/integration-service/scripts/backup.sh -e production
```

### Restore from Backup

```bash
# Extract backup
tar -xzf backup_file.tar.gz

# Restore database
psql -h localhost -U postgres -d universal_ai_cs < backup_database.sql

# Restore Redis (if needed)
redis-cli --rdb backup_redis.rdb
```

## Performance Tuning

### Database Optimization

```sql
-- Add indexes for better performance
CREATE INDEX CONCURRENTLY idx_messages_organization_date 
ON messages(organization_id, message_date);

CREATE INDEX CONCURRENTLY idx_integrations_org_status 
ON integrations(organization_id, status);
```

### Redis Optimization

```bash
# Redis configuration for production
echo "maxmemory 2gb" >> /etc/redis/redis.conf
echo "maxmemory-policy allkeys-lru" >> /etc/redis/redis.conf
sudo systemctl restart redis
```

### Application Tuning

```bash
# Environment variables for performance
QUEUE_CONCURRENCY=10
DB_POOL_MAX=20
REDIS_POOL_MAX=10
```

## Security Considerations

### Environment Security

1. **Use strong secrets:**
   ```bash
   # Generate strong JWT secret
   openssl rand -base64 64
   
   # Generate webhook secret
   openssl rand -hex 32
   ```

2. **Secure database connections:**
   ```bash
   # Use SSL for database connections
   DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
   ```

3. **Network security:**
   - Use firewall rules to restrict access
   - Enable fail2ban for SSH protection
   - Use VPN for database access

### Application Security

1. **Rate limiting:** Already configured in the application
2. **Input validation:** Implemented via Joi schemas
3. **CORS:** Configure allowed origins in `.env`
4. **Helmet:** Security headers automatically added

## Troubleshooting

### Common Issues

1. **OAuth Authentication Fails:**
   ```bash
   # Check redirect URIs match exactly
   # Verify client ID and secret
   # Check OAuth provider settings
   ```

2. **Database Connection Issues:**
   ```bash
   # Test database connection
   psql $DATABASE_URL -c "SELECT 1;"
   
   # Check database logs
   sudo tail -f /var/log/postgresql/postgresql-*.log
   ```

3. **Queue Jobs Not Processing:**
   ```bash
   # Check Redis connection
   redis-cli ping
   
   # Check worker status
   docker-compose ps integration-worker
   
   # View worker logs
   docker-compose logs integration-worker
   ```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug docker-compose up -d

# View detailed logs
docker-compose logs -f
```

## Scaling

### Horizontal Scaling

```bash
# Scale API instances
docker-compose up -d --scale integration-api=3

# Scale worker instances
docker-compose up -d --scale integration-worker=5
```

### Load Balancing

Use nginx or a cloud load balancer to distribute traffic across multiple API instances.

### Database Scaling

Consider read replicas for heavy read workloads:

```bash
# Read replica configuration
READ_DATABASE_URL=postgresql://user:pass@read-replica:5432/db
```

## Maintenance

### Regular Maintenance Tasks

1. **Update dependencies:**
   ```bash
   npm audit
   npm update
   ```

2. **Clean up old data:**
   ```bash
   # Clean up old queue jobs
   ./scripts/cleanup.sh
   ```

3. **Monitor disk usage:**
   ```bash
   df -h
   du -sh /var/lib/docker/
   ```

4. **Update SSL certificates:**
   ```bash
   sudo certbot renew
   ```

This deployment guide provides comprehensive instructions for deploying the Integration Service in various environments with proper security, monitoring, and maintenance procedures.
