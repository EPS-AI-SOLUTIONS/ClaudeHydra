/**
 * HYDRA Logger Module
 * Centralized logging with levels, timestamps, and file output
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createStyler, ANSI } from './colors.js';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
  silent: 5,
};

const LEVEL_LABELS = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  fatal: 'FTL',
};

const LEVEL_COLORS = {
  debug: 'gray',
  info: 'cyan',
  warn: 'yellow',
  error: 'red',
  fatal: 'bgRed',
};

/**
 * Log entry structure
 */
class LogEntry {
  constructor(level, message, context = {}) {
    this.timestamp = new Date();
    this.level = level;
    this.message = message;
    this.context = context;
  }

  toJSON() {
    return {
      timestamp: this.timestamp.toISOString(),
      level: this.level,
      message: this.message,
      ...this.context,
    };
  }

  toString(showTimestamp = false) {
    const ts = showTimestamp
      ? `[${this.timestamp.toISOString()}] `
      : '';
    const ctx = Object.keys(this.context).length
      ? ` ${JSON.stringify(this.context)}`
      : '';
    return `${ts}[${LEVEL_LABELS[this.level]}] ${this.message}${ctx}`;
  }
}

/**
 * HYDRA Logger class
 */
export class Logger {
  constructor(options = {}) {
    this.name = options.name || 'HYDRA';
    this.level = LOG_LEVELS[options.level] ?? LOG_LEVELS.info;
    this.colorized = options.colorized !== false;
    this.timestamps = options.timestamps || false;
    this.logFile = options.logFile || null;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.styler = createStyler(this.colorized);
    this.listeners = [];
    this.buffer = [];
    this.bufferSize = options.bufferSize || 1000;
  }

  /**
   * Set log level
   */
  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    } else {
      this.level = level;
    }
  }

  /**
   * Enable file logging
   */
  enableFileLogging(filePath) {
    this.logFile = filePath;
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Add log listener (for aggregation)
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Get buffered logs
   */
  getBuffer() {
    return [...this.buffer];
  }

  /**
   * Clear buffer
   */
  clearBuffer() {
    this.buffer = [];
  }

  /**
   * Core log method
   */
  _log(level, message, context = {}) {
    const numericLevel = LOG_LEVELS[level];
    if (numericLevel < this.level) return;

    const entry = new LogEntry(level, message, context);

    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        /* ignore listener errors */
      }
    }

    // Console output
    const color = LEVEL_COLORS[level];
    const c = this.styler.c;
    const prefix = this.timestamps
      ? `${c.dim}[${entry.timestamp.toISOString()}]${c.reset} `
      : '';
    const nameTag = `${c[color]}[${this.name}]${c.reset}`;
    const msg = level === 'error' || level === 'fatal'
      ? this.styler.error(message)
      : level === 'warn'
        ? this.styler.warning(message)
        : message;

    console.log(`${prefix}${nameTag} ${msg}`);

    // File output
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, entry.toJSON() + '\n');
      } catch {
        /* ignore file errors */
      }
    }

    return entry;
  }

  // Convenience methods
  debug(message, context) {
    return this._log('debug', message, context);
  }

  info(message, context) {
    return this._log('info', message, context);
  }

  warn(message, context) {
    return this._log('warn', message, context);
  }

  error(message, context) {
    return this._log('error', message, context);
  }

  fatal(message, context) {
    return this._log('fatal', message, context);
  }

  /**
   * Log with timing
   */
  time(label) {
    const start = performance.now();
    return {
      end: (message) => {
        const duration = performance.now() - start;
        this.debug(`${message || label}: ${duration.toFixed(2)}ms`, {
          duration,
          label,
        });
        return duration;
      },
    };
  }

  /**
   * Create child logger with prefix
   */
  child(name) {
    const child = new Logger({
      name: `${this.name}:${name}`,
      level: Object.keys(LOG_LEVELS).find((k) => LOG_LEVELS[k] === this.level),
      colorized: this.colorized,
      timestamps: this.timestamps,
      logFile: this.logFile,
    });
    child.listeners = this.listeners;
    child.buffer = this.buffer;
    return child;
  }
}

/**
 * Default global logger instance
 */
let globalLogger = null;

export function getLogger(options) {
  if (!globalLogger) {
    globalLogger = new Logger(options);
  }
  return globalLogger;
}

export function setGlobalLogger(logger) {
  globalLogger = logger;
}

export { LOG_LEVELS };
