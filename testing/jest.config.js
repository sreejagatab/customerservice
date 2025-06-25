/**
 * Jest Configuration for Universal AI Customer Service Platform
 * Comprehensive testing setup for all services
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directories
  roots: [
    '<rootDir>/message-service',
    '<rootDir>/notification-service', 
    '<rootDir>/admin-service',
    '<rootDir>/ai-service',
    '<rootDir>/voice-service',
    '<rootDir>/analytics-service',
    '<rootDir>/integration-service'
  ],

  // Test patterns
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],

  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/testing/setup/jest.setup.ts'
  ],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/types/**/*',
    '!src/migrations/**/*'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/testing/$1'
  },

  // Test timeout
  testTimeout: 30000,

  // Parallel execution
  maxWorkers: '50%',

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Test projects for different types of tests
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/**/*.unit.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/**/*.integration.test.ts'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/testing/setup/integration.setup.ts']
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/**/*.e2e.test.ts'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/testing/setup/e2e.setup.ts']
    }
  ],

  // Global variables
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json'
    }
  },

  // Test result processor
  testResultsProcessor: '<rootDir>/testing/processors/test-results-processor.js'
};
