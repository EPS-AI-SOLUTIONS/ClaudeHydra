/**
 * @fileoverview Enhanced error class hierarchy for ClaudeHydra
 * Provides a structured approach to error handling with proper categorization,
 * serialization support, and integration with logging/monitoring systems.
 * @module errors/AppError
 */

/**
 * Error codes enumeration for consistent error identification
 * @readonly
 * @enum {string}
 */
export const ErrorCode = Object.freeze({
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Authentication/Authorization errors (401/403)
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  INVALID_API_KEY: 'INVALID_API_KEY',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Server/API errors (500/502/503)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  API_ERROR: 'API_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',

  // Configuration errors
  CONFIG_ERROR: 'CONFIG_ERROR',
  MISSING_CONFIG: 'MISSING_CONFIG',
  INVALID_CONFIG: 'INVALID_CONFIG',

  // File system errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // Tool/Operation errors
  TOOL_ERROR: 'TOOL_ERROR',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',

  // Swarm/Agent errors
  SWARM_ERROR: 'SWARM_ERROR',
  AGENT_ERROR: 'AGENT_ERROR',
  COORDINATION_ERROR: 'COORDINATION_ERROR',

  // Claude SDK errors
  CLAUDE_SDK_ERROR: 'CLAUDE_SDK_ERROR',
  CLAUDE_SDK_AUTH: 'CLAUDE_SDK_AUTH',
  CLAUDE_SDK_NOT_INSTALLED: 'CLAUDE_SDK_NOT_INSTALLED',
  CLAUDE_SDK_CRASH: 'CLAUDE_SDK_CRASH',
  CLAUDE_SDK_MAX_TURNS: 'CLAUDE_SDK_MAX_TURNS',

  // Claude Instance Pool errors
  CLAUDE_INSTANCE_ERROR: 'CLAUDE_INSTANCE_ERROR',
  CLAUDE_INSTANCE_POOL_EXHAUSTED: 'CLAUDE_INSTANCE_POOL_EXHAUSTED',
  CLAUDE_INSTANCE_SPAWN_FAILED: 'CLAUDE_INSTANCE_SPAWN_FAILED',
  CLAUDE_INSTANCE_CRASHED: 'CLAUDE_INSTANCE_CRASHED',
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
  CRITICAL: 'critical',
});

/**
 * Base application error class with enhanced metadata and serialization
 * @extends Error
 */
export class AppError extends Error {
  /**
   * Creates a new AppError instance
   * @param {string} message - Human-readable error message
   * @param {Object} options - Error configuration options
   * @param {number} [options.statusCode=500] - HTTP status code
   * @param {string} [options.code=ErrorCode.INTERNAL_ERROR] - Error code from ErrorCode enum
   * @param {boolean} [options.isOperational=true] - Whether error is operational (expected) or programming error
   * @param {string} [options.severity=ErrorSeverity.MEDIUM] - Error severity level
   * @param {Object} [options.context={}] - Additional context data
   * @param {Error} [options.cause] - Original error that caused this error
   */
  constructor(message, options = {}) {
    super(message);

    const {
      statusCode = 500,
      code = ErrorCode.INTERNAL_ERROR,
      isOperational = true,
      severity = ErrorSeverity.MEDIUM,
      context = {},
      cause = null,
    } = options;

    /** @type {string} */
    this.name = this.constructor.name;

    /** @type {number} */
    this.statusCode = statusCode;

    /** @type {string} */
    this.code = code;

    /** @type {boolean} */
    this.isOperational = isOperational;

    /** @type {string} */
    this.severity = severity;

    /** @type {Object} */
    this.context = context;

    /** @type {string} */
    this.timestamp = new Date().toISOString();

    /** @type {Error|null} */
    this.cause = cause;

    /** @type {string} */
    this.requestId = context.requestId || null;

    // Capture stack trace, excluding constructor
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error to a plain object for logging/API responses
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {Object} Serialized error object
   */
  toJSON(includeStack = false) {
    const json = {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      severity: this.severity,
      timestamp: this.timestamp,
      isOperational: this.isOperational,
      context: this.context,
    };

    if (this.requestId) {
      json.requestId = this.requestId;
    }

    if (includeStack && this.stack) {
      json.stack = this.stack;
    }

    if (this.cause) {
      json.cause =
        this.cause instanceof AppError
          ? this.cause.toJSON(includeStack)
          : { message: this.cause.message, name: this.cause.name };
    }

    return json;
  }

  /**
   * Creates a sanitized version suitable for client responses
   * @returns {Object} Client-safe error object
   */
  toClientResponse() {
    return {
      error: {
        code: this.code,
        message: this.isOperational ? this.message : 'An internal error occurred',
        ...(this.requestId && { requestId: this.requestId }),
      },
    };
  }

  /**
   * Creates an AppError from a plain object or another error
   * @param {Error|Object} source - Source error or object
   * @param {Object} [overrides={}] - Properties to override
   * @returns {AppError} New AppError instance
   */
  static from(source, overrides = {}) {
    if (source instanceof AppError) {
      return new AppError(overrides.message || source.message, {
        statusCode: overrides.statusCode || source.statusCode,
        code: overrides.code || source.code,
        isOperational: overrides.isOperational ?? source.isOperational,
        severity: overrides.severity || source.severity,
        context: { ...source.context, ...overrides.context },
        cause: source.cause,
      });
    }

    return new AppError(source.message || 'Unknown error', {
      cause: source,
      ...overrides,
    });
  }
}

/**
 * Validation error for input validation failures
 * @extends AppError
 */
export class ValidationError extends AppError {
  /**
   * Creates a new ValidationError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {Array} [options.errors=[]] - Array of validation errors
   * @param {string} [options.field] - Specific field that failed validation
   */
  constructor(message, options = {}) {
    const { errors = [], field, ...rest } = options;

    super(message, {
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      severity: ErrorSeverity.LOW,
      context: { errors, field },
      ...rest,
    });

    /** @type {Array} */
    this.errors = errors;

    /** @type {string|undefined} */
    this.field = field;
  }

  /**
   * Creates a ValidationError from Zod validation errors
   * @param {import('zod').ZodError} zodError - Zod error object
   * @returns {ValidationError} New ValidationError instance
   */
  static fromZod(zodError) {
    const errors = zodError.errors.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));

    return new ValidationError('Validation failed', {
      code: ErrorCode.SCHEMA_VALIDATION_FAILED,
      errors,
    });
  }
}

/**
 * API error for external service failures
 * @extends AppError
 */
export class APIError extends AppError {
  /**
   * Creates a new APIError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {Error} [options.originalError] - Original error from API call
   * @param {string} [options.service] - Name of the external service
   * @param {string} [options.endpoint] - API endpoint that failed
   * @param {number} [options.responseStatus] - HTTP status from external service
   */
  constructor(message, options = {}) {
    const { originalError, service, endpoint, responseStatus, ...rest } = options;

    super(message, {
      statusCode: 502,
      code: ErrorCode.API_ERROR,
      severity: ErrorSeverity.HIGH,
      context: { service, endpoint, responseStatus },
      cause: originalError,
      ...rest,
    });

    /** @type {string|undefined} */
    this.service = service;

    /** @type {string|undefined} */
    this.endpoint = endpoint;

    /** @type {number|undefined} */
    this.responseStatus = responseStatus;
  }
}

/**
 * Network error for connectivity issues
 * @extends AppError
 */
export class NetworkError extends AppError {
  /**
   * Creates a new NetworkError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.host] - Target host
   * @param {number} [options.port] - Target port
   * @param {string} [options.protocol] - Protocol (http, https, etc.)
   */
  constructor(message, options = {}) {
    const { host, port, protocol, ...rest } = options;

    super(message, {
      statusCode: 503,
      code: ErrorCode.NETWORK_ERROR,
      severity: ErrorSeverity.HIGH,
      context: { host, port, protocol },
      ...rest,
    });

    /** @type {string|undefined} */
    this.host = host;

    /** @type {number|undefined} */
    this.port = port;
  }
}

/**
 * Timeout error for operations that exceed time limits
 * @extends AppError
 */
export class TimeoutError extends AppError {
  /**
   * Creates a new TimeoutError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {number} [options.timeoutMs] - Timeout duration in milliseconds
   * @param {string} [options.operation] - Name of the operation that timed out
   */
  constructor(message, options = {}) {
    const { timeoutMs, operation, ...rest } = options;

    super(message, {
      statusCode: 504,
      code: ErrorCode.TIMEOUT_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: { timeoutMs, operation },
      ...rest,
    });

    /** @type {number|undefined} */
    this.timeoutMs = timeoutMs;

    /** @type {string|undefined} */
    this.operation = operation;
  }
}

/**
 * Configuration error for invalid or missing configuration
 * @extends AppError
 */
export class ConfigError extends AppError {
  /**
   * Creates a new ConfigError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.configKey] - Configuration key that is invalid/missing
   * @param {*} [options.expectedType] - Expected type or format
   * @param {*} [options.actualValue] - Actual value received
   */
  constructor(message, options = {}) {
    const { configKey, expectedType, actualValue, ...rest } = options;

    super(message, {
      statusCode: 500,
      code: ErrorCode.CONFIG_ERROR,
      severity: ErrorSeverity.CRITICAL,
      isOperational: false,
      context: { configKey, expectedType, actualValue: String(actualValue) },
      ...rest,
    });

    /** @type {string|undefined} */
    this.configKey = configKey;
  }
}

/**
 * File system error for file operations
 * @extends AppError
 */
export class FileSystemError extends AppError {
  /**
   * Creates a new FileSystemError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.path] - File path
   * @param {string} [options.operation] - Operation (read, write, delete, etc.)
   */
  constructor(message, options = {}) {
    const { path: filePath, operation, ...rest } = options;

    super(message, {
      statusCode: 500,
      code: ErrorCode.FILE_READ_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: { path: filePath, operation },
      ...rest,
    });

    /** @type {string|undefined} */
    this.path = filePath;

    /** @type {string|undefined} */
    this.operation = operation;
  }

  /**
   * Creates a FileSystemError from a Node.js error
   * @param {Error} nodeError - Node.js file system error
   * @param {string} [path] - File path
   * @returns {FileSystemError} New FileSystemError instance
   */
  static fromNodeError(nodeError, path) {
    const codeMap = {
      ENOENT: ErrorCode.FILE_NOT_FOUND,
      EACCES: ErrorCode.PERMISSION_DENIED,
      EPERM: ErrorCode.PERMISSION_DENIED,
      EISDIR: ErrorCode.FILE_READ_ERROR,
      ENOTDIR: ErrorCode.FILE_READ_ERROR,
    };

    return new FileSystemError(nodeError.message, {
      code: codeMap[nodeError.code] || ErrorCode.FILE_READ_ERROR,
      path,
      cause: nodeError,
      context: { syscall: nodeError.syscall, errno: nodeError.errno },
    });
  }
}

/**
 * Rate limit error
 * @extends AppError
 */
export class RateLimitError extends AppError {
  /**
   * Creates a new RateLimitError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {number} [options.retryAfter] - Seconds until retry is allowed
   * @param {number} [options.limit] - Rate limit threshold
   * @param {number} [options.remaining] - Remaining requests
   */
  constructor(message, options = {}) {
    const { retryAfter, limit, remaining, ...rest } = options;

    super(message, {
      statusCode: 429,
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      severity: ErrorSeverity.LOW,
      context: { retryAfter, limit, remaining },
      ...rest,
    });

    /** @type {number|undefined} */
    this.retryAfter = retryAfter;

    /** @type {number|undefined} */
    this.limit = limit;
  }
}

/**
 * Authentication error
 * @extends AppError
 */
export class AuthenticationError extends AppError {
  /**
   * Creates a new AuthenticationError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   */
  constructor(message, options = {}) {
    super(message, {
      statusCode: 401,
      code: ErrorCode.AUTHENTICATION_ERROR,
      severity: ErrorSeverity.MEDIUM,
      ...options,
    });
  }
}

/**
 * Authorization error
 * @extends AppError
 */
export class AuthorizationError extends AppError {
  /**
   * Creates a new AuthorizationError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.resource] - Resource being accessed
   * @param {string} [options.action] - Action being attempted
   */
  constructor(message, options = {}) {
    const { resource, action, ...rest } = options;

    super(message, {
      statusCode: 403,
      code: ErrorCode.AUTHORIZATION_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: { resource, action },
      ...rest,
    });
  }
}

/**
 * File not found error
 * @extends AppError
 */
export class FileNotFoundError extends AppError {
  /**
   * Creates a new FileNotFoundError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.path] - File path that was not found
   */
  constructor(message, options = {}) {
    const { path: filePath, ...rest } = options;

    super(message, {
      statusCode: 404,
      code: ErrorCode.FILE_NOT_FOUND,
      severity: ErrorSeverity.LOW,
      context: { path: filePath },
      ...rest,
    });

    /** @type {string|undefined} */
    this.path = filePath;
  }
}

/**
 * Permission denied error
 * @extends AppError
 */
export class PermissionError extends AppError {
  /**
   * Creates a new PermissionError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.path] - Path with permission issues
   * @param {string} [options.operation] - Operation that was denied
   */
  constructor(message, options = {}) {
    const { path: filePath, operation, ...rest } = options;

    super(message, {
      statusCode: 403,
      code: ErrorCode.PERMISSION_DENIED,
      severity: ErrorSeverity.MEDIUM,
      context: { path: filePath, operation },
      ...rest,
    });

    /** @type {string|undefined} */
    this.path = filePath;

    /** @type {string|undefined} */
    this.operation = operation;
  }
}

/**
 * Security error for security policy violations
 * @extends AppError
 */
export class SecurityError extends AppError {
  /**
   * Creates a new SecurityError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.violationType] - Type of security violation
   * @param {string} [options.resource] - Resource being protected
   */
  constructor(message, options = {}) {
    const { violationType = 'POLICY_VIOLATION', resource, ...rest } = options;

    super(message, {
      statusCode: 403,
      code: ErrorCode.AUTHORIZATION_ERROR,
      severity: ErrorSeverity.HIGH,
      context: { violationType, resource },
      ...rest,
    });

    /** @type {string} */
    this.violationType = violationType;

    /** @type {string|undefined} */
    this.resource = resource;
  }
}

/**
 * Generic not found error
 * @extends AppError
 */
export class NotFoundError extends AppError {
  /**
   * Creates a new NotFoundError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.resourceType] - Type of resource not found
   * @param {string} [options.resourceId] - ID of resource not found
   */
  constructor(message, options = {}) {
    const { resourceType, resourceId, ...rest } = options;

    super(message, {
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      severity: ErrorSeverity.LOW,
      context: { resourceType, resourceId },
      ...rest,
    });

    /** @type {string|undefined} */
    this.resourceType = resourceType;

    /** @type {string|undefined} */
    this.resourceId = resourceId;
  }
}

/**
 * Connection error for network connectivity issues
 * @extends AppError
 */
export class ConnectionError extends AppError {
  /**
   * Creates a new ConnectionError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.host] - Target host
   * @param {number} [options.port] - Target port
   */
  constructor(message, options = {}) {
    const { host, port, ...rest } = options;

    super(message, {
      statusCode: 503,
      code: ErrorCode.CONNECTION_REFUSED,
      severity: ErrorSeverity.HIGH,
      context: { host, port },
      ...rest,
    });

    /** @type {string|undefined} */
    this.host = host;

    /** @type {number|undefined} */
    this.port = port;
  }
}

/**
 * Configuration error
 * @extends AppError
 */
export class ConfigurationError extends AppError {
  /**
   * Creates a new ConfigurationError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.configKey] - Configuration key with issues
   */
  constructor(message, options = {}) {
    const { configKey, ...rest } = options;

    super(message, {
      statusCode: 500,
      code: ErrorCode.CONFIG_ERROR,
      severity: ErrorSeverity.CRITICAL,
      isOperational: false,
      context: { configKey },
      ...rest,
    });

    /** @type {string|undefined} */
    this.configKey = configKey;
  }
}

/**
 * Swarm/Agent coordination error
 * @extends AppError
 */
export class SwarmError extends AppError {
  /**
   * Creates a new SwarmError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.agentName] - Name of the failing agent
   * @param {string} [options.phase] - Phase of swarm execution
   * @param {Array} [options.failedAgents] - List of failed agents
   */
  constructor(message, options = {}) {
    const { agentName, phase, failedAgents, ...rest } = options;

    super(message, {
      statusCode: 500,
      code: ErrorCode.SWARM_ERROR,
      severity: ErrorSeverity.HIGH,
      context: { agentName, phase, failedAgents },
      ...rest,
    });

    /** @type {string|undefined} */
    this.agentName = agentName;

    /** @type {string|undefined} */
    this.phase = phase;
  }
}

/**
 * Checks if an error is operational (expected) vs programming error
 * @param {Error} error - Error to check
 * @returns {boolean} True if operational error
 */
export function isOperationalError(error) {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Wraps an async function to convert rejected promises to AppError
 * @template T
 * @param {() => Promise<T>} fn - Async function to wrap
 * @param {Object} [errorOptions={}] - Options for created AppError
 * @returns {Promise<T>} Result of the function
 */
export async function wrapAsync(fn, errorOptions = {}) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw AppError.from(error, errorOptions);
  }
}

// ============================================================================
// Tool Error Classes (consolidated from ToolErrors.js)
// ============================================================================

/**
 * Base error for all tool-related errors
 * @extends AppError
 */
export class ToolError extends AppError {
  /**
   * Creates a new ToolError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.code='TOOL_ERROR'] - Error code
   * @param {string} [options.toolName] - Name of the tool
   * @param {Object} [options.details={}] - Additional error details
   */
  constructor(message, options = {}) {
    const { code = 'TOOL_ERROR', toolName, details = {}, ...rest } = options;

    super(message, {
      statusCode: 500,
      code,
      severity: ErrorSeverity.MEDIUM,
      context: { toolName, ...details },
      ...rest,
    });

    /** @type {string|undefined} */
    this.toolName = toolName;

    /** @type {Object} */
    this.details = details;
  }
}

/**
 * Thrown when a tool cannot be found in the registry
 * @extends ToolError
 */
export class ToolNotFoundError extends ToolError {
  /**
   * Creates a new ToolNotFoundError
   * @param {string} toolName - Name of the tool that was not found
   * @param {string[]} [availableTools=[]] - List of available tools
   */
  constructor(toolName, availableTools = []) {
    super(`Tool '${toolName}' not found in registry`, {
      code: 'TOOL_NOT_FOUND',
      toolName,
      details: { availableTools: availableTools.slice(0, 10) },
    });
  }
}

/**
 * Thrown when tool loading fails
 * @extends ToolError
 */
export class ToolLoadError extends ToolError {
  /**
   * Creates a new ToolLoadError
   * @param {string} toolPath - Path to the tool that failed to load
   * @param {string} reason - Reason for the load failure
   * @param {Error} [originalError=null] - Original error that caused the failure
   */
  constructor(toolPath, reason, originalError = null) {
    super(`Failed to load tool from '${toolPath}': ${reason}`, {
      code: 'TOOL_LOAD_ERROR',
      details: { toolPath, reason, originalError: originalError?.message },
      cause: originalError,
    });

    /** @type {string} */
    this.toolPath = toolPath;

    /** @type {Error|null} */
    this.originalError = originalError;
  }
}

/**
 * Thrown when tool input validation fails
 * @extends ToolError
 */
export class ToolValidationError extends ToolError {
  /**
   * Creates a new ToolValidationError
   * @param {string} toolName - Name of the tool
   * @param {Array|string} validationErrors - Validation errors
   */
  constructor(toolName, validationErrors) {
    const errorMessages = Array.isArray(validationErrors)
      ? validationErrors.map((e) => e.message || e).join('; ')
      : validationErrors;

    super(`Validation failed for tool '${toolName}': ${errorMessages}`, {
      code: 'TOOL_VALIDATION_ERROR',
      toolName,
      details: { validationErrors },
    });

    /** @type {Array|string} */
    this.validationErrors = validationErrors;
  }
}

/**
 * Thrown when tool execution fails
 * @extends ToolError
 */
export class ToolExecutionError extends ToolError {
  /**
   * Creates a new ToolExecutionError
   * @param {string} toolName - Name of the tool
   * @param {string} reason - Reason for the execution failure
   * @param {Error} [originalError=null] - Original error that caused the failure
   */
  constructor(toolName, reason, originalError = null) {
    super(`Execution of tool '${toolName}' failed: ${reason}`, {
      code: 'TOOL_EXECUTION_ERROR',
      toolName,
      details: { reason, originalError: originalError?.message },
      cause: originalError,
    });

    /** @type {Error|null} */
    this.originalError = originalError;
  }
}

/**
 * Thrown when tool execution times out
 * @extends ToolError
 */
export class ToolTimeoutError extends ToolError {
  /**
   * Creates a new ToolTimeoutError
   * @param {string} toolName - Name of the tool
   * @param {number} timeoutMs - Timeout duration in milliseconds
   */
  constructor(toolName, timeoutMs) {
    super(`Tool '${toolName}' execution timed out after ${timeoutMs}ms`, {
      code: 'TOOL_TIMEOUT_ERROR',
      toolName,
      details: { timeoutMs },
    });

    /** @type {number} */
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when tool registration fails (e.g., duplicate name)
 * @extends ToolError
 */
export class ToolRegistrationError extends ToolError {
  /**
   * Creates a new ToolRegistrationError
   * @param {string} toolName - Name of the tool
   * @param {string} reason - Reason for registration failure
   */
  constructor(toolName, reason) {
    super(`Failed to register tool '${toolName}': ${reason}`, {
      code: 'TOOL_REGISTRATION_ERROR',
      toolName,
      details: { reason },
    });
  }
}

/**
 * Thrown when a hook execution fails
 * @extends ToolError
 */
export class ToolHookError extends ToolError {
  /**
   * Creates a new ToolHookError
   * @param {string} hookType - Type of hook that failed
   * @param {string} toolName - Name of the tool
   * @param {string} reason - Reason for the hook failure
   * @param {Error} [originalError=null] - Original error that caused the failure
   */
  constructor(hookType, toolName, reason, originalError = null) {
    super(`Hook '${hookType}' failed for tool '${toolName}': ${reason}`, {
      code: 'TOOL_HOOK_ERROR',
      toolName,
      details: { hookType, reason },
      cause: originalError,
    });

    /** @type {string} */
    this.hookType = hookType;

    /** @type {Error|null} */
    this.originalError = originalError;
  }
}

/**
 * Claude SDK error for Claude Agent SDK subprocess failures
 * @extends APIError
 */
export class ClaudeSDKError extends APIError {
  /**
   * Creates a new ClaudeSDKError
   * @param {string} message - Error message
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.errorType] - Error classification
   * @param {string[]} [options.suggestions] - Actionable suggestions for the user
   * @param {string} [options.stderrOutput] - Captured stderr from SDK subprocess
   */
  constructor(
    message,
    options: {
      errorType?: string;
      suggestions?: string[];
      stderrOutput?: string;
      [key: string]: unknown;
    } = {},
  ) {
    const { errorType = 'unknown', suggestions = [], stderrOutput, ...rest } = options;

    super(message, {
      code: ErrorCode.CLAUDE_SDK_ERROR,
      severity: ErrorSeverity.HIGH,
      service: 'claude-agent-sdk',
      context: { errorType, stderrOutput },
      ...rest,
    });

    /** @type {string} */
    this.errorType = errorType;

    /** @type {string[]} */
    this.suggestions = suggestions;

    /** @type {string|undefined} */
    this.stderrOutput = stderrOutput;
  }
}
