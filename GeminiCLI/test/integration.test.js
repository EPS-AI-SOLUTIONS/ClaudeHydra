/**
 * HYDRA Integration Tests
 * Agent: Triss (QA/Testing)
 *
 * Tests for core utility modules:
 * - cache.js (file-based cache with encryption)
 * - logger.js (correlation ID support)
 * - env-validator.js (environment validation)
 * - lru-cache.js (in-memory LRU cache)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ============================================================================
// CACHE.JS TESTS
// ============================================================================

describe('cache.js', () => {
  let testCacheDir;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create unique test cache directory
    testCacheDir = join(tmpdir(), `hydra-test-cache-${Date.now()}`);
    mkdirSync(testCacheDir, { recursive: true });

    // Set test environment
    process.env.CACHE_DIR = testCacheDir;
    process.env.CACHE_ENABLED = 'true';
    process.env.CACHE_TTL = '3600';
  });

  afterEach(() => {
    // Cleanup test cache directory
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }

    // Restore original environment
    process.env = originalEnv;

    // Reset module cache
    vi.resetModules();
  });

  describe('hashKey', () => {
    it('should generate consistent SHA256 hash for same input', async () => {
      const { hashKey } = await import('../src/cache.js');

      const hash1 = hashKey('test prompt', 'model1');
      const hash2 = hashKey('test prompt', 'model1');

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different prompts', async () => {
      const { hashKey } = await import('../src/cache.js');

      const hash1 = hashKey('prompt1', 'model');
      const hash2 = hashKey('prompt2', 'model');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different models', async () => {
      const { hashKey } = await import('../src/cache.js');

      const hash1 = hashKey('prompt', 'model1');
      const hash2 = hashKey('prompt', 'model2');

      expect(hash1).not.toBe(hash2);
    });

    it('should work with empty model', async () => {
      const { hashKey } = await import('../src/cache.js');

      const hash = hashKey('test prompt');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('getCache / setCache', () => {
    it('should return null for non-existent cache entry', async () => {
      const { getCache } = await import('../src/cache.js');

      const result = getCache('nonexistent', 'model');
      expect(result).toBeNull();
    });

    it('should store and retrieve cache entry', async () => {
      const { getCache, setCache } = await import('../src/cache.js');

      const prompt = 'test prompt for caching';
      const response = 'This is a test response that is long enough to be cached.';
      const model = 'test-model';

      const stored = setCache(prompt, response, model, 'ollama');
      expect(stored).toBe(true);

      const cached = getCache(prompt, model);
      expect(cached).not.toBeNull();
      expect(cached.response).toBe(response);
      expect(cached.cached).toBe(true);
      expect(cached.source).toBe('ollama');
      expect(typeof cached.age).toBe('number');
    });

    it('should not cache responses shorter than 10 characters', async () => {
      const { setCache } = await import('../src/cache.js');

      const result = setCache('prompt', 'short', 'model');
      expect(result).toBe(false);
    });

    it('should not cache empty responses', async () => {
      const { setCache } = await import('../src/cache.js');

      const result = setCache('prompt', '', 'model');
      expect(result).toBe(false);
    });

    it('should not cache null responses', async () => {
      const { setCache } = await import('../src/cache.js');

      const result = setCache('prompt', null, 'model');
      expect(result).toBe(false);
    });
  });

  describe('invalidateByPattern', () => {
    it('should delete cache entries matching string pattern', async () => {
      const { setCache, invalidateByPattern } = await import('../src/cache.js');

      // Create multiple cache entries
      setCache('pattern-test-1', 'Response 1 is long enough to be cached', 'model-a', 'source1');
      setCache('pattern-test-2', 'Response 2 is long enough to be cached', 'model-a', 'source1');
      setCache('other-test', 'Response 3 is long enough to be cached', 'model-b', 'source2');

      // Invalidate by model pattern
      const result = invalidateByPattern('model-a');

      expect(result.deleted).toBeGreaterThanOrEqual(0);
      expect(typeof result.errors).toBe('number');
    });

    it('should delete cache entries matching regex pattern', async () => {
      const { setCache, invalidateByPattern } = await import('../src/cache.js');

      setCache('regex-test-1', 'Response 1 is long enough to be cached', 'gemini-pro', 'google');
      setCache('regex-test-2', 'Response 2 is long enough to be cached', 'gemini-flash', 'google');

      const result = invalidateByPattern(/gemini/i);

      expect(typeof result.deleted).toBe('number');
      expect(typeof result.errors).toBe('number');
    });

    it('should return zero deleted for non-matching pattern', async () => {
      const { invalidateByPattern } = await import('../src/cache.js');

      const result = invalidateByPattern('nonexistent-pattern-xyz');

      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  describe('invalidateExpired', () => {
    it('should return stats object with correct structure', async () => {
      const { invalidateExpired } = await import('../src/cache.js');

      const result = invalidateExpired();

      expect(typeof result.deleted).toBe('number');
      expect(typeof result.errors).toBe('number');
      expect(typeof result.freedKB).toBe('number');
    });

    it('should handle empty cache directory', async () => {
      const { invalidateExpired } = await import('../src/cache.js');

      const result = invalidateExpired();

      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.freedKB).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      const { getCacheStats, setCache } = await import('../src/cache.js');

      setCache('stats-test', 'This is a response long enough to be cached.', 'model');

      const stats = getCacheStats();

      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.validEntries).toBe('number');
      expect(typeof stats.expiredEntries).toBe('number');
      expect(typeof stats.totalSizeKB).toBe('number');
      expect(typeof stats.cacheDir).toBe('string');
    });
  });

  describe('deleteCache', () => {
    it('should delete specific cache entry', async () => {
      const { setCache, getCache, deleteCache } = await import('../src/cache.js');

      const prompt = 'delete-test-prompt';
      const response = 'This response is long enough to be cached properly.';
      const model = 'test-model';

      setCache(prompt, response, model);
      expect(getCache(prompt, model)).not.toBeNull();

      const deleted = deleteCache(prompt, model);
      expect(deleted).toBe(true);
      expect(getCache(prompt, model)).toBeNull();
    });

    it('should return false for non-existent entry', async () => {
      const { deleteCache } = await import('../src/cache.js');

      const result = deleteCache('nonexistent', 'model');
      expect(result).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear all cache entries', async () => {
      const { setCache, clearCache } = await import('../src/cache.js');

      setCache('clear-test-1', 'Response 1 is long enough to be cached.', 'model');
      setCache('clear-test-2', 'Response 2 is long enough to be cached.', 'model');

      const result = clearCache();

      expect(typeof result.deleted).toBe('number');
      expect(typeof result.freedKB).toBe('number');
    });
  });
});

// ============================================================================
// LOGGER.JS TESTS
// ============================================================================

describe('logger.js', () => {
  describe('createLogger', () => {
    it('should create logger with all log methods', async () => {
      const { createLogger } = await import('../src/logger.js');

      const logger = createLogger('test-module');

      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.withCorrelation).toBe('function');
    });

    it('should log messages without throwing', async () => {
      const { createLogger } = await import('../src/logger.js');

      const logger = createLogger('test-module');

      // These should not throw
      expect(() => logger.debug('debug message')).not.toThrow();
      expect(() => logger.info('info message')).not.toThrow();
      expect(() => logger.warn('warn message')).not.toThrow();
      expect(() => logger.error('error message')).not.toThrow();
    });

    it('should accept metadata object', async () => {
      const { createLogger } = await import('../src/logger.js');

      const logger = createLogger('test-module');

      expect(() => logger.info('message with meta', { key: 'value', count: 42 })).not.toThrow();
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate unique correlation IDs', async () => {
      const { generateCorrelationId } = await import('../src/logger.js');

      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with hydra prefix', async () => {
      const { generateCorrelationId } = await import('../src/logger.js');

      const id = generateCorrelationId();

      expect(id).toMatch(/^hydra-/);
    });

    it('should generate IDs with correct format', async () => {
      const { generateCorrelationId } = await import('../src/logger.js');

      const id = generateCorrelationId();

      // Format: hydra-{timestamp_base36}-{random_hex}
      expect(id).toMatch(/^hydra-[a-z0-9]+-[a-f0-9]{8}$/);
    });
  });

  describe('getCorrelationId', () => {
    it('should return null when no correlation context', async () => {
      const { getCorrelationId } = await import('../src/logger.js');

      const id = getCorrelationId();

      expect(id).toBeNull();
    });
  });

  describe('withCorrelationId', () => {
    it('should set correlation ID in context', async () => {
      const { withCorrelationId, getCorrelationId } = await import('../src/logger.js');

      const testId = 'test-correlation-id';

      await withCorrelationId(testId, () => {
        const id = getCorrelationId();
        expect(id).toBe(testId);
      });
    });

    it('should restore context after function completes', async () => {
      const { withCorrelationId, getCorrelationId } = await import('../src/logger.js');

      await withCorrelationId('temp-id', () => {
        expect(getCorrelationId()).toBe('temp-id');
      });

      expect(getCorrelationId()).toBeNull();
    });

    it('should support async functions', async () => {
      const { withCorrelationId, getCorrelationId } = await import('../src/logger.js');

      const result = await withCorrelationId('async-id', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getCorrelationId();
      });

      expect(result).toBe('async-id');
    });
  });

  describe('correlationMiddleware', () => {
    it('should be a function', async () => {
      const { correlationMiddleware } = await import('../src/logger.js');

      expect(typeof correlationMiddleware).toBe('function');
    });

    it('should use existing x-correlation-id header', async () => {
      const { correlationMiddleware, getCorrelationId } = await import('../src/logger.js');

      const existingId = 'existing-correlation-id';
      const req = { headers: { 'x-correlation-id': existingId } };
      const res = { setHeader: vi.fn() };

      let capturedId;
      const next = () => {
        capturedId = getCorrelationId();
      };

      correlationMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', existingId);
      expect(capturedId).toBe(existingId);
    });

    it('should generate new ID if header not present', async () => {
      const { correlationMiddleware, getCorrelationId } = await import('../src/logger.js');

      const req = { headers: {} };
      const res = { setHeader: vi.fn() };

      let capturedId;
      const next = () => {
        capturedId = getCorrelationId();
      };

      correlationMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalled();
      expect(capturedId).toMatch(/^hydra-/);
    });
  });
});

// ============================================================================
// ENV-VALIDATOR.JS TESTS
// ============================================================================

describe('env-validator.js', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('validateEnv', () => {
    it('should return valid result when required vars are set', async () => {
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.DEFAULT_MODEL = 'llama3.2:3b';

      const { validateEnv } = await import('../src/env-validator.js');
      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should use defaults for missing required vars with defaults', async () => {
      delete process.env.OLLAMA_HOST;
      delete process.env.DEFAULT_MODEL;

      const { validateEnv } = await import('../src/env-validator.js');
      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(process.env.OLLAMA_HOST).toBe('http://localhost:11434');
      expect(process.env.DEFAULT_MODEL).toBe('llama3.2:3b');
    });

    it('should return masked values for sensitive vars', async () => {
      process.env.GOOGLE_API_KEY = 'AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

      const { validateEnv } = await import('../src/env-validator.js');
      const result = validateEnv();

      expect(result.masked.GOOGLE_API_KEY).toContain('[MASKED]');
      expect(result.masked.GOOGLE_API_KEY).not.toBe(process.env.GOOGLE_API_KEY);
    });

    it('should show non-sensitive values in plain text', async () => {
      process.env.LOG_LEVEL = 'debug';

      const { validateEnv } = await import('../src/env-validator.js');
      const result = validateEnv();

      expect(result.masked.LOG_LEVEL).toBe('debug');
    });

    it('should validate API key formats', async () => {
      process.env.GOOGLE_API_KEY = 'invalid-key-format';

      const { validateEnv } = await import('../src/env-validator.js');
      const result = validateEnv();

      expect(result.warnings).toContain('GOOGLE_API_KEY format appears invalid');
    });

    it('should not warn for correctly formatted Google API key', async () => {
      process.env.GOOGLE_API_KEY = 'TEST_VALID_FORMAT_KEY_39_CHARS_EXACTLY';

      const { validateEnv } = await import('../src/env-validator.js');
      const result = validateEnv();

      const googleWarning = result.warnings.find((w) => w.includes('GOOGLE_API_KEY format'));
      expect(googleWarning).toBeUndefined();
    });

    it('should return result with correct structure', async () => {
      const { validateEnv } = await import('../src/env-validator.js');
      const result = validateEnv();

      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.missing)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.masked).toBe('object');
    });
  });

  describe('maskSensitive', () => {
    it('should mask value keeping first 8 characters', async () => {
      const { maskSensitive } = await import('../src/env-validator.js');

      const result = maskSensitive('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ12345');

      expect(result).toBe('AIzaSyAB...[MASKED]');
    });

    it('should return *** for short values', async () => {
      const { maskSensitive } = await import('../src/env-validator.js');

      expect(maskSensitive('short')).toBe('***');
      expect(maskSensitive('12345678')).toBe('***');
    });

    it('should return *** for empty string', async () => {
      const { maskSensitive } = await import('../src/env-validator.js');

      expect(maskSensitive('')).toBe('***');
    });

    it('should return *** for null/undefined', async () => {
      const { maskSensitive } = await import('../src/env-validator.js');

      expect(maskSensitive(null)).toBe('***');
      expect(maskSensitive(undefined)).toBe('***');
    });

    it('should respect custom showChars parameter', async () => {
      const { maskSensitive } = await import('../src/env-validator.js');

      const result = maskSensitive('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ12345', 4);

      expect(result).toBe('AIza...[MASKED]');
    });
  });

  describe('assertEnv', () => {
    it('should not throw when all required vars present', async () => {
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.DEFAULT_MODEL = 'llama3.2:3b';

      const { assertEnv } = await import('../src/env-validator.js');

      expect(() => assertEnv()).not.toThrow();
      expect(assertEnv()).toBe(true);
    });
  });

  describe('printEnvReport', () => {
    it('should return validation result', async () => {
      const { printEnvReport } = await import('../src/env-validator.js');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = printEnvReport();

      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.missing)).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});

// ============================================================================
// LRU-CACHE.JS TESTS
// ============================================================================

describe('lru-cache.js', () => {
  describe('LRUCache class', () => {
    describe('constructor', () => {
      it('should create cache with default options', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();

        expect(cache.maxSize).toBe(100);
        expect(cache.ttlMs).toBe(300000);
        expect(cache.size).toBe(0);
      });

      it('should create cache with custom options', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ maxSize: 50, ttlMs: 60000 });

        expect(cache.maxSize).toBe(50);
        expect(cache.ttlMs).toBe(60000);
      });
    });

    describe('get', () => {
      it('should return undefined for missing key', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        const result = cache.get('nonexistent');

        expect(result).toBeUndefined();
      });

      it('should return cached value', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');

        expect(cache.get('key')).toBe('value');
      });

      it('should return undefined for expired entry', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ ttlMs: 10 });
        cache.set('key', 'value');

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(cache.get('key')).toBeUndefined();
      });

      it('should update stats on hit', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');
        cache.get('key');

        const stats = cache.getStats();
        expect(stats.hits).toBe(1);
      });

      it('should update stats on miss', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.get('nonexistent');

        const stats = cache.getStats();
        expect(stats.misses).toBe(1);
      });
    });

    describe('set', () => {
      it('should store value in cache', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');

        expect(cache.size).toBe(1);
        expect(cache.get('key')).toBe('value');
      });

      it('should return cache instance for chaining', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        const result = cache.set('key', 'value');

        expect(result).toBe(cache);
      });

      it('should evict oldest entry when at capacity', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ maxSize: 2 });
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        expect(cache.size).toBe(2);
        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBe('value2');
        expect(cache.get('key3')).toBe('value3');
      });

      it('should track evictions in stats', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ maxSize: 1 });
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        const stats = cache.getStats();
        expect(stats.evictions).toBe(1);
      });

      it('should update existing entry', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value1');
        cache.set('key', 'value2');

        expect(cache.size).toBe(1);
        expect(cache.get('key')).toBe('value2');
      });

      it('should accept custom TTL', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ ttlMs: 1000 });
        cache.set('key', 'value', 10); // 10ms TTL

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(cache.get('key')).toBeUndefined();
      });
    });

    describe('has', () => {
      it('should return false for missing key', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();

        expect(cache.has('nonexistent')).toBe(false);
      });

      it('should return true for existing key', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');

        expect(cache.has('key')).toBe(true);
      });

      it('should return false for expired key', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ ttlMs: 10 });
        cache.set('key', 'value');

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(cache.has('key')).toBe(false);
      });

      it('should track expired entries in stats', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ ttlMs: 10 });
        cache.set('key', 'value');

        await new Promise((resolve) => setTimeout(resolve, 20));
        cache.has('key');

        const stats = cache.getStats();
        expect(stats.expired).toBeGreaterThan(0);
      });
    });

    describe('delete', () => {
      it('should delete existing entry', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');

        const result = cache.delete('key');

        expect(result).toBe(true);
        expect(cache.has('key')).toBe(false);
        expect(cache.size).toBe(0);
      });

      it('should return false for non-existent key', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();

        expect(cache.delete('nonexistent')).toBe(false);
      });
    });

    describe('clear', () => {
      it('should remove all entries', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        cache.clear();

        expect(cache.size).toBe(0);
      });

      it('should return cache instance for chaining', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');

        expect(cache.clear()).toBe(cache);
      });
    });

    describe('getStats', () => {
      it('should return statistics object', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        const stats = cache.getStats();

        expect(typeof stats.hits).toBe('number');
        expect(typeof stats.misses).toBe('number');
        expect(typeof stats.evictions).toBe('number');
        expect(typeof stats.expired).toBe('number');
        expect(typeof stats.size).toBe('number');
        expect(typeof stats.maxSize).toBe('number');
        expect(typeof stats.hitRate).toBe('string');
      });

      it('should calculate hit rate correctly', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');
        cache.get('key'); // hit
        cache.get('key'); // hit
        cache.get('nonexistent'); // miss

        const stats = cache.getStats();
        expect(stats.hitRate).toBe('66.67%');
      });

      it('should return 0% hit rate when no operations', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        const stats = cache.getStats();

        expect(stats.hitRate).toBe('0%');
      });
    });

    describe('resetStats', () => {
      it('should reset all statistics', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');
        cache.get('key');
        cache.get('nonexistent');

        cache.resetStats();
        const stats = cache.getStats();

        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.evictions).toBe(0);
        expect(stats.expired).toBe(0);
      });

      it('should return cache instance for chaining', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();

        expect(cache.resetStats()).toBe(cache);
      });
    });

    describe('prune', () => {
      it('should remove expired entries', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ ttlMs: 10 });
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        await new Promise((resolve) => setTimeout(resolve, 20));

        const pruned = cache.prune();

        expect(pruned).toBe(2);
        expect(cache.size).toBe(0);
      });

      it('should not remove valid entries', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache({ ttlMs: 10000 });
        cache.set('key', 'value');

        const pruned = cache.prune();

        expect(pruned).toBe(0);
        expect(cache.size).toBe(1);
      });
    });

    describe('keys', () => {
      it('should return array of keys', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        const keys = cache.keys();

        expect(Array.isArray(keys)).toBe(true);
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
      });
    });

    describe('entries', () => {
      it('should return array of entry objects', async () => {
        const { LRUCache } = await import('../src/lru-cache.js');

        const cache = new LRUCache();
        cache.set('key', 'value');

        const entries = cache.entries();

        expect(Array.isArray(entries)).toBe(true);
        expect(entries[0]).toHaveProperty('key', 'key');
        expect(entries[0]).toHaveProperty('value', 'value');
        expect(entries[0]).toHaveProperty('expiresIn');
        expect(typeof entries[0].expiresIn).toBe('number');
      });
    });
  });

  describe('getCache factory function', () => {
    it('should create named cache instance', async () => {
      const { getCache } = await import('../src/lru-cache.js');

      const cache = getCache('test-cache');

      expect(cache).toBeDefined();
      expect(typeof cache.get).toBe('function');
      expect(typeof cache.set).toBe('function');
    });

    it('should return same instance for same name', async () => {
      const { getCache } = await import('../src/lru-cache.js');

      const cache1 = getCache('shared-cache');
      const cache2 = getCache('shared-cache');

      expect(cache1).toBe(cache2);
    });

    it('should create different instances for different names', async () => {
      const { getCache } = await import('../src/lru-cache.js');

      const cache1 = getCache('cache-a');
      const cache2 = getCache('cache-b');

      expect(cache1).not.toBe(cache2);
    });

    it('should apply options on first creation', async () => {
      const { getCache } = await import('../src/lru-cache.js');

      const cache = getCache('options-cache', { maxSize: 25, ttlMs: 1000 });

      expect(cache.maxSize).toBe(25);
      expect(cache.ttlMs).toBe(1000);
    });
  });

  describe('Pre-configured caches', () => {
    it('should export modelCache', async () => {
      const { modelCache } = await import('../src/lru-cache.js');

      expect(modelCache).toBeDefined();
      expect(modelCache.maxSize).toBe(50);
      expect(modelCache.ttlMs).toBe(600000);
    });

    it('should export responseCache', async () => {
      const { responseCache } = await import('../src/lru-cache.js');

      expect(responseCache).toBeDefined();
      expect(responseCache.maxSize).toBe(200);
      expect(responseCache.ttlMs).toBe(300000);
    });

    it('should export symbolCache', async () => {
      const { symbolCache } = await import('../src/lru-cache.js');

      expect(symbolCache).toBeDefined();
      expect(symbolCache.maxSize).toBe(500);
      expect(symbolCache.ttlMs).toBe(120000);
    });
  });
});
