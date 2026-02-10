/**
 * Hook Manager
 *
 * Orchestrates hook execution for various lifecycle events.
 *
 * @module src/hooks/hook-manager
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getBuiltinHook } from './builtin-hooks.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Hook event types
 * @enum {string}
 */
export const HookEvent = {
  SESSION_START: 'SessionStart',
  SESSION_END: 'SessionEnd',
  PRE_TOOL_USE: 'PreToolUse',
  POST_TOOL_USE: 'PostToolUse',
  POST_TOOL_USE_FAILURE: 'PostToolUseFailure',
  PRE_PLAN_PHASE: 'PrePlanPhase',
  POST_PLAN_PHASE: 'PostPlanPhase',
};

/**
 * Default hooks configuration path
 * @constant {string}
 */
const DEFAULT_CONFIG_PATH = '.hydra/hooks.json';

// ============================================================================
// Hook Manager Class
// ============================================================================

/**
 * Hook Manager
 *
 * Manages hook registration, loading, and execution.
 *
 * @extends EventEmitter
 * @fires HookManager#hookExecuted
 * @fires HookManager#hookFailed
 * @fires HookManager#configLoaded
 */
export class HookManager extends EventEmitter {
  /**
   * @param {Object} options - Manager options
   * @param {string} [options.configPath] - Path to hooks configuration
   */
  constructor(options = {}) {
    super();

    this.configPath = options.configPath || path.join(process.cwd(), DEFAULT_CONFIG_PATH);

    /** @type {Map<string, Object[]>} */
    this.hooks = new Map();

    /** @type {Object | null} */
    this.config = null;

    /** @type {boolean} */
    this.initialized = false;

    // Initialize all event types
    for (const event of Object.values(HookEvent)) {
      this.hooks.set(event, []);
    }
  }

  /**
   * Initialize hook manager
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.loadConfig();
    this.initialized = true;
  }

  /**
   * Load hooks configuration from file
   *
   * @returns {Promise<void>}
   */
  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);

      // Register hooks from config
      for (const [eventName, hookConfigs] of Object.entries(this.config.hooks || {})) {
        for (const hookConfig of hookConfigs) {
          if (hookConfig.enabled !== false) {
            await this.registerFromConfig(eventName, hookConfig);
          }
        }
      }

      this.emit('configLoaded', { config: this.config });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`[HookManager] Failed to load config: ${error.message}`);
      }
      // Use defaults if no config found
      this.config = { version: '1.0.0', hooks: {} };
    }
  }

  /**
   * Register a hook from configuration
   *
   * @param {string} eventName - Event name
   * @param {Object} hookConfig - Hook configuration
   */
  async registerFromConfig(eventName, hookConfig) {
    const { handler, type = 'builtin', timeout = 30000, options = {} } = hookConfig;

    let hookFn;

    if (type === 'builtin') {
      hookFn = getBuiltinHook(handler);
      if (!hookFn) {
        console.warn(`[HookManager] Unknown builtin hook: ${handler}`);
        return;
      }
    } else if (type === 'shell') {
      hookFn = this.createShellHook(handler, options);
    } else if (type === 'custom') {
      try {
        const module = await import(path.resolve(handler));
        hookFn = module.default || module.hook;
      } catch (_error) {
        console.warn(`[HookManager] Failed to load custom hook: ${handler}`);
        return;
      }
    }

    this.register(eventName, {
      name: handler,
      type,
      fn: hookFn,
      timeout,
      options,
    });
  }

  /**
   * Create a shell command hook
   *
   * @param {string} command - Shell command
   * @param {Object} options - Options
   * @returns {Function}
   */
  createShellHook(command, options = {}) {
    return async (context) => {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      // Interpolate context variables into command
      let interpolatedCommand = command;
      for (const [key, value] of Object.entries(context)) {
        interpolatedCommand = interpolatedCommand.replace(
          new RegExp(`\\$\\{${key}\\}`, 'g'),
          String(value),
        );
      }

      try {
        const { stdout, stderr } = await execAsync(interpolatedCommand, {
          timeout: options.timeout || 30000,
          cwd: options.cwd || process.cwd(),
          env: { ...process.env, ...options.env },
        });

        return {
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          exitCode: error.code,
        };
      }
    };
  }

  /**
   * Register a hook
   *
   * @param {string} event - Event name
   * @param {Object} hook - Hook object
   */
  register(event, hook) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }

    this.hooks.get(event).push(hook);
  }

  /**
   * Unregister a hook
   *
   * @param {string} event - Event name
   * @param {string} hookName - Hook name to remove
   */
  unregister(event, hookName) {
    if (!this.hooks.has(event)) {
      return;
    }

    const hooks = this.hooks.get(event);
    const index = hooks.findIndex((h) => h.name === hookName);
    if (index !== -1) {
      hooks.splice(index, 1);
    }
  }

  /**
   * Execute hooks for an event
   *
   * @param {string} event - Event name
   * @param {Object} context - Hook context
   * @param {Object} [options] - Execution options
   * @param {boolean} [options.stopOnFailure=false] - Stop execution on first failure
   * @returns {Promise<Object>}
   */
  async execute(event, context, options = {}) {
    const hooks = this.hooks.get(event) || [];

    if (hooks.length === 0) {
      return { success: true, results: [], skipped: true };
    }

    const results = [];
    let success = true;

    for (const hook of hooks) {
      const startTime = Date.now();

      try {
        const result = await this.executeHook(hook, context);
        const duration = Date.now() - startTime;

        results.push({
          name: hook.name,
          success: result.success !== false,
          duration,
          result,
        });

        this.emit('hookExecuted', {
          event,
          hook: hook.name,
          success: result.success !== false,
          duration,
          result,
        });

        // Check if hook blocked execution
        if (result.blocked) {
          success = false;
          if (options.stopOnFailure) {
            break;
          }
        }

        // Check if hook failed and we should stop
        if (result.success === false && options.stopOnFailure) {
          success = false;
          break;
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        results.push({
          name: hook.name,
          success: false,
          duration,
          error: error.message,
        });

        this.emit('hookFailed', {
          event,
          hook: hook.name,
          duration,
          error,
        });

        success = false;

        if (options.stopOnFailure) {
          break;
        }
      }
    }

    return { success, results };
  }

  /**
   * Execute a single hook with timeout
   *
   * @param {Object} hook - Hook to execute
   * @param {Object} context - Hook context
   * @returns {Promise<Object>}
   */
  async executeHook(hook, context) {
    const timeout = hook.timeout || 30000;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Hook timeout: ${hook.name}`)), timeout);
    });

    const executionPromise = hook.fn({
      ...context,
      hookOptions: hook.options,
    });

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Execute session start hooks
   *
   * @param {Object} context - Session context
   * @returns {Promise<Object>}
   */
  async onSessionStart(context = {}) {
    return this.execute(HookEvent.SESSION_START, context);
  }

  /**
   * Execute session end hooks
   *
   * @param {Object} context - Session context
   * @returns {Promise<Object>}
   */
  async onSessionEnd(context = {}) {
    return this.execute(HookEvent.SESSION_END, context);
  }

  /**
   * Execute pre-tool-use hooks
   *
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>}
   */
  async onPreToolUse(toolName, args) {
    return this.execute(HookEvent.PRE_TOOL_USE, { toolName, args }, { stopOnFailure: true });
  }

  /**
   * Execute post-tool-use hooks
   *
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   * @param {Object} result - Tool result
   * @param {number} duration - Execution duration
   * @returns {Promise<Object>}
   */
  async onPostToolUse(toolName, args, result, duration) {
    return this.execute(HookEvent.POST_TOOL_USE, {
      toolName,
      args,
      result,
      duration,
      success: true,
    });
  }

  /**
   * Execute post-tool-use-failure hooks
   *
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   * @param {Error} error - Error that occurred
   * @param {number} retryCount - Number of retries so far
   * @returns {Promise<Object>}
   */
  async onPostToolUseFailure(toolName, args, error, retryCount = 0) {
    return this.execute(HookEvent.POST_TOOL_USE_FAILURE, {
      toolName,
      args,
      error,
      retryCount,
      success: false,
    });
  }

  /**
   * Execute pre-plan-phase hooks
   *
   * @param {string} phase - Phase name
   * @param {Object} plan - Plan object
   * @returns {Promise<Object>}
   */
  async onPrePlanPhase(phase, plan) {
    return this.execute(HookEvent.PRE_PLAN_PHASE, { phase, plan }, { stopOnFailure: true });
  }

  /**
   * Execute post-plan-phase hooks
   *
   * @param {string} phase - Phase name
   * @param {Object} plan - Plan object
   * @param {Object} output - Phase output
   * @param {number} duration - Phase duration
   * @returns {Promise<Object>}
   */
  async onPostPlanPhase(phase, plan, output, duration) {
    return this.execute(HookEvent.POST_PLAN_PHASE, {
      phase,
      plan,
      output,
      duration,
    });
  }

  /**
   * Get registered hooks for an event
   *
   * @param {string} event - Event name
   * @returns {Object[]}
   */
  getHooks(event) {
    return this.hooks.get(event) || [];
  }

  /**
   * Get all registered hooks
   *
   * @returns {Object}
   */
  getAllHooks() {
    const result = {};
    for (const [event, hooks] of this.hooks) {
      result[event] = hooks.map((h) => ({
        name: h.name,
        type: h.type,
        timeout: h.timeout,
      }));
    }
    return result;
  }

  /**
   * Clear all hooks
   */
  clear() {
    for (const event of Object.values(HookEvent)) {
      this.hooks.set(event, []);
    }
  }

  /**
   * Reset manager
   */
  reset() {
    this.clear();
    this.config = null;
    this.initialized = false;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create hook manager instance
 *
 * @param {Object} [options] - Manager options
 * @returns {HookManager}
 */
export function getHookManager(options = {}) {
  if (!_instance) {
    _instance = new HookManager(options);
  }
  return _instance;
}

/**
 * Initialize hook manager
 *
 * @param {Object} [options] - Options
 * @returns {Promise<HookManager>}
 */
export async function initializeHookManager(options = {}) {
  const manager = getHookManager(options);
  await manager.initialize();
  return manager;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetHookManager() {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}

export default HookManager;
