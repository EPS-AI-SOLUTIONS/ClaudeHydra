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

// Default export
export default Hydra;
