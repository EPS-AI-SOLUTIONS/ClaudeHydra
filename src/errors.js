/**
 * @fileoverview Comprehensive error system for GeminiCLI (ClaudeHYDRA-style)
 * Provides a structured approach to error handling with proper categorization,
 * serialization support, retry logic, and integration with logging systems.
 *
 * @module errors
 * @author GeminiCLI Team
 * @license MIT
 */

// ============================================================================
// Error Codes Enumeration
// ============================================================================

/**
 * Error codes for consistent error identification across the application
 * @readonly
 * @enum {string}
 */
export const ErrorCode = Object.freeze({
  // Base errors
  HYDRA_ERROR: 'HYDRA_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',

  // API errors (4xx/5xx)
  API_ERROR: 'API_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_TYPE: 'INVALID_TYPE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  INVALID_FORMAT: 'INVALID_FORMAT',
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',

  // Cache errors
  CACHE_ERROR: 'CACHE_ERROR',
  CACHE_MISS: 'CACHE_MISS',
  CACHE_WRITE_ERROR: 'CACHE_WRITE_ERROR',
  CACHE_CORRUPTED: 'CACHE_CORRUPTED',
  CACHE_EXPIRED: 'CACHE_EXPIRED',

  // Timeout errors
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  READ_TIMEOUT: 'READ_TIMEOUT',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  DNS_ERROR: 'DNS_ERROR',

  // Configuration errors
  CONFIG_ERROR: 'CONFIG_ERROR',
  MISSING_CONFIG: 'MISSING_CONFIG',
  INVALID_CONFIG: 'INVALID_CONFIG'
});

/**
 * Error severity levels for monitoring and alerting
 * @readonly
 * @enum {string}
 */
export const ErrorSeverity = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

// ============================================================================
// Base Error Class: HydraError
// ============================================================================

/**
 * Base error class for all Hydra-related errors
 * Provides structured error handling with code, context, timestamp, and serialization
 *
 * @extends Error
 */
export class HydraError extends Error {
  /**
   * Creates a new HydraError instance
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error configuration options
   * @param {string} [options.code=ErrorCode.HYDRA_ERROR] - Error code identifier
   * @param {Object} [options.context={}] - Additional context data
   * @param {string} [options.severity=ErrorSeverity.MEDIUM] - Error severity level
   * @param {boolean} [options.isOperational=true] - Whether error is operational (expected)
   * @param {Error} [options.cause=null] - Original error that caused this error
   */
  constructor(message, options = {}) {
    super(message);

    const {
      code = ErrorCode.HYDRA_ERROR,
      context = {},
      severity = ErrorSeverity.MEDIUM,
      isOperational = true,
      cause = null
    } = options;

    /** @type {string} */
    this.name = this.constructor.name;

    /** @type {string} */
    this.code = code;

    /** @type {Object} */
    this.context = context;

    /** @type {string} */
    this.timestamp = new Date().toISOString();

    /** @type {string} */
    this.severity = severity;

    /** @type {boolean} */
    this.isOperational = isOperational;

    /** @type {Error|null} */
    this.cause = cause;

    // Capture stack trace, excluding constructor
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error to a plain object for logging/API responses
   *
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {Object} Serialized error object
   */
  toJSON(includeStack = false) {
    const json = {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      severity: this.severity,
      isOperational: this.isOperational,
      context: this.context
    };

    if (includeStack && this.stack) {
      json.stack = this.stack;
    }

    if (this.cause) {
      json.cause = this.cause instanceof HydraError
        ? this.cause.toJSON(includeStack)
        : {
            name: this.cause.name,
            message: this.cause.message,
            ...(includeStack && this.cause.stack ? { stack: this.cause.stack } : {})
          };
    }

    return json;
  }

  /**
   * Creates a HydraError from another error or plain object
   *
   * @param {Error|Object} source - Source error or object
   * @param {Object} [overrides={}] - Properties to override
   * @returns {HydraError} New HydraError instance
   */
  static from(source, overrides = {}) {
    if (source instanceof HydraError) {
      return new HydraError(overrides.message || source.message, {
        code: overrides.code || source.code,
        context: { ...source.context, ...overrides.context },
        severity: overrides.severity || source.severity,
        isOperational: overrides.isOperational ?? source.isOperational,
        cause: source.cause
      });
    }

    return new HydraError(source?.message || 'Unknown error', {
      code: ErrorCode.UNKNOWN_ERROR,
      cause: source instanceof Error ? source : null,
      ...overrides
    });
  }

  /**
   * Creates a string representation of the error
   *
   * @returns {string} String representation
   */
  toString() {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

// ============================================================================
// ApiError Class
// ============================================================================

/**
 * Error class for API-related errors with HTTP status code support
 *
 * @extends HydraError
 */
export class ApiError extends HydraError {
  /**
   * Creates a new ApiError instance
   *
   * @param {string} message - Error message
   * @param {Object} [options={}] - Error configuration options
   * @param {number} [options.statusCode=500] - HTTP status code
   * @param {string} [options.endpoint] - API endpoint that failed
   * @param {string} [options.method] - HTTP method
   * @param {Object} [options.responseBody] - Response body from API
   * @param {Object} [options.requestHeaders] - Request headers (sanitized)
   * @param {number} [options.retryAfter] - Seconds until retry is allowed (for rate limits)
   */
  constructor(message, options = {}) {
    const {
      statusCode = 500,
      endpoint,
      method,
      responseBody,
      requestHeaders,
      retryAfter,
      ...rest
    } = options;

    // Determine severity based on status code
    let severity = ErrorSeverity.MEDIUM;
    if (statusCode >= 500) {
      severity = ErrorSeverity.HIGH;
    } else if (statusCode === 429) {
      severity = ErrorSeverity.LOW;
    }

    // Determine error code based on status code
    let code = ErrorCode.API_ERROR;
    if (statusCode === 429) {
      code = ErrorCode.RATE_LIMIT_EXCEEDED;
    } else if (statusCode === 401) {
      code = ErrorCode.UNAUTHORIZED;
    } else if (statusCode === 403) {
      code = ErrorCode.FORBIDDEN;
    } else if (statusCode === 404) {
      code = ErrorCode.NOT_FOUND;
    } else if (statusCode >= 500 && statusCode < 600) {
      code = ErrorCode.INTERNAL_SERVER_ERROR;
    }

    super(message, {
      code: rest.code || code,
      severity: rest.severity || severity,
      context: {
        endpoint,
        method,
        responseBody,
        requestHeaders,
        retryAfter,
        ...rest.context
      },
      ...rest
    });

    /** @type {number} */
    this.statusCode = statusCode;

    /** @type {string|undefined} */
    this.endpoint = endpoint;

    /** @type {string|undefined} */
    this.method = method;

    /** @type {Object|undefined} */
    this.responseBody = responseBody;

    /** @type {number|undefined} */
    this.retryAfter = retryAfter;
  }

  /**
   * Checks if this is a rate limit error (429)
   *
   * @returns {boolean} True if rate limit error
   */
  isRateLimit() {
    return this.statusCode === 429;
  }

  /**
   * Checks if this is a server error (5xx)
   *
   * @returns {boolean} True if server error
   */
  isServerError() {
    return this.statusCode >= 500 && this.statusCode < 600;
  }

  /**
   * Checks if this is a client error (4xx)
   *
   * @returns {boolean} True if client error
   */
  isClientError() {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Checks if this error is retryable
   *
   * @returns {boolean} True if retryable
   */
  isRetryable() {
    // Rate limits and server errors are typically retryable
    return this.isRateLimit() || this.isServerError() || this.statusCode === 408;
  }

  /**
   * Gets the recommended retry delay in milliseconds
   *
   * @returns {number|null} Retry delay in ms, or null if not applicable
   */
  getRetryDelay() {
    if (this.retryAfter) {
      return this.retryAfter * 1000;
    }
    return this.isRetryable() ? 1000 : null;
  }

  /**
   * Serializes the error including status code
   *
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {Object} Serialized error object
   */
  toJSON(includeStack = false) {
    const json = super.toJSON(includeStack);
    json.statusCode = this.statusCode;
    if (this.retryAfter) {
      json.retryAfter = this.retryAfter;
    }
    return json;
  }

  /**
   * Creates an ApiError from an HTTP response
   *
   * @param {Object} response - HTTP response object
   * @param {string} [endpoint] - API endpoint
   * @param {string} [method] - HTTP method
   * @returns {ApiError} New ApiError instance
   */
  static fromResponse(response, endpoint, method) {
    const statusCode = response.status || response.statusCode || 500;
    const message = response.statusText || response.message || `API error: ${statusCode}`;

    return new ApiError(message, {
      statusCode,
      endpoint,
      method,
      responseBody: response.data || response.body,
      retryAfter: response.headers?.['retry-after']
        ? parseInt(response.headers['retry-after'], 10)
        : undefined
    });
  }
}

// ============================================================================
// ValidationError Class
// ============================================================================

/**
 * Error class for validation failures
 *
 * @extends HydraError
 */
export class ValidationError extends HydraError {
  /**
   * Creates a new ValidationError instance
   *
   * @param {string} message - Error message
   * @param {Object} [options={}] - Error configuration options
   * @param {string} [options.field] - Field that failed validation
   * @param {*} [options.value] - Value that failed validation
   * @param {Array} [options.errors=[]] - Array of validation errors
   * @param {string} [options.expectedType] - Expected type
   * @param {Object} [options.constraints] - Validation constraints
   */
  constructor(message, options = {}) {
    const {
      field,
      value,
      errors = [],
      expectedType,
      constraints,
      ...rest
    } = options;

    super(message, {
      code: rest.code || ErrorCode.VALIDATION_ERROR,
      severity: ErrorSeverity.LOW,
      context: {
        field,
        value: typeof value === 'object' ? JSON.stringify(value) : value,
        errors,
        expectedType,
        constraints,
        ...rest.context
      },
      ...rest
    });

    /** @type {string|undefined} */
    this.field = field;

    /** @type {*} */
    this.value = value;

    /** @type {Array} */
    this.errors = errors;

    /** @type {string|undefined} */
    this.expectedType = expectedType;

    /** @type {Object|undefined} */
    this.constraints = constraints;
  }

  /**
   * Creates a ValidationError for a required field
   *
   * @param {string} field - Name of the required field
   * @param {Object} [context={}] - Additional context
   * @returns {ValidationError} New ValidationError instance
   */
  static required(field, context = {}) {
    return new ValidationError(`Field '${field}' is required`, {
      code: ErrorCode.REQUIRED_FIELD_MISSING,
      field,
      value: undefined,
      context
    });
  }

  /**
   * Creates a ValidationError for an invalid type
   *
   * @param {string} field - Name of the field
   * @param {string} expectedType - Expected type
   * @param {*} actualValue - Actual value received
   * @param {Object} [context={}] - Additional context
   * @returns {ValidationError} New ValidationError instance
   */
  static invalidType(field, expectedType, actualValue, context = {}) {
    const actualType = actualValue === null ? 'null' : typeof actualValue;
    return new ValidationError(
      `Field '${field}' expected type '${expectedType}', got '${actualType}'`,
      {
        code: ErrorCode.INVALID_TYPE,
        field,
        value: actualValue,
        expectedType,
        context: {
          actualType,
          ...context
        }
      }
    );
  }

  /**
   * Creates a ValidationError for an out-of-range value
   *
   * @param {string} field - Name of the field
   * @param {*} value - Value that is out of range
   * @param {Object} range - Range constraints
   * @param {number} [range.min] - Minimum value
   * @param {number} [range.max] - Maximum value
   * @param {Object} [context={}] - Additional context
   * @returns {ValidationError} New ValidationError instance
   */
  static outOfRange(field, value, range, context = {}) {
    let message = `Field '${field}' value ${value} is out of range`;
    if (range.min !== undefined && range.max !== undefined) {
      message += ` (must be between ${range.min} and ${range.max})`;
    } else if (range.min !== undefined) {
      message += ` (must be >= ${range.min})`;
    } else if (range.max !== undefined) {
      message += ` (must be <= ${range.max})`;
    }

    return new ValidationError(message, {
      code: ErrorCode.OUT_OF_RANGE,
      field,
      value,
      constraints: range,
      context
    });
  }

  /**
   * Creates a ValidationError for an invalid format
   *
   * @param {string} field - Name of the field
   * @param {*} value - Value with invalid format
   * @param {string} expectedFormat - Expected format description
   * @param {Object} [context={}] - Additional context
   * @returns {ValidationError} New ValidationError instance
   */
  static invalidFormat(field, value, expectedFormat, context = {}) {
    return new ValidationError(
      `Field '${field}' has invalid format (expected: ${expectedFormat})`,
      {
        code: ErrorCode.INVALID_FORMAT,
        field,
        value,
        context: {
          expectedFormat,
          ...context
        }
      }
    );
  }

  /**
   * Creates a ValidationError from Zod validation errors
   *
   * @param {Object} zodError - Zod error object
   * @returns {ValidationError} New ValidationError instance
   */
  static fromZod(zodError) {
    const errors = (zodError.errors || zodError.issues || []).map(err => ({
      path: Array.isArray(err.path) ? err.path.join('.') : err.path,
      message: err.message,
      code: err.code
    }));

    return new ValidationError('Validation failed', {
      code: ErrorCode.SCHEMA_VALIDATION_FAILED,
      errors,
      field: errors[0]?.path
    });
  }

  /**
   * Serializes the error including validation details
   *
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {Object} Serialized error object
   */
  toJSON(includeStack = false) {
    const json = super.toJSON(includeStack);
    if (this.field) json.field = this.field;
    if (this.errors.length > 0) json.errors = this.errors;
    return json;
  }
}

// ============================================================================
// CacheError Class
// ============================================================================

/**
 * Error class for cache-related failures
 *
 * @extends HydraError
 */
export class CacheError extends HydraError {
  /**
   * Creates a new CacheError instance
   *
   * @param {string} message - Error message
   * @param {Object} [options={}] - Error configuration options
   * @param {string} [options.operation] - Cache operation (get, set, delete, clear)
   * @param {string} [options.key] - Cache key involved
   * @param {string} [options.store] - Cache store name
   * @param {number} [options.ttl] - TTL in seconds
   */
  constructor(message, options = {}) {
    const {
      operation,
      key,
      store,
      ttl,
      ...rest
    } = options;

    super(message, {
      code: rest.code || ErrorCode.CACHE_ERROR,
      severity: ErrorSeverity.LOW,
      context: {
        operation,
        key,
        store,
        ttl,
        ...rest.context
      },
      ...rest
    });

    /** @type {string|undefined} */
    this.operation = operation;

    /** @type {string|undefined} */
    this.key = key;

    /** @type {string|undefined} */
    this.store = store;

    /** @type {number|undefined} */
    this.ttl = ttl;
  }

  /**
   * Creates a CacheError for a cache miss
   *
   * @param {string} key - Cache key that was not found
   * @param {string} [store] - Cache store name
   * @returns {CacheError} New CacheError instance
   */
  static miss(key, store) {
    return new CacheError(`Cache miss for key: ${key}`, {
      code: ErrorCode.CACHE_MISS,
      operation: 'get',
      key,
      store,
      isOperational: true
    });
  }

  /**
   * Creates a CacheError for a write failure
   *
   * @param {string} key - Cache key that failed to write
   * @param {string} reason - Reason for the failure
   * @param {Error} [cause] - Original error
   * @returns {CacheError} New CacheError instance
   */
  static writeError(key, reason, cause) {
    return new CacheError(`Failed to write cache key '${key}': ${reason}`, {
      code: ErrorCode.CACHE_WRITE_ERROR,
      operation: 'set',
      key,
      cause,
      severity: ErrorSeverity.MEDIUM
    });
  }

  /**
   * Creates a CacheError for corrupted cache data
   *
   * @param {string} key - Cache key with corrupted data
   * @param {string} [reason] - Description of corruption
   * @returns {CacheError} New CacheError instance
   */
  static corrupted(key, reason) {
    return new CacheError(
      `Cache data corrupted for key '${key}'${reason ? `: ${reason}` : ''}`,
      {
        code: ErrorCode.CACHE_CORRUPTED,
        operation: 'get',
        key,
        severity: ErrorSeverity.MEDIUM,
        context: { reason }
      }
    );
  }

  /**
   * Creates a CacheError for expired cache data
   *
   * @param {string} key - Cache key that expired
   * @param {number} [ttl] - Original TTL in seconds
   * @returns {CacheError} New CacheError instance
   */
  static expired(key, ttl) {
    return new CacheError(`Cache expired for key: ${key}`, {
      code: ErrorCode.CACHE_EXPIRED,
      operation: 'get',
      key,
      ttl,
      isOperational: true
    });
  }

  /**
   * Serializes the error including cache details
   *
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {Object} Serialized error object
   */
  toJSON(includeStack = false) {
    const json = super.toJSON(includeStack);
    if (this.operation) json.operation = this.operation;
    if (this.key) json.key = this.key;
    return json;
  }
}

// ============================================================================
// TimeoutError Class
// ============================================================================

/**
 * Error class for timeout-related failures
 *
 * @extends HydraError
 */
export class TimeoutError extends HydraError {
  /**
   * Creates a new TimeoutError instance
   *
   * @param {string} message - Error message
   * @param {Object} [options={}] - Error configuration options
   * @param {number} [options.timeoutMs] - Timeout duration in milliseconds
   * @param {string} [options.operation] - Name of the operation that timed out
   * @param {number} [options.elapsed] - Actual elapsed time in milliseconds
   */
  constructor(message, options = {}) {
    const {
      timeoutMs,
      operation,
      elapsed,
      ...rest
    } = options;

    super(message, {
      code: rest.code || ErrorCode.TIMEOUT_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: {
        timeoutMs,
        operation,
        elapsed,
        ...rest.context
      },
      ...rest
    });

    /** @type {number|undefined} */
    this.timeoutMs = timeoutMs;

    /** @type {string|undefined} */
    this.operation = operation;

    /** @type {number|undefined} */
    this.elapsed = elapsed;
  }

  /**
   * Creates a TimeoutError with standard formatting
   *
   * @param {string} operation - Name of the operation that timed out
   * @param {number} timeoutMs - Timeout duration in milliseconds
   * @param {Object} [context={}] - Additional context
   * @returns {TimeoutError} New TimeoutError instance
   */
  static create(operation, timeoutMs, context = {}) {
    return new TimeoutError(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      {
        code: ErrorCode.OPERATION_TIMEOUT,
        operation,
        timeoutMs,
        context
      }
    );
  }

  /**
   * Creates a connection timeout error
   *
   * @param {string} host - Host that timed out
   * @param {number} timeoutMs - Timeout duration in milliseconds
   * @param {number} [port] - Port number
   * @returns {TimeoutError} New TimeoutError instance
   */
  static connection(host, timeoutMs, port) {
    return new TimeoutError(
      `Connection to ${host}${port ? `:${port}` : ''} timed out after ${timeoutMs}ms`,
      {
        code: ErrorCode.CONNECTION_TIMEOUT,
        operation: 'connect',
        timeoutMs,
        context: { host, port }
      }
    );
  }

  /**
   * Creates a read timeout error
   *
   * @param {string} operation - Read operation name
   * @param {number} timeoutMs - Timeout duration in milliseconds
   * @returns {TimeoutError} New TimeoutError instance
   */
  static read(operation, timeoutMs) {
    return new TimeoutError(
      `Read operation '${operation}' timed out after ${timeoutMs}ms`,
      {
        code: ErrorCode.READ_TIMEOUT,
        operation,
        timeoutMs
      }
    );
  }

  /**
   * Serializes the error including timeout details
   *
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {Object} Serialized error object
   */
  toJSON(includeStack = false) {
    const json = super.toJSON(includeStack);
    if (this.timeoutMs) json.timeoutMs = this.timeoutMs;
    if (this.operation) json.operation = this.operation;
    return json;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wraps an async function with error handling
 *
 * @template T
 * @param {() => Promise<T>} fn - Async function to wrap
 * @param {Object} [options={}] - Wrapper options
 * @param {string} [options.operation] - Operation name for error context
 * @param {Function} [options.onError] - Callback for errors (receives error)
 * @param {boolean} [options.rethrow=true] - Whether to rethrow after handling
 * @param {Object} [options.context={}] - Additional context for errors
 * @returns {Promise<T>} Result of the function or throws
 */
export async function wrapAsync(fn, options = {}) {
  const {
    operation,
    onError,
    rethrow = true,
    context = {}
  } = options;

  try {
    return await fn();
  } catch (error) {
    // Convert to HydraError if not already
    const hydraError = error instanceof HydraError
      ? error
      : HydraError.from(error, {
          context: {
            operation,
            ...context
          }
        });

    // Add operation context if provided
    if (operation && !hydraError.context.operation) {
      hydraError.context.operation = operation;
    }

    // Call error handler if provided
    if (typeof onError === 'function') {
      try {
        await onError(hydraError);
      } catch (handlerError) {
        // Log handler error but don't let it interfere
        console.error('Error in onError handler:', handlerError);
      }
    }

    // Rethrow if configured
    if (rethrow) {
      throw hydraError;
    }

    return undefined;
  }
}

/**
 * Formats an error for logging
 *
 * @param {Error} error - Error to format
 * @param {Object} [options={}] - Formatting options
 * @param {boolean} [options.includeStack=true] - Include stack trace
 * @param {boolean} [options.includeContext=true] - Include context object
 * @param {boolean} [options.pretty=false] - Pretty print JSON
 * @param {boolean} [options.colors=false] - Use ANSI colors (for terminal)
 * @returns {string} Formatted error string
 */
export function formatError(error, options = {}) {
  const {
    includeStack = true,
    includeContext = true,
    pretty = false,
    colors = false
  } = options;

  // ANSI color codes
  const c = colors ? {
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
  } : {
    red: '', yellow: '', cyan: '', gray: '', reset: '', bold: ''
  };

  const lines = [];

  // Error header
  const name = error.name || 'Error';
  const code = error.code || 'UNKNOWN';
  lines.push(`${c.red}${c.bold}${name}${c.reset} ${c.gray}[${code}]${c.reset}`);

  // Message
  lines.push(`${c.yellow}Message:${c.reset} ${error.message}`);

  // Timestamp (for HydraError)
  if (error.timestamp) {
    lines.push(`${c.cyan}Timestamp:${c.reset} ${error.timestamp}`);
  }

  // Status code (for ApiError)
  if (error.statusCode !== undefined) {
    lines.push(`${c.cyan}Status Code:${c.reset} ${error.statusCode}`);
  }

  // Severity (for HydraError)
  if (error.severity) {
    lines.push(`${c.cyan}Severity:${c.reset} ${error.severity}`);
  }

  // Context
  if (includeContext && error.context && Object.keys(error.context).length > 0) {
    const contextStr = pretty
      ? JSON.stringify(error.context, null, 2)
      : JSON.stringify(error.context);
    lines.push(`${c.cyan}Context:${c.reset} ${contextStr}`);
  }

  // Cause
  if (error.cause) {
    const causeName = error.cause.name || 'Error';
    const causeMessage = error.cause.message || 'Unknown';
    lines.push(`${c.cyan}Caused by:${c.reset} ${causeName}: ${causeMessage}`);
  }

  // Stack trace
  if (includeStack && error.stack) {
    lines.push(`${c.gray}Stack trace:${c.reset}`);
    const stackLines = error.stack.split('\n').slice(1);
    stackLines.forEach(line => {
      lines.push(`${c.gray}${line}${c.reset}`);
    });
  }

  return lines.join('\n');
}

/**
 * Checks if an error is retryable
 *
 * @param {Error} error - Error to check
 * @param {Object} [options={}] - Check options
 * @param {number} [options.maxRetries=3] - Maximum number of retries allowed
 * @param {number} [options.currentRetry=0] - Current retry count
 * @param {string[]} [options.retryableCodes] - Additional retryable error codes
 * @returns {boolean} True if the error is retryable and retries remain
 */
export function isRetryable(error, options = {}) {
  const {
    maxRetries = 3,
    currentRetry = 0,
    retryableCodes = []
  } = options;

  // Check if we have retries left
  if (currentRetry >= maxRetries) {
    return false;
  }

  // ApiError has its own isRetryable method
  if (error instanceof ApiError) {
    return error.isRetryable();
  }

  // Check for known retryable error codes
  const defaultRetryableCodes = [
    ErrorCode.RATE_LIMIT_EXCEEDED,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.GATEWAY_TIMEOUT,
    ErrorCode.TIMEOUT_ERROR,
    ErrorCode.OPERATION_TIMEOUT,
    ErrorCode.CONNECTION_TIMEOUT,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.CONNECTION_REFUSED,
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND'
  ];

  const allRetryableCodes = [...defaultRetryableCodes, ...retryableCodes];
  const errorCode = error.code || error.errno;

  if (errorCode && allRetryableCodes.includes(errorCode)) {
    return true;
  }

  // Check for timeout-like errors by name
  if (error.name === 'TimeoutError' || error instanceof TimeoutError) {
    return true;
  }

  // Check for network errors by message
  const message = error.message?.toLowerCase() || '';
  if (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculates retry delay with exponential backoff and optional jitter
 *
 * @param {number} attempt - Current attempt number (0-based)
 * @param {Object} [options={}] - Delay options
 * @param {number} [options.baseDelay=1000] - Base delay in milliseconds
 * @param {number} [options.maxDelay=30000] - Maximum delay in milliseconds
 * @param {boolean} [options.jitter=true] - Add random jitter
 * @param {number} [options.jitterFactor=0.2] - Jitter factor (0-1)
 * @param {number} [options.multiplier=2] - Exponential multiplier
 * @param {Error} [options.error] - Error object (may contain retryAfter)
 * @returns {number} Delay in milliseconds
 */
export function getRetryDelay(attempt, options = {}) {
  const {
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true,
    jitterFactor = 0.2,
    multiplier = 2,
    error
  } = options;

  // Check if error has a specific retry-after value
  if (error) {
    if (error instanceof ApiError && error.retryAfter) {
      return Math.min(error.retryAfter * 1000, maxDelay);
    }
    if (error.retryAfter) {
      return Math.min(error.retryAfter * 1000, maxDelay);
    }
  }

  // Calculate exponential backoff
  let delay = baseDelay * Math.pow(multiplier, attempt);

  // Apply jitter
  if (jitter) {
    const jitterRange = delay * jitterFactor;
    const jitterValue = (Math.random() * 2 - 1) * jitterRange;
    delay = delay + jitterValue;
  }

  // Clamp to max delay
  return Math.min(Math.max(0, Math.floor(delay)), maxDelay);
}

/**
 * Creates a retry wrapper for async functions
 *
 * @template T
 * @param {() => Promise<T>} fn - Async function to retry
 * @param {Object} [options={}] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum retries
 * @param {number} [options.baseDelay=1000] - Base delay in ms
 * @param {number} [options.maxDelay=30000] - Max delay in ms
 * @param {boolean} [options.jitter=true] - Add jitter
 * @param {Function} [options.onRetry] - Callback before retry
 * @param {Function} [options.shouldRetry] - Custom retry predicate
 * @returns {Promise<T>} Result of successful execution
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true,
    onRetry,
    shouldRetry
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const canRetry = shouldRetry
        ? shouldRetry(error, attempt)
        : isRetryable(error, { maxRetries, currentRetry: attempt });

      if (!canRetry || attempt >= maxRetries) {
        throw error;
      }

      // Calculate delay
      const delay = getRetryDelay(attempt, {
        baseDelay,
        maxDelay,
        jitter,
        error
      });

      // Call onRetry callback
      if (typeof onRetry === 'function') {
        try {
          await onRetry(error, attempt, delay);
        } catch (callbackError) {
          console.error('Error in onRetry callback:', callbackError);
        }
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Checks if an error is operational (expected) vs programming error
 *
 * @param {Error} error - Error to check
 * @returns {boolean} True if operational error
 */
export function isOperationalError(error) {
  if (error instanceof HydraError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Aggregates multiple errors into a single error
 *
 * @param {Error[]} errors - Array of errors to aggregate
 * @param {string} [message] - Optional aggregate message
 * @returns {HydraError} Aggregated error
 */
export function aggregateErrors(errors, message) {
  if (!errors || errors.length === 0) {
    return new HydraError('No errors to aggregate');
  }

  if (errors.length === 1) {
    return errors[0] instanceof HydraError
      ? errors[0]
      : HydraError.from(errors[0]);
  }

  const aggregatedMessage = message || `${errors.length} errors occurred`;
  const errorSummaries = errors.map((e, i) => `[${i + 1}] ${e.message}`);

  return new HydraError(`${aggregatedMessage}: ${errorSummaries.join('; ')}`, {
    code: 'AGGREGATE_ERROR',
    severity: ErrorSeverity.HIGH,
    context: {
      errorCount: errors.length,
      errors: errors.map(e => ({
        name: e.name,
        message: e.message,
        code: e.code
      }))
    }
  });
}

// ============================================================================
// Default Export (for convenience)
// ============================================================================

export default {
  // Error codes and severities
  ErrorCode,
  ErrorSeverity,

  // Error classes
  HydraError,
  ApiError,
  ValidationError,
  CacheError,
  TimeoutError,

  // Helper functions
  wrapAsync,
  formatError,
  isRetryable,
  getRetryDelay,
  withRetry,
  isOperationalError,
  aggregateErrors
};
