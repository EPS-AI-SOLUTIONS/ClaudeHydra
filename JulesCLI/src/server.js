#!/usr/bin/env node
/**
 * Jules CLI MCP Server
 * 
 * Google Async Coding Agent integration for HYDRA.
 * Provides async task delegation, status tracking, and GitHub integration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  delegateTask,
  getTaskStatus,
  listTasks,
  cancelTask,
  clearTasks,
  createGitHubIssue,
  createGitHubPR,
  checkHealth,
  getConfig
} from './jules-client.js';
import { TOOLS } from './tools.js';
import { createLogger } from './logger.js';
import { CONFIG } from './config.js';
import { JulesAsyncHandler, HandlerStatus, TaskType } from './jules-handler.js';

const logger = createLogger('server');
const SERVER_VERSION = '1.0.0';

// Jules Async Handler instance
let asyncHandler = null;

// Server instance
const server = new Server(
  {
    name: 'jules-hydra',
    version: SERVER_VERSION
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const toolByName = new Map(TOOLS.map((tool) => [tool.name, tool]));

/**
 * Create error response
 */
const createErrorResponse = (code, message, tool) => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message, code, tool })
      }
    ],
    isError: true
  };
};

/**
 * Validate tool arguments
 */
const validateToolArgs = (tool, args) => {

  const errors = [];
  if (!tool?.inputSchema) return errors;
  
  const { required = [], properties = {} } = tool.inputSchema;
  
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      errors.push(`Missing required field: ${key}`);
    }
  }
  
  for (const [key, value] of Object.entries(args)) {
    const schema = properties[key];
    if (!schema || value === null) continue;
    
    const expected = schema.type;
    if (expected === 'array' && !Array.isArray(value)) {
      errors.push(`Field ${key} should be an array`);
    } else if (expected === 'number' && typeof value !== 'number') {
      errors.push(`Field ${key} should be a number`);
    } else if (expected === 'string' && typeof value !== 'string') {
      errors.push(`Field ${key} should be a string`);
    } else if (expected === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Field ${key} should be a boolean`);
    } else if (expected === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push(`Field ${key} should be an object`);
    }
  }
  
  return errors;
};


// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params ?? {};
  const startedAt = Date.now();
  const safeArgs = args ?? {};
  const tool = toolByName.get(name);

  try {
    if (!tool) {
      return createErrorResponse('JULES_TOOL_UNKNOWN', 'Unknown tool.', name);
    }

    const validationErrors = validateToolArgs(tool, safeArgs);
    if (validationErrors.length > 0) {
      return createErrorResponse(
        'JULES_TOOL_INVALID',
        validationErrors.join(' '),
        name
      );
    }

    let result;

    switch (name) {
      // === TASK DELEGATION ===
      case 'jules_delegate': {

        result = await delegateTask(safeArgs.description, {
          type: safeArgs.type || 'general',
          priority: safeArgs.priority || 3,
          repo: safeArgs.repo,
          branch: safeArgs.branch,
          metadata: safeArgs.metadata || {}
        });
        break;
      }

      case 'jules_status': {
        result = getTaskStatus(safeArgs.taskId);
        break;
      }

      case 'jules_list_tasks': {
        result = listTasks({
          status: safeArgs.status,
          type: safeArgs.type,
          limit: safeArgs.limit || 20
        });
        break;
      }

      case 'jules_cancel': {
        result = cancelTask(safeArgs.taskId);
        break;
      }

      case 'jules_clear': {
        result = clearTasks({
          olderThanHours: safeArgs.olderThanHours || CONFIG.TASK_RETENTION_HOURS
        });
        break;
      }


      // === GITHUB INTEGRATION ===
      case 'jules_github_issue': {
        result = await createGitHubIssue({
          title: safeArgs.title,
          body: safeArgs.body,
          labels: safeArgs.labels || [],
          owner: safeArgs.owner,
          repo: safeArgs.repo
        });
        break;
      }

      case 'jules_github_pr': {
        result = await createGitHubPR({
          title: safeArgs.title,
          body: safeArgs.body,
          head: safeArgs.head,
          base: safeArgs.base || 'main',
          owner: safeArgs.owner,
          repo: safeArgs.repo,
          draft: safeArgs.draft || false
        });
        break;
      }

      // === HEALTH & CONFIG ===
      case 'jules_health': {
        result = await checkHealth();
        result.version = SERVER_VERSION;
        result.apiVersion = CONFIG.API_VERSION;
        break;
      }

      case 'jules_config': {
        result = getConfig();
        break;
      }

      // === ASYNC HANDLER TOOLS ===
      case 'jules_submit_task': {
        if (!asyncHandler) {
          return createErrorResponse(
            'JULES_HANDLER_NOT_READY',
            'JulesAsyncHandler not initialized.',
            name
          );
        }

        result = await asyncHandler.submitTask({
          description: safeArgs.description,
          type: safeArgs.type || TaskType.GENERAL,
          priority: safeArgs.priority || 3,
          metadata: safeArgs.metadata || {},
          timeout: safeArgs.timeout
        });
        break;
      }

      case 'jules_get_status': {
        if (!asyncHandler) {
          return createErrorResponse(
            'JULES_HANDLER_NOT_READY',
            'JulesAsyncHandler not initialized.',
            name
          );
        }

        result = await asyncHandler.getTaskStatus(safeArgs.taskId);
        break;
      }

      case 'jules_get_result': {
        if (!asyncHandler) {
          return createErrorResponse(
            'JULES_HANDLER_NOT_READY',
            'JulesAsyncHandler not initialized.',
            name
          );
        }

        result = await asyncHandler.getTaskResult(safeArgs.taskId);
        break;
      }

      case 'jules_cancel_task': {
        if (!asyncHandler) {
          return createErrorResponse(
            'JULES_HANDLER_NOT_READY',
            'JulesAsyncHandler not initialized.',
            name
          );
        }

        result = await asyncHandler.cancelTask(safeArgs.taskId);
        break;
      }

      case 'jules_queue_stats': {
        if (!asyncHandler) {
          result = {
            initialized: false,
            message: 'JulesAsyncHandler not initialized'
          };
          break;
        }

        result = {
          initialized: true,
          queueStats: asyncHandler.getQueueStats(),
          health: asyncHandler.getHealth()
        };
        break;
      }

      case 'jules_list_handler_tasks': {
        if (!asyncHandler) {
          return createErrorResponse(
            'JULES_HANDLER_NOT_READY',
            'JulesAsyncHandler not initialized.',
            name
          );
        }

        result = asyncHandler.listTasks({
          status: safeArgs.status,
          type: safeArgs.type,
          limit: safeArgs.limit || 50
        });
        break;
      }

      case 'jules_register_webhook': {
        if (!asyncHandler) {
          return createErrorResponse(
            'JULES_HANDLER_NOT_READY',
            'JulesAsyncHandler not initialized.',
            name
          );
        }

        result = asyncHandler.registerWebhook({
          id: safeArgs.id,
          url: safeArgs.url,
          events: safeArgs.events || ['*'],
          secret: safeArgs.secret,
          headers: safeArgs.headers || {}
        });
        break;
      }

      case 'jules_list_webhooks': {
        if (!asyncHandler) {
          result = {
            initialized: false,
            message: 'JulesAsyncHandler not initialized',
            webhooks: []
          };
          break;
        }

        result = {
          initialized: true,
          webhooks: asyncHandler.listWebhooks()
        };
        break;
      }

      default:
        return createErrorResponse('JULES_TOOL_UNKNOWN', 'Unknown tool.', name);
    }

    logger.info('Tool executed', {
      tool: name,
      durationMs: Date.now() - startedAt
    });

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    logger.error('Tool execution failed', { tool: name, error: error.message });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Execution error: ${error.message}`,
            tool: name
          })
        }
      ],
      isError: true
    };
  }
});


// Start server
async function main() {
  const transport = new StdioServerTransport();

  logger.info('Starting Jules MCP Server', {
    version: SERVER_VERSION,
    mode: CONFIG.SIMULATION_MODE ? 'simulation' : 'live',
    github: CONFIG.GITHUB_TOKEN ? 'configured' : 'not configured'
  });

  // Initialize JulesAsyncHandler
  try {
    asyncHandler = new JulesAsyncHandler({
      githubToken: CONFIG.GITHUB_TOKEN,
      githubOwner: CONFIG.GITHUB_DEFAULT_OWNER,
      githubRepo: CONFIG.GITHUB_DEFAULT_REPO,
      maxConcurrent: CONFIG.TASK_MAX_CONCURRENT,
      defaultTimeout: CONFIG.TASK_DEFAULT_TIMEOUT_MS,
      pollInterval: CONFIG.TASK_POLL_INTERVAL_MS,
      simulationMode: CONFIG.SIMULATION_MODE
    });

    // Set up event handlers
    asyncHandler.on('taskCompleted', ({ taskId, status }) => {
      logger.info('Async task completed', { taskId, status });
    });

    asyncHandler.on('taskProgress', ({ taskId, progress }) => {
      logger.debug('Async task progress', { taskId, progress });
    });

    logger.info('JulesAsyncHandler initialized', {
      maxConcurrent: CONFIG.TASK_MAX_CONCURRENT,
      simulationMode: CONFIG.SIMULATION_MODE
    });
  } catch (handlerError) {
    logger.error('Failed to initialize JulesAsyncHandler', {
      error: handlerError.message
    });
  }

  await server.connect(transport);

  logger.info('Jules MCP Server running on stdio', {
    version: SERVER_VERSION,
    tools: TOOLS.length
  });
}

main().catch((error) => {
  logger.error('Server failed to start', { error: error.message });
  process.exit(1);
});
