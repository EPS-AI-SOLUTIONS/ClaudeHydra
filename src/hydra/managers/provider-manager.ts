/**
 * @fileoverview HydraProviderManager - Extracted provider management from Hydra God Object
 *
 * @description
 * Encapsulates all provider-related responsibilities:
 * - Provider initialization (llamacpp + gemini)
 * - Provider registry management
 * - Health check cache management
 * - Direct provider calls (llamacpp, gemini, llamacppCode, llamacppJson)
 * - Provider status methods
 *
 * This is part of the Hydra decomposition effort, extracting the provider
 * management concern into a dedicated, cohesive class.
 *
 * @module hydra/managers/provider-manager
 * @version 2.0.0
 */

import { HealthCheckCache } from '../core/cache.js';
import { ProviderRegistry } from '../core/interfaces.js';
import { getGeminiProvider, resetGeminiProvider } from '../providers/gemini-provider.js';
import { getLlamaCppProvider, resetLlamaCppProvider } from '../providers/llamacpp-provider.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * @typedef {Object} ProviderManagerConfig
 * @property {import('../core/config.js').ConfigManager} configManager - ConfigManager instance
 */

/**
 * @typedef {Object} ProviderInitOptions
 * @property {boolean} [refreshModels=true] - Whether to refresh Gemini models on init
 * @property {boolean} [healthCheck=true] - Whether to perform initial health check
 */

/**
 * @typedef {Object} ProviderInitResult
 * @property {boolean} success - Whether initialization succeeded
 * @property {Object} gemini - Gemini initialization status
 * @property {boolean} gemini.modelsReady - Whether Gemini models are loaded
 * @property {number} gemini.modelCount - Number of available Gemini models
 * @property {string|null} gemini.bestModel - Best available Gemini model
 * @property {string} [gemini.thinkingModel] - Gemini thinking model
 * @property {Object} [gemini.modelSelection] - Full model selection info
 * @property {boolean} [gemini.cliAvailable] - Whether Gemini CLI is available
 * @property {string} [gemini.error] - Error message if Gemini init failed
 * @property {Object} llamacpp - LlamaCpp initialization status
 * @property {boolean} llamacpp.available - Whether LlamaCpp is available
 * @property {number} duration_ms - Initialization duration in milliseconds
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {Object} llamacpp - LlamaCpp health status
 * @property {Object} gemini - Gemini health status
 * @property {boolean} ready - Whether at least one provider is available
 * @property {string} timestamp - ISO timestamp of check
 */

// =============================================================================
// HydraProviderManager Class
// =============================================================================

/**
 * Manages AI provider lifecycle, health checks, and direct invocations.
 *
 * Extracted from the monolithic Hydra class to achieve single-responsibility
 * for provider orchestration. Owns the provider registry, health cache,
 * and all direct-call methods for llamacpp and gemini.
 *
 * @class
 *
 * @example
 * import { getConfigManager } from '../core/config.js';
 *
 * const config = getConfigManager();
 * const providerManager = new HydraProviderManager(config);
 *
 * // Initialize providers
 * const result = await providerManager.initialize();
 * console.log('LlamaCpp available:', result.llamacpp.available);
 *
 * // Direct provider call
 * const response = await providerManager.llamacpp('Explain async/await');
 */
export class HydraProviderManager {
  /**
   * Creates a new HydraProviderManager instance
   *
   * @param {import('../core/config.js').ConfigManager} config - ConfigManager instance
   */
  constructor(config) {
    /**
     * Configuration manager reference
     * @type {import('../core/config.js').ConfigManager}
     * @private
     */
    this._config = config;

    /**
     * LlamaCpp provider instance
     * @type {import('../providers/llamacpp-provider.js').LlamaCppProvider}
     */
    this.llamacppProvider = getLlamaCppProvider();

    /**
     * Gemini provider instance
     * @type {import('../providers/gemini-provider.js').GeminiProvider}
     */
    this.geminiProvider = getGeminiProvider();

    /**
     * Provider registry for centralized access
     * @type {ProviderRegistry}
     */
    this.providers = new ProviderRegistry();
    this.providers.register('llamacpp', this.llamacppProvider, true);
    this.providers.register('gemini', this.geminiProvider);

    /**
     * Health check cache with auto-refresh
     * @type {HealthCheckCache}
     * @private
     */
    this._healthCache = new HealthCheckCache({
      ttl: this._config.getValue('cache.healthCheck.ttl', 30000),
      staleTTL: this._config.getValue('cache.healthCheck.staleTTL', 60000),
      autoRefresh: this._config.getValue('cache.healthCheck.autoRefresh', true),
    });
    this._healthCache.register('llamacpp', () => this.llamacppProvider._performHealthCheck());
    this._healthCache.register('gemini', () => this.geminiProvider._performHealthCheck());

    /**
     * Whether providers have been initialized
     * @type {boolean}
     * @private
     */
    this._initialized = false;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize providers - load models and perform health checks.
   *
   * Call this at application startup to ensure all providers are ready.
   * Initializes Gemini model discovery and performs a health check on
   * both providers in parallel.
   *
   * @param {ProviderInitOptions} [options={}] - Initialization options
   * @returns {Promise<ProviderInitResult>} Initialization result with provider status
   *
   * @example
   * const result = await providerManager.initialize({ refreshModels: true });
   * if (result.gemini.modelsReady) {
   *   console.log(`Best model: ${result.gemini.bestModel}`);
   * }
   */
  async initialize(options = {}) {
    const { refreshModels = true, healthCheck = true } = options;
    const startTime = Date.now();

    console.log('[ProviderManager] Initializing providers...');

    /** @type {ProviderInitResult} */
    const result = {
      success: true,
      gemini: { modelsReady: false, modelCount: 0, bestModel: null },
      llamacpp: { available: false },
      duration_ms: 0,
    };

    // Wait for Gemini models to be ready
    if (refreshModels) {
      try {
        await this.geminiProvider.waitForModelsReady();
        result.gemini = {
          modelsReady: this.geminiProvider.isModelsReady(),
          modelCount: this.geminiProvider.getAvailableModels().length,
          bestModel: this.geminiProvider.getBestModel(),
          thinkingModel: this.geminiProvider.getThinkingModel(),
          modelSelection: this.geminiProvider.getModelSelection(),
        };
        console.log(
          `[ProviderManager] Gemini models ready: ${result.gemini.modelCount} models, best: ${result.gemini.bestModel}`,
        );
      } catch (error) {
        console.error('[ProviderManager] Failed to initialize Gemini models:', error.message);
        result.gemini.error = error.message;
      }
    }

    // Perform health check if requested
    if (healthCheck) {
      try {
        const health = await this.healthCheck(true);
        result.llamacpp.available = health.llamacpp?.available || false;
        result.gemini.cliAvailable = health.gemini?.available || false;
        console.log(
          `[ProviderManager] Health check: LlamaCpp=${result.llamacpp.available}, Gemini CLI=${result.gemini.cliAvailable}`,
        );
      } catch (error) {
        console.warn('[ProviderManager] Health check failed:', error.message);
      }
    }

    result.duration_ms = Date.now() - startTime;
    this._initialized = true;

    console.log(`[ProviderManager] Initialization complete in ${result.duration_ms}ms`);
    return result;
  }

  /**
   * Check if providers have been initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this._initialized;
  }

  // ===========================================================================
  // Health Checks
  // ===========================================================================

  /**
   * Health check for all providers with caching.
   *
   * Returns cached results unless forceRefresh is true. Uses the
   * HealthCheckCache for TTL-based caching with stale-while-revalidate
   * semantics.
   *
   * @param {boolean} [forceRefresh=false] - Force fresh health check, bypassing cache
   * @returns {Promise<HealthCheckResult>} Health status for all providers
   *
   * @example
   * const health = await providerManager.healthCheck();
   * if (health.ready) {
   *   console.log('At least one provider is available');
   * }
   */
  async healthCheck(forceRefresh = false) {
    const [llamacppHealth, geminiHealth] = await Promise.all([
      this._healthCache.get('llamacpp', forceRefresh),
      this._healthCache.get('gemini', forceRefresh),
    ]);

    return {
      llamacpp: llamacppHealth,
      gemini: geminiHealth,
      ready: llamacppHealth.available || geminiHealth.available,
      timestamp: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // Direct Provider Calls
  // ===========================================================================

  /**
   * Direct LlamaCpp generation (cost=$0).
   *
   * Bypasses the routing pipeline and calls the LlamaCpp provider directly.
   * Useful when you explicitly want local inference.
   *
   * @param {string} prompt - User prompt
   * @param {Object} [options={}] - Generation options (model, taskType, tool, temperature, etc.)
   * @returns {Promise<import('../core/interfaces.js').ProviderResult>} LlamaCpp response
   *
   * @example
   * const result = await providerManager.llamacpp('What is 2+2?');
   * console.log(result.content);
   */
  async llamacpp(prompt, options = {}) {
    return this.llamacppProvider.generate(prompt, options);
  }

  /**
   * Direct LlamaCpp code generation.
   *
   * Uses the specialized code generation tool on the LlamaCpp provider.
   * Supports tasks like generate, explain, refactor, document, review, fix.
   *
   * @param {string} task - Code task type (generate, explain, refactor, document, review, fix)
   * @param {Object} [params={}] - Code generation parameters (code, description, language)
   * @returns {Promise<Object>} Code generation result
   *
   * @example
   * const result = await providerManager.llamacppCode('explain', {
   *   code: 'const x = arr.reduce((a, b) => a + b, 0);',
   *   language: 'javascript'
   * });
   */
  async llamacppCode(task, params = {}) {
    return this.llamacppProvider.generateCode(task, params);
  }

  /**
   * Direct LlamaCpp JSON generation.
   *
   * Generates structured JSON output conforming to the provided schema.
   * Uses the LlamaCpp provider's grammar-constrained generation.
   *
   * @param {string} prompt - Input prompt
   * @param {Object} [schema={}] - JSON schema for the output
   * @returns {Promise<Object>} JSON result
   *
   * @example
   * const result = await providerManager.llamacppJson(
   *   'Extract entities from: "John works at Google in NYC"',
   *   { type: 'object', properties: { name: { type: 'string' }, company: { type: 'string' } } }
   * );
   */
  async llamacppJson(prompt, schema = {}) {
    return this.llamacppProvider.generateJson(prompt, schema);
  }

  /**
   * Direct Gemini generation (best quality).
   *
   * Bypasses the routing pipeline and calls the Gemini provider directly.
   * Useful when you explicitly want cloud-quality inference.
   *
   * @param {string} prompt - User prompt
   * @returns {Promise<import('../core/interfaces.js').ProviderResult>} Gemini response
   *
   * @example
   * const result = await providerManager.gemini('Write a haiku about code');
   * console.log(result.content);
   */
  async gemini(prompt) {
    return this.geminiProvider.generate(prompt);
  }

  // ===========================================================================
  // Gemini Model Management
  // ===========================================================================

  /**
   * Refresh Gemini models (can be called periodically).
   *
   * Triggers a fresh model discovery against the Gemini API and updates
   * the best model selection.
   *
   * @returns {Promise<Object>} Updated model selection
   */
  async refreshGeminiModels() {
    console.log('[ProviderManager] Refreshing Gemini models...');
    const result = await this.geminiProvider.refreshModels();
    console.log(`[ProviderManager] Models refreshed. Best: ${result?.model}`);
    return result;
  }

  // ===========================================================================
  // Provider Status & Introspection
  // ===========================================================================

  /**
   * Get status for a single provider by name.
   *
   * @param {string} providerName - Name of provider ('llamacpp' or 'gemini')
   * @returns {Object|null} Provider status or null if not found
   *
   * @example
   * const status = providerManager.getProviderStatus('llamacpp');
   * console.log('Healthy:', status.healthy);
   */
  getProviderStatus(providerName) {
    const provider = this.providers.get(providerName);
    return provider ? provider.getStatus() : null;
  }

  /**
   * Get status for all registered providers.
   *
   * @returns {Object} Status object with llamacpp and gemini keys
   *
   * @example
   * const statuses = providerManager.getAllProviderStatuses();
   * console.log('LlamaCpp:', statuses.llamacpp.healthy);
   * console.log('Gemini:', statuses.gemini.healthy);
   */
  getAllProviderStatuses() {
    return {
      llamacpp: this.llamacppProvider.getStatus(),
      gemini: this.geminiProvider.getStatus(),
    };
  }

  /**
   * Get connection pool status for all providers.
   *
   * @returns {Object} Pool status keyed by provider name
   */
  getPoolStatus() {
    return {
      llamacpp: this.llamacppProvider.getPoolStatus(),
      gemini: this.geminiProvider.getPoolStatus(),
    };
  }

  /**
   * Get circuit breaker status for all providers.
   *
   * @returns {Object} Circuit breaker status keyed by provider name
   */
  getCircuitStatus() {
    return {
      llamacpp: this.llamacppProvider.getCircuitStatus(),
      gemini: this.geminiProvider.getCircuitStatus(),
    };
  }

  /**
   * Get provider statistics for all providers.
   *
   * @returns {Object} Stats keyed by provider name
   */
  getProviderStats() {
    return {
      llamacpp: this.llamacppProvider.getStats(),
      gemini: this.geminiProvider.getStats(),
    };
  }

  // ===========================================================================
  // Provider Access
  // ===========================================================================

  /**
   * Set MCP invoker on the LlamaCpp provider.
   *
   * This must be called to enable LlamaCpp MCP tool calls.
   * The invoker is a function that takes an MCP tool call descriptor
   * and returns the tool result.
   *
   * @param {Function} invoker - Function that invokes MCP tools
   *
   * @example
   * providerManager.setMcpInvoker(async (toolCall) => {
   *   return await mcpClient.callTool(toolCall.name, toolCall.arguments);
   * });
   */
  setMcpInvoker(invoker) {
    this.llamacppProvider.setMcpInvoker(invoker);
  }

  /**
   * Get the raw LlamaCpp provider instance for advanced usage.
   *
   * @returns {import('../providers/llamacpp-provider.js').LlamaCppProvider} LlamaCpp provider instance
   */
  getLlamaCppProvider() {
    return this.llamacppProvider;
  }

  /**
   * Get the raw Gemini provider instance for advanced usage.
   *
   * @returns {import('../providers/gemini-provider.js').GeminiProvider} Gemini provider instance
   */
  getGeminiProvider() {
    return this.geminiProvider;
  }

  /**
   * Get the provider registry.
   *
   * @returns {ProviderRegistry} Provider registry instance
   */
  getRegistry() {
    return this.providers;
  }

  /**
   * Get the health check cache.
   *
   * @returns {HealthCheckCache} Health check cache instance
   */
  getHealthCache() {
    return this._healthCache;
  }

  // ===========================================================================
  // Stats Reset
  // ===========================================================================

  /**
   * Reset statistics on all providers.
   */
  resetProviderStats() {
    this.llamacppProvider.resetStats();
    this.geminiProvider.resetStats();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Shutdown the provider manager.
   *
   * Stops health cache auto-refresh timers. Should be called during
   * application shutdown to prevent dangling timers.
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    this._healthCache.stopAutoRefresh();
    this._initialized = false;
    console.log('[ProviderManager] Shutdown complete.');
  }

  /**
   * Reset all providers and the manager state.
   *
   * Primarily intended for testing. Resets both provider singletons
   * and clears all cached state.
   */
  reset() {
    this._healthCache.stopAutoRefresh();
    this._healthCache.clearAll();
    this._initialized = false;

    resetLlamaCppProvider();
    resetGeminiProvider();

    // Re-acquire fresh provider instances
    this.llamacppProvider = getLlamaCppProvider();
    this.geminiProvider = getGeminiProvider();

    // Rebuild registry
    this.providers = new ProviderRegistry();
    this.providers.register('llamacpp', this.llamacppProvider, true);
    this.providers.register('gemini', this.geminiProvider);

    // Rebuild health cache
    this._healthCache = new HealthCheckCache({
      ttl: this._config.getValue('cache.healthCheck.ttl', 30000),
      staleTTL: this._config.getValue('cache.healthCheck.staleTTL', 60000),
      autoRefresh: this._config.getValue('cache.healthCheck.autoRefresh', true),
    });
    this._healthCache.register('llamacpp', () => this.llamacppProvider._performHealthCheck());
    this._healthCache.register('gemini', () => this.geminiProvider._performHealthCheck());

    console.log('[ProviderManager] Reset complete.');
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** @type {HydraProviderManager|null} */
let _instance = null;

/**
 * Get or create the HydraProviderManager singleton.
 *
 * @param {import('../core/config.js').ConfigManager} [config] - ConfigManager instance (required on first call)
 * @returns {HydraProviderManager} Provider manager instance
 * @throws {Error} If called without config on first invocation
 *
 * @example
 * import { getConfigManager } from '../core/config.js';
 *
 * const config = getConfigManager();
 * const providerManager = getProviderManager(config);
 * await providerManager.initialize();
 */
export function getProviderManager(config) {
  if (!_instance) {
    if (!config) {
      throw new Error(
        '[ProviderManager] ConfigManager is required on first call to getProviderManager()',
      );
    }
    _instance = new HydraProviderManager(config);
  }
  return _instance;
}

/**
 * Reset the provider manager singleton (primarily for testing).
 */
export function resetProviderManager() {
  if (_instance) {
    _instance.shutdown();
  }
  _instance = null;
}

// =============================================================================
// Default Export
// =============================================================================

export default HydraProviderManager;
