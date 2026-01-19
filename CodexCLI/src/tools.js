/**
 * CodexCLI MCP Tool Definitions
 * Tool schemas for OpenAI integration via Model Context Protocol
 */

import { CONFIG } from './config.js';

export const TOOLS = [
  // === GENERATION TOOLS ===
  {
    name: 'codex_generate',
    description: `Generate text using OpenAI GPT models (default: ${CONFIG.DEFAULT_MODEL}). Supports system prompts, conversation history, and various generation parameters.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate from'
        },
        model: {
          type: 'string',
          description: `Model to use (default: ${CONFIG.DEFAULT_MODEL}). Options: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1-preview, o1-mini`,
          default: CONFIG.DEFAULT_MODEL
        },
        systemPrompt: {
          type: 'string',
          description: 'System prompt to set context',
          default: 'You are a helpful AI assistant.'
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-2 (default: 0.3). Lower = more focused, higher = more creative',
          default: 0.3,
          minimum: 0,
          maximum: 2
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate (default: 4096)',
          default: 4096
        },
        topP: {
          type: 'number',
          description: 'Top-p sampling (default: 1)',
          default: 1,
          minimum: 0,
          maximum: 1
        },
        frequencyPenalty: {
          type: 'number',
          description: 'Frequency penalty -2 to 2 (default: 0)',
          default: 0,
          minimum: -2,
          maximum: 2
        },
        presencePenalty: {
          type: 'number',
          description: 'Presence penalty -2 to 2 (default: 0)',
          default: 0,
          minimum: -2,
          maximum: 2
        },
        stop: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stop sequences (up to 4)'
        },
        responseFormat: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'Response format (default: text)',
          default: 'text'
        }
      },
      required: ['prompt']
    }
  },

  {
    name: 'codex_stream',
    description: 'Generate text with streaming output. Returns chunks as they are generated.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate from'
        },
        model: {
          type: 'string',
          description: `Model to use (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        systemPrompt: {
          type: 'string',
          description: 'System prompt to set context'
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-2 (default: 0.3)',
          default: 0.3
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

  // === CODE TOOLS ===
  {
    name: 'codex_code',
    description: `Generate code with automatic self-correction and validation. Uses ${CONFIG.CODER_MODEL} for code generation with up to 3 correction attempts.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Code generation prompt describing what you want to build'
        },
        language: {
          type: 'string',
          description: 'Target programming language (auto-detected if not specified)',
          enum: ['javascript', 'typescript', 'python', 'java', 'rust', 'go', 'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'html', 'css', 'json', 'yaml', 'shell', 'powershell']
        },
        model: {
          type: 'string',
          description: `Code generation model (default: ${CONFIG.CODER_MODEL})`,
          default: CONFIG.CODER_MODEL
        },
        maxAttempts: {
          type: 'number',
          description: 'Max self-correction attempts (default: 3)',
          default: 3,
          minimum: 1,
          maximum: 5
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens for code generation',
          default: 4096
        }
      },
      required: ['prompt']
    }
  },

  {
    name: 'codex_review',
    description: 'Perform comprehensive code review analyzing security, performance, maintainability, and potential bugs.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to review'
        },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)'
        },
        focusAreas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas to focus on',
          default: ['security', 'performance', 'maintainability', 'bugs']
        },
        model: {
          type: 'string',
          description: `Model for code review (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        }
      },
      required: ['code']
    }
  },

  {
    name: 'codex_explain',
    description: 'Get a detailed explanation of code functionality, logic flow, and design patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to explain'
        },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)'
        },
        detail: {
          type: 'string',
          enum: ['brief', 'detailed', 'expert'],
          description: 'Level of detail (default: detailed)',
          default: 'detailed'
        },
        model: {
          type: 'string',
          description: `Model for explanation (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        }
      },
      required: ['code']
    }
  },

  {
    name: 'codex_refactor',
    description: 'Refactor code to improve quality, readability, or performance while maintaining functionality.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to refactor'
        },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)'
        },
        goals: {
          type: 'array',
          items: { type: 'string' },
          description: 'Refactoring goals (e.g., readability, performance, modularity)',
          default: ['readability', 'maintainability']
        },
        preserveApi: {
          type: 'boolean',
          description: 'Preserve public API/interface (default: true)',
          default: true
        },
        model: {
          type: 'string',
          description: `Model for refactoring (default: ${CONFIG.CODER_MODEL})`,
          default: CONFIG.CODER_MODEL
        }
      },
      required: ['code']
    }
  },

  {
    name: 'codex_test',
    description: 'Generate unit tests for provided code using appropriate testing frameworks.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to generate tests for'
        },
        language: {
          type: 'string',
          description: 'Programming language'
        },
        framework: {
          type: 'string',
          description: 'Testing framework (e.g., jest, pytest, junit, mocha)'
        },
        coverage: {
          type: 'string',
          enum: ['basic', 'comprehensive', 'edge-cases'],
          description: 'Test coverage level (default: comprehensive)',
          default: 'comprehensive'
        },
        model: {
          type: 'string',
          description: `Model for test generation (default: ${CONFIG.CODER_MODEL})`,
          default: CONFIG.CODER_MODEL
        }
      },
      required: ['code']
    }
  },

  {
    name: 'codex_debug',
    description: 'Analyze code for bugs, errors, and potential issues with suggested fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to debug'
        },
        errorMessage: {
          type: 'string',
          description: 'Error message or stack trace if available'
        },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)'
        },
        context: {
          type: 'string',
          description: 'Additional context about the issue'
        },
        model: {
          type: 'string',
          description: `Model for debugging (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        }
      },
      required: ['code']
    }
  },

  // === UTILITY TOOLS ===
  {
    name: 'codex_status',
    description: 'Get current status of OpenAI API connection, available models, and configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'codex_models',
    description: 'List available OpenAI models with their details.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter models by name (e.g., "gpt-4", "o1")'
        }
      },
      required: []
    }
  },

  {
    name: 'codex_model_details',
    description: 'Get detailed information about a specific model.',
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

  // === ADVANCED TOOLS ===
  {
    name: 'codex_chain',
    description: 'Execute a chain of prompts where each step can use the output of previous steps.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              model: { type: 'string' },
              temperature: { type: 'number' }
            },
            required: ['prompt']
          },
          description: 'Array of generation steps'
        },
        model: {
          type: 'string',
          description: 'Default model for all steps',
          default: CONFIG.DEFAULT_MODEL
        }
      },
      required: ['steps']
    }
  },

  {
    name: 'codex_compare',
    description: 'Compare outputs from multiple models for the same prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Prompt to test across models'
        },
        models: {
          type: 'array',
          items: { type: 'string' },
          description: 'Models to compare',
          default: ['gpt-4o', 'gpt-4o-mini']
        },
        temperature: {
          type: 'number',
          description: 'Temperature for all models',
          default: 0.3
        }
      },
      required: ['prompt']
    }
  },

  {
    name: 'codex_batch',
    description: 'Process multiple prompts in parallel for efficiency.',
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of prompts to process'
        },
        model: {
          type: 'string',
          description: `Model for all prompts (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        maxConcurrent: {
          type: 'number',
          description: 'Max concurrent requests (default: 5)',
          default: 5
        },
        temperature: {
          type: 'number',
          description: 'Temperature for all prompts',
          default: 0.3
        }
      },
      required: ['prompts']
    }
  },

  // === HYDRA INTEGRATION ===
  {
    name: 'codex_health',
    description: 'Get comprehensive health status including API availability, latency, and configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'codex_config',
    description: 'Get current CodexCLI configuration (API key is masked for security).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  // === STREAM HANDLER TOOLS ===
  {
    name: 'codex_stream_advanced',
    description: 'Advanced streaming with SSE support, callbacks, and rate limit awareness. Use for real-time streaming responses.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate from'
        },
        model: {
          type: 'string',
          description: `Model to use (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        systemPrompt: {
          type: 'string',
          description: 'System prompt to set context'
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-2 (default: 0.3)',
          default: 0.3
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate (default: 4096)',
          default: 4096
        },
        topP: {
          type: 'number',
          description: 'Top-p sampling (default: 1)',
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
        },
        stop: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stop sequences'
        },
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              content: { type: 'string' }
            }
          },
          description: 'Conversation history'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'codex_complete',
    description: 'Non-streaming completion with automatic retries and rate limit handling.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate from'
        },
        model: {
          type: 'string',
          description: `Model to use (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        systemPrompt: {
          type: 'string',
          description: 'System prompt'
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-2',
          default: 0.3
        },
        maxTokens: {
          type: 'number',
          description: 'Max tokens',
          default: 4096
        },
        topP: {
          type: 'number',
          description: 'Top-p sampling',
          default: 1
        },
        frequencyPenalty: {
          type: 'number',
          description: 'Frequency penalty',
          default: 0
        },
        presencePenalty: {
          type: 'number',
          description: 'Presence penalty',
          default: 0
        },
        stop: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stop sequences'
        },
        responseFormat: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'Response format',
          default: 'text'
        },
        history: {
          type: 'array',
          description: 'Conversation history'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'codex_stream_abort',
    description: 'Abort the current streaming request.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'codex_rate_limit_status',
    description: 'Get rate limit status and context window information.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

/**
 * Get tool by name
 */
export function getToolByName(name) {
  return TOOLS.find(tool => tool.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames() {
  return TOOLS.map(tool => tool.name);
}

/**
 * Validate tool arguments against schema
 */
export function validateToolArgs(tool, args) {
  const errors = [];
  if (!tool?.inputSchema) return errors;

  const { required = [], properties = {} } = tool.inputSchema;

  // Check required fields
  for (const key of required) {
    if (args[key] === undefined || args[key] === null) {
      errors.push(`Missing required field: ${key}`);
    }
  }

  // Type validation
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

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`Field ${key} must be one of: ${schema.enum.join(', ')}`);
    }

    // Range validation for numbers
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
}
