/**
 * GrokCLI MCP Tools Definition
 *
 * Defines all available tools for the Grok MCP server
 * Compatible with Model Context Protocol specification
 */

import { CONFIG } from './config.js';

export const TOOLS = [
  // === GENERATION TOOLS ===
  {
    name: 'grok_generate',
    description: `Generate text using xAI Grok. Default model: ${CONFIG.DEFAULT_MODEL}. Supports Grok-3 and Grok-2 models with real-time information access.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate from'
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL}). Available: grok-3, grok-3-fast, grok-2-vision-1212`,
          default: CONFIG.DEFAULT_MODEL
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-2 (default: 0.7). Higher = more creative, lower = more deterministic',
          default: CONFIG.DEFAULT_TEMPERATURE,
          minimum: 0,
          maximum: 2
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate (default: 4096)',
          default: CONFIG.DEFAULT_MAX_TOKENS
        },
        systemPrompt: {
          type: 'string',
          description: 'Optional system prompt to set context'
        },
        topP: {
          type: 'number',
          description: 'Top-p sampling (nucleus sampling) 0-1',
          default: 1
        },
        frequencyPenalty: {
          type: 'number',
          description: 'Frequency penalty -2 to 2',
          default: 0
        },
        presencePenalty: {
          type: 'number',
          description: 'Presence penalty -2 to 2',
          default: 0
        }
      },
      required: ['prompt']
    }
  },

  // === CHAT TOOLS ===
  {
    name: 'grok_chat',
    description:
      'Multi-turn conversation with Grok. Maintains conversation context through message history. Supports system, user, and assistant roles.',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Array of message objects with role (system/user/assistant) and content',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                enum: ['system', 'user', 'assistant'],
                description: 'Message role'
              },
              content: {
                type: 'string',
                description: 'Message content'
              }
            },
            required: ['role', 'content']
          }
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-2 (default: 0.7)',
          default: CONFIG.DEFAULT_TEMPERATURE
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate',
          default: CONFIG.DEFAULT_MAX_TOKENS
        },
        stream: {
          type: 'boolean',
          description: 'Enable streaming response',
          default: false
        }
      },
      required: ['messages']
    }
  },

  // === REALTIME TOOLS ===
  {
    name: 'grok_realtime',
    description:
      "Query Grok for real-time information. Grok has access to current information from X (Twitter) and the web. Best for current events, trending topics, and up-to-date data.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Query for real-time information'
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens in response',
          default: CONFIG.DEFAULT_MAX_TOKENS
        }
      },
      required: ['query']
    }
  },

  // === CODE ANALYSIS TOOLS ===
  {
    name: 'grok_code_analyze',
    description:
      'Analyze code using Grok. Supports code review, security analysis, performance analysis, and refactoring suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to analyze'
        },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)',
          default: 'auto'
        },
        analysisType: {
          type: 'string',
          enum: ['review', 'security', 'performance', 'refactor'],
          description: 'Type of analysis to perform',
          default: 'review'
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        }
      },
      required: ['code']
    }
  },

  // === STATUS & UTILITY TOOLS ===
  {
    name: 'grok_status',
    description:
      'Get xAI Grok API status, available models, and server configuration. Use to check API connectivity and available features.',
    inputSchema: {
      type: 'object',
      properties: {
        includeModels: {
          type: 'boolean',
          description: 'Include list of available models',
          default: true
        }
      },
      required: []
    }
  },

  {
    name: 'grok_models',
    description: 'List all available Grok models with their details.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'grok_model_details',
    description: 'Get detailed information about a specific Grok model.',
    inputSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'Model ID to get details for'
        }
      },
      required: ['model']
    }
  },

  // === ADVANCED GENERATION TOOLS ===
  {
    name: 'grok_creative',
    description:
      'Generate creative content using Grok with optimized settings for creativity. Higher temperature and presence penalty for more diverse outputs.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Creative prompt'
        },
        style: {
          type: 'string',
          enum: ['story', 'poem', 'script', 'song', 'essay', 'free'],
          description: 'Creative writing style',
          default: 'free'
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate',
          default: 4096
        }
      },
      required: ['prompt']
    }
  },

  {
    name: 'grok_summarize',
    description:
      'Summarize text using Grok. Optimized for concise, accurate summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to summarize'
        },
        style: {
          type: 'string',
          enum: ['brief', 'detailed', 'bullet', 'executive'],
          description: 'Summary style',
          default: 'brief'
        },
        maxLength: {
          type: 'number',
          description: 'Maximum summary length in words',
          default: 200
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        }
      },
      required: ['text']
    }
  },

  {
    name: 'grok_translate',
    description: 'Translate text using Grok. Supports 100+ languages.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to translate'
        },
        targetLanguage: {
          type: 'string',
          description: 'Target language (e.g., "Spanish", "French", "Japanese")'
        },
        sourceLanguage: {
          type: 'string',
          description: 'Source language (auto-detected if not specified)',
          default: 'auto'
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        }
      },
      required: ['text', 'targetLanguage']
    }
  },

  // === HYDRA INTEGRATION TOOLS ===
  {
    name: 'grok_health',
    description:
      'Get comprehensive health status of the Grok MCP server including API connectivity, configuration, and features.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'grok_config',
    description:
      'Get current Grok MCP server configuration (API keys are masked).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  // === WEBSOCKET HANDLER TOOLS ===
  {
    name: 'grok_ws_connect',
    description: 'Connect to xAI Grok WebSocket for real-time communication. Supports auto-reconnect and heartbeat.',
    inputSchema: {
      type: 'object',
      properties: {
        maxReconnectAttempts: {
          type: 'number',
          description: 'Maximum reconnection attempts (default: 5)',
          default: 5
        },
        heartbeatInterval: {
          type: 'number',
          description: 'Heartbeat interval in ms (default: 30000)',
          default: 30000
        }
      },
      required: []
    }
  },
  {
    name: 'grok_ws_disconnect',
    description: 'Disconnect from xAI Grok WebSocket.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'number',
          description: 'Close code (default: 1000)',
          default: 1000
        },
        reason: {
          type: 'string',
          description: 'Close reason',
          default: 'Client disconnect'
        }
      },
      required: []
    }
  },
  {
    name: 'grok_ws_send',
    description: 'Send a message through the WebSocket connection. Requires grok_ws_connect first.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to send (string or JSON object as string)'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'grok_ws_status',
    description: 'Get WebSocket connection status and statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'grok_stream',
    description: 'Stream text generation from Grok. For real-time bidirectional streaming, use grok_ws_* tools.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate from'
        },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-2 (default: 0.7)',
          default: 0.7
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate',
          default: 4096
        },
        systemPrompt: {
          type: 'string',
          description: 'Optional system prompt'
        }
      },
      required: ['prompt']
    }
  }
];

/**
 * Get tool by name
 * @param {string} name - Tool name
 * @returns {Object|undefined} Tool definition or undefined
 */
export const getToolByName = (name) => {
  return TOOLS.find((tool) => tool.name === name);
};

/**
 * Validate tool arguments
 * @param {Object} tool - Tool definition
 * @param {Object} args - Arguments to validate
 * @returns {Array<string>} Validation errors
 */
export const validateToolArgs = (tool, args) => {
  const errors = [];

  if (!tool?.inputSchema) return errors;

  const { required = [], properties = {} } = tool.inputSchema;

  // Check required fields
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      errors.push(`Missing required field: ${key}`);
    }
  }

  // Check types
  for (const [key, value] of Object.entries(args)) {
    const schema = properties[key];
    if (!schema || value === null || value === undefined) continue;

    const expected = schema.type;

    if (expected === 'array' && !Array.isArray(value)) {
      errors.push(`Field ${key} should be an array`);
    } else if (expected === 'number' && typeof value !== 'number') {
      errors.push(`Field ${key} should be a number`);
    } else if (expected === 'string' && typeof value !== 'string') {
      errors.push(`Field ${key} should be a string`);
    } else if (expected === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Field ${key} should be a boolean`);
    } else if (
      expected === 'object' &&
      (typeof value !== 'object' || Array.isArray(value))
    ) {
      errors.push(`Field ${key} should be an object`);
    }

    // Check enum values
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`Field ${key} must be one of: ${schema.enum.join(', ')}`);
    }

    // Check number ranges
    if (expected === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`Field ${key} must be at least ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`Field ${key} must be at most ${schema.maximum}`);
      }
    }
  }

  return errors;
};

export default TOOLS;
