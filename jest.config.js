module.exports = {
  testEnvironment: 'node',
  verbose: true,
  roots: ['<rootDir>/test'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/', '/test/e2e/'],
  testMatch: ['**/*.test.js', '**/*.spec.js']
};
