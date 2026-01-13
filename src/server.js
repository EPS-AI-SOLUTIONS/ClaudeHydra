#!/usr/bin/env node
/**
 * HYDRA Ollama MCP Server
 *
 * Provides Ollama integration for Gemini CLI with:
 * - Speculative decoding (parallel model racing)
 * - Self-correction (agentic code validation)
 * - SHA256 response caching
 * - Batch processing
 * - Prompt optimization
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { generate, checkHealth, listModels, pullModel } from './ollama-client.js';
import { speculativeGenerate, modelRace, consensusGenerate } from './speculative.js';
import { selfCorrect, generateWithCorrection, detectLanguage, extractCodeBlocks } from './self-correction.js';
import { getCache, setCache, getCacheStats } from './cache.js';
import {
  optimizePrompt,
  getPromptCategory,
  getPromptClarity,
  getPromptLanguage,
  getBetterPrompt,
  testPromptQuality,
  optimizePromptBatch,
  analyzePrompt,
  getSuggestions,
  getSmartSuggestions,
  getAutoCompletions,
  detectLanguageFromContext,
  getPromptTemplate,
  autoFixPrompt
} from './prompt-optimizer.js';
import {
  fetchGeminiModels,
  getGeminiModels,
  getModelDetails,
  loadModelsCache,
  filterModelsByCapability,
  getRecommendedModels,
  getModelsSummary,
  initializeModels
} from './gemini-models.js';
import {
  PromptQueue,
  Priority,
  Status,
  getQueue,
  enqueue,
  enqueueBatch,
  getQueueStatus,
  cancelItem,
  pauseQueue,
  resumeQueue
} from './prompt-queue.js';

// Server instance
const server = new Server(
  {
    name: 'ollama-hydra',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  // === GENERATION TOOLS ===
  {
    name: 'ollama_generate',
    description: 'Generate text using Ollama. Supports local models like llama3.2, qwen2.5-coder, phi3.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to generate from' },
        model: { type: 'string', description: 'Model name (default: llama3.2:3b)', default: 'llama3.2:3b' },
        temperature: { type: 'number', description: 'Temperature 0-1 (default: 0.3)', default: 0.3 },
        maxTokens: { type: 'number', description: 'Max tokens to generate', default: 2048 },
        useCache: { type: 'boolean', description: 'Use response cache', default: true },
        optimize: { type: 'boolean', description: 'Optimize prompt before sending', default: false }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ollama_smart',
    description: 'Smart generation with automatic prompt optimization, speculative decoding, and caching.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to process' },
        model: { type: 'string', description: 'Model (default: auto-select based on task)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ollama_speculative',
    description: 'Speculative decoding - race fast model (1b) vs accurate model (3b). Returns first valid response.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to generate from' },
        fastModel: { type: 'string', description: 'Fast model (default: llama3.2:1b)' },
        accurateModel: { type: 'string', description: 'Accurate model (default: llama3.2:3b)' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' }
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
          description: 'Models to race (default: [llama3.2:1b, phi3:mini, llama3.2:3b])'
        },
        firstWins: { type: 'boolean', description: 'Return first valid (true) or best (false)', default: true }
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
        language: { type: 'string', description: 'Programming language (auto-detected if not specified)' },
        model: { type: 'string', description: 'Generator model (default: llama3.2:3b)' },
        coderModel: { type: 'string', description: 'Validator model (default: qwen2.5-coder:1.5b)' }
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
        language: { type: 'string', description: 'Programming language (auto-detected if not specified)' },
        maxAttempts: { type: 'number', description: 'Max correction attempts (default: 3)' }
      },
      required: ['code']
    }
  },

  // === PROMPT OPTIMIZATION TOOLS ===
  {
    name: 'prompt_optimize',
    description: 'Analyze and enhance a prompt for better AI responses. Returns optimized prompt with enhancements.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to optimize' },
        model: { type: 'string', description: 'Target model for optimization' },
        category: {
          type: 'string',
          enum: ['auto', 'code', 'analysis', 'question', 'creative', 'task', 'summary', 'debug', 'optimize'],
          description: 'Force specific category (default: auto-detect)'
        },
        addExamples: { type: 'boolean', description: 'Add few-shot examples if available', default: false }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_analyze',
    description: 'Analyze a prompt without modifying it. Returns category, clarity score, language, and suggestions.',
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
    description: 'Test prompt quality and get a detailed report with issues and suggestions.',
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
    description: 'Get improvement suggestions for a prompt without applying them.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to get suggestions for' },
        model: { type: 'string', description: 'Target model for suggestions' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_batch_optimize',
    description: 'Optimize multiple prompts at once.',
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of prompts to optimize'
        },
        model: { type: 'string', description: 'Target model for optimization' }
      },
      required: ['prompts']
    }
  },
  {
    name: 'prompt_smart_suggest',
    description: 'Get intelligent context-aware suggestions for improving a prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to get smart suggestions for' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_autocomplete',
    description: 'Get auto-completions for a partial prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        partial: { type: 'string', description: 'The partial prompt to complete' }
      },
      required: ['partial']
    }
  },
  {
    name: 'prompt_autofix',
    description: 'Automatically fix common issues in a prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to auto-fix' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'prompt_template',
    description: 'Get a prompt template for a specific category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['code', 'api', 'debug', 'refactor', 'testing', 'database', 'devops'],
          description: 'The category of prompt template'
        },
        variant: {
          type: 'string',
          description: 'Template variant (basic, withTests, withDocs, etc.)',
          default: 'basic'
        }
      },
      required: ['category']
    }
  },

  // === BATCH & UTILITY TOOLS ===
  {
    name: 'ollama_batch',
    description: 'Process multiple prompts in parallel.',
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of prompts to process'
        },
        model: { type: 'string', description: 'Model to use (default: llama3.2:3b)' },
        maxConcurrent: { type: 'number', description: 'Max concurrent requests (default: 4)' },
        optimize: { type: 'boolean', description: 'Optimize prompts before processing', default: false }
      },
      required: ['prompts']
    }
  },
  {
    name: 'ollama_status',
    description: 'Check Ollama status, available models, and cache statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'ollama_pull',
    description: 'Pull/download a model from Ollama registry.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model name to pull (e.g., llama3.2:3b)' }
      },
      required: ['model']
    }
  },
  {
    name: 'ollama_cache_clear',
    description: 'Clear the response cache.',
    inputSchema: {
      type: 'object',
      properties: {
        olderThan: { type: 'number', description: 'Clear entries older than N seconds' }
      },
      required: []
    }
  },

  // === GEMINI MODELS TOOLS ===
  {
    name: 'gemini_models',
    description: 'Get list of available Gemini models from API. Fetches and caches model information.',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: { type: 'boolean', description: 'Force fresh fetch from API (ignore cache)', default: false },
        apiKey: { type: 'string', description: 'Optional API key (uses env GEMINI_API_KEY if not provided)' }
      },
      required: []
    }
  },
  {
    name: 'gemini_model_details',
    description: 'Get detailed information about a specific Gemini model.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model name (e.g., gemini-2.5-pro, gemini-2.5-flash)' },
        apiKey: { type: 'string', description: 'Optional API key' }
      },
      required: ['model']
    }
  },
  {
    name: 'gemini_models_summary',
    description: 'Get a summary of available Gemini models - counts by family, capabilities, largest context.',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: { type: 'boolean', description: 'Force fresh fetch', default: false }
      },
      required: []
    }
  },
  {
    name: 'gemini_models_recommend',
    description: 'Get recommended Gemini models for different use cases (code, fast, pro, experimental).',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: { type: 'boolean', description: 'Force fresh fetch', default: false }
      },
      required: []
    }
  },
  {
    name: 'gemini_models_filter',
    description: 'Filter Gemini models by capability (generateContent, countTokens, embedContent, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          enum: ['generateContent', 'countTokens', 'embedContent', 'generateAnswer', 'batchEmbedContents'],
          description: 'The capability to filter by'
        },
        forceRefresh: { type: 'boolean', description: 'Force fresh fetch', default: false }
      },
      required: ['capability']
    }
  },

  // === QUEUE MANAGEMENT TOOLS ===
  {
    name: 'queue_enqueue',
    description: 'Add a prompt to the processing queue with priority scheduling.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to queue' },
        model: { type: 'string', description: 'Model to use (default: llama3.2:3b)' },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'normal', 'low', 'background'],
          description: 'Priority level (default: normal)'
        },
        metadata: { type: 'object', description: 'Optional metadata to attach' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'queue_batch',
    description: 'Add multiple prompts to the queue at once.',
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of prompts to queue'
        },
        model: { type: 'string', description: 'Model to use for all prompts' },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'normal', 'low', 'background'],
          description: 'Priority level for all items'
        }
      },
      required: ['prompts']
    }
  },
  {
    name: 'queue_status',
    description: 'Get current queue status including items count, running, completed, and statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'queue_item',
    description: 'Get status of a specific queued item by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The item ID to check' }
      },
      required: ['id']
    }
  },
  {
    name: 'queue_cancel',
    description: 'Cancel a queued or running item.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The item ID to cancel' }
      },
      required: ['id']
    }
  },
  {
    name: 'queue_cancel_all',
    description: 'Cancel all queued and running items.',
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
        timeout: { type: 'number', description: 'Timeout in ms (default: 60000)' }
      },
      required: ['id']
    }
  }
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      // === GENERATION TOOLS ===
      case 'ollama_generate': {
        let prompt = args.prompt;

        // Optimize prompt if requested
        if (args.optimize) {
          const optimized = optimizePrompt(prompt, { model: args.model });
          prompt = optimized.optimizedPrompt;
        }

        // Check cache first
        if (args.useCache !== false) {
          const cached = getCache(prompt, args.model);
          if (cached) {
            result = { ...cached, fromCache: true };
            break;
          }
        }

        const response = await generate(
          args.model || 'llama3.2:3b',
          prompt,
          { temperature: args.temperature, maxTokens: args.maxTokens }
        );

        // Save to cache
        if (args.useCache !== false) {
          setCache(prompt, response.response, args.model);
        }

        result = response;
        break;
      }

      case 'ollama_smart': {
        // Smart generation: optimize → detect category → select model → generate
        const optimization = optimizePrompt(args.prompt);
        const category = optimization.category;

        // Select model based on category
        let model = args.model;
        if (!model) {
          if (category === 'code') model = 'qwen2.5-coder:1.5b';
          else if (category === 'question') model = 'llama3.2:1b'; // Fast for simple questions
          else model = 'llama3.2:3b';
        }

        // Use speculative for non-code tasks
        if (category !== 'code') {
          result = await speculativeGenerate(optimization.optimizedPrompt);
          result.optimization = optimization;
        } else {
          // Use code generation with self-correction
          result = await generateWithCorrection(optimization.optimizedPrompt, {
            generatorModel: model
          });
          result.optimization = optimization;
        }
        break;
      }

      case 'ollama_speculative':
        result = await speculativeGenerate(args.prompt, args);
        break;

      case 'ollama_race':
        result = await modelRace(
          args.prompt,
          args.models || ['llama3.2:1b', 'phi3:mini', 'llama3.2:3b'],
          { firstWins: args.firstWins ?? true }
        );
        break;

      case 'ollama_consensus':
        result = await consensusGenerate(
          args.prompt,
          args.models || ['llama3.2:3b', 'phi3:mini']
        );
        break;

      // === CODE TOOLS ===
      case 'ollama_code':
        result = await generateWithCorrection(args.prompt, {
          generatorModel: args.model,
          coderModel: args.coderModel
        });
        break;

      case 'ollama_validate':
        result = await selfCorrect(args.code, {
          language: args.language,
          maxAttempts: args.maxAttempts
        });
        break;

      // === PROMPT OPTIMIZATION TOOLS ===
      case 'prompt_optimize':
        result = optimizePrompt(args.prompt, {
          model: args.model,
          category: args.category,
          addExamples: args.addExamples
        });
        break;

      case 'prompt_analyze':
        result = analyzePrompt(args.prompt);
        break;

      case 'prompt_quality':
        result = testPromptQuality(args.prompt);
        break;

      case 'prompt_suggest':
        result = getSuggestions(args.prompt, args.model);
        break;

      case 'prompt_batch_optimize':
        result = optimizePromptBatch(args.prompts, { model: args.model });
        break;

      case 'prompt_smart_suggest':
        result = {
          prompt: args.prompt.substring(0, 50) + (args.prompt.length > 50 ? '...' : ''),
          analysis: analyzePrompt(args.prompt),
          smartSuggestions: getSmartSuggestions(args.prompt),
          standardSuggestions: getSuggestions(args.prompt)
        };
        break;

      case 'prompt_autocomplete':
        result = getAutoCompletions(args.partial);
        break;

      case 'prompt_autofix':
        result = autoFixPrompt(args.prompt);
        break;

      case 'prompt_template':
        const template = getPromptTemplate(args.category, args.variant || 'basic');
        result = {
          category: args.category,
          variant: args.variant || 'basic',
          template: template,
          available: template !== null
        };
        break;

      // === BATCH & UTILITY TOOLS ===
      case 'ollama_batch': {
        const maxConcurrent = args.maxConcurrent || 4;
        const model = args.model || 'llama3.2:3b';
        let prompts = args.prompts;

        // Optimize prompts if requested
        if (args.optimize) {
          prompts = prompts.map(p => getBetterPrompt(p, model));
        }

        // Process in batches
        const results = [];
        for (let i = 0; i < prompts.length; i += maxConcurrent) {
          const batch = prompts.slice(i, i + maxConcurrent);
          const batchResults = await Promise.all(
            batch.map(prompt => generate(model, prompt).catch(e => ({ error: e.message })))
          );
          results.push(...batchResults);
        }

        result = {
          results: results.map((r, i) => ({
            prompt: args.prompts[i].substring(0, 50) + '...',
            response: r.response || null,
            error: r.error || null
          })),
          total: prompts.length,
          successful: results.filter(r => r.response).length,
          optimized: args.optimize || false
        };
        break;
      }

      case 'ollama_status': {
        const health = await checkHealth();
        const models = health.available ? await listModels() : [];
        const cacheStats = getCacheStats();

        result = {
          ollama: health,
          models: models,
          cache: cacheStats,
          config: {
            defaultModel: process.env.DEFAULT_MODEL || 'llama3.2:3b',
            fastModel: process.env.FAST_MODEL || 'llama3.2:1b',
            coderModel: process.env.CODER_MODEL || 'qwen2.5-coder:1.5b'
          },
          features: {
            promptOptimizer: true,
            speculativeDecoding: true,
            selfCorrection: true,
            caching: true,
            batchProcessing: true
          }
        };
        break;
      }

      case 'ollama_pull':
        const success = await pullModel(args.model);
        result = { model: args.model, pulled: success };
        break;

      case 'ollama_cache_clear': {
        const { readdirSync, unlinkSync, statSync } = await import('fs');
        const { join } = await import('path');
        const cacheDir = process.env.CACHE_DIR || './cache';
        const olderThan = args.olderThan ? args.olderThan * 1000 : 0;
        const now = Date.now();
        let cleared = 0;

        try {
          const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
          for (const file of files) {
            const path = join(cacheDir, file);
            const stat = statSync(path);
            if (olderThan === 0 || (now - stat.mtimeMs) > olderThan) {
              unlinkSync(path);
              cleared++;
            }
          }
        } catch {}

        result = { cleared, cacheDir };
        break;
      }

      // === GEMINI MODELS TOOLS ===
      case 'gemini_models': {
        result = await getGeminiModels(args.forceRefresh || false, args.apiKey);
        break;
      }

      case 'gemini_model_details': {
        result = await getModelDetails(args.model, args.apiKey);
        break;
      }

      case 'gemini_models_summary': {
        const modelsResult = await getGeminiModels(args.forceRefresh || false);
        if (modelsResult.success) {
          result = {
            source: modelsResult.source,
            summary: getModelsSummary(modelsResult.models)
          };
        } else {
          result = modelsResult;
        }
        break;
      }

      case 'gemini_models_recommend': {
        const modelsResult = await getGeminiModels(args.forceRefresh || false);
        if (modelsResult.success) {
          result = {
            source: modelsResult.source,
            recommendations: getRecommendedModels(modelsResult.models)
          };
        } else {
          result = modelsResult;
        }
        break;
      }

      case 'gemini_models_filter': {
        const modelsResult = await getGeminiModels(args.forceRefresh || false);
        if (modelsResult.success) {
          const filtered = filterModelsByCapability(modelsResult.models, args.capability);
          result = {
            capability: args.capability,
            count: filtered.length,
            models: filtered.map(m => ({
              name: m.name,
              displayName: m.displayName,
              inputTokenLimit: m.inputTokenLimit,
              outputTokenLimit: m.outputTokenLimit
            }))
          };
        } else {
          result = modelsResult;
        }
        break;
      }

      // === QUEUE MANAGEMENT TOOLS ===
      case 'queue_enqueue': {
        const priorityMap = {
          urgent: Priority.URGENT,
          high: Priority.HIGH,
          normal: Priority.NORMAL,
          low: Priority.LOW,
          background: Priority.BACKGROUND
        };
        const id = enqueue(args.prompt, {
          model: args.model || 'llama3.2:3b',
          priority: priorityMap[args.priority] ?? Priority.NORMAL,
          metadata: args.metadata || {}
        });
        result = {
          id,
          status: 'queued',
          priority: args.priority || 'normal',
          model: args.model || 'llama3.2:3b'
        };
        break;
      }

      case 'queue_batch': {
        const priorityMap = {
          urgent: Priority.URGENT,
          high: Priority.HIGH,
          normal: Priority.NORMAL,
          low: Priority.LOW,
          background: Priority.BACKGROUND
        };
        const ids = enqueueBatch(args.prompts, {
          model: args.model || 'llama3.2:3b',
          priority: priorityMap[args.priority] ?? Priority.NORMAL
        });
        result = {
          ids,
          count: ids.length,
          priority: args.priority || 'normal',
          model: args.model || 'llama3.2:3b'
        };
        break;
      }

      case 'queue_status': {
        result = getQueueStatus();
        break;
      }

      case 'queue_item': {
        const item = getQueue().getItem(args.id);
        if (item) {
          result = {
            id: item.id,
            status: item.status,
            priority: item.priority,
            attempts: item.attempts,
            prompt: item.prompt.substring(0, 100) + (item.prompt.length > 100 ? '...' : ''),
            result: item.result,
            error: item.error,
            createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
            startedAt: item.startedAt ? new Date(item.startedAt).toISOString() : null,
            completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : null
          };
        } else {
          result = { error: `Item ${args.id} not found` };
        }
        break;
      }

      case 'queue_cancel': {
        const cancelled = cancelItem(args.id);
        result = { id: args.id, cancelled };
        break;
      }

      case 'queue_cancel_all': {
        const cancelled = getQueue().cancelAll();
        result = { cancelled: cancelled.length, ids: cancelled };
        break;
      }

      case 'queue_pause': {
        pauseQueue();
        result = { paused: true };
        break;
      }

      case 'queue_resume': {
        resumeQueue();
        result = { resumed: true };
        break;
      }

      case 'queue_wait': {
        try {
          const item = await getQueue().waitFor(args.id, args.timeout || 60000);
          result = {
            id: item.id,
            status: item.status,
            result: item.result,
            error: item.error,
            duration: item.completedAt ? item.completedAt - item.startedAt : null
          };
        } catch (e) {
          result = { error: e.message };
        }
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      ]
    };

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: error.message, tool: name })
        }
      ],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();

  // Initialize Gemini models at startup (from cache or API)
  const modelsInit = await initializeModels();
  if (modelsInit.success) {
    console.error(`[HYDRA] Gemini models ready: ${modelsInit.count} models available`);
  }

  // Initialize prompt queue with Ollama handler
  const queue = getQueue({
    maxConcurrent: 4,
    maxRetries: 3,
    retryDelayBase: 1000,
    timeout: 60000,
    rateLimit: { maxTokens: 10, refillRate: 2 }
  });

  // Set default handler for prompt processing
  queue.setHandler(async (prompt, model, metadata) => {
    const response = await generate(model || 'llama3.2:3b', prompt, {
      temperature: metadata?.temperature || 0.3,
      maxTokens: metadata?.maxTokens || 2048
    });
    return response.response;
  });

  // Log queue events
  queue.on('completed', ({ id, duration }) => {
    console.error(`[HYDRA Queue] Item ${id} completed in ${duration}ms`);
  });
  queue.on('failed', ({ id, error }) => {
    console.error(`[HYDRA Queue] Item ${id} failed: ${error}`);
  });
  queue.on('retrying', ({ id, attempt, delay }) => {
    console.error(`[HYDRA Queue] Item ${id} retry #${attempt} in ${delay}ms`);
  });

  console.error('[HYDRA] Prompt queue initialized (maxConcurrent: 4, retries: 3)');

  await server.connect(transport);
  console.error('HYDRA Ollama MCP Server v2.2.0 running on stdio (with Queue System)');
}

main().catch(console.error);
