/**
 * Tests for CacheManager
 * @module test/unit/cli-unified/processing/CacheManager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock crypto - generate consistent hashes based on input
vi.mock('crypto', () => ({
  createHash: vi.fn(() => {
    let data = '';
    return {
      update: vi.fn(function (input) {
        data = input;
        return this;
      }),
      digest: vi.fn(() => {
        // Simple hash based on input string - consistent for same input
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
          hash = (hash << 5) - hash + data.charCodeAt(i);
          hash = hash & hash;
        }
        return `hash_${Math.abs(hash)}`;
      }),
    };
  }),
}));

// Mock EventBus
vi.mock('../../../../src/cli-unified/core/EventBus.js', () => ({
  eventBus: { emit: vi.fn() },
  EVENT_TYPES: {
    CACHE_HIT: 'cache:hit',
    CACHE_MISS: 'cache:miss',
    CACHE_CLEAR: 'cache:clear',
  },
}));

import { createHash } from 'node:crypto';
import { eventBus } from '../../../../src/cli-unified/core/EventBus.js';
import {
  CacheManager,
  createCacheManager,
  TokenUtils,
} from '../../../../src/cli-unified/processing/CacheManager.js';

describe('CacheManager Module', () => {
  describe('TokenUtils', () => {
    describe('estimate()', () => {
      it('should estimate token count', () => {
        const text = 'Hello world this is a test';
        const tokens = TokenUtils.estimate(text);

        // ~4 chars per token
        expect(tokens).toBe(Math.ceil(text.length / 4));
      });

      it('should return 0 for empty text', () => {
        expect(TokenUtils.estimate('')).toBe(0);
        expect(TokenUtils.estimate(null)).toBe(0);
        expect(TokenUtils.estimate(undefined)).toBe(0);
      });
    });

    describe('estimateCost()', () => {
      it('should estimate cost for default model', () => {
        const cost = TokenUtils.estimateCost(1000, 500);

        expect(cost).toHaveProperty('input');
        expect(cost).toHaveProperty('output');
        expect(cost).toHaveProperty('total');
        expect(cost.total).toBe(cost.input + cost.output);
      });

      it('should estimate cost for specific model', () => {
        const cost = TokenUtils.estimateCost(1000, 500, 'gpt-4');

        expect(cost.input).toBeGreaterThan(0);
        expect(cost.output).toBeGreaterThan(0);
      });

      it('should use default pricing for unknown model', () => {
        const cost = TokenUtils.estimateCost(1000, 500, 'unknown-model');

        expect(cost).toHaveProperty('total');
      });
    });
  });

  describe('CacheManager', () => {
    let cache;

    beforeEach(() => {
      vi.clearAllMocks();
      cache = new CacheManager();
    });

    afterEach(() => {
      cache.clear();
    });

    describe('constructor', () => {
      it('should create with default options', () => {
        expect(cache.ttl).toBe(3600000);
        expect(cache.enabled).toBe(true);
        expect(cache.stats).toEqual({
          hits: 0,
          misses: 0,
          sets: 0,
          evictions: 0,
          totalTokensSaved: 0,
        });
      });

      it('should accept custom options', () => {
        const custom = new CacheManager({
          maxSize: 50,
          ttl: 1800000,
          enabled: false,
        });

        expect(custom.ttl).toBe(1800000);
        expect(custom.enabled).toBe(false);
      });

      it('should extend EventEmitter', () => {
        expect(typeof cache.on).toBe('function');
        expect(typeof cache.emit).toBe('function');
      });
    });

    describe('generateKey()', () => {
      it('should generate hash from prompt', () => {
        const key = cache.generateKey('test prompt');
        expect(key).toMatch(/^hash_\d+$/); // Matches our mock format
        expect(createHash).toHaveBeenCalledWith('md5');
      });

      it('should include options in key', () => {
        cache.generateKey('test', { model: 'gpt-4' });
        expect(createHash).toHaveBeenCalled();
      });

      it('should filter out unsafe options', () => {
        const options = {
          model: 'gpt-4',
          cli: { some: 'ref' },
          onToken: () => {},
          callback: () => {},
        };

        // Should not throw
        cache.generateKey('test', options);
      });

      it('should filter out objects with circular references', () => {
        const options = {
          model: 'gpt-4',
          context: { cli: {}, mode: {} },
        };

        // Should not throw
        cache.generateKey('test', options);
      });
    });

    describe('get()', () => {
      it('should return null when disabled', () => {
        cache.disable();
        cache.set('prompt', 'response');

        const result = cache.get('prompt');
        expect(result).toBeNull();
      });

      it('should return null for cache miss', () => {
        const result = cache.get('nonexistent');

        expect(result).toBeNull();
        expect(cache.stats.misses).toBe(1);
        expect(eventBus.emit).toHaveBeenCalledWith('cache:miss', expect.any(Object));
      });

      it('should return cached response on hit', () => {
        cache.set('prompt', 'response');
        const result = cache.get('prompt');

        expect(result).toBe('response');
        expect(cache.stats.hits).toBe(1);
        expect(eventBus.emit).toHaveBeenCalledWith('cache:hit', expect.any(Object));
      });

      it('should return null for expired entries', () => {
        cache.setTTL(1); // 1ms TTL
        cache.set('prompt', 'response');

        // Manually backdate the entry to simulate expiry
        const key = cache.generateKey('prompt');
        const entry = cache.cache.get(key);
        entry.timestamp = Date.now() - 10; // 10ms ago

        const result = cache.get('prompt');
        expect(result).toBeNull();
      });

      it('should emit hit event', () => {
        const spy = vi.fn();
        cache.on('hit', spy);

        cache.set('prompt', 'response');
        cache.get('prompt');

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('set()', () => {
      it('should store response', () => {
        cache.set('prompt', 'response');

        expect(cache.stats.sets).toBe(1);
        expect(cache.size).toBe(1);
      });

      it('should not store when disabled', () => {
        cache.disable();
        cache.set('prompt', 'response');

        expect(cache.size).toBe(0);
      });

      it('should include metadata', () => {
        const spy = vi.fn();
        cache.on('set', spy);

        cache.set('prompt', 'response', { metadata: { source: 'test' } });

        expect(spy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            metadata: { source: 'test' },
          }),
        );
      });

      it('should emit set event', () => {
        const spy = vi.fn();
        cache.on('set', spy);

        cache.set('prompt', 'response');

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('delete()', () => {
      it('should delete cache entry', () => {
        cache.set('prompt', 'response');
        expect(cache.size).toBe(1);

        cache.delete('prompt');
        expect(cache.size).toBe(0);
      });
    });

    describe('clear()', () => {
      it('should clear all entries', () => {
        cache.set('prompt1', 'response1');
        cache.set('prompt2', 'response2');

        cache.clear();

        expect(cache.size).toBe(0);
        expect(eventBus.emit).toHaveBeenCalledWith('cache:clear');
      });

      it('should update eviction count', () => {
        cache.set('prompt1', 'response1');
        cache.set('prompt2', 'response2');

        cache.clear();

        expect(cache.stats.evictions).toBe(2);
      });

      it('should emit clear event', () => {
        const spy = vi.fn();
        cache.on('clear', spy);

        cache.set('prompt', 'response');
        cache.clear();

        expect(spy).toHaveBeenCalledWith(1);
      });
    });

    describe('getStats()', () => {
      it('should return statistics', () => {
        cache.set('prompt', 'response');
        cache.get('prompt'); // hit
        cache.get('nonexistent'); // miss

        const stats = cache.getStats();

        expect(stats).toHaveProperty('hits', 1);
        expect(stats).toHaveProperty('misses', 1);
        expect(stats).toHaveProperty('sets', 1);
        expect(stats).toHaveProperty('hitRate');
        expect(stats).toHaveProperty('size');
        expect(stats).toHaveProperty('estimatedSavings');
      });

      it('should calculate hit rate', () => {
        cache.set('prompt', 'response');
        cache.get('prompt'); // hit
        cache.get('prompt'); // hit
        cache.get('miss'); // miss

        const stats = cache.getStats();
        expect(stats.hitRate).toBe('66.7%');
      });

      it('should handle zero total requests', () => {
        const stats = cache.getStats();
        expect(stats.hitRate).toBe('0%');
      });
    });

    describe('resetStats()', () => {
      it('should reset all statistics', () => {
        cache.set('prompt', 'response');
        cache.get('prompt');

        cache.resetStats();

        expect(cache.stats).toEqual({
          hits: 0,
          misses: 0,
          sets: 0,
          evictions: 0,
          totalTokensSaved: 0,
        });
      });
    });

    describe('enable() / disable()', () => {
      it('should enable caching', () => {
        cache.disable();
        expect(cache.isEnabled).toBe(false);

        cache.enable();
        expect(cache.isEnabled).toBe(true);
      });

      it('should disable caching', () => {
        cache.disable();
        expect(cache.isEnabled).toBe(false);
      });
    });

    describe('setTTL()', () => {
      it('should update TTL', () => {
        cache.setTTL(7200000);
        expect(cache.ttl).toBe(7200000);
      });
    });

    describe('prune()', () => {
      it('should remove expired entries', () => {
        cache.setTTL(10); // 10ms TTL
        cache.set('prompt1', 'response1');
        cache.set('prompt2', 'response2');

        // Backdate entries to simulate expiry
        for (const [_key, entry] of cache.cache.entries()) {
          entry.timestamp = Date.now() - 100; // 100ms ago
        }

        const pruned = cache.prune();

        expect(pruned).toBe(2);
        expect(cache.size).toBe(0);
      });

      it('should update eviction count', () => {
        cache.setTTL(10);
        cache.set('prompt', 'response');

        // Backdate entry
        for (const [_key, entry] of cache.cache.entries()) {
          entry.timestamp = Date.now() - 100;
        }

        cache.prune();

        expect(cache.stats.evictions).toBe(1);
      });

      it('should not prune non-expired entries', () => {
        cache.setTTL(3600000);
        cache.set('prompt', 'response');

        const pruned = cache.prune();

        expect(pruned).toBe(0);
        expect(cache.size).toBe(1);
      });
    });

    describe('getters', () => {
      it('should return size', () => {
        expect(cache.size).toBe(0);

        cache.set('prompt', 'response');
        expect(cache.size).toBe(1);
      });

      it('should return isEnabled', () => {
        expect(cache.isEnabled).toBe(true);

        cache.disable();
        expect(cache.isEnabled).toBe(false);
      });
    });
  });

  describe('LRU Cache behavior', () => {
    it('should evict oldest entries when over capacity', () => {
      const cache = new CacheManager({ maxSize: 3 });

      // Use different hash for each entry
      let hashCounter = 0;
      vi.mocked(createHash).mockImplementation(() => ({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => `hash${hashCounter++}`),
      }));

      cache.set('prompt1', 'response1');
      cache.set('prompt2', 'response2');
      cache.set('prompt3', 'response3');
      cache.set('prompt4', 'response4'); // Should evict prompt1

      expect(cache.size).toBe(3);
    });

    it('should update order on access', () => {
      const cache = new CacheManager({ maxSize: 3 });

      let hashCounter = 0;
      vi.mocked(createHash).mockImplementation(() => ({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => `hash${hashCounter++}`),
      }));

      cache.set('prompt1', 'response1');
      cache.set('prompt2', 'response2');
      cache.set('prompt3', 'response3');

      // Access prompt1 to move it to end
      hashCounter = 0;
      cache.get('prompt1');

      // Add new entry - should evict prompt2 (now oldest)
      hashCounter = 3;
      cache.set('prompt4', 'response4');

      expect(cache.size).toBe(3);
    });
  });

  describe('createCacheManager()', () => {
    it('should create CacheManager instance', () => {
      const cm = createCacheManager();
      expect(cm).toBeInstanceOf(CacheManager);
    });

    it('should pass options', () => {
      const cm = createCacheManager({ ttl: 1800000 });
      expect(cm.ttl).toBe(1800000);
    });
  });
});
