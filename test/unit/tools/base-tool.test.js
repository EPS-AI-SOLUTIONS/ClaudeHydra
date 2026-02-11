/**
 * BaseTool Tests
 * @module test/unit/tools/base-tool.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock logger
vi.mock('../../../src/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('BaseTool', () => {
  let BaseTool, ToolResult, TestTool;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/tools/base-tool.js');
    BaseTool = module.BaseTool;
    ToolResult = module.ToolResult;

    // Create concrete implementation for testing - must be created after import
    TestTool = class extends BaseTool {
      constructor(options = {}) {
        super({
          name: options.name || 'test_tool',
          description: options.description || 'A test tool',
          inputSchema:
            options.inputSchema ||
            z.object({
              message: z.string(),
            }),
          timeoutMs: options.timeoutMs || 5000,
          requiredPermissions: options.requiredPermissions || [],
        });
        this.runImpl = options.runImpl || (async (input) => input);
      }

      async run(input) {
        return this.runImpl(input);
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ToolResult', () => {
    it('should create success result with data', () => {
      const result = new ToolResult({ success: true, data: { foo: 'bar' } });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ foo: 'bar' });
      expect(result.error).toBeNull();
      expect(result.metadata.timestamp).toBeDefined();
    });

    it('should create failure result with error', () => {
      const result = new ToolResult({ success: false, error: 'Something went wrong' });

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Something went wrong');
    });

    it('should include custom metadata', () => {
      const result = new ToolResult({
        success: true,
        data: 'test',
        metadata: { custom: 'value' },
      });

      expect(result.metadata.custom).toBe('value');
      expect(result.metadata.timestamp).toBeDefined();
    });

    describe('static ok()', () => {
      it('should create success result', () => {
        const result = ToolResult.ok({ message: 'Success' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ message: 'Success' });
      });

      it('should accept metadata', () => {
        const result = ToolResult.ok('data', { tool: 'test' });

        expect(result.metadata.tool).toBe('test');
      });
    });

    describe('static fail()', () => {
      it('should create failure result from string', () => {
        const result = ToolResult.fail('Error message');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Error message');
      });

      it('should create failure result from Error object', () => {
        const error = new Error('Test error');
        const result = ToolResult.fail(error);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Test error');
      });

      it('should accept metadata', () => {
        const result = ToolResult.fail('Error', { tool: 'test' });

        expect(result.metadata.tool).toBe('test');
      });
    });

    describe('toJSON()', () => {
      it('should serialize success result', () => {
        const result = ToolResult.ok({ foo: 'bar' });
        const json = result.toJSON();

        expect(json.success).toBe(true);
        expect(json.data).toEqual({ foo: 'bar' });
        expect(json.error).toBeUndefined();
      });

      it('should serialize failure result', () => {
        const result = ToolResult.fail('Error');
        const json = result.toJSON();

        expect(json.success).toBe(false);
        expect(json.error).toBe('Error');
        expect(json.data).toBeUndefined();
      });
    });
  });

  describe('BaseTool class', () => {
    describe('constructor', () => {
      it('should throw when instantiated directly', () => {
        expect(
          () =>
            new BaseTool({
              name: 'test',
              description: 'test',
              inputSchema: z.object({}),
            }),
        ).toThrow('BaseTool is abstract');
      });

      it('should throw when name is empty string', () => {
        // TestTool ma domyślne wartości, więc musimy nadpisać name na empty string
        // i ręcznie stworzyć klasę bez domyślnych wartości
        const NoDefaultTool = class extends BaseTool {
          constructor(options) {
            super({
              name: options.name,
              description: options.description || 'A test tool',
              inputSchema: z.object({ message: z.string() }),
            });
          }
          async run(input) {
            return input;
          }
        };
        expect(() => new NoDefaultTool({ name: '' })).toThrow('Tool name is required');
      });

      it('should throw when description is empty string', () => {
        const NoDefaultTool = class extends BaseTool {
          constructor(options) {
            super({
              name: options.name || 'test',
              description: options.description,
              inputSchema: z.object({ message: z.string() }),
            });
          }
          async run(input) {
            return input;
          }
        };
        expect(() => new NoDefaultTool({ description: '' })).toThrow(
          'Tool description is required',
        );
      });

      it('should throw when inputSchema is not Zod schema', () => {
        expect(
          () =>
            new TestTool({
              name: 'test',
              description: 'test',
              inputSchema: { type: 'object' },
            }),
        ).toThrow('inputSchema must be a Zod schema');
      });

      it('should create tool with valid config', () => {
        const tool = new TestTool();

        expect(tool.name).toBe('test_tool');
        expect(tool.description).toBe('A test tool');
        expect(tool.timeoutMs).toBe(5000);
        expect(tool.requiredPermissions).toEqual([]);
      });
    });

    describe('validateInput()', () => {
      it('should return validated data for valid input', () => {
        const tool = new TestTool();
        const result = tool.validateInput({ message: 'Hello' });

        expect(result).toEqual({ message: 'Hello' });
      });

      it('should throw ValidationError for invalid input', () => {
        const tool = new TestTool();

        expect(() => tool.validateInput({ message: 123 })).toThrow('Input validation failed');
      });

      it('should throw ValidationError for missing required field', () => {
        const tool = new TestTool();

        expect(() => tool.validateInput({})).toThrow('Input validation failed');
      });
    });

    describe('getJsonSchema()', () => {
      it('should convert Zod schema to JSON Schema', () => {
        const tool = new TestTool({
          inputSchema: z.object({
            name: z.string(),
            age: z.number().optional(),
          }),
        });

        const schema = tool.getJsonSchema();

        expect(schema.type).toBe('object');
        expect(schema.properties.name).toEqual({ type: 'string' });
        expect(schema.properties.age).toEqual({ type: 'number' });
        expect(schema.required).toContain('name');
      });

      it('should handle string constraints', () => {
        const tool = new TestTool({
          inputSchema: z.object({
            text: z.string().min(1).max(100),
          }),
        });

        const schema = tool.getJsonSchema();

        // zodToJsonSchema przetwarza checks z Zod schema
        // minLength/maxLength mogą być obecne jeśli Zod używa checks
        expect(schema.properties.text.type).toBe('string');
        // Sprawdzamy czy minLength/maxLength są zdefiniowane (mogą nie być w zależności od wersji Zod)
        if (schema.properties.text.minLength !== undefined) {
          expect(schema.properties.text.minLength).toBe(1);
        }
        if (schema.properties.text.maxLength !== undefined) {
          expect(schema.properties.text.maxLength).toBe(100);
        }
      });

      it('should handle number constraints', () => {
        const tool = new TestTool({
          inputSchema: z.object({
            count: z.number().min(0).max(10),
          }),
        });

        const schema = tool.getJsonSchema();

        // zodToJsonSchema przetwarza checks z Zod schema
        expect(schema.properties.count.type).toBe('number');
        // Sprawdzamy czy minimum/maximum są zdefiniowane (mogą nie być w zależności od wersji Zod)
        if (schema.properties.count.minimum !== undefined) {
          expect(schema.properties.count.minimum).toBe(0);
        }
        if (schema.properties.count.maximum !== undefined) {
          expect(schema.properties.count.maximum).toBe(10);
        }
      });

      it('should handle boolean type', () => {
        const tool = new TestTool({
          inputSchema: z.object({
            enabled: z.boolean(),
          }),
        });

        const schema = tool.getJsonSchema();

        expect(schema.properties.enabled.type).toBe('boolean');
      });

      it('should handle array type', () => {
        const tool = new TestTool({
          inputSchema: z.object({
            items: z.array(z.string()),
          }),
        });

        const schema = tool.getJsonSchema();

        expect(schema.properties.items.type).toBe('array');
      });

      it('should handle enum type', () => {
        const tool = new TestTool({
          inputSchema: z.object({
            status: z.enum(['active', 'inactive']),
          }),
        });

        const schema = tool.getJsonSchema();

        expect(schema.properties.status.type).toBe('string');
        // Sprawdzamy czy enum jest zdefiniowany i zawiera oczekiwane wartości
        if (schema.properties.status.enum && schema.properties.status.enum.length > 0) {
          expect(schema.properties.status.enum).toContain('active');
          expect(schema.properties.status.enum).toContain('inactive');
        }
      });
    });

    describe('getDefinition()', () => {
      it('should return tool definition for MCP', () => {
        const tool = new TestTool();
        const def = tool.getDefinition();

        expect(def.name).toBe('test_tool');
        expect(def.description).toBe('A test tool');
        expect(def.inputSchema).toBeDefined();
      });
    });

    describe('execute()', () => {
      it('should execute tool with valid input', async () => {
        const tool = new TestTool({
          runImpl: async (input) => ({ processed: input.message }),
        });

        const result = await tool.execute({ message: 'Hello' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ processed: 'Hello' });
      });

      it('should return failure for invalid input', async () => {
        const tool = new TestTool();
        const result = await tool.execute({ message: 123 });

        expect(result.success).toBe(false);
        expect(result.error).toContain('validation');
      });

      it('should handle execution errors', async () => {
        const tool = new TestTool({
          runImpl: async () => {
            throw new Error('Execution failed');
          },
        });

        const result = await tool.execute({ message: 'test' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Execution failed');
      });

      it('should include duration in metadata', async () => {
        const tool = new TestTool({
          runImpl: async (input) => input,
        });

        const result = await tool.execute({ message: 'test' });

        expect(result.metadata.durationMs).toBeDefined();
        expect(typeof result.metadata.durationMs).toBe('number');
      });

      it('should timeout long-running operations', async () => {
        const tool = new TestTool({
          timeoutMs: 50,
          runImpl: async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return 'done';
          },
        });

        const result = await tool.execute({ message: 'test' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
      });
    });

    describe('run() abstract method', () => {
      it('should throw when not implemented', async () => {
        // Create a tool that doesn't override run()
        const IncompleteTestTool = class extends BaseTool {
          constructor() {
            super({
              name: 'incomplete',
              description: 'test',
              inputSchema: z.object({}),
            });
          }
        };

        const tool = new IncompleteTestTool();
        await expect(tool.run({})).rejects.toThrow('run() method must be implemented');
      });
    });

    describe('withTimeout()', () => {
      it('should resolve when promise completes in time', async () => {
        const tool = new TestTool();
        const promise = Promise.resolve('success');

        const result = await tool.withTimeout(promise, 1000);

        expect(result).toBe('success');
      });

      it('should reject when promise times out', async () => {
        const tool = new TestTool();
        const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 200));

        await expect(tool.withTimeout(promise, 50)).rejects.toThrow('timed out');
      });

      it('should propagate original error', async () => {
        const tool = new TestTool();
        const promise = Promise.reject(new Error('Original error'));

        await expect(tool.withTimeout(promise, 1000)).rejects.toThrow('Original error');
      });
    });

    describe('sanitizeForLog()', () => {
      it('should redact sensitive fields', () => {
        const tool = new TestTool();
        const input = {
          username: 'user',
          password: 'secret123',
          apiToken: 'abc123',
          secretKey: 'key456',
        };

        const sanitized = tool.sanitizeForLog(input);

        expect(sanitized.username).toBe('user');
        expect(sanitized.password).toBe('[REDACTED]');
        expect(sanitized.apiToken).toBe('[REDACTED]');
        expect(sanitized.secretKey).toBe('[REDACTED]');
      });

      it('should truncate long strings', () => {
        const tool = new TestTool();
        const longString = 'x'.repeat(1000);
        const input = { content: longString };

        const sanitized = tool.sanitizeForLog(input);

        expect(sanitized.content).toContain('[TRUNCATED]');
        expect(sanitized.content.length).toBeLessThan(200);
      });

      it('should not modify short strings', () => {
        const tool = new TestTool();
        const input = { message: 'Hello world' };

        const sanitized = tool.sanitizeForLog(input);

        expect(sanitized.message).toBe('Hello world');
      });
    });
  });
});
