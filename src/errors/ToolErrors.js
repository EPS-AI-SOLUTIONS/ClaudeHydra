/**
 * Tool-specific error types for the ToolRegistry system
 * Provides granular error handling for tool operations
 */

import { AppError } from './AppError.js';

/**
 * Base error for all tool-related errors
 */
export class ToolError extends AppError {
  constructor(message, code = 'TOOL_ERROR', details = {}) {
    super(message, 500, code, true);
    this.details = details;
    this.name = 'ToolError';
  }
}

/**
 * Thrown when a tool cannot be found in the registry
 */
export class ToolNotFoundError extends ToolError {
  constructor(toolName, availableTools = []) {
    super(
      `Tool '${toolName}' not found in registry`,
      'TOOL_NOT_FOUND',
      { toolName, availableTools: availableTools.slice(0, 10) }
    );
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Thrown when tool loading fails
 */
export class ToolLoadError extends ToolError {
  constructor(toolPath, reason, originalError = null) {
    super(
      `Failed to load tool from '${toolPath}': ${reason}`,
      'TOOL_LOAD_ERROR',
      { toolPath, reason, originalError: originalError?.message }
    );
    this.name = 'ToolLoadError';
    this.originalError = originalError;
  }
}

/**
 * Thrown when tool input validation fails
 */
export class ToolValidationError extends ToolError {
  constructor(toolName, validationErrors) {
    const errorMessages = Array.isArray(validationErrors)
      ? validationErrors.map(e => e.message || e).join('; ')
      : validationErrors;

    super(
      `Validation failed for tool '${toolName}': ${errorMessages}`,
      'TOOL_VALIDATION_ERROR',
      { toolName, validationErrors }
    );
    this.name = 'ToolValidationError';
  }
}

/**
 * Thrown when tool execution fails
 */
export class ToolExecutionError extends ToolError {
  constructor(toolName, reason, originalError = null) {
    super(
      `Execution of tool '${toolName}' failed: ${reason}`,
      'TOOL_EXECUTION_ERROR',
      { toolName, reason, originalError: originalError?.message }
    );
    this.name = 'ToolExecutionError';
    this.originalError = originalError;
  }
}

/**
 * Thrown when tool execution times out
 */
export class ToolTimeoutError extends ToolError {
  constructor(toolName, timeoutMs) {
    super(
      `Tool '${toolName}' execution timed out after ${timeoutMs}ms`,
      'TOOL_TIMEOUT_ERROR',
      { toolName, timeoutMs }
    );
    this.name = 'ToolTimeoutError';
  }
}

/**
 * Thrown when tool registration fails (e.g., duplicate name)
 */
export class ToolRegistrationError extends ToolError {
  constructor(toolName, reason) {
    super(
      `Failed to register tool '${toolName}': ${reason}`,
      'TOOL_REGISTRATION_ERROR',
      { toolName, reason }
    );
    this.name = 'ToolRegistrationError';
  }
}

/**
 * Thrown when a hook execution fails
 */
export class ToolHookError extends ToolError {
  constructor(hookType, toolName, reason, originalError = null) {
    super(
      `Hook '${hookType}' failed for tool '${toolName}': ${reason}`,
      'TOOL_HOOK_ERROR',
      { hookType, toolName, reason }
    );
    this.name = 'ToolHookError';
    this.originalError = originalError;
  }
}

export default {
  ToolError,
  ToolNotFoundError,
  ToolLoadError,
  ToolValidationError,
  ToolExecutionError,
  ToolTimeoutError,
  ToolRegistrationError,
  ToolHookError
};
