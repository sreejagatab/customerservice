// Environment variables for integration tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Database
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/test_db';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Redis
process.env.TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6380';
process.env.REDIS_URL = process.env.TEST_REDIS_URL;

// RabbitMQ
process.env.TEST_RABBITMQ_URL = process.env.TEST_RABBITMQ_URL || 'amqp://guest:guest@localhost:5673';
process.env.RABBITMQ_URL = process.env.TEST_RABBITMQ_URL;

// JWT secrets
process.env.JWT_SECRET = 'test-jwt-secret-key-for-integration-tests';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-integration-tests';

// API URLs
process.env.API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';
process.env.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

// Test user credentials
process.env.TEST_USER_EMAIL = 'test@example.com';
process.env.TEST_USER_PASSWORD = 'TestPassword123!';
process.env.TEST_ADMIN_EMAIL = 'admin@example.com';
process.env.TEST_ADMIN_PASSWORD = 'AdminPassword123!';

// Disable external services in tests
process.env.DISABLE_EXTERNAL_APIS = 'true';
process.env.MOCK_EMAIL_SERVICE = 'true';
process.env.MOCK_AI_SERVICES = 'true';
