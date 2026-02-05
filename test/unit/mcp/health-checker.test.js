/**
 * MCP Health Checker Tests
 * @module test/unit/mcp/health-checker.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HealthStatus,
  TTLCache,
  HealthChecker,
  getHealthChecker,
  resetHealthChecker
} from '../../../src/mcp/health-checker.js';

describe('MCP Health Checker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHealthChecker();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetHealthChecker();
  });

  // ===========================================================================
  // HealthStatus Tests
  // ===========================================================================

  describe('HealthStatus', () => {
    it('should define all expected statuses', () => {
      expect(HealthStatus.HEALTHY).toBe('healthy');
      expect(HealthStatus.DEGRADED).toBe('degraded');
      expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
      expect(HealthStatus.UNKNOWN).toBe('unknown');
    });
  });

  // ===========================================================================
  // TTLCache Tests
  // ===========================================================================

  describe('TTLCache', () => {
    describe('constructor', () => {
      it('should initialize with default options', () => {
        const cache = new TTLCache();

        expect(cache.defaultTTL).toBe(30000);
        expect(cache.maxSize).toBe(100);
      });

      it('should accept custom options', () => {
        const cache = new TTLCache({
          defaultTTL: 60000,
          maxSize: 50
        });

        expect(cache.defaultTTL).toBe(60000);
        expect(cache.maxSize).toBe(50);
      });
    });

    describe('set() and get()', () => {
      it('should store and retrieve values', () => {
        const cache = new TTLCache();

        cache.set('key', 'value');

        expect(cache.get('key')).toBe('value');
      });

      it('should return null for missing key', () => {
        const cache = new TTLCache();

        expect(cache.get('missing')).toBeNull();
      });

      it('should return null for expired key', () => {
        const cache = new TTLCache({ defaultTTL: 1000 });
        cache.set('key', 'value');

        vi.advanceTimersByTime(1500);

        expect(cache.get('key')).toBeNull();
      });

      it('should support custom TTL per entry', () => {
        const cache = new TTLCache({ defaultTTL: 10000 });
        cache.set('key', 'value', 500);

        vi.advanceTimersByTime(600);

        expect(cache.get('key')).toBeNull();
      });

      it('should enforce maxSize', () => {
        const cache = new TTLCache({ maxSize: 2 });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3'); // Should remove key1

        expect(cache.get('key1')).toBeNull();
        expect(cache.get('key2')).toBe('value2');
        expect(cache.get('key3')).toBe('value3');
      });
    });

    describe('has()', () => {
      it('should return true for existing key', () => {
        const cache = new TTLCache();
        cache.set('key', 'value');

        expect(cache.has('key')).toBe(true);
      });

      it('should return false for missing key', () => {
        const cache = new TTLCache();

        expect(cache.has('missing')).toBe(false);
      });

      it('should return false for expired key', () => {
        const cache = new TTLCache({ defaultTTL: 1000 });
        cache.set('key', 'value');

        vi.advanceTimersByTime(1500);

        expect(cache.has('key')).toBe(false);
      });
    });

    describe('delete()', () => {
      it('should delete existing key', () => {
        const cache = new TTLCache();
        cache.set('key', 'value');

        const result = cache.delete('key');

        expect(result).toBe(true);
        expect(cache.get('key')).toBeNull();
      });

      it('should return false for missing key', () => {
        const cache = new TTLCache();

        expect(cache.delete('missing')).toBe(false);
      });
    });

    describe('clear()', () => {
      it('should clear all entries', () => {
        const cache = new TTLCache();
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        cache.clear();

        expect(cache.get('key1')).toBeNull();
        expect(cache.get('key2')).toBeNull();
      });
    });

    describe('getStats()', () => {
      it('should return cache statistics', () => {
        const cache = new TTLCache({ defaultTTL: 5000 });
        cache.set('valid', 'value');
        cache.set('expired', 'value', 100);

        vi.advanceTimersByTime(200);

        const stats = cache.getStats();

        expect(stats.total).toBe(2);
        expect(stats.valid).toBe(1);
        expect(stats.expired).toBe(1);
      });
    });

    describe('cleanup()', () => {
      it('should remove expired entries', () => {
        const cache = new TTLCache({ defaultTTL: 1000 });
        cache.set('short', 'value', 500);
        cache.set('long', 'value', 5000);

        vi.advanceTimersByTime(600);

        const removed = cache.cleanup();

        expect(removed).toBe(1);
        expect(cache.get('short')).toBeNull();
        expect(cache.get('long')).not.toBeNull();
      });
    });
  });

  // ===========================================================================
  // HealthChecker Tests
  // ===========================================================================

  describe('HealthChecker', () => {
    let checker;
    let mockTransport;

    beforeEach(() => {
      checker = new HealthChecker({
        defaultInterval: 60000,
        defaultTimeout: 5000,
        cacheTTL: 30000,
        degradedThreshold: 1000
      });

      mockTransport = {
        isReady: vi.fn().mockReturnValue(true),
        request: vi.fn().mockResolvedValue({ tools: [] }),
        getInfo: vi.fn().mockReturnValue({ type: 'stdio' })
      };
    });

    afterEach(() => {
      checker.stopAllMonitoring();
    });

    describe('constructor', () => {
      it('should initialize with default options', () => {
        const defaultChecker = new HealthChecker();

        expect(defaultChecker.defaultInterval).toBe(60000);
        expect(defaultChecker.defaultTimeout).toBe(5000);
        expect(defaultChecker.cacheTTL).toBe(30000);
      });

      it('should accept custom options', () => {
        expect(checker.defaultInterval).toBe(60000);
        expect(checker.defaultTimeout).toBe(5000);
        expect(checker.degradedThreshold).toBe(1000);
      });
    });

    describe('check()', () => {
      it('should return healthy status for responsive server', async () => {
        vi.useRealTimers();

        const result = await checker.check('test-server', mockTransport);

        expect(result.serverId).toBe('test-server');
        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(result.available).toBe(true);
        expect(result.timestamp).toBeInstanceOf(Date);
      });

      it('should return unhealthy when transport not ready', async () => {
        vi.useRealTimers();
        mockTransport.isReady.mockReturnValue(false);

        const result = await checker.check('test-server', mockTransport);

        expect(result.status).toBe(HealthStatus.UNHEALTHY);
        expect(result.available).toBe(false);
      });

      it('should use cached result when available', async () => {
        vi.useRealTimers();
        await checker.check('test-server', mockTransport);
        mockTransport.request.mockClear();

        const cached = await checker.check('test-server', mockTransport);

        expect(mockTransport.request).not.toHaveBeenCalled();
        expect(cached.status).toBe(HealthStatus.HEALTHY);
      });

      it('should skip cache when useCache is false', async () => {
        vi.useRealTimers();
        await checker.check('test-server', mockTransport);

        await checker.check('test-server', mockTransport, { useCache: false });

        expect(mockTransport.request).toHaveBeenCalledTimes(2);
      });

      it('should emit healthCheck event', async () => {
        vi.useRealTimers();
        const spy = vi.fn();
        checker.on('healthCheck', spy);

        await checker.check('test-server', mockTransport);

        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
          serverId: 'test-server',
          status: HealthStatus.HEALTHY
        }));
      });

      it('should emit healthChanged event on status change', async () => {
        vi.useRealTimers();
        const spy = vi.fn();
        checker.on('healthChanged', spy);

        // First check - healthy
        await checker.check('test-server', mockTransport, { useCache: false });

        // Second check - unhealthy
        mockTransport.isReady.mockReturnValue(false);
        await checker.check('test-server', mockTransport, { useCache: false });

        expect(spy).toHaveBeenCalledWith({
          serverId: 'test-server',
          previous: expect.objectContaining({ status: HealthStatus.HEALTHY }),
          current: expect.objectContaining({ status: HealthStatus.UNHEALTHY })
        });
      });

      it('should return unhealthy on error', async () => {
        vi.useRealTimers();
        // When request fails AND isReady returns false after error, performCheck throws
        // First call to isReady (initial check) returns true, second call (in error handler) returns false
        let callCount = 0;
        mockTransport.isReady.mockImplementation(() => {
          callCount++;
          return callCount === 1; // true for first call, false after
        });
        mockTransport.request.mockRejectedValue(new Error('Connection failed'));

        const result = await checker.check('test-server', mockTransport, { useCache: false });

        expect(result.status).toBe(HealthStatus.UNHEALTHY);
        expect(result.available).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('determineStatus()', () => {
      it('should return HEALTHY for low latency', () => {
        expect(checker.determineStatus(500)).toBe(HealthStatus.HEALTHY);
      });

      it('should return DEGRADED for high latency', () => {
        expect(checker.determineStatus(1500)).toBe(HealthStatus.DEGRADED);
      });
    });

    describe('startMonitoring()', () => {
      it('should perform initial check', async () => {
        vi.useRealTimers();
        checker.startMonitoring('test-server', mockTransport, { interval: 60000 });

        // Wait for initial check
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockTransport.request).toHaveBeenCalled();

        checker.stopMonitoring('test-server');
      });

      it('should set up interval', () => {
        vi.useFakeTimers();
        checker.startMonitoring('test-server', mockTransport, { interval: 1000 });

        expect(checker.intervals.has('test-server')).toBe(true);

        checker.stopMonitoring('test-server');
      });
    });

    describe('stopMonitoring()', () => {
      it('should stop monitoring', () => {
        checker.startMonitoring('test-server', mockTransport);

        checker.stopMonitoring('test-server');

        expect(checker.intervals.has('test-server')).toBe(false);
      });

      it('should handle non-monitored server', () => {
        expect(() => checker.stopMonitoring('unknown')).not.toThrow();
      });
    });

    describe('stopAllMonitoring()', () => {
      it('should stop all monitoring', () => {
        checker.startMonitoring('server1', mockTransport);
        checker.startMonitoring('server2', mockTransport);

        checker.stopAllMonitoring();

        expect(checker.intervals.size).toBe(0);
      });
    });

    describe('getLastResult()', () => {
      it('should return last result', async () => {
        vi.useRealTimers();
        await checker.check('test-server', mockTransport);

        const result = checker.getLastResult('test-server');

        expect(result).not.toBeNull();
        expect(result.serverId).toBe('test-server');
      });

      it('should return null for unknown server', () => {
        expect(checker.getLastResult('unknown')).toBeNull();
      });
    });

    describe('getAllResults()', () => {
      it('should return all results', async () => {
        vi.useRealTimers();
        await checker.check('server1', mockTransport);
        await checker.check('server2', mockTransport);

        const results = checker.getAllResults();

        expect(results.size).toBe(2);
        expect(results.has('server1')).toBe(true);
        expect(results.has('server2')).toBe(true);
      });
    });

    describe('getSummary()', () => {
      it('should return summary statistics', async () => {
        vi.useRealTimers();
        await checker.check('server1', mockTransport, { useCache: false });
        await checker.check('server2', mockTransport, { useCache: false });

        const summary = checker.getSummary();

        expect(summary.total).toBe(2);
        expect(summary.healthy).toBe(2);
        expect(summary.unhealthy).toBe(0);
      });

      it('should calculate average latency', async () => {
        vi.useRealTimers();
        await checker.check('server1', mockTransport);

        const summary = checker.getSummary();

        expect(typeof summary.averageLatency).toBe('number');
      });
    });

    describe('refresh()', () => {
      it('should delete cache and recheck', async () => {
        vi.useRealTimers();
        await checker.check('test-server', mockTransport);

        const result = await checker.refresh('test-server', mockTransport);

        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(mockTransport.request).toHaveBeenCalledTimes(2);
      });
    });

    describe('clearCache()', () => {
      it('should clear all cached results', async () => {
        vi.useRealTimers();
        await checker.check('server1', mockTransport);
        await checker.check('server2', mockTransport);

        checker.clearCache();

        // Cache should be empty now - next check should call transport
        mockTransport.request.mockClear();
        await checker.check('server1', mockTransport);
        expect(mockTransport.request).toHaveBeenCalled();
      });
    });

    describe('getMonitoredServers()', () => {
      it('should return monitored server IDs', () => {
        checker.startMonitoring('server1', mockTransport);
        checker.startMonitoring('server2', mockTransport);

        const monitored = checker.getMonitoredServers();

        expect(monitored).toContain('server1');
        expect(monitored).toContain('server2');

        checker.stopAllMonitoring();
      });
    });

    describe('isMonitoring()', () => {
      it('should return true for monitored server', () => {
        checker.startMonitoring('test-server', mockTransport);

        expect(checker.isMonitoring('test-server')).toBe(true);

        checker.stopMonitoring('test-server');
      });

      it('should return false for non-monitored server', () => {
        expect(checker.isMonitoring('unknown')).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Singleton Tests
  // ===========================================================================

  describe('Singleton functions', () => {
    describe('getHealthChecker()', () => {
      it('should return singleton instance', () => {
        const checker1 = getHealthChecker();
        const checker2 = getHealthChecker();

        expect(checker1).toBe(checker2);
      });

      it('should accept options on first call', () => {
        const checker = getHealthChecker({ degradedThreshold: 2000 });

        expect(checker.degradedThreshold).toBe(2000);
      });
    });

    describe('resetHealthChecker()', () => {
      it('should reset singleton', () => {
        const checker1 = getHealthChecker();
        resetHealthChecker();
        const checker2 = getHealthChecker();

        expect(checker1).not.toBe(checker2);
      });

      it('should stop monitoring on reset', () => {
        const checker = getHealthChecker();
        const mockTransport = { isReady: vi.fn().mockReturnValue(true) };
        checker.startMonitoring('test', mockTransport);

        resetHealthChecker();

        expect(checker.intervals.size).toBe(0);
      });
    });
  });
});
