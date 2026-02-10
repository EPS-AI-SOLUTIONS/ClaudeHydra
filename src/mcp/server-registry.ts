/**
 * MCP Server Registry
 *
 * Manages registration and lifecycle of MCP server connections.
 * Provides centralized access to all connected MCP servers.
 *
 * @module src/mcp/server-registry
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Constants
// ============================================================================

/**
 * Server connection states
 * @enum {string}
 */
export const ServerState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
};

// ============================================================================
// Server Entry Class
// ============================================================================

/**
 * Represents a registered MCP server
 */
export class ServerEntry {
  /**
   * @param {string} id - Server identifier
   * @param {Object} config - Server configuration
   */
  constructor(id, config) {
    this.id = id;
    this.config = config;

    /** @type {ServerState} */
    this.state = ServerState.DISCONNECTED;

    /** @type {Object | null} */
    this.client = null;

    /** @type {Object | null} */
    this.transport = null;

    /** @type {Object | null} */
    this.process = null;

    /** @type {Object[]} */
    this.tools = [];

    /** @type {Object[]} */
    this.resources = [];

    /** @type {Object[]} */
    this.prompts = [];

    /** @type {Date | null} */
    this.connectedAt = null;

    /** @type {Date | null} */
    this.lastHealthCheck = null;

    /** @type {Object | null} */
    this.healthResult = null;

    /** @type {Error | null} */
    this.lastError = null;

    /** @type {number} */
    this.reconnectAttempts = 0;

    /** @type {Object} */
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalLatency: 0,
      errors: [],
    };
  }

  /**
   * Check if server is available for use
   * @returns {boolean}
   */
  get isAvailable() {
    return this.state === ServerState.CONNECTED && this.config.enabled;
  }

  /**
   * Get average latency in ms
   * @returns {number}
   */
  get averageLatency() {
    if (this.stats.successfulCalls === 0) return 0;
    return this.stats.totalLatency / this.stats.successfulCalls;
  }

  /**
   * Get success rate as percentage
   * @returns {number}
   */
  get successRate() {
    if (this.stats.totalCalls === 0) return 100;
    return (this.stats.successfulCalls / this.stats.totalCalls) * 100;
  }

  /**
   * Record a successful call
   * @param {number} latency - Call latency in ms
   */
  recordSuccess(latency) {
    this.stats.totalCalls++;
    this.stats.successfulCalls++;
    this.stats.totalLatency += latency;
  }

  /**
   * Record a failed call
   * @param {Error} error - Error that occurred
   */
  recordFailure(error) {
    this.stats.totalCalls++;
    this.stats.failedCalls++;
    this.stats.errors.push({
      message: error.message,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 10 errors
    if (this.stats.errors.length > 10) {
      this.stats.errors.shift();
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalLatency: 0,
      errors: [],
    };
  }

  /**
   * Serialize server entry for JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      state: this.state,
      isAvailable: this.isAvailable,
      connectedAt: this.connectedAt?.toISOString(),
      lastHealthCheck: this.lastHealthCheck?.toISOString(),
      healthResult: this.healthResult,
      toolCount: this.tools.length,
      resourceCount: this.resources.length,
      promptCount: this.prompts.length,
      stats: {
        ...this.stats,
        averageLatency: this.averageLatency,
        successRate: this.successRate,
      },
      config: {
        type: this.config.type,
        enabled: this.config.enabled,
        tags: this.config.tags,
      },
    };
  }
}

// ============================================================================
// Server Registry Class
// ============================================================================

/**
 * MCP Server Registry
 *
 * Centralized registry for all MCP server connections.
 *
 * @extends EventEmitter
 * @fires ServerRegistry#serverRegistered
 * @fires ServerRegistry#serverUnregistered
 * @fires ServerRegistry#serverStateChanged
 * @fires ServerRegistry#toolsDiscovered
 */
export class ServerRegistry extends EventEmitter {
  constructor() {
    super();

    /** @type {Map<string, ServerEntry>} */
    this.servers = new Map();

    /** @type {Map<string, string>} */
    this.toolToServer = new Map();

    /** @type {string | null} */
    this.defaultServerId = null;
  }

  /**
   * Register a new server
   *
   * @param {string} id - Server identifier
   * @param {Object} config - Server configuration
   * @param {Object} [options] - Registration options
   * @param {boolean} [options.isDefault] - Set as default server
   * @returns {ServerEntry}
   */
  register(id, config, options = {}) {
    if (this.servers.has(id)) {
      throw new Error(`Server already registered: ${id}`);
    }

    const entry = new ServerEntry(id, config);
    this.servers.set(id, entry);

    if (options.isDefault || this.servers.size === 1) {
      this.defaultServerId = id;
    }

    this.emit('serverRegistered', entry);

    return entry;
  }

  /**
   * Unregister a server
   *
   * @param {string} id - Server identifier
   * @returns {boolean} - Whether server was unregistered
   */
  unregister(id) {
    const entry = this.servers.get(id);

    if (!entry) {
      return false;
    }

    // Remove tool mappings
    for (const tool of entry.tools) {
      const toolId = `mcp__${id}__${tool.name}`;
      this.toolToServer.delete(toolId);
    }

    this.servers.delete(id);

    // Update default if needed
    if (this.defaultServerId === id) {
      this.defaultServerId = this.servers.keys().next().value ?? null;
    }

    this.emit('serverUnregistered', entry);

    return true;
  }

  /**
   * Get server entry by ID
   *
   * @param {string} id - Server identifier
   * @returns {ServerEntry | null}
   */
  get(id) {
    return this.servers.get(id) ?? null;
  }

  /**
   * Check if server is registered
   *
   * @param {string} id - Server identifier
   * @returns {boolean}
   */
  has(id) {
    return this.servers.has(id);
  }

  /**
   * Get default server
   *
   * @returns {ServerEntry | null}
   */
  getDefault() {
    if (!this.defaultServerId) return null;
    return this.servers.get(this.defaultServerId) ?? null;
  }

  /**
   * Set default server
   *
   * @param {string} id - Server identifier
   */
  setDefault(id) {
    if (!this.servers.has(id)) {
      throw new Error(`Server not registered: ${id}`);
    }
    this.defaultServerId = id;
  }

  /**
   * List all registered servers
   *
   * @returns {ServerEntry[]}
   */
  list() {
    return Array.from(this.servers.values());
  }

  /**
   * List all available (connected and enabled) servers
   *
   * @returns {ServerEntry[]}
   */
  listAvailable() {
    return Array.from(this.servers.values()).filter((entry) => entry.isAvailable);
  }

  /**
   * Get servers by state
   *
   * @param {ServerState} state - State to filter by
   * @returns {ServerEntry[]}
   */
  getByState(state) {
    return Array.from(this.servers.values()).filter((entry) => entry.state === state);
  }

  /**
   * Get servers by tag
   *
   * @param {string} tag - Tag to filter by
   * @returns {ServerEntry[]}
   */
  getByTag(tag) {
    return Array.from(this.servers.values()).filter((entry) => entry.config.tags?.includes(tag));
  }

  /**
   * Update server state
   *
   * @param {string} id - Server identifier
   * @param {ServerState} state - New state
   * @param {Object} [extras] - Additional data to update
   */
  updateState(id, state, extras = {}) {
    const entry = this.servers.get(id);

    if (!entry) {
      throw new Error(`Server not registered: ${id}`);
    }

    const previousState = entry.state;
    entry.state = state;

    // Update extras
    if (extras.client !== undefined) entry.client = extras.client;
    if (extras.transport !== undefined) entry.transport = extras.transport;
    if (extras.process !== undefined) entry.process = extras.process;
    if (extras.error !== undefined) entry.lastError = extras.error;

    if (state === ServerState.CONNECTED) {
      entry.connectedAt = new Date();
      entry.reconnectAttempts = 0;
    }

    if (state === ServerState.RECONNECTING) {
      entry.reconnectAttempts++;
    }

    this.emit('serverStateChanged', {
      entry,
      previousState,
      currentState: state,
    });
  }

  /**
   * Register tools from a server
   *
   * @param {string} serverId - Server identifier
   * @param {Object[]} tools - Array of tool definitions
   */
  registerTools(serverId, tools) {
    const entry = this.servers.get(serverId);

    if (!entry) {
      throw new Error(`Server not registered: ${serverId}`);
    }

    entry.tools = tools;

    // Create tool-to-server mappings
    for (const tool of tools) {
      const toolId = `mcp__${serverId}__${tool.name}`;
      this.toolToServer.set(toolId, serverId);
    }

    this.emit('toolsDiscovered', { serverId, tools });
  }

  /**
   * Register resources from a server
   *
   * @param {string} serverId - Server identifier
   * @param {Object[]} resources - Array of resource definitions
   */
  registerResources(serverId, resources) {
    const entry = this.servers.get(serverId);

    if (!entry) {
      throw new Error(`Server not registered: ${serverId}`);
    }

    entry.resources = resources;
  }

  /**
   * Register prompts from a server
   *
   * @param {string} serverId - Server identifier
   * @param {Object[]} prompts - Array of prompt definitions
   */
  registerPrompts(serverId, prompts) {
    const entry = this.servers.get(serverId);

    if (!entry) {
      throw new Error(`Server not registered: ${serverId}`);
    }

    entry.prompts = prompts;
  }

  /**
   * Find server that provides a tool
   *
   * @param {string} toolId - Tool identifier (mcp__serverId__toolName)
   * @returns {ServerEntry | null}
   */
  findServerForTool(toolId) {
    const serverId = this.toolToServer.get(toolId);

    if (!serverId) return null;

    return this.servers.get(serverId) ?? null;
  }

  /**
   * Get all registered tools across all servers
   *
   * @param {Object} [options] - Options
   * @param {boolean} [options.onlyAvailable=true] - Only from available servers
   * @returns {Object[]}
   */
  getAllTools(options = { onlyAvailable: true }) {
    const allTools = [];
    const servers = options.onlyAvailable ? this.listAvailable() : this.list();

    for (const entry of servers) {
      for (const tool of entry.tools) {
        allTools.push({
          ...tool,
          name: `mcp__${entry.id}__${tool.name}`,
          serverId: entry.id,
          serverType: entry.config.type,
        });
      }
    }

    return allTools;
  }

  /**
   * Update health check result
   *
   * @param {string} id - Server identifier
   * @param {Object} result - Health check result
   */
  updateHealth(id, result) {
    const entry = this.servers.get(id);

    if (!entry) {
      throw new Error(`Server not registered: ${id}`);
    }

    entry.lastHealthCheck = new Date();
    entry.healthResult = result;
  }

  /**
   * Get registry statistics
   *
   * @returns {Object}
   */
  getStats() {
    const servers = this.list();

    return {
      total: servers.length,
      connected: this.getByState(ServerState.CONNECTED).length,
      disconnected: this.getByState(ServerState.DISCONNECTED).length,
      error: this.getByState(ServerState.ERROR).length,
      totalTools: this.toolToServer.size,
      servers: servers.map((entry) => entry.toJSON()),
    };
  }

  /**
   * Clear all registrations
   */
  clear() {
    this.servers.clear();
    this.toolToServer.clear();
    this.defaultServerId = null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create server registry instance
 *
 * @returns {ServerRegistry}
 */
export function getServerRegistry() {
  if (!_instance) {
    _instance = new ServerRegistry();
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetServerRegistry() {
  if (_instance) {
    _instance.clear();
    _instance = null;
  }
}

export default ServerRegistry;
