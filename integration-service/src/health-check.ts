/**
 * Health check script for Docker containers
 */

import http from 'http';
import { config } from './config';

const healthCheck = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: config.port,
      path: '/health',
      method: 'GET',
      timeout: config.healthCheck.timeout,
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Health check failed with status ${res.statusCode}`));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });

    req.end();
  });
};

// Run health check
healthCheck()
  .then(() => {
    console.log('Health check passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Health check failed:', error.message);
    process.exit(1);
  });
