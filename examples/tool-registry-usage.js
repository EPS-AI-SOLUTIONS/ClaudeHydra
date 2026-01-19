/**
 * Tool Registry Usage Examples
 *
 * This file demonstrates the advanced features of the refactored ToolRegistry:
 * - Lazy loading
 * - Custom tool registration with metadata
 * - Categories and grouping
 * - Execution hooks
 * - Result caching
 * - Statistics and monitoring
 */

import registry, { ToolRegistry, ToolCategory } from '../src/tool-registry.js';
import Logger from '../src/logger.js';

// ============================================================================
// Example 1: Basic Tool Registration and Execution
// ============================================================================

async function basicUsageExample() {
  console.log('\n=== Example 1: Basic Tool Registration ===\n');

  // Define a simple tool
  const greetTool = {
    name: 'greet_user',
    description: 'Greets a user by name with a friendly message',
    category: ToolCategory.UTILITY,
    metadata: {
      version: '1.0.0',
      author: 'Example Author',
      tags: ['greeting', 'utility', 'user']
    },
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, description: 'Name of the user' },
        formal: { type: 'boolean', default: false, description: 'Use formal greeting' }
      }
    },
    execute: async ({ name, formal = false }) => {
      const greeting = formal ? `Good day, ${name}.` : `Hey ${name}!`;
      return { greeting, formal };
    }
  };

  // Register the tool
  await registry.registerTool(greetTool);
  console.log('Tool registered:', greetTool.name);

  // Execute the tool
  const result = await registry.executeTool('greet_user', { name: 'Alice' });
  console.log('Result:', result);

  // Execute with different input
  const formalResult = await registry.executeTool('greet_user', {
    name: 'Dr. Smith',
    formal: true
  });
  console.log('Formal result:', formalResult);
}

// ============================================================================
// Example 2: Tools with Caching
// ============================================================================

async function cachingExample() {
  console.log('\n=== Example 2: Result Caching ===\n');

  let apiCallCount = 0;

  const cachedApiTool = {
    name: 'fetch_weather',
    description: 'Fetches weather data for a city (simulated with cache)',
    category: ToolCategory.NETWORK,
    cacheable: true,
    cacheTTL: 60000, // Cache for 1 minute
    inputSchema: {
      type: 'object',
      required: ['city'],
      properties: {
        city: { type: 'string', description: 'City name' }
      }
    },
    execute: async ({ city }) => {
      apiCallCount++;
      console.log(`  [API Call #${apiCallCount}] Fetching weather for ${city}...`);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 100));

      return {
        city,
        temperature: Math.round(15 + Math.random() * 20),
        condition: ['Sunny', 'Cloudy', 'Rainy'][Math.floor(Math.random() * 3)],
        fetchedAt: new Date().toISOString()
      };
    }
  };

  await registry.registerTool(cachedApiTool);

  // First call - will hit the "API"
  console.log('First call (cache miss):');
  const result1 = await registry.executeTool('fetch_weather', { city: 'London' });
  console.log('  Result:', result1);

  // Second call with same input - will use cache
  console.log('\nSecond call (cache hit):');
  const result2 = await registry.executeTool('fetch_weather', { city: 'London' });
  console.log('  Result:', result2);

  // Different city - cache miss
  console.log('\nDifferent city (cache miss):');
  const result3 = await registry.executeTool('fetch_weather', { city: 'Paris' });
  console.log('  Result:', result3);

  console.log(`\nTotal API calls: ${apiCallCount} (should be 2, not 3)`);

  // Show cache stats
  const cacheStats = registry.getCacheStats();
  console.log('Cache stats:', cacheStats);
}

// ============================================================================
// Example 3: Execution Hooks
// ============================================================================

async function hooksExample() {
  console.log('\n=== Example 3: Execution Hooks ===\n');

  // Create a fresh registry for this example
  const hookRegistry = new ToolRegistry();

  // Register a simple calculation tool
  await hookRegistry.registerTool({
    name: 'calculate',
    description: 'Performs basic arithmetic calculations',
    category: ToolCategory.UTILITY,
    inputSchema: {
      type: 'object',
      required: ['a', 'b', 'operation'],
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
        operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] }
      }
    },
    execute: async ({ a, b, operation }) => {
      switch (operation) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        case 'multiply': return a * b;
        case 'divide': return b !== 0 ? a / b : 'Error: Division by zero';
        default: throw new Error(`Unknown operation: ${operation}`);
      }
    }
  });

  // Global logging hook
  hookRegistry.onBeforeExecute((context) => {
    console.log(`[LOG] Executing ${context.toolName} with input:`, context.input);
  });

  hookRegistry.onAfterExecute((context, result, error) => {
    const duration = Date.now() - context.startTime;
    if (error) {
      console.log(`[LOG] ${context.toolName} FAILED after ${duration}ms:`, error.message);
    } else {
      console.log(`[LOG] ${context.toolName} completed in ${duration}ms, result:`, result);
    }
  });

  // Input transformation hook - add audit trail
  hookRegistry.onBeforeExecute((context) => {
    return {
      modifiedInput: {
        ...context.input,
        _auditId: context.executionId,
        _timestamp: context.startTime
      }
    };
  });

  // Execute with hooks
  console.log('Executing with hooks:');
  const result = await hookRegistry.executeTool('calculate', {
    a: 10,
    b: 5,
    operation: 'multiply'
  });
  console.log('Final result:', result);

  // Hook that can abort execution
  console.log('\nDemo: Hook that blocks division by zero before execution:');

  const unblock = hookRegistry.onBeforeToolExecute('calculate', (context) => {
    if (context.input.operation === 'divide' && context.input.b === 0) {
      return {
        abort: true,
        abortReason: 'Division by zero detected - operation blocked'
      };
    }
  });

  try {
    await hookRegistry.executeTool('calculate', { a: 10, b: 0, operation: 'divide' });
  } catch (err) {
    console.log('Caught error:', err.message);
  }

  unblock(); // Remove the blocking hook
  hookRegistry.shutdown();
}

// ============================================================================
// Example 4: Categories and Discovery
// ============================================================================

async function categoriesExample() {
  console.log('\n=== Example 4: Categories and Discovery ===\n');

  const catRegistry = new ToolRegistry();

  // Register tools in different categories
  const tools = [
    {
      name: 'read_json',
      description: 'Reads and parses a JSON file from disk',
      category: ToolCategory.FILESYSTEM,
      execute: async () => ({})
    },
    {
      name: 'write_json',
      description: 'Writes data to a JSON file on disk',
      category: ToolCategory.FILESYSTEM,
      dangerous: true,
      execute: async () => ({})
    },
    {
      name: 'run_command',
      description: 'Executes a shell command in the terminal',
      category: ToolCategory.SHELL,
      dangerous: true,
      requiresConfirmation: true,
      execute: async () => ({})
    },
    {
      name: 'http_get',
      description: 'Makes an HTTP GET request to a URL',
      category: ToolCategory.NETWORK,
      execute: async () => ({})
    },
    {
      name: 'generate_text',
      description: 'Generates text using AI model',
      category: ToolCategory.AI,
      execute: async () => ({})
    }
  ];

  for (const tool of tools) {
    await catRegistry.registerTool(tool);
  }

  // Get category summary
  console.log('Category Summary:');
  const summary = catRegistry.getCategorySummary();
  for (const [category, count] of Object.entries(summary)) {
    if (count > 0) {
      console.log(`  ${category}: ${count} tools`);
    }
  }

  // Get tools by category
  console.log('\nFilesystem tools:');
  const fsTools = catRegistry.getToolsByCategory(ToolCategory.FILESYSTEM);
  fsTools.forEach(t => console.log(`  - ${t.name}: ${t.description}`));

  // Get dangerous tools
  console.log('\nDangerous tools (require caution):');
  const allTools = catRegistry.getAllTools();
  const dangerousTools = allTools.filter(t => t.dangerous);
  dangerousTools.forEach(t => console.log(`  - ${t.name} [${t.category}]`));

  catRegistry.shutdown();
}

// ============================================================================
// Example 5: Statistics and Monitoring
// ============================================================================

async function statisticsExample() {
  console.log('\n=== Example 5: Statistics and Monitoring ===\n');

  const statsRegistry = new ToolRegistry();

  // Fast tool
  await statsRegistry.registerTool({
    name: 'fast_operation',
    description: 'A fast operation for testing',
    category: ToolCategory.UTILITY,
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'fast';
    }
  });

  // Slow tool
  await statsRegistry.registerTool({
    name: 'slow_operation',
    description: 'A slow operation for testing',
    category: ToolCategory.UTILITY,
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'slow';
    }
  });

  // Sometimes failing tool
  let failCounter = 0;
  await statsRegistry.registerTool({
    name: 'flaky_operation',
    description: 'An operation that sometimes fails',
    category: ToolCategory.UTILITY,
    execute: async () => {
      failCounter++;
      if (failCounter % 3 === 0) {
        throw new Error('Random failure');
      }
      return 'success';
    }
  });

  // Execute multiple times
  console.log('Executing tools multiple times...');

  for (let i = 0; i < 5; i++) {
    await statsRegistry.executeTool('fast_operation', {});
  }

  for (let i = 0; i < 3; i++) {
    await statsRegistry.executeTool('slow_operation', {});
  }

  for (let i = 0; i < 6; i++) {
    try {
      await statsRegistry.executeTool('flaky_operation', {});
    } catch { /* expected failures */ }
  }

  // Display statistics
  console.log('\nTool Statistics:');
  const allStats = statsRegistry.getAllStats();

  for (const [name, stats] of Object.entries(allStats)) {
    console.log(`\n  ${name}:`);
    console.log(`    Invocations: ${stats.invocations}`);
    console.log(`    Successes: ${stats.successes}`);
    console.log(`    Failures: ${stats.failures}`);
    console.log(`    Avg Duration: ${stats.avgDuration.toFixed(2)}ms`);
    console.log(`    Cache Hits: ${stats.cacheHits}`);
  }

  statsRegistry.shutdown();
}

// ============================================================================
// Example 6: Retryable Tools
// ============================================================================

async function retryExample() {
  console.log('\n=== Example 6: Retryable Tools ===\n');

  const retryRegistry = new ToolRegistry();

  let attempts = 0;
  await retryRegistry.registerTool({
    name: 'unreliable_api',
    description: 'An API call that fails intermittently',
    category: ToolCategory.NETWORK,
    retryable: true,
    maxRetries: 3,
    timeout: 5000,
    execute: async () => {
      attempts++;
      console.log(`  Attempt ${attempts}...`);

      if (attempts < 3) {
        throw new Error('Service temporarily unavailable');
      }

      return { status: 'success', attempts };
    }
  });

  console.log('Calling unreliable API (will retry on failure):');
  try {
    const result = await retryRegistry.executeTool('unreliable_api', {});
    console.log('Final result:', result);
  } catch (err) {
    console.log('All retries exhausted:', err.message);
  }

  retryRegistry.shutdown();
}

// ============================================================================
// Example 7: Integration with Existing BaseTool Classes
// ============================================================================

async function integrationExample() {
  console.log('\n=== Example 7: BaseTool Integration Pattern ===\n');

  // This shows how to adapt existing BaseTool classes for the registry

  // Note: This is a conceptual example showing the integration pattern
  console.log('The new ToolRegistry is backward-compatible with existing tools.');
  console.log('Tools exported as arrays from tool files work seamlessly.');
  console.log('\nExample integration:');
  console.log(`
  // In your tool file (e.g., src/tools/my-tool.js):
  import { BaseTool } from './base-tool.js';

  class MyTool extends BaseTool {
    constructor() {
      super({
        name: 'my_tool',
        description: 'A custom tool',
        inputSchema: myZodSchema
      });
    }

    async run(input) {
      return { result: 'done' };
    }
  }

  // Export in legacy format for registry compatibility
  const tool = new MyTool();
  export default [{
    name: tool.name,
    description: tool.description,
    category: 'custom',  // <-- Add category for the new registry
    metadata: { version: '1.0.0', author: 'Me' },  // <-- Add metadata
    inputSchema: tool.getJsonSchema(),
    execute: (input) => tool.execute(input)
  }];
  `);
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  console.log('='.repeat(60));
  console.log('  Tool Registry Usage Examples');
  console.log('='.repeat(60));

  try {
    await basicUsageExample();
    await cachingExample();
    await hooksExample();
    await categoriesExample();
    await statisticsExample();
    await retryExample();
    await integrationExample();

    console.log('\n' + '='.repeat(60));
    console.log('  All examples completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Example failed:', error);
  } finally {
    // Cleanup the main registry
    registry.shutdown();
  }
}

// Run if executed directly
runAllExamples().catch(console.error);
