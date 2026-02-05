/**
 * HYDRA Cache Tests
 * @module test/unit/hydra/core/cache.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_CACHE_CONFIG,
  TTLCache,
  HealthCheckCache,
  memoize
} from '../../../../src/hydra/core/cache.js';

describe('HYDRA Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DEFAULT_CACHE_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_CACHE_CONFIG.defaultTTL).toBe(60000);
      expect(DEFAULT_CACHE_CONFIG.maxSize).toBe(1000);
      expect(DEFAULT_CACHE_CONFIG.evictionPolicy).toBe('lru');
      expect(DEFAULT_CACHE_CONFIG.staleWhileRevalidate).toBe(true);
    });
  });

  describe('TTLCache', () => {
    let cache;

    beforeEach(() => {
      cache = new TTLCache();
    });

    describe('constructor()', () => {
      it('should use default config', () => {
        expect(cache.config.defaultTTL).toBe(60000);
        expect(cache.config.maxSize).toBe(1000);
      });

      it('should accept custom config', () => {
        const customCache = new TTLCache({ defaultTTL: 30000, maxSize: 500 });
        expect(customCache.config.defaultTTL).toBe(30000);
        expect(customCache.config.maxSize).toBe(500);
      });
    });

    describe('set() and get()', () => {
      it('should store and retrieve values', () => {
        cache.set('key1', 'value1');
        const result = cache.get('key1');
        expect(result.value).toBe('value1');
        expect(result.stale).toBe(false);
      });

      it('should return undefined for missing key', () => {
        const result = cache.get('nonexistent');
        expect(result).toBeUndefined();
      });

      it('should track cache misses', () => {
        cache.get('nonexistent');
        cache.get('another');
        const stats = cache.getStats();
        expect(stats.misses).toBe(2);
      });

      it('should track cache hits', () => {
        cache.set('key', 'value');
        cache.get('key');
        cache.get('key');
        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
      });

      it('should support custom TTL', () => {
        cache.set('key', 'value', 5000);
        expect(cache.get('key').value).toBe('value');

        vi.advanceTimersByTime(6000);
        const result = cache.get('key');
        // staleWhileRevalidate is true by default
        expect(result.stale).toBe(true);
      });
    });

    describe('expiration', () => {
      it('should return stale value when staleWhileRevalidate is true', () => {
        cache.set('key', 'value', 1000);
        vi.advanceTimersByTime(1500);
        const result = cache.get('key');
        expect(result.value).toBe('value');
        expect(result.stale).toBe(true);
      });

      it('should return undefined when staleWhileRevalidate is false', () => {
        const strictCache = new TTLCache({ staleWhileRevalidate: false });
        strictCache.set('key', 'value', 1000);
        vi.advanceTimersByTime(1500);
        const result = strictCache.get('key');
        expect(result).toBeUndefined();
      });
    });

    describe('has()', () => {
      it('should return true for existing non-expired key', () => {
        cache.set('key', 'value');
        expect(cache.has('key')).toBe(true);
      });

      it('should return false for missing key', () => {
        expect(cache.has('nonexistent')).toBe(false);
      });

      it('should return false for expired key', () => {
        cache.set('key', 'value', 1000);
        vi.advanceTimersByTime(1500);
        expect(cache.has('key')).toBe(false);
      });
    });

    describe('delete()', () => {
      it('should delete entry', () => {
        cache.set('key', 'value');
        expect(cache.delete('key')).toBe(true);
        expect(cache.get('key')).toBeUndefined();
      });

      it('should return false for nonexistent key', () => {
        expect(cache.delete('nonexistent')).toBe(false);
      });
    });

    describe('clear()', () => {
      it('should clear all entries', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.clear();
        expect(cache.size()).toBe(0);
      });
    });

    describe('prune()', () => {
      it('should remove expired entries', () => {
        cache.set('key1', 'value1', 1000);
        cache.set('key2', 'value2', 5000);
        vi.advanceTimersByTime(2000);
        const removed = cache.prune();
        expect(removed).toBe(1);
        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(true);
      });
    });

    describe('eviction', () => {
      it('should evict when maxSize is reached (LRU)', () => {
        const smallCache = new TTLCache({ maxSize: 3, evictionPolicy: 'lru' });
        smallCache.set('a', 1);
        vi.advanceTimersByTime(10);
        smallCache.set('b', 2);
        vi.advanceTimersByTime(10);
        smallCache.set('c', 3);
        smallCache.get('a'); // Access 'a' to make it recently used
        vi.advanceTimersByTime(10);
        smallCache.set('d', 4); // Should evict 'b'
        expect(smallCache.has('a')).toBe(true);
        expect(smallCache.has('b')).toBe(false);
        expect(smallCache.has('c')).toBe(true);
        expect(smallCache.has('d')).toBe(true);
      });

      it('should evict when maxSize is reached (LFU)', () => {
        const smallCache = new TTLCache({ maxSize: 3, evictionPolicy: 'lfu' });
        smallCache.set('a', 1);
        smallCache.set('b', 2);
        smallCache.set('c', 3);
        smallCache.get('a'); // Access 'a' twice
        smallCache.get('a');
        smallCache.get('b'); // Access 'b' once
        smallCache.set('d', 4); // Should evict 'c' (never accessed)
        expect(smallCache.has('a')).toBe(true);
        expect(smallCache.has('b')).toBe(true);
        expect(smallCache.has('c')).toBe(false);
        expect(smallCache.has('d')).toBe(true);
      });

      it('should evict when maxSize is reached (FIFO)', () => {
        const smallCache = new TTLCache({ maxSize: 3, evictionPolicy: 'fifo' });
        smallCache.set('a', 1);
        vi.advanceTimersByTime(10);
        smallCache.set('b', 2);
        vi.advanceTimersByTime(10);
        smallCache.set('c', 3);
        vi.advanceTimersByTime(10);
        smallCache.set('d', 4); // Should evict 'a'
        expect(smallCache.has('a')).toBe(false);
        expect(smallCache.has('b')).toBe(true);
      });
    });

    describe('getOrFetch()', () => {
      it('should return cached value if available', async () => {
        vi.useRealTimers();
        cache.set('key', 'cached');
        const fetcher = vi.fn().mockResolvedValue('fresh');
        const result = await cache.getOrFetch('key', fetcher);
        expect(result).toBe('cached');
        expect(fetcher).not.toHaveBeenCalled();
      });

      it('should fetch and cache if not available', async () => {
        vi.useRealTimers();
        const fetcher = vi.fn().mockResolvedValue('fresh');
        const result = await cache.getOrFetch('key', fetcher);
        expect(result).toBe('fresh');
        expect(fetcher).toHaveBeenCalled();
        expect(cache.get('key').value).toBe('fresh');
      });
    });

    describe('keys() and size()', () => {
      it('should return all keys', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        expect(cache.keys()).toEqual(['a', 'b', 'c']);
      });

      it('should return correct size', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        expect(cache.size()).toBe(2);
      });
    });

    describe('getStats() and resetStats()', () => {
      it('should return statistics', () => {
        cache.set('a', 1);
        cache.get('a');
        cache.get('b');
        const stats = cache.getStats();
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
        expect(stats.size).toBe(1);
        expect(stats.hitRate).toBe('50.00');
      });

      it('should reset statistics', () => {
        cache.set('a', 1);
        cache.get('a');
        cache.resetStats();
        const stats = cache.getStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
      });
    });
  });

  describe('HealthCheckCache', () => {
    let healthCache;

    beforeEach(() => {
      healthCache = new HealthCheckCache({ ttl: 1000, staleTTL: 5000, autoRefresh: false });
    });

    describe('constructor()', () => {
      it('should use default config', () => {
        const cache = new HealthCheckCache();
        expect(cache.ttl).toBe(30000);
        expect(cache.staleTTL).toBe(60000);
        expect(cache.autoRefresh).toBe(true);
      });

      it('should accept custom config', () => {
        expect(healthCache.ttl).toBe(1000);
        expect(healthCache.staleTTL).toBe(5000);
      });
    });

    describe('register()', () => {
      it('should register health check function', () => {
        const checker = vi.fn().mockResolvedValue({ available: true });
        healthCache.register('provider1', checker);
        expect(healthCache._healthCheckers.has('provider1')).toBe(true);
      });
    });

    describe('get()', () => {
      it('should fetch fresh health status', async () => {
        vi.useRealTimers();
        const checker = vi.fn().mockResolvedValue({ available: true });
        healthCache.register('provider1', checker);
        const result = await healthCache.get('provider1');
        expect(result.available).toBe(true);
        expect(result.cached).toBe(false);
        expect(checker).toHaveBeenCalled();
      });

      it('should return cached status if fresh', async () => {
        vi.useRealTimers();
        const checker = vi.fn().mockResolvedValue({ available: true });
        healthCache.register('provider1', checker);
        await healthCache.get('provider1');
        checker.mockClear();
        const result = await healthCache.get('provider1');
        expect(result.cached).toBe(true);
        expect(checker).not.toHaveBeenCalled();
      });

      it('should throw for unregistered provider', async () => {
        await expect(healthCache.get('unknown')).rejects.toThrow('No health checker registered');
      });
    });

    describe('getCached()', () => {
      it('should return null for uncached provider', () => {
        const result = healthCache.getCached('unknown');
        expect(result).toBeNull();
      });
    });

    describe('getAll()', () => {
      it('should return all cached statuses', async () => {
        vi.useRealTimers();
        healthCache.register('p1', vi.fn().mockResolvedValue({ available: true }));
        healthCache.register('p2', vi.fn().mockResolvedValue({ available: false }));
        await healthCache.get('p1');
        const all = healthCache.getAll();
        expect(all.p1.available).toBe(true);
        expect(all.p2).toBeNull(); // Not fetched yet
      });
    });

    describe('refreshAll()', () => {
      it('should refresh all providers', async () => {
        vi.useRealTimers();
        healthCache.register('p1', vi.fn().mockResolvedValue({ available: true }));
        healthCache.register('p2', vi.fn().mockResolvedValue({ available: false }));
        const results = await healthCache.refreshAll();
        expect(results.p1.available).toBe(true);
        expect(results.p2.available).toBe(false);
      });

      it('should handle errors gracefully', async () => {
        vi.useRealTimers();
        healthCache.register('p1', vi.fn().mockRejectedValue(new Error('Network error')));
        const results = await healthCache.refreshAll();
        expect(results.p1.available).toBe(false);
        expect(results.p1.error).toBe('Network error');
      });
    });

    describe('clear() and clearAll()', () => {
      it('should clear specific provider cache', async () => {
        vi.useRealTimers();
        healthCache.register('p1', vi.fn().mockResolvedValue({ available: true }));
        await healthCache.get('p1');
        healthCache.clear('p1');
        expect(healthCache.getCached('p1')).toBeNull();
      });

      it('should clear all caches', async () => {
        vi.useRealTimers();
        healthCache.register('p1', vi.fn().mockResolvedValue({ available: true }));
        healthCache.register('p2', vi.fn().mockResolvedValue({ available: true }));
        await healthCache.refreshAll();
        healthCache.clearAll();
        expect(healthCache.getCached('p1')).toBeNull();
        expect(healthCache.getCached('p2')).toBeNull();
      });
    });
  });

  describe('memoize()', () => {
    it('should memoize function results', async () => {
      vi.useRealTimers();
      const expensive = vi.fn().mockResolvedValue(42);
      const memoized = memoize(expensive);
      const result1 = await memoized('arg1');
      const result2 = await memoized('arg1');
      expect(result1).toBe(42);
      expect(result2).toBe(42);
      expect(expensive).toHaveBeenCalledTimes(1);
    });

    it('should use custom key generator', async () => {
      vi.useRealTimers();
      const expensive = vi.fn().mockResolvedValue(42);
      const memoized = memoize(expensive, {
        keyGenerator: (a, b) => `${a}-${b}`
      });
      await memoized('a', 'b');
      await memoized('a', 'b');
      expect(expensive).toHaveBeenCalledTimes(1);
    });
  });
});
