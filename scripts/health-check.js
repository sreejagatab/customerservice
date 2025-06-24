#!/usr/bin/env node

const http = require('http');
const https = require('https');

// Service endpoints to check
const services = [
  {
    name: 'API Gateway',
    url: process.env.API_GATEWAY_URL || 'http://localhost:3000/health',
    critical: true,
  },
  {
    name: 'Auth Service',
    url: process.env.AUTH_SERVICE_URL || 'http://localhost:3001/health',
    critical: true,
  },
  {
    name: 'Integration Service',
    url: process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3002/health',
    critical: false,
  },
  {
    name: 'AI Service',
    url: process.env.AI_SERVICE_URL || 'http://localhost:3003/health',
    critical: false,
  },
  {
    name: 'Message Service',
    url: process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004/health',
    critical: false,
  },
  {
    name: 'Frontend',
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
    critical: true,
  },
];

// Database and infrastructure checks
const infrastructure = [
  {
    name: 'PostgreSQL',
    check: checkPostgreSQL,
    critical: true,
  },
  {
    name: 'Redis',
    check: checkRedis,
    critical: true,
  },
  {
    name: 'RabbitMQ',
    check: checkRabbitMQ,
    critical: false,
  },
];

async function checkService(service) {
  return new Promise((resolve) => {
    const url = new URL(service.url);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout: 5000,
    };

    const startTime = Date.now();
    
    const req = client.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      const isHealthy = res.statusCode >= 200 && res.statusCode < 300;
      
      resolve({
        name: service.name,
        url: service.url,
        status: isHealthy ? 'healthy' : 'unhealthy',
        statusCode: res.statusCode,
        responseTime,
        critical: service.critical,
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      resolve({
        name: service.name,
        url: service.url,
        status: 'unhealthy',
        error: error.message,
        responseTime,
        critical: service.critical,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      resolve({
        name: service.name,
        url: service.url,
        status: 'unhealthy',
        error: 'Timeout',
        responseTime,
        critical: service.critical,
      });
    });

    req.end();
  });
}

async function checkPostgreSQL() {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    
    const startTime = Date.now();
    const result = await pool.query('SELECT 1 as health_check');
    const responseTime = Date.now() - startTime;
    
    await pool.end();
    
    return {
      name: 'PostgreSQL',
      status: result.rows[0].health_check === 1 ? 'healthy' : 'unhealthy',
      responseTime,
      critical: true,
    };
  } catch (error) {
    return {
      name: 'PostgreSQL',
      status: 'unhealthy',
      error: error.message,
      critical: true,
    };
  }
}

async function checkRedis() {
  try {
    const { createClient } = require('redis');
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000,
      },
    });
    
    const startTime = Date.now();
    await client.connect();
    const result = await client.ping();
    const responseTime = Date.now() - startTime;
    
    await client.disconnect();
    
    return {
      name: 'Redis',
      status: result === 'PONG' ? 'healthy' : 'unhealthy',
      responseTime,
      critical: true,
    };
  } catch (error) {
    return {
      name: 'Redis',
      status: 'unhealthy',
      error: error.message,
      critical: true,
    };
  }
}

async function checkRabbitMQ() {
  try {
    // Simple HTTP check to RabbitMQ management API
    const managementUrl = process.env.RABBITMQ_MANAGEMENT_URL || 'http://localhost:15672/api/overview';
    
    return new Promise((resolve) => {
      const url = new URL(managementUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        timeout: 5000,
        auth: 'guest:guest', // Default credentials
      };

      const startTime = Date.now();
      
      const req = http.request(options, (res) => {
        const responseTime = Date.now() - startTime;
        const isHealthy = res.statusCode >= 200 && res.statusCode < 300;
        
        resolve({
          name: 'RabbitMQ',
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime,
          critical: false,
        });
      });

      req.on('error', (error) => {
        resolve({
          name: 'RabbitMQ',
          status: 'unhealthy',
          error: error.message,
          critical: false,
        });
      });

      req.end();
    });
  } catch (error) {
    return {
      name: 'RabbitMQ',
      status: 'unhealthy',
      error: error.message,
      critical: false,
    };
  }
}

async function runHealthChecks() {
  console.log('🏥 Running health checks...\n');
  
  const results = {
    services: [],
    infrastructure: [],
    overall: 'healthy',
    timestamp: new Date().toISOString(),
  };

  // Check services
  console.log('📡 Checking services...');
  for (const service of services) {
    const result = await checkService(service);
    results.services.push(result);
    
    const status = result.status === 'healthy' ? '✅' : '❌';
    const responseTime = result.responseTime ? `(${result.responseTime}ms)` : '';
    const error = result.error ? ` - ${result.error}` : '';
    
    console.log(`${status} ${result.name} ${responseTime}${error}`);
    
    if (result.status !== 'healthy' && result.critical) {
      results.overall = 'unhealthy';
    }
  }

  // Check infrastructure
  console.log('\n🏗️  Checking infrastructure...');
  for (const infra of infrastructure) {
    const result = await infra.check();
    results.infrastructure.push(result);
    
    const status = result.status === 'healthy' ? '✅' : '❌';
    const responseTime = result.responseTime ? `(${result.responseTime}ms)` : '';
    const error = result.error ? ` - ${result.error}` : '';
    
    console.log(`${status} ${result.name} ${responseTime}${error}`);
    
    if (result.status !== 'healthy' && result.critical) {
      results.overall = 'unhealthy';
    }
  }

  // Summary
  console.log('\n📊 Health Check Summary:');
  console.log(`Overall Status: ${results.overall === 'healthy' ? '✅ Healthy' : '❌ Unhealthy'}`);
  
  const totalChecks = results.services.length + results.infrastructure.length;
  const healthyChecks = [...results.services, ...results.infrastructure]
    .filter(r => r.status === 'healthy').length;
  
  console.log(`Healthy: ${healthyChecks}/${totalChecks}`);
  
  if (process.env.OUTPUT_JSON) {
    console.log('\n📄 JSON Output:');
    console.log(JSON.stringify(results, null, 2));
  }

  // Exit with appropriate code
  process.exit(results.overall === 'healthy' ? 0 : 1);
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--json')) {
  process.env.OUTPUT_JSON = 'true';
}

// Run health checks
runHealthChecks().catch((error) => {
  console.error('❌ Health check failed:', error);
  process.exit(1);
});
