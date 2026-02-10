/**
 * @fileoverview Enhanced async audit logger with log rotation and buffered writes
 * Provides secure, performant audit logging with automatic file rotation,
 * buffered async writes, and structured JSON output.
 * @module security/audit-logger
 */

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Paths, resolvePath, Security, SizeLimits } from '../constants.js';
import { createLogger } from '../logger.js';
import { DANGEROUS_PATTERNS } from './patterns.js';

// Create a child logger for audit module
const auditChildLogger = createLogger('audit');

/**
 * @typedef {Object} AuditEntry
 * @property {string} timestamp - ISO timestamp
 * @property {string} type - Event type from Security.EVENT_TYPES
 * @property {string} severity - Severity level from Security.SEVERITY
 * @property {string} [user] - Username
 * @property {string} [requestId] - Request correlation ID
 * @property {Object} [data] - Event-specific data
 */

/**
 * @typedef {Object} AuditLoggerOptions
 * @property {string} [logDir] - Directory for log files
 * @property {string} [logFile='audit.log'] - Log file name
 * @property {number} [maxFileSize=SizeLimits.MAX_LOG_SIZE] - Max file size before rotation
 * @property {number} [maxFiles=10] - Maximum number of rotated files to keep
 * @property {number} [flushInterval=5000] - Buffer flush interval in ms
 * @property {number} [bufferSize=100] - Maximum entries to buffer before flush
 * @property {boolean} [syncMode=false] - Use synchronous writes (for critical logs)
 */

/**
 * Enhanced async audit logger with rotation and buffering
 * @extends EventEmitter
 */
class AuditLogger extends EventEmitter {
  /**
   * Creates a new AuditLogger instance
   * @param {AuditLoggerOptions} [options={}] - Logger configuration
   */
  constructor(options = {}) {
    super();

    const {
      logDir = resolvePath(Paths.AUDIT_DIR),
      logFile = 'audit.log',
      maxFileSize = SizeLimits.MAX_LOG_SIZE,
      maxFiles = 10,
      flushInterval = 5000,
      bufferSize = 100,
      syncMode = false,
    } = options;

    /** @type {string} */
    this.logDir = logDir;

    /** @type {string} */
    this.logFile = logFile;

    /** @type {string} */
    this.logPath = join(logDir, logFile);

    /** @type {number} */
    this.maxFileSize = maxFileSize;

    /** @type {number} */
    this.maxFiles = maxFiles;

    /** @type {number} */
    this.flushInterval = flushInterval;

    /** @type {number} */
    this.bufferSize = bufferSize;

    /** @type {boolean} */
    this.syncMode = syncMode;

    /** @type {AuditEntry[]} */
    this._buffer = [];

    /** @type {boolean} */
    this._flushing = false;

    /** @type {NodeJS.Timeout|null} */
    this._flushTimer = null;

    /** @type {boolean} */
    this._initialized = false;

    /** @type {Promise<void>|null} */
    this._initPromise = null;

    /** @type {number} */
    this._currentFileSize = 0;

    // Bind methods to preserve context
    this._flush = this._flush.bind(this);
    this._scheduleFlush = this._scheduleFlush.bind(this);
  }

  /**
   * Initializes the logger (creates directory, checks file size)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInitialize();
    await this._initPromise;
    this._initialized = true;
  }

  /**
   * @private
   */
  async _doInitialize() {
    try {
      // Ensure log directory exists
      await mkdir(this.logDir, { recursive: true });

      // Get current file size
      try {
        const stats = await stat(this.logPath);
        this._currentFileSize = stats.size;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        this._currentFileSize = 0;
      }

      // Start flush timer
      this._scheduleFlush();

      // Handle process exit
      process.on('beforeExit', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Ensures synchronous initialization for compatibility
   * @private
   */
  _ensureLogDirSync() {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Schedules the next buffer flush
   * @private
   */
  _scheduleFlush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
    }
    this._flushTimer = setTimeout(this._flush, this.flushInterval);
  }

  /**
   * Flushes the buffer to disk
   * @private
   * @returns {Promise<void>}
   */
  async _flush() {
    if (this._flushing || this._buffer.length === 0) {
      this._scheduleFlush();
      return;
    }

    this._flushing = true;
    const entries = this._buffer.splice(0);

    try {
      // Check if rotation needed
      const dataSize = entries.reduce((acc, e) => acc + JSON.stringify(e).length + 1, 0);
      if (this._currentFileSize + dataSize > this.maxFileSize) {
        await this._rotate();
      }

      // Write entries
      const data = `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`;
      await appendFile(this.logPath, data, { encoding: 'utf8' });
      this._currentFileSize += data.length;

      this.emit('flush', { count: entries.length });
    } catch (error) {
      // Put entries back on failure
      this._buffer.unshift(...entries);
      this.emit('error', error);
    } finally {
      this._flushing = false;
      this._scheduleFlush();
    }
  }

  /**
   * Rotates log files
   * @private
   * @returns {Promise<void>}
   */
  async _rotate() {
    try {
      // Get list of existing rotated files
      const files = await readdir(this.logDir);
      const rotatedFiles = files
        .filter((f) => f.startsWith(this.logFile) && f !== this.logFile)
        .sort()
        .reverse();

      // Delete excess files
      while (rotatedFiles.length >= this.maxFiles - 1) {
        const oldFile = rotatedFiles.pop();
        if (oldFile) {
          await unlink(join(this.logDir, oldFile));
        }
      }

      // Rename current file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedName = `${this.logFile}.${timestamp}`;
      await rename(this.logPath, join(this.logDir, rotatedName));

      this._currentFileSize = 0;
      this.emit('rotate', { rotatedTo: rotatedName });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Creates an audit entry
   * @private
   * @param {string} type - Event type
   * @param {string} severity - Severity level
   * @param {Object} data - Event data
   * @param {Object} [context={}] - Additional context
   * @returns {AuditEntry}
   */
  _createEntry(type, severity, data, context = {}) {
    return {
      timestamp: new Date().toISOString(),
      type,
      severity,
      user: context.user || process.env.USERNAME || process.env.USER || 'unknown',
      requestId: context.requestId || null,
      pid: process.pid,
      data,
    };
  }

  /**
   * Logs an audit entry
   * @param {AuditEntry} entry - Entry to log
   * @returns {void}
   */
  _log(entry) {
    if (this.syncMode) {
      this._logSync(entry);
      return;
    }

    this._buffer.push(entry);

    // Flush if buffer is full
    if (this._buffer.length >= this.bufferSize) {
      this._flush();
    }
  }

  /**
   * Synchronous log write
   * @private
   * @param {AuditEntry} entry - Entry to log
   */
  _logSync(entry) {
    this._ensureLogDirSync();
    const { appendFileSync } = require('node:fs');
    try {
      appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
    } catch (error) {
      auditChildLogger.error('Audit log write failed', { error: error.message });
    }
  }

  /**
   * Logs a shell command execution
   * @param {string} command - The command executed
   * @param {Object} [context={}] - Execution context
   * @param {string} [context.cwd] - Working directory
   * @param {number} [context.exitCode] - Command exit code
   * @param {number} [context.duration] - Execution duration in ms
   * @param {boolean} [context.dangerous] - Whether command was flagged as dangerous
   * @returns {void}
   */
  logCommand(command, context = {}) {
    const { cwd, exitCode, duration, dangerous, ...rest } = context;

    // Check for dangerous patterns - use imported DANGEROUS_PATTERNS
    const isDangerous = dangerous ?? DANGEROUS_PATTERNS.some((p) => p.test(command));
    const severity = isDangerous ? Security.SEVERITY.WARN : Security.SEVERITY.INFO;

    // Also log to central logger for consistency
    if (isDangerous) {
      auditChildLogger.warn('Dangerous command detected', { command, cwd });
    } else {
      auditChildLogger.debug('Command executed', { command, exitCode, duration });
    }

    const entry = this._createEntry(
      Security.EVENT_TYPES.SHELL_COMMAND,
      severity,
      {
        command,
        cwd,
        exitCode,
        duration,
        dangerous: isDangerous,
      },
      rest,
    );

    this._log(entry);

    if (isDangerous) {
      this.emit('dangerous-command', { command, entry });
    }
  }

  /**
   * Logs a security event
   * @param {string} event - Event description
   * @param {string} [severity=Security.SEVERITY.INFO] - Severity level
   * @param {Object} [context={}] - Additional context
   * @returns {void}
   */
  logSecurityEvent(event, severity = Security.SEVERITY.INFO, context = {}) {
    const entry = this._createEntry(
      Security.EVENT_TYPES.SECURITY_EVENT,
      severity,
      { event, details: context.details || {} },
      context,
    );

    this._log(entry);

    if (severity === Security.SEVERITY.CRITICAL || severity === Security.SEVERITY.ERROR) {
      this.emit('security-alert', { event, severity, entry });
    }
  }

  /**
   * Logs a file access event
   * @param {string} path - File path accessed
   * @param {string} operation - Operation type (read, write, delete)
   * @param {Object} [context={}] - Additional context
   * @returns {void}
   */
  logFileAccess(path, operation, context = {}) {
    const entry = this._createEntry(
      Security.EVENT_TYPES.FILE_ACCESS,
      Security.SEVERITY.INFO,
      { path, operation },
      context,
    );

    this._log(entry);
  }

  /**
   * Logs an API call
   * @param {string} endpoint - API endpoint called
   * @param {string} method - HTTP method
   * @param {Object} [context={}] - Additional context
   * @param {number} [context.statusCode] - Response status code
   * @param {number} [context.duration] - Call duration in ms
   * @returns {void}
   */
  logAPICall(endpoint, method, context = {}) {
    const { statusCode, duration, ...rest } = context;
    const severity = statusCode >= 400 ? Security.SEVERITY.WARN : Security.SEVERITY.INFO;

    const entry = this._createEntry(
      Security.EVENT_TYPES.API_CALL,
      severity,
      { endpoint, method, statusCode, duration },
      rest,
    );

    this._log(entry);
  }

  /**
   * Logs a tool execution event
   * @param {string} toolName - Name of the tool
   * @param {Object} [input] - Tool input (sanitized)
   * @param {Object} [context={}] - Additional context
   * @param {boolean} [context.success] - Whether execution succeeded
   * @param {number} [context.duration] - Execution duration in ms
   * @returns {void}
   */
  logToolExecution(toolName, input, context = {}) {
    const { success, duration, error, ...rest } = context;
    const severity = success === false ? Security.SEVERITY.ERROR : Security.SEVERITY.INFO;

    // Sanitize input - remove sensitive data
    const sanitizedInput = this._sanitizeInput(input);

    const entry = this._createEntry(
      Security.EVENT_TYPES.TOOL_EXECUTION,
      severity,
      {
        toolName,
        input: sanitizedInput,
        success,
        duration,
        error: error ? String(error) : undefined,
      },
      rest,
    );

    this._log(entry);
  }

  /**
   * Logs a configuration change
   * @param {string} key - Configuration key changed
   * @param {*} oldValue - Previous value
   * @param {*} newValue - New value
   * @param {Object} [context={}] - Additional context
   * @returns {void}
   */
  logConfigChange(key, oldValue, newValue, context = {}) {
    const entry = this._createEntry(
      Security.EVENT_TYPES.CONFIG_CHANGE,
      Security.SEVERITY.WARN,
      {
        key,
        oldValue: this._sanitizeValue(oldValue),
        newValue: this._sanitizeValue(newValue),
      },
      context,
    );

    this._log(entry);
  }

  /**
   * Logs an authentication event
   * @param {string} action - Auth action (login, logout, token_refresh, etc.)
   * @param {boolean} success - Whether action succeeded
   * @param {Object} [context={}] - Additional context
   * @returns {void}
   */
  logAuthEvent(action, success, context = {}) {
    const severity = success ? Security.SEVERITY.INFO : Security.SEVERITY.WARN;

    const entry = this._createEntry(
      Security.EVENT_TYPES.AUTH_EVENT,
      severity,
      { action, success },
      context,
    );

    this._log(entry);

    if (!success) {
      this.emit('auth-failure', { action, entry });
    }
  }

  /**
   * Sanitizes input data to remove sensitive information
   * @private
   * @param {*} input - Input to sanitize
   * @returns {*} Sanitized input
   */
  _sanitizeInput(input) {
    if (!input || typeof input !== 'object') {
      return input;
    }

    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'key',
      'auth',
      'credential',
    ];
    const sanitized = { ...input };

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this._sanitizeInput(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Sanitizes a value for logging
   * @private
   * @param {*} value - Value to sanitize
   * @returns {string} Sanitized value
   */
  _sanitizeValue(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string' && value.length > 100) {
      return `${value.slice(0, 100)}...[truncated]`;
    }
    if (typeof value === 'object') {
      try {
        const str = JSON.stringify(value);
        return str.length > 200 ? `${str.slice(0, 200)}...[truncated]` : str;
      } catch {
        return '[Object]';
      }
    }
    return String(value);
  }

  /**
   * Forces an immediate flush of the buffer
   * @returns {Promise<void>}
   */
  async flush() {
    if (this._buffer.length > 0) {
      await this._flush();
    }
  }

  /**
   * Shuts down the logger gracefully
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }

    await this.flush();
    this.emit('shutdown');
  }

  /**
   * Gets statistics about the logger
   * @returns {Object} Logger statistics
   */
  getStats() {
    return {
      bufferSize: this._buffer.length,
      currentFileSize: this._currentFileSize,
      maxFileSize: this.maxFileSize,
      logPath: this.logPath,
      initialized: this._initialized,
    };
  }
}

// Create default singleton instance
const defaultAuditLogger = new AuditLogger();

// Auto-initialize on first use
const initPromise = defaultAuditLogger.initialize().catch((err) => {
  auditChildLogger.error('Failed to initialize audit logger', { error: err.message });
});

export default defaultAuditLogger;

export { AuditLogger, initPromise as auditLoggerReady, auditChildLogger };
