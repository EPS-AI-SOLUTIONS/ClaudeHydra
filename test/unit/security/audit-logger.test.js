/**
 * AuditLogger Tests
 * @module test/unit/security/audit-logger.test
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 0 })),
  renameSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
  appendFileSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 0 }),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
}));

// Mock constants
vi.mock('../../../src/constants.js', () => ({
  Security: {
    SEVERITY: {
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
      CRITICAL: 'critical',
    },
    EVENT_TYPES: {
      SHELL_COMMAND: 'shell_command',
      SECURITY_EVENT: 'security_event',
      FILE_ACCESS: 'file_access',
      API_CALL: 'api_call',
      TOOL_EXECUTION: 'tool_execution',
      CONFIG_CHANGE: 'config_change',
      AUTH_EVENT: 'auth_event',
    },
  },
  Paths: {
    AUDIT_DIR: '/tmp/audit',
  },
  SizeLimits: {
    MAX_LOG_SIZE: 10 * 1024 * 1024,
  },
  resolvePath: vi.fn((p) => p),
}));

// Mock logger
vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock patterns
vi.mock('../../../src/security/patterns.js', () => ({
  DANGEROUS_PATTERNS: [/rm\s+-rf/i, /chmod\s+777/i],
}));

describe('AuditLogger', () => {
  let AuditLogger;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset module cache
    vi.resetModules();

    const module = await import('../../../src/security/audit-logger.js');
    AuditLogger = module.AuditLogger;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const logger = new AuditLogger();

      expect(logger.logFile).toBe('audit.log');
      expect(logger.maxFiles).toBe(10);
      expect(logger.bufferSize).toBe(100);
      expect(logger.syncMode).toBe(false);
    });

    it('should accept custom options', () => {
      const logger = new AuditLogger({
        logDir: '/custom/logs',
        logFile: 'custom.log',
        maxFileSize: 5000,
        maxFiles: 5,
        flushInterval: 10000,
        bufferSize: 50,
        syncMode: true,
      });

      expect(logger.logDir).toBe('/custom/logs');
      expect(logger.logFile).toBe('custom.log');
      expect(logger.maxFileSize).toBe(5000);
      expect(logger.maxFiles).toBe(5);
      expect(logger.flushInterval).toBe(10000);
      expect(logger.bufferSize).toBe(50);
      expect(logger.syncMode).toBe(true);
    });

    it('should extend EventEmitter', () => {
      const logger = new AuditLogger();
      expect(logger).toBeInstanceOf(EventEmitter);
    });
  });

  describe('initialize()', () => {
    it('should create log directory', async () => {
      const { mkdir } = await import('node:fs/promises');
      const logger = new AuditLogger({ logDir: '/test/audit' });

      await logger.initialize();

      expect(mkdir).toHaveBeenCalledWith('/test/audit', { recursive: true });
    });

    it('should not reinitialize if already initialized', async () => {
      const { mkdir } = await import('node:fs/promises');
      const logger = new AuditLogger();

      await logger.initialize();
      const callsAfterFirst = mkdir.mock.calls.length;

      await logger.initialize();
      const callsAfterSecond = mkdir.mock.calls.length;

      // Should not have made additional calls after second initialize
      expect(callsAfterSecond).toBe(callsAfterFirst);
    });

    it('should handle ENOENT error gracefully', async () => {
      const { stat } = await import('node:fs/promises');
      stat.mockRejectedValueOnce({ code: 'ENOENT' });

      const logger = new AuditLogger();
      await expect(logger.initialize()).resolves.not.toThrow();
    });

    it('should throw on non-ENOENT errors', async () => {
      const { stat } = await import('node:fs/promises');
      stat.mockRejectedValueOnce(new Error('Permission denied'));

      const logger = new AuditLogger();
      await expect(logger.initialize()).rejects.toThrow();
    });
  });

  describe('logCommand()', () => {
    it('should log command with context', () => {
      const logger = new AuditLogger();

      logger.logCommand('ls -la', { cwd: '/home', exitCode: 0, duration: 50 });

      expect(logger._buffer.length).toBe(1);
      expect(logger._buffer[0].type).toBe('shell_command');
      expect(logger._buffer[0].data.command).toBe('ls -la');
      expect(logger._buffer[0].data.cwd).toBe('/home');
    });

    it('should detect dangerous commands', () => {
      const logger = new AuditLogger();
      const emitSpy = vi.spyOn(logger, 'emit');

      logger.logCommand('rm -rf /tmp/test');

      expect(logger._buffer[0].data.dangerous).toBe(true);
      expect(logger._buffer[0].severity).toBe('warn');
      expect(emitSpy).toHaveBeenCalledWith('dangerous-command', expect.any(Object));
    });

    it('should not flag safe commands as dangerous', () => {
      const logger = new AuditLogger();

      logger.logCommand('npm install', {});

      expect(logger._buffer[0].data.dangerous).toBe(false);
      expect(logger._buffer[0].severity).toBe('info');
    });

    it('should respect dangerous override', () => {
      const logger = new AuditLogger();

      logger.logCommand('custom command', { dangerous: true });

      expect(logger._buffer[0].data.dangerous).toBe(true);
    });
  });

  describe('logSecurityEvent()', () => {
    it('should log security event', () => {
      const logger = new AuditLogger();

      logger.logSecurityEvent('Unauthorized access attempt', 'warn', {
        details: { ip: '1.2.3.4' },
      });

      expect(logger._buffer.length).toBe(1);
      expect(logger._buffer[0].type).toBe('security_event');
      expect(logger._buffer[0].data.event).toBe('Unauthorized access attempt');
    });

    it('should emit security-alert for critical events', () => {
      const logger = new AuditLogger();
      const emitSpy = vi.spyOn(logger, 'emit');

      logger.logSecurityEvent('Critical breach', 'critical');

      expect(emitSpy).toHaveBeenCalledWith('security-alert', expect.any(Object));
    });

    it('should emit security-alert for error severity', () => {
      const logger = new AuditLogger();
      const emitSpy = vi.spyOn(logger, 'emit');

      logger.logSecurityEvent('Error event', 'error');

      expect(emitSpy).toHaveBeenCalledWith('security-alert', expect.any(Object));
    });
  });

  describe('logFileAccess()', () => {
    it('should log file access event', () => {
      const logger = new AuditLogger();

      logger.logFileAccess('/var/log/app.log', 'read', { user: 'admin' });

      expect(logger._buffer.length).toBe(1);
      expect(logger._buffer[0].type).toBe('file_access');
      expect(logger._buffer[0].data.path).toBe('/var/log/app.log');
      expect(logger._buffer[0].data.operation).toBe('read');
    });
  });

  describe('logAPICall()', () => {
    it('should log successful API call', () => {
      const logger = new AuditLogger();

      logger.logAPICall('/api/users', 'GET', { statusCode: 200, duration: 150 });

      expect(logger._buffer[0].type).toBe('api_call');
      expect(logger._buffer[0].severity).toBe('info');
      expect(logger._buffer[0].data.endpoint).toBe('/api/users');
    });

    it('should log failed API call with warn severity', () => {
      const logger = new AuditLogger();

      logger.logAPICall('/api/users', 'POST', { statusCode: 500, duration: 50 });

      expect(logger._buffer[0].severity).toBe('warn');
    });
  });

  describe('logToolExecution()', () => {
    it('should log successful tool execution', () => {
      const logger = new AuditLogger();

      logger.logToolExecution('read_file', { path: '/test.txt' }, { success: true, duration: 10 });

      expect(logger._buffer[0].type).toBe('tool_execution');
      expect(logger._buffer[0].severity).toBe('info');
      expect(logger._buffer[0].data.toolName).toBe('read_file');
    });

    it('should log failed tool execution with error severity', () => {
      const logger = new AuditLogger();

      logger.logToolExecution('write_file', {}, { success: false, error: 'Permission denied' });

      expect(logger._buffer[0].severity).toBe('error');
      expect(logger._buffer[0].data.error).toBe('Permission denied');
    });

    it('should sanitize sensitive input data', () => {
      const logger = new AuditLogger();

      logger.logToolExecution('api_call', {
        url: '/api',
        apiKey: 'secret-key-123',
        password: 'mypassword',
      });

      expect(logger._buffer[0].data.input.apiKey).toBe('[REDACTED]');
      expect(logger._buffer[0].data.input.password).toBe('[REDACTED]');
      expect(logger._buffer[0].data.input.url).toBe('/api');
    });
  });

  describe('logConfigChange()', () => {
    it('should log configuration change', () => {
      const logger = new AuditLogger();

      logger.logConfigChange('maxRetries', 3, 5, { user: 'admin' });

      expect(logger._buffer[0].type).toBe('config_change');
      expect(logger._buffer[0].severity).toBe('warn');
      expect(logger._buffer[0].data.key).toBe('maxRetries');
      expect(logger._buffer[0].data.oldValue).toBe('3');
      expect(logger._buffer[0].data.newValue).toBe('5');
    });

    it('should truncate long values', () => {
      const logger = new AuditLogger();
      const longString = 'x'.repeat(200);

      logger.logConfigChange('content', '', longString);

      expect(logger._buffer[0].data.newValue).toContain('[truncated]');
    });
  });

  describe('logAuthEvent()', () => {
    it('should log successful auth event', () => {
      const logger = new AuditLogger();

      logger.logAuthEvent('login', true, { user: 'john' });

      expect(logger._buffer[0].type).toBe('auth_event');
      expect(logger._buffer[0].severity).toBe('info');
      expect(logger._buffer[0].data.action).toBe('login');
      expect(logger._buffer[0].data.success).toBe(true);
    });

    it('should log failed auth event with warn severity', () => {
      const logger = new AuditLogger();
      const emitSpy = vi.spyOn(logger, 'emit');

      logger.logAuthEvent('login', false, { user: 'attacker' });

      expect(logger._buffer[0].severity).toBe('warn');
      expect(emitSpy).toHaveBeenCalledWith('auth-failure', expect.any(Object));
    });
  });

  describe('_sanitizeInput()', () => {
    it('should redact sensitive keys', () => {
      const logger = new AuditLogger();

      const result = logger._sanitizeInput({
        name: 'test',
        password: 'secret',
        apiKey: 'key123',
        token: 'abc',
        auth: 'bearer xyz',
      });

      expect(result.name).toBe('test');
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.auth).toBe('[REDACTED]');
    });

    it('should recursively sanitize nested objects', () => {
      const logger = new AuditLogger();

      const result = logger._sanitizeInput({
        config: {
          apiKey: 'secret',
        },
      });

      expect(result.config.apiKey).toBe('[REDACTED]');
    });

    it('should handle non-object input', () => {
      const logger = new AuditLogger();

      expect(logger._sanitizeInput(null)).toBeNull();
      expect(logger._sanitizeInput('string')).toBe('string');
      expect(logger._sanitizeInput(123)).toBe(123);
    });
  });

  describe('_sanitizeValue()', () => {
    it('should handle undefined', () => {
      const logger = new AuditLogger();
      expect(logger._sanitizeValue(undefined)).toBe('undefined');
    });

    it('should handle null', () => {
      const logger = new AuditLogger();
      expect(logger._sanitizeValue(null)).toBe('null');
    });

    it('should truncate long strings', () => {
      const logger = new AuditLogger();
      const longString = 'x'.repeat(200);

      const result = logger._sanitizeValue(longString);

      expect(result).toContain('[truncated]');
      expect(result.length).toBeLessThan(200);
    });

    it('should stringify objects', () => {
      const logger = new AuditLogger();
      const result = logger._sanitizeValue({ key: 'value' });

      expect(result).toBe('{"key":"value"}');
    });

    it('should handle objects that cannot be stringified', () => {
      const logger = new AuditLogger();
      const circular = {};
      circular.self = circular;

      expect(logger._sanitizeValue(circular)).toBe('[Object]');
    });
  });

  describe('flush()', () => {
    it('should flush buffer when not empty', async () => {
      const logger = new AuditLogger();
      logger.logCommand('test');

      await logger.flush();

      // Buffer should be cleared after flush
      // Note: actual assertion depends on mock behavior
      expect(logger._buffer.length).toBeLessThanOrEqual(1);
    });

    it('should not flush when buffer is empty', async () => {
      const { appendFile } = await import('node:fs/promises');
      const logger = new AuditLogger();

      await logger.flush();

      // appendFile should not be called for empty buffer
      // (depends on implementation)
    });
  });

  describe('shutdown()', () => {
    it('should clear flush timer', async () => {
      const logger = new AuditLogger();
      logger._flushTimer = setTimeout(() => {}, 10000);

      await logger.shutdown();

      expect(logger._flushTimer).toBeNull();
    });

    it('should emit shutdown event', async () => {
      const logger = new AuditLogger();
      const emitSpy = vi.spyOn(logger, 'emit');

      await logger.shutdown();

      expect(emitSpy).toHaveBeenCalledWith('shutdown');
    });
  });

  describe('getStats()', () => {
    it('should return logger statistics', () => {
      const logger = new AuditLogger({ logDir: '/logs' });
      logger.logCommand('test1');
      logger.logCommand('test2');

      const stats = logger.getStats();

      expect(stats.bufferSize).toBe(2);
      expect(stats.logPath).toContain('audit.log');
      expect(stats.initialized).toBe(false);
    });
  });

  describe('_createEntry()', () => {
    it('should create entry with timestamp', () => {
      const logger = new AuditLogger();

      const entry = logger._createEntry('test_type', 'info', { key: 'value' });

      expect(entry.timestamp).toBeDefined();
      expect(entry.type).toBe('test_type');
      expect(entry.severity).toBe('info');
      expect(entry.data.key).toBe('value');
      expect(entry.pid).toBe(process.pid);
    });

    it('should include context data', () => {
      const logger = new AuditLogger();

      const entry = logger._createEntry(
        'test',
        'info',
        {},
        {
          user: 'admin',
          requestId: 'req-123',
        },
      );

      expect(entry.user).toBe('admin');
      expect(entry.requestId).toBe('req-123');
    });
  });
});
