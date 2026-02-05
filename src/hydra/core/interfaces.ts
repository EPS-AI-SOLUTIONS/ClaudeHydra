/**
 * @fileoverview HYDRA Core Interfaces and Abstract Classes
 * Provides type definitions and contracts for AI providers
 *
 * @description
 * This module defines:
 * - Base provider interface that all providers must implement
 * - Provider result and health check result interfaces
 * - Provider registry for managing multiple providers
 *
 * @module hydra/core/interfaces
 */

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Result from a provider generation request
 * @typedef {Object} ProviderResult
 * @property {string} content - Generated content text
 * @property {string} model - Model identifier used for generation
 * @property {number} duration_ms - Execution duration in milliseconds
 * @property {number} [tokens] - Token count if available from provider
 * @property {boolean} [success] - Success status indicator
 * @property {string} [error] - Error message if generation failed
 */

/**
 * Result from a provider health check
 * @typedef {Object} HealthCheckResult
 * @property {boolean} available - Whether the provider is currently available
 * @property {string} [version] - Version information for the provider
 * @property {string[]} [models] - List of available models
 * @property {string} [path] - CLI path (for CLI-based providers)
 * @property {number} [latency_ms] - Health check response latency
 * @property {Date} [checkedAt] - Timestamp when check was performed
 */

/**
 * Options for provider generation requests
 * @typedef {Object} ProviderOptions
 * @property {string} [model] - Specific model to use for generation
 * @property {number} [temperature] - Sampling temperature (0-1, where 0 is deterministic)
 * @property {number} [maxTokens] - Maximum tokens to generate
 * @property {number} [timeout] - Request timeout in milliseconds
 * @property {boolean} [stream] - Whether to enable streaming mode
 */

/**
 * Provider statistics
 * @typedef {Object} ProviderStats
 * @property {number} totalRequests - Total number of requests made
 * @property {number} successfulRequests - Number of successful requests
 * @property {number} failedRequests - Number of failed requests
 * @property {number} totalTokens - Total tokens processed
 * @property {number} totalDuration - Total duration of all requests in ms
 * @property {Array<{error: string, timestamp: Date}>} errors - Recent errors (last 100)
 * @property {number} averageLatency - Average request latency
 * @property {string} successRate - Success rate as percentage string
 */

/**
 * Provider configuration
 * @typedef {Object} ProviderConfig
 * @property {string} [defaultModel] - Default model to use
 * @property {number} [costPerToken] - Cost per token (for cost estimation)
 * @property {number} [timeout] - Default timeout
 * @property {Object} [pool] - Connection pool configuration
 * @property {Object} [rateLimit] - Rate limiting configuration
 */

// =============================================================================
// BaseProvider Abstract Class
// =============================================================================

/**
 * Abstract Provider Interface
 * All AI providers must extend this class and implement required methods
 *
 * @abstract
 * @class
 *
 * @example
 * class MyProvider extends BaseProvider {
 *   constructor() {
 *     super('my-provider', { defaultModel: 'my-model' });
 *   }
 *
 *   async generate(prompt, options = {}) {
 *     // Implementation
 *   }
 *
 *   async *streamGenerate(prompt, options = {}) {
 *     // Implementation
 *   }
 *
 *   async healthCheck() {
 *     // Implementation
 *   }
 * }
 */
export class BaseProvider {
  /**
   * Creates a new provider instance
   *
   * @param {string} name - Unique provider identifier
   * @param {ProviderConfig} [config={}] - Provider configuration
   * @throws {Error} If instantiated directly (abstract class)
   */
  constructor(name, config = {}) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }

    /**
     * Unique provider name
     * @type {string}
     */
    this.name = name;

    /**
     * Provider configuration
     * @type {ProviderConfig}
     */
    this.config = config;

    /**
     * Cached health check result
     * @type {HealthCheckResult|null}
     * @private
     */
    this._healthCache = null;

    /**
     * Health cache expiry timestamp
     * @type {number}
     * @private
     */
    this._healthCacheExpiry = 0;

    /**
     * Provider statistics
     * @type {ProviderStats}
     * @private
     */
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalDuration: 0,
      errors: []
    };
  }

  /**
   * Generate completion from the provider
   * MUST be implemented by subclasses
   *
   * @abstract
   * @param {string} prompt - The prompt to send
   * @param {ProviderOptions} [options={}] - Generation options
   * @returns {Promise<ProviderResult>} Generated content with metadata
   * @throws {Error} If not implemented by subclass
   *
   * @example
   * const result = await provider.generate('What is 2+2?');
   * console.log(result.content); // '4'
   */
  async generate(prompt, options = {}) {
    throw new Error('generate() must be implemented by subclass');
  }

  /**
   * Stream completion from the provider
   * MUST be implemented by subclasses
   *
   * @abstract
   * @param {string} prompt - The prompt to send
   * @param {ProviderOptions} [options={}] - Generation options
   * @returns {AsyncGenerator<string>} Async generator yielding content chunks
   * @throws {Error} If not implemented by subclass
   *
   * @example
   * for await (const chunk of provider.streamGenerate('Tell a story')) {
   *   process.stdout.write(chunk);
   * }
   */
  async *streamGenerate(prompt, options = {}) {
    throw new Error('streamGenerate() must be implemented by subclass');
  }

  /**
   * Perform health check on the provider
   * MUST be implemented by subclasses
   *
   * @abstract
   * @returns {Promise<HealthCheckResult>} Health check result
   * @throws {Error} If not implemented by subclass
   *
   * @example
   * const health = await provider.healthCheck();
   * if (health.available) {
   *   console.log('Provider is ready');
   * }
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }

  /**
   * Get the provider name
   * @returns {string} Provider name
   */
  getName() {
    return this.name;
  }

  /**
   * Get provider statistics
   * @returns {ProviderStats} Statistics including computed averages
   *
   * @example
   * const stats = provider.getStats();
   * console.log(`Success rate: ${stats.successRate}%`);
   * console.log(`Average latency: ${stats.averageLatency}ms`);
   */
  getStats() {
    return {
      ...this._stats,
      averageLatency: this._stats.totalRequests > 0
        ? this._stats.totalDuration / this._stats.totalRequests
        : 0,
      successRate: this._stats.totalRequests > 0
        ? (this._stats.successfulRequests / this._stats.totalRequests * 100).toFixed(2)
        : '0.00'
    };
  }

  /**
   * Reset all statistics to initial values
   */
  resetStats() {
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalDuration: 0,
      errors: []
    };
  }

  /**
   * Update statistics after a request
   *
   * @param {ProviderResult} result - Result from the request
   * @param {boolean} success - Whether the request succeeded
   * @protected
   */
  _updateStats(result, success) {
    this._stats.totalRequests++;
    if (success) {
      this._stats.successfulRequests++;
      this._stats.totalTokens += result.tokens || 0;
      this._stats.totalDuration += result.duration_ms || 0;
    } else {
      this._stats.failedRequests++;
      this._stats.errors.push({
        error: result.error || 'Unknown error',
        timestamp: new Date()
      });
      // Keep only last 100 errors to prevent memory leaks
      if (this._stats.errors.length > 100) {
        this._stats.errors = this._stats.errors.slice(-100);
      }
    }
  }

  /**
   * Check if provider supports a specific model
   * Override in subclass to provide actual implementation
   *
   * @param {string} model - Model name to check
   * @returns {boolean} Whether model is supported
   */
  supportsModel(model) {
    return false; // Override in subclass
  }

  /**
   * Get the default model for this provider
   * @returns {string} Default model name
   */
  getDefaultModel() {
    return this.config.defaultModel || 'default';
  }

  /**
   * Get estimated cost per token
   * @returns {number} Cost per token (0 for free providers)
   */
  getCostPerToken() {
    return this.config.costPerToken || 0;
  }

  /**
   * Get current provider status
   * Can be overridden to provide detailed status
   *
   * @returns {Object} Provider status
   */
  getStatus() {
    return {
      name: this.name,
      healthy: this._healthCache?.available ?? false,
      lastCheck: this._healthCacheExpiry > 0
        ? new Date(this._healthCacheExpiry - 30000).toISOString()
        : null,
      stats: this.getStats()
    };
  }

  /**
   * Get connection pool status
   * Override in subclass if using connection pooling
   *
   * @returns {Object|null} Pool status or null
   */
  getPoolStatus() {
    return null;
  }

  /**
   * Get circuit breaker status
   * Override in subclass if using circuit breaker
   *
   * @returns {Object|null} Circuit status or null
   */
  getCircuitStatus() {
    return null;
  }
}

// =============================================================================
// ProviderRegistry Class
// =============================================================================

/**
 * Provider Registry - Manages multiple AI providers
 * Provides centralized access and health management
 *
 * @class
 *
 * @example
 * const registry = new ProviderRegistry();
 * registry.register('ollama', ollamaProvider, true); // default
 * registry.register('gemini', geminiProvider);
 *
 * const defaultProvider = registry.getDefault();
 * const specificProvider = registry.get('gemini');
 */
export class ProviderRegistry {
  /**
   * Creates a new provider registry
   */
  constructor() {
    /**
     * Map of registered providers
     * @type {Map<string, BaseProvider>}
     * @private
     */
    this._providers = new Map();

    /**
     * Name of the default provider
     * @type {string|null}
     * @private
     */
    this._defaultProvider = null;
  }

  /**
   * Register a provider with the registry
   *
   * @param {string} name - Unique provider name
   * @param {BaseProvider} provider - Provider instance
   * @param {boolean} [isDefault=false] - Set as default provider
   * @throws {Error} If provider doesn't extend BaseProvider
   *
   * @example
   * registry.register('ollama', new OllamaProvider(), true);
   */
  register(name, provider, isDefault = false) {
    if (!(provider instanceof BaseProvider)) {
      throw new Error('Provider must extend BaseProvider');
    }
    this._providers.set(name, provider);
    if (isDefault || !this._defaultProvider) {
      this._defaultProvider = name;
    }
  }

  /**
   * Unregister a provider from the registry
   *
   * @param {string} name - Provider name to remove
   * @returns {boolean} Whether provider was removed
   */
  unregister(name) {
    const removed = this._providers.delete(name);
    if (removed && this._defaultProvider === name) {
      // Set new default if available
      const firstKey = this._providers.keys().next().value;
      this._defaultProvider = firstKey || null;
    }
    return removed;
  }

  /**
   * Get a provider by name
   *
   * @param {string} name - Provider name
   * @returns {BaseProvider|null} Provider instance or null if not found
   *
   * @example
   * const gemini = registry.get('gemini');
   * if (gemini) {
   *   await gemini.generate('Hello');
   * }
   */
  get(name) {
    return this._providers.get(name) || null;
  }

  /**
   * Get the default provider
   * @returns {BaseProvider|null} Default provider or null if none registered
   */
  getDefault() {
    return this._providers.get(this._defaultProvider) || null;
  }

  /**
   * Set a provider as the default
   *
   * @param {string} name - Provider name to set as default
   * @returns {boolean} Whether provider was set as default
   */
  setDefault(name) {
    if (this._providers.has(name)) {
      this._defaultProvider = name;
      return true;
    }
    return false;
  }

  /**
   * Get all registered provider names
   * @returns {string[]} Array of provider names
   */
  getProviderNames() {
    return Array.from(this._providers.keys());
  }

  /**
   * Get all providers as an object
   * @returns {Object<string, BaseProvider>} Object mapping names to providers
   */
  getAll() {
    return Object.fromEntries(this._providers);
  }

  /**
   * Get number of registered providers
   * @returns {number} Provider count
   */
  get size() {
    return this._providers.size;
  }

  /**
   * Check if a provider is registered
   *
   * @param {string} name - Provider name to check
   * @returns {boolean} Whether provider is registered
   */
  has(name) {
    return this._providers.has(name);
  }

  /**
   * Perform health check on all providers
   *
   * @returns {Promise<Map<string, HealthCheckResult>>} Map of provider names to health results
   *
   * @example
   * const results = await registry.healthCheckAll();
   * for (const [name, result] of results) {
   *   console.log(`${name}: ${result.available ? 'OK' : 'FAILED'}`);
   * }
   */
  async healthCheckAll() {
    const results = new Map();
    const checks = Array.from(this._providers.entries()).map(
      async ([name, provider]) => {
        try {
          const result = await provider.healthCheck();
          results.set(name, result);
        } catch (error) {
          results.set(name, { available: false, error: error.message });
        }
      }
    );
    await Promise.all(checks);
    return results;
  }

  /**
   * Get the first available provider
   * Performs health checks until an available provider is found
   *
   * @returns {Promise<BaseProvider|null>} First available provider or null
   *
   * @example
   * const provider = await registry.getFirstAvailable();
   * if (provider) {
   *   await provider.generate('Hello');
   * } else {
   *   console.error('No providers available');
   * }
   */
  async getFirstAvailable() {
    for (const [name, provider] of this._providers) {
      try {
        const health = await provider.healthCheck();
        if (health.available) {
          return provider;
        }
      } catch {
        // Continue to next provider
      }
    }
    return null;
  }

  /**
   * Iterate over all providers
   * @returns {IterableIterator<[string, BaseProvider]>}
   */
  [Symbol.iterator]() {
    return this._providers.entries();
  }
}

// =============================================================================
// Type Exports for External Use
// =============================================================================

/**
 * Type exports for JSDoc type annotations
 * @constant
 */
export const Types = {
  /**
   * Provider result type
   * @type {ProviderResult}
   */
  ProviderResult: /** @type {ProviderResult} */ (null),

  /**
   * Health check result type
   * @type {HealthCheckResult}
   */
  HealthCheckResult: /** @type {HealthCheckResult} */ (null),

  /**
   * Provider options type
   * @type {ProviderOptions}
   */
  ProviderOptions: /** @type {ProviderOptions} */ (null),

  /**
   * Provider stats type
   * @type {ProviderStats}
   */
  ProviderStats: /** @type {ProviderStats} */ (null),

  /**
   * Provider config type
   * @type {ProviderConfig}
   */
  ProviderConfig: /** @type {ProviderConfig} */ (null)
};

// Default export
export default {
  BaseProvider,
  ProviderRegistry,
  Types
};
