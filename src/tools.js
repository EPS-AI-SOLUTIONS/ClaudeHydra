import { CONFIG } from './config.js';

export const TOOLS = [
  // === GENERATION TOOLS ===
  {
    name: 'ollama_generate',
    description:
      'Generate text using Ollama. Supports local models like llama3.2, qwen2.5-coder, phi3.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to generate from' },
        model: {
          type: 'string',
          description: `Model name (default: ${CONFIG.DEFAULT_MODEL})`,
          default: CONFIG.DEFAULT_MODEL
        },
        temperature: {
          type: 'number',
          description: 'Temperature 0-1 (default: 0.3)',
          default: 0.3
        },
        maxTokens: {
          type: 'number',
          description: 'Max tokens to generate',
          default: 2048
        },
        useCache: {
          type: 'boolean',
          description: 'Use response cache',
          default: true
        },
        optimize: {
          type: 'boolean',
          description: 'Optimize prompt before sending',
          default: false
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ollama_smart',
    description:
      'Smart generation with automatic prompt optimization, speculative decoding, and caching.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to process' },
        model: {
          type: 'string',
          description: 'Model (default: auto-select based on task)'
        },
        useSwarm: {
          type: 'boolean',
          description: 'Force 6-step swarm execution for complex tasks'
        },
        includeTranscript: {
          type: 'boolean',
          description: 'Include full swarm transcript',
          default: false
        },
        saveMemory: {
          type: 'boolean',
          description: 'Save swarm archive to .serena/memories',
          default: true
        },
        title: {
          type: 'string',
          description: 'Optional task title for swarm logging'
        },
        agents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional swarm agent names to use'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ollama_speculative',
    description:
      'Speculative decoding - race fast model (1b) vs accurate model (3b). Returns first valid response.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to generate from' },
        fastModel: {
          type: 'string',
          description: `Fast model (default: ${CONFIG.FAST_MODEL})`
        },
        accurateModel: {
          type: 'string',
          description: `Accurate model (default: ${CONFIG.DEFAULT_MODEL})`
        },
        timeout: {
          type: 'number',
          description: 'Timeout in ms (default: 30000)'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ollama_race',
    description: 'Race multiple models - first valid response wins.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to generate from' },
        models: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Models to race (default: [llama3.2:1b, phi3:mini, llama3.2:3b])'
        },
        firstWins: {
          type: 'boolean',
          description: 'Return first valid (true) or best (false)',
          default: true
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ollama_consensus',
    description: 'Run multiple models and check for agreement/consensus.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to generate from' },
        models: {
          type: 'array',
          items: { type: 'string' },
          description: 'Models to use (default: [llama3.2:3b, phi3:mini])'
        }
      },
      required: ['prompt']
    }
  },

  // === CODE TOOLS ===
  {
    name: 'ollama_code',
    description: 'Generate code with automatic self-correction and validation.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Code generation prompt' },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)'
        },
        model: {
          type: 'string',
          description: `Generator model (default: ${CONFIG.DEFAULT_MODEL})`
        },
        coderModel: {
          type: 'string',
          description: `Validator model (default: ${CONFIG.CODER_MODEL})`
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ollama_validate',
    description: 'Validate and fix code syntax using self-correction loop.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to validate' },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)'
        },
        maxAttempts: {
          type: 'number',
          description: 'Max correction attempts (default: 3)'
        }
      },
      required: ['code']
    }
  },

  // === PROMPT OPTIMIZATION TOOLS ===
  {
    name: 'prompt_optimize',
    description:
      'Analyze and enhance a prompt for better AI responses. Returns optimized prompt with enhancements.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to optimize' },
        model: { type: 'string', description: 'Target model for optimization' },
        category: {
          type: 'string',
          enum: [
            'auto',
            'code',
            'analysis',
            'question',
            'creative',
            'task',
            'summary',
            'debug',
            'optimize'
          ],
          description: 'Force specific category (default: auto-detect)'
        },
        addExamples: {
          type: 'boolean',
          description: 'Add few-shot examples if available',
          default: false
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_analyze',
    description:
      'Analyze a prompt for clarity, completeness, and improvements.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to analyze' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_quality',
    description: 'Test prompt quality with a heuristic score and suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to test' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_suggest',
    description: 'Get prompt improvement suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to improve' },
        model: { type: 'string', description: 'Target model' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_batch_optimize',
    description: 'Optimize multiple prompts in batch.',
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Prompts to optimize'
        },
        model: { type: 'string', description: 'Target model' }
      },
      required: ['prompts']
    }
  },
  {
    name: 'prompt_smart_suggest',
    description:
      'Get smart suggestions by combining analysis and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to analyze' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_autocomplete',
    description: 'Get auto-completions based on a partial prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        partial: { type: 'string', description: 'Partial prompt text' }
      },
      required: ['partial']
    }
  },
  {
    name: 'prompt_autofix',
    description: 'Auto-fix prompt grammar and structure.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Prompt to fix' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_template',
    description: 'Get a prompt template by category and variant.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Template category' },
        variant: {
          type: 'string',
          description: 'Template variant (default: basic)'
        }
      },
      required: ['category']
    }
  },

  // === BATCH & UTILITY TOOLS ===
  {
    name: 'ollama_batch',
    description: 'Process prompts in batches with optional optimization.',
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Prompts to process'
        },
        model: {
          type: 'string',
          description: `Model (default: ${CONFIG.DEFAULT_MODEL})`
        },
        maxConcurrent: {
          type: 'number',
          description: 'Max concurrent jobs (default: 4)'
        },
        optimize: {
          type: 'boolean',
          description: 'Optimize prompts before sending',
          default: false
        }
      },
      required: ['prompts']
    }
  },
  {
    name: 'ollama_status',
    description: 'Get current status of Ollama, cache, and enabled features.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'ollama_pull',
    description: 'Pull a model from Ollama.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model name to pull' }
      },
      required: ['model']
    }
  },
  {
    name: 'ollama_cache_clear',
    description: 'Clear cache entries, optionally older than a given age.',
    inputSchema: {
      type: 'object',
      properties: {
        olderThan: { type: 'number', description: 'Age in seconds to remove' }
      },
      required: []
    }
  },

  // === GEMINI MODELS TOOLS ===
  {
    name: 'gemini_models',
    description: 'List Gemini models (cached or fetched).',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh from API',
          default: false
        },
        apiKey: { type: 'string', description: 'Optional API key override' }
      },
      required: []
    }
  },
  {
    name: 'gemini_model_details',
    description: 'Get details for a specific Gemini model.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model name' },
        apiKey: { type: 'string', description: 'Optional API key override' }
      },
      required: ['model']
    }
  },
  {
    name: 'gemini_models_summary',
    description: 'Get a summary of Gemini models.',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh from API',
          default: false
        }
      },
      required: []
    }
  },
  {
    name: 'gemini_models_recommend',
    description: 'Get recommended Gemini models for different tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh from API',
          default: false
        }
      },
      required: []
    }
  },
  {
    name: 'gemini_models_filter',
    description: 'Filter Gemini models by capability.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: { type: 'string', description: 'Capability to filter by' },
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh from API',
          default: false
        }
      },
      required: ['capability']
    }
  },

  // === QUEUE MANAGEMENT TOOLS ===
  {
    name: 'queue_enqueue',
    description: 'Enqueue a prompt for processing.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Prompt to enqueue' },
        model: { type: 'string', description: 'Model to use' },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'normal', 'low', 'background'],
          description: 'Queue priority'
        },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'queue_batch',
    description: 'Enqueue multiple prompts at once.',
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Prompts to enqueue'
        },
        model: { type: 'string', description: 'Model to use' },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'normal', 'low', 'background'],
          description: 'Queue priority'
        }
      },
      required: ['prompts']
    }
  },
  {
    name: 'queue_status',
    description: 'Get queue status.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'queue_item',
    description: 'Get a specific queue item.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Queue item ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'queue_cancel',
    description: 'Cancel a specific queue item.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Queue item ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'queue_cancel_all',
    description: 'Cancel all queued items.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'queue_pause',
    description: 'Pause queue processing (running items will complete).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'queue_resume',
    description: 'Resume queue processing.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'queue_wait',
    description: 'Wait for a specific item to complete and return its result.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The item ID to wait for' },
        timeout: {
          type: 'number',
          description: 'Timeout in ms (default: 60000)'
        }
      },
      required: ['id']
    }
  },

  // === HYDRA TOOLS ===
  {
    name: 'hydra_swarm',
    description:
      'Run the 6-step AgentSwarm protocol with parallel agents and optional memory logging.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Task prompt to execute' },
        title: {
          type: 'string',
          description: 'Optional task title for logging'
        },
        agents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional swarm agent names to use'
        },
        includeTranscript: {
          type: 'boolean',
          description: 'Include full swarm transcript',
          default: false
        },
        saveMemory: {
          type: 'boolean',
          description: 'Save swarm archive to .serena/memories',
          default: true
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'hydra_health',
    description: 'Get overall server health, queue status, and version info.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'hydra_config',
    description: 'Get effective server configuration and defaults.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];
