/**
 * BaseTool - Abstract base class for all tools
 * Provides unified interface, validation, error handling, and timeout support
 */

import { z } from 'zod';
import { createLogger } from '../logger.js';
import { ValidationError, ToolExecutionError, TimeoutError } from '../errors/AppError.js';

/**
 * Standard result format for all tool operations
 */
export class ToolResult {
  constructor({ success, data = null, error = null, metadata = {} }) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.metadata = {
      timestamp: new Date().toISOString(),
      ...metadata
    };
  }

  static ok(data, metadata = {}) {
    return new ToolResult({ success: true, data, metadata });
  }

  static fail(error, metadata = {}) {
    return new ToolResult({
      success: false,
      error: error instanceof Error ? error.message : error,
      metadata
    });
  }

  toJSON() {
    return {
      success: this.success,
      ...(this.success ? { data: this.data } : { error: this.error }),
      metadata: this.metadata
    };
  }
}

/**
 * Abstract base class for tools
 * @abstract
 */
export class BaseTool {
  /**
   * @param {Object} config - Tool configuration
   * @param {string} config.name - Unique tool identifier
   * @param {string} config.description - Human-readable description
   * @param {z.ZodSchema} config.inputSchema - Zod schema for input validation
   * @param {number} [config.timeoutMs=30000] - Execution timeout in milliseconds
   * @param {string[]} [config.requiredPermissions=[]] - Required permissions
   */
  constructor({ name, description, inputSchema, timeoutMs = 30000, requiredPermissions = [] }) {
    if (new.target === BaseTool) {
      throw new Error('BaseTool is abstract and cannot be instantiated directly');
    }

    if (!name || typeof name !== 'string') {
      throw new Error('Tool name is required');
    }

    if (!description || typeof description !== 'string') {
      throw new Error('Tool description is required');
    }

    if (!(inputSchema instanceof z.ZodType)) {
      throw new Error('inputSchema must be a Zod schema');
    }

    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.timeoutMs = timeoutMs;
    this.requiredPermissions = requiredPermissions;
    this.logger = createLogger(name);
  }

  /**
   * Validate input against the schema
   * @param {Object} input - Raw input to validate
   * @returns {Object} Validated and transformed input
   * @throws {ValidationError} If validation fails
   */
  validateInput(input) {
    const result = this.inputSchema.safeParse(input);

    if (!result.success) {
      // Zod uses 'issues' not 'errors' for validation errors
      const issues = result.error.issues || result.error.errors || [];
      const errors = issues.map(e => `${e.path?.join('.') || ''}: ${e.message}`).join('; ');
      throw new ValidationError(`Input validation failed for ${this.name}: ${errors || result.error.message || 'Unknown validation error'}`);
    }

    return result.data;
  }

  /**
   * Convert Zod schema to JSON Schema for MCP compatibility
   * @returns {Object} JSON Schema representation
   */
  getJsonSchema() {
    return zodToJsonSchema(this.inputSchema);
  }

  /**
   * Get tool definition for MCP registration
   * @returns {Object} Tool definition
   */
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.getJsonSchema()
    };
  }

  /**
   * Execute the tool with validation, timeout, and error handling
   * @param {Object} rawInput - Raw input parameters
   * @returns {Promise<ToolResult>} Standardized result
   */
  async execute(rawInput) {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedInput = this.validateInput(rawInput);
      this.logger.info(`Executing ${this.name}`, { input: this.sanitizeForLog(validatedInput) });

      // Execute with timeout
      const result = await this.withTimeout(
        this.run(validatedInput),
        this.timeoutMs
      );

      const duration = Date.now() - startTime;
      this.logger.info(`${this.name} completed successfully`, { durationMs: duration });

      return ToolResult.ok(result, { durationMs: duration, tool: this.name });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`${this.name} failed`, {
        error: error.message,
        durationMs: duration,
        stack: error.stack
      });

      if (error instanceof ValidationError || error instanceof TimeoutError) {
        return ToolResult.fail(error.message, { durationMs: duration, tool: this.name });
      }

      // Wrap unknown errors
      return ToolResult.fail(
        error.message || 'Unknown error occurred',
        { durationMs: duration, tool: this.name, errorCode: error.code }
      );
    }
  }

  /**
   * Abstract method - must be implemented by subclasses
   * @param {Object} input - Validated input
   * @returns {Promise<*>} Tool-specific result
   * @abstract
   */
  async run(input) {
    throw new Error(`${this.name}: run() method must be implemented`);
  }

  /**
   * Wrap a promise with timeout
   * @param {Promise} promise - Promise to wrap
   * @param {number} ms - Timeout in milliseconds
   * @returns {Promise} Promise that rejects on timeout
   */
  async withTimeout(promise, ms) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutError(`${this.name} timed out after ${ms}ms`));
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Sanitize input for logging (remove sensitive data)
   * @param {Object} input - Input to sanitize
   * @returns {Object} Sanitized input
   */
  sanitizeForLog(input) {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'auth'];
    const sanitized = { ...input };

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 100) + '...[TRUNCATED]';
      }
    }

    return sanitized;
  }
}

/**
 * Convert Zod schema to JSON Schema (simplified implementation)
 * @param {z.ZodSchema} zodSchema - Zod schema
 * @returns {Object} JSON Schema
 */
function zodToJsonSchema(zodSchema) {
  const def = zodSchema._def;

  if (def.typeName === 'ZodObject') {
    const properties = {};
    const required = [];

    for (const [key, value] of Object.entries(def.shape())) {
      properties[key] = zodToJsonSchema(value);

      // Check if field is required (not optional/nullable)
      if (!value.isOptional?.() && !value._def.typeName?.includes('Optional')) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required })
    };
  }

  if (def.typeName === 'ZodString') {
    const schema = { type: 'string' };
    if (def.checks) {
      for (const check of def.checks) {
        if (check.kind === 'min') schema.minLength = check.value;
        if (check.kind === 'max') schema.maxLength = check.value;
      }
    }
    if (def.description) schema.description = def.description;
    return schema;
  }

  if (def.typeName === 'ZodNumber') {
    const schema = { type: 'number' };
    if (def.checks) {
      for (const check of def.checks) {
        if (check.kind === 'min') schema.minimum = check.value;
        if (check.kind === 'max') schema.maximum = check.value;
      }
    }
    if (def.description) schema.description = def.description;
    return schema;
  }

  if (def.typeName === 'ZodBoolean') {
    return { type: 'boolean', ...(def.description && { description: def.description }) };
  }

  if (def.typeName === 'ZodArray') {
    return {
      type: 'array',
      items: zodToJsonSchema(def.type),
      ...(def.description && { description: def.description })
    };
  }

  if (def.typeName === 'ZodEnum') {
    return {
      type: 'string',
      enum: def.values,
      ...(def.description && { description: def.description })
    };
  }

  if (def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable') {
    return zodToJsonSchema(def.innerType);
  }

  if (def.typeName === 'ZodDefault') {
    const schema = zodToJsonSchema(def.innerType);
    schema.default = def.defaultValue();
    return schema;
  }

  // Fallback for unknown types
  return { type: 'string' };
}

export default BaseTool;
