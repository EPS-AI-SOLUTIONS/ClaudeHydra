/**
 * Comprehensive tests for the refactored ToolRegistry
 * Tests lazy loading, validation, hooks, caching, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolRegistry, ToolCategory } from '../src/tool-registry.js';
import {
  ToolNotFoundError,
  ToolValidationError,
  ToolExecutionError,
  ToolTimeoutError,
  ToolRegistrationError,
  ToolHookError
} from '../src/errors/ToolErrors.js';

describe('ToolRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  afterEach(() => {
    registry.shutdown();
  });

  describe('Tool Registration', () => {
    it('should register a valid tool', async () => {
      const tool = {
        name: 'test_tool',
        description: 'A test tool for unit testing purposes',
        execute: async () => ({ success: true })
      };

      await registry.registerTool(tool);
      expect(registry.tools.has('test_tool')).toBe(true);
    });

    it('should apply default values to registered tools', async () => {
      const tool = {
        name: 'minimal_tool',
        description: 'Minimal tool with only required fields',
        execute: async () => 'result'
      };

      await registry.registerTool(tool);
      const registered = registry.getToolSync('minimal_tool');

      expect(registered.category).toBe(ToolCategory.CUSTOM);
      expect(registered.timeout).toBe(30000);
      expect(registered.retryable).toBe(false);
      expect(registered.cacheable).toBe(false);
      expect(registered.metadata.version).toBe('1.0.0');
    });

    it('should reject tools with invalid names', async () => {
      const invalidTools = [
        { name: 'Invalid-Name', description: 'Invalid dash', execute: () => {} },
        { name: '123start', description: 'Starts with number', execute: () => {} },
        { name: 'a', description: 'Too short', execute: () => {} },
        { name: '', description: 'Empty name', execute: () => {} }
      ];

      for (const tool of invalidTools) {
        await expect(registry.registerTool(tool)).rejects.toThrow(ToolRegistrationError);
      }
    });

    it('should reject duplicate tools without override flag', async () => {
      const tool = {
        name: 'duplicate_test',
        description: 'First version of the tool',
        execute: async () => 'v1'
      };

      await registry.registerTool(tool);
      await expect(registry.registerTool(tool)).rejects.toThrow(ToolRegistrationError);
    });

    it('should allow overriding with override flag', async () => {
      const toolV1 = {
        name: 'override_test',
        description: 'First version of the tool',
        execute: async () => 'v1'
      };
      const toolV2 = {
        name: 'override_test',
        description: 'Second version of the tool',
        execute: async () => 'v2'
      };

      await registry.registerTool(toolV1);
      await registry.registerTool(toolV2, { override: true });

      const tool = registry.getToolSync('override_test');
      expect(tool.description).toBe('Second version of the tool');
    });

    it('should unregister tools correctly', async () => {
      const tool = {
        name: 'removable_tool',
        description: 'Tool that will be removed',
        category: ToolCategory.UTILITY,
        execute: async () => 'result'
      };

      await registry.registerTool(tool);
      expect(registry.tools.has('removable_tool')).toBe(true);

      const result = registry.unregisterTool('removable_tool');
      expect(result).toBe(true);
      expect(registry.tools.has('removable_tool')).toBe(false);
      expect(registry.categories.get(ToolCategory.UTILITY).has('removable_tool')).toBe(false);
    });
  });

  describe('Tool Categories', () => {
    it('should organize tools by category', async () => {
      const tools = [
        { name: 'fs_tool_one', description: 'Filesystem tool 1', category: ToolCategory.FILESYSTEM, execute: () => {} },
        { name: 'fs_tool_two', description: 'Filesystem tool 2', category: ToolCategory.FILESYSTEM, execute: () => {} },
        { name: 'shell_tool', description: 'Shell tool', category: ToolCategory.SHELL, execute: () => {} }
      ];

      for (const tool of tools) {
        await registry.registerTool(tool);
      }

      const fsTools = registry.getToolsByCategory(ToolCategory.FILESYSTEM);
      expect(fsTools.length).toBe(2);
      expect(fsTools.map(t => t.name)).toContain('fs_tool_one');
      expect(fsTools.map(t => t.name)).toContain('fs_tool_two');

      const shellTools = registry.getToolsByCategory(ToolCategory.SHELL);
      expect(shellTools.length).toBe(1);
    });

    it('should return category summary', async () => {
      const tools = [
        { name: 'tool_a', description: 'Tool A description', category: ToolCategory.AI, execute: () => {} },
        { name: 'tool_b', description: 'Tool B description', category: ToolCategory.AI, execute: () => {} },
        { name: 'tool_c', description: 'Tool C description', category: ToolCategory.NETWORK, execute: () => {} }
      ];

      for (const tool of tools) {
        await registry.registerTool(tool);
      }

      const summary = registry.getCategorySummary();
      expect(summary[ToolCategory.AI]).toBe(2);
      expect(summary[ToolCategory.NETWORK]).toBe(1);
    });
  });

  describe('Tool Execution', () => {
    it('should execute a simple tool', async () => {
      const tool = {
        name: 'simple_exec',
        description: 'Simple execution test tool',
        execute: async (input) => ({ received: input.value })
      };

      await registry.registerTool(tool);
      const result = await registry.executeTool('simple_exec', { value: 42 });
      expect(result.received).toBe(42);
    });

    it('should validate input against schema', async () => {
      const tool = {
        name: 'validated_tool',
        description: 'Tool with input validation schema',
        inputSchema: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 2 },
            count: { type: 'number', minimum: 0 }
          }
        },
        execute: async (input) => input
      };

      await registry.registerTool(tool);

      // Valid input should work
      const result = await registry.executeTool('validated_tool', { name: 'test', count: 5 });
      expect(result.name).toBe('test');

      // Missing required field should fail
      await expect(registry.executeTool('validated_tool', { count: 5 }))
        .rejects.toThrow(ToolValidationError);
    });

    it('should throw ToolNotFoundError for unknown tools', async () => {
      await expect(registry.executeTool('nonexistent_tool', {}))
        .rejects.toThrow(ToolNotFoundError);
    });

    it('should handle execution errors', async () => {
      const tool = {
        name: 'failing_tool',
        description: 'Tool that always fails',
        execute: async () => {
          throw new Error('Intentional failure');
        }
      };

      await registry.registerTool(tool);
      await expect(registry.executeTool('failing_tool', {}))
        .rejects.toThrow(ToolExecutionError);
    });

    it('should timeout long-running tools', async () => {
      const tool = {
        name: 'slow_tool',
        description: 'Tool that takes too long',
        timeout: 100, // 100ms timeout
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return 'done';
        }
      };

      await registry.registerTool(tool);
      await expect(registry.executeTool('slow_tool', {}))
        .rejects.toThrow(ToolTimeoutError);
    }, 2000);

    it('should retry retryable tools', async () => {
      let attempts = 0;
      const tool = {
        name: 'retryable_tool',
        description: 'Tool that fails then succeeds',
        retryable: true,
        maxRetries: 3,
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Not yet');
          }
          return 'success';
        }
      };

      await registry.registerTool(tool);
      const result = await registry.executeTool('retryable_tool', {});
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });
  });

  describe('Execution Hooks', () => {
    it('should run global before hooks', async () => {
      const hookCalls = [];

      const tool = {
        name: 'hooked_tool',
        description: 'Tool with hooks attached',
        execute: async () => 'result'
      };

      await registry.registerTool(tool);

      registry.onBeforeExecute((context) => {
        hookCalls.push({ type: 'before', tool: context.toolName });
      });

      await registry.executeTool('hooked_tool', {});
      expect(hookCalls).toHaveLength(1);
      expect(hookCalls[0].type).toBe('before');
    });

    it('should run global after hooks', async () => {
      const hookCalls = [];

      const tool = {
        name: 'after_hooked',
        description: 'Tool with after hook',
        execute: async () => 'result'
      };

      await registry.registerTool(tool);

      registry.onAfterExecute((context, result, error) => {
        hookCalls.push({ result, error });
      });

      await registry.executeTool('after_hooked', {});
      expect(hookCalls).toHaveLength(1);
      expect(hookCalls[0].result).toBe('result');
      expect(hookCalls[0].error).toBeNull();
    });

    it('should allow hooks to modify input', async () => {
      const tool = {
        name: 'input_modified',
        description: 'Tool with input modification',
        execute: async (input) => input.value
      };

      await registry.registerTool(tool);

      registry.onBeforeExecute((context) => {
        return {
          modifiedInput: { ...context.input, value: context.input.value * 2 }
        };
      });

      const result = await registry.executeTool('input_modified', { value: 21 });
      expect(result).toBe(42);
    });

    it('should allow hooks to abort execution', async () => {
      const tool = {
        name: 'abortable_tool',
        description: 'Tool that can be aborted',
        execute: async () => 'should not run'
      };

      await registry.registerTool(tool);

      registry.onBeforeExecute(() => {
        return { abort: true, abortReason: 'Blocked by policy' };
      });

      await expect(registry.executeTool('abortable_tool', {}))
        .rejects.toThrow('Blocked by policy');
    });

    it('should allow hooks to short-circuit with result', async () => {
      const tool = {
        name: 'cached_tool',
        description: 'Tool with hook-provided cache',
        execute: async () => 'fresh result'
      };

      await registry.registerTool(tool);

      registry.onBeforeExecute(() => {
        return { result: 'cached result' };
      });

      const result = await registry.executeTool('cached_tool', {});
      expect(result).toBe('cached result');
    });

    it('should support tool-specific hooks', async () => {
      const globalCalls = [];
      const specificCalls = [];

      const tool1 = { name: 'tool_one', description: 'First tool', execute: async () => 'one' };
      const tool2 = { name: 'tool_two', description: 'Second tool', execute: async () => 'two' };

      await registry.registerTool(tool1);
      await registry.registerTool(tool2);

      registry.onBeforeExecute(() => {
        globalCalls.push('global');
      });

      registry.onBeforeToolExecute('tool_one', () => {
        specificCalls.push('tool_one');
      });

      await registry.executeTool('tool_one', {});
      await registry.executeTool('tool_two', {});

      expect(globalCalls).toHaveLength(2);
      expect(specificCalls).toHaveLength(1);
    });

    it('should provide unregister function for hooks', async () => {
      const tool = { name: 'unregister_test', description: 'Hook unregister test', execute: async () => 'ok' };
      await registry.registerTool(tool);

      let hookCalled = false;
      const unregister = registry.onBeforeExecute(() => {
        hookCalled = true;
      });

      await registry.executeTool('unregister_test', {});
      expect(hookCalled).toBe(true);

      hookCalled = false;
      unregister();

      await registry.executeTool('unregister_test', {});
      expect(hookCalled).toBe(false);
    });
  });

  describe('Result Caching', () => {
    it('should cache results for cacheable tools', async () => {
      let callCount = 0;
      const tool = {
        name: 'cached_exec',
        description: 'Cacheable execution test',
        cacheable: true,
        cacheTTL: 10000,
        execute: async (input) => {
          callCount++;
          return { count: callCount, input };
        }
      };

      await registry.registerTool(tool);

      const result1 = await registry.executeTool('cached_exec', { key: 'value' });
      const result2 = await registry.executeTool('cached_exec', { key: 'value' });

      expect(result1.count).toBe(1);
      expect(result2.count).toBe(1); // Same as first - cached
      expect(callCount).toBe(1);
    });

    it('should not cache when inputs differ', async () => {
      let callCount = 0;
      const tool = {
        name: 'cache_diff_inputs',
        description: 'Cache with different inputs',
        cacheable: true,
        cacheTTL: 10000,
        execute: async (input) => {
          callCount++;
          return { count: callCount };
        }
      };

      await registry.registerTool(tool);

      await registry.executeTool('cache_diff_inputs', { key: 'a' });
      await registry.executeTool('cache_diff_inputs', { key: 'b' });

      expect(callCount).toBe(2);
    });

    it('should clear cache on demand', async () => {
      let callCount = 0;
      const tool = {
        name: 'clearable_cache',
        description: 'Cache that can be cleared',
        cacheable: true,
        cacheTTL: 10000,
        execute: async () => {
          callCount++;
          return callCount;
        }
      };

      await registry.registerTool(tool);

      await registry.executeTool('clearable_cache', {});
      await registry.executeTool('clearable_cache', {});
      expect(callCount).toBe(1);

      registry.clearCache('clearable_cache');

      await registry.executeTool('clearable_cache', {});
      expect(callCount).toBe(2);
    });

    it('should track cache statistics', async () => {
      const tool = {
        name: 'stats_cache',
        description: 'Cache statistics test',
        cacheable: true,
        cacheTTL: 10000,
        execute: async () => 'result'
      };

      await registry.registerTool(tool);

      await registry.executeTool('stats_cache', {});
      await registry.executeTool('stats_cache', {});

      const stats = registry.getToolStats('stats_cache');
      expect(stats.cacheHits).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track execution statistics', async () => {
      const tool = {
        name: 'stats_tool',
        description: 'Statistics tracking test',
        execute: async () => 'result'
      };

      await registry.registerTool(tool);

      await registry.executeTool('stats_tool', {});
      await registry.executeTool('stats_tool', {});

      const stats = registry.getToolStats('stats_tool');
      expect(stats.invocations).toBe(2);
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(0);
      expect(stats.avgDuration).toBeGreaterThan(0);
    });

    it('should track failures', async () => {
      const tool = {
        name: 'fail_stats',
        description: 'Failure statistics test',
        execute: async () => {
          throw new Error('Fail');
        }
      };

      await registry.registerTool(tool);

      try {
        await registry.executeTool('fail_stats', {});
      } catch { /* expected */ }

      const stats = registry.getToolStats('fail_stats');
      expect(stats.invocations).toBe(1);
      expect(stats.failures).toBe(1);
    });

    it('should reset statistics', async () => {
      const tool = {
        name: 'reset_stats',
        description: 'Reset statistics test',
        execute: async () => 'ok'
      };

      await registry.registerTool(tool);
      await registry.executeTool('reset_stats', {});

      registry.resetStats('reset_stats');

      const stats = registry.getToolStats('reset_stats');
      expect(stats.invocations).toBe(0);
      expect(stats.successes).toBe(0);
    });
  });

  describe('Tool Metadata', () => {
    it('should include custom metadata', async () => {
      const tool = {
        name: 'metadata_tool',
        description: 'Tool with custom metadata',
        metadata: {
          version: '2.1.0',
          author: 'Test Author',
          license: 'MIT',
          tags: ['test', 'example']
        },
        execute: async () => 'result'
      };

      await registry.registerTool(tool);
      const registered = registry.getToolSync('metadata_tool');

      expect(registered.metadata.version).toBe('2.1.0');
      expect(registered.metadata.author).toBe('Test Author');
      expect(registered.metadata.license).toBe('MIT');
      expect(registered.metadata.tags).toContain('test');
    });

    it('should include registration metadata', async () => {
      const tool = {
        name: 'auto_metadata',
        description: 'Tool with auto-generated metadata',
        execute: async () => 'result'
      };

      await registry.registerTool(tool, { source: 'test-file.js' });
      const registered = registry.getToolSync('auto_metadata');

      expect(registered.metadata.source).toBe('test-file.js');
      expect(registered.metadata.registeredAt).toBeDefined();
    });
  });

  describe('getAllTools', () => {
    it('should return tool information in correct format', async () => {
      const tool = {
        name: 'list_test',
        description: 'Tool for listing test',
        category: ToolCategory.UTILITY,
        dangerous: true,
        requiresConfirmation: true,
        inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
        execute: async () => 'result'
      };

      await registry.registerTool(tool);
      const allTools = registry.getAllTools();

      const found = allTools.find(t => t.name === 'list_test');
      expect(found).toBeDefined();
      expect(found.description).toBe('Tool for listing test');
      expect(found.category).toBe(ToolCategory.UTILITY);
      expect(found.dangerous).toBe(true);
      expect(found.requiresConfirmation).toBe(true);
      expect(found.inputSchema).toBeDefined();
      expect(found.metadata).toBeDefined();

      // Should not expose execute function
      expect(found.execute).toBeUndefined();
    });
  });
});
