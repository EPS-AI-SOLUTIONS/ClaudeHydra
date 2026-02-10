import fs from 'node:fs'; // Needed for package.json read
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Logger from './logger.js';
import ToolRegistry from './tool-registry.js';

// Initialize System
Logger.info('Initializing GeminiCLI (HYDRA) MCP Server...');

// Load Tools
await ToolRegistry.loadTools();

// Read package.json for version (ESM way)
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));

const server = new Server(
  {
    name: 'hydra-mcp-server',
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Handler for listing available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = ToolRegistry.getAllTools();
  return {
    tools: tools,
  };
});

/**
 * Handler for executing tools
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  Logger.info(`Tool request received: ${name}`, { args });

  const tool = await ToolRegistry.getTool(name);

  if (!tool) {
    Logger.warn(`Tool not found: ${name}`);
    throw new Error(`Tool not found: ${name}`);
  }

  try {
    const result = await tool.execute(args);

    // Normalize result to MCP format
    let content = [];
    if (typeof result === 'string') {
      content = [{ type: 'text', text: result }];
    } else if (result.content && Array.isArray(result.content)) {
      content = result.content; // Already formatted
    } else {
      content = [{ type: 'text', text: JSON.stringify(result, null, 2) }];
    }

    Logger.info(`Tool execution successful: ${name}`);
    return { content };
  } catch (error) {
    Logger.error(`Tool execution failed: ${name}`, { error: error.message, stack: error.stack });

    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

import { fileURLToPath } from 'node:url';

/**
 * Start the Server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  Logger.info('GeminiCLI MCP Server running on Stdio');
}

// Only run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    Logger.error('Fatal Server Error', { error: error.message });
    process.exit(1);
  });
}
