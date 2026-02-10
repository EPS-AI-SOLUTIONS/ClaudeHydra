/**
 * @fileoverview HYDRA Configuration Manager
 * Centralized configuration with validation, environment handling, and defaults
 *
 * @description
 * Schemas and DEFAULT_CONFIG are defined in config-schemas.ts.
 * This module provides:
 * - ConfigManager class (load, get, set, subscribe, freeze)
 * - Environment variable integration
 * - Deep merge utilities for config overrides
 * - Integration with main application config (src/config.js)
 *
 * @module hydra/core/config
 * @see module:hydra/core/config-schemas
 */

import { DEFAULT_CONFIG, HydraConfigSchema, Schemas } from './config-schemas.js';

// =============================================================================
// Re-exports (backward compat)
// =============================================================================
export { DEFAULT_CONFIG, Schemas };

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * @typedef {Object} HydraConfig
 * @property {Object} providers - Provider configurations
 * @property {Object} router - Router configuration
 * @property {Object} pipeline - Pipeline configuration
 * @property {Object} cache - Cache configuration
 * @property {Object} stats - Statistics configuration
 * @property {Object} logging - Logging configuration
 */

// =============================================================================
// ConfigManager Class
// =============================================================================

/**
 * Configuration Manager
 * Loads, validates, merges, and exposes the HYDRA configuration.
 */
export class ConfigManager {
  constructor(initialConfig = {}) {
    this._config = null;
    this._listeners = new Set();
    this._frozen = false;

    // Initialize with merged config
    this.load(initialConfig);
  }

  /**
   * Load and validate configuration
   * @param {Object} config - Configuration to load
   * @returns {Object} - Validated configuration
   */
  load(config = {}) {
    // Merge with defaults
    const merged = this._deepMerge(DEFAULT_CONFIG, config);

    // Load environment overrides
    const withEnv = this._applyEnvOverrides(merged);

    // Validate
    const result = HydraConfigSchema.safeParse(withEnv);

    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
    }

    this._config = result.data;
    this._notifyListeners();

    return this._config;
  }

  /**
   * Get current configuration
   * @returns {Object}
   */
  get() {
    return this._config;
  }

  /**
   * Get configuration value by path
   * @param {string} path - Dot-separated path (e.g., 'providers.ollama.timeout')
   * @param {any} defaultValue - Default if path not found
   * @returns {any}
   */
  getValue(path, defaultValue = undefined) {
    const parts = path.split('.');
    let value = this._config;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return defaultValue;
      }
      value = value[part];
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set configuration value by path
   * @param {string} path - Dot-separated path
   * @param {any} value - Value to set
   */
  setValue(path, value) {
    if (this._frozen) {
      throw new Error('Configuration is frozen and cannot be modified');
    }

    const parts = path.split('.');
    const last = parts.pop();
    let obj = this._config;

    for (const part of parts) {
      if (!(part in obj)) {
        obj[part] = {};
      }
      obj = obj[part];
    }

    obj[last] = value;

    // Re-validate
    const result = HydraConfigSchema.safeParse(this._config);
    if (!result.success) {
      throw new Error(`Invalid configuration value: ${result.error.issues[0].message}`);
    }

    this._config = result.data;
    this._notifyListeners();
  }

  /**
   * Freeze configuration (prevent further modifications)
   */
  freeze() {
    this._frozen = true;
    Object.freeze(this._config);
  }

  /**
   * Check if configuration is frozen
   * @returns {boolean}
   */
  isFrozen() {
    return this._frozen;
  }

  /**
   * Subscribe to configuration changes
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Notify listeners of changes
   * @private
   */
  _notifyListeners() {
    for (const listener of this._listeners) {
      try {
        listener(this._config);
      } catch (error) {
        console.error('Config listener error:', error);
      }
    }
  }

  // ===========================================================================
  // Environment & Main Config Integration
  // ===========================================================================

  /**
   * Apply environment variable overrides and main config integration
   * @param {Object} config
   * @returns {Object}
   * @private
   */
  _applyEnvOverrides(config) {
    let result = { ...config };

    // Integration with main application config (src/config.js)
    result = this._applyMainConfigIntegration(result);

    // LlamaCpp default model from env
    if (process.env.LLAMACPP_DEFAULT_MODEL) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: {
            ...result.providers?.llamacpp?.models,
            default: process.env.LLAMACPP_DEFAULT_MODEL,
          },
        },
      };
    }

    // Verbose logging
    if (process.env.HYDRA_VERBOSE === 'true') {
      result.pipeline = { ...result.pipeline, verbose: true };
    }

    // Log level
    if (process.env.HYDRA_LOG_LEVEL) {
      result.logging = { ...result.logging, level: process.env.HYDRA_LOG_LEVEL };
    }

    // Provider timeouts
    if (process.env.HYDRA_TIMEOUT) {
      const timeout = parseInt(process.env.HYDRA_TIMEOUT, 10);
      if (!Number.isNaN(timeout)) {
        result.providers = {
          ...result.providers,
          llamacpp: { ...result.providers?.llamacpp, timeout },
          gemini: { ...result.providers?.gemini, timeout },
        };
      }
    }

    // YOLO mode from main config
    if (process.env.HYDRA_YOLO === 'true') {
      result.pipeline = { ...result.pipeline, verbose: false };
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          maxRetries: 1,
          timeout: Math.min(result.providers?.llamacpp?.timeout || 30000, 30000),
        },
        gemini: {
          ...result.providers?.gemini,
          maxRetries: 1,
          timeout: Math.min(result.providers?.gemini?.timeout || 30000, 30000),
        },
      };
    }

    return result;
  }

  /**
   * Apply main application config integration
   * Maps values from src/config.js to HYDRA config structure
   * @param {Object} config - Current configuration
   * @returns {Object} Config with main app values applied
   * @private
   */
  _applyMainConfigIntegration(config) {
    const result = { ...config };

    const mainConfigValues = {
      maxConcurrent:
        parseInt(process.env.QUEUE_MAX_CONCURRENT, 10) ||
        config.providers?.llamacpp?.pool?.maxConcurrent,
      maxRetries:
        parseInt(process.env.QUEUE_MAX_RETRIES, 10) || config.providers?.llamacpp?.maxRetries,
      timeout: parseInt(process.env.QUEUE_TIMEOUT_MS, 10) || config.providers?.llamacpp?.timeout,
      cacheEnabled: process.env.CACHE_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.CACHE_TTL, 10) * 1000 || config.cache?.healthCheck?.ttl,
      defaultModel:
        process.env.LLAMACPP_DEFAULT_MODEL || config.providers?.llamacpp?.models?.default,
      fastModel: process.env.LLAMACPP_FAST_MODEL || config.providers?.llamacpp?.models?.router,
      coderModel: process.env.LLAMACPP_CODER_MODEL || config.providers?.llamacpp?.models?.coder,
    };

    if (mainConfigValues.maxConcurrent && !Number.isNaN(mainConfigValues.maxConcurrent)) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          pool: {
            ...result.providers?.llamacpp?.pool,
            maxConcurrent: mainConfigValues.maxConcurrent,
          },
        },
      };
    }

    if (mainConfigValues.maxRetries && !Number.isNaN(mainConfigValues.maxRetries)) {
      result.providers = {
        ...result.providers,
        llamacpp: { ...result.providers?.llamacpp, maxRetries: mainConfigValues.maxRetries },
        gemini: { ...result.providers?.gemini, maxRetries: mainConfigValues.maxRetries },
      };
    }

    if (mainConfigValues.timeout && !Number.isNaN(mainConfigValues.timeout)) {
      result.providers = {
        ...result.providers,
        llamacpp: { ...result.providers?.llamacpp, timeout: mainConfigValues.timeout },
        gemini: { ...result.providers?.gemini, timeout: mainConfigValues.timeout },
      };
    }

    if (mainConfigValues.cacheEnabled !== undefined) {
      result.cache = { ...result.cache, enabled: mainConfigValues.cacheEnabled };
    }

    if (mainConfigValues.cacheTTL && !Number.isNaN(mainConfigValues.cacheTTL)) {
      result.cache = {
        ...result.cache,
        healthCheck: { ...result.cache?.healthCheck, ttl: mainConfigValues.cacheTTL },
      };
    }

    if (mainConfigValues.defaultModel) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: { ...result.providers?.llamacpp?.models, default: mainConfigValues.defaultModel },
        },
      };
    }

    if (mainConfigValues.fastModel) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: { ...result.providers?.llamacpp?.models, router: mainConfigValues.fastModel },
        },
      };
    }

    if (mainConfigValues.coderModel) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: { ...result.providers?.llamacpp?.models, coder: mainConfigValues.coderModel },
        },
      };
    }

    return result;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Deep merge objects
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Export configuration as JSON
   * @returns {string}
   */
  toJSON() {
    return JSON.stringify(this._config, null, 2);
  }

  /**
   * Import configuration from JSON
   * @param {string} json
   */
  fromJSON(json) {
    const config = JSON.parse(json);
    this.load(config);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _configManager = null;

/**
 * Get or create config manager singleton
 * @param {Object} initialConfig - Initial configuration (only used on first call)
 * @returns {ConfigManager}
 */
export function getConfigManager(initialConfig = {}) {
  if (!_configManager) {
    _configManager = new ConfigManager(initialConfig);
  }
  return _configManager;
}

/**
 * Reset config manager (for testing)
 */
export function resetConfigManager() {
  _configManager = null;
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  DEFAULT_CONFIG,
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  Schemas,
};
