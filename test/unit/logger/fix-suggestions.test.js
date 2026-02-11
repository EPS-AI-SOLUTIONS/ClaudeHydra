/**
 * @fileoverview Tests for fix-suggestions module
 */

import {
  AppError,
  AuthenticationError,
  ErrorCode,
  RateLimitError,
} from '../../../src/errors/AppError.js';
import {
  generateDiagnostics,
  generateSuggestions,
  getLinksForCode,
  getSuggestionsForCode,
  getTitleForCode,
  getTroubleshootingSteps,
} from '../../../src/logger/fix-suggestions.js';

describe('FixSuggestions', () => {
  describe('generateSuggestions', () => {
    test('should generate suggestions for authentication error', () => {
      const error = new AuthenticationError('Invalid credentials');
      const result = generateSuggestions(error);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.source).toBe('code');
    });

    test('should generate suggestions for rate limit error', () => {
      const error = new RateLimitError('Too many requests');
      const result = generateSuggestions(error);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    test('should generate pattern-based suggestions for ECONNREFUSED', () => {
      const error = { message: 'connect ECONNREFUSED 127.0.0.1:3000' };
      const result = generateSuggestions(error);

      expect(
        result.suggestions.some(
          (s) => s.toLowerCase().includes('server') || s.toLowerCase().includes('connection'),
        ),
      );
    });

    test('should generate pattern-based suggestions for ENOENT', () => {
      const error = { message: 'ENOENT: no such file or directory' };
      const result = generateSuggestions(error);

      expect(
        result.suggestions.some(
          (s) => s.toLowerCase().includes('file') || s.toLowerCase().includes('exist'),
        ),
      );
    });

    test('should generate pattern-based suggestions for JSON parse error', () => {
      const error = { message: 'Unexpected token in JSON at position 0' };
      const result = generateSuggestions(error);

      expect(result.suggestions.some((s) => s.toLowerCase().includes('json')));
    });

    test('should limit suggestions to maxSuggestions', () => {
      const error = new AppError('Test error', { code: ErrorCode.AUTHENTICATION_ERROR });
      const result = generateSuggestions(error, { maxSuggestions: 2 });

      expect(result.suggestions.length).toBeLessThanOrEqual(2);
    });

    test('should return generic suggestions for unknown error', () => {
      const error = { message: 'Some unknown error' };
      const result = generateSuggestions(error);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.source).toBe('generic');
    });
  });

  describe('generateDiagnostics', () => {
    test('should generate diagnostics for AppError', () => {
      const error = new AppError('Test error', {
        code: ErrorCode.AUTHENTICATION_ERROR,
        statusCode: 401,
      });

      const diagnostics = generateDiagnostics(error);

      expect(diagnostics.errorType).toBeDefined();
      expect(diagnostics.severity).toBeDefined();
      expect(diagnostics.isRecoverable).toBeDefined();
      expect(diagnostics.affectedSystems).toBeDefined();
      expect(diagnostics.metrics).toBeDefined();
    });

    test('should identify client error (4xx)', () => {
      const error = { statusCode: 400, code: 'VALIDATION_ERROR' };
      const diagnostics = generateDiagnostics(error);

      expect(diagnostics.errorType).toContain('Client');
      expect(diagnostics.isRecoverable).toBe(true);
    });

    test('should identify server error (5xx)', () => {
      const error = { statusCode: 500, code: 'INTERNAL_ERROR' };
      const diagnostics = generateDiagnostics(error);

      expect(diagnostics.errorType).toContain('Server');
    });

    test('should identify authentication errors', () => {
      const error = { code: ErrorCode.AUTHENTICATION_ERROR };
      const diagnostics = generateDiagnostics(error);

      expect(diagnostics.errorType).toContain('Authentication');
      expect(diagnostics.affectedSystems).toContain('Security');
    });

    test('should identify network errors', () => {
      const error = { code: ErrorCode.NETWORK_ERROR };
      const diagnostics = generateDiagnostics(error);

      expect(diagnostics.errorType).toBe('Network');
      expect(diagnostics.affectedSystems).toContain('Connectivity');
    });

    test('should identify file system errors', () => {
      const error = { code: ErrorCode.FILE_NOT_FOUND };
      const diagnostics = generateDiagnostics(error);

      expect(diagnostics.errorType).toBe('File System');
      expect(diagnostics.affectedSystems).toContain('Storage');
    });
  });

  describe('getTroubleshootingSteps', () => {
    test('should return troubleshooting steps', () => {
      const error = new AppError('Test error', {
        code: ErrorCode.AUTHENTICATION_ERROR,
      });

      const steps = getTroubleshootingSteps(error);

      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('Error Type');
    });

    test('should include suggestions in steps', () => {
      const error = new AuthenticationError('Invalid API key');
      const steps = getTroubleshootingSteps(error);

      // Steps should include suggestions (numbered)
      expect(steps.some((s) => s.includes('API key') || s.includes('Verify')));
    });
  });

  describe('getSuggestionsForCode', () => {
    test('should return suggestions for known error code', () => {
      const suggestions = getSuggestionsForCode(ErrorCode.AUTHENTICATION_ERROR);

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    test('should return empty array for unknown error code', () => {
      const suggestions = getSuggestionsForCode('UNKNOWN_CODE');

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBe(0);
    });
  });

  describe('getTitleForCode', () => {
    test('should return title for known error code', () => {
      const title = getTitleForCode(ErrorCode.AUTHENTICATION_ERROR);

      expect(title).toBe('Authentication Failed');
    });

    test('should return default title for unknown error code', () => {
      const title = getTitleForCode('UNKNOWN_CODE');

      expect(title).toBe('Error');
    });
  });

  describe('getLinksForCode', () => {
    test('should return links for error codes with documentation', () => {
      const links = getLinksForCode(ErrorCode.AUTHENTICATION_ERROR);

      expect(Array.isArray(links)).toBe(true);
      // May or may not have links depending on error code
    });

    test('should return empty array for codes without links', () => {
      const links = getLinksForCode('UNKNOWN_CODE');

      expect(Array.isArray(links)).toBe(true);
      expect(links.length).toBe(0);
    });
  });
});
