/**
 * HYDRA Retry Logic Tests
 * @module test/unit/hydra/core/retry.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  calculateDelay,
  sleep,
  withRetry,
  createRetryable,
  CircuitBreaker,
  CircuitState
} from '../../../../src/hydra/core/retry.js';

describe('HYDRA Retry Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelay).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelay).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain('ECONNRESET');
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(429);
    });
  });

  describe('isRetryableError()', () => {
    it('should return true for retryable error codes', () => {
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
    });

    it('should return true for retryable error names', () => {
      expect(isRetryableError({ name: 'AbortError' })).toBe(true);
      expect(isRetryableError({ name: 'TimeoutError' })).toBe(true);
    });

    it('should return true for timeout messages', () => {
      expect(isRetryableError({ message: 'Connection timeout occurred' })).toBe(true);
      expect(isRetryableError({ message: 'Request TIMEOUT' })).toBe(true);
    });

    it('should return true for retryable status codes', () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError({ status: 500 })).toBe(true);
    });

    it('should return true for rate limit messages', () => {
      // Note: patterns are case-sensitive - 'rate limit' (lowercase)
      expect(isRetryableError({ message: 'rate limit exceeded' })).toBe(true);
      expect(isRetryableError({ message: 'too many requests' })).toBe(true);
      expect(isRetryableError({ message: 'Error 429 received' })).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError({ message: 'Invalid input' })).toBe(false);
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ code: 'EINVAL' })).toBe(false);
    });

    it('should use custom shouldRetry function', () => {
      const customShouldRetry = (error) => error.customRetry === true;
      expect(isRetryableError({ customRetry: true }, { shouldRetry: customShouldRetry })).toBe(true);
      expect(isRetryableError({ customRetry: false }, { shouldRetry: customShouldRetry })).toBe(false);
    });
  });

  describe('calculateDelay()', () => {
    it('should calculate exponential delay', () => {
      const options = { ...DEFAULT_RETRY_CONFIG, jitter: false };
      expect(calculateDelay(0, options)).toBe(1000);
      expect(calculateDelay(1, options)).toBe(2000);
      expect(calculateDelay(2, options)).toBe(4000);
      expect(calculateDelay(3, options)).toBe(8000);
    });

    it('should cap delay at maxDelay', () => {
      const options = { ...DEFAULT_RETRY_CONFIG, jitter: false, maxDelay: 5000 };
      expect(calculateDelay(10, options)).toBe(5000);
    });

    it('should apply jitter when enabled', () => {
      const options = { ...DEFAULT_RETRY_CONFIG, jitter: true };
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.5 + 0.5 = 1.0 factor
      expect(calculateDelay(0, options)).toBe(1000);
      vi.spyOn(Math, 'random').mockReturnValue(0); // 0 + 0.5 = 0.5 factor
      expect(calculateDelay(0, options)).toBe(500);
    });
  });

  describe('sleep()', () => {
    it('should delay execution', async () => {
      const promise = sleep(1000);
      vi.advanceTimersByTime(1000);
      await promise;
    });
  });

  describe('withRetry()', () => {
    it('should return result on first success', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      vi.useRealTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValue('success');
      const result = await withRetry(fn, { baseDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue({ code: 'ECONNRESET' });
      await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 }))
        .rejects.toEqual({ code: 'ECONNRESET' });
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should throw immediately for non-retryable error', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue({ message: 'Invalid input' });
      await expect(withRetry(fn)).rejects.toEqual({ message: 'Invalid input' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      vi.useRealTimers();
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValue('success');
      await withRetry(fn, { onRetry, baseDelay: 10 });
      expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
        attempt: 1,
        willRetry: true
      }));
    });
  });

  describe('createRetryable()', () => {
    it('should create retryable wrapper', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');
      const retryable = createRetryable(fn, { maxRetries: 2 });
      const result = await retryable();
      expect(result).toBe('success');
    });

    it('should allow overriding options', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue({ code: 'ECONNRESET' });
      const retryable = createRetryable(fn, { maxRetries: 5, baseDelay: 10 });
      await expect(retryable({ maxRetries: 1 })).rejects.toEqual({ code: 'ECONNRESET' });
      expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('CircuitBreaker', () => {
    let breaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000
      });
    });

    describe('constructor()', () => {
      it('should use default config', () => {
        const defaultBreaker = new CircuitBreaker();
        expect(defaultBreaker.failureThreshold).toBe(5);
        expect(defaultBreaker.successThreshold).toBe(2);
        expect(defaultBreaker.timeout).toBe(30000);
      });

      it('should accept custom config', () => {
        expect(breaker.failureThreshold).toBe(3);
        expect(breaker.successThreshold).toBe(2);
        expect(breaker.timeout).toBe(5000);
      });

      it('should start in CLOSED state', () => {
        expect(breaker.state).toBe(CircuitState.CLOSED);
      });
    });

    describe('execute()', () => {
      it('should execute function in CLOSED state', async () => {
        vi.useRealTimers();
        const fn = vi.fn().mockResolvedValue('result');
        const result = await breaker.execute(fn);
        expect(result).toBe('result');
      });

      it('should open circuit after threshold failures', async () => {
        vi.useRealTimers();
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        for (let i = 0; i < 3; i++) {
          try { await breaker.execute(fn); } catch {}
        }

        expect(breaker.state).toBe(CircuitState.OPEN);
      });

      it('should reject immediately when circuit is OPEN', async () => {
        vi.useRealTimers();
        breaker.forceOpen();
        const fn = vi.fn().mockResolvedValue('result');
        await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
        expect(fn).not.toHaveBeenCalled();
      });

      it('should move to HALF_OPEN after timeout', async () => {
        vi.useRealTimers();
        breaker.forceOpen();
        // Simulate time passing by setting nextAttempt to the past
        breaker.nextAttempt = Date.now() - 1000;

        const fn = vi.fn().mockResolvedValue('result');
        await breaker.execute(fn);
        expect(breaker.state).toBe(CircuitState.HALF_OPEN);
      });

      it('should close circuit after success threshold in HALF_OPEN', async () => {
        vi.useRealTimers();
        breaker.state = CircuitState.HALF_OPEN;
        breaker.successCount = 0;

        const fn = vi.fn().mockResolvedValue('result');
        await breaker.execute(fn);
        await breaker.execute(fn);

        expect(breaker.state).toBe(CircuitState.CLOSED);
      });

      it('should reset failure count on success in CLOSED state', async () => {
        vi.useRealTimers();
        const failFn = vi.fn().mockRejectedValue(new Error('fail'));
        const successFn = vi.fn().mockResolvedValue('result');

        try { await breaker.execute(failFn); } catch {}
        try { await breaker.execute(failFn); } catch {}

        await breaker.execute(successFn);
        expect(breaker.failureCount).toBe(0);
      });
    });

    describe('forceOpen() and forceClose()', () => {
      it('should force circuit open', () => {
        breaker.forceOpen();
        expect(breaker.state).toBe(CircuitState.OPEN);
        expect(breaker.nextAttempt).toBeDefined();
      });

      it('should force circuit closed', () => {
        breaker.forceOpen();
        breaker.forceClose();
        expect(breaker.state).toBe(CircuitState.CLOSED);
        expect(breaker.failureCount).toBe(0);
        expect(breaker.nextAttempt).toBeNull();
      });
    });

    describe('getState()', () => {
      it('should return current state', () => {
        const state = breaker.getState();
        expect(state.state).toBe(CircuitState.CLOSED);
        expect(state.failureCount).toBe(0);
        expect(state.successCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
        expect(state.nextAttempt).toBeNull();
      });
    });
  });

  describe('CircuitState', () => {
    it('should have correct state values', () => {
      expect(CircuitState.CLOSED).toBe('closed');
      expect(CircuitState.OPEN).toBe('open');
      expect(CircuitState.HALF_OPEN).toBe('half-open');
    });
  });
});
