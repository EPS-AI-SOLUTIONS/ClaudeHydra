/**
 * Time Utilities Tests
 * @module test/unit/utils/time.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  debounce,
  formatDate,
  formatDuration,
  formatLocalDate,
  formatRelative,
  sleep,
  throttle,
  timeout,
} from '../../../src/utils/time.js';

describe('Time Utilities', () => {
  describe('formatDate()', () => {
    it('should format date to ISO string without milliseconds', () => {
      const date = new Date('2024-01-15T12:30:45.123Z');
      expect(formatDate(date)).toBe('2024-01-15T12:30:45Z');
    });

    it('should use current date if not provided', () => {
      const result = formatDate();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  describe('formatLocalDate()', () => {
    it('should format date to locale string', () => {
      const date = new Date('2024-01-15T12:30:45Z');
      const result = formatLocalDate(date, 'en-US');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should use default locale', () => {
      const date = new Date('2024-01-15T12:30:45Z');
      const result = formatLocalDate(date);
      expect(typeof result).toBe('string');
    });
  });

  describe('formatRelative()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "just now" for recent timestamps', () => {
      const now = new Date();
      expect(formatRelative(now)).toBe('just now');
    });

    it('should return minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelative(fiveMinutesAgo)).toBe('5m ago');
    });

    it('should return hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelative(twoHoursAgo)).toBe('2h ago');
    });

    it('should return days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelative(threeDaysAgo)).toBe('3d ago');
    });

    it('should accept timestamp number', () => {
      const timestamp = Date.now() - 30 * 1000;
      expect(formatRelative(timestamp)).toBe('just now');
    });
  });

  describe('formatDuration()', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3665000)).toBe('1h 1m');
    });

    it('should format days and hours', () => {
      expect(formatDuration(90000000)).toBe('1d 1h');
    });

    it('should format long duration with long=true', () => {
      const result = formatDuration(90061000, true);
      expect(result).toContain('day');
      expect(result).toContain('hour');
      expect(result).toContain('minute');
      expect(result).toContain('second');
    });

    it('should handle 0 duration with long format', () => {
      // Edge case - very small duration
      expect(formatDuration(0, false)).toBe('0ms');
    });
  });

  describe('sleep()', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should resolve after specified time', async () => {
      vi.useFakeTimers();

      const promise = sleep(1000);
      vi.advanceTimersByTime(1000);

      await expect(promise).resolves.toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe('timeout()', () => {
    it('should reject after specified time', async () => {
      await expect(timeout(50, 'Test timeout')).rejects.toThrow('Test timeout');
    });

    it('should use default message', async () => {
      await expect(timeout(50)).rejects.toThrow('timed out');
    });
  });

  describe('debounce()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delay function execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throttle subsequent calls', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should allow call after throttle period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      vi.advanceTimersByTime(100);
      throttled();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to function', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });
});
