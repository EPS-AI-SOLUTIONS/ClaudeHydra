/**
 * @fileoverview Central errors module export
 * Provides unified access to all error classes, codes, and formatting utilities.
 * @module errors
 */

// ============================================================================
// AppError Exports
// ============================================================================

export {
  // Error codes and severity
  ErrorCode,
  ErrorSeverity,
  
  // Base and specialized error classes
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
  
  // Tool error classes
  ToolError,
  ToolNotFoundError,
  ToolLoadError,
  ToolValidationError,
  ToolExecutionError,
  ToolTimeoutError,
  ToolRegistrationError,
  ToolHookError,
  
  // Utility functions
  isOperationalError,
  wrapAsync
} from './AppError.js';

// ============================================================================
// Error Formatter Exports
// ============================================================================

export {
  ErrorFormatter,
  getErrorFormatter,
  resetErrorFormatter,
  formatError,
  formatErrorInline,
  printError,
  printDiagnostic,
  default as errorFormatter
} from './error-formatter.js';

// ============================================================================
// Default Export
// ============================================================================

import {
  ErrorCode,
  ErrorSeverity,
  AppError,
  ValidationError,
  APIError,
  NetworkError,
  TimeoutError,
  ConfigError,
  FileSystemError,
  isOperationalError,
  wrapAsync
} from './AppError.js';

import {
  ErrorFormatter,
  getErrorFormatter,
  formatError,
  printError,
  printDiagnostic
} from './error-formatter.js';

/**
 * Errors module facade
 */
export default {
  // Codes and severity
  ErrorCode,
  ErrorSeverity,

  // Main error class
  AppError,

  // Specialized errors
  errors: {
    ValidationError,
    APIError,
    NetworkError,
    TimeoutError,
    ConfigError,
    FileSystemError
  },

  // Formatting
  formatter: {
    ErrorFormatter,
    getErrorFormatter,
    formatError,
    printError,
    printDiagnostic
  },

  // Utilities
  utils: {
    isOperationalError,
    wrapAsync
  }
};
