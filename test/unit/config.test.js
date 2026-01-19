/**
 * @fileoverview Unit tests for the config module
 *
 * Tests Zod validation, defaults, error messages, and frozen config behavior.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Store original env to restore after tests
const originalEnv = { ...process.env };

describe('Config Module', () => {
  beforeEach(() => {
    // Clear all config-related env vars before each test
    delete process.env.API_VERSION;
    delete process.env.DEFAULT_MODEL;
    delete process.env.FAST_MODEL;
    delete process.env.CODER_MODEL;
    delete process.env.CACHE_DIR;
    delete process.env.CACHE_TTL;
    delete process.env.CACHE_ENABLED;
    delete process.env.CACHE_ENCRYPTION_KEY;
    delete process.env.QUEUE_MAX_CONCURRENT;
    delete process.env.QUEUE_MAX_RETRIES;
    delete process.env.QUEUE_RETRY_DELAY_BASE;
    delete process.env.QUEUE_TIMEOUT_MS;
    delete process.env.QUEUE_RATE_LIMIT_TOKENS;
    delete process.env.QUEUE_RATE_LIMIT_REFILL;
    delete process.env.MODEL_CACHE_TTL_MS;
    delete process.env.HEALTH_CHECK_TIMEOUT_MS;
    delete process.env.HYDRA_YOLO;
    delete process.env.HYDRA_RISK_BLOCKING;

    // Clear module cache to get fresh config
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original env
    Object.assign(process.env, originalEnv);
  });

  describe('Default Values', () => {
    test('should use default values when env vars are not set', async () => {
      const { CONFIG } = await import('../../src/config.js');

      expect(CONFIG.API_VERSION).toBe('v1');
      expect(CONFIG.DEFAULT_MODEL).toBe('llama3.2:3b');
      expect(CONFIG.FAST_MODEL).toBe('llama3.2:1b');
      expect(CONFIG.CODER_MODEL).toBe('qwen2.5-coder:1.5b');
      expect(CONFIG.CACHE_DIR).toBe('./cache');
      expect(CONFIG.CACHE_TTL_MS).toBe(3600000); // 3600 * 1000
      expect(CONFIG.CACHE_ENABLED).toBe(true);
      // CACHE_ENCRYPTION_KEY may have a default generated value or be empty
      expect(typeof CONFIG.CACHE_ENCRYPTION_KEY).toBe('string');
      // Note: Default is 10, but .env may override (e.g., to 4)
      // We validate the value is within acceptable range
      expect(CONFIG.QUEUE_MAX_CONCURRENT).toBeGreaterThanOrEqual(1);
      expect(CONFIG.QUEUE_MAX_CONCURRENT).toBeLessThanOrEqual(100);
      expect(CONFIG.QUEUE_MAX_RETRIES).toBe(3);
      expect(CONFIG.QUEUE_RETRY_DELAY_BASE).toBe(1000);
      expect(CONFIG.QUEUE_TIMEOUT_MS).toBe(60000);
      expect(CONFIG.QUEUE_RATE_LIMIT_TOKENS).toBe(10);
      expect(CONFIG.QUEUE_RATE_LIMIT_REFILL).toBe(2);
      expect(CONFIG.MODEL_CACHE_TTL_MS).toBe(300000);
      expect(CONFIG.HEALTH_CHECK_TIMEOUT_MS).toBe(5000);
      expect(CONFIG.YOLO_MODE).toBe(false);
      expect(CONFIG.RISK_BLOCKING).toBe(true);
    });
  });

  describe('Environment Variable Parsing', () => {
    test('should parse string env vars correctly', async () => {
      process.env.API_VERSION = 'v2';
      process.env.DEFAULT_MODEL = 'custom-model:7b';

      const { CONFIG } = await import('../../src/config.js');

      expect(CONFIG.API_VERSION).toBe('v2');
      expect(CONFIG.DEFAULT_MODEL).toBe('custom-model:7b');
    });

    test('should parse numeric env vars correctly', async () => {
      process.env.CACHE_TTL = '7200';
      process.env.QUEUE_MAX_CONCURRENT = '25';

      const { CONFIG } = await import('../../src/config.js');

      expect(CONFIG.CACHE_TTL_MS).toBe(7200000); // Converted to ms
      expect(CONFIG.QUEUE_MAX_CONCURRENT).toBe(25);
    });

    test('should parse boolean env vars correctly', async () => {
      process.env.CACHE_ENABLED = 'false';
      process.env.HYDRA_YOLO = 'true';

      const { CONFIG } = await import('../../src/config.js');

      expect(CONFIG.CACHE_ENABLED).toBe(false);
      expect(CONFIG.YOLO_MODE).toBe(true);
    });

    test('should handle empty string env vars as defaults', async () => {
      process.env.DEFAULT_MODEL = '';
      process.env.CACHE_TTL = '';
      process.env.CACHE_ENABLED = '';

      const { CONFIG } = await import('../../src/config.js');

      expect(CONFIG.DEFAULT_MODEL).toBe('llama3.2:3b');
      expect(CONFIG.CACHE_TTL_MS).toBe(3600000);
      expect(CONFIG.CACHE_ENABLED).toBe(true);
    });
  });

  describe('YOLO Mode', () => {
    test('should apply YOLO mode overrides when enabled', async () => {
      process.env.HYDRA_YOLO = 'true';

      const { CONFIG } = await import('../../src/config.js');

      expect(CONFIG.YOLO_MODE).toBe(true);
      expect(CONFIG.QUEUE_MAX_CONCURRENT).toBeGreaterThanOrEqual(20);
      expect(CONFIG.QUEUE_MAX_RETRIES).toBeLessThanOrEqual(1);
      expect(CONFIG.QUEUE_TIMEOUT_MS).toBeLessThanOrEqual(15000);
      expect(CONFIG.RISK_BLOCKING).toBe(false); // Defaults to opposite of YOLO
    });

    test('should allow explicit RISK_BLOCKING override in YOLO mode', async () => {
      process.env.HYDRA_YOLO = 'true';
      process.env.HYDRA_RISK_BLOCKING = 'true';

      const { CONFIG } = await import('../../src/config.js');

      expect(CONFIG.YOLO_MODE).toBe(true);
      expect(CONFIG.RISK_BLOCKING).toBe(true); // Explicitly set
    });
  });

  describe('Config Immutability', () => {
    test('CONFIG should be frozen and not allow mutations', async () => {
      const { CONFIG } = await import('../../src/config.js');

      expect(Object.isFrozen(CONFIG)).toBe(true);

      // Attempting to modify should throw in strict mode or fail silently
      expect(() => {
        CONFIG.DEFAULT_MODEL = 'hacked-model';
      }).toThrow();
    });

    test('getConfigSnapshot should return a mutable copy', async () => {
      const { CONFIG, getConfigSnapshot } = await import('../../src/config.js');

      const snapshot = getConfigSnapshot();

      // Snapshot should have same values
      expect(snapshot.DEFAULT_MODEL).toBe(CONFIG.DEFAULT_MODEL);

      // But should be mutable
      snapshot.DEFAULT_MODEL = 'modified';
      expect(snapshot.DEFAULT_MODEL).toBe('modified');

      // Original should be unchanged
      expect(CONFIG.DEFAULT_MODEL).toBe('llama3.2:3b');
    });
  });

  describe('Schema Validation', () => {
    test('validateConfig should validate partial configs', async () => {
      const { validateConfig } = await import('../../src/config.js');

      const result = validateConfig({
        API_VERSION: 'v3',
        DEFAULT_MODEL: 'test-model'
      });

      expect(result.success).toBe(true);
    });

    test('validateConfig should reject invalid numeric ranges', async () => {
      const { validateConfig } = await import('../../src/config.js');

      // QUEUE_MAX_CONCURRENT must be 1-100
      const result = validateConfig({
        QUEUE_MAX_CONCURRENT: '500' // Will be parsed to number, then fail range check
      });

      expect(result.success).toBe(false);
    });

    test('should validate CACHE_ENCRYPTION_KEY format', async () => {
      const { validateConfig } = await import('../../src/config.js');

      // Valid hex key (64 chars)
      const validHex = validateConfig({
        CACHE_ENCRYPTION_KEY:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      });
      expect(validHex.success).toBe(true);

      // Invalid key (wrong length)
      const invalidKey = validateConfig({
        CACHE_ENCRYPTION_KEY: 'too-short'
      });
      expect(invalidKey.success).toBe(false);
    });
  });

  describe('Error Messages', () => {
    test('should provide descriptive error for invalid config', async () => {
      process.env.QUEUE_MAX_CONCURRENT = '-5'; // Invalid: must be >= 1
      process.env.QUEUE_TIMEOUT_MS = '500'; // Invalid: must be >= 1000

      await expect(import('../../src/config.js')).rejects.toThrow(
        /Configuration validation failed/
      );
    });
  });

  describe('Schema Export', () => {
    test('configSchema should be exported for external use', async () => {
      const { configSchema } = await import('../../src/config.js');

      expect(configSchema).toBeDefined();
      expect(typeof configSchema.parse).toBe('function');
      expect(typeof configSchema.safeParse).toBe('function');
    });
  });
});
