/**
 * @fileoverview Tests for error-formatter module
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ErrorFormatter,
  getErrorFormatter,
  resetErrorFormatter,
  formatError,
  formatErrorInline,
  printError,
  printDiagnostic
} from '../../../src/errors/error-formatter.js';
import { AppError, ValidationError, APIError, ErrorCode } from '../../../src/errors/AppError.js';

describe('ErrorFormatter', () => {
  let formatter;
  let consoleSpy;

  beforeEach(() => {
    resetErrorFormatter();
    formatter = new ErrorFormatter({
      useColors: false,
      showSuggestions: true,
      showStack: false,
      showDetails: true
    });
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('ErrorFormatter', () => {
    test('should format AppError', () => {
      const error = new AppError('Test error message', {
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 400
      });

      const formatted = formatter.format(error);

      expect(formatted).toContain('AppError');
      expect(formatted).toContain('Test error message');
      expect(formatted).toContain('VALIDATION_ERROR');
    });

    test('should format standard Error', () => {
      const error = new Error('Standard error');
      const formatted = formatter.format(error);

      expect(formatted).toContain('Error');
      expect(formatted).toContain('Standard error');
    });

    test('should include details when enabled', () => {
      const error = new AppError('Test', {
        code: ErrorCode.API_ERROR,
        statusCode: 502,
        context: { service: 'api', endpoint: '/test' }
      });

      const formatted = formatter.format(error, { showDetails: true });

      expect(formatted).toContain('Code');
      expect(formatted).toContain('API_ERROR');
      expect(formatted).toContain('Service');
      expect(formatted).toContain('api');
    });

    test('should include suggestions when enabled', () => {
      const error = new AppError('Auth failed', {
        code: ErrorCode.AUTHENTICATION_ERROR
      });

      const formatted = formatter.format(error, { showSuggestions: true });

      expect(formatted).toContain('Suggestions');
    });

    test('should include stack trace when enabled', () => {
      const error = new AppError('Test error');
      const formatted = formatter.format(error, { showStack: true });

      expect(formatted).toContain('Stack Trace');
    });

    test('should format error cause chain', () => {
      const cause = new Error('Original error');
      const error = new AppError('Wrapped error', { cause });

      const formatted = formatter.format(error);

      expect(formatted).toContain('Wrapped error');
      expect(formatted).toContain('Caused by');
      expect(formatted).toContain('Original error');
    });
  });

  describe('formatInline', () => {
    test('should format error as inline message', () => {
      const error = new AppError('Quick error', {
        code: ErrorCode.VALIDATION_ERROR
      });

      const inline = formatter.formatInline(error);

      expect(inline).toContain('ERROR');
      expect(inline).toContain('VALIDATION_ERROR');
      expect(inline).toContain('Quick error');
    });

    test('should format standard error inline', () => {
      const error = new Error('Standard error');
      const inline = formatter.formatInline(error);

      expect(inline).toContain('ERROR');
      expect(inline).toContain('Standard error');
    });
  });

  describe('convenience message methods', () => {
    test('warning() should format warning message', () => {
      const result = formatter.warning('Warning Title', 'Warning content');
      expect(result).toContain('WARNING');
      expect(result).toContain('Warning Title');
    });

    test('success() should format success message', () => {
      const result = formatter.success('Success Title', 'Success content');
      expect(result).toContain('SUCCESS');
      expect(result).toContain('Success Title');
    });

    test('info() should format info message', () => {
      const result = formatter.info('Info Title', 'Info content');
      expect(result).toContain('INFO');
      expect(result).toContain('Info Title');
    });
  });

  describe('print methods', () => {
    test('print() should output to console.error', () => {
      const error = new AppError('Test error');
      formatter.print(error);

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('Test error');
    });

    test('printDiagnostic() should output full diagnostics', () => {
      const error = new AppError('Test error', {
        code: ErrorCode.NETWORK_ERROR
      });

      formatter.printDiagnostic(error);

      expect(consoleSpy).toHaveBeenCalled();
      // Should contain diagnostics section
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Test error');
    });
  });

  describe('singleton functions', () => {
    test('getErrorFormatter should return formatter instance', () => {
      const f = getErrorFormatter();
      expect(f).toBeInstanceOf(ErrorFormatter);
    });

    test('resetErrorFormatter should create new instance', () => {
      const f1 = getErrorFormatter();
      resetErrorFormatter();
      const f2 = getErrorFormatter();
      expect(f1).not.toBe(f2);
    });

    test('formatError convenience function should work', () => {
      resetErrorFormatter();
      const error = new AppError('Test');
      const result = formatError(error);
      expect(result).toContain('AppError');
    });

    test('formatErrorInline convenience function should work', () => {
      resetErrorFormatter();
      const error = new AppError('Test', { code: 'TEST_CODE' });
      const result = formatErrorInline(error);
      expect(result).toContain('ERROR');
    });
  });

  describe('AppError prototype extensions', () => {
    test('AppError.prototype.format should be available', () => {
      const error = new AppError('Test');
      expect(typeof error.format).toBe('function');
    });

    test('AppError.prototype.formatInline should be available', () => {
      const error = new AppError('Test');
      expect(typeof error.formatInline).toBe('function');
    });

    test('AppError.prototype.print should be available', () => {
      const error = new AppError('Test');
      expect(typeof error.print).toBe('function');
    });

    test('AppError.prototype.getDiagnostics should be available', () => {
      const error = new AppError('Test');
      expect(typeof error.getDiagnostics).toBe('function');
      
      const diagnostics = error.getDiagnostics();
      expect(diagnostics).toHaveProperty('errorType');
      expect(diagnostics).toHaveProperty('severity');
    });

    test('AppError.prototype.getTroubleshootingSteps should be available', () => {
      const error = new AppError('Test');
      expect(typeof error.getTroubleshootingSteps).toBe('function');
      
      const steps = error.getTroubleshootingSteps();
      expect(Array.isArray(steps)).toBe(true);
    });

    test('AppError.prototype.formatStackTrace should be available', () => {
      const error = new AppError('Test');
      expect(typeof error.formatStackTrace).toBe('function');
      
      const stack = error.formatStackTrace();
      expect(typeof stack).toBe('string');
    });
  });

  describe('specialized error classes', () => {
    test('ValidationError should format correctly', () => {
      const error = new ValidationError('Invalid input', {
        errors: [{ path: 'name', message: 'Required' }]
      });

      const formatted = formatter.format(error);

      expect(formatted).toContain('ValidationError');
      expect(formatted).toContain('Invalid input');
    });

    test('APIError should format correctly', () => {
      const error = new APIError('External service failed', {
        service: 'payments',
        endpoint: '/charge'
      });

      const formatted = formatter.format(error);

      expect(formatted).toContain('APIError');
      expect(formatted).toContain('External service failed');
    });
  });
});
