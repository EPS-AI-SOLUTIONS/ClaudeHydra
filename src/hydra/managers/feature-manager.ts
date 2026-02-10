/**
 * @fileoverview HydraFeatureManager - Claude Code Feature Extraction
 *
 * Encapsulates all "Claude Code Features" that were bolted onto the Hydra god object:
 * - MCP Client management (lazy loaded)
 * - Hooks system (lazy loaded)
 * - Plan Mode controller (lazy loaded)
 * - Todo Manager (lazy loaded)
 * - Agent access (Witcher Swarm)
 * - Git workflows (Commit + PR)
 *
 * This class owns the lifecycle of these subsystems and provides a clean facade,
 * keeping the core Hydra class focused on provider orchestration.
 *
 * @module hydra/managers/feature-manager
 * @version 2.0.0
 */

// Task Agents (Witcher Swarm Integration)
import {
  bash,
  clearAgentCache,
  explore,
  getAgent,
  getAgentByWitcherName,
  plan,
  WITCHER_AGENT_MAP,
} from '../../agents/index.js';
// Git Integration
import {
  commitFiles,
  createPR,
  getCommitWorkflow,
  getPRWorkflow,
  shutdownGit,
} from '../../git/index.js';
// Hooks System
import {
  getHookManager,
  HookEvent,
  initializeHookManager,
  shutdownHooks,
} from '../../hooks/index.js';
// MCP Client System
import { getMCPClientManager, getMCPStatus, shutdownMCP } from '../../mcp/index.js';
// Planning System (Plan Mode)
import {
  cancelPlan,
  getPlanModeController,
  PlanModeState,
  shutdownPlanning,
} from '../../planning/index.js';
// Task Management (TodoWrite)
import {
  getTodoManager,
  getTodoStats,
  getTodos,
  shutdownTasks,
  TodoStatus,
  writeTodos,
} from '../../tasks/index.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * @typedef {Object} FeatureManagerOptions
 * @property {Object} [hydraRef] - Reference to the parent Hydra instance (for agent executor fallback)
 * @property {boolean} [verbose=false] - Enable verbose logging
 */

/**
 * @typedef {Object} PlanOptions
 * @property {Function} [agentExecutor] - Custom agent executor function
 * @property {string} [storageDir] - Plan storage directory
 */

/**
 * @typedef {Object} FeatureStatus
 * @property {boolean} mcp - Whether MCP client is initialized
 * @property {boolean} hooks - Whether hooks system is initialized
 * @property {boolean} planning - Whether plan mode controller is initialized
 * @property {boolean} tasks - Whether todo manager is initialized
 */

// =============================================================================
// HydraFeatureManager Class
// =============================================================================

/**
 * HydraFeatureManager - Manages Claude Code features extracted from the Hydra god object.
 *
 * All subsystems are lazy-loaded: they are only initialized when first accessed.
 * This keeps startup fast and avoids unnecessary resource allocation.
 *
 * @class
 * @example
 * const features = new HydraFeatureManager({ hydraRef: hydraInstance });
 *
 * // MCP
 * await features.initMCP();
 * console.log(features.getMCPStatus());
 *
 * // Planning
 * await features.startPlan('Refactor auth module', { agentExecutor: myExecutor });
 *
 * // Agents
 * const regis = await features.getAgentByWitcher('Regis');
 *
 * // Lifecycle
 * await features.shutdown();
 */
export class HydraFeatureManager {
  /**
   * Creates a new HydraFeatureManager instance
   *
   * @param {FeatureManagerOptions} [options={}] - Configuration options
   */
  constructor(options = {}) {
    /**
     * Reference to the parent Hydra instance.
     * Used as a fallback for the default agent executor (LlamaCpp queries).
     * @type {Object|null}
     * @private
     */
    this._hydraRef = options.hydraRef || null;

    /**
     * Verbose logging flag
     * @type {boolean}
     * @private
     */
    this._verbose = options.verbose || false;

    // =========================================================================
    // Lazy-loaded subsystem instances
    // =========================================================================

    /**
     * MCP Client Manager instance (lazy)
     * @type {Object|null}
     * @private
     */
    this._mcpManager = null;

    /**
     * Hook Manager instance (lazy)
     * @type {Object|null}
     * @private
     */
    this._hookManager = null;

    /**
     * Plan Mode Controller instance (lazy)
     * @type {Object|null}
     * @private
     */
    this._planController = null;

    /**
     * Todo Manager instance (lazy)
     * @type {Object|null}
     * @private
     */
    this._todoManager = null;

    this._log('[FeatureManager] Created');
  }

  // ===========================================================================
  // MCP Client System
  // ===========================================================================

  /**
   * Initialize the MCP Client System.
   * Connects to configured MCP servers and makes tools available.
   *
   * @param {Object} [options] - MCP initialization options
   * @param {string} [options.configPath] - Path to MCP config file
   * @param {boolean} [options.autoConnect=true] - Auto-connect to servers
   * @returns {Promise<Object>} The initialized MCP Client Manager
   */
  async initMCP(options = {}) {
    this._log('[FeatureManager] Initializing MCP...');
    this._mcpManager = getMCPClientManager();
    await this._mcpManager.initialize(options);
    this._log('[FeatureManager] MCP initialized');
    return this._mcpManager;
  }

  /**
   * Get the current MCP system status.
   *
   * @returns {Object} MCP status object with `initialized`, `servers`, and `health` fields.
   *   Returns `{ initialized: false }` if MCP has not been initialized.
   */
  getMCPStatus() {
    if (!this._mcpManager) {
      return { initialized: false };
    }
    return getMCPStatus();
  }

  /**
   * Get the MCP Client Manager instance (creates lazily if needed).
   *
   * @returns {Object} MCP Client Manager
   */
  getMCPManager() {
    if (!this._mcpManager) {
      this._mcpManager = getMCPClientManager();
    }
    return this._mcpManager;
  }

  // ===========================================================================
  // Hooks System
  // ===========================================================================

  /**
   * Initialize the Hooks System and fire the session start event.
   *
   * @param {Object} [hydraRef] - Reference to the parent Hydra instance.
   *   If not provided, uses the reference passed to the constructor.
   * @returns {Promise<Object>} The initialized Hook Manager
   */
  async initHooks(hydraRef) {
    this._log('[FeatureManager] Initializing Hooks...');
    const ref = hydraRef || this._hydraRef;

    this._hookManager = await initializeHookManager();
    await this._hookManager.onSessionStart({
      hydra: ref,
      timestamp: new Date().toISOString(),
    });

    this._log('[FeatureManager] Hooks initialized');
    return this._hookManager;
  }

  /**
   * Get the Hook Manager instance (creates lazily if needed).
   *
   * @returns {Object} Hook Manager
   */
  getHookManager() {
    if (!this._hookManager) {
      this._hookManager = getHookManager();
    }
    return this._hookManager;
  }

  /**
   * Emit a hook event.
   *
   * @param {string} event - Hook event name (from HookEvent enum)
   * @param {Object} [context={}] - Event context data
   * @returns {Promise<void>}
   */
  async emitHook(event, context = {}) {
    const manager = this.getHookManager();
    if (manager && typeof manager.emit === 'function') {
      await manager.emit(event, context);
    }
  }

  // ===========================================================================
  // Planning System (Plan Mode)
  // ===========================================================================

  /**
   * Initialize the Plan Mode Controller.
   *
   * @param {PlanOptions} [options={}] - Plan mode options
   * @param {Function} [options.agentExecutor] - Custom agent executor.
   *   Falls back to `_defaultAgentExecutor` which uses the Witcher agent system
   *   with a LlamaCpp fallback via the parent Hydra reference.
   * @returns {Object} The Plan Mode Controller
   */
  initPlanMode(options = {}) {
    this._log('[FeatureManager] Initializing Plan Mode...');
    this._planController = getPlanModeController({
      agentExecutor: options.agentExecutor || this._defaultAgentExecutor.bind(this),
      ...options,
    });
    this._log('[FeatureManager] Plan Mode initialized');
    return this._planController;
  }

  /**
   * Start a new plan.
   * Lazily initializes the Plan Mode Controller if not already done.
   *
   * @param {string} query - The user's planning query / goal
   * @param {PlanOptions} [options={}] - Options passed to the controller
   * @returns {Promise<Object>} Plan execution result
   */
  async startPlan(query, options = {}) {
    if (!this._planController) {
      this.initPlanMode(options);
    }
    this._log(`[FeatureManager] Starting plan: "${query.substring(0, 60)}..."`);
    return this._planController.startPlan(query, options);
  }

  /**
   * Get the current Plan Mode status.
   *
   * @returns {Object} Plan status with `state` field.
   *   Returns `{ state: PlanModeState.IDLE }` if no plan controller is active.
   */
  getPlanStatus() {
    if (!this._planController) {
      return { state: PlanModeState.IDLE };
    }
    return this._planController.getStatus();
  }

  /**
   * Cancel the currently running plan.
   *
   * @returns {Object|null} Cancellation result, or null if no plan is active
   */
  cancelPlan() {
    if (!this._planController) {
      return null;
    }
    return cancelPlan();
  }

  /**
   * Get the Plan Mode Controller instance.
   *
   * @returns {Object|null} Plan Mode Controller, or null if not initialized
   */
  getPlanController() {
    return this._planController;
  }

  // ===========================================================================
  // Task Management (Todo System)
  // ===========================================================================

  /**
   * Get the Todo Manager instance (creates lazily if needed).
   *
   * @returns {Object} Todo Manager
   */
  getTodoManager() {
    if (!this._todoManager) {
      this._todoManager = getTodoManager();
    }
    return this._todoManager;
  }

  /**
   * Write todos (implements the TodoWrite API).
   *
   * @param {Object[]} todos - Array of todo items to write.
   *   Each item should have `{ content, status, activeForm }`.
   * @returns {Promise<Object>} Write result
   */
  async writeTodos(todos) {
    return writeTodos(todos);
  }

  /**
   * Get current todos.
   *
   * @returns {Promise<Object[]>} Array of current todo items
   */
  async getTodos() {
    return getTodos();
  }

  /**
   * Get todo statistics (pending, in_progress, completed counts).
   *
   * @returns {Promise<Object>} Todo statistics
   */
  async getTodoStats() {
    return getTodoStats();
  }

  // ===========================================================================
  // Agent Access (Witcher Swarm)
  // ===========================================================================

  /**
   * Get an agent by type (explore, plan, bash, etc.).
   *
   * @param {string} type - Agent type identifier
   * @param {Object} [options={}] - Agent creation options
   * @returns {Promise<Object>} Agent instance
   * @throws {Error} If agent type is unknown
   */
  async getAgent(type, options = {}) {
    return getAgent(type, options);
  }

  /**
   * Get an agent by its Witcher character name.
   *
   * @param {string} name - Witcher name (e.g., 'Regis', 'Dijkstra', 'Eskel')
   * @param {Object} [options={}] - Agent creation options
   * @returns {Promise<Object|null>} Agent instance, or null if name is not mapped
   */
  async getAgentByWitcher(name, options = {}) {
    return getAgentByWitcherName(name, options);
  }

  /**
   * Run an exploration task via the Regis agent.
   *
   * @param {string} query - Search / exploration query
   * @param {Object} [options={}] - Options
   * @returns {Promise<Object>} Exploration result
   */
  async explore(query, options = {}) {
    return explore(query, options);
  }

  /**
   * Run a planning task via the Dijkstra agent.
   *
   * @param {string} goal - Planning goal
   * @param {Object} [options={}] - Options
   * @returns {Promise<Object>} Planning result
   */
  async plan(goal, options = {}) {
    return plan(goal, options);
  }

  /**
   * Run a bash command via the Eskel agent.
   *
   * @param {string} command - Shell command to execute
   * @param {Object} [options={}] - Options
   * @returns {Promise<Object>} Execution result
   */
  async bash(command, options = {}) {
    return bash(command, options);
  }

  /**
   * Get the Witcher-to-agent-type mapping table.
   *
   * @returns {Object<string, string>} Map of Witcher name to agent type
   */
  getWitcherAgentMap() {
    return { ...WITCHER_AGENT_MAP };
  }

  // ===========================================================================
  // Git Workflows
  // ===========================================================================

  /**
   * Get the Commit Workflow instance.
   *
   * @param {Object} [options] - Options
   * @param {string} [options.cwd] - Working directory (defaults to process.cwd())
   * @returns {Object} Commit Workflow
   */
  getCommitWorkflow(options = {}) {
    return getCommitWorkflow({ cwd: options.cwd || process.cwd() });
  }

  /**
   * Get the PR Workflow instance.
   *
   * @param {Object} [options] - Options
   * @param {string} [options.cwd] - Working directory (defaults to process.cwd())
   * @returns {Object} PR Workflow
   */
  getPRWorkflow(options = {}) {
    return getPRWorkflow({ cwd: options.cwd || process.cwd() });
  }

  /**
   * Commit files using the commit workflow.
   *
   * @param {Object} params - Commit parameters
   * @param {string[]} params.files - Files to commit
   * @param {string} params.message - Commit message
   * @param {Object} [params.options] - Additional git options
   * @returns {Promise<Object>} Commit result
   */
  async commitFiles(params) {
    return commitFiles(params);
  }

  /**
   * Create a pull request using the PR workflow.
   *
   * @param {Object} params - PR parameters
   * @param {string} params.title - PR title
   * @param {string} params.body - PR body
   * @param {string} [params.base] - Base branch
   * @param {string} [params.head] - Head branch
   * @returns {Promise<Object>} PR creation result
   */
  async createPR(params) {
    return createPR(params);
  }

  // ===========================================================================
  // Feature Status
  // ===========================================================================

  /**
   * Get the initialization status of all feature subsystems.
   *
   * @returns {FeatureStatus} Status object indicating which features are initialized
   */
  getFeatureStatus() {
    return {
      mcp: this._mcpManager !== null,
      hooks: this._hookManager !== null,
      planning: this._planController !== null,
      tasks: this._todoManager !== null,
    };
  }

  /**
   * Check whether a specific feature is initialized.
   *
   * @param {string} feature - Feature name ('mcp', 'hooks', 'planning', 'tasks')
   * @returns {boolean} Whether the feature is initialized
   */
  isFeatureReady(feature) {
    const status = this.getFeatureStatus();
    return status[feature] || false;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Set the parent Hydra reference.
   * Used by the default agent executor for LlamaCpp fallback.
   *
   * @param {Object} hydraRef - Hydra instance
   */
  setHydraRef(hydraRef) {
    this._hydraRef = hydraRef;
  }

  /**
   * Shutdown all initialized feature subsystems.
   * Cleans up MCP connections, hooks, planning state, task storage,
   * agent cache, and git workflow instances.
   *
   * Safe to call multiple times; idempotent.
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    this._log('[FeatureManager] Shutting down...');

    // Shutdown MCP
    if (this._mcpManager) {
      try {
        await shutdownMCP();
      } catch (err) {
        this._log(`[FeatureManager] MCP shutdown error: ${err.message}`);
      }
      this._mcpManager = null;
    }

    // Shutdown Hooks
    if (this._hookManager) {
      try {
        await this._hookManager.onSessionEnd({});
      } catch (err) {
        this._log(`[FeatureManager] Hooks shutdown error: ${err.message}`);
      }
      try {
        shutdownHooks();
      } catch (_err) {
        // shutdownHooks may use require() which can fail in ESM context
      }
      this._hookManager = null;
    }

    // Shutdown Planning
    if (this._planController) {
      try {
        await shutdownPlanning();
      } catch (err) {
        this._log(`[FeatureManager] Planning shutdown error: ${err.message}`);
      }
      this._planController = null;
    }

    // Shutdown Tasks
    if (this._todoManager) {
      try {
        await shutdownTasks();
      } catch (err) {
        this._log(`[FeatureManager] Tasks shutdown error: ${err.message}`);
      }
      this._todoManager = null;
    }

    // Clear agent cache
    try {
      clearAgentCache();
    } catch (err) {
      this._log(`[FeatureManager] Agent cache clear error: ${err.message}`);
    }

    // Shutdown Git
    try {
      shutdownGit();
    } catch (_err) {
      // shutdownGit may use require() which can fail in ESM context
    }

    this._log('[FeatureManager] Shutdown complete');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Default agent executor for Plan Mode.
   * Resolves the Witcher agent by name, falls back to LlamaCpp via the parent
   * Hydra reference if the agent is unknown or unavailable.
   *
   * @param {Object} params - Execution parameters
   * @param {string} params.agent - Witcher agent name
   * @param {string} params.phase - Current plan phase
   * @param {string} params.query - Query to execute
   * @param {Object} [params.context] - Additional context
   * @returns {Promise<Object>} Agent execution result
   * @private
   */
  async _defaultAgentExecutor(params) {
    const { agent, phase, query, context } = params;

    // Attempt to resolve the Witcher agent
    const agentInstance = await getAgentByWitcherName(agent);

    if (!agentInstance) {
      // Fallback: use LlamaCpp via the parent Hydra reference
      if (this._hydraRef && typeof this._hydraRef.llamacpp === 'function') {
        return this._hydraRef.llamacpp(query);
      }
      // Last resort: return an error result
      return {
        content: `Agent "${agent}" not found and no Hydra fallback available.`,
        success: false,
        error: `Unknown agent: ${agent}`,
      };
    }

    return agentInstance.run({ query, context, phase });
  }

  /**
   * Internal logging helper. Only logs when verbose mode is enabled.
   *
   * @param {string} message - Log message
   * @private
   */
  _log(message) {
    if (this._verbose) {
      console.log(message);
    }
  }
}

// =============================================================================
// Singleton
// =============================================================================

/** @type {HydraFeatureManager|null} */
let _featureManagerInstance = null;

/**
 * Get or create the HydraFeatureManager singleton.
 *
 * @param {FeatureManagerOptions} [options={}] - Options (only used on first call)
 * @returns {HydraFeatureManager}
 */
export function getFeatureManager(options = {}) {
  if (!_featureManagerInstance) {
    _featureManagerInstance = new HydraFeatureManager(options);
  }
  return _featureManagerInstance;
}

/**
 * Reset the HydraFeatureManager singleton.
 * Calls shutdown on the existing instance before clearing it.
 *
 * @returns {Promise<void>}
 */
export async function resetFeatureManager() {
  if (_featureManagerInstance) {
    await _featureManagerInstance.shutdown();
  }
  _featureManagerInstance = null;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { PlanModeState, TodoStatus, HookEvent, WITCHER_AGENT_MAP };

// =============================================================================
// Default Export
// =============================================================================

export default HydraFeatureManager;
