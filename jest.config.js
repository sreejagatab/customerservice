/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Universal AI CS - Unit Tests',
  projects: [
    // Individual service configurations
    '<rootDir>/auth-service/jest.config.js',
    '<rootDir>/api-gateway/jest.config.js',
    '<rootDir>/ai-service/jest.config.js',
    '<rootDir>/integration-service/jest.config.js',
    '<rootDir>/message-service/jest.config.js',
    '<rootDir>/workflow-service/jest.config.js',
    '<rootDir>/analytics-service/jest.config.js',
    '<rootDir>/notification-service/jest.config.js',
    '<rootDir>/shared/jest.config.js',
    '<rootDir>/database/jest.config.js',
    '<rootDir>/frontend/jest.config.js',
  ],
  
  // Global coverage settings
  collectCoverage: true,
  collectCoverageFrom: [
    '**/src/**/*.{js,ts,tsx}',
    '!**/src/**/*.d.ts',
    '!**/src/**/index.ts',
    '!**/src/**/__tests__/**',
    '!**/src/**/*.test.{js,ts,tsx}',
    '!**/src/**/*.spec.{js,ts,tsx}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/coverage/**',
  ],
  
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
    'clover'
  ],
  
  // Enforce 90% coverage threshold
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    // Service-specific thresholds
    './auth-service/src/**/*.{js,ts}': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './api-gateway/src/**/*.{js,ts}': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './ai-service/src/**/*.{js,ts}': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './integration-service/src/**/*.{js,ts}': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './shared/src/**/*.{js,ts}': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Test environment
  testEnvironment: 'node',
  
  // Test patterns
  testMatch: [
    '**/__tests__/**/*.{js,ts}',
    '**/?(*.)+(spec|test).{js,ts}'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/tests/integration/',
    '/tests/e2e/',
    '/tests/performance/'
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  
  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/src/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest.setup.js'
  ],
  
  // Timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Error on deprecated features
  errorOnDeprecated: true,
  
  // Reporters
  reporters: [
    'default'
  ],
  
  // Notify on test results
  notify: false,
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ]
};
