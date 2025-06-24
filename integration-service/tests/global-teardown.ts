/**
 * Jest global teardown - runs once after all tests
 */

export default async (): Promise<void> => {
  console.log('🧹 Cleaning up Integration Service tests...');
  
  // Add any global cleanup here if needed
  
  console.log('✅ Integration Service test cleanup complete');
};
