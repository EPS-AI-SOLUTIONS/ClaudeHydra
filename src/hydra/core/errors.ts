/**
 * @fileoverview HYDRA Error Handling - Custom error types and error handling utilities
 *
 * @description
 * This module provides:
 * - Hierarchical error classes for HYDRA-specific errors
 * - Error normalization and recovery checking utilities
 * - Integration with main application error system (src/errors/AppError.js)
 *
 * Error Hierarchy:
 * - HydraError (base)
 *   - ProviderError
 *     - OllamaError
 *     - GeminiError
 *   - NetworkError
 *   - TimeoutError
 *   - ConfigurationError
 *   - RoutingError
 *   - PipelineError
 *   - RateLimitError
 *   - CircuitOpenError
 *   - ValidationError
 *   - PoolExhaustedError
 *   - AggregateError
 *
 * @module hydra/core/errors
 * @see module:errors/AppError - Main application error classes
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * @typedef {Object} HydraErrorOptions
 * @property {string} [code] - Error code for identification
 * @property {boolean} [recoverable=true] - Whether error is recoverable
 * @property {boolean} [retryable=false] - Whether operation can be retried
 * @property {Object} [context={}] - Additional context data
 * @property {Error} [cause] - Original error that caused this error
 */

/**
 * @typedef {Object} SerializedError
 * @property {string} name - Error class name
 * @property {string} message - Error message
 * @property {string} code - Error code
 * @property {boolean} recoverable - Whether recoverable
 * @property {boolean} retryable - Whether retryable
 * @property {Object} context - Context data
 * @property {string} timestamp - ISO timestamp
 * @property {string} [stack] - Stack trace if included
 */

// =============================================================================
// Base HYDRA Error Class
// =============================================================================

/**
 * Base HYDRA Error class
 * All HYDRA-specific errors inherit from this class
 *
 * @extends Error
 * @class
 *
 * @example
 * throw new HydraError('Something went wrong', {
 *   code: 'CUSTOM_ERROR',
 *   context: { operation: 'generate' }
 * });
 */
export class HydraError extends Error {
  /**
   * Creates a new HydraError
   *
   * @param {string} message - Human-readable error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super(message);

    /** @type {string} */
    this.name = 'HydraError';

    /** @type {string} */
    this.code = options.code || 'HYDRA_ERROR';

    /** @type {boolean} */
    this.recoverable = options.recoverable ?? true;

    /** @type {boolean} */
    this.retryable = options.retryable ?? false;

    /** @type {Object} */
    this.context = options.context || {};

    /** @type {Date} */
    this.timestamp = new Date();

    /** @type {Error|undefined} */
    this.cause = options.cause;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to JSON for logging/serialization
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {SerializedError} Serialized error object
   */
  toJSON(includeStack = false) {
    const json = {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp.toISOString()
    };

    if (includeStack && this.stack) {
      json.stack = this.stack;
    }

    return json;
  }

  /**
   * Create a HydraError from any error source
   *
   * @param {Error|string|Object} source - Source to convert
   * @param {HydraErrorOptions} [overrides={}] - Options to override
   * @returns {HydraError} New HydraError instance
   */
  static from(source, overrides = {}) {
    if (source instanceof HydraError) {
      return new HydraError(overrides.message || source.message, {
        code: overrides.code || source.code,
        recoverable: overrides.recoverable ?? source.recoverable,
        retryable: overrides.retryable ?? source.retryable,
        context: { ...source.context, ...overrides.context },
        cause: source.cause
      });
    }

    if (source instanceof Error) {
      return new HydraError(source.message, {
        cause: source,
        ...overrides
      });
    }

    if (typeof source === 'string') {
      return new HydraError(source, overrides);
    }

    if (source && typeof source === 'object' && source.message) {
      return new HydraError(source.message, {
        code: source.code,
        context: source,
        ...overrides
      });
    }

    return new HydraError('Unknown error', overrides);
  }
}

// =============================================================================
// Provider-specific Errors
// =============================================================================

/**
 * Provider-specific error
 * Base class for errors from AI providers
 *
 * @extends HydraError
 * @class
 */
export class ProviderError extends HydraError {
  /**
   * Creates a new ProviderError
   *
   * @param {string} provider - Provider name (e.g., 'ollama', 'gemini')
   * @param {string} message - Error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(provider, message, options = {}) {
    super(message, {
      code: options.code || `PROVIDER_${provider.toUpperCase()}_ERROR`,
      ...options
    });

    /** @type {string} */
    this.name = 'ProviderError';

    /** @type {string} */
    this.provider = provider;
  }
}

/**
 * Ollama-specific error
 * @extends ProviderError
 * @class
 */
export class OllamaError extends ProviderError {
  /**
   * Creates a new OllamaError
   *
   * @param {string} message - Error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super('ollama', message, {
      retryable: true,
      ...options
    });
    this.name = 'OllamaError';
  }
}

/**
 * Gemini-specific error
 * @extends ProviderError
 * @class
 */
export class GeminiError extends ProviderError {
  /**
   * Creates a new GeminiError
   *
   * @param {string} message - Error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super('gemini', message, {
      retryable: true,
      ...options
    });
    this.name = 'GeminiError';
  }
}

// =============================================================================
// Infrastructure Errors
// =============================================================================

/**
 * Network-related error
 * @extends HydraError
 * @class
 */
export class NetworkError extends HydraError {
  /**
   * Creates a new NetworkError
   *
   * @param {string} message - Error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super(message, {
      code: 'NETWORK_ERROR',
      retryable: true,
      ...options
    });
    this.name = 'NetworkError';
  }
}

/**
 * Timeout error for operations that exceed time limits
 * @extends HydraError
 * @class
 */
export class TimeoutError extends HydraError {
  /**
   * Creates a new TimeoutError
   *
   * @param {string} operation - Name of the operation that timed out
   * @param {number} timeout - Timeout duration in ms
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(operation, timeout, options = {}) {
    super(`Operation '${operation}' timed out after ${timeout}ms`, {
      code: 'TIMEOUT_ERROR',
      retryable: true,
      context: { operation, timeout },
      ...options
    });
    this.name = 'TimeoutError';

    /** @type {string} */
    this.operation = operation;

    /** @type {number} */
    this.timeout = timeout;
  }
}

/**
 * Configuration error for invalid or missing configuration
 * @extends HydraError
 * @class
 */
export class ConfigurationError extends HydraError {
  /**
   * Creates a new ConfigurationError
   *
   * @param {string} message - Error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super(message, {
      code: 'CONFIGURATION_ERROR',
      recoverable: false,
      retryable: false,
      ...options
    });
    this.name = 'ConfigurationError';
  }
}

// =============================================================================
// Pipeline Errors
// =============================================================================

/**
 * Routing error for task routing failures
 * @extends HydraError
 * @class
 */
export class RoutingError extends HydraError {
  /**
   * Creates a new RoutingError
   *
   * @param {string} message - Error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super(message, {
      code: 'ROUTING_ERROR',
      retryable: false,
      ...options
    });
    this.name = 'RoutingError';
  }
}

/**
 * Pipeline error for pipeline stage failures
 * @extends HydraError
 * @class
 */
export class PipelineError extends HydraError {
  /**
   * Creates a new PipelineError
   *
   * @param {string} stage - Name of the failing stage
   * @param {string} message - Error message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(stage, message, options = {}) {
    super(`Pipeline failed at stage '${stage}': ${message}`, {
      code: 'PIPELINE_ERROR',
      context: { stage },
      ...options
    });
    this.name = 'PipelineError';

    /** @type {string} */
    this.stage = stage;
  }
}

// =============================================================================
// Rate Limiting and Circuit Breaker Errors
// =============================================================================

/**
 * Rate limit exceeded error
 * @extends HydraError
 * @class
 */
export class RateLimitError extends HydraError {
  /**
   * Creates a new RateLimitError
   *
   * @param {string} provider - Provider that is rate limited
   * @param {number} retryAfter - Time until retry is allowed (ms)
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(provider, retryAfter, options = {}) {
    super(`Rate limit exceeded for ${provider}. Retry after ${retryAfter}ms`, {
      code: 'RATE_LIMIT_ERROR',
      retryable: true,
      context: { provider, retryAfter },
      ...options
    });
    this.name = 'RateLimitError';

    /** @type {string} */
    this.provider = provider;

    /** @type {number} */
    this.retryAfter = retryAfter;
  }
}

/**
 * Circuit breaker open error
 * @extends HydraError
 * @class
 */
export class CircuitOpenError extends HydraError {
  /**
   * Creates a new CircuitOpenError
   *
   * @param {string} provider - Provider with open circuit
   * @param {number} nextAttempt - Timestamp when circuit may close
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(provider, nextAttempt, options = {}) {
    super(`Circuit breaker open for ${provider}. Next attempt at ${new Date(nextAttempt).toISOString()}`, {
      code: 'CIRCUIT_OPEN_ERROR',
      retryable: false,
      context: { provider, nextAttempt },
      ...options
    });
    this.name = 'CircuitOpenError';

    /** @type {string} */
    this.provider = provider;

    /** @type {number} */
    this.nextAttempt = nextAttempt;
  }
}

// =============================================================================
// Validation and Pool Errors
// =============================================================================

/**
 * Validation error for input validation failures
 * @extends HydraError
 * @class
 */
export class ValidationError extends HydraError {
  /**
   * Creates a new ValidationError
   *
   * @param {string} message - Error message
   * @param {Array<Object>} [validationErrors=[]] - List of validation errors
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(message, validationErrors = [], options = {}) {
    super(message, {
      code: 'VALIDATION_ERROR',
      recoverable: false,
      retryable: false,
      context: { validationErrors },
      ...options
    });
    this.name = 'ValidationError';

    /** @type {Array<Object>} */
    this.validationErrors = validationErrors;
  }
}

/**
 * Pool exhausted error when connection pool is full
 * @extends HydraError
 * @class
 */
export class PoolExhaustedError extends HydraError {
  /**
   * Creates a new PoolExhaustedError
   *
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(options = {}) {
    super('Connection pool exhausted', {
      code: 'POOL_EXHAUSTED_ERROR',
      retryable: true,
      ...options
    });
    this.name = 'PoolExhaustedError';
  }
}

// =============================================================================
// Aggregate Error
// =============================================================================

/**
 * Error aggregator for multi-step operations
 * Collects multiple errors that occurred during an operation
 *
 * @extends HydraError
 * @class
 *
 * @example
 * const errors = [new OllamaError('Failed'), new GeminiError('Also failed')];
 * throw new AggregateError(errors, 'All providers failed');
 */
export class AggregateError extends HydraError {
  /**
   * Creates a new AggregateError
   *
   * @param {Array<Error>} errors - Array of errors
   * @param {string} [message='Multiple errors occurred'] - Summary message
   * @param {HydraErrorOptions} [options={}] - Error options
   */
  constructor(errors, message = 'Multiple errors occurred', options = {}) {
    super(message, {
      code: 'AGGREGATE_ERROR',
      recoverable: errors.some(e => e.recoverable !== false),
      retryable: errors.some(e => e.retryable),
      ...options
    });
    this.name = 'AggregateError';

    /** @type {Array<Error>} */
    this.errors = errors;
  }

  /**
   * Get all error messages
   * @returns {string[]} Array of error messages
   */
  getMessages() {
    return this.errors.map(e => e.message);
  }

  /**
   * Check if any error is of a specific type
   *
   * @param {string} errorName - Error class name to check
   * @returns {boolean} Whether any error matches
   */
  hasErrorType(errorName) {
    return this.errors.some(e => e.name === errorName);
  }

  /**
   * Get errors of a specific type
   *
   * @param {string} errorName - Error class name to filter
   * @returns {Array<Error>} Matching errors
   */
  getErrorsOfType(errorName) {
    return this.errors.filter(e => e.name === errorName);
  }
}

// =============================================================================
// Error Handler Class
// =============================================================================

/**
 * Error handler with fallback support
 * Allows registering handlers for specific error types
 *
 * @class
 *
 * @example
 * const handler = new ErrorHandler();
 * handler.register('TimeoutError', async (error, ctx) => {
 *   console.log('Retrying after timeout...');
 *   return await retry(ctx.operation);
 * });
 * handler.setDefault((error) => {
 *   console.error('Unhandled error:', error.message);
 * });
 */
export class ErrorHandler {
  /**
   * Creates a new ErrorHandler
   */
  constructor() {
    /** @type {Map<string, Function>} */
    this._handlers = new Map();

    /** @type {Function|null} */
    this._defaultHandler = null;
  }

  /**
   * Register error handler for specific error type
   *
   * @param {string} errorName - Error class name to handle
   * @param {Function} handler - Handler function (error, context) => Promise<any>
   */
  register(errorName, handler) {
    this._handlers.set(errorName, handler);
  }

  /**
   * Set default error handler
   *
   * @param {Function} handler - Default handler function
   */
  setDefault(handler) {
    this._defaultHandler = handler;
  }

  /**
   * Handle an error
   *
   * @param {Error} error - Error to handle
   * @param {Object} [context={}] - Additional context
   * @returns {Promise<any>} Handler result
   * @throws {Error} If no handler found and error not handled
   */
  async handle(error, context = {}) {
    // Find specific handler
    const handler = this._handlers.get(error.name);

    if (handler) {
      return handler(error, context);
    }

    // Try parent error types
    if (error instanceof ProviderError) {
      const providerHandler = this._handlers.get('ProviderError');
      if (providerHandler) {
        return providerHandler(error, context);
      }
    }

    if (error instanceof HydraError) {
      const hydraHandler = this._handlers.get('HydraError');
      if (hydraHandler) {
        return hydraHandler(error, context);
      }
    }

    // Use default handler
    if (this._defaultHandler) {
      return this._defaultHandler(error, context);
    }

    // Re-throw if no handler found
    throw error;
  }

  /**
   * Wrap a function with error handling
   *
   * @param {Function} fn - Function to wrap
   * @param {Object} [context={}] - Context to pass to handler
   * @returns {Function} Wrapped function
   */
  wrap(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        return this.handle(error, { ...context, args });
      }
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a standardized error from various sources
 *
 * @param {Error|string|Object} source - Source to normalize
 * @param {string} [defaultCode='UNKNOWN_ERROR'] - Default error code
 * @returns {HydraError} Normalized HydraError
 *
 * @example
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw normalizeError(error, 'OPERATION_FAILED');
 * }
 */
export function normalizeError(source, defaultCode = 'UNKNOWN_ERROR') {
  // Already a HydraError
  if (source instanceof HydraError) {
    return source;
  }

  // Standard Error
  if (source instanceof Error) {
    // Check for specific error types
    if (source.name === 'AbortError' || source.message.includes('timeout')) {
      return new TimeoutError('unknown', 0, { cause: source });
    }

    if (source.code === 'ECONNREFUSED' || source.code === 'ENOTFOUND') {
      return new NetworkError(source.message, { cause: source });
    }

    return new HydraError(source.message, {
      code: source.code || defaultCode,
      cause: source
    });
  }

  // String
  if (typeof source === 'string') {
    return new HydraError(source, { code: defaultCode });
  }

  // Object with message
  if (source && typeof source === 'object' && source.message) {
    return new HydraError(source.message, {
      code: source.code || defaultCode,
      context: source
    });
  }

  // Unknown
  return new HydraError('An unknown error occurred', {
    code: defaultCode,
    context: { source }
  });
}

/**
 * Check if an error is retryable
 *
 * @param {Error} error - Error to check
 * @returns {boolean} Whether the operation can be retried
 *
 * @example
 * if (isRetryable(error)) {
 *   await sleep(1000);
 *   return retry(operation);
 * }
 */
export function isRetryable(error) {
  if (error instanceof HydraError) {
    return error.retryable;
  }

  // Check common retryable patterns
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'];
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }

  const retryablePatterns = ['timeout', 'rate limit', 'too many requests', '503', '502', '429'];
  const message = (error.message || '').toLowerCase();
  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Check if an error is recoverable
 *
 * @param {Error} error - Error to check
 * @returns {boolean} Whether the error is recoverable
 *
 * @example
 * if (!isRecoverable(error)) {
 *   process.exit(1);
 * }
 */
export function isRecoverable(error) {
  if (error instanceof HydraError) {
    return error.recoverable;
  }

  // Most errors are considered recoverable unless proven otherwise
  const unrecoverableCodes = ['CONFIGURATION_ERROR', 'VALIDATION_ERROR'];
  return !unrecoverableCodes.includes(error.code);
}

/**
 * Extract error code from various sources
 *
 * @param {Error} error - Error to extract code from
 * @returns {string} Error code
 */
export function getErrorCode(error) {
  if (error instanceof HydraError) {
    return error.code;
  }
  if (error.code) {
    return error.code;
  }
  if (error.status) {
    return `HTTP_${error.status}`;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Create an error with retry information
 *
 * @param {Error} error - Original error
 * @param {number} attempt - Current attempt number
 * @param {number} maxAttempts - Maximum attempts allowed
 * @returns {HydraError} Error with retry context
 */
export function withRetryContext(error, attempt, maxAttempts) {
  const normalized = normalizeError(error);
  normalized.context = {
    ...normalized.context,
    retryAttempt: attempt,
    maxAttempts,
    canRetry: attempt < maxAttempts && normalized.retryable
  };
  return normalized;
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  // Error classes
  HydraError,
  ProviderError,
  OllamaError,
  GeminiError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
  RoutingError,
  PipelineError,
  RateLimitError,
  CircuitOpenError,
  ValidationError,
  PoolExhaustedError,
  AggregateError,

  // Handler
  ErrorHandler,

  // Utilities
  normalizeError,
  isRetryable,
  isRecoverable,
  getErrorCode,
  withRetryContext
};
