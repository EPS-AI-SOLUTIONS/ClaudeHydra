/**
 * Debug Utilities for Claude HYDRA
 *
 * Provides debugging helpers based on Tauri 2 best practices:
 * - Environment detection
 * - Conditional logging
 * - Performance timing
 * - DevTools integration
 *
 * @see https://v2.tauri.app/develop/debug/
 */

import { invoke } from '@tauri-apps/api/core';

// ═══════════════════════════════════════════════════════════════════════════════
// Environment Detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if running in Tauri context
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return import.meta.env.DEV;
}

/**
 * Check if running in production mode
 */
export function isProd(): boolean {
  return import.meta.env.PROD;
}

/**
 * Get current environment name
 */
export function getEnv(): 'development' | 'production' | 'test' {
  if (import.meta.env.MODE === 'test') return 'test';
  return isDev() ? 'development' : 'production';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Conditional Logging
// ═══════════════════════════════════════════════════════════════════════════════

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  /** Only log in development */
  devOnly?: boolean;
  /** Include timestamp */
  timestamp?: boolean;
  /** Custom prefix */
  prefix?: string;
}

const DEFAULT_OPTIONS: LogOptions = {
  devOnly: true,
  timestamp: true,
  prefix: '[HYDRA]',
};

function formatMessage(level: LogLevel, message: string, options: LogOptions): string {
  const parts: string[] = [];

  if (options.prefix) {
    parts.push(options.prefix);
  }

  if (options.timestamp) {
    parts.push(`[${new Date().toISOString()}]`);
  }

  parts.push(`[${level.toUpperCase()}]`);
  parts.push(message);

  return parts.join(' ');
}

/**
 * Debug logger - only logs in development mode by default
 */
export const logger = {
  debug(message: string, data?: unknown, options: LogOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    if (opts.devOnly && !isDev()) return;

    const formatted = formatMessage('debug', message, opts);
    if (data !== undefined) {
      console.debug(formatted, data);
    } else {
      console.debug(formatted);
    }
  },

  info(message: string, data?: unknown, options: LogOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    if (opts.devOnly && !isDev()) return;

    const formatted = formatMessage('info', message, opts);
    if (data !== undefined) {
      console.info(formatted, data);
    } else {
      console.info(formatted);
    }
  },

  warn(message: string, data?: unknown, options: LogOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, devOnly: false, ...options };

    const formatted = formatMessage('warn', message, opts);
    if (data !== undefined) {
      console.warn(formatted, data);
    } else {
      console.warn(formatted);
    }
  },

  error(message: string, data?: unknown, options: LogOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, devOnly: false, ...options };

    const formatted = formatMessage('error', message, opts);
    if (data !== undefined) {
      console.error(formatted, data);
    } else {
      console.error(formatted);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Performance Timing
// ═══════════════════════════════════════════════════════════════════════════════

interface TimerResult {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
}

const activeTimers = new Map<string, number>();
const timerResults: TimerResult[] = [];

/**
 * Start a performance timer
 */
export function timerStart(name: string): void {
  if (!isDev()) return;
  activeTimers.set(name, performance.now());
}

/**
 * Stop a performance timer and return duration
 */
export function timerStop(name: string): number | null {
  if (!isDev()) return null;

  const startTime = activeTimers.get(name);
  if (startTime === undefined) {
    logger.warn(`Timer "${name}" was not started`);
    return null;
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  activeTimers.delete(name);

  const result: TimerResult = {
    name,
    duration,
    startTime,
    endTime,
  };

  timerResults.push(result);

  // Keep only last 100 results
  if (timerResults.length > 100) {
    timerResults.shift();
  }

  logger.debug(`Timer "${name}": ${duration.toFixed(2)}ms`);

  return duration;
}

/**
 * Get all timer results
 */
export function getTimerResults(): TimerResult[] {
  return [...timerResults];
}

/**
 * Clear timer results
 */
export function clearTimerResults(): void {
  timerResults.length = 0;
}

/**
 * Async function timing wrapper
 */
export async function withTiming<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  timerStart(name);
  try {
    return await fn();
  } finally {
    timerStop(name);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rust Backend Integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send log to Rust backend debug system
 */
export async function logToBackend(
  level: LogLevel,
  source: string,
  message: string,
  details?: string
): Promise<void> {
  if (!isTauri()) return;

  try {
    await invoke('debug_add_log', {
      level,
      source,
      message,
      details,
    });
  } catch (e) {
    // Silently fail - backend might not be ready
    console.debug('Failed to send log to backend:', e);
  }
}

/**
 * Get debug stats from Rust backend
 */
export async function getBackendStats(): Promise<unknown> {
  if (!isTauri()) return null;

  try {
    return await invoke('debug_get_stats');
  } catch (e) {
    logger.debug('Failed to get backend stats', e);
    return null;
  }
}

/**
 * Get debug logs from Rust backend
 */
export async function getBackendLogs(
  level?: LogLevel,
  limit?: number
): Promise<unknown[]> {
  if (!isTauri()) return [];

  try {
    return (await invoke('debug_get_logs', { level, limit })) as unknown[];
  } catch (e) {
    logger.debug('Failed to get backend logs', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DevTools Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DevTools keyboard shortcut info
 */
export const DEVTOOLS_SHORTCUTS = {
  windows: 'Ctrl+Shift+I',
  macos: 'Cmd+Option+I',
  linux: 'Ctrl+Shift+I',
} as const;

/**
 * Get DevTools shortcut for current platform
 */
export function getDevToolsShortcut(): string {
  const platform = navigator.platform.toLowerCase();

  if (platform.includes('mac')) {
    return DEVTOOLS_SHORTCUTS.macos;
  } else if (platform.includes('win')) {
    return DEVTOOLS_SHORTCUTS.windows;
  } else {
    return DEVTOOLS_SHORTCUTS.linux;
  }
}

/**
 * Print debug info to console (for DevTools)
 */
export function printDebugInfo(): void {
  console.group('🔧 Claude HYDRA Debug Info');
  console.log('Environment:', getEnv());
  console.log('Tauri Context:', isTauri());
  console.log('DevTools Shortcut:', getDevToolsShortcut());
  console.log('Timer Results:', getTimerResults().length);
  console.log('Platform:', navigator.platform);
  console.log('User Agent:', navigator.userAgent);
  console.groupEnd();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Global Debug Object (for console access)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Expose debug utilities globally for DevTools console access
 */
export function exposeDebugGlobals(): void {
  if (!isDev()) return;

  const debugAPI = {
    logger,
    isTauri,
    isDev,
    isProd,
    getEnv,
    timerStart,
    timerStop,
    getTimerResults,
    clearTimerResults,
    withTiming,
    getBackendStats,
    getBackendLogs,
    printDebugInfo,
    getDevToolsShortcut,
  };

  // @ts-expect-error - intentionally adding to window
  window.__HYDRA_DEBUG__ = debugAPI;

  logger.info('Debug utilities exposed as window.__HYDRA_DEBUG__');
}

// Auto-expose in development
if (isDev() && typeof window !== 'undefined') {
  exposeDebugGlobals();
}
