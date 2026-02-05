/**
 * Vitest Global Setup
 * @module test/setup
 */

import { vi, beforeEach, afterEach, afterAll } from 'vitest';

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// Global teardown
afterAll(async () => {
  // Clean up any lingering resources
  vi.clearAllTimers();
});

// Mock console.warn and console.error to reduce noise in tests
// Comment out if you need to see these in tests
// vi.spyOn(console, 'warn').mockImplementation(() => {});
// vi.spyOn(console, 'error').mockImplementation(() => {});

// Global test utilities
globalThis.createMockFunction = () => vi.fn();
globalThis.createMockAsyncFunction = (returnValue) => vi.fn().mockResolvedValue(returnValue);
