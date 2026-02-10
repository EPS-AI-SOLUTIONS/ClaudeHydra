/**
 * MCP Module
 *
 * Unified MCP (Model Context Protocol) client system for ClaudeHydra.
 * Provides configuration loading, server management, and tool execution.
 *
 * @module src/mcp
 */

// Client Manager
export {
  getMCPClientManager,
  initializeMCPClientManager,
  MCPClientManager,
  resetMCPClientManager,
} from './client-manager.js';
// Config Loader
export {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  getConfigLoader,
  HealthCheckConfigSchema,
  MCPConfigLoader,
  MCPConfigSchema,
  MCPServerConfigSchema,
  RetryConfigSchema,
  resetConfigLoader,
} from './config-loader.js';

// Health Checker
export {
  getHealthChecker,
  HealthChecker,
  HealthStatus,
  resetHealthChecker,
  TTLCache,
} from './health-checker.js';
// Server Registry
export {
  getServerRegistry,
  resetServerRegistry,
  ServerEntry,
  ServerRegistry,
  ServerState,
} from './server-registry.js';
// Transports
export {
  createTransport,
  getSupportedTypes as getSupportedTransportTypes,
  HttpTransport,
  isSupported as isTransportSupported,
  SseTransport,
  StdioTransport,
  TransportType,
} from './transports/index.js';

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick initialization of MCP system
 *
 * @param {Object} [options] - Options
 * @param {string} [options.configPath] - Config file path
 * @param {boolean} [options.autoConnect=true] - Auto-connect servers
 * @returns {Promise<import('./client-manager.js').MCPClientManager>}
 */
export async function initMCP(options = {}) {
  const { initializeMCPClientManager } = await import('./client-manager.js');
  return initializeMCPClientManager(options);
}

/**
 * Execute a tool on any available server
 *
 * @param {string} toolId - Full tool ID (mcp__serverId__toolName)
 * @param {Object} [args] - Tool arguments
 * @returns {Promise<any>}
 */
export async function executeTool(toolId, args = {}) {
  const { getMCPClientManager } = await import('./client-manager.js');
  const manager = getMCPClientManager();

  if (!manager.initialized) {
    await manager.initialize();
  }

  return manager.executeToolById(toolId, args);
}

/**
 * List all available MCP tools
 *
 * @returns {Promise<Object[]>}
 */
export async function listAllTools() {
  const { getMCPClientManager } = await import('./client-manager.js');
  const manager = getMCPClientManager();

  if (!manager.initialized) {
    await manager.initialize();
  }

  return manager.listTools();
}

/**
 * Get MCP system status
 *
 * @returns {Promise<Object>}
 */
export async function getMCPStatus() {
  const { getMCPClientManager } = await import('./client-manager.js');
  const manager = getMCPClientManager();

  if (!manager.initialized) {
    return { initialized: false, servers: [] };
  }

  return {
    initialized: true,
    ...manager.getAllStatus(),
    health: manager.getHealthSummary(),
  };
}

/**
 * Shutdown MCP system
 *
 * @returns {Promise<void>}
 */
export async function shutdownMCP() {
  const { resetMCPClientManager } = await import('./client-manager.js');
  await resetMCPClientManager();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  initMCP,
  executeTool,
  listAllTools,
  getMCPStatus,
  shutdownMCP,
};
