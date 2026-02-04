/**
 * Configuration Manager with Schema Validation
 * Based on src/cli-enhanced/command-system.js ConfigManager
 * @module cli-unified/core/ConfigManager
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { DATA_DIR, DATA_PATHS, CLI_MODES } from './constants.js';

/**
 * Configuration schema definition
 */
export const CONFIG_SCHEMA = {
  general: {
    mode: { type: 'enum', values: Object.values(CLI_MODES), default: 'swarm' },
    theme: { type: 'string', default: 'hydra' },
    unicode: { type: 'boolean', default: true },
    debug: { type: 'boolean', default: false }
  },
  agents: {
    default: { type: 'string', default: 'auto' },
    temperature: { type: 'number', min: 0, max: 2, default: 0.7 },
    maxTokens: { type: 'number', min: 100, max: 32000, default: 4096 },
    parallelLimit: { type: 'number', min: 1, max: 10, default: 3 }
  },
  models: {
    ollama: {
      enabled: { type: 'boolean', default: true },
      host: { type: 'string', default: 'http://localhost:11434' },
      defaultModel: { type: 'string', default: 'llama3.2:1b' }
    },
    gemini: {
      enabled: { type: 'boolean', default: false },
      apiKey: { type: 'string', default: '' }
    },
    claude: {
      enabled: { type: 'boolean', default: false },
      apiKey: { type: 'string', default: '' }
    }
  },
  performance: {
    cacheEnabled: { type: 'boolean', default: true },
    cacheTTL: { type: 'number', min: 0, max: 86400, default: 3600 },
    cacheMaxSize: { type: 'number', min: 10, max: 1000, default: 100 },
    lazyLoading: { type: 'boolean', default: true },
    prefetch: { type: 'boolean', default: false }
  },
  ui: {
    spinnerType: { type: 'string', default: 'dots' },
    borderStyle: { type: 'string', default: 'rounded' },
    showTimestamps: { type: 'boolean', default: false },
    compactMode: { type: 'boolean', default: false },
    streamingEnabled: { type: 'boolean', default: true }
  },
  input: {
    vimMode: { type: 'boolean', default: false },
    multilineDefault: { type: 'boolean', default: false },
    historyLimit: { type: 'number', min: 100, max: 10000, default: 1000 },
    autoComplete: { type: 'boolean', default: true },
    macrosEnabled: { type: 'boolean', default: true }
  },
  history: {
    enabled: { type: 'boolean', default: true },
    autoTags: { type: 'boolean', default: true },
    exportFormat: { type: 'enum', values: ['json', 'md', 'html'], default: 'json' }
  }
};

/**
 * Configuration Manager
 */
export class ConfigManager {
  constructor(configPath) {
    this.basePath = configPath || join(homedir(), DATA_DIR);
    this.configPath = join(this.basePath, DATA_PATHS.CONFIG);
    this.config = this.loadConfig();
  }

  /**
   * Get data directory path
   * @returns {string} Base data path
   */
  getDataPath() {
    return this.basePath;
  }

  /**
   * Get specific subdirectory path
   * @param {string} key - Key from DATA_PATHS
   * @returns {string} Full path
   */
  getPath(key) {
    const subPath = DATA_PATHS[key.toUpperCase()];
    if (!subPath) return null;
    return join(this.basePath, subPath);
  }

  /**
   * Load configuration from file
   * @returns {Object} Configuration object
   */
  loadConfig() {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);
        return this.mergeWithDefaults(loaded);
      }
    } catch (error) {
      console.error('Error loading config:', error.message);
    }
    return this.getDefaults();
  }

  /**
   * Save configuration to file
   * @returns {boolean} Success
   */
  saveConfig() {
    try {
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving config:', error.message);
      return false;
    }
  }

  /**
   * Get default configuration from schema
   * @returns {Object} Default config
   */
  getDefaults() {
    const defaults = {};
    const extractDefaults = (schema, target) => {
      for (const [key, value] of Object.entries(schema)) {
        if (value.type !== undefined) {
          target[key] = value.default;
        } else {
          target[key] = {};
          extractDefaults(value, target[key]);
        }
      }
    };
    extractDefaults(CONFIG_SCHEMA, defaults);
    return defaults;
  }

  /**
   * Merge loaded config with defaults
   * @param {Object} loaded - Loaded configuration
   * @returns {Object} Merged config
   */
  mergeWithDefaults(loaded) {
    const defaults = this.getDefaults();
    const merge = (target, source) => {
      for (const key of Object.keys(target)) {
        if (source && source[key] !== undefined) {
          if (typeof target[key] === 'object' && !Array.isArray(target[key])) {
            merge(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      }
    };
    merge(defaults, loaded);
    return defaults;
  }

  /**
   * Get configuration value
   * @param {string} path - Dot-notation path (e.g., 'agents.temperature')
   * @returns {*} Configuration value
   */
  get(path) {
    const parts = path.split('.');
    let current = this.config;
    for (const part of parts) {
      if (current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Set configuration value with validation
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   * @returns {boolean} Success
   */
  set(path, value) {
    const validation = this.validate(path, value);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const parts = path.split('.');
    let current = this.config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    return true;
  }

  /**
   * Validate a value against schema
   * @param {string} path - Configuration path
   * @param {*} value - Value to validate
   * @returns {{valid: boolean, error?: string}} Validation result
   */
  validate(path, value) {
    const parts = path.split('.');
    let schema = CONFIG_SCHEMA;
    for (const part of parts) {
      if (!schema[part]) return { valid: true }; // Unknown paths are allowed
      schema = schema[part];
    }

    if (!schema.type) return { valid: true }; // Not a leaf node

    switch (schema.type) {
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { valid: false, error: `${path} must be boolean` };
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          return { valid: false, error: `${path} must be number` };
        }
        if (schema.min !== undefined && value < schema.min) {
          return { valid: false, error: `${path} must be >= ${schema.min}` };
        }
        if (schema.max !== undefined && value > schema.max) {
          return { valid: false, error: `${path} must be <= ${schema.max}` };
        }
        break;
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: `${path} must be string` };
        }
        break;
      case 'enum':
        if (!schema.values.includes(value)) {
          return { valid: false, error: `${path} must be one of: ${schema.values.join(', ')}` };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    this.config = this.getDefaults();
  }

  /**
   * Get all configuration as object
   * @returns {Object} Full configuration
   */
  getAll() {
    return { ...this.config };
  }
}

// Export singleton
let instance = null;

export function getConfigManager(configPath) {
  if (!instance) {
    instance = new ConfigManager(configPath);
  }
  return instance;
}

export default ConfigManager;
