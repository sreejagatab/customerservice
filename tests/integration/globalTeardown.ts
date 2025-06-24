import { execSync } from 'child_process';

export default async function globalTeardown() {
  console.log('🧹 Global teardown for integration tests...');
  
  try {
    // Stop test infrastructure
    console.log('Stopping test infrastructure...');
    execSync('docker-compose -f docker-compose.test.yml down -v', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    
    console.log('✅ Global teardown completed');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  }
}
