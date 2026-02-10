/**
 * @fileoverview HYDRA - Hybrid AI Orchestration System (Facade)
 *
 * Refactored from a God Object into a thin facade that delegates to:
 * - HydraProviderManager: Provider lifecycle, health checks, direct calls
 * - HydraStatsManager: Statistics, metrics, trends
 * - HydraFeatureManager: Claude Code features (MCP, Hooks, Planning, Todos, Agents, Git)
 *
 * @description
 * Architecture:
 * - LlamaCpp (local): Fast, free, for routing/simple tasks via MCP tools
 * - Gemini (cloud): High quality, for complex tasks
 *
 * The public API surface is identical to the pre-refactor version.
 * All existing consumers (hydra-tools.ts, etc.) remain unaffected.
 *
 * @module hydra
 * @version 2.1.0
 */

import {
  bash,
  explore,
  getAgent,
  getAgentByWitcherName,
  plan,
  WITCHER_AGENT_MAP,
} from '../agents/index.js';
import { commitFiles, createPR, getCommitWorkflow, getPRWorkflow } from '../git/index.js';
import { getHookManager, HookEvent, initializeHookManager } from '../hooks/index.js';
// ============================================================================
// Claude Code Feature Imports (for re-export only)
// ============================================================================
import { getMCPClientManager, getMCPStatus, initMCP, shutdownMCP } from '../mcp/index.js';
import {
  cancelPlan,
  getPlanModeController,
  getPlanStatus,
  PlanModeState,
  startPlan,
} from '../planning/index.js';
import { getTodoManager, getTodoStats, getTodos, TodoStatus, writeTodos } from '../tasks/index.js';
import { DEFAULT_CONFIG, getConfigManager } from './core/config.js';
import { getClaudeInstanceManager } from './managers/claude-instance-manager.js';
import { HydraFeatureManager } from './managers/feature-manager.js';
// Manager imports
import { HydraProviderManager } from './managers/provider-manager.js';
import { HydraStatsManager } from './managers/stats-manager.js';
import { execute, PipelineBuilder, quickExecute } from './pipeline/executor.js';
import { route, routeWithCost, TASK_CATEGORIES } from './pipeline/router.js';
import * as geminiClient from './providers/gemini-client.js';
import { getGeminiProvider, resetGeminiProvider } from './providers/gemini-provider.js';
// Re-export llama-cpp / gemini client utilities (backward compat)
import * as llamacppClient from './providers/llamacpp-bridge.js';
import { getLlamaCppProvider, resetLlamaCppProvider } from './providers/llamacpp-provider.js';

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
 * @property {Object} llamacpp - LlamaCpp health status
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
 * HYDRA main class - Thin Facade over specialized managers
 *
 * Delegates to:
 * - this._providers  → HydraProviderManager
 * - this._stats      → HydraStatsManager
 * - this._features   → HydraFeatureManager
 *
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

    // Delegate to specialized managers
    this._providers = new HydraProviderManager(this.config);
    this._stats = new HydraStatsManager();
    this._features = new HydraFeatureManager({
      hydraRef: this,
      verbose: this.verbose,
    });

    // Track initialization state
    this._initialized = false;

    // Expose legacy properties for direct access (backward compat)
    // Some consumers may access hydra.llamacppProvider or hydra.providers directly
    this.llamacppProvider = this._providers.getLlamaCppProvider();
    this.geminiProvider = this._providers.getGeminiProvider();
    this.providers = this._providers.getRegistry();
    this.healthCache = this._providers.getHealthCache();
    this.statsCollector = this._stats.getStatsCollector();
    this.stats = this._stats.getLegacyStats();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize HYDRA - loads models and performs health checks
   * @param {Object} [options={}] - Initialization options
   * @param {boolean} [options.refreshModels=true] - Whether to refresh Gemini models
   * @param {boolean} [options.healthCheck=true] - Whether to perform initial health check
   * @returns {Promise<Object>} Initialization result with provider status
   */
  async initialize(options = {}) {
    const result = await this._providers.initialize(options);
    this._initialized = true;
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
   * Shutdown and cleanup resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this._providers.shutdown();
    await this._features.shutdown();
  }

  // ==========================================================================
  // Provider Operations (delegated to HydraProviderManager)
  // ==========================================================================

  /**
   * Refresh Gemini models (can be called periodically)
   * @returns {Promise<Object>} Updated model selection
   */
  async refreshGeminiModels() {
    return this._providers.refreshGeminiModels();
  }

  /**
   * Process a prompt through the HYDRA pipeline
   * @param {string} prompt - User prompt
   * @param {Object} [options={}] - Processing options
   * @returns {Promise<ProcessResult>} Result with content and metadata
   */
  async process(prompt, options = {}) {
    const result = await execute(prompt, {
      verbose: this.verbose,
      ...options,
    });

    // Single recordRequest call with full metadata
    this._stats.recordRequest({
      provider: result.metadata?.provider === 'llamacpp' ? 'llamacpp' : 'gemini',
      costSavings: result.metadata?.costSavings || 0,
      totalDuration_ms: result.metadata?.totalDuration_ms || result.metadata?.duration_ms || 0,
    });

    // Keep this.stats reference in sync
    this.stats = this._stats.getLegacyStats();
    return result;
  }

  /**
   * Quick query - optimized for speed, skips planning
   * @param {string} prompt - User prompt
   * @returns {Promise<ProcessResult>} Quick execution result
   */
  async quick(prompt) {
    const result = await quickExecute(prompt);

    this._stats.recordRequest({
      provider: result.provider === 'llamacpp' ? 'llamacpp' : 'gemini',
    });

    this.stats = this._stats.getLegacyStats();
    return result;
  }

  /**
   * Force LlamaCpp execution (cost=$0)
   * @param {string} prompt - User prompt
   * @param {Object} [options] - Generation options
   * @returns {Promise<Object>} LlamaCpp response
   */
  async llamacpp(prompt, options = {}) {
    this._stats.recordRequest({ provider: 'llamacpp' });
    this.stats = this._stats.getLegacyStats();
    return this._providers.llamacpp(prompt, options);
  }

  /**
   * Alias for llamacpp() method
   * @param {string} prompt - User prompt
   * @param {Object} [options] - Generation options
   * @returns {Promise<Object>} LlamaCpp response
   */
  async llamacppQuery(prompt, options = {}) {
    return this.llamacpp(prompt, options);
  }

  /**
   * Force LlamaCpp code generation
   * @param {string} task - Code task (generate, explain, refactor, etc.)
   * @param {Object} params - Code parameters
   * @returns {Promise<Object>} Code generation result
   */
  async llamacppCode(task, params = {}) {
    this._stats.recordRequest({ provider: 'llamacpp' });
    this.stats = this._stats.getLegacyStats();
    return this._providers.llamacppCode(task, params);
  }

  /**
   * Force LlamaCpp JSON generation
   * @param {string} prompt - Input prompt
   * @param {Object} schema - JSON schema for output
   * @returns {Promise<Object>} JSON result
   */
  async llamacppJson(prompt, schema = {}) {
    this._stats.recordRequest({ provider: 'llamacpp' });
    this.stats = this._stats.getLegacyStats();
    return this._providers.llamacppJson(prompt, schema);
  }

  /**
   * Force Gemini execution (best quality)
   * @param {string} prompt - User prompt
   * @returns {Promise<Object>} Gemini response
   */
  async gemini(prompt) {
    this._stats.recordRequest({ provider: 'gemini' });
    this.stats = this._stats.getLegacyStats();
    return this._providers.gemini(prompt);
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
    return this._providers.healthCheck(forceRefresh);
  }

  // ==========================================================================
  // Statistics (delegated to HydraStatsManager)
  // ==========================================================================

  /**
   * Get comprehensive usage statistics
   * @returns {HydraStats} Statistics from all sources
   */
  getStats() {
    return this._stats.getStats(this._providers);
  }

  /**
   * Get time-based trends
   * @param {number} [period=3600000] - Time period in ms (default: 1 hour)
   * @returns {Object} Trend data
   */
  getTrends(period = 3600000) {
    return this._stats.getTrends(period);
  }

  /**
   * Export metrics in Prometheus format
   * @returns {string} Prometheus-formatted metrics
   */
  exportMetrics() {
    return this._stats.exportMetrics();
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    this._stats.reset(this._providers);
    this.stats = this._stats.getLegacyStats();
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

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

  // ==========================================================================
  // Provider Status (delegated to HydraProviderManager)
  // ==========================================================================

  /**
   * Get provider status
   * @param {string} providerName - Name of provider ('ollama' or 'gemini')
   * @returns {Object|null} Provider status or null if not found
   */
  getProviderStatus(providerName) {
    return this._providers.getProviderStatus(providerName);
  }

  /**
   * Get all provider statuses
   * @returns {Object} Status for all providers
   */
  getAllProviderStatuses() {
    return this._providers.getAllProviderStatuses();
  }

  /**
   * Create a custom pipeline
   * @returns {PipelineBuilder} New pipeline builder instance
   */
  createPipeline() {
    return new PipelineBuilder();
  }

  /**
   * Set MCP invoker for LlamaCpp provider
   * @param {Function} invoker - Function that invokes MCP tools
   */
  setMcpInvoker(invoker) {
    this._providers.setMcpInvoker(invoker);
  }

  /**
   * Get LlamaCpp provider (for advanced usage)
   * @returns {Object} LlamaCpp provider instance
   */
  getLlamaCppProvider() {
    return this._providers.getLlamaCppProvider();
  }

  // ==========================================================================
  // Claude Code Features (delegated to HydraFeatureManager)
  // ==========================================================================

  /** Initialize MCP Client System */
  async initMCP() {
    return this._features.initMCP();
  }

  /** Get MCP status */
  getMCPStatus() {
    return this._features.getMCPStatus();
  }

  /** Initialize Hooks System */
  async initHooks() {
    return this._features.initHooks(this);
  }

  /** Get Hook Manager */
  getHookManager() {
    return this._features.getHookManager();
  }

  /** Initialize Plan Mode */
  initPlanMode(options = {}) {
    return this._features.initPlanMode(options);
  }

  /** Start a new plan */
  async startPlan(query, options = {}) {
    return this._features.startPlan(query, options);
  }

  /** Get Plan Mode status */
  getPlanStatus() {
    return this._features.getPlanStatus();
  }

  /** Get Todo Manager */
  getTodoManager() {
    return this._features.getTodoManager();
  }

  /** Write todos (TodoWrite API) */
  async writeTodos(todos) {
    return this._features.writeTodos(todos);
  }

  /** Get current todos */
  async getTodos() {
    return this._features.getTodos();
  }

  /** Get an agent by type */
  async getAgent(type) {
    return this._features.getAgent(type);
  }

  /** Get agent by Witcher name */
  async getAgentByWitcher(name) {
    return this._features.getAgentByWitcher(name);
  }

  /** Get Commit Workflow */
  getCommitWorkflow() {
    return this._features.getCommitWorkflow();
  }

  /** Get PR Workflow */
  getPRWorkflow() {
    return this._features.getPRWorkflow();
  }

  // ==========================================================================
  // Claude Instance Pool (Multi-Instance Management)
  // ==========================================================================

  /**
   * Get Claude Code instance pool status
   * @returns {Object|null} Pool status or null if not enabled
   */
  getInstanceStatus() {
    const mgr = getClaudeInstanceManager();
    if (!mgr.isEnabled) return null;
    return {
      ...mgr.getStatus(),
      stats: mgr.getStats(),
    };
  }

  /**
   * Scale Claude Code instance pool to target size
   * @param {number} target - Target number of instances
   * @returns {Promise<Object>} New pool status
   */
  async scaleInstances(target) {
    const mgr = getClaudeInstanceManager();
    if (!mgr.isEnabled) {
      throw new Error('Claude multi-instance is not enabled');
    }
    await mgr.scaleTo(target);
    return mgr.getStatus();
  }

  /**
   * Default agent executor for Plan Mode
   * @private
   */
  async _defaultAgentExecutor(params) {
    const { agent, query, context, phase } = params;
    const agentInstance = await getAgentByWitcherName(agent);

    if (!agentInstance) {
      return this.llamacpp(query);
    }

    return agentInstance.run({ query, context, phase });
  }
}

// ============================================================================
// Singleton
// ============================================================================

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
 * @param {HydraOptions} [options={}] - Configuration options
 * @param {Object} [initOptions={}] - Initialization options
 * @returns {Promise<{hydra: Hydra, initResult: Object}>}
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
  resetLlamaCppProvider();
  resetGeminiProvider();
}

// ============================================================================
// Re-exports — Core (used by hydra-tools.ts)
// ============================================================================

export * from './core/index.js';
export { getLlamaCppProvider, getGeminiProvider };
export { route, routeWithCost, execute, quickExecute, TASK_CATEGORIES };
export { llamacppClient as llamacpp, geminiClient as gemini };
export { DEFAULT_CONFIG, getConfigManager };

// ============================================================================
// Re-exports — Claude Code Features
// Prefer importing directly from src/mcp, src/planning, etc.
// Kept here for backward compatibility only.
// ============================================================================

export { getMCPClientManager, initMCP, getMCPStatus, shutdownMCP };
export { getPlanModeController, startPlan, getPlanStatus, cancelPlan, PlanModeState };
export { getTodoManager, writeTodos, getTodos, getTodoStats, TodoStatus };
export { getHookManager, initializeHookManager, HookEvent };
export { getAgent, getAgentByWitcherName, WITCHER_AGENT_MAP, explore, plan, bash };
export { getCommitWorkflow, getPRWorkflow, commitFiles, createPR };

// Re-export — Claude Instance Pool
export { getClaudeInstanceManager } from './managers/claude-instance-manager.js';

// Default export
export default Hydra;
