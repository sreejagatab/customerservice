import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TestDatabase } from '../utils/test-database';
import { TestRedis } from '../utils/test-redis';
import { TestServices } from '../utils/test-services';

// Global test setup for integration tests
let testDb: TestDatabase;
let testRedis: TestRedis;
let testServices: TestServices;

beforeAll(async () => {
  console.log('🚀 Setting up integration test environment...');
  
  // Initialize test database
  testDb = new TestDatabase();
  await testDb.setup();
  
  // Initialize test Redis
  testRedis = new TestRedis();
  await testRedis.setup();
  
  // Initialize test services
  testServices = new TestServices();
  await testServices.setup();
  
  console.log('✅ Integration test environment ready');
}, 60000);

afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...');
  
  // Cleanup in reverse order
  if (testServices) {
    await testServices.cleanup();
  }
  
  if (testRedis) {
    await testRedis.cleanup();
  }
  
  if (testDb) {
    await testDb.cleanup();
  }
  
  console.log('✅ Integration test environment cleaned up');
}, 30000);

beforeEach(async () => {
  // Reset database state before each test
  if (testDb) {
    await testDb.reset();
  }
  
  // Clear Redis cache before each test
  if (testRedis) {
    await testRedis.clear();
  }
});

afterEach(async () => {
  // Clean up any test data after each test
  if (testServices) {
    await testServices.resetState();
  }
});

// Make test utilities available globally
declare global {
  var testDb: TestDatabase;
  var testRedis: TestRedis;
  var testServices: TestServices;
}

global.testDb = testDb;
global.testRedis = testRedis;
global.testServices = testServices;
