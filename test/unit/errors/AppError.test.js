/**
 * AppError Tests
 * @module test/unit/errors/AppError.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppError,
  ValidationError,
  APIError,
  NetworkError,
  TimeoutError,
  ConfigError,
  FileSystemError,
  RateLimitError,
  AuthenticationError,
  AuthorizationError,
  FileNotFoundError,
  PermissionError,
  SecurityError,
  NotFoundError,
  ConnectionError,
  ConfigurationError,
  SwarmError,
  ToolError,
  ToolNotFoundError,
  ToolLoadError,
  ToolValidationError,
  ToolExecutionError,
  ToolTimeoutError,
  ToolRegistrationError,
  ToolHookError,
  ErrorCode,
  ErrorSeverity,
  isOperationalError,
  wrapAsync
} from '../../../src/errors/AppError.js';

describe('AppError', () => {
  describe('ErrorCode enum', () => {
    it('should have validation error codes', () => {
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ErrorCode.SCHEMA_VALIDATION_FAILED).toBe('SCHEMA_VALIDATION_FAILED');
    });

    it('should have authentication/authorization error codes', () => {
      expect(ErrorCode.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR');
      expect(ErrorCode.AUTHORIZATION_ERROR).toBe('AUTHORIZATION_ERROR');
      expect(ErrorCode.INVALID_API_KEY).toBe('INVALID_API_KEY');
    });

    it('should have network error codes', () => {
      expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ErrorCode.TIMEOUT_ERROR).toBe('TIMEOUT_ERROR');
      expect(ErrorCode.CONNECTION_REFUSED).toBe('CONNECTION_REFUSED');
    });

    it('should have tool error codes', () => {
      expect(ErrorCode.TOOL_ERROR).toBe('TOOL_ERROR');
      expect(ErrorCode.TOOL_NOT_FOUND).toBe('TOOL_NOT_FOUND');
      expect(ErrorCode.TOOL_EXECUTION_FAILED).toBe('TOOL_EXECUTION_FAILED');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ErrorCode)).toBe(true);
    });
  });

  describe('ErrorSeverity enum', () => {
    it('should have all severity levels', () => {
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ErrorSeverity)).toBe(true);
    });
  });

  describe('AppError class', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.isOperational).toBe(true);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.context).toEqual({});
      expect(error.name).toBe('AppError');
      expect(error.timestamp).toBeDefined();
    });

    it('should create error with custom options', () => {
      const error = new AppError('Custom error', {
        statusCode: 400,
        code: ErrorCode.VALIDATION_ERROR,
        isOperational: false,
        severity: ErrorSeverity.HIGH,
        context: { field: 'email' }
      });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.isOperational).toBe(false);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.context.field).toBe('email');
    });

    it('should capture cause', () => {
      const cause = new Error('Original error');
      const error = new AppError('Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should extract requestId from context', () => {
      const error = new AppError('Test', {
        context: { requestId: 'req-123' }
      });

      expect(error.requestId).toBe('req-123');
    });

    describe('toJSON()', () => {
      it('should serialize error without stack', () => {
        const error = new AppError('Test error', {
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 400
        });
        const json = error.toJSON();

        expect(json.name).toBe('AppError');
        expect(json.message).toBe('Test error');
        expect(json.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(json.statusCode).toBe(400);
        expect(json.stack).toBeUndefined();
      });

      it('should include stack when requested', () => {
        const error = new AppError('Test error');
        const json = error.toJSON(true);

        expect(json.stack).toBeDefined();
      });

      it('should include requestId if present', () => {
        const error = new AppError('Test', {
          context: { requestId: 'req-456' }
        });
        const json = error.toJSON();

        expect(json.requestId).toBe('req-456');
      });

      it('should serialize cause', () => {
        const cause = new AppError('Cause error');
        const error = new AppError('Main error', { cause });
        const json = error.toJSON();

        expect(json.cause).toBeDefined();
        expect(json.cause.message).toBe('Cause error');
      });

      it('should serialize non-AppError cause', () => {
        const cause = new Error('Native error');
        const error = new AppError('Wrapped', { cause });
        const json = error.toJSON();

        expect(json.cause.message).toBe('Native error');
        expect(json.cause.name).toBe('Error');
      });
    });

    describe('toClientResponse()', () => {
      it('should return sanitized response for operational errors', () => {
        const error = new AppError('User message', {
          isOperational: true,
          context: { requestId: 'req-789' }
        });
        const response = error.toClientResponse();

        expect(response.error.message).toBe('User message');
        expect(response.error.requestId).toBe('req-789');
      });

      it('should hide message for non-operational errors', () => {
        const error = new AppError('Internal details', {
          isOperational: false
        });
        const response = error.toClientResponse();

        expect(response.error.message).toBe('An internal error occurred');
      });
    });

    describe('static from()', () => {
      it('should create from AppError with overrides', () => {
        const original = new AppError('Original', {
          statusCode: 400,
          code: ErrorCode.VALIDATION_ERROR
        });
        const newError = AppError.from(original, { message: 'New message' });

        expect(newError.message).toBe('New message');
        expect(newError.statusCode).toBe(400);
      });

      it('should create from regular Error', () => {
        const nativeError = new Error('Native error');
        const appError = AppError.from(nativeError);

        expect(appError.message).toBe('Native error');
        expect(appError.cause).toBe(nativeError);
      });

      it('should handle unknown source', () => {
        const appError = AppError.from({});

        expect(appError.message).toBe('Unknown error');
      });
    });
  });

  describe('ValidationError', () => {
    it('should create with default values', () => {
      const error = new ValidationError('Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.errors).toEqual([]);
    });

    it('should accept validation errors array', () => {
      const errors = [{ field: 'email', message: 'Invalid email' }];
      const error = new ValidationError('Validation failed', { errors });

      expect(error.errors).toEqual(errors);
    });

    it('should accept specific field', () => {
      const error = new ValidationError('Invalid field', { field: 'username' });

      expect(error.field).toBe('username');
    });

    describe('fromZod()', () => {
      it('should create from Zod error', () => {
        const zodError = {
          errors: [
            { path: ['email'], message: 'Invalid email', code: 'invalid_string' },
            { path: ['age'], message: 'Must be positive', code: 'too_small' }
          ]
        };
        const error = ValidationError.fromZod(zodError);

        expect(error.code).toBe(ErrorCode.SCHEMA_VALIDATION_FAILED);
        expect(error.errors).toHaveLength(2);
        expect(error.errors[0].path).toBe('email');
      });
    });
  });

  describe('APIError', () => {
    it('should create with default values', () => {
      const error = new APIError('API failed');

      expect(error.statusCode).toBe(502);
      expect(error.code).toBe(ErrorCode.API_ERROR);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should accept service and endpoint', () => {
      const error = new APIError('API failed', {
        service: 'stripe',
        endpoint: '/v1/charges',
        responseStatus: 500
      });

      expect(error.service).toBe('stripe');
      expect(error.endpoint).toBe('/v1/charges');
      expect(error.responseStatus).toBe(500);
    });
  });

  describe('NetworkError', () => {
    it('should create with default values', () => {
      const error = new NetworkError('Connection failed');

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should accept host and port', () => {
      const error = new NetworkError('Connection refused', {
        host: 'api.example.com',
        port: 443,
        protocol: 'https'
      });

      expect(error.host).toBe('api.example.com');
      expect(error.port).toBe(443);
    });
  });

  describe('TimeoutError', () => {
    it('should create with default values', () => {
      const error = new TimeoutError('Operation timed out');

      expect(error.statusCode).toBe(504);
      expect(error.code).toBe(ErrorCode.TIMEOUT_ERROR);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should accept timeout and operation', () => {
      const error = new TimeoutError('Request timed out', {
        timeoutMs: 5000,
        operation: 'fetchData'
      });

      expect(error.timeoutMs).toBe(5000);
      expect(error.operation).toBe('fetchData');
    });
  });

  describe('ConfigError', () => {
    it('should create with default values', () => {
      const error = new ConfigError('Invalid config');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.isOperational).toBe(false);
    });

    it('should accept configKey', () => {
      const error = new ConfigError('Missing API key', {
        configKey: 'API_KEY',
        expectedType: 'string',
        actualValue: undefined
      });

      expect(error.configKey).toBe('API_KEY');
    });
  });

  describe('FileSystemError', () => {
    it('should create with default values', () => {
      const error = new FileSystemError('File error');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.FILE_READ_ERROR);
    });

    it('should accept path and operation', () => {
      const error = new FileSystemError('Cannot write', {
        path: '/tmp/test.txt',
        operation: 'write'
      });

      expect(error.path).toBe('/tmp/test.txt');
      expect(error.operation).toBe('write');
    });

    describe('fromNodeError()', () => {
      it('should map ENOENT to FILE_NOT_FOUND', () => {
        const nodeError = Object.assign(new Error('not found'), { code: 'ENOENT' });
        const error = FileSystemError.fromNodeError(nodeError, '/missing.txt');

        expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
        expect(error.path).toBe('/missing.txt');
      });

      it('should map EACCES to PERMISSION_DENIED', () => {
        const nodeError = Object.assign(new Error('access denied'), { code: 'EACCES' });
        const error = FileSystemError.fromNodeError(nodeError);

        expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
      });
    });
  });

  describe('RateLimitError', () => {
    it('should create with default values', () => {
      const error = new RateLimitError('Rate limited');

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.severity).toBe(ErrorSeverity.LOW);
    });

    it('should accept rate limit info', () => {
      const error = new RateLimitError('Too many requests', {
        retryAfter: 60,
        limit: 100,
        remaining: 0
      });

      expect(error.retryAfter).toBe(60);
      expect(error.limit).toBe(100);
    });
  });

  describe('AuthenticationError', () => {
    it('should create with correct defaults', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.AUTHENTICATION_ERROR);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('AuthorizationError', () => {
    it('should create with correct defaults', () => {
      const error = new AuthorizationError('Access denied');

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(ErrorCode.AUTHORIZATION_ERROR);
    });

    it('should accept resource and action', () => {
      const error = new AuthorizationError('Cannot delete', {
        resource: 'user',
        action: 'delete'
      });

      expect(error.context.resource).toBe('user');
      expect(error.context.action).toBe('delete');
    });
  });

  describe('FileNotFoundError', () => {
    it('should create with correct defaults', () => {
      const error = new FileNotFoundError('File not found');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(error.severity).toBe(ErrorSeverity.LOW);
    });

    it('should accept path', () => {
      const error = new FileNotFoundError('Not found', { path: '/data/file.txt' });

      expect(error.path).toBe('/data/file.txt');
    });
  });

  describe('PermissionError', () => {
    it('should create with correct defaults', () => {
      const error = new PermissionError('Permission denied');

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
    });

    it('should accept path and operation', () => {
      const error = new PermissionError('Cannot write', {
        path: '/protected/file',
        operation: 'write'
      });

      expect(error.path).toBe('/protected/file');
      expect(error.operation).toBe('write');
    });
  });

  describe('SecurityError', () => {
    it('should create with correct defaults', () => {
      const error = new SecurityError('Security violation');

      expect(error.statusCode).toBe(403);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.violationType).toBe('POLICY_VIOLATION');
    });

    it('should accept violation type', () => {
      const error = new SecurityError('XSS detected', {
        violationType: 'XSS_ATTEMPT',
        resource: '/api/comments'
      });

      expect(error.violationType).toBe('XSS_ATTEMPT');
      expect(error.resource).toBe('/api/comments');
    });
  });

  describe('NotFoundError', () => {
    it('should create with correct defaults', () => {
      const error = new NotFoundError('Resource not found');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should accept resource info', () => {
      const error = new NotFoundError('User not found', {
        resourceType: 'User',
        resourceId: '123'
      });

      expect(error.resourceType).toBe('User');
      expect(error.resourceId).toBe('123');
    });
  });

  describe('ConnectionError', () => {
    it('should create with correct defaults', () => {
      const error = new ConnectionError('Connection refused');

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(ErrorCode.CONNECTION_REFUSED);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should accept host and port', () => {
      const error = new ConnectionError('Cannot connect', {
        host: 'localhost',
        port: 5432
      });

      expect(error.host).toBe('localhost');
      expect(error.port).toBe(5432);
    });
  });

  describe('ConfigurationError', () => {
    it('should create with correct defaults', () => {
      const error = new ConfigurationError('Invalid config');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.isOperational).toBe(false);
    });

    it('should accept configKey', () => {
      const error = new ConfigurationError('Missing key', { configKey: 'DATABASE_URL' });

      expect(error.configKey).toBe('DATABASE_URL');
    });
  });

  describe('SwarmError', () => {
    it('should create with correct defaults', () => {
      const error = new SwarmError('Swarm failed');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.SWARM_ERROR);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should accept swarm info', () => {
      const error = new SwarmError('Agent failed', {
        agentName: 'Geralt',
        phase: 'execution',
        failedAgents: ['Geralt', 'Yennefer']
      });

      expect(error.agentName).toBe('Geralt');
      expect(error.phase).toBe('execution');
    });
  });

  describe('Tool Error Classes', () => {
    describe('ToolError', () => {
      it('should create with default values', () => {
        const error = new ToolError('Tool failed');

        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('TOOL_ERROR');
        expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      });

      it('should accept tool name and details', () => {
        const error = new ToolError('Failed', {
          toolName: 'read_file',
          details: { path: '/test.txt' }
        });

        expect(error.toolName).toBe('read_file');
        expect(error.details.path).toBe('/test.txt');
      });
    });

    describe('ToolNotFoundError', () => {
      it('should create with tool name', () => {
        const error = new ToolNotFoundError('unknown_tool', ['read_file', 'write_file']);

        expect(error.message).toContain('unknown_tool');
        expect(error.message).toContain('not found');
        expect(error.code).toBe('TOOL_NOT_FOUND');
        expect(error.details.availableTools).toContain('read_file');
      });

      it('should limit available tools list', () => {
        const manyTools = Array.from({ length: 20 }, (_, i) => `tool_${i}`);
        const error = new ToolNotFoundError('missing', manyTools);

        expect(error.details.availableTools).toHaveLength(10);
      });
    });

    describe('ToolLoadError', () => {
      it('should create with path and reason', () => {
        const error = new ToolLoadError('/tools/broken.js', 'Syntax error');

        expect(error.message).toContain('/tools/broken.js');
        expect(error.message).toContain('Syntax error');
        expect(error.code).toBe('TOOL_LOAD_ERROR');
        expect(error.toolPath).toBe('/tools/broken.js');
      });

      it('should capture original error', () => {
        const original = new Error('parse error');
        const error = new ToolLoadError('/tools/bad.js', 'Parse failed', original);

        expect(error.originalError).toBe(original);
        expect(error.cause).toBe(original);
      });
    });

    describe('ToolValidationError', () => {
      it('should create with validation errors array', () => {
        const errors = [{ message: 'path required' }, { message: 'invalid type' }];
        const error = new ToolValidationError('read_file', errors);

        expect(error.message).toContain('read_file');
        expect(error.message).toContain('path required');
        expect(error.code).toBe('TOOL_VALIDATION_ERROR');
        expect(error.validationErrors).toEqual(errors);
      });

      it('should handle string validation error', () => {
        const error = new ToolValidationError('write_file', 'Content is required');

        expect(error.message).toContain('Content is required');
      });
    });

    describe('ToolExecutionError', () => {
      it('should create with tool name and reason', () => {
        const error = new ToolExecutionError('shell', 'Command failed');

        expect(error.message).toContain('shell');
        expect(error.message).toContain('Command failed');
        expect(error.code).toBe('TOOL_EXECUTION_ERROR');
      });

      it('should capture original error', () => {
        const original = new Error('EPERM');
        const error = new ToolExecutionError('delete_file', 'Permission denied', original);

        expect(error.originalError).toBe(original);
      });
    });

    describe('ToolTimeoutError', () => {
      it('should create with tool name and timeout', () => {
        const error = new ToolTimeoutError('slow_tool', 30000);

        expect(error.message).toContain('slow_tool');
        expect(error.message).toContain('30000ms');
        expect(error.code).toBe('TOOL_TIMEOUT_ERROR');
        expect(error.timeoutMs).toBe(30000);
      });
    });

    describe('ToolRegistrationError', () => {
      it('should create with tool name and reason', () => {
        const error = new ToolRegistrationError('duplicate_tool', 'Tool already exists');

        expect(error.message).toContain('duplicate_tool');
        expect(error.message).toContain('already exists');
        expect(error.code).toBe('TOOL_REGISTRATION_ERROR');
      });
    });

    describe('ToolHookError', () => {
      it('should create with hook type and tool name', () => {
        const error = new ToolHookError('beforeExecute', 'my_tool', 'Hook threw');

        expect(error.message).toContain('beforeExecute');
        expect(error.message).toContain('my_tool');
        expect(error.code).toBe('TOOL_HOOK_ERROR');
        expect(error.hookType).toBe('beforeExecute');
      });

      it('should capture original error', () => {
        const original = new Error('async fail');
        const error = new ToolHookError('afterExecute', 'tool', 'Failed', original);

        expect(error.originalError).toBe(original);
      });
    });
  });

  describe('isOperationalError()', () => {
    it('should return true for operational AppError', () => {
      const error = new AppError('Test', { isOperational: true });

      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for non-operational AppError', () => {
      const error = new AppError('Test', { isOperational: false });

      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Native error');

      expect(isOperationalError(error)).toBe(false);
    });
  });

  describe('wrapAsync()', () => {
    it('should return result on success', async () => {
      const result = await wrapAsync(async () => 'success');

      expect(result).toBe('success');
    });

    it('should pass through AppError', async () => {
      const appError = new AppError('App error');

      await expect(wrapAsync(async () => { throw appError; }))
        .rejects.toBe(appError);
    });

    it('should wrap regular Error in AppError', async () => {
      const nativeError = new Error('Native');

      await expect(wrapAsync(async () => { throw nativeError; }))
        .rejects.toBeInstanceOf(AppError);
    });

    it('should apply error options', async () => {
      const error = new Error('test');

      try {
        await wrapAsync(
          async () => { throw error; },
          { statusCode: 400, code: ErrorCode.VALIDATION_ERROR }
        );
      } catch (e) {
        expect(e.statusCode).toBe(400);
        expect(e.code).toBe(ErrorCode.VALIDATION_ERROR);
      }
    });
  });
});
