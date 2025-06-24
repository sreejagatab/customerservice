/**
 * Jest global setup - runs once before all tests
 */

export default async (): Promise<void> => {
  console.log('🚀 Setting up Integration Service tests...');
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  
  // Mock external dependencies that might not be available in test environment
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.MICROSOFT_CLIENT_ID = 'test-microsoft-client-id';
  process.env.MICROSOFT_CLIENT_SECRET = 'test-microsoft-client-secret';
  
  console.log('✅ Integration Service test setup complete');
};
