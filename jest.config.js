export default {
  testEnvironment: 'node',
  verbose: true,
  roots: ['<rootDir>/test'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/', '/test/e2e/'],
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  // Handle async operations cleanup
  testTimeout: 10000,
  // Clear mocks and reset modules between tests
  clearMocks: true,
  resetModules: false,
  // Global setup/teardown for cleanup
  globalTeardown: '<rootDir>/test/teardown.js'
};