/**
 * MCP Configuration Loader
 *
 * Loads and validates MCP server configuration with Zod schemas.
 * Supports environment variable interpolation and hot-reload.
 *
 * @module src/mcp/config-loader
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Health check configuration schema
 */
export const HealthCheckConfigSchema = z.object({
  enabled: z.boolean().default(true),
  interval: z.number().positive().default(60000),
  timeout: z.number().positive().default(5000),
  cacheTTL: z.number().positive().default(30000)
}).strict();

/**
 * Retry configuration schema
 */
export const RetryConfigSchema = z.object({
  maxRetries: z.number().min(0).max(10).default(3),
  baseDelay: z.number().positive().default(1000),
  maxDelay: z.number().positive().default(30000),
  backoffMultiplier: z.number().positive().default(2)
}).strict();

/**
 * MCP Server configuration schema
 */
export const MCPServerConfigSchema = z.object({
  type: z.enum(['stdio', 'sse', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional().default([]),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional().default({}),
  timeout: z.number().positive().default(30000),
  healthCheck: HealthCheckConfigSchema.optional(),
  retry: RetryConfigSchema.optional(),
  tags: z.array(z.string()).optional().default([]),
  enabled: z.boolean().default(true),
  description: z.string().optional()
}).strict().refine(
  (data) => {
    // stdio requires command
    if (data.type === 'stdio' && !data.command) {
      return false;
    }
    // http/sse requires url
    if ((data.type === 'http' || data.type === 'sse') && !data.url) {
      return false;
    }
    return true;
  },
  {
    message: 'stdio type requires command, http/sse types require url'
  }
);

/**
 * Full MCP configuration schema
 */
export const MCPConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default('1.0.0'),
  servers: z.record(z.string(), MCPServerConfigSchema),
  defaults: z.object({
    timeout: z.number().positive().optional(),
    healthCheck: HealthCheckConfigSchema.partial().optional(),
    retry: RetryConfigSchema.partial().optional()
  }).optional(),
  groups: z.record(z.string(), z.array(z.string())).optional().default({})
}).strict();

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {z.infer<typeof MCPServerConfigSchema>} MCPServerConfig
 * @typedef {z.infer<typeof MCPConfigSchema>} MCPConfig
 * @typedef {z.infer<typeof HealthCheckConfigSchema>} HealthCheckConfig
 * @typedef {z.infer<typeof RetryConfigSchema>} RetryConfig
 */

// ============================================================================
// Config Loader Class
// ============================================================================

/**
 * MCP Configuration Loader
 *
 * Handles loading, validation, and hot-reload of MCP server configurations.
 *
 * @extends EventEmitter
 * @fires MCPConfigLoader#configLoaded
 * @fires MCPConfigLoader#configReloaded
 * @fires MCPConfigLoader#configError
 */
export class MCPConfigLoader extends EventEmitter {
  /**
   * @param {Object} options - Loader options
   * @param {string} [options.configPath] - Path to config file
   * @param {boolean} [options.watchChanges=false] - Enable file watching
   * @param {Object} [options.envOverrides] - Environment variable overrides
   */
  constructor(options = {}) {
    super();

    this.configPath = options.configPath || path.join(process.cwd(), '.hydra', 'mcp-servers.json');
    this.watchChanges = options.watchChanges ?? false;
    this.envOverrides = options.envOverrides || {};

    /** @type {MCPConfig | null} */
    this.config = null;

    /** @type {fs.FSWatcher | null} */
    this.watcher = null;

    /** @type {Date | null} */
    this.lastLoadTime = null;
  }

  /**
   * Load configuration from file
   *
   * @returns {Promise<MCPConfig>}
   * @throws {Error} If file not found or validation fails
   */
  async load() {
    try {
      const rawContent = await fs.readFile(this.configPath, 'utf-8');
      const jsonContent = JSON.parse(rawContent);

      // Interpolate environment variables
      const interpolated = this.interpolateEnvVars(jsonContent);

      // Validate with Zod
      const validated = MCPConfigSchema.parse(interpolated);

      // Apply defaults to each server
      this.config = this.applyDefaults(validated);
      this.lastLoadTime = new Date();

      this.emit('configLoaded', this.config);

      // Start watching if enabled
      if (this.watchChanges && !this.watcher) {
        this.startWatching();
      }

      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new ConfigNotFoundError(this.configPath);
      }
      if (error instanceof z.ZodError) {
        throw new ConfigValidationError(error.issues);
      }
      if (error instanceof SyntaxError) {
        throw new ConfigParseError(error.message);
      }
      throw error;
    }
  }

  /**
   * Reload configuration
   *
   * @returns {Promise<MCPConfig>}
   */
  async reload() {
    const previousConfig = this.config;

    try {
      await this.load();
      this.emit('configReloaded', {
        previous: previousConfig,
        current: this.config
      });
      return this.config;
    } catch (error) {
      this.emit('configError', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   *
   * @returns {MCPConfig | null}
   */
  getConfig() {
    return this.config;
  }

  /**
   * Get server configuration by ID
   *
   * @param {string} serverId - Server identifier
   * @returns {MCPServerConfig | null}
   */
  getServer(serverId) {
    return this.config?.servers[serverId] ?? null;
  }

  /**
   * Get all enabled servers
   *
   * @returns {Map<string, MCPServerConfig>}
   */
  getEnabledServers() {
    const result = new Map();

    if (!this.config) return result;

    for (const [id, server] of Object.entries(this.config.servers)) {
      if (server.enabled) {
        result.set(id, server);
      }
    }

    return result;
  }

  /**
   * Get servers by tag
   *
   * @param {string} tag - Tag to filter by
   * @returns {Map<string, MCPServerConfig>}
   */
  getServersByTag(tag) {
    const result = new Map();

    if (!this.config) return result;

    for (const [id, server] of Object.entries(this.config.servers)) {
      if (server.tags?.includes(tag)) {
        result.set(id, server);
      }
    }

    return result;
  }

  /**
   * Get servers by group
   *
   * @param {string} groupName - Group name
   * @returns {Map<string, MCPServerConfig>}
   */
  getServersByGroup(groupName) {
    const result = new Map();

    if (!this.config) return result;

    const serverIds = this.config.groups?.[groupName] ?? [];

    for (const id of serverIds) {
      const server = this.config.servers[id];
      if (server) {
        result.set(id, server);
      }
    }

    return result;
  }

  /**
   * Interpolate environment variables in config
   *
   * Supports ${VAR_NAME} syntax
   *
   * @param {Object} obj - Object to interpolate
   * @returns {Object}
   */
  interpolateEnvVars(obj) {
    const envVars = { ...process.env, ...this.envOverrides };

    const interpolate = (value) => {
      if (typeof value === 'string') {
        return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
          return envVars[varName] ?? '';
        });
      }
      if (Array.isArray(value)) {
        return value.map(interpolate);
      }
      if (value && typeof value === 'object') {
        const result = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = interpolate(val);
        }
        return result;
      }
      return value;
    };

    return interpolate(obj);
  }

  /**
   * Apply defaults to server configurations
   *
   * @param {MCPConfig} config - Validated config
   * @returns {MCPConfig}
   */
  applyDefaults(config) {
    const defaults = config.defaults || {};

    const servers = {};

    for (const [id, server] of Object.entries(config.servers)) {
      servers[id] = {
        ...server,
        timeout: server.timeout ?? defaults.timeout ?? 30000,
        healthCheck: {
          enabled: true,
          interval: 60000,
          timeout: 5000,
          cacheTTL: 30000,
          ...defaults.healthCheck,
          ...server.healthCheck
        },
        retry: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          ...defaults.retry,
          ...server.retry
        }
      };
    }

    return {
      ...config,
      servers
    };
  }

  /**
   * Start watching config file for changes
   */
  startWatching() {
    if (this.watcher) return;

    const dir = path.dirname(this.configPath);
    const filename = path.basename(this.configPath);

    // Use debounce to avoid multiple reloads
    let debounceTimer = null;

    this.watcher = fs.watch(dir, (eventType, changedFile) => {
      if (changedFile === filename && eventType === 'change') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.reload().catch((error) => {
            this.emit('configError', error);
          });
        }, 100);
      }
    });

    this.watcher.on('error', (error) => {
      this.emit('configError', error);
    });
  }

  /**
   * Stop watching config file
   */
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Validate a server configuration object
   *
   * @param {Object} serverConfig - Server config to validate
   * @returns {{ valid: boolean, errors?: z.ZodError['errors'] }}
   */
  static validateServer(serverConfig) {
    const result = MCPServerConfigSchema.safeParse(serverConfig);

    if (result.success) {
      return { valid: true };
    }

    return { valid: false, errors: result.error.issues };
  }

  /**
   * Create a default configuration file
   *
   * @param {string} configPath - Path to create config at
   * @returns {Promise<void>}
   */
  static async createDefaultConfig(configPath) {
    const defaultConfig = {
      $schema: './schemas/mcp-servers.schema.json',
      version: '1.0.0',
      servers: {
        ollama: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'ollama-mcp'],
          env: {
            OLLAMA_HOST: 'http://localhost:11434'
          },
          timeout: 120000,
          healthCheck: {
            enabled: true,
            interval: 60000
          },
          tags: ['ai', 'local'],
          enabled: true
        }
      },
      defaults: {
        timeout: 30000,
        healthCheck: {
          enabled: true,
          interval: 60000,
          timeout: 5000,
          cacheTTL: 30000
        },
        retry: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        }
      },
      groups: {
        ai: ['ollama']
      }
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  }
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Configuration file not found error
 */
export class ConfigNotFoundError extends Error {
  constructor(configPath) {
    super(`MCP configuration file not found: ${configPath}`);
    this.name = 'ConfigNotFoundError';
    this.configPath = configPath;
  }
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(issues) {
    const messages = issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    super(`MCP configuration validation failed:\n${messages.join('\n')}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
    // Keep errors alias for backward compatibility
    this.errors = issues;
  }
}

/**
 * Configuration parse error
 */
export class ConfigParseError extends Error {
  constructor(message) {
    super(`MCP configuration parse error: ${message}`);
    this.name = 'ConfigParseError';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create config loader instance
 *
 * @param {Object} [options] - Loader options
 * @returns {MCPConfigLoader}
 */
export function getConfigLoader(options = {}) {
  if (!_instance) {
    _instance = new MCPConfigLoader(options);
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetConfigLoader() {
  if (_instance) {
    _instance.stopWatching();
    _instance = null;
  }
}

export default MCPConfigLoader;
