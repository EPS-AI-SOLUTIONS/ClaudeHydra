/**
 * @fileoverview HYDRA - Hybrid AI Orchestration System
 * Gemini CLI + Ollama integration with intelligent routing
 *
 * @description
 * Architecture:
 * - Ollama (local): Fast, free, for routing/simple tasks
 * - Gemini (cloud): High quality, for complex tasks
 *
 * Features:
 * - Provider abstraction with BaseProvider interface
 * - Connection pooling and rate limiting
 * - Circuit breaker pattern for fault tolerance
 * - Health check caching
 * - Centralized configuration management
 * - Comprehensive statistics and metrics
 * - Standardized retry logic with exponential backoff
 *
 * @module hydra
 * @version 2.0.0
 */

import { getOllamaProvider, resetOllamaProvider } from './providers/ollama-provider.js';
import { getGeminiProvider, resetGeminiProvider } from './providers/gemini-provider.js';
import { route, routeWithCost, TASK_CATEGORIES } from './pipeline/router.js';
import { execute, quickExecute, createDefaultPipeline, PipelineBuilder } from './pipeline/executor.js';
import { getConfigManager, DEFAULT_CONFIG } from './core/config.js';
import { getStatsCollector } from './core/stats.js';
import { HealthCheckCache } from './core/cache.js';
import { ProviderRegistry } from './core/interfaces.js';

// Re-export legacy clients for backward compatibility
import * as ollamaClient from './providers/ollama-client.js';
import * as geminiClient from './providers/gemini-client.js';

/**
 * @typedef {Object} HydraOptions
 * @property {Object} [config] - Configuration overrides
 * @property {boolean} [verbose=false] - Enable verbose logging
 */

/**
 * @typedef {Object} ProcessResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} content - Generated content
 * @property {Object} metadata - Execution metadata
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {Object} ollama - Ollama health status
 * @property {Object} gemini - Gemini health status
 * @property {boolean} ready - Whether at least one provider is available
 * @property {string} timestamp - ISO timestamp of check
 */

/**
 * @typedef {Object} HydraStats
 * @property {Object} global - Global statistics summary
 * @property {Object} providers - Per-provider statistics
 * @property {Object} pools - Connection pool status
 * @property {Object} circuits - Circuit breaker status
 */

/**
 * HYDRA main class - Hybrid AI Orchestration System
 * @class
 */
export class Hydra {
  /**
   * Creates a new Hydra instance
   * @param {HydraOptions} [options={}] - Configuration options
   */
  constructor(options = {}) {
    // Initialize configuration
    this.config = getConfigManager(options.config || {});
    this.verbose = options.verbose || this.config.getValue('pipeline.verbose', false);

    // Initialize providers
    this.ollamaProvider = getOllamaProvider();
    this.geminiProvider = getGeminiProvider();

    // Initialize provider registry
    this.providers = new ProviderRegistry();
    this.providers.register('ollama', this.ollamaProvider, true);
    this.providers.register('gemini', this.geminiProvider);

    // Initialize health check cache with auto-refresh
    this.healthCache = new HealthCheckCache({
      ttl: this.config.getValue('cache.healthCheck.ttl', 30000),
      staleTTL: this.config.getValue('cache.healthCheck.staleTTL', 60000),
      autoRefresh: this.config.getValue('cache.healthCheck.autoRefresh', true)
    });
    this.healthCache.register('ollama', () => this.ollamaProvider._performHealthCheck());
    this.healthCache.register('gemini', () => this.geminiProvider._performHealthCheck());

    // Initialize stats collector
    this.statsCollector = getStatsCollector();

    // Legacy stats for backward compatibility
    this.stats = {
      totalRequests: 0,
      ollamaRequests: 0,
      geminiRequests: 0,
      totalCostSaved: 0,
      averageLatency: 0
    };

    // Track initialization state
    this._initialized = false;
  }

  /**
   * Initialize HYDRA - loads models and performs health checks
   * Call this at application startup to ensure all providers are ready
   * @param {Object} [options={}] - Initialization options
   * @param {boolean} [options.refreshModels=true] - Whether to refresh Gemini models
   * @param {boolean} [options.healthCheck=true] - Whether to perform initial health check
   * @returns {Promise<Object>} Initialization result with provider status
   */
  async initialize(options = {}) {
    const { refreshModels = true, healthCheck = true } = options;
    const startTime = Date.now();

    console.log('[Hydra] Initializing...');

    const result = {
      success: true,
      gemini: { modelsReady: false, modelCount: 0, bestModel: null },
      ollama: { available: false },
      duration_ms: 0
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
          modelSelection: this.geminiProvider.getModelSelection()
        };
        console.log(`[Hydra] Gemini models ready: ${result.gemini.modelCount} models, best: ${result.gemini.bestModel}`);
      } catch (error) {
        console.error('[Hydra] Failed to initialize Gemini models:', error.message);
        result.gemini.error = error.message;
      }
    }

    // Perform health check if requested
    if (healthCheck) {
      try {
        const health = await this.healthCheck(true);
        result.ollama.available = health.ollama?.available || false;
        result.gemini.cliAvailable = health.gemini?.available || false;
        console.log(`[Hydra] Health check: Ollama=${result.ollama.available}, Gemini CLI=${result.gemini.cliAvailable}`);
      } catch (error) {
        console.warn('[Hydra] Health check failed:', error.message);
      }
    }

    result.duration_ms = Date.now() - startTime;
    this._initialized = true;

    console.log(`[Hydra] Initialization complete in ${result.duration_ms}ms`);
    return result;
  }

  /**
   * Check if Hydra has been initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Refresh Gemini models (can be called periodically)
   * @returns {Promise<Object>} Updated model selection
   */
  async refreshGeminiModels() {
    console.log('[Hydra] Refreshing Gemini models...');
    const result = await this.geminiProvider.refreshModels();
    console.log(`[Hydra] Models refreshed. Best: ${result?.model}`);
    return result;
  }

  /**
   * Process a prompt through the HYDRA pipeline
   * @param {string} prompt - User prompt
   * @param {Object} [options={}] - Processing options
   * @param {boolean} [options.verbose] - Override verbose setting
   * @returns {Promise<ProcessResult>} Result with content and metadata
   */
  async process(prompt, options = {}) {
    this.stats.totalRequests++;

    const result = await execute(prompt, {
      verbose: this.verbose,
      ...options
    });

    // Update legacy stats
    if (result.metadata) {
      if (result.metadata.provider === 'ollama') {
        this.stats.ollamaRequests++;
      } else {
        this.stats.geminiRequests++;
      }

      if (result.metadata.costSavings) {
        this.stats.totalCostSaved += result.metadata.costSavings;
      }

      const latency = result.metadata.totalDuration_ms || result.metadata.duration_ms || 0;
      this.stats.averageLatency =
        (this.stats.averageLatency * (this.stats.totalRequests - 1) + latency) /
        this.stats.totalRequests;
    }

    return result;
  }

  /**
   * Quick query - optimized for speed, skips planning
   * @param {string} prompt - User prompt
   * @returns {Promise<ProcessResult>} Quick execution result
   */
  async quick(prompt) {
    this.stats.totalRequests++;
    const result = await quickExecute(prompt);

    if (result.provider === 'ollama') {
      this.stats.ollamaRequests++;
    } else {
      this.stats.geminiRequests++;
    }

    return result;
  }

  /**
   * Force Ollama execution (cost=$0)
   * @param {string} prompt - User prompt
   * @param {string} [model] - Specific model to use
   * @returns {Promise<Object>} Ollama response
   */
  async ollama(prompt, model = undefined) {
    this.stats.totalRequests++;
    this.stats.ollamaRequests++;
    return this.ollamaProvider.generate(prompt, { model });
  }

  /**
   * Alias for ollama() method
   * @param {string} prompt - User prompt
   * @param {string} [model] - Specific model to use
   * @returns {Promise<Object>} Ollama response
   */
  async ollamaQuery(prompt, model = undefined) {
    return this.ollama(prompt, model);
  }

  /**
   * Force Gemini execution (best quality)
   * @param {string} prompt - User prompt
   * @returns {Promise<Object>} Gemini response
   */
  async gemini(prompt) {
    this.stats.totalRequests++;
    this.stats.geminiRequests++;
    return this.geminiProvider.generate(prompt);
  }

  /**
   * Alias for gemini() method
   * @param {string} prompt - User prompt
   * @returns {Promise<Object>} Gemini response
   */
  async geminiQuery(prompt) {
    return this.gemini(prompt);
  }

  /**
   * Get routing decision without executing
   * @param {string} prompt - User prompt to analyze
   * @returns {Promise<Object>} Routing analysis with cost estimates
   */
  async analyze(prompt) {
    return routeWithCost(prompt);
  }

  /**
   * Health check for all providers with caching
   * @param {boolean} [forceRefresh=false] - Force fresh health check
   * @returns {Promise<HealthCheckResult>} Health status for all providers
   */
  async healthCheck(forceRefresh = false) {
    const [ollamaHealth, geminiHealth] = await Promise.all([
      this.healthCache.get('ollama', forceRefresh),
      this.healthCache.get('gemini', forceRefresh)
    ]);

    return {
      ollama: ollamaHealth,
      gemini: geminiHealth,
      ready: ollamaHealth.available || geminiHealth.available,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get comprehensive usage statistics
   * @returns {HydraStats} Statistics from all sources
   */
  getStats() {
    const summary = this.statsCollector.getSummary();
    const ollamaStats = this.ollamaProvider.getStats();
    const geminiStats = this.geminiProvider.getStats();

    return {
      // Legacy stats
      ...this.stats,
      ollamaPercentage: this.stats.totalRequests > 0
        ? (this.stats.ollamaRequests / this.stats.totalRequests * 100).toFixed(1)
        : 0,
      estimatedMonthlySavings: this.stats.totalCostSaved * 30,

      // New detailed stats
      global: summary,
      providers: {
        ollama: ollamaStats,
        gemini: geminiStats
      },
      pools: {
        ollama: this.ollamaProvider.getPoolStatus(),
        gemini: this.geminiProvider.getPoolStatus()
      },
      circuits: {
        ollama: this.ollamaProvider.getCircuitStatus(),
        gemini: this.geminiProvider.getCircuitStatus()
      }
    };
  }

  /**
   * Get time-based trends
   * @param {number} [period=3600000] - Time period in ms (default: 1 hour)
   * @returns {Object} Trend data
   */
  getTrends(period = 3600000) {
    return this.statsCollector.getTrends(period);
  }

  /**
   * Export metrics in Prometheus format
   * @returns {string} Prometheus-formatted metrics
   */
  exportMetrics() {
    return this.statsCollector.exportPrometheus();
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    this.statsCollector.reset();
    this.ollamaProvider.resetStats();
    this.geminiProvider.resetStats();

    this.stats = {
      totalRequests: 0,
      ollamaRequests: 0,
      geminiRequests: 0,
      totalCostSaved: 0,
      averageLatency: 0
    };
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return this.config.get();
  }

  /**
   * Update configuration value
   * @param {string} path - Dot-separated path (e.g., 'providers.ollama.timeout')
   * @param {*} value - Value to set
   */
  setConfig(path, value) {
    this.config.setValue(path, value);
  }

  /**
   * Get provider status
   * @param {string} providerName - Name of provider ('ollama' or 'gemini')
   * @returns {Object|null} Provider status or null if not found
   */
  getProviderStatus(providerName) {
    const provider = this.providers.get(providerName);
    return provider ? provider.getStatus() : null;
  }

  /**
   * Get all provider statuses
   * @returns {Object} Status for all providers
   */
  getAllProviderStatuses() {
    return {
      ollama: this.ollamaProvider.getStatus(),
      gemini: this.geminiProvider.getStatus()
    };
  }

  /**
   * Create a custom pipeline
   * @returns {PipelineBuilder} New pipeline builder instance
   */
  createPipeline() {
    return new PipelineBuilder();
  }

  /**
   * Shutdown and cleanup resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.healthCache.stopAutoRefresh();
    // Additional cleanup can be added here
  }
}

// Singleton instance
let hydraInstance = null;

/**
 * Get or create HYDRA singleton instance
 * @param {HydraOptions} [options={}] - Configuration options (only used on first call)
 * @returns {Hydra} Hydra instance
 */
export function getHydra(options = {}) {
  if (!hydraInstance) {
    hydraInstance = new Hydra(options);
  }
  return hydraInstance;
}

/**
 * Initialize HYDRA and wait for all providers to be ready
 * This is the recommended way to start HYDRA in applications
 * @param {HydraOptions} [options={}] - Configuration options
 * @param {Object} [initOptions={}] - Initialization options
 * @param {boolean} [initOptions.refreshModels=true] - Whether to refresh Gemini models
 * @param {boolean} [initOptions.healthCheck=true] - Whether to perform initial health check
 * @returns {Promise<{hydra: Hydra, initResult: Object}>} Hydra instance and initialization result
 * @example
 * // At application startup:
 * const { hydra, initResult } = await initializeHydra();
 * console.log('Best model:', initResult.gemini.bestModel);
 *
 * // Then use hydra normally:
 * const result = await hydra.process('Hello!');
 */
export async function initializeHydra(options = {}, initOptions = {}) {
  const hydra = getHydra(options);
  const initResult = await hydra.initialize(initOptions);
  return { hydra, initResult };
}

/**
 * Reset HYDRA instance (primarily for testing)
 */
export function resetHydra() {
  if (hydraInstance) {
    hydraInstance.shutdown();
  }
  hydraInstance = null;
  resetOllamaProvider();
  resetGeminiProvider();
}

// Re-export core modules
export * from './core/index.js';

// Export providers
export { getOllamaProvider, getGeminiProvider };

// Export pipeline utilities
export { route, routeWithCost, execute, quickExecute, TASK_CATEGORIES };

// Export legacy clients for backward compatibility
export { ollamaClient as ollama, geminiClient as gemini };

// Export configuration
export { DEFAULT_CONFIG, getConfigManager };

// Export initialization utilities
// initializeHydra is exported via its function declaration above

// Default export
export default Hydra;
