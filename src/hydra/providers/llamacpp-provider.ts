/**
 * @fileoverview LlamaCpp Provider - Refactored implementation using BaseProvider
 * Local LLM Provider with connection pooling, retry logic, and health caching
 *
 * This provider uses the llama-cpp MCP tools as backend instead of HTTP API.
 *
 * @module hydra/providers/llamacpp-provider
 */

import { HealthCheckCache } from '../core/cache.js';
import { getConfigManager } from '../core/config.js';
import { NetworkError, normalizeError, TimeoutError } from '../core/errors.js';
import { BaseProvider } from '../core/interfaces.js';
import { ManagedPool } from '../core/pool.js';
import { CircuitBreaker, withRetry } from '../core/retry.js';
import { getStatsCollector } from '../core/stats.js';

import { getLlamaCppBridge } from './llamacpp-bridge.js';
import {
  GGUF_MODELS,
  getModelForAgent,
  getModelForTask,
  MODEL_ROLES,
  TASK_MODEL_MAP,
} from './llamacpp-models.js';

// =============================================================================
// Custom Error Class
// =============================================================================

/**
 * LlamaCpp specific error
 */
export class LlamaCppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LlamaCppError';
    this.code = options.code || 'LLAMACPP_ERROR';
    this.context = options.context || {};
    this.cause = options.cause;
  }
}

// =============================================================================
// LlamaCpp Provider Class
// =============================================================================

/**
 * LlamaCpp Provider class
 * Extends BaseProvider and uses MCP tools for inference
 */
export class LlamaCppProvider extends BaseProvider {
  /**
   * @param {Object} config - Provider configuration
   */
  constructor(config = {}) {
    // Get config from manager or use provided
    const configManager = getConfigManager();
    const llamacppConfig = configManager.getValue('providers.llamacpp', {});
    const mergedConfig = { ...llamacppConfig, ...config };

    super('llamacpp', mergedConfig);

    // Model configuration
    this.models = mergedConfig.models || {
      router: 'draft',
      researcher: 'main',
      coder: 'main',
      reasoner: 'main',
      default: 'main',
    };

    // Get bridge instance
    this.bridge = getLlamaCppBridge(mergedConfig);

    // Initialize connection pool
    this.pool = new ManagedPool(
      mergedConfig.pool || { maxConcurrent: 5, maxQueueSize: 100 },
      mergedConfig.rateLimit || { enabled: false },
    );

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: mergedConfig.circuitBreaker?.failureThreshold || 5,
      successThreshold: mergedConfig.circuitBreaker?.successThreshold || 2,
      timeout: mergedConfig.circuitBreaker?.timeout || 30000,
    });

    // Initialize health check cache
    this.healthCache = new HealthCheckCache({
      ttl: 30000,
      staleTTL: 60000,
      autoRefresh: true,
    });
    this.healthCache.register('llamacpp', () => this._performHealthCheck());

    // Retry configuration
    this.retryConfig = {
      maxRetries: mergedConfig.maxRetries || 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    };

    // Stats collector
    this.stats = getStatsCollector();

    // Default timeout (longer for local inference)
    this.defaultTimeout = mergedConfig.timeout || 120000;
  }

  /**
   * Set the MCP invoker function
   * This must be called before using the provider
   * @param {Function} invoker - Function that invokes MCP tools
   */
  setMcpInvoker(invoker) {
    this.bridge.setMcpInvoker(invoker);
  }

  /**
   * Generate completion with all enhancements
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async generate(prompt, options = {}) {
    const {
      model = this.getDefaultModel(),
      temperature = 0.7,
      maxTokens = 2048,
      timeout = this.defaultTimeout,
      taskType = 'default',
      tool = null,
    } = options;

    const startTime = Date.now();

    // Determine which tool to use
    const taskConfig = getModelForTask(taskType);
    const selectedTool = tool || taskConfig.tool || 'llama_generate';

    try {
      // Execute through circuit breaker, pool, and retry
      const result = await this.circuitBreaker.execute(async () => {
        return this.pool.execute(async () => {
          return withRetry(
            () =>
              this._doGenerate(prompt, {
                model,
                temperature,
                maxTokens,
                timeout,
                tool: selectedTool,
              }),
            {
              ...this.retryConfig,
              onRetry: ({ attempt, error, delay }) => {
                console.warn(
                  `[LlamaCpp] Retry ${attempt}/${this.retryConfig.maxRetries}: ${error.message}. Waiting ${delay}ms`,
                );
              },
            },
          );
        });
      });

      // Update stats
      this._updateStats(result, true);
      this.stats.recordRequest({
        provider: 'llamacpp',
        category: 'generate',
        latency: result.duration_ms,
        tokens: result.tokens,
        cost: 0, // Local = free
        savings: this._calculateSavings(result.tokens),
        success: true,
      });

      return result;
    } catch (error) {
      const hydraError = this._handleError(error);
      this._updateStats({ error: hydraError.message }, false);
      this.stats.recordRequest({
        provider: 'llamacpp',
        category: 'generate',
        latency: Date.now() - startTime,
        success: false,
        error: { type: hydraError.code },
      });
      throw hydraError;
    }
  }

  /**
   * Perform actual generation using bridge
   * @private
   */
  async _doGenerate(prompt, options) {
    const { model, temperature, maxTokens, timeout, tool } = options;
    const startTime = Date.now();

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new TimeoutError('generate', timeout)), timeout);
    });

    // Select appropriate bridge method based on tool
    let generationPromise;

    switch (tool) {
      case 'llama_generate_fast':
        generationPromise = this.bridge.generateFast(prompt, {
          maxTokens,
          temperature,
        });
        break;

      case 'llama_code':
        generationPromise = this.bridge.code('generate', {
          description: prompt,
          language: 'javascript',
        });
        break;

      case 'llama_json':
        generationPromise = this.bridge.json(
          prompt,
          {},
          {
            maxTokens,
          },
        );
        break;

      case 'llama_analyze':
        generationPromise = this.bridge.analyze(prompt, 'summary', {});
        break;

      default:
        generationPromise = this.bridge.generate(prompt, {
          maxTokens,
          temperature,
        });
    }

    // Race against timeout
    const result = await Promise.race([generationPromise, timeoutPromise]);

    return {
      content: result.content,
      model: model || 'llamacpp',
      duration_ms: Date.now() - startTime,
      tokens: result.tokens || 0,
      success: true,
      tool,
    };
  }

  /**
   * Stream generation (simulated via polling since MCP doesn't support native streaming)
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options
   * @yields {string} Content chunks
   */
  async *streamGenerate(prompt, options = {}) {
    // MCP tools don't support native streaming
    // Fall back to full generation and yield in chunks
    const result = await this.generate(prompt, options);

    // Simulate streaming by yielding words
    const words = result.content.split(' ');
    for (const word of words) {
      yield `${word} `;
      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Health check with caching
   * @param {boolean} forceRefresh - Force fresh check
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck(forceRefresh = false) {
    return this.healthCache.get('llamacpp', forceRefresh);
  }

  /**
   * Perform actual health check
   * @private
   */
  async _performHealthCheck() {
    try {
      const bridgeHealth = await this.bridge.healthCheck(true);

      return {
        available: bridgeHealth.available,
        models: Object.keys(GGUF_MODELS),
        modelCount: Object.keys(GGUF_MODELS).length,
        provider: 'llamacpp',
        backend: 'llama-cpp-mcp',
        ...bridgeHealth,
      };
    } catch (error) {
      return {
        available: false,
        models: [],
        error: error.message,
        provider: 'llamacpp',
      };
    }
  }

  /**
   * Select optimal model for task type
   * @param {string} taskType - Type of task
   * @returns {string} Model name
   */
  selectModel(taskType) {
    const taskConfig = getModelForTask(taskType);
    return taskConfig.model || this.models.default;
  }

  /**
   * Select tool for task type
   * @param {string} taskType - Type of task
   * @returns {string} Tool name
   */
  selectTool(taskType) {
    const taskConfig = getModelForTask(taskType);
    return taskConfig.tool || 'llama_generate';
  }

  /**
   * Get model configuration for a Swarm agent
   * @param {string} agentName - Name of the agent
   * @returns {Object|null} Agent configuration
   */
  getAgentConfig(agentName) {
    return getModelForAgent(agentName);
  }

  /**
   * Check if model is supported
   * @param {string} model - Model name
   * @returns {boolean}
   */
  supportsModel(model) {
    return model in GGUF_MODELS || model in MODEL_ROLES;
  }

  /**
   * Get default model
   * @returns {string}
   */
  getDefaultModel() {
    return this.models.default || 'main';
  }

  /**
   * Calculate cost savings vs cloud
   * @param {number} tokens - Token count
   * @returns {number} Estimated savings in USD
   */
  _calculateSavings(tokens) {
    // Estimate savings compared to Claude
    const claudeCostPerToken = 0.000015; // ~$15/1M tokens
    const claudeFixedCost = 0.001;
    return claudeFixedCost + tokens * claudeCostPerToken;
  }

  /**
   * Handle and normalize errors
   * @param {Error} error - Raw error
   * @returns {Error} Normalized error
   */
  _handleError(error) {
    if (error instanceof TimeoutError) {
      return error;
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new NetworkError('Cannot connect to llama-cpp MCP server', { cause: error });
    }

    if (error instanceof LlamaCppError) {
      return error;
    }

    return normalizeError(error, 'LLAMACPP_ERROR');
  }

  /**
   * Get pool status
   * @returns {Object}
   */
  getPoolStatus() {
    return this.pool.getStatus();
  }

  /**
   * Get circuit breaker status
   * @returns {Object}
   */
  getCircuitStatus() {
    return this.circuitBreaker.getState();
  }

  /**
   * Get combined provider status
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.name,
      backend: 'llama-cpp-mcp',
      models: this.models,
      pool: this.getPoolStatus(),
      circuit: this.getCircuitStatus(),
      stats: this.getStats(),
    };
  }

  // ===========================================================================
  // Specialized Methods (delegated to bridge)
  // ===========================================================================

  /**
   * Generate code
   * @param {string} task - Task type (generate, explain, refactor, etc.)
   * @param {Object} params - Code parameters
   * @returns {Promise<Object>}
   */
  async generateCode(task, params = {}) {
    return this.bridge.code(task, params);
  }

  /**
   * Generate structured JSON
   * @param {string} prompt - Input prompt
   * @param {Object} schema - JSON schema
   * @returns {Promise<Object>}
   */
  async generateJson(prompt, schema) {
    return this.bridge.json(prompt, schema);
  }

  /**
   * Analyze text
   * @param {string} text - Text to analyze
   * @param {string} task - Analysis task
   * @param {Object} options - Options
   * @returns {Promise<Object>}
   */
  async analyzeText(text, task, options = {}) {
    return this.bridge.analyze(text, task, options);
  }

  /**
   * Generate embeddings
   * @param {string|string[]} text - Text(s) to embed
   * @returns {Promise<Object>}
   */
  async embed(text) {
    return this.bridge.embed(text);
  }

  /**
   * Analyze image
   * @param {string} image - Image path
   * @param {string} prompt - Question about image
   * @returns {Promise<Object>}
   */
  async analyzeImage(image, prompt) {
    return this.bridge.vision(image, prompt);
  }

  /**
   * Execute function call
   * @param {Array} messages - Messages
   * @param {Array} tools - Available tools
   * @returns {Promise<Object>}
   */
  async functionCall(messages, tools) {
    return this.bridge.functionCall(messages, tools);
  }

  /**
   * Chat with history
   * @param {Array} messages - Chat messages
   * @param {Object} options - Chat options
   * @returns {Promise<Object>}
   */
  async chat(messages, options = {}) {
    return this.bridge.chat(messages, options);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _llamacppProvider = null;

/**
 * Get or create LlamaCpp provider singleton
 * @param {Object} config - Configuration
 * @returns {LlamaCppProvider}
 */
export function getLlamaCppProvider(config = {}) {
  if (!_llamacppProvider) {
    _llamacppProvider = new LlamaCppProvider(config);
  }
  return _llamacppProvider;
}

/**
 * Reset provider singleton (for testing)
 */
export function resetLlamaCppProvider() {
  _llamacppProvider = null;
}

// =============================================================================
// Exports
// =============================================================================

export { MODEL_ROLES, GGUF_MODELS, TASK_MODEL_MAP };

export default {
  LlamaCppProvider,
  LlamaCppError,
  getLlamaCppProvider,
  resetLlamaCppProvider,
  MODEL_ROLES,
  GGUF_MODELS,
  TASK_MODEL_MAP,
};
