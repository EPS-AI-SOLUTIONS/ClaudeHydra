// Enhanced Logger with async writing, rotation, colors, and performance optimizations
// ES Module - Singleton Pattern
// ClaudeHYDRA Correlation ID Support via AsyncLocalStorage

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { PATHS } from './constants.js';

// ==================== Correlation ID Support ====================

/**
 * AsyncLocalStorage for correlation ID context tracking
 * Allows automatic propagation of correlation IDs through async operations
 */
const correlationStorage = new AsyncLocalStorage();

/**
 * Generates a unique correlation ID for request tracing
 * Format: hydra-{timestamp}-{random}
 * @returns {string} Unique correlation ID
 */
export function generateCorrelationId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `hydra-${timestamp}-${random}`;
}

/**
 * Gets the current correlation ID from context or global fallback
 * @returns {string|null} Current correlation ID or null
 */
function getCurrentCorrelationId() {
  const store = correlationStorage.getStore();
  return store?.correlationId || null;
}

/**
 * Executes a function within a correlation ID context
 * All logs within the function will automatically include the correlation ID
 * @param {string} correlationId - The correlation ID to use
 * @param {Function} fn - The function to execute
 * @returns {*} Result of the function
 */
export function withCorrelationId(correlationId, fn) {
  return correlationStorage.run({ correlationId }, fn);
}

/**
 * Express middleware for correlation ID tracking
 * Extracts correlation ID from headers or generates a new one
 * Adds correlation ID to response headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function correlationMiddleware(req, res, next) {
  // Check for existing correlation ID in headers
  const existingId =
    req.headers['x-correlation-id'] || req.headers['x-request-id'] || req.headers.traceparent;

  const correlationId = existingId || generateCorrelationId();

  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Run the rest of the request in correlation context
  correlationStorage.run({ correlationId }, () => {
    // Attach to request for easy access
    req.correlationId = correlationId;
    next();
  });
}

// Import ANSI colors from dedicated module
// Colors have been extracted to ./logger/colors.js for reusability
import { COLORS } from './logger/colors.js';

// Re-export colors for backwards compatibility
export { COLORS } from './logger/colors.js';

// Log level configuration
const LOG_LEVELS = {
  error: { priority: 0, color: COLORS.red, bgColor: COLORS.bgRed, label: 'ERROR' },
  warn: { priority: 1, color: COLORS.yellow, bgColor: COLORS.bgYellow, label: 'WARN' },
  info: { priority: 2, color: COLORS.cyan, label: 'INFO' },
  http: { priority: 3, color: COLORS.magenta, label: 'HTTP' },
  debug: { priority: 4, color: COLORS.gray, label: 'DEBUG' },
  trace: { priority: 5, color: COLORS.dim + COLORS.gray, label: 'TRACE' },
};

// Default configuration
const DEFAULT_CONFIG = {
  // Log level threshold (logs at this level and below will be recorded)
  level: 'info',

  // File rotation settings
  rotation: {
    enabled: true,
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    compress: false, // Future: gzip old logs
  },

  // Console output settings
  console: {
    enabled: true,
    colors: true,
    timestamps: true,
    level: 'info', // Separate level for console
  },

  // File output settings
  file: {
    enabled: true,
    prettyPrint: false, // Use indented JSON
    timestamps: true,
  },

  // Performance settings
  performance: {
    batchSize: 100, // Number of logs to batch before flush
    flushInterval: 1000, // Milliseconds between auto-flushes
    asyncWrite: true, // Use async file operations
  },
};

/**
 * High-performance Logger with async file writing, rotation, and colored output
 * Implements proper singleton pattern with ES modules
 */
class Logger {
  static #instance = null;

  #config;
  #logDir;
  #currentLogFile;
  #currentFileSize = 0;
  #writeBuffer = [];
  #flushTimer = null;
  #currentDate = null;

  /**
   * Private constructor - use Logger.getInstance() instead
   */
  constructor(config = {}) {
    if (Logger.#instance) {
      throw new Error('Logger is a singleton. Use Logger.getInstance() instead.');
    }

    this.#config = this.#mergeConfig(DEFAULT_CONFIG, config);
    this.#logDir = path.join(process.cwd(), PATHS.LOG_DIR || '.hydra-data/logs');
    this.#currentDate = this.#getDateString();

    // Synchronous init for constructor (async init happens on first write)
    this.#ensureLogDirSync();
    this.#currentLogFile = this.#getLogFileName();
    this.#getCurrentFileSize();

    // Start flush timer
    this.#startFlushTimer();

    // Handle process exit
    this.#setupExitHandlers();

    Logger.#instance = this;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(config = {}) {
    if (!Logger.#instance) {
      new Logger(config);
    }
    return Logger.#instance;
  }

  /**
   * Reset the singleton (useful for testing)
   */
  static resetInstance() {
    if (Logger.#instance) {
      Logger.#instance.#stopFlushTimer();
      Logger.#instance.flush();
    }
    Logger.#instance = null;
  }

  /**
   * Update configuration at runtime
   */
  configure(config) {
    this.#config = this.#mergeConfig(this.#config, config);
    return this;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.#config };
  }

  // ==================== Core Logging Methods ====================

  error(message, meta = {}) {
    this.#log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.#log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.#log('info', message, meta);
  }

  http(message, meta = {}) {
    this.#log('http', message, meta);
  }

  debug(message, meta = {}) {
    this.#log('debug', message, meta);
  }

  trace(message, meta = {}) {
    this.#log('trace', message, meta);
  }

  /**
   * Log with explicit level
   */
  log(level, message, meta = {}) {
    this.#log(level, message, meta);
  }

  // ==================== Internal Methods ====================

  #log(level, message, meta = {}) {
    const levelConfig = LOG_LEVELS[level];
    if (!levelConfig) {
      console.error(`Unknown log level: ${level}`);
      return;
    }

    const configLevel = LOG_LEVELS[this.#config.level];
    if (levelConfig.priority > configLevel.priority) {
      return; // Skip logs below configured threshold
    }

    const timestamp = new Date().toISOString();

    // Get correlation ID from context or meta
    const correlationId = meta.correlationId || getCurrentCorrelationId();

    const logEntry = {
      timestamp,
      level: levelConfig.label,
      ...(correlationId && { correlationId }),
      message,
      ...meta,
    };

    // Remove correlationId from meta to avoid duplication
    if (meta.correlationId) {
      delete logEntry.correlationId;
      logEntry.correlationId = meta.correlationId;
    }

    // Console output (sync for immediate feedback)
    if (this.#config.console.enabled) {
      const consoleLevel = LOG_LEVELS[this.#config.console.level];
      if (levelConfig.priority <= consoleLevel.priority) {
        this.#writeToConsole(level, timestamp, message, meta, correlationId);
      }
    }

    // File output (async/batched for performance)
    if (this.#config.file.enabled) {
      this.#addToBuffer(logEntry);
    }
  }

  #writeToConsole(level, timestamp, message, meta, correlationId = null) {
    const levelConfig = LOG_LEVELS[level];
    const useColors = this.#config.console.colors && process.stdout.isTTY;
    const isProd = process.env.NODE_ENV === 'production';

    let output = '';

    // Production format: JSON output
    if (isProd) {
      const logObj = {
        timestamp,
        level: levelConfig.label,
        ...(correlationId && { correlationId }),
        ...(meta.module && { module: meta.module }),
        message,
        ...meta,
      };
      // Remove module from spread to avoid duplication
      if (meta.module) delete logObj.module;
      output = JSON.stringify(logObj);
    } else if (useColors) {
      // Dev format: [module] message {data}
      const timeStr = this.#config.console.timestamps
        ? `${COLORS.gray}[${timestamp}]${COLORS.reset} `
        : '';

      const levelStr = `${levelConfig.color}${COLORS.bright}${levelConfig.label.padEnd(5)}${COLORS.reset}`;

      // Module prefix if present
      const moduleStr =
        meta.module || meta.context
          ? `${COLORS.cyan}[${meta.module || meta.context}]${COLORS.reset} `
          : '';

      // Correlation ID prefix (shortened for dev)
      const corrStr = correlationId
        ? `${COLORS.dim}(${correlationId.slice(-8)})${COLORS.reset} `
        : '';

      const messageStr = level === 'error' ? `${COLORS.red}${message}${COLORS.reset}` : message;

      output = `${timeStr}${levelStr} ${moduleStr}${corrStr}${messageStr}`;

      // Add meta if present (excluding module/context)
      const displayMeta = { ...meta };
      delete displayMeta.module;
      delete displayMeta.context;
      delete displayMeta.correlationId;

      if (Object.keys(displayMeta).length > 0) {
        const metaStr = JSON.stringify(displayMeta, null, 0);
        output += ` ${COLORS.dim}${metaStr}${COLORS.reset}`;
      }
    } else {
      // Plain output format (no colors, non-TTY)
      const timeStr = this.#config.console.timestamps ? `[${timestamp}] ` : '';
      const moduleStr = meta.module || meta.context ? `[${meta.module || meta.context}] ` : '';
      const corrStr = correlationId ? `(${correlationId.slice(-8)}) ` : '';
      output = `${timeStr}[${levelConfig.label}] ${moduleStr}${corrStr}${message}`;

      const displayMeta = { ...meta };
      delete displayMeta.module;
      delete displayMeta.context;
      delete displayMeta.correlationId;

      if (Object.keys(displayMeta).length > 0) {
        output += ` ${JSON.stringify(displayMeta)}`;
      }
    }

    // Use appropriate console method
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  #addToBuffer(logEntry) {
    const logLine = this.#config.file.prettyPrint
      ? `${JSON.stringify(logEntry, null, 2)}\n`
      : `${JSON.stringify(logEntry)}\n`;

    this.#writeBuffer.push(logLine);

    // Flush if buffer is full
    if (this.#writeBuffer.length >= this.#config.performance.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush buffered logs to file
   */
  async flush() {
    if (this.#writeBuffer.length === 0) {
      return;
    }

    // Check for date change (daily rotation)
    const currentDate = this.#getDateString();
    if (currentDate !== this.#currentDate) {
      this.#currentDate = currentDate;
      this.#currentLogFile = this.#getLogFileName();
      this.#currentFileSize = 0;
    }

    // Get buffered content
    const content = this.#writeBuffer.join('');
    this.#writeBuffer = [];

    // Check rotation before writing
    if (this.#config.rotation.enabled) {
      await this.#checkRotation(content.length);
    }

    // Write to file
    if (this.#config.performance.asyncWrite) {
      await this.#writeAsync(content);
    } else {
      this.#writeSync(content);
    }
  }

  /**
   * Synchronous flush for shutdown scenarios
   */
  flushSync() {
    if (this.#writeBuffer.length === 0) {
      return;
    }

    const content = this.#writeBuffer.join('');
    this.#writeBuffer = [];

    this.#writeSync(content);
  }

  async #writeAsync(content) {
    try {
      await fsPromises.appendFile(this.#currentLogFile, content, { encoding: 'utf8' });
      this.#currentFileSize += Buffer.byteLength(content, 'utf8');
    } catch (err) {
      // Fallback to sync write on error
      console.error('Async write failed, falling back to sync:', err.message);
      this.#writeSync(content);
    }
  }

  #writeSync(content) {
    try {
      fs.appendFileSync(this.#currentLogFile, content, { encoding: 'utf8' });
      this.#currentFileSize += Buffer.byteLength(content, 'utf8');
    } catch (err) {
      console.error('CRITICAL: Failed to write to log file:', err.message);
    }
  }

  // ==================== Log Rotation ====================

  async #checkRotation(incomingSize) {
    const { maxSize } = this.#config.rotation;

    // Size-based rotation
    if (this.#currentFileSize + incomingSize > maxSize) {
      await this.#rotateLog();
    }
  }

  async #rotateLog() {
    const { maxFiles } = this.#config.rotation;
    const baseName = this.#currentLogFile;

    try {
      // Rotate existing files: .log.9 -> .log.10, .log.8 -> .log.9, etc.
      for (let i = maxFiles - 1; i >= 1; i--) {
        const oldFile = `${baseName}.${i}`;
        const newFile = `${baseName}.${i + 1}`;

        try {
          await fsPromises.access(oldFile);
          if (i === maxFiles - 1) {
            // Delete oldest file
            await fsPromises.unlink(oldFile);
          } else {
            await fsPromises.rename(oldFile, newFile);
          }
        } catch {
          // File doesn't exist, skip
        }
      }

      // Rename current log to .1
      try {
        await fsPromises.access(baseName);
        await fsPromises.rename(baseName, `${baseName}.1`);
      } catch {
        // Current file doesn't exist
      }

      this.#currentFileSize = 0;
    } catch (err) {
      console.error('Log rotation failed:', err.message);
    }

    // Clean old logs by age
    await this.#cleanOldLogs();
  }

  async #cleanOldLogs() {
    const { maxAge } = this.#config.rotation;
    const now = Date.now();

    try {
      const files = await fsPromises.readdir(this.#logDir);

      for (const file of files) {
        if (!file.startsWith('hydra-') || !file.includes('.log')) {
          continue;
        }

        const filePath = path.join(this.#logDir, file);
        const stats = await fsPromises.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await fsPromises.unlink(filePath);
          this.debug(`Deleted old log file: ${file}`, {
            age: `${Math.round((now - stats.mtimeMs) / 86400000)} days`,
          });
        }
      }
    } catch (_err) {
      // Ignore cleanup errors
    }
  }

  // ==================== Utility Methods ====================

  #mergeConfig(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.#mergeConfig(target[key] || {}, source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }

    return result;
  }

  #getDateString() {
    return new Date().toISOString().split('T')[0];
  }

  #getLogFileName() {
    return path.join(this.#logDir, `hydra-${this.#currentDate}.log`);
  }

  #ensureLogDirSync() {
    if (!fs.existsSync(this.#logDir)) {
      fs.mkdirSync(this.#logDir, { recursive: true });
    }
  }

  #getCurrentFileSize() {
    try {
      const stats = fs.statSync(this.#currentLogFile);
      this.#currentFileSize = stats.size;
    } catch {
      this.#currentFileSize = 0;
    }
  }

  #startFlushTimer() {
    if (this.#flushTimer) {
      return;
    }

    this.#flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        console.error('Auto-flush failed:', err.message);
      });
    }, this.#config.performance.flushInterval);

    // Don't keep process alive just for logging
    this.#flushTimer.unref();
  }

  #stopFlushTimer() {
    if (this.#flushTimer) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = null;
    }
  }

  #setupExitHandlers() {
    const exitHandler = () => {
      this.#stopFlushTimer();
      this.flushSync();
    };

    process.on('exit', exitHandler);
    process.on('SIGINT', () => {
      exitHandler();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      exitHandler();
      process.exit(0);
    });
    process.on('uncaughtException', (err) => {
      this.error('Uncaught exception', { error: err.message, stack: err.stack });
      exitHandler();
      process.exit(1);
    });
  }

  // ==================== Child Logger Factory ====================

  /**
   * Create a child logger with preset context
   * @param {string} context - Context name (module name)
   * @param {Object} options - Optional settings
   * @param {string} options.correlationId - Fixed correlation ID for this logger
   * @returns {Object} Child logger instance
   */
  child(context, options = {}) {
    const fixedCorrelationId = options.correlationId || null;

    const childLogger = {
      error: (msg, meta = {}) =>
        this.error(msg, {
          ...meta,
          context,
          ...(fixedCorrelationId && { correlationId: fixedCorrelationId }),
        }),
      warn: (msg, meta = {}) =>
        this.warn(msg, {
          ...meta,
          context,
          ...(fixedCorrelationId && { correlationId: fixedCorrelationId }),
        }),
      info: (msg, meta = {}) =>
        this.info(msg, {
          ...meta,
          context,
          ...(fixedCorrelationId && { correlationId: fixedCorrelationId }),
        }),
      http: (msg, meta = {}) =>
        this.http(msg, {
          ...meta,
          context,
          ...(fixedCorrelationId && { correlationId: fixedCorrelationId }),
        }),
      debug: (msg, meta = {}) =>
        this.debug(msg, {
          ...meta,
          context,
          ...(fixedCorrelationId && { correlationId: fixedCorrelationId }),
        }),
      trace: (msg, meta = {}) =>
        this.trace(msg, {
          ...meta,
          context,
          ...(fixedCorrelationId && { correlationId: fixedCorrelationId }),
        }),
      log: (level, msg, meta = {}) =>
        this.log(level, msg, {
          ...meta,
          context,
          ...(fixedCorrelationId && { correlationId: fixedCorrelationId }),
        }),

      /**
       * Create a nested child logger
       * @param {string} childContext - Child context name
       * @returns {Object} Nested child logger
       */
      child: (childContext) =>
        this.child(`${context}:${childContext}`, { correlationId: fixedCorrelationId }),

      /**
       * Create a logger with a specific correlation ID
       * @param {string} correlationId - Correlation ID to use
       * @returns {Object} Logger with fixed correlation ID
       */
      withCorrelation: (correlationId) => this.child(context, { correlationId }),

      /**
       * Get the current context name
       * @returns {string} Context name
       */
      getContext: () => context,

      /**
       * Get the fixed correlation ID if any
       * @returns {string|null} Correlation ID
       */
      getCorrelationId: () => fixedCorrelationId,
    };

    return childLogger;
  }

  /**
   * Create a logger with a specific correlation ID
   * @param {string} correlationId - Correlation ID to use
   * @returns {Object} Logger with fixed correlation ID
   */
  withCorrelation(correlationId) {
    return this.child('root', { correlationId });
  }
}

// ==================== Exports ====================

// Get singleton instance
const logger = Logger.getInstance();

// Backwards compatibility - createLogger now creates child loggers
export const createLogger = (context, options = {}) => logger.child(context, options);

// Export configuration utilities
export const configureLogger = (config) => logger.configure(config);
export const getLoggerConfig = () => logger.getConfig();

// Export log levels for external use
export const LogLevels = Object.keys(LOG_LEVELS);

// Export the Logger class for advanced usage
export { Logger };

// Export correlation ID utilities (ClaudeHYDRA integration)
// generateCorrelationId - exported at top of file
// withCorrelationId - exported at top of file
// correlationMiddleware - exported at top of file

// Default export is the singleton instance
export default logger;
