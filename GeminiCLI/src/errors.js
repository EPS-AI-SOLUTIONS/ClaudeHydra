/**
 * HYDRA Error System - Lambert (Debugging Agent)
 * Comprehensive error handling for GeminiCLI
 */

/**
 * Base HYDRA Error class
 * @extends Error
 */
class HydraError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code (e.g., 'HYDRA_001')
   * @param {Object} context - Additional context about the error
   */
  constructor(message, code = 'HYDRA_UNKNOWN', context = {}) {
    super(message);
    this.name = 'HydraError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Capture stack trace, excluding constructor call
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON-serializable object
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * API Error - for external API communication failures
 * @extends HydraError
 */
class ApiError extends HydraError {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} context - Additional context
   */
  constructor(message, statusCode = 500, context = {}) {
    super(message, `API_${statusCode}`, { ...context, statusCode });
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }

  /**
   * Check if error is a rate limit error
   * @returns {boolean}
   */
  isRateLimit() {
    return this.statusCode === 429;
  }

  /**
   * Check if error is a server error
   * @returns {boolean}
   */
  isServerError() {
    return this.statusCode >= 500 && this.statusCode < 600;
  }

  /**
   * Check if error is a client error
   * @returns {boolean}
   */
  isClientError() {
    return this.statusCode >= 400 && this.statusCode < 500;
  }
}

/**
 * Validation Error - for input/data validation failures
 * @extends HydraError
 */
class ValidationError extends HydraError {
  /**
   * @param {string} message - Error message
   * @param {string} field - Field that failed validation
   * @param {*} value - The invalid value
   * @param {Object} context - Additional context
   */
  constructor(message, field = null, value = undefined, context = {}) {
    super(message, 'VALIDATION_ERROR', { ...context, field, value });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }

  /**
   * Create a required field error
   * @param {string} field - Field name
   * @returns {ValidationError}
   */
  static required(field) {
    return new ValidationError(`Field '${field}' is required`, field, undefined);
  }

  /**
   * Create a type error
   * @param {string} field - Field name
   * @param {string} expectedType - Expected type
   * @param {*} actualValue - Actual value
   * @returns {ValidationError}
   */
  static invalidType(field, expectedType, actualValue) {
    const actualType = typeof actualValue;
    return new ValidationError(
      `Field '${field}' expected ${expectedType}, got ${actualType}`,
      field,
      actualValue,
      { expectedType, actualType }
    );
  }

  /**
   * Create a range error
   * @param {string} field - Field name
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {*} actualValue - Actual value
   * @returns {ValidationError}
   */
  static outOfRange(field, min, max, actualValue) {
    return new ValidationError(
      `Field '${field}' must be between ${min} and ${max}`,
      field,
      actualValue,
      { min, max }
    );
  }
}

/**
 * Cache Error - for caching system failures
 * @extends HydraError
 */
class CacheError extends HydraError {
  /**
   * @param {string} message - Error message
   * @param {string} operation - Cache operation (get, set, delete, clear)
   * @param {string} key - Cache key involved
   * @param {Object} context - Additional context
   */
  constructor(message, operation = 'unknown', key = null, context = {}) {
    super(message, `CACHE_${operation.toUpperCase()}`, { ...context, operation, key });
    this.name = 'CacheError';
    this.operation = operation;
    this.key = key;
  }

  /**
   * Create a cache miss error
   * @param {string} key - Cache key
   * @returns {CacheError}
   */
  static miss(key) {
    return new CacheError(`Cache miss for key: ${key}`, 'get', key);
  }

  /**
   * Create a cache write error
   * @param {string} key - Cache key
   * @param {string} reason - Reason for failure
   * @returns {CacheError}
   */
  static writeError(key, reason = 'Unknown') {
    return new CacheError(`Failed to write to cache: ${reason}`, 'set', key, { reason });
  }

  /**
   * Create a cache corruption error
   * @param {string} key - Cache key
   * @returns {CacheError}
   */
  static corrupted(key) {
    return new CacheError(`Cache data corrupted for key: ${key}`, 'get', key);
  }
}

/**
 * Timeout Error - for operation timeout failures
 * @extends HydraError
 */
class TimeoutError extends HydraError {
  /**
   * @param {string} message - Error message
   * @param {number} timeoutMs - Timeout duration in milliseconds
   * @param {string} operation - Operation that timed out
   * @param {Object} context - Additional context
   */
  constructor(message, timeoutMs = 0, operation = 'unknown', context = {}) {
    super(message, 'TIMEOUT', { ...context, timeoutMs, operation });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.operation = operation;
  }

  /**
   * Create a timeout error with default message
   * @param {string} operation - Operation name
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {TimeoutError}
   */
  static create(operation, timeoutMs) {
    return new TimeoutError(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      timeoutMs,
      operation
    );
  }
}

/**
 * Wrap async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Options
 * @param {string} options.operation - Operation name for error context
 * @param {Function} options.onError - Custom error handler
 * @param {boolean} options.rethrow - Whether to rethrow after handling (default: true)
 * @returns {Function} Wrapped async function
 */
function wrapAsync(fn, options = {}) {
  const { operation = fn.name || 'anonymous', onError, rethrow = true } = options;

  return async function wrappedAsync(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      // Wrap non-HydraError errors
      const hydraError = error instanceof HydraError
        ? error
        : new HydraError(
            error.message || 'Unknown error',
            'WRAPPED_ERROR',
            { originalError: error.name, operation, args: args.map(a => typeof a) }
          );

      // Add operation context
      hydraError.context.wrappedOperation = operation;

      // Call custom error handler if provided
      if (typeof onError === 'function') {
        await onError(hydraError, ...args);
      }

      // Rethrow if configured
      if (rethrow) {
        throw hydraError;
      }

      return null;
    }
  };
}

/**
 * Format error for logging
 * @param {Error} error - Error to format
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeStack - Include stack trace (default: true)
 * @param {boolean} options.includeContext - Include context (default: true)
 * @param {boolean} options.pretty - Pretty print JSON (default: false)
 * @returns {string} Formatted error string
 */
function formatError(error, options = {}) {
  const { includeStack = true, includeContext = true, pretty = false } = options;

  const formatted = {
    level: 'ERROR',
    timestamp: error.timestamp || new Date().toISOString(),
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN'
  };

  // Add HydraError-specific fields
  if (error instanceof HydraError) {
    if (includeContext && error.context && Object.keys(error.context).length > 0) {
      formatted.context = error.context;
    }
  }

  // Add ApiError-specific fields
  if (error instanceof ApiError) {
    formatted.statusCode = error.statusCode;
  }

  // Add TimeoutError-specific fields
  if (error instanceof TimeoutError) {
    formatted.timeoutMs = error.timeoutMs;
    formatted.operation = error.operation;
  }

  // Add CacheError-specific fields
  if (error instanceof CacheError) {
    formatted.cacheOperation = error.operation;
    formatted.cacheKey = error.key;
  }

  // Add ValidationError-specific fields
  if (error instanceof ValidationError) {
    formatted.field = error.field;
  }

  // Add stack trace
  if (includeStack && error.stack) {
    // Clean up stack trace - take first 5 frames
    const stackLines = error.stack.split('\n').slice(1, 6);
    formatted.stack = stackLines.map(line => line.trim()).filter(Boolean);
  }

  // Format output
  if (pretty) {
    return JSON.stringify(formatted, null, 2);
  }

  return JSON.stringify(formatted);
}

/**
 * Check if error is retryable
 * @param {Error} error - Error to check
 * @param {Object} options - Options
 * @param {number} options.maxRetries - Maximum retries already attempted
 * @param {number} options.currentRetry - Current retry count
 * @returns {boolean} True if error is retryable
 */
function isRetryable(error, options = {}) {
  const { maxRetries = 3, currentRetry = 0 } = options;

  // Check retry limit
  if (currentRetry >= maxRetries) {
    return false;
  }

  // Timeout errors are generally retryable
  if (error instanceof TimeoutError) {
    return true;
  }

  // API errors: check status code
  if (error instanceof ApiError) {
    // Rate limits are retryable (with backoff)
    if (error.isRateLimit()) {
      return true;
    }
    // Server errors (5xx) are retryable
    if (error.isServerError()) {
      return true;
    }
    // Specific retryable status codes
    const retryableStatuses = [408, 502, 503, 504];
    if (retryableStatuses.includes(error.statusCode)) {
      return true;
    }
    // Client errors (4xx except above) are not retryable
    return false;
  }

  // Cache errors: only certain operations are retryable
  if (error instanceof CacheError) {
    // Write and delete operations might be retryable
    return ['set', 'delete'].includes(error.operation);
  }

  // Validation errors are never retryable (need user intervention)
  if (error instanceof ValidationError) {
    return false;
  }

  // Generic HydraError: check context for hints
  if (error instanceof HydraError) {
    // Check if explicitly marked as retryable
    if (error.context.retryable !== undefined) {
      return error.context.retryable;
    }
    // Network-related errors are often retryable
    const networkCodes = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];
    if (error.context.originalError && networkCodes.includes(error.context.originalError)) {
      return true;
    }
  }

  // Standard Error: check common patterns
  if (error.message) {
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection reset/i,
      /ECONNRESET/,
      /ETIMEDOUT/,
      /rate limit/i,
      /too many requests/i,
      /service unavailable/i,
      /temporarily unavailable/i
    ];

    for (const pattern of retryablePatterns) {
      if (pattern.test(error.message)) {
        return true;
      }
    }
  }

  // Default: not retryable
  return false;
}

/**
 * Calculate retry delay with exponential backoff
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {Object} options - Options
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {boolean} options.jitter - Add random jitter (default: true)
 * @returns {number} Delay in milliseconds
 */
function getRetryDelay(attempt, options = {}) {
  const { baseDelay = 1000, maxDelay = 30000, jitter = true } = options;

  // Exponential backoff: baseDelay * 2^attempt
  let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

  // Add jitter (0-25% of delay)
  if (jitter) {
    delay += Math.random() * delay * 0.25;
  }

  return Math.floor(delay);
}

export {
  // Error classes
  HydraError,
  ApiError,
  ValidationError,
  CacheError,
  TimeoutError,

  // Utility functions
  wrapAsync,
  formatError,
  isRetryable,
  getRetryDelay
};
