/**
 * Tool Schema Tests
 * @module test/unit/schemas/tool-schema.test
 */

import { describe, it, expect } from 'vitest';
import {
  ToolCategory,
  toolMetadataSchema,
  toolDefinitionSchema,
  SchemaValidator,
  validateToolDefinition,
  validateToolInput
} from '../../../src/schemas/tool-schema.js';

describe('Tool Schema', () => {
  describe('ToolCategory', () => {
    it('should have all expected categories', () => {
      expect(ToolCategory.FILESYSTEM).toBe('filesystem');
      expect(ToolCategory.SHELL).toBe('shell');
      expect(ToolCategory.NETWORK).toBe('network');
      expect(ToolCategory.DATABASE).toBe('database');
      expect(ToolCategory.AI).toBe('ai');
      expect(ToolCategory.UTILITY).toBe('utility');
      expect(ToolCategory.SECURITY).toBe('security');
      expect(ToolCategory.SWARM).toBe('swarm');
      expect(ToolCategory.KNOWLEDGE).toBe('knowledge');
      expect(ToolCategory.CUSTOM).toBe('custom');
    });

    it('should have 10 categories', () => {
      expect(Object.keys(ToolCategory)).toHaveLength(10);
    });
  });

  describe('toolMetadataSchema', () => {
    it('should be an object schema', () => {
      expect(toolMetadataSchema.type).toBe('object');
    });

    it('should have version property with semver pattern', () => {
      expect(toolMetadataSchema.properties.version.type).toBe('string');
      expect(toolMetadataSchema.properties.version.pattern).toBeDefined();
    });

    it('should have author property', () => {
      expect(toolMetadataSchema.properties.author.type).toBe('string');
    });

    it('should have tags property as array', () => {
      expect(toolMetadataSchema.properties.tags.type).toBe('array');
    });

    it('should have deprecated property with default false', () => {
      expect(toolMetadataSchema.properties.deprecated.type).toBe('boolean');
      expect(toolMetadataSchema.properties.deprecated.default).toBe(false);
    });
  });

  describe('toolDefinitionSchema', () => {
    it('should require name, description, and execute', () => {
      expect(toolDefinitionSchema.required).toContain('name');
      expect(toolDefinitionSchema.required).toContain('description');
      expect(toolDefinitionSchema.required).toContain('execute');
    });

    it('should have name constraints', () => {
      const nameProp = toolDefinitionSchema.properties.name;
      expect(nameProp.type).toBe('string');
      expect(nameProp.minLength).toBe(2);
      expect(nameProp.maxLength).toBe(64);
      expect(nameProp.pattern).toBeDefined();
    });

    it('should have description constraints', () => {
      const descProp = toolDefinitionSchema.properties.description;
      expect(descProp.type).toBe('string');
      expect(descProp.minLength).toBe(10);
      expect(descProp.maxLength).toBe(500);
    });

    it('should have timeout constraints', () => {
      const timeoutProp = toolDefinitionSchema.properties.timeout;
      expect(timeoutProp.type).toBe('number');
      expect(timeoutProp.minimum).toBe(100);
      expect(timeoutProp.maximum).toBe(300000);
      expect(timeoutProp.default).toBe(30000);
    });

    it('should have retry configuration', () => {
      expect(toolDefinitionSchema.properties.retryable.type).toBe('boolean');
      expect(toolDefinitionSchema.properties.maxRetries.type).toBe('number');
      expect(toolDefinitionSchema.properties.maxRetries.maximum).toBe(5);
    });

    it('should have cache configuration', () => {
      expect(toolDefinitionSchema.properties.cacheable.type).toBe('boolean');
      expect(toolDefinitionSchema.properties.cacheTTL.type).toBe('number');
    });

    it('should have dangerous flag', () => {
      expect(toolDefinitionSchema.properties.dangerous.type).toBe('boolean');
      expect(toolDefinitionSchema.properties.dangerous.default).toBe(false);
    });
  });

  describe('SchemaValidator', () => {
    describe('validate()', () => {
      it('should validate string type', () => {
        const schema = { type: 'string' };
        expect(SchemaValidator.validate('hello', schema).valid).toBe(true);
        expect(SchemaValidator.validate(123, schema).valid).toBe(false);
      });

      it('should validate number type', () => {
        const schema = { type: 'number' };
        expect(SchemaValidator.validate(42, schema).valid).toBe(true);
        expect(SchemaValidator.validate('42', schema).valid).toBe(false);
      });

      it('should allow integer for number type', () => {
        const schema = { type: 'number' };
        expect(SchemaValidator.validate(42, schema).valid).toBe(true);
      });

      it('should validate integer type', () => {
        const schema = { type: 'integer' };
        expect(SchemaValidator.validate(42, schema).valid).toBe(true);
        expect(SchemaValidator.validate(42.5, schema).valid).toBe(false);
      });

      it('should validate boolean type', () => {
        const schema = { type: 'boolean' };
        expect(SchemaValidator.validate(true, schema).valid).toBe(true);
        expect(SchemaValidator.validate(false, schema).valid).toBe(true);
        expect(SchemaValidator.validate('true', schema).valid).toBe(false);
      });

      it('should validate array type', () => {
        const schema = { type: 'array' };
        expect(SchemaValidator.validate([1, 2, 3], schema).valid).toBe(true);
        expect(SchemaValidator.validate('array', schema).valid).toBe(false);
      });

      it('should validate object type', () => {
        const schema = { type: 'object' };
        expect(SchemaValidator.validate({ key: 'value' }, schema).valid).toBe(true);
        expect(SchemaValidator.validate('object', schema).valid).toBe(false);
      });

      it('should handle null and undefined', () => {
        const schema = { type: 'string' };
        expect(SchemaValidator.validate(null, schema).valid).toBe(true);
        expect(SchemaValidator.validate(undefined, schema).valid).toBe(true);
      });
    });

    describe('string validations', () => {
      it('should validate minLength', () => {
        const schema = { type: 'string', minLength: 5 };
        expect(SchemaValidator.validate('hello', schema).valid).toBe(true);
        expect(SchemaValidator.validate('hi', schema).valid).toBe(false);
      });

      it('should validate maxLength', () => {
        const schema = { type: 'string', maxLength: 5 };
        expect(SchemaValidator.validate('hello', schema).valid).toBe(true);
        expect(SchemaValidator.validate('hello world', schema).valid).toBe(false);
      });

      it('should validate pattern', () => {
        const schema = { type: 'string', pattern: '^[a-z]+$' };
        expect(SchemaValidator.validate('hello', schema).valid).toBe(true);
        expect(SchemaValidator.validate('Hello', schema).valid).toBe(false);
      });

      it('should validate enum', () => {
        const schema = { type: 'string', enum: ['red', 'green', 'blue'] };
        expect(SchemaValidator.validate('red', schema).valid).toBe(true);
        expect(SchemaValidator.validate('yellow', schema).valid).toBe(false);
      });
    });

    describe('number validations', () => {
      it('should validate minimum', () => {
        const schema = { type: 'number', minimum: 0 };
        expect(SchemaValidator.validate(5, schema).valid).toBe(true);
        expect(SchemaValidator.validate(-1, schema).valid).toBe(false);
      });

      it('should validate maximum', () => {
        const schema = { type: 'number', maximum: 100 };
        expect(SchemaValidator.validate(50, schema).valid).toBe(true);
        expect(SchemaValidator.validate(150, schema).valid).toBe(false);
      });
    });

    describe('array validations', () => {
      it('should validate minItems', () => {
        const schema = { type: 'array', minItems: 2 };
        expect(SchemaValidator.validate([1, 2, 3], schema).valid).toBe(true);
        expect(SchemaValidator.validate([1], schema).valid).toBe(false);
      });

      it('should validate maxItems', () => {
        const schema = { type: 'array', maxItems: 3 };
        expect(SchemaValidator.validate([1, 2], schema).valid).toBe(true);
        expect(SchemaValidator.validate([1, 2, 3, 4], schema).valid).toBe(false);
      });

      it('should validate items schema', () => {
        const schema = {
          type: 'array',
          items: { type: 'string' }
        };
        expect(SchemaValidator.validate(['a', 'b'], schema).valid).toBe(true);
        expect(SchemaValidator.validate(['a', 123], schema).valid).toBe(false);
      });
    });

    describe('object validations', () => {
      it('should validate required properties', () => {
        const schema = {
          type: 'object',
          required: ['name', 'age'],
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          }
        };

        expect(SchemaValidator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
        expect(SchemaValidator.validate({ name: 'John' }, schema).valid).toBe(false);
      });

      it('should validate nested properties', () => {
        const schema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' }
              }
            }
          }
        };

        expect(SchemaValidator.validate({ user: { name: 'John' } }, schema).valid).toBe(true);
        expect(SchemaValidator.validate({ user: { name: 123 } }, schema).valid).toBe(false);
      });

      it('should check additionalProperties when false', () => {
        const schema = {
          type: 'object',
          properties: {
            name: { type: 'string' }
          },
          additionalProperties: false
        };

        expect(SchemaValidator.validate({ name: 'John' }, schema).valid).toBe(true);
        expect(SchemaValidator.validate({ name: 'John', extra: 'prop' }, schema).valid).toBe(false);
      });
    });

    describe('_getType()', () => {
      it('should identify null', () => {
        expect(SchemaValidator._getType(null)).toBe('null');
      });

      it('should identify undefined', () => {
        expect(SchemaValidator._getType(undefined)).toBe('undefined');
      });

      it('should identify array', () => {
        expect(SchemaValidator._getType([])).toBe('array');
      });

      it('should identify integer', () => {
        expect(SchemaValidator._getType(42)).toBe('integer');
      });

      it('should identify number (float)', () => {
        expect(SchemaValidator._getType(3.14)).toBe('number');
      });

      it('should identify string', () => {
        expect(SchemaValidator._getType('hello')).toBe('string');
      });

      it('should identify boolean', () => {
        expect(SchemaValidator._getType(true)).toBe('boolean');
      });

      it('should identify object', () => {
        expect(SchemaValidator._getType({})).toBe('object');
      });
    });
  });

  describe('validateToolDefinition()', () => {
    it('should reject non-object input', () => {
      const result = validateToolDefinition(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool must be an object');
    });

    it('should require valid name', () => {
      const result = validateToolDefinition({ description: 'test', execute: () => {} });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should require snake_case name', () => {
      const result = validateToolDefinition({
        name: 'InvalidName',
        description: 'A valid description for testing',
        execute: () => {}
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('snake_case'))).toBe(true);
    });

    it('should require description at least 10 characters', () => {
      const result = validateToolDefinition({
        name: 'my_tool',
        description: 'short',
        execute: () => {}
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('10 characters'))).toBe(true);
    });

    it('should require execute function', () => {
      const result = validateToolDefinition({
        name: 'my_tool',
        description: 'A valid description for testing'
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('execute'))).toBe(true);
    });

    it('should validate valid tool definition', () => {
      const result = validateToolDefinition({
        name: 'my_tool',
        description: 'A valid description for testing',
        execute: () => {}
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate category', () => {
      const result = validateToolDefinition({
        name: 'my_tool',
        description: 'A valid description for testing',
        execute: () => {},
        category: 'invalid_category'
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid category'))).toBe(true);
    });

    it('should accept valid category', () => {
      const result = validateToolDefinition({
        name: 'my_tool',
        description: 'A valid description for testing',
        execute: () => {},
        category: 'filesystem'
      });
      expect(result.valid).toBe(true);
    });

    it('should validate timeout range', () => {
      const result = validateToolDefinition({
        name: 'my_tool',
        description: 'A valid description for testing',
        execute: () => {},
        timeout: 50
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('timeout'))).toBe(true);
    });
  });

  describe('validateToolInput()', () => {
    it('should return valid for tool without inputSchema', () => {
      const tool = { name: 'test' };
      const result = validateToolInput(tool, { any: 'data' });
      expect(result.valid).toBe(true);
    });

    it('should validate input against schema', () => {
      const tool = {
        name: 'test',
        inputSchema: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string' }
          }
        }
      };

      const validResult = validateToolInput(tool, { path: '/test' });
      expect(validResult.valid).toBe(true);

      const invalidResult = validateToolInput(tool, { other: 'data' });
      expect(invalidResult.valid).toBe(false);
    });
  });
});
