/**
 * @fileoverview HYDRA Stats Manager - Centralized statistics management
 * Extracted from the Hydra God Object to encapsulate all statistics concerns.
 *
 * @description
 * Manages:
 * - Legacy stats tracking (backward-compatible counters)
 * - StatsCollector integration (Prometheus-style metrics)
 * - Time-based trends and rolling windows
 * - Prometheus metrics export
 *
 * @module hydra/managers/stats-manager
 * @version 2.0.0
 */

import { getStatsCollector } from '../core/stats.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Legacy statistics for backward compatibility
 * @typedef {Object} LegacyStats
 * @property {number} totalRequests - Total number of requests processed
 * @property {number} llamacppRequests - Requests handled by LlamaCpp (local)
 * @property {number} geminiRequests - Requests handled by Gemini (cloud)
 * @property {number} totalCostSaved - Estimated total cost saved via local routing
 * @property {number} averageLatency - Running average latency in ms
 */

/**
 * Request metadata used to update statistics
 * @typedef {Object} RequestMetadata
 * @property {string} [provider] - Provider that handled the request ('llamacpp' | 'gemini')
 * @property {number} [costSavings] - Cost savings from this request
 * @property {number} [totalDuration_ms] - Total pipeline duration in ms
 * @property {number} [duration_ms] - Request duration in ms (fallback)
 * @property {string} [category] - Task category from the router
 * @property {number} [cost] - Estimated cost for this request
 * @property {number} [savings] - Estimated savings for this request
 * @property {number} [tokens] - Token count consumed
 * @property {boolean} [success] - Whether the request succeeded
 * @property {Object} [error] - Error details if the request failed
 */

/**
 * Comprehensive stats returned by getStats()
 * @typedef {Object} ComprehensiveStats
 * @property {number} totalRequests - Total requests (legacy)
 * @property {number} llamacppRequests - LlamaCpp requests (legacy)
 * @property {number} geminiRequests - Gemini requests (legacy)
 * @property {number} totalCostSaved - Cost saved (legacy)
 * @property {number} averageLatency - Average latency (legacy)
 * @property {string|number} llamacppPercentage - Percentage of local requests
 * @property {number} estimatedMonthlySavings - Projected monthly savings
 * @property {Object} global - StatsCollector summary
 * @property {Object} providers - Per-provider stats
 * @property {Object} pools - Connection pool statuses
 * @property {Object} circuits - Circuit breaker statuses
 */

// =============================================================================
// HydraStatsManager Class
// =============================================================================

/**
 * Centralized statistics manager for the HYDRA orchestration system.
 * Encapsulates legacy counters, the StatsCollector singleton, trends,
 * and Prometheus export -- all previously scattered across the Hydra class.
 *
 * @class
 *
 * @example
 * import { HydraStatsManager } from './managers/stats-manager.js';
 *
 * const statsManager = new HydraStatsManager();
 *
 * // After processing a request:
 * statsManager.recordRequest({
 *   provider: 'llamacpp',
 *   costSavings: 0.002,
 *   totalDuration_ms: 340
 * });
 *
 * // Retrieve stats (pass providerManager for pool/circuit data):
 * const stats = statsManager.getStats(providerManager);
 */
export class HydraStatsManager {
  constructor() {
    /**
     * StatsCollector singleton - Prometheus-style counters, histograms, time series
     * @type {import('../core/stats.js').StatsCollector}
     */
    this.statsCollector = getStatsCollector();

    /**
     * Legacy stats object for backward compatibility
     * @type {LegacyStats}
     */
    this.stats = {
      totalRequests: 0,
      llamacppRequests: 0,
      geminiRequests: 0,
      totalCostSaved: 0,
      averageLatency: 0,
    };
  }

  // ===========================================================================
  // Core Recording
  // ===========================================================================

  /**
   * Record a completed request, updating both legacy counters and the
   * StatsCollector with the supplied metadata.
   *
   * @param {RequestMetadata} metadata - Result metadata from the pipeline
   *
   * @example
   * statsManager.recordRequest({
   *   provider: 'llamacpp',
   *   costSavings: 0.003,
   *   totalDuration_ms: 210,
   *   category: 'code',
   *   tokens: 128,
   *   success: true
   * });
   */
  recordRequest(metadata = {}) {
    // ----- Legacy counters -----
    this.stats.totalRequests++;

    if (metadata.provider === 'llamacpp') {
      this.stats.llamacppRequests++;
    } else if (metadata.provider) {
      this.stats.geminiRequests++;
    }

    if (metadata.costSavings) {
      this.stats.totalCostSaved += metadata.costSavings;
    }

    const latency = metadata.totalDuration_ms || metadata.duration_ms || 0;
    if (latency > 0) {
      this.stats.averageLatency =
        (this.stats.averageLatency * (this.stats.totalRequests - 1) + latency) /
        this.stats.totalRequests;
    }

    // ----- StatsCollector integration -----
    this.statsCollector.recordRequest({
      provider: metadata.provider || 'unknown',
      category: metadata.category || 'general',
      latency,
      cost: metadata.cost || 0,
      savings: metadata.savings || metadata.costSavings || 0,
      tokens: metadata.tokens || 0,
      success: metadata.success !== false,
      error: metadata.error || null,
    });
  }

  // ===========================================================================
  // Stats Retrieval
  // ===========================================================================

  /**
   * Build comprehensive statistics combining legacy counters, StatsCollector
   * summary, and provider-level data (pools, circuits).
   *
   * @param {Object} [providerManager] - Optional object providing provider accessors
   * @param {Function} [providerManager.getLlamaCppProvider] - Returns the LlamaCpp provider
   * @param {Function} [providerManager.getGeminiProvider] - Returns the Gemini provider
   * @returns {ComprehensiveStats} Merged statistics from all sources
   *
   * @example
   * // Without provider details:
   * const basic = statsManager.getStats();
   *
   * // With provider details (pools, circuits, per-provider stats):
   * const full = statsManager.getStats({
   *   getLlamaCppProvider: () => llamacppProvider,
   *   getGeminiProvider: () => geminiProvider
   * });
   */
  getStats(providerManager = null) {
    const summary = this.statsCollector.getSummary();

    /** @type {ComprehensiveStats} */
    const result = {
      // Legacy stats (spread for backward compat)
      ...this.stats,
      llamacppPercentage:
        this.stats.totalRequests > 0
          ? ((this.stats.llamacppRequests / this.stats.totalRequests) * 100).toFixed(1)
          : 0,
      estimatedMonthlySavings: this.stats.totalCostSaved * 30,

      // Detailed stats from StatsCollector
      global: summary,

      // Tool execution metrics (from ToolRegistry → StatsCollector bridge)
      tools: this.getToolMetrics(),

      // Provider-level stats (populated below if providerManager given)
      providers: {},
      pools: {},
      circuits: {},
    };

    // Merge provider-level data when a providerManager is available
    if (providerManager) {
      const llamacpp =
        typeof providerManager.getLlamaCppProvider === 'function'
          ? providerManager.getLlamaCppProvider()
          : null;
      const gemini =
        typeof providerManager.getGeminiProvider === 'function'
          ? providerManager.getGeminiProvider()
          : null;

      if (llamacpp) {
        result.providers.llamacpp =
          typeof llamacpp.getStats === 'function' ? llamacpp.getStats() : {};
        result.pools.llamacpp =
          typeof llamacpp.getPoolStatus === 'function' ? llamacpp.getPoolStatus() : null;
        result.circuits.llamacpp =
          typeof llamacpp.getCircuitStatus === 'function' ? llamacpp.getCircuitStatus() : null;
      }

      if (gemini) {
        result.providers.gemini = typeof gemini.getStats === 'function' ? gemini.getStats() : {};
        result.pools.gemini =
          typeof gemini.getPoolStatus === 'function' ? gemini.getPoolStatus() : null;
        result.circuits.gemini =
          typeof gemini.getCircuitStatus === 'function' ? gemini.getCircuitStatus() : null;
      }
    }

    return result;
  }

  // ===========================================================================
  // Tool Execution Metrics
  // ===========================================================================

  /**
   * Extract tool-specific execution metrics from the StatsCollector.
   * These are populated by ToolRegistry's _reportToStatsCollector() bridge.
   *
   * @returns {Object} Tool execution summary with per-tool breakdown
   *
   * @example
   * const toolMetrics = statsManager.getToolMetrics();
   * // { total: 42, byTool: { 'read_file': { success: 30, failure: 2 }, ... } }
   */
  getToolMetrics() {
    const allRequests = this.statsCollector.requests.getAll();

    // Filter to tool_execution type entries
    const toolEntries = allRequests.filter((item) => item.labels.type === 'tool_execution');

    const byTool = {};
    let total = 0;

    for (const entry of toolEntries) {
      const toolName = entry.labels.tool || 'unknown';
      const status = entry.labels.status || 'unknown';

      if (!byTool[toolName]) {
        byTool[toolName] = { success: 0, failure: 0, total: 0 };
      }

      byTool[toolName][status] = (byTool[toolName][status] || 0) + entry.value;
      byTool[toolName].total += entry.value;
      total += entry.value;
    }

    return { total, byTool };
  }

  // ===========================================================================
  // Trends
  // ===========================================================================

  /**
   * Retrieve time-based trend data for latency and request volume.
   *
   * @param {number} [period=3600000] - Lookback window in milliseconds (default: 1 hour)
   * @returns {Object} Trend data containing time series and aggregated metrics
   * @returns {Array} return.latency - Latency time series buckets
   * @returns {Array} return.requests - Request volume time series buckets
   * @returns {Object} return.aggregated - Aggregated metrics for the period
   *
   * @example
   * // Last hour (default)
   * const hourly = statsManager.getTrends();
   *
   * // Last 24 hours
   * const daily = statsManager.getTrends(24 * 60 * 60 * 1000);
   */
  getTrends(period = 3600000) {
    return this.statsCollector.getTrends(period);
  }

  // ===========================================================================
  // Metrics Export
  // ===========================================================================

  /**
   * Export all tracked metrics in Prometheus exposition format.
   * Suitable for scraping by Prometheus, Grafana Agent, or similar systems.
   *
   * @returns {string} Prometheus-formatted metrics string
   *
   * @example
   * const metrics = statsManager.exportMetrics();
   * // # HELP hydra_requests_total Total number of requests
   * // # TYPE hydra_requests_total counter
   * // hydra_requests_total{provider="llamacpp",category="code",status="success"} 42
   * // ...
   */
  exportMetrics() {
    return this.statsCollector.exportPrometheus();
  }

  // ===========================================================================
  // Reset
  // ===========================================================================

  /**
   * Reset all statistics to their initial state.
   * Clears both legacy counters and the StatsCollector, and optionally
   * resets per-provider stats via the providerManager.
   *
   * @param {Object} [providerManager] - Optional object providing provider accessors
   * @param {Function} [providerManager.getLlamaCppProvider] - Returns the LlamaCpp provider
   * @param {Function} [providerManager.getGeminiProvider] - Returns the Gemini provider
   *
   * @example
   * statsManager.reset();
   *
   * // With provider reset:
   * statsManager.reset({
   *   getLlamaCppProvider: () => llamacppProvider,
   *   getGeminiProvider: () => geminiProvider
   * });
   */
  reset(providerManager = null) {
    // Reset the StatsCollector
    this.statsCollector.reset();

    // Reset legacy counters
    this.stats = {
      totalRequests: 0,
      llamacppRequests: 0,
      geminiRequests: 0,
      totalCostSaved: 0,
      averageLatency: 0,
    };

    // Reset per-provider stats if providerManager available
    if (providerManager) {
      const llamacpp =
        typeof providerManager.getLlamaCppProvider === 'function'
          ? providerManager.getLlamaCppProvider()
          : null;
      const gemini =
        typeof providerManager.getGeminiProvider === 'function'
          ? providerManager.getGeminiProvider()
          : null;

      if (llamacpp && typeof llamacpp.resetStats === 'function') {
        llamacpp.resetStats();
      }
      if (gemini && typeof gemini.resetStats === 'function') {
        gemini.resetStats();
      }
    }
  }

  // ===========================================================================
  // Convenience Accessors
  // ===========================================================================

  /**
   * Get the legacy stats object directly (for backward compatibility).
   *
   * @returns {LegacyStats} Current legacy stats snapshot
   */
  getLegacyStats() {
    return { ...this.stats };
  }

  /**
   * Get the underlying StatsCollector instance.
   * Useful for advanced consumers that want direct access to counters,
   * histograms, or time-series data.
   *
   * @returns {import('../core/stats.js').StatsCollector}
   */
  getStatsCollector() {
    return this.statsCollector;
  }
}

// =============================================================================
// Singleton
// =============================================================================

/** @type {HydraStatsManager|null} */
let _instance = null;

/**
 * Get or create the HydraStatsManager singleton.
 *
 * @returns {HydraStatsManager}
 *
 * @example
 * import { getHydraStatsManager } from './managers/stats-manager.js';
 * const sm = getHydraStatsManager();
 * sm.recordRequest({ provider: 'llamacpp', duration_ms: 150 });
 */
export function getHydraStatsManager() {
  if (!_instance) {
    _instance = new HydraStatsManager();
  }
  return _instance;
}

/**
 * Reset the singleton (primarily for testing).
 */
export function resetHydraStatsManager() {
  _instance = null;
}

export default HydraStatsManager;
