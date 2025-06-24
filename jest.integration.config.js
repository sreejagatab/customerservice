/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Integration Tests',
  testMatch: ['<rootDir>/tests/integration/**/*.test.{js,ts}'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/integration/globalTeardown.ts',
  testTimeout: 30000,
  maxWorkers: 1, // Run integration tests sequentially
  verbose: true,
  collectCoverage: false, // Integration tests don't need coverage
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
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/dist/',
    '/build/'
  ],
  // Environment variables for integration tests
  setupFiles: ['<rootDir>/tests/integration/env.ts'],
  // Coverage thresholds for integration tests
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  // Custom reporters
  reporters: [
    'default'
  ],
  // Detect open handles
  detectOpenHandles: true,
  forceExit: true
};
