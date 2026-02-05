/**
 * MCP Client Manager
 *
 * Central manager for MCP server connections.
 * Handles connection lifecycle, tool discovery, and request routing.
 *
 * @module src/mcp/client-manager
 */

import { EventEmitter } from 'events';
import { MCPConfigLoader, getConfigLoader } from './config-loader.js';
import { ServerRegistry, ServerState, getServerRegistry } from './server-registry.js';
import { HealthChecker, HealthStatus, getHealthChecker } from './health-checker.js';
import { createTransport } from './transports/index.js';

// ============================================================================
// MCP Client Manager Class
// ============================================================================

/**
 * MCP Client Manager
 *
 * Orchestrates MCP server connections and provides unified API for tool execution.
 *
 * @extends EventEmitter
 * @fires MCPClientManager#initialized
 * @fires MCPClientManager#serverConnected
 * @fires MCPClientManager#serverDisconnected
 * @fires MCPClientManager#toolsDiscovered
 * @fires MCPClientManager#healthChanged
 * @fires MCPClientManager#error
 */
export class MCPClientManager extends EventEmitter {
  /**
   * @param {Object} options - Manager options
   * @param {string} [options.configPath] - Path to MCP config file
   * @param {boolean} [options.autoConnect=true] - Auto-connect on init
   * @param {boolean} [options.watchConfig=false] - Watch config for changes
   * @param {boolean} [options.enableHealthChecks=true] - Enable health monitoring
   */
  constructor(options = {}) {
    super();

    this.options = {
      configPath: options.configPath,
      autoConnect: options.autoConnect ?? true,
      watchConfig: options.watchConfig ?? false,
      enableHealthChecks: options.enableHealthChecks ?? true
    };

    /** @type {MCPConfigLoader} */
    this.configLoader = getConfigLoader({
      configPath: this.options.configPath,
      watchChanges: this.options.watchConfig
    });

    /** @type {ServerRegistry} */
    this.registry = getServerRegistry();

    /** @type {HealthChecker} */
    this.healthChecker = getHealthChecker();

    /** @type {boolean} */
    this.initialized = false;

    /** @type {Map<string, Object>} */
    this.transports = new Map();

    // Set up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Set up event forwarding from sub-components
   */
  setupEventForwarding() {
    // Forward config events
    this.configLoader.on('configLoaded', (config) => {
      this.emit('configLoaded', config);
    });

    this.configLoader.on('configReloaded', async ({ previous, current }) => {
      this.emit('configReloaded', { previous, current });
      await this.handleConfigReload(previous, current);
    });

    // Forward registry events
    this.registry.on('serverStateChanged', ({ entry, previousState, currentState }) => {
      if (currentState === ServerState.CONNECTED) {
        this.emit('serverConnected', entry);
      } else if (
        previousState === ServerState.CONNECTED &&
        currentState !== ServerState.CONNECTED
      ) {
        this.emit('serverDisconnected', entry);
      }
    });

    this.registry.on('toolsDiscovered', ({ serverId, tools }) => {
      this.emit('toolsDiscovered', { serverId, tools });
    });

    // Forward health events
    this.healthChecker.on('healthChanged', (data) => {
      this.emit('healthChanged', data);
    });
  }

  /**
   * Initialize the client manager
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration
      await this.configLoader.load();

      // Register servers from config
      const config = this.configLoader.getConfig();

      for (const [serverId, serverConfig] of Object.entries(config.servers)) {
        this.registry.register(serverId, serverConfig);
      }

      // Auto-connect if enabled
      if (this.options.autoConnect) {
        await this.connectAll();
      }

      this.initialized = true;
      this.emit('initialized', { serverCount: this.registry.list().length });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Handle config reload
   *
   * @param {Object} previous - Previous config
   * @param {Object} current - Current config
   */
  async handleConfigReload(previous, current) {
    const previousIds = new Set(Object.keys(previous?.servers || {}));
    const currentIds = new Set(Object.keys(current?.servers || {}));

    // Find added servers
    for (const id of currentIds) {
      if (!previousIds.has(id)) {
        this.registry.register(id, current.servers[id]);
        if (current.servers[id].enabled && this.options.autoConnect) {
          await this.connect(id).catch((error) => {
            this.emit('error', { serverId: id, error });
          });
        }
      }
    }

    // Find removed servers
    for (const id of previousIds) {
      if (!currentIds.has(id)) {
        await this.disconnect(id);
        this.registry.unregister(id);
      }
    }

    // Update changed servers
    for (const id of currentIds) {
      if (previousIds.has(id)) {
        const prevConfig = previous.servers[id];
        const currConfig = current.servers[id];

        // Check if config changed significantly
        if (JSON.stringify(prevConfig) !== JSON.stringify(currConfig)) {
          await this.disconnect(id);
          this.registry.unregister(id);
          this.registry.register(id, currConfig);

          if (currConfig.enabled && this.options.autoConnect) {
            await this.connect(id).catch((error) => {
              this.emit('error', { serverId: id, error });
            });
          }
        }
      }
    }
  }

  /**
   * Connect to a specific server
   *
   * @param {string} serverId - Server identifier
   * @returns {Promise<void>}
   */
  async connect(serverId) {
    const entry = this.registry.get(serverId);

    if (!entry) {
      throw new Error(`Server not registered: ${serverId}`);
    }

    if (entry.state === ServerState.CONNECTED) {
      return; // Already connected
    }

    if (!entry.config.enabled) {
      return; // Server disabled
    }

    this.registry.updateState(serverId, ServerState.CONNECTING);

    try {
      // Create transport
      const transport = createTransport(entry.config);
      this.transports.set(serverId, transport);

      // Set up transport events
      transport.on('error', (error) => {
        this.emit('error', { serverId, error });
      });

      transport.on('close', () => {
        this.registry.updateState(serverId, ServerState.DISCONNECTED);
      });

      transport.on('message', (message) => {
        this.emit('serverMessage', { serverId, message });
      });

      // Start transport
      await transport.start();

      // Discover tools
      const tools = await this.discoverTools(serverId, transport);

      // Update registry
      this.registry.updateState(serverId, ServerState.CONNECTED, {
        transport
      });
      this.registry.registerTools(serverId, tools);

      // Start health monitoring if enabled
      if (this.options.enableHealthChecks && entry.config.healthCheck?.enabled) {
        this.healthChecker.startMonitoring(serverId, transport, entry.config.healthCheck);
      }
    } catch (error) {
      this.registry.updateState(serverId, ServerState.ERROR, { error });
      throw error;
    }
  }

  /**
   * Connect to all enabled servers
   *
   * @returns {Promise<{ connected: string[], failed: Array<{ id: string, error: Error }> }>}
   */
  async connectAll() {
    const results = {
      connected: [],
      failed: []
    };

    const servers = this.registry.list();
    const enabledServers = servers.filter((entry) => entry.config.enabled);

    // Connect in parallel with individual error handling
    await Promise.all(
      enabledServers.map(async (entry) => {
        try {
          await this.connect(entry.id);
          results.connected.push(entry.id);
        } catch (error) {
          results.failed.push({ id: entry.id, error });
        }
      })
    );

    return results;
  }

  /**
   * Disconnect from a server
   *
   * @param {string} serverId - Server identifier
   * @returns {Promise<void>}
   */
  async disconnect(serverId) {
    const entry = this.registry.get(serverId);

    if (!entry) {
      return;
    }

    // Stop health monitoring
    this.healthChecker.stopMonitoring(serverId);

    // Close transport
    const transport = this.transports.get(serverId);

    if (transport) {
      await transport.close();
      this.transports.delete(serverId);
    }

    this.registry.updateState(serverId, ServerState.DISCONNECTED);
  }

  /**
   * Disconnect from all servers
   *
   * @returns {Promise<void>}
   */
  async disconnectAll() {
    const servers = this.registry.list();

    await Promise.all(servers.map((entry) => this.disconnect(entry.id)));
  }

  /**
   * Discover tools from a server
   *
   * @param {string} serverId - Server identifier
   * @param {Object} transport - Transport instance
   * @returns {Promise<Object[]>}
   */
  async discoverTools(serverId, transport) {
    try {
      const response = await transport.request('tools/list', {});
      return response?.tools || [];
    } catch (error) {
      // Some servers might not support tools/list
      this.emit('error', {
        serverId,
        error: new Error(`Failed to discover tools: ${error.message}`)
      });
      return [];
    }
  }

  /**
   * Execute a tool
   *
   * @param {string} serverId - Server identifier
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   * @param {Object} [options] - Execution options
   * @param {number} [options.timeout] - Request timeout
   * @returns {Promise<any>}
   */
  async executeTool(serverId, toolName, args = {}, options = {}) {
    const entry = this.registry.get(serverId);

    if (!entry) {
      throw new Error(`Server not registered: ${serverId}`);
    }

    if (!entry.isAvailable) {
      throw new Error(`Server not available: ${serverId} (state: ${entry.state})`);
    }

    const transport = this.transports.get(serverId);

    if (!transport) {
      throw new Error(`No transport for server: ${serverId}`);
    }

    const startTime = Date.now();

    try {
      const result = await transport.request(
        'tools/call',
        { name: toolName, arguments: args },
        options.timeout || entry.config.timeout
      );

      // Record success
      entry.recordSuccess(Date.now() - startTime);

      return result;
    } catch (error) {
      // Record failure
      entry.recordFailure(error);
      throw error;
    }
  }

  /**
   * Execute a tool by full ID (mcp__serverId__toolName)
   *
   * @param {string} toolId - Full tool identifier
   * @param {Object} args - Tool arguments
   * @param {Object} [options] - Execution options
   * @returns {Promise<any>}
   */
  async executeToolById(toolId, args = {}, options = {}) {
    const match = toolId.match(/^mcp__(.+)__(.+)$/);

    if (!match) {
      throw new Error(`Invalid tool ID format: ${toolId}`);
    }

    const [, serverId, toolName] = match;

    return this.executeTool(serverId, toolName, args, options);
  }

  /**
   * List all available tools
   *
   * @param {Object} [options] - Options
   * @param {boolean} [options.onlyAvailable=true] - Only from available servers
   * @returns {Object[]}
   */
  listTools(options = { onlyAvailable: true }) {
    return this.registry.getAllTools(options);
  }

  /**
   * Get tools from a specific server
   *
   * @param {string} serverId - Server identifier
   * @returns {Object[]}
   */
  getServerTools(serverId) {
    const entry = this.registry.get(serverId);
    return entry?.tools || [];
  }

  /**
   * Check health of a server
   *
   * @param {string} serverId - Server identifier
   * @param {boolean} [forceRefresh=false] - Force refresh
   * @returns {Promise<Object>}
   */
  async checkHealth(serverId, forceRefresh = false) {
    const transport = this.transports.get(serverId);

    if (!transport) {
      return {
        serverId,
        status: HealthStatus.UNKNOWN,
        available: false,
        error: new Error('No transport')
      };
    }

    if (forceRefresh) {
      return this.healthChecker.refresh(serverId, transport);
    }

    return this.healthChecker.check(serverId, transport);
  }

  /**
   * Check health of all servers
   *
   * @returns {Promise<Map<string, Object>>}
   */
  async checkAllHealth() {
    const results = new Map();
    const servers = this.registry.list();

    await Promise.all(
      servers.map(async (entry) => {
        const health = await this.checkHealth(entry.id);
        results.set(entry.id, health);
      })
    );

    return results;
  }

  /**
   * Get health summary
   *
   * @returns {Object}
   */
  getHealthSummary() {
    return this.healthChecker.getSummary();
  }

  /**
   * Get server status
   *
   * @param {string} serverId - Server identifier
   * @returns {Object | null}
   */
  getServerStatus(serverId) {
    const entry = this.registry.get(serverId);

    if (!entry) {
      return null;
    }

    return entry.toJSON();
  }

  /**
   * Get all servers status
   *
   * @returns {Object}
   */
  getAllStatus() {
    return this.registry.getStats();
  }

  /**
   * Get servers by tag
   *
   * @param {string} tag - Tag to filter by
   * @returns {Object[]}
   */
  getServersByTag(tag) {
    return this.registry.getByTag(tag).map((entry) => entry.toJSON());
  }

  /**
   * Get servers by group
   *
   * @param {string} groupName - Group name
   * @returns {Object[]}
   */
  getServersByGroup(groupName) {
    const config = this.configLoader.getConfig();
    const serverIds = config?.groups?.[groupName] || [];

    return serverIds
      .map((id) => this.registry.get(id))
      .filter(Boolean)
      .map((entry) => entry.toJSON());
  }

  /**
   * Reload configuration
   *
   * @returns {Promise<void>}
   */
  async reloadConfig() {
    await this.configLoader.reload();
  }

  /**
   * Shutdown the manager
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Stop config watching
    this.configLoader.stopWatching();

    // Disconnect all servers
    await this.disconnectAll();

    // Stop all health monitoring
    this.healthChecker.stopAllMonitoring();

    this.initialized = false;
    this.emit('shutdown');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create MCP client manager instance
 *
 * @param {Object} [options] - Manager options
 * @returns {MCPClientManager}
 */
export function getMCPClientManager(options = {}) {
  if (!_instance) {
    _instance = new MCPClientManager(options);
  }
  return _instance;
}

/**
 * Initialize MCP client manager
 *
 * @param {Object} [options] - Manager options
 * @returns {Promise<MCPClientManager>}
 */
export async function initializeMCPClientManager(options = {}) {
  const manager = getMCPClientManager(options);

  if (!manager.initialized) {
    await manager.initialize();
  }

  return manager;
}

/**
 * Reset singleton instance (for testing)
 */
export async function resetMCPClientManager() {
  if (_instance) {
    await _instance.shutdown();
    _instance = null;
  }
}

export default MCPClientManager;
