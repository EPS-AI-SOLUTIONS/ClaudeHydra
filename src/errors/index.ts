/**
 * @fileoverview Central errors module export
 *
 * Provides unified access to ALL error classes across ClaudeHydra.
 *
 * Error architecture (consolidated):
 * - AppError (base for application-level errors) — src/errors/AppError.ts
 *   - ValidationError, APIError, NetworkError, TimeoutError, ConfigError, etc.
 *   - ToolError, ToolNotFoundError, ToolExecutionError, etc.
 * - HydraError (base for Hydra AI pipeline errors) — src/hydra/core/errors.ts
 *   - ProviderError → OllamaError, GeminiError
 *   - RoutingError, PipelineError, CircuitOpenError, etc.
 * - CommandSecurityError — src/security/safe-command.ts (isolated, intentional)
 *
 * ToolErrors.ts is DEPRECATED (was 100% duplicate of AppError.ts tool classes).
 * src/errors.ts (HydraError) is DEPRECATED — use src/hydra/core/errors.ts instead.
 *
 * @module errors
 */

// ============================================================================
// AppError Exports (Application-Level Errors)
// ============================================================================

export {
  APIError,
  // Base and specialized error classes
  AppError,
  AuthenticationError,
  AuthorizationError,
  // Claude SDK error class
  ClaudeSDKError,
  ConfigError,
  ConfigurationError,
  ConnectionError,
  // Error codes and severity
  ErrorCode,
  ErrorSeverity,
  FileNotFoundError,
  FileSystemError,
  // Utility functions
  isOperationalError,
  NetworkError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  SecurityError,
  SwarmError,
  TimeoutError,
  // Tool error classes (canonical source — NOT ToolErrors.ts)
  ToolError,
  ToolExecutionError,
  ToolHookError,
  ToolLoadError,
  ToolNotFoundError,
  ToolRegistrationError,
  ToolTimeoutError,
  ToolValidationError,
  ValidationError,
  wrapAsync,
} from './AppError.js';

// ============================================================================
// Hydra Core Error Re-exports
// NOTE: hydra/core/errors.ts has been removed as dead code.
// HydraError hierarchy was only used by dead pipeline modules.
// If needed in the future, recreate from AppError hierarchy.
// ============================================================================

// ============================================================================
// Error Formatter Exports
// ============================================================================

export {
  default as errorFormatter,
  ErrorFormatter,
  formatError,
  formatErrorInline,
  getErrorFormatter,
  printDiagnostic,
  printError,
  resetErrorFormatter,
} from './error-formatter.js';

// ============================================================================
// Default Export
// ============================================================================

import {
  APIError,
  AppError,
  ConfigError,
  ErrorCode,
  ErrorSeverity,
  FileSystemError,
  isOperationalError,
  NetworkError,
  TimeoutError,
  ValidationError,
  wrapAsync,
} from './AppError.js';

import {
  ErrorFormatter,
  formatError,
  getErrorFormatter,
  printDiagnostic,
  printError,
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
    FileSystemError,
  },

  // Formatting
  formatter: {
    ErrorFormatter,
    getErrorFormatter,
    formatError,
    printError,
    printDiagnostic,
  },

  // Utilities
  utils: {
    isOperationalError,
    wrapAsync,
  },
};
