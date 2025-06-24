/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Smoke Tests',
  testMatch: ['<rootDir>/tests/smoke/**/*.test.{js,ts}'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/smoke/setup.ts'],
  testTimeout: 60000, // Longer timeout for smoke tests
  maxWorkers: 1, // Run smoke tests sequentially
  verbose: true,
  collectCoverage: false, // Smoke tests don't need coverage
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/src/$1'
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],
  // Environment variables for smoke tests
  setupFiles: ['<rootDir>/tests/smoke/env.ts'],
  // Custom reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results/smoke',
      outputName: 'junit.xml',
      suiteName: 'Smoke Tests'
    }]
  ],
  // Retry failed tests more aggressively for smoke tests
  retry: 3,
  // Detect open handles
  detectOpenHandles: true,
  forceExit: true
};
