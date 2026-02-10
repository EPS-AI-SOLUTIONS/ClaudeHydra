/**
 * ToolRegistry - Advanced tool management system
 *
 * Features:
 * - Lazy loading of tools on demand
 * - Tool validation with JSON Schema
 * - Tool categories and grouping
 * - Comprehensive error handling with specific error types
 * - Before/after execution hooks
 * - Tool metadata (version, author, etc.)
 * - Performance: caching of tool instances and results
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ToolExecutionError,
  ToolHookError,
  ToolLoadError,
  ToolNotFoundError,
  ToolRegistrationError,
  ToolTimeoutError,
  ToolValidationError,
} from './errors/AppError.js';
import { getStatsCollector } from './hydra/core/stats.js';
import Logger from './logger.js';
import { ToolCategory, validateToolDefinition, validateToolInput } from './schemas/tool-schema.js';
import { generateId } from './utils/string.js';
import { formatDate, now } from './utils/time.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execution context passed to hooks
 * @typedef {Object} ExecutionContext
 * @property {string} toolName - Name of the tool being executed
 * @property {any} input - Input parameters
 * @property {number} startTime - Execution start timestamp
 * @property {string} executionId - Unique execution identifier
 * @property {Map<string, any>} metadata - Additional metadata for the execution
 */

/**
 * Hook result that can modify execution
 * @typedef {Object} HookResult
 * @property {boolean} [abort] - Whether to abort execution
 * @property {any} [modifiedInput] - Modified input to use
 * @property {any} [result] - Result to return (skips actual execution)
 * @property {string} [abortReason] - Reason for aborting
 */

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {any} result - Cached result
 * @property {number} timestamp - When the entry was cached
 * @property {number} ttl - Time-to-live in milliseconds
 * @property {string} inputHash - Hash of the input
 */

class ToolRegistry {
  constructor() {
    /** @type {Map<string, object>} Loaded tool instances */
    this.tools = new Map();

    /** @type {Map<string, string>} Tool name to file path mapping for lazy loading */
    this.toolPaths = new Map();

    /** @type {Map<string, Set<string>>} Category to tool names mapping */
    this.categories = new Map();

    /** @type {Map<string, CacheEntry>} Result cache */
    this.resultCache = new Map();

    /** @type {Array<Function>} Before execution hooks */
    this.beforeHooks = [];

    /** @type {Array<Function>} After execution hooks */
    this.afterHooks = [];

    /** @type {Map<string, Array<Function>>} Tool-specific before hooks */
    this.toolBeforeHooks = new Map();

    /** @type {Map<string, Array<Function>>} Tool-specific after hooks */
    this.toolAfterHooks = new Map();

    /** @type {string} Path to tools directory */
    this.toolsPath = path.join(__dirname, 'tools');

    /** @type {boolean} Whether tool discovery has been performed */
    this.discovered = false;

    /** @type {Map<string, object>} Tool execution statistics */
    this.stats = new Map();

    /** @type {number} Cache cleanup interval ID */
    this._cacheCleanupInterval = null;

    // Initialize categories map with all known categories
    for (const category of Object.values(ToolCategory)) {
      this.categories.set(category, new Set());
    }
  }

  /**
   * Generate a unique execution ID
   * Uses the generateId function from utils/string.js
   * @returns {string}
   */
  _generateExecutionId() {
    return generateId('exec');
  }

  /**
   * Generate a hash for cache key
   * @param {any} input - Input to hash
   * @returns {string}
   */
  _hashInput(input) {
    return JSON.stringify(input);
  }

  /**
   * Start cache cleanup interval
   */
  _startCacheCleanup() {
    if (this._cacheCleanupInterval) return;

    this._cacheCleanupInterval = setInterval(() => {
      const currentTime = now();
      for (const [key, entry] of this.resultCache.entries()) {
        if (currentTime - entry.timestamp > entry.ttl) {
          this.resultCache.delete(key);
          Logger.debug(`Cache entry expired: ${key}`);
        }
      }
    }, 60000); // Clean every minute

    // Don't prevent process exit
    if (this._cacheCleanupInterval.unref) {
      this._cacheCleanupInterval.unref();
    }
  }

  /**
   * Discover available tools without loading them (lazy loading support)
   * Scans the tools directory and maps tool files for on-demand loading
   */
  async discoverTools() {
    Logger.info('Discovering tools...');

    if (!fs.existsSync(this.toolsPath)) {
      Logger.warn(`Tools directory not found: ${this.toolsPath}`);
      return;
    }

    // Exclude index and base-tool — they don't export tools directly
    const excludeFiles = ['index.js', 'base-tool.js', 'index.ts', 'base-tool.ts'];
    const files = fs
      .readdirSync(this.toolsPath)
      .filter((f) => (f.endsWith('.js') || f.endsWith('.ts')) && !excludeFiles.includes(f));

    for (const file of files) {
      const fullPath = path.join(this.toolsPath, file);

      // Extract tool metadata from file without full import (peek)
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const toolNames = this._extractToolNames(content, file);

        for (const toolName of toolNames) {
          this.toolPaths.set(toolName, fullPath);
          Logger.debug(`Discovered tool: ${toolName} -> ${file}`);
        }
      } catch (error) {
        Logger.warn(`Failed to discover tools in ${file}`, { error: error.message });
      }
    }

    this.discovered = true;
    Logger.info(`Discovered ${this.toolPaths.size} tools`);
  }

  /**
   * Extract tool names from file content without executing it
   * @param {string} content - File content
   * @param {string} filename - File name for context
   * @returns {string[]}
   */
  _extractToolNames(content, filename) {
    const names = [];

    // Match patterns like: name: 'tool_name' or name: "tool_name"
    const namePattern = /name:\s*['"]([a-z][a-z0-9_]*)['"],?/g;
    let match;

    while ((match = namePattern.exec(content)) !== null) {
      names.push(match[1]);
    }

    // Fallback: derive from filename if no names found
    if (names.length === 0) {
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext).replace(/-/g, '_');
      names.push(baseName);
    }

    return names;
  }

  /**
   * Load all tools immediately (eager loading)
   * Use this if you need all tools available at startup
   */
  async loadTools() {
    Logger.info('Loading all tools (eager mode)...');

    if (!fs.existsSync(this.toolsPath)) {
      Logger.warn('Tools directory not found.');
      return;
    }

    // Exclude index and base-tool — they don't export tools directly
    const excludeFiles = ['index.js', 'base-tool.js', 'index.ts', 'base-tool.ts'];
    const files = fs
      .readdirSync(this.toolsPath)
      .filter((f) => (f.endsWith('.js') || f.endsWith('.ts')) && !excludeFiles.includes(f));

    for (const file of files) {
      await this._loadToolFile(path.join(this.toolsPath, file));
    }

    this.discovered = true;
    this._startCacheCleanup();
    Logger.info(`Total tools loaded: ${this.tools.size}`);
  }

  /**
   * Load a single tool file
   * @param {string} fullPath - Full path to the tool file
   * @returns {Promise<object[]>} Loaded tools
   */
  async _loadToolFile(fullPath) {
    const file = path.basename(fullPath);
    const loadedTools = [];

    try {
      const moduleUrl = pathToFileURL(fullPath).href;
      const toolModule = await import(moduleUrl);
      const tools = Array.isArray(toolModule.default) ? toolModule.default : [toolModule.default];

      for (const tool of tools) {
        if (tool?.name && tool.execute) {
          await this.registerTool(tool, { source: file });
          loadedTools.push(tool);
        }
      }
    } catch (error) {
      throw new ToolLoadError(fullPath, error.message, error);
    }

    return loadedTools;
  }

  /**
   * Load a specific tool by name (lazy loading)
   * @param {string} toolName - Name of the tool to load
   * @returns {Promise<object>} The loaded tool
   */
  async _loadTool(toolName) {
    // Already loaded?
    if (this.tools.has(toolName)) {
      return this.tools.get(toolName);
    }

    // Discover if not done yet
    if (!this.discovered) {
      await this.discoverTools();
    }

    // Get the file path
    const toolPath = this.toolPaths.get(toolName);
    if (!toolPath) {
      throw new ToolNotFoundError(toolName, Array.from(this.toolPaths.keys()));
    }

    // Load the file
    await this._loadToolFile(toolPath);

    // Should be loaded now
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new ToolLoadError(toolPath, `Tool '${toolName}' was not found after loading file`);
    }

    return tool;
  }

  /**
   * Register a tool with validation
   * @param {object} tool - Tool definition
   * @param {object} options - Registration options
   * @param {string} options.source - Source file name
   * @param {boolean} options.override - Allow overriding existing tools
   */
  async registerTool(tool, options = {}) {
    const { source = 'manual', override = false } = options;

    // Validate the tool definition
    const validation = validateToolDefinition(tool);
    if (!validation.valid) {
      throw new ToolRegistrationError(tool.name || 'unknown', validation.errors.join('; '));
    }

    // Check for duplicates
    if (this.tools.has(tool.name) && !override) {
      throw new ToolRegistrationError(
        tool.name,
        'Tool already registered. Use override option to replace.',
      );
    }

    // Apply defaults
    const normalizedTool = {
      category: ToolCategory.CUSTOM,
      timeout: 30000,
      retryable: false,
      maxRetries: 0,
      cacheable: false,
      cacheTTL: 0,
      requiresConfirmation: false,
      dangerous: false,
      ...tool,
      metadata: {
        version: '1.0.0',
        author: 'unknown',
        registeredAt: formatDate(),
        source,
        ...tool.metadata,
      },
    };

    // Register the tool
    this.tools.set(normalizedTool.name, normalizedTool);
    this.toolPaths.set(normalizedTool.name, source);

    // Add to category
    const categorySet = this.categories.get(normalizedTool.category) || new Set();
    categorySet.add(normalizedTool.name);
    this.categories.set(normalizedTool.category, categorySet);

    // Initialize stats
    this.stats.set(normalizedTool.name, {
      invocations: 0,
      successes: 0,
      failures: 0,
      totalDuration: 0,
      avgDuration: 0,
      lastInvoked: null,
      cacheHits: 0,
    });

    Logger.debug(`Registered tool: ${normalizedTool.name} [${normalizedTool.category}]`);
  }

  /**
   * Unregister a tool
   * @param {string} toolName - Name of the tool to unregister
   * @returns {boolean} Whether the tool was unregistered
   */
  unregisterTool(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool) return false;

    // Remove from category
    const categorySet = this.categories.get(tool.category);
    if (categorySet) {
      categorySet.delete(toolName);
    }

    // Remove from all maps
    this.tools.delete(toolName);
    this.toolPaths.delete(toolName);
    this.stats.delete(toolName);
    this.toolBeforeHooks.delete(toolName);
    this.toolAfterHooks.delete(toolName);

    // Clear related cache entries
    for (const key of this.resultCache.keys()) {
      if (key.startsWith(`${toolName}:`)) {
        this.resultCache.delete(key);
      }
    }

    Logger.info(`Unregistered tool: ${toolName}`);
    return true;
  }

  /**
   * Get a tool by name (loads it if necessary)
   * @param {string} name - Tool name
   * @returns {Promise<object|undefined>}
   */
  async getTool(name) {
    if (this.tools.has(name)) {
      return this.tools.get(name);
    }

    try {
      return await this._loadTool(name);
    } catch (error) {
      if (error instanceof ToolNotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get tool synchronously (only returns if already loaded)
   * @param {string} name - Tool name
   * @returns {object|undefined}
   */
  getToolSync(name) {
    return this.tools.get(name);
  }

  /**
   * Get all loaded tools' public information
   * @returns {object[]}
   */
  getAllTools() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      inputSchema: t.inputSchema,
      metadata: t.metadata,
      dangerous: t.dangerous,
      requiresConfirmation: t.requiresConfirmation,
    }));
  }

  /**
   * Get tools by category
   * @param {string} category - Category name
   * @returns {object[]}
   */
  getToolsByCategory(category) {
    const toolNames = this.categories.get(category);
    if (!toolNames) return [];

    return Array.from(toolNames)
      .map((name) => this.tools.get(name))
      .filter(Boolean);
  }

  /**
   * Get all discovered tool names (including not-yet-loaded)
   * @returns {string[]}
   */
  getDiscoveredToolNames() {
    return Array.from(this.toolPaths.keys());
  }

  /**
   * Get all categories with their tool counts
   * @returns {Object<string, number>}
   */
  getCategorySummary() {
    const summary = {};
    for (const [category, tools] of this.categories.entries()) {
      summary[category] = tools.size;
    }
    return summary;
  }

  // ============================================
  // Hook Management
  // ============================================

  /**
   * Register a global before-execution hook
   * @param {Function} hook - Hook function (context) => HookResult | void
   * @returns {Function} Unregister function
   */
  onBeforeExecute(hook) {
    this.beforeHooks.push(hook);
    return () => {
      const idx = this.beforeHooks.indexOf(hook);
      if (idx !== -1) this.beforeHooks.splice(idx, 1);
    };
  }

  /**
   * Register a global after-execution hook
   * @param {Function} hook - Hook function (context, result, error) => void
   * @returns {Function} Unregister function
   */
  onAfterExecute(hook) {
    this.afterHooks.push(hook);
    return () => {
      const idx = this.afterHooks.indexOf(hook);
      if (idx !== -1) this.afterHooks.splice(idx, 1);
    };
  }

  /**
   * Register a before-execution hook for a specific tool
   * @param {string} toolName - Tool name
   * @param {Function} hook - Hook function
   * @returns {Function} Unregister function
   */
  onBeforeToolExecute(toolName, hook) {
    if (!this.toolBeforeHooks.has(toolName)) {
      this.toolBeforeHooks.set(toolName, []);
    }
    this.toolBeforeHooks.get(toolName).push(hook);

    return () => {
      const hooks = this.toolBeforeHooks.get(toolName);
      if (hooks) {
        const idx = hooks.indexOf(hook);
        if (idx !== -1) hooks.splice(idx, 1);
      }
    };
  }

  /**
   * Register an after-execution hook for a specific tool
   * @param {string} toolName - Tool name
   * @param {Function} hook - Hook function
   * @returns {Function} Unregister function
   */
  onAfterToolExecute(toolName, hook) {
    if (!this.toolAfterHooks.has(toolName)) {
      this.toolAfterHooks.set(toolName, []);
    }
    this.toolAfterHooks.get(toolName).push(hook);

    return () => {
      const hooks = this.toolAfterHooks.get(toolName);
      if (hooks) {
        const idx = hooks.indexOf(hook);
        if (idx !== -1) hooks.splice(idx, 1);
      }
    };
  }

  /**
   * Run before hooks
   * @param {ExecutionContext} context - Execution context
   * @returns {Promise<HookResult>}
   */
  async _runBeforeHooks(context) {
    const allHooks = [...this.beforeHooks, ...(this.toolBeforeHooks.get(context.toolName) || [])];

    let currentInput = context.input;

    for (const hook of allHooks) {
      try {
        const result = await hook({ ...context, input: currentInput });

        if (result) {
          if (result.abort) {
            return result;
          }
          if (result.modifiedInput !== undefined) {
            currentInput = result.modifiedInput;
          }
          if (result.result !== undefined) {
            return { ...result, modifiedInput: currentInput };
          }
        }
      } catch (error) {
        throw new ToolHookError('before', context.toolName, error.message, error);
      }
    }

    return { modifiedInput: currentInput };
  }

  /**
   * Run after hooks
   * @param {ExecutionContext} context - Execution context
   * @param {any} result - Execution result
   * @param {Error|null} error - Execution error if any
   */
  async _runAfterHooks(context, result, error) {
    const allHooks = [...this.afterHooks, ...(this.toolAfterHooks.get(context.toolName) || [])];

    for (const hook of allHooks) {
      try {
        await hook(context, result, error);
      } catch (hookError) {
        Logger.warn(`After-hook failed for ${context.toolName}`, { error: hookError.message });
      }
    }
  }

  // ============================================
  // Tool Execution - Helper Methods
  // ============================================

  /**
   * Check result cache for a tool execution
   * @param {object} tool - Tool definition
   * @param {any} input - Tool input
   * @returns {{ hit: boolean, result?: any }}
   */
  _checkCache(tool, input) {
    if (!tool.cacheable || tool.cacheTTL <= 0) return { hit: false };

    const cacheKey = `${tool.name}:${this._hashInput(input)}`;
    const cached = this.resultCache.get(cacheKey);

    if (cached && now() - cached.timestamp < cached.ttl) {
      const stats = this.stats.get(tool.name);
      if (stats) stats.cacheHits++;
      Logger.debug(`Cache hit for ${tool.name}`);
      return { hit: true, result: cached.result };
    }

    return { hit: false };
  }

  /**
   * Store result in cache if tool is cacheable
   * @param {object} tool - Tool definition
   * @param {any} input - Tool input
   * @param {any} result - Execution result
   */
  _storeInCache(tool, input, result) {
    if (!tool.cacheable || tool.cacheTTL <= 0) return;

    const cacheKey = `${tool.name}:${this._hashInput(input)}`;
    this.resultCache.set(cacheKey, {
      result,
      timestamp: now(),
      ttl: tool.cacheTTL,
      inputHash: this._hashInput(input),
    });
    this._startCacheCleanup();
  }

  /**
   * Record execution stats for a tool
   * @param {string} toolName - Tool name
   * @param {string} category - Tool category
   * @param {number} startTime - Execution start timestamp
   * @param {boolean} success - Whether execution succeeded
   * @param {Error} [error] - Error if execution failed
   */
  _recordExecutionStats(toolName, category, startTime, success, error = null) {
    const stats = this.stats.get(toolName);
    const duration = now() - startTime;

    if (stats) {
      if (success) {
        stats.successes++;
        stats.totalDuration += duration;
        stats.avgDuration = stats.totalDuration / stats.successes;
      } else {
        stats.failures++;
      }
    }

    this._reportToStatsCollector(toolName, category, duration, success, error);
  }

  // ============================================
  // Tool Execution
  // ============================================

  /**
   * Execute a tool with full lifecycle management
   * @param {string} toolName - Name of the tool to execute
   * @param {any} input - Input parameters
   * @param {object} options - Execution options
   * @returns {Promise<any>}
   */
  async executeTool(toolName, input, options = {}) {
    const tool = await this.getTool(toolName);

    if (!tool) {
      throw new ToolNotFoundError(toolName, Array.from(this.tools.keys()));
    }

    const context = {
      toolName,
      input,
      startTime: now(),
      executionId: this._generateExecutionId(),
      metadata: new Map(Object.entries(options.metadata || {})),
    };

    const stats = this.stats.get(toolName);
    if (stats) {
      stats.invocations++;
      stats.lastInvoked = formatDate();
    }

    let result = null;
    let executionError = null;

    try {
      // Validate input
      const inputValidation = validateToolInput(tool, input);
      if (!inputValidation.valid) {
        throw new ToolValidationError(toolName, inputValidation.errors);
      }

      // Run before hooks
      const hookResult = await this._runBeforeHooks(context);

      if (hookResult.abort) {
        throw new ToolExecutionError(toolName, hookResult.abortReason || 'Aborted by hook');
      }

      if (hookResult.result !== undefined) {
        result = hookResult.result;
        return result;
      }

      const finalInput = hookResult.modifiedInput !== undefined ? hookResult.modifiedInput : input;

      // Check cache
      const cacheResult = this._checkCache(tool, finalInput);
      if (cacheResult.hit) {
        result = cacheResult.result;
        return result;
      }

      // Execute with timeout
      const timeout = options.timeout || tool.timeout || 30000;
      result = await this._executeWithTimeout(tool, finalInput, timeout);

      // Cache result
      this._storeInCache(tool, finalInput, result);

      // Record success stats
      this._recordExecutionStats(toolName, tool.category, context.startTime, true);

      return result;
    } catch (error) {
      executionError = error;

      // Record failure stats
      this._recordExecutionStats(toolName, tool.category, context.startTime, false, error);

      // Retry logic
      if (tool.retryable && tool.maxRetries > 0 && !options._retryCount) {
        const retryCount = options._retryCount || 0;
        if (retryCount < tool.maxRetries) {
          Logger.warn(`Retrying tool ${toolName} (attempt ${retryCount + 1}/${tool.maxRetries})`);
          return this.executeTool(toolName, input, {
            ...options,
            _retryCount: retryCount + 1,
          });
        }
      }

      throw error;
    } finally {
      await this._runAfterHooks(context, result, executionError);
    }
  }

  /**
   * Execute a tool with timeout
   * @param {object} tool - Tool definition
   * @param {any} input - Input parameters
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<any>}
   */
  async _executeWithTimeout(tool, input, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new ToolTimeoutError(tool.name, timeout));
      }, timeout);

      Promise.resolve(tool.execute(input))
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          if (error instanceof ToolExecutionError) {
            reject(error);
          } else {
            reject(new ToolExecutionError(tool.name, error.message, error));
          }
        });
    });
  }

  // ============================================
  // Central Metrics Integration
  // ============================================

  /**
   * Report tool execution to the central StatsCollector.
   * This bridges ToolRegistry's per-tool stats into the Prometheus pipeline,
   * making tool execution metrics visible in exportPrometheus() output.
   *
   * @param {string} toolName - Name of the executed tool
   * @param {string} category - Tool category
   * @param {number} duration - Execution duration in ms
   * @param {boolean} success - Whether execution succeeded
   * @param {Error} [error] - Error if execution failed
   * @private
   */
  _reportToStatsCollector(toolName, category, duration, success, error = null) {
    try {
      const collector = getStatsCollector();
      collector.recordRequest({
        provider: 'tool',
        category: category || 'custom',
        latency: duration,
        success,
        error: error ? { type: error.constructor?.name || 'Error' } : null,
      });

      // Also record in the tool-specific counter for granular tool metrics
      collector.requests.inc(1, {
        type: 'tool_execution',
        tool: toolName,
        status: success ? 'success' : 'failure',
      });
    } catch {
      // Silently ignore — stats collection should never break tool execution
    }
  }

  // ============================================
  // Statistics and Monitoring
  // ============================================

  /**
   * Get execution statistics for a tool
   * @param {string} toolName - Tool name
   * @returns {object|undefined}
   */
  getToolStats(toolName) {
    return this.stats.get(toolName);
  }

  /**
   * Get all tool statistics
   * @returns {Object<string, object>}
   */
  getAllStats() {
    const allStats = {};
    for (const [name, stats] of this.stats.entries()) {
      allStats[name] = { ...stats };
    }
    return allStats;
  }

  /**
   * Reset statistics for a tool or all tools
   * @param {string} [toolName] - Optional tool name (resets all if not provided)
   */
  resetStats(toolName) {
    const resetOne = (name) => {
      this.stats.set(name, {
        invocations: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0,
        lastInvoked: null,
        cacheHits: 0,
      });
    };

    if (toolName) {
      resetOne(toolName);
    } else {
      for (const name of this.stats.keys()) {
        resetOne(name);
      }
    }
  }

  /**
   * Clear the result cache
   * @param {string} [toolName] - Optional tool name (clears all if not provided)
   */
  clearCache(toolName) {
    if (toolName) {
      for (const key of this.resultCache.keys()) {
        if (key.startsWith(`${toolName}:`)) {
          this.resultCache.delete(key);
        }
      }
    } else {
      this.resultCache.clear();
    }
    Logger.info(`Cache cleared${toolName ? ` for ${toolName}` : ''}`);
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getCacheStats() {
    const currentTime = now();
    return {
      size: this.resultCache.size,
      entries: Array.from(this.resultCache.entries()).map(([key, entry]) => ({
        key,
        age: currentTime - entry.timestamp,
        ttl: entry.ttl,
        expiresIn: entry.ttl - (currentTime - entry.timestamp),
      })),
    };
  }

  /**
   * Shutdown the registry (cleanup)
   */
  shutdown() {
    if (this._cacheCleanupInterval) {
      clearInterval(this._cacheCleanupInterval);
      this._cacheCleanupInterval = null;
    }
    this.resultCache.clear();
    Logger.info('ToolRegistry shutdown complete');
  }

  /**
   * Reset the registry (for testing purposes)
   * Clears all registered tools and resets state
   */
  reset() {
    this.tools.clear();
    this.resultCache.clear();
    this.resetStats();
    this._toolsLoaded = false;
    Logger.info('ToolRegistry reset complete');
  }
}

// Export singleton instance
const registry = new ToolRegistry();

// Export both instance and class for testing
export { ToolRegistry, ToolCategory };
export default registry;
