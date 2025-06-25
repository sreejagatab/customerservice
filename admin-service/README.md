# Admin Service - Universal AI Customer Service Platform

The Admin Service is the central management hub for the Universal AI Customer Service Platform, providing comprehensive user management, organization administration, role-based access control (RBAC), analytics, and system monitoring capabilities.

## 🚀 Features

### Core Administration
- **User Management**: Complete user lifecycle management with authentication and authorization
- **Organization Management**: Multi-tenant organization setup and configuration
- **Role-Based Access Control (RBAC)**: Granular permissions and role management
- **Audit Logging**: Comprehensive activity tracking and compliance reporting

### Analytics & Reporting
- **Real-time Analytics**: Cross-service metrics aggregation and reporting
- **Custom Dashboards**: Configurable dashboards with widgets and visualizations
- **Data Export**: Multiple format support (JSON, CSV, PDF, Excel)
- **Performance Monitoring**: System health and performance metrics

### System Management
- **Health Monitoring**: Service availability and performance tracking
- **Backup & Restore**: Automated backup scheduling and data recovery
- **Configuration Management**: Centralized system configuration
- **Integration Management**: Third-party service integration oversight

## 🏗️ Architecture

### Service Structure
```
admin-service/
├── src/
│   ├── config/           # Configuration management
│   ├── controllers/      # API route controllers
│   ├── middleware/       # Express middleware
│   ├── models/          # Data models and schemas
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   └── index.ts         # Application entry point
├── tests/
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── e2e/             # End-to-end tests
├── docs/                # API documentation
└── docker/              # Docker configuration
```

### Key Services
- **UserService**: User authentication, profile management, password policies
- **OrganizationService**: Multi-tenant organization management
- **RBACService**: Role-based access control and permissions
- **AnalyticsService**: Cross-service data aggregation and reporting
- **AuditService**: Activity logging and compliance tracking
- **HealthMonitoringService**: System health and alerting
- **BackupService**: Data backup and recovery

## 🔧 Configuration

### Environment Variables

#### Server Configuration
```bash
NODE_ENV=production
PORT=3001
SERVICE_NAME=admin-service
```

#### Database Configuration
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/universal_ai_cs
DB_HOST=localhost
DB_PORT=5432
DB_NAME=universal_ai_cs
DB_USER=admin_user
DB_PASSWORD=secure_password
DB_SSL=true
DB_POOL_MIN=2
DB_POOL_MAX=20
```

#### Redis Configuration
```bash
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
REDIS_DB=2
```

#### JWT Configuration
```bash
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=7d
```

#### External Services
```bash
MESSAGE_SERVICE_URL=http://localhost:3004
MESSAGE_SERVICE_API_KEY=message-service-api-key
NOTIFICATION_SERVICE_URL=http://localhost:3005
NOTIFICATION_SERVICE_API_KEY=notification-service-api-key
AI_SERVICE_URL=http://localhost:3003
AI_SERVICE_API_KEY=ai-service-api-key
INTEGRATION_SERVICE_URL=http://localhost:3002
INTEGRATION_SERVICE_API_KEY=integration-service-api-key
```

### Security Configuration
```bash
# Password Policy
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SYMBOLS=true
PASSWORD_SALT_ROUNDS=12

# Session Management
SESSION_TIMEOUT=3600
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker (optional)

### Installation

1. **Clone and Install Dependencies**
```bash
git clone <repository-url>
cd admin-service
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database Setup**
```bash
# Run migrations
npm run migrate

# Seed initial data
npm run seed
```

4. **Start Development Server**
```bash
npm run dev
```

### Docker Deployment

1. **Build Image**
```bash
docker build -t admin-service .
```

2. **Run Container**
```bash
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  admin-service
```

3. **Docker Compose**
```bash
docker-compose up -d
```

## 📚 API Documentation

### Authentication Endpoints

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecurePassword123!",
  "organizationId": "org-123",
  "twoFactorCode": "123456"
}
```

#### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh-token-here"
}
```

### User Management

#### Create User
```http
POST /api/v1/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "SecurePassword123!",
  "organizationId": "org-123",
  "roles": ["user"]
}
```

#### List Users
```http
GET /api/v1/users?organizationId=org-123&page=1&limit=20
Authorization: Bearer <token>
```

#### Update User
```http
PUT /api/v1/users/{userId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Jane",
  "timezone": "America/New_York"
}
```

### Organization Management

#### Create Organization
```http
POST /api/v1/organizations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Acme Corp",
  "description": "A technology company",
  "industry": "Technology",
  "size": "medium",
  "adminUser": {
    "email": "admin@acme.com",
    "firstName": "Admin",
    "lastName": "User",
    "password": "AdminPassword123!"
  }
}
```

#### Get Organization Usage
```http
GET /api/v1/organizations/{orgId}/usage
Authorization: Bearer <token>
```

### Analytics & Reporting

#### Generate Report
```http
GET /api/v1/analytics/reports?organizationId=org-123&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

#### Create Dashboard
```http
POST /api/v1/analytics/dashboards
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Operations Dashboard",
  "organizationId": "org-123",
  "widgets": [
    {
      "type": "metric",
      "title": "Total Messages",
      "position": { "x": 0, "y": 0, "width": 4, "height": 2 },
      "config": {
        "metricName": "messages.total",
        "timeRange": "7d"
      }
    }
  ]
}
```

### Health Monitoring

#### System Health
```http
GET /api/v1/health
```

#### Active Alerts
```http
GET /api/v1/health/alerts
Authorization: Bearer <token>
```

## 🔐 Security Features

### Authentication & Authorization
- **JWT-based Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Granular permission system
- **Multi-Factor Authentication**: TOTP support for enhanced security
- **Session Management**: Configurable session timeouts and lockouts

### Security Measures
- **Password Policies**: Configurable strength requirements
- **Rate Limiting**: API endpoint protection
- **Input Validation**: Comprehensive request validation
- **Audit Logging**: Complete activity tracking
- **IP Whitelisting**: Organization-level IP restrictions

### Compliance
- **GDPR Compliance**: Data protection and privacy controls
- **HIPAA Support**: Healthcare data security features
- **SOX Compliance**: Financial data audit trails
- **PCI DSS**: Payment data security measures

## 📊 Monitoring & Analytics

### Health Monitoring
- **Service Health Checks**: Automated service availability monitoring
- **Performance Metrics**: Response time and throughput tracking
- **Alert Management**: Configurable alerting rules and notifications
- **Infrastructure Monitoring**: Database, Redis, and system metrics

### Analytics Features
- **Cross-Service Metrics**: Aggregated data from all platform services
- **Custom Dashboards**: Configurable visualization dashboards
- **Report Generation**: Automated and on-demand reporting
- **Data Export**: Multiple format support for data extraction

### Key Metrics Tracked
- **User Activity**: Login patterns, feature usage, session duration
- **Message Processing**: Volume, response times, resolution rates
- **Notification Delivery**: Success rates, channel performance
- **System Performance**: Response times, error rates, resource usage
- **Cost Analysis**: Service costs, usage-based billing metrics

## 🔄 Backup & Recovery

### Automated Backups
- **Scheduled Backups**: Configurable backup schedules
- **Incremental Backups**: Efficient storage with change tracking
- **Multi-Type Backups**: Full system, configuration, and user data backups
- **Retention Policies**: Configurable backup retention periods

### Recovery Features
- **Point-in-Time Recovery**: Restore to specific timestamps
- **Selective Restore**: Choose specific data types to restore
- **Backup Verification**: Automated backup integrity checks
- **Disaster Recovery**: Complete system restoration capabilities

## 🧪 Testing

### Test Coverage
- **Unit Tests**: 95%+ code coverage
- **Integration Tests**: API endpoint testing
- **End-to-End Tests**: Complete workflow testing
- **Performance Tests**: Load and stress testing
- **Security Tests**: Vulnerability and penetration testing

### Running Tests
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Coverage report
npm run test:coverage

# Performance tests
npm run test:performance
```

## 🚀 Deployment

### Production Deployment
1. **Build Application**
```bash
npm run build
```

2. **Database Migration**
```bash
npm run migrate
```

3. **Start Production Server**
```bash
npm start
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: admin-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: admin-service
  template:
    metadata:
      labels:
        app: admin-service
    spec:
      containers:
      - name: admin-service
        image: admin-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: admin-secrets
              key: database-url
```

## 📈 Performance Optimization

### Caching Strategy
- **Redis Caching**: User sessions, permissions, and frequently accessed data
- **Query Optimization**: Database query performance tuning
- **Response Caching**: API response caching for read-heavy operations

### Scalability Features
- **Horizontal Scaling**: Stateless design for easy scaling
- **Load Balancing**: Support for multiple service instances
- **Database Connection Pooling**: Efficient database resource usage
- **Async Processing**: Background job processing for heavy operations

## 🤝 Contributing

### Development Guidelines
1. **Code Style**: Follow TypeScript and ESLint configurations
2. **Testing**: Maintain 95%+ test coverage
3. **Documentation**: Update API docs for any changes
4. **Security**: Follow security best practices
5. **Performance**: Consider performance impact of changes

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Update documentation
6. Submit pull request

## 📞 Support

### Documentation
- **API Documentation**: `/docs` endpoint when running
- **OpenAPI Spec**: Available at `/api-docs`
- **Postman Collection**: Import from `/postman` endpoint

### Troubleshooting
- **Logs**: Check application logs for error details
- **Health Endpoint**: Use `/health` for service status
- **Metrics**: Monitor performance metrics via `/metrics`

### Contact
- **Issues**: GitHub Issues
- **Security**: security@example.com
- **Support**: support@example.com

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
