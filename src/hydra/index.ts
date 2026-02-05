/**
 * @fileoverview HYDRA - Hybrid AI Orchestration System
 * Gemini CLI + LlamaCpp integration with intelligent routing
 *
 * @description
 * Architecture:
 * - LlamaCpp (local): Fast, free, for routing/simple tasks via MCP tools
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

import { getLlamaCppProvider, resetLlamaCppProvider } from './providers/llamacpp-provider.js';
import { getGeminiProvider, resetGeminiProvider } from './providers/gemini-provider.js';
import { route, routeWithCost, TASK_CATEGORIES } from './pipeline/router.js';
import { execute, quickExecute, createDefaultPipeline, PipelineBuilder } from './pipeline/executor.js';
import { getConfigManager, DEFAULT_CONFIG } from './core/config.js';
import { getStatsCollector } from './core/stats.js';
import { HealthCheckCache } from './core/cache.js';
import { ProviderRegistry } from './core/interfaces.js';

// Re-export llama-cpp client utilities
import * as llamacppClient from './providers/llamacpp-bridge.js';
import * as geminiClient from './providers/gemini-client.js';

// ============================================================================
// NEW: Claude Code Feature Imports
// ============================================================================

// MCP Client System
import { getMCPClientManager, initMCP, getMCPStatus, shutdownMCP } from '../mcp/index.js';

// Planning System (Plan Mode)
import { getPlanModeController, startPlan, getPlanStatus, cancelPlan, PlanModeState } from '../planning/index.js';

// Task Management (TodoWrite)
import { getTodoManager, writeTodos, getTodos, getTodoStats, TodoStatus } from '../tasks/index.js';

// Hooks System
import { getHookManager, initializeHookManager, HookEvent } from '../hooks/index.js';

// Task Agents (Witcher Swarm Integration)
import { getAgent, getAgentByWitcherName, WITCHER_AGENT_MAP, explore, plan, bash } from '../agents/index.js';

// Git Integration
import { getCommitWorkflow, getPRWorkflow, commitFiles, createPR } from '../git/index.js';

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
    this.llamacppProvider = getLlamaCppProvider();
    this.geminiProvider = getGeminiProvider();

    // Initialize provider registry
    this.providers = new ProviderRegistry();
    this.providers.register('llamacpp', this.llamacppProvider, true);
    this.providers.register('gemini', this.geminiProvider);

    // Initialize health check cache with auto-refresh
    this.healthCache = new HealthCheckCache({
      ttl: this.config.getValue('cache.healthCheck.ttl', 30000),
      staleTTL: this.config.getValue('cache.healthCheck.staleTTL', 60000),
      autoRefresh: this.config.getValue('cache.healthCheck.autoRefresh', true)
    });
    this.healthCache.register('llamacpp', () => this.llamacppProvider._performHealthCheck());
    this.healthCache.register('gemini', () => this.geminiProvider._performHealthCheck());

    // Initialize stats collector
    this.statsCollector = getStatsCollector();

    // Legacy stats for backward compatibility
    this.stats = {
      totalRequests: 0,
      llamacppRequests: 0,
      geminiRequests: 0,
      totalCostSaved: 0,
      averageLatency: 0
    };

    // Track initialization state
    this._initialized = false;

    // NEW: Claude Code feature instances (lazy loaded)
    this._mcpManager = null;
    this._hookManager = null;
    this._planController = null;
    this._todoManager = null;
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
      llamacpp: { available: false },
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
        result.llamacpp.available = health.llamacpp?.available || false;
        result.gemini.cliAvailable = health.gemini?.available || false;
        console.log(`[Hydra] Health check: LlamaCpp=${result.llamacpp.available}, Gemini CLI=${result.gemini.cliAvailable}`);
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
      if (result.metadata.provider === 'llamacpp') {
        this.stats.llamacppRequests++;
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

    if (result.provider === 'llamacpp') {
      this.stats.llamacppRequests++;
    } else {
      this.stats.geminiRequests++;
    }

    return result;
  }

  /**
   * Force LlamaCpp execution (cost=$0)
   * @param {string} prompt - User prompt
   * @param {Object} [options] - Generation options (model, taskType, tool)
   * @returns {Promise<Object>} LlamaCpp response
   */
  async llamacpp(prompt, options = {}) {
    this.stats.totalRequests++;
    this.stats.llamacppRequests++;
    return this.llamacppProvider.generate(prompt, options);
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
    this.stats.totalRequests++;
    this.stats.llamacppRequests++;
    return this.llamacppProvider.generateCode(task, params);
  }

  /**
   * Force LlamaCpp JSON generation
   * @param {string} prompt - Input prompt
   * @param {Object} schema - JSON schema for output
   * @returns {Promise<Object>} JSON result
   */
  async llamacppJson(prompt, schema = {}) {
    this.stats.totalRequests++;
    this.stats.llamacppRequests++;
    return this.llamacppProvider.generateJson(prompt, schema);
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
    const [llamacppHealth, geminiHealth] = await Promise.all([
      this.healthCache.get('llamacpp', forceRefresh),
      this.healthCache.get('gemini', forceRefresh)
    ]);

    return {
      llamacpp: llamacppHealth,
      gemini: geminiHealth,
      ready: llamacppHealth.available || geminiHealth.available,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get comprehensive usage statistics
   * @returns {HydraStats} Statistics from all sources
   */
  getStats() {
    const summary = this.statsCollector.getSummary();
    const llamacppStats = this.llamacppProvider.getStats();
    const geminiStats = this.geminiProvider.getStats();

    return {
      // Legacy stats
      ...this.stats,
      llamacppPercentage: this.stats.totalRequests > 0
        ? (this.stats.llamacppRequests / this.stats.totalRequests * 100).toFixed(1)
        : 0,
      estimatedMonthlySavings: this.stats.totalCostSaved * 30,

      // New detailed stats
      global: summary,
      providers: {
        llamacpp: llamacppStats,
        gemini: geminiStats
      },
      pools: {
        llamacpp: this.llamacppProvider.getPoolStatus(),
        gemini: this.geminiProvider.getPoolStatus()
      },
      circuits: {
        llamacpp: this.llamacppProvider.getCircuitStatus(),
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
    this.llamacppProvider.resetStats();
    this.geminiProvider.resetStats();

    this.stats = {
      totalRequests: 0,
      llamacppRequests: 0,
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
      llamacpp: this.llamacppProvider.getStatus(),
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

    // Shutdown Claude Code features
    if (this._mcpManager) {
      await shutdownMCP();
    }

    if (this._hookManager) {
      await this._hookManager.onSessionEnd({});
    }
  }

  // ============================================================================
  // NEW: Claude Code Feature Methods
  // ============================================================================

  /**
   * Initialize MCP Client System
   * @returns {Promise<Object>}
   */
  async initMCP() {
    this._mcpManager = getMCPClientManager();
    await this._mcpManager.initialize();
    return this._mcpManager;
  }

  /**
   * Get MCP status
   * @returns {Object}
   */
  getMCPStatus() {
    if (!this._mcpManager) {
      return { initialized: false };
    }
    return getMCPStatus();
  }

  /**
   * Initialize Hooks System
   * @returns {Promise<Object>}
   */
  async initHooks() {
    this._hookManager = await initializeHookManager();
    await this._hookManager.onSessionStart({
      hydra: this,
      timestamp: new Date().toISOString()
    });
    return this._hookManager;
  }

  /**
   * Get Hook Manager
   * @returns {Object}
   */
  getHookManager() {
    if (!this._hookManager) {
      this._hookManager = getHookManager();
    }
    return this._hookManager;
  }

  /**
   * Initialize Plan Mode
   * @param {Object} [options] - Options
   * @returns {Object}
   */
  initPlanMode(options = {}) {
    this._planController = getPlanModeController({
      agentExecutor: options.agentExecutor || this._defaultAgentExecutor.bind(this),
      ...options
    });
    return this._planController;
  }

  /**
   * Start a new plan
   * @param {string} query - User query
   * @param {Object} [options] - Options
   * @returns {Promise<Object>}
   */
  async startPlan(query, options = {}) {
    if (!this._planController) {
      this.initPlanMode(options);
    }
    return this._planController.startPlan(query, options);
  }

  /**
   * Get Plan Mode status
   * @returns {Object}
   */
  getPlanStatus() {
    if (!this._planController) {
      return { state: PlanModeState.IDLE };
    }
    return this._planController.getStatus();
  }

  /**
   * Get Todo Manager
   * @returns {Object}
   */
  getTodoManager() {
    if (!this._todoManager) {
      this._todoManager = getTodoManager();
    }
    return this._todoManager;
  }

  /**
   * Write todos (TodoWrite API)
   * @param {Object[]} todos - Todos to write
   * @returns {Promise<Object>}
   */
  async writeTodos(todos) {
    return writeTodos(todos);
  }

  /**
   * Get current todos
   * @returns {Promise<Object[]>}
   */
  async getTodos() {
    return getTodos();
  }

  /**
   * Get an agent by type
   * @param {string} type - Agent type (explore, plan, bash)
   * @returns {Promise<Object>}
   */
  async getAgent(type) {
    return getAgent(type);
  }

  /**
   * Get agent by Witcher name
   * @param {string} name - Witcher name (Regis, Dijkstra, Eskel, etc.)
   * @returns {Promise<Object>}
   */
  async getAgentByWitcher(name) {
    return getAgentByWitcherName(name);
  }

  /**
   * Get Commit Workflow
   * @returns {Object}
   */
  getCommitWorkflow() {
    return getCommitWorkflow({ cwd: process.cwd() });
  }

  /**
   * Get PR Workflow
   * @returns {Object}
   */
  getPRWorkflow() {
    return getPRWorkflow({ cwd: process.cwd() });
  }

  /**
   * Default agent executor for Plan Mode
   * @private
   */
  async _defaultAgentExecutor(params) {
    const { agent, phase, query, context } = params;

    // Get the appropriate agent
    const agentInstance = await getAgentByWitcherName(agent);

    if (!agentInstance) {
      // Fallback to LlamaCpp for unknown agents
      return this.llamacpp(query);
    }

    return agentInstance.run({ query, context, phase });
  }

  /**
   * Set MCP invoker for LlamaCpp provider
   * This must be called to enable LlamaCpp MCP tool calls
   * @param {Function} invoker - Function that invokes MCP tools
   */
  setMcpInvoker(invoker) {
    this.llamacppProvider.setMcpInvoker(invoker);
  }

  /**
   * Get LlamaCpp provider (for advanced usage)
   * @returns {Object} LlamaCpp provider instance
   */
  getLlamaCppProvider() {
    return this.llamacppProvider;
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
  resetLlamaCppProvider();
  resetGeminiProvider();
}

// Re-export core modules
export * from './core/index.js';

// Export providers
export { getLlamaCppProvider, getGeminiProvider };

// Export pipeline utilities
export { route, routeWithCost, execute, quickExecute, TASK_CATEGORIES };

// Export llama-cpp client for backward compatibility
export { llamacppClient as llamacpp, geminiClient as gemini };

// Export configuration
export { DEFAULT_CONFIG, getConfigManager };

// Export initialization utilities
// initializeHydra is exported via its function declaration above

// ============================================================================
// NEW: Claude Code Feature Exports
// ============================================================================

// MCP
export { getMCPClientManager, initMCP, getMCPStatus, shutdownMCP };

// Planning
export { getPlanModeController, startPlan, getPlanStatus, cancelPlan, PlanModeState };

// Tasks
export { getTodoManager, writeTodos, getTodos, getTodoStats, TodoStatus };

// Hooks
export { getHookManager, initializeHookManager, HookEvent };

// Agents
export { getAgent, getAgentByWitcherName, WITCHER_AGENT_MAP, explore, plan, bash };

// Git
export { getCommitWorkflow, getPRWorkflow, commitFiles, createPR };

// Default export
export default Hydra;
