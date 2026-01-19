/**
 * Ollama Provider - Refactored implementation using BaseProvider
 * Local LLM Provider with connection pooling, retry logic, and health caching
 */

import { BaseProvider } from '../core/interfaces.js';
import { withRetry, CircuitBreaker } from '../core/retry.js';
import { ManagedPool } from '../core/pool.js';
import { HealthCheckCache } from '../core/cache.js';
import { OllamaError, TimeoutError, NetworkError, normalizeError } from '../core/errors.js';
import { getConfigManager } from '../core/config.js';
import { getStatsCollector } from '../core/stats.js';

/**
 * Model roles for task-specific optimization
 */
const MODEL_ROLES = {
  'llama3.2:1b': { role: 'router', maxTokens: 512, speed: 'fastest' },
  'llama3.2:3b': { role: 'researcher', maxTokens: 2048, speed: 'fast' },
  'qwen2.5-coder:1.5b': { role: 'coder', maxTokens: 4096, speed: 'fast' },
  'phi3:mini': { role: 'reasoner', maxTokens: 2048, speed: 'medium' }
};

/**
 * Ollama Provider class
 */
export class OllamaProvider extends BaseProvider {
  /**
   * @param {Object} config - Provider configuration
   */
  constructor(config = {}) {
    // Get config from manager or use provided
    const configManager = getConfigManager();
    const ollamaConfig = configManager.getValue('providers.ollama', {});
    const mergedConfig = { ...ollamaConfig, ...config };

    super('ollama', mergedConfig);

    this.baseUrl = mergedConfig.baseUrl || 'http://localhost:11434';
    this.models = mergedConfig.models || {
      router: 'llama3.2:1b',
      researcher: 'llama3.2:3b',
      coder: 'qwen2.5-coder:1.5b',
      reasoner: 'phi3:mini',
      default: 'llama3.2:3b'
    };

    // Initialize connection pool
    this.pool = new ManagedPool(
      mergedConfig.pool || { maxConcurrent: 5, maxQueueSize: 100 },
      mergedConfig.rateLimit || { enabled: false }
    );

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: mergedConfig.circuitBreaker?.failureThreshold || 5,
      successThreshold: mergedConfig.circuitBreaker?.successThreshold || 2,
      timeout: mergedConfig.circuitBreaker?.timeout || 30000
    });

    // Initialize health check cache
    this.healthCache = new HealthCheckCache({
      ttl: 30000,
      staleTTL: 60000,
      autoRefresh: true
    });
    this.healthCache.register('ollama', () => this._performHealthCheck());

    // Retry configuration
    this.retryConfig = {
      maxRetries: mergedConfig.maxRetries || 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    };

    // Stats collector
    this.stats = getStatsCollector();
  }

  /**
   * Generate completion with all enhancements
   * @param {string} prompt
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generate(prompt, options = {}) {
    const {
      model = this.getDefaultModel(),
      stream = false,
      temperature = 0.7,
      maxTokens = 2048,
      timeout = this.config.timeout || 120000
    } = options;

    const startTime = Date.now();

    try {
      // Execute through circuit breaker, pool, and retry
      const result = await this.circuitBreaker.execute(async () => {
        return this.pool.execute(async () => {
          return withRetry(
            () => this._doGenerate(prompt, { model, stream, temperature, maxTokens, timeout }),
            {
              ...this.retryConfig,
              onRetry: ({ attempt, error, delay }) => {
                console.warn(`[Ollama] Retry ${attempt}/${this.retryConfig.maxRetries}: ${error.message}. Waiting ${delay}ms`);
              }
            }
          );
        });
      });

      // Update stats
      this._updateStats(result, true);
      this.stats.recordRequest({
        provider: 'ollama',
        category: 'generate',
        latency: result.duration_ms,
        tokens: result.tokens,
        cost: 0,
        savings: this._calculateSavings(result.tokens),
        success: true
      });

      return result;

    } catch (error) {
      const hydraError = this._handleError(error);
      this._updateStats({ error: hydraError.message }, false);
      this.stats.recordRequest({
        provider: 'ollama',
        category: 'generate',
        latency: Date.now() - startTime,
        success: false,
        error: { type: hydraError.code }
      });
      throw hydraError;
    }
  }

  /**
   * Perform actual generation request
   * @private
   */
  async _doGenerate(prompt, options) {
    const { model, stream, temperature, maxTokens, timeout } = options;
    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream,
          options: {
            temperature,
            num_predict: maxTokens
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new OllamaError(`HTTP ${response.status}: ${response.statusText}`, {
          code: `OLLAMA_HTTP_${response.status}`,
          context: { status: response.status }
        });
      }

      const data = await response.json();

      return {
        content: data.response,
        model,
        duration_ms: Date.now() - startTime,
        tokens: data.eval_count || 0,
        success: true
      };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Stream generation
   * @param {string} prompt
   * @param {Object} options
   * @yields {string}
   */
  async *streamGenerate(prompt, options = {}) {
    const { model = this.getDefaultModel(), temperature = 0.7 } = options;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: { temperature }
      })
    });

    if (!response.ok) {
      throw new OllamaError(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield data.response;
          }
        } catch { /* skip invalid JSON */ }
      }
    }
  }

  /**
   * Health check with caching
   * @param {boolean} forceRefresh
   * @returns {Promise<Object>}
   */
  async healthCheck(forceRefresh = false) {
    return this.healthCache.get('ollama', forceRefresh);
  }

  /**
   * Perform actual health check
   * @private
   */
  async _performHealthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return { available: false, models: [], error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      const models = data.models?.map(m => m.name) || [];

      return {
        available: true,
        models,
        modelCount: models.length
      };

    } catch (error) {
      return {
        available: false,
        models: [],
        error: error.message
      };
    }
  }

  /**
   * Select optimal model for task type
   * @param {string} taskType
   * @returns {string}
   */
  selectModel(taskType) {
    const modelMap = {
      route: this.models.router,
      research: this.models.researcher,
      code: this.models.coder,
      reason: this.models.reasoner,
      default: this.models.default
    };
    return modelMap[taskType] || modelMap.default;
  }

  /**
   * Check if model is supported
   * @param {string} model
   * @returns {boolean}
   */
  supportsModel(model) {
    return model in MODEL_ROLES;
  }

  /**
   * Get default model
   * @returns {string}
   */
  getDefaultModel() {
    return this.models.default || 'llama3.2:3b';
  }

  /**
   * Calculate cost savings vs cloud
   * @param {number} tokens
   * @returns {number}
   */
  _calculateSavings(tokens) {
    // Estimate savings compared to Gemini
    const geminiCostPerToken = 0.000001;
    const geminiFixedCost = 0.001;
    return geminiFixedCost + (tokens * geminiCostPerToken);
  }

  /**
   * Handle and normalize errors
   * @param {Error} error
   * @returns {HydraError}
   */
  _handleError(error) {
    if (error.name === 'AbortError') {
      return new TimeoutError('generate', this.config.timeout || 120000, { cause: error });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new NetworkError(`Cannot connect to Ollama at ${this.baseUrl}`, { cause: error });
    }

    if (error instanceof OllamaError) {
      return error;
    }

    return normalizeError(error, 'OLLAMA_ERROR');
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
      baseUrl: this.baseUrl,
      pool: this.getPoolStatus(),
      circuit: this.getCircuitStatus(),
      stats: this.getStats()
    };
  }
}

// Singleton instance
let _ollamaProvider = null;

/**
 * Get or create Ollama provider singleton
 * @param {Object} config
 * @returns {OllamaProvider}
 */
export function getOllamaProvider(config = {}) {
  if (!_ollamaProvider) {
    _ollamaProvider = new OllamaProvider(config);
  }
  return _ollamaProvider;
}

/**
 * Reset provider singleton (for testing)
 */
export function resetOllamaProvider() {
  _ollamaProvider = null;
}

export { MODEL_ROLES };
