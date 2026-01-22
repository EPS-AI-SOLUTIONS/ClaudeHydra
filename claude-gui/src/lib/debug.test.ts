/**
 * Debug Utilities Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTauri,
  isDev,
  isProd,
  getEnv,
  logger,
  timerStart,
  timerStop,
  getTimerResults,
  clearTimerResults,
  withTiming,
  getDevToolsShortcut,
  DEVTOOLS_SHORTCUTS,
  printDebugInfo,
} from './debug';

describe('Debug Utilities', () => {
  describe('Environment Detection', () => {
    it('isTauri should return boolean', () => {
      expect(typeof isTauri()).toBe('boolean');
    });

    it('isDev should return boolean', () => {
      expect(typeof isDev()).toBe('boolean');
    });

    it('isProd should return boolean', () => {
      expect(typeof isProd()).toBe('boolean');
    });

    it('isDev and isProd should be mutually exclusive in non-test', () => {
      // In test mode, these might both be false
      const dev = isDev();
      const prod = isProd();
      // They should never both be true
      expect(dev && prod).toBe(false);
    });

    it('getEnv should return valid environment string', () => {
      const env = getEnv();
      expect(['development', 'production', 'test']).toContain(env);
    });
  });

  describe('Logger', () => {
    let consoleSpy: {
      debug: ReturnType<typeof vi.spyOn>;
      info: ReturnType<typeof vi.spyOn>;
      warn: ReturnType<typeof vi.spyOn>;
      error: ReturnType<typeof vi.spyOn>;
    };

    beforeEach(() => {
      consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('logger.debug should call console.debug', () => {
      logger.debug('test message');
      expect(consoleSpy.debug).toHaveBeenCalled();
    });

    it('logger.info should call console.info', () => {
      logger.info('test message');
      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('logger.warn should call console.warn', () => {
      logger.warn('test message');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('logger.error should call console.error', () => {
      logger.error('test message');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('logger should include prefix in message', () => {
      logger.info('test message');
      const callArgs = consoleSpy.info.mock.calls[0][0] as string;
      expect(callArgs).toContain('[HYDRA]');
    });

    it('logger should include timestamp in message', () => {
      logger.info('test message');
      const callArgs = consoleSpy.info.mock.calls[0][0] as string;
      // Timestamp format: [2024-01-01T00:00:00.000Z]
      expect(callArgs).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('logger should include log level in message', () => {
      logger.warn('test message');
      const callArgs = consoleSpy.warn.mock.calls[0][0] as string;
      expect(callArgs).toContain('[WARN]');
    });

    it('logger should handle data parameter', () => {
      const data = { foo: 'bar' };
      logger.info('test message', data);
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('test message'),
        data
      );
    });

    it('logger.warn should log even with devOnly option', () => {
      logger.warn('warning', undefined, { devOnly: true });
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('logger.error should log even with devOnly option', () => {
      logger.error('error', undefined, { devOnly: true });
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('Performance Timing', () => {
    beforeEach(() => {
      clearTimerResults();
    });

    it('timerStart and timerStop should measure time', () => {
      timerStart('test-timer');
      const duration = timerStop('test-timer');
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('timerStop should return null for non-existent timer', () => {
      const result = timerStop('non-existent');
      expect(result).toBeNull();
    });

    it('getTimerResults should return array', () => {
      const results = getTimerResults();
      expect(Array.isArray(results)).toBe(true);
    });

    it('timer results should be recorded', () => {
      timerStart('recorded-timer');
      timerStop('recorded-timer');

      const results = getTimerResults();
      expect(results.length).toBeGreaterThan(0);
      expect(results[results.length - 1].name).toBe('recorded-timer');
    });

    it('clearTimerResults should clear all results', () => {
      timerStart('clear-test');
      timerStop('clear-test');
      expect(getTimerResults().length).toBeGreaterThan(0);

      clearTimerResults();
      expect(getTimerResults().length).toBe(0);
    });

    it('withTiming should measure async function', async () => {
      const result = await withTiming('async-test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result).toBe('done');

      const results = getTimerResults();
      const asyncResult = results.find((r) => r.name === 'async-test');
      expect(asyncResult).toBeDefined();
      expect(asyncResult!.duration).toBeGreaterThanOrEqual(10);
    });

    it('timer results should include all required fields', () => {
      timerStart('field-test');
      timerStop('field-test');

      const results = getTimerResults();
      const result = results[results.length - 1];

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('startTime');
      expect(result).toHaveProperty('endTime');
    });
  });

  describe('DevTools Helpers', () => {
    it('DEVTOOLS_SHORTCUTS should have all platforms', () => {
      expect(DEVTOOLS_SHORTCUTS.windows).toBeDefined();
      expect(DEVTOOLS_SHORTCUTS.macos).toBeDefined();
      expect(DEVTOOLS_SHORTCUTS.linux).toBeDefined();
    });

    it('getDevToolsShortcut should return valid shortcut', () => {
      const shortcut = getDevToolsShortcut();
      expect(typeof shortcut).toBe('string');
      expect(shortcut.length).toBeGreaterThan(0);
    });

    it('getDevToolsShortcut should return platform-specific shortcut', () => {
      const shortcut = getDevToolsShortcut();
      const allShortcuts = Object.values(DEVTOOLS_SHORTCUTS);
      expect(allShortcuts).toContain(shortcut);
    });

    it('printDebugInfo should not throw', () => {
      // Mock console.group and console.groupEnd
      const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
      const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      expect(() => printDebugInfo()).not.toThrow();

      groupSpy.mockRestore();
      groupEndSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('Timer Limits', () => {
    beforeEach(() => {
      clearTimerResults();
    });

    it('should keep only last 100 timer results', () => {
      for (let i = 0; i < 110; i++) {
        timerStart(`timer-${i}`);
        timerStop(`timer-${i}`);
      }

      const results = getTimerResults();
      expect(results.length).toBeLessThanOrEqual(100);
    });
  });
});
