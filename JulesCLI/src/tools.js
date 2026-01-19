/**
 * Jules CLI MCP Tools
 * Tool definitions for the Jules async coding agent
 */

import { CONFIG } from './config.js';

export const TOOLS = [
  // === TASK DELEGATION TOOLS ===
  {
    name: 'jules_delegate',
    description: 'Delegate an async task to Jules. The task runs in background and can be checked with jules_status.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the task to delegate'
        },
        type: {
          type: 'string',
          enum: ['code-generation', 'test-generation', 'refactoring', 'documentation', 'bug-fix', 'general'],
          description: 'Type of task (default: general)',
          default: 'general'
        },
        priority: {
          type: 'number',
          enum: [1, 2, 3, 4, 5],
          description: 'Priority: 1=urgent, 2=high, 3=normal, 4=low, 5=background',
          default: 3
        },

        repo: {
          type: 'string',
          description: 'Target repository (format: owner/repo)'
        },
        branch: {
          type: 'string',
          description: 'Target branch for the task'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata for the task'
        }
      },
      required: ['description']
    }
  },

  {
    name: 'jules_status',
    description: 'Get the status of a delegated task by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID returned from jules_delegate'
        }
      },
      required: ['taskId']
    }
  },

  {
    name: 'jules_list_tasks',

    description: 'List all delegated tasks with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'queued', 'running', 'completed', 'failed', 'cancelled'],
          description: 'Filter by status'
        },
        type: {
          type: 'string',
          description: 'Filter by task type'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default: 20)',
          default: 20
        }
      },
      required: []
    }
  },

  {
    name: 'jules_cancel',
    description: 'Cancel a running or pending task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to cancel'
        }
      },
      required: ['taskId']
    }
  },


  {
    name: 'jules_clear',
    description: 'Clear completed, failed, or cancelled tasks older than specified hours.',
    inputSchema: {
      type: 'object',
      properties: {
        olderThanHours: {
          type: 'number',
          description: `Hours threshold for clearing tasks (default: ${CONFIG.TASK_RETENTION_HOURS})`,
          default: CONFIG.TASK_RETENTION_HOURS
        }
      },
      required: []
    }
  },

  // === GITHUB INTEGRATION TOOLS ===
  {
    name: 'jules_github_issue',
    description: 'Create a GitHub issue. Requires GITHUB_TOKEN to be configured.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Issue title'
        },
        body: {
          type: 'string',
          description: 'Issue body/description'
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply to the issue'
        },

        owner: {
          type: 'string',
          description: 'Repository owner (uses default if not specified)'
        },
        repo: {
          type: 'string',
          description: 'Repository name (uses default if not specified)'
        }
      },
      required: ['title', 'body']
    }
  },

  {
    name: 'jules_github_pr',
    description: 'Create a GitHub Pull Request. Requires GITHUB_TOKEN to be configured.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'PR title'
        },
        body: {
          type: 'string',
          description: 'PR description'
        },
        head: {
          type: 'string',
          description: 'Head branch (the branch with changes)'
        },
        base: {
          type: 'string',
          description: 'Base branch (default: main)',
          default: 'main'
        },

        owner: {
          type: 'string',
          description: 'Repository owner (uses default if not specified)'
        },
        repo: {
          type: 'string',
          description: 'Repository name (uses default if not specified)'
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR',
          default: false
        }
      },
      required: ['title', 'body', 'head']
    }
  },

  // === HEALTH & CONFIG TOOLS ===
  {
    name: 'jules_health',
    description: 'Get Jules service health status and task statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'jules_config',
    description: 'Get current Jules configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  // === ASYNC HANDLER TOOLS ===
  {
    name: 'jules_submit_task',
    description: 'Submit an async task to the Jules handler queue with priority and timeout support.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Task description'
        },
        type: {
          type: 'string',
          enum: ['code-generation', 'test-generation', 'refactoring', 'documentation', 'bug-fix', 'general'],
          description: 'Task type (default: general)',
          default: 'general'
        },
        priority: {
          type: 'number',
          enum: [1, 2, 3, 4, 5],
          description: 'Priority: 1=urgent, 2=high, 3=normal, 4=low, 5=background',
          default: 3
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata for the task'
        },
        timeout: {
          type: 'number',
          description: 'Task timeout in ms (default: from config)'
        }
      },
      required: ['description']
    }
  },
  {
    name: 'jules_get_status',
    description: 'Get detailed status of a submitted task by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID'
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'jules_get_result',
    description: 'Get the result of a completed task. Returns error if task is not completed.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID'
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'jules_cancel_task',
    description: 'Cancel a pending or running task in the handler queue.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to cancel'
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'jules_queue_stats',
    description: 'Get async handler queue statistics and health information.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'jules_list_handler_tasks',
    description: 'List tasks in the async handler with filtering options.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
          description: 'Filter by status'
        },
        type: {
          type: 'string',
          description: 'Filter by task type'
        },
        limit: {
          type: 'number',
          description: 'Maximum tasks to return (default: 50)',
          default: 50
        }
      },
      required: []
    }
  },
  {
    name: 'jules_register_webhook',
    description: 'Register a webhook to receive task completion notifications.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique webhook ID'
        },
        url: {
          type: 'string',
          description: 'Webhook URL to receive POST notifications'
        },
        events: {
          type: 'array',
          items: { type: 'string' },
          description: 'Events to subscribe to: completed, failed, cancelled, progress, * (all)',
          default: ['*']
        },
        secret: {
          type: 'string',
          description: 'Optional secret for webhook signature verification'
        },
        headers: {
          type: 'object',
          description: 'Optional custom headers to include in webhook requests'
        }
      },
      required: ['id', 'url']
    }
  },
  {
    name: 'jules_list_webhooks',
    description: 'List all registered webhooks.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];
