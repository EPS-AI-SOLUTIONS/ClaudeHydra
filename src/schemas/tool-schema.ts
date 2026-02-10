/**
 * JSON Schema validation for tools
 * Provides comprehensive schema definitions and validation utilities
 */

/**
 * Tool categories for organization and filtering
 */
export const ToolCategory = {
  FILESYSTEM: 'filesystem',
  SHELL: 'shell',
  NETWORK: 'network',
  DATABASE: 'database',
  AI: 'ai',
  UTILITY: 'utility',
  SECURITY: 'security',
  SWARM: 'swarm',
  KNOWLEDGE: 'knowledge',
  CUSTOM: 'custom',
};

/**
 * Tool metadata schema - defines what metadata a tool should have
 */
export const toolMetadataSchema = {
  type: 'object',
  properties: {
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      description: 'Semantic version of the tool',
    },
    author: {
      type: 'string',
      description: 'Author or maintainer of the tool',
    },
    license: {
      type: 'string',
      description: 'License under which the tool is released',
    },
    repository: {
      type: 'string',
      format: 'uri',
      description: 'URL to the tool source repository',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags for tool discovery',
    },
    deprecated: {
      type: 'boolean',
      default: false,
      description: 'Whether this tool is deprecated',
    },
    deprecationMessage: {
      type: 'string',
      description: 'Message explaining deprecation and alternatives',
    },
  },
};

/**
 * Complete tool definition schema
 */
export const toolDefinitionSchema = {
  type: 'object',
  required: ['name', 'description', 'execute'],
  properties: {
    name: {
      type: 'string',
      pattern: '^[a-z][a-z0-9_]*$',
      minLength: 2,
      maxLength: 64,
      description: 'Unique identifier for the tool (snake_case)',
    },
    description: {
      type: 'string',
      minLength: 10,
      maxLength: 500,
      description: 'Human-readable description of what the tool does',
    },
    category: {
      type: 'string',
      enum: Object.values(ToolCategory),
      default: ToolCategory.CUSTOM,
      description: 'Category for tool organization',
    },
    inputSchema: {
      type: 'object',
      description: 'JSON Schema for tool input validation',
    },
    outputSchema: {
      type: 'object',
      description: 'JSON Schema for tool output validation',
    },
    metadata: toolMetadataSchema,
    timeout: {
      type: 'number',
      minimum: 100,
      maximum: 300000,
      default: 30000,
      description: 'Execution timeout in milliseconds',
    },
    retryable: {
      type: 'boolean',
      default: false,
      description: 'Whether this tool can be retried on failure',
    },
    maxRetries: {
      type: 'number',
      minimum: 0,
      maximum: 5,
      default: 0,
      description: 'Maximum number of retries on failure',
    },
    cacheable: {
      type: 'boolean',
      default: false,
      description: 'Whether results can be cached',
    },
    cacheTTL: {
      type: 'number',
      minimum: 0,
      default: 0,
      description: 'Cache time-to-live in milliseconds',
    },
    requiresConfirmation: {
      type: 'boolean',
      default: false,
      description: 'Whether this tool requires user confirmation before execution',
    },
    dangerous: {
      type: 'boolean',
      default: false,
      description: 'Whether this tool performs dangerous operations',
    },
  },
};

/**
 * Simple JSON Schema validator
 * Validates data against a JSON Schema
 */
export class SchemaValidator {
  /**
   * Validate data against a schema
   * @param {any} data - Data to validate
   * @param {object} schema - JSON Schema
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(data, schema) {
    const errors = [];
    SchemaValidator._validateNode(data, schema, '', errors);
    return { valid: errors.length === 0, errors };
  }

  static _validateNode(data, schema, path, errors) {
    if (!schema) return;

    const currentPath = path || 'root';

    // Handle type validation
    if (schema.type) {
      const actualType = SchemaValidator._getType(data);
      const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];

      if (!expectedTypes.includes(actualType) && data !== undefined && data !== null) {
        if (!(schema.type === 'number' && actualType === 'integer')) {
          errors.push(`${currentPath}: expected ${schema.type}, got ${actualType}`);
          return;
        }
      }
    }

    // Handle null
    if (data === null || data === undefined) {
      if (schema.required && Array.isArray(schema.required)) {
        // This is handled at object level
      }
      return;
    }

    // String validations
    if (schema.type === 'string' && typeof data === 'string') {
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        errors.push(
          `${currentPath}: string length ${data.length} is less than minLength ${schema.minLength}`,
        );
      }
      if (schema.maxLength !== undefined && data.length > schema.maxLength) {
        errors.push(
          `${currentPath}: string length ${data.length} exceeds maxLength ${schema.maxLength}`,
        );
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          errors.push(`${currentPath}: string does not match pattern ${schema.pattern}`);
        }
      }
      if (schema.enum && !schema.enum.includes(data)) {
        errors.push(`${currentPath}: value must be one of [${schema.enum.join(', ')}]`);
      }
    }

    // Number validations
    if ((schema.type === 'number' || schema.type === 'integer') && typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${currentPath}: ${data} is less than minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${currentPath}: ${data} exceeds maximum ${schema.maximum}`);
      }
      if (schema.type === 'integer' && !Number.isInteger(data)) {
        errors.push(`${currentPath}: expected integer, got float`);
      }
    }

    // Array validations
    if (schema.type === 'array' && Array.isArray(data)) {
      if (schema.minItems !== undefined && data.length < schema.minItems) {
        errors.push(
          `${currentPath}: array length ${data.length} is less than minItems ${schema.minItems}`,
        );
      }
      if (schema.maxItems !== undefined && data.length > schema.maxItems) {
        errors.push(
          `${currentPath}: array length ${data.length} exceeds maxItems ${schema.maxItems}`,
        );
      }
      if (schema.items) {
        data.forEach((item, index) => {
          SchemaValidator._validateNode(item, schema.items, `${currentPath}[${index}]`, errors);
        });
      }
    }

    // Object validations
    if (schema.type === 'object' && typeof data === 'object' && !Array.isArray(data)) {
      // Check required properties
      if (schema.required && Array.isArray(schema.required)) {
        for (const reqProp of schema.required) {
          if (!(reqProp in data) || data[reqProp] === undefined) {
            errors.push(`${currentPath}: missing required property '${reqProp}'`);
          }
        }
      }

      // Validate properties
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          if (propName in data) {
            SchemaValidator._validateNode(
              data[propName],
              propSchema,
              `${currentPath}.${propName}`,
              errors,
            );
          }
        }
      }

      // Check for additional properties
      if (schema.additionalProperties === false && schema.properties) {
        const allowedProps = new Set(Object.keys(schema.properties));
        for (const prop of Object.keys(data)) {
          if (!allowedProps.has(prop)) {
            errors.push(`${currentPath}: unexpected property '${prop}'`);
          }
        }
      }
    }
  }

  static _getType(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (Number.isInteger(value)) return 'integer';
    return typeof value;
  }
}

/**
 * Validate a tool definition against the tool schema
 * @param {object} tool - Tool to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateToolDefinition(tool) {
  const errors = [];

  // Basic structure check
  if (!tool || typeof tool !== 'object') {
    return { valid: false, errors: ['Tool must be an object'] };
  }

  // Required fields
  if (!tool.name || typeof tool.name !== 'string') {
    errors.push('Tool must have a valid name (string)');
  } else if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    errors.push(`Tool name '${tool.name}' must be snake_case starting with a letter`);
  }

  if (!tool.description || typeof tool.description !== 'string') {
    errors.push('Tool must have a valid description (string)');
  } else if (tool.description.length < 10) {
    errors.push('Tool description must be at least 10 characters');
  }

  if (!tool.execute || typeof tool.execute !== 'function') {
    errors.push('Tool must have an execute function');
  }

  // Optional field validations
  if (tool.category && !Object.values(ToolCategory).includes(tool.category)) {
    errors.push(
      `Invalid category '${tool.category}'. Must be one of: ${Object.values(ToolCategory).join(', ')}`,
    );
  }

  if (tool.timeout !== undefined) {
    if (typeof tool.timeout !== 'number' || tool.timeout < 100 || tool.timeout > 300000) {
      errors.push('Tool timeout must be a number between 100 and 300000 ms');
    }
  }

  if (tool.inputSchema) {
    const schemaResult = SchemaValidator.validate(tool.inputSchema, { type: 'object' });
    if (!schemaResult.valid) {
      errors.push(`Invalid inputSchema: ${schemaResult.errors.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate tool input against its input schema
 * @param {object} tool - Tool definition
 * @param {any} input - Input to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateToolInput(tool, input) {
  if (!tool.inputSchema) {
    return { valid: true, errors: [] };
  }

  return SchemaValidator.validate(input, tool.inputSchema);
}

export default {
  ToolCategory,
  toolMetadataSchema,
  toolDefinitionSchema,
  SchemaValidator,
  validateToolDefinition,
  validateToolInput,
};
