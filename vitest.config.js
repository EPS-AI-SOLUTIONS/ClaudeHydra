/**
 * Vitest Configuration for ClaudeHydra Backend
 * @module vitest.config
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    // Test environment
    environment: 'node',

    // Test file patterns
    include: [
      'test/**/*.test.{js,ts}',
      'test/**/*.spec.{js,ts}',
      'src/**/*.test.{js,ts}',
      'src/**/*.spec.{js,ts}',
    ],

    // Exclude patterns
    exclude: ['node_modules/**', 'claude-gui/**', 'test/e2e/**'],

    // Global test timeout
    testTimeout: 30000,

    // Hook timeout
    hookTimeout: 30000,

    // Enable globals (describe, it, expect)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'src/**/*.test.{js,ts}',
        'src/**/*.spec.{js,ts}',
        'node_modules/**',
        'claude-gui/**',
        'test/**',
      ],
      // Realistic thresholds - to be increased as coverage improves
      thresholds: {
        statements: 5,
        branches: 5,
        functions: 5,
        lines: 5,
      },
    },

    // Reporters
    reporters: ['verbose'],

    // Setup files
    setupFiles: ['./test/setup.js'],

    // Pool options for better performance
    pool: 'forks',

    // Isolation
    isolate: true,

    // Retry flaky tests
    retry: 1,

    // Watch mode exclude
    watchExclude: ['node_modules/**', 'coverage/**'],
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
