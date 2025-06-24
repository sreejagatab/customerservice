import { execSync } from 'child_process';
import { config } from 'dotenv';
import path from 'path';

// Load test environment variables
config({ path: path.join(__dirname, '.env.test') });

export default async function globalSetup() {
  console.log('🔧 Global setup for integration tests...');
  
  try {
    // Start test infrastructure with Docker Compose
    console.log('Starting test infrastructure...');
    execSync('docker-compose -f docker-compose.test.yml up -d postgres redis rabbitmq', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    
    // Wait for services to be ready
    console.log('Waiting for services to be ready...');
    await waitForServices();
    
    // Run database migrations
    console.log('Running database migrations...');
    execSync('npm run db:migrate', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
      },
    });
    
    console.log('✅ Global setup completed');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

async function waitForServices(): Promise<void> {
  const maxRetries = 30;
  const retryDelay = 2000;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Check PostgreSQL
      execSync('docker-compose -f docker-compose.test.yml exec -T postgres pg_isready -U postgres', {
        stdio: 'pipe',
      });
      
      // Check Redis
      execSync('docker-compose -f docker-compose.test.yml exec -T redis redis-cli ping', {
        stdio: 'pipe',
      });
      
      // Check RabbitMQ
      execSync('docker-compose -f docker-compose.test.yml exec -T rabbitmq rabbitmq-diagnostics ping', {
        stdio: 'pipe',
      });
      
      console.log('✅ All services are ready');
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error('Services failed to start within timeout');
      }
      
      console.log(`⏳ Waiting for services... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}
