/**
 * @fileoverview HYDRA Configuration Management
 * Centralized configuration with validation, environment handling, and defaults
 *
 * @description
 * This module provides:
 * - Zod-based configuration schema validation
 * - Environment variable integration
 * - Deep merge utilities for config overrides
 * - Integration with main application config (src/config.js)
 *
 * Configuration can be provided through:
 * 1. Constructor options
 * 2. Environment variables (OLLAMA_URL, HYDRA_VERBOSE, etc.)
 * 3. Main application CONFIG object
 *
 * @module hydra/core/config
 * @see module:config - Main application configuration
 */

import { z } from 'zod';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * @typedef {Object} ProviderConfig
 * @property {boolean} enabled - Whether provider is enabled
 * @property {number} timeout - Request timeout in ms
 * @property {number} maxRetries - Maximum retry attempts
 * @property {number} costPerToken - Cost per token
 * @property {number} fixedCost - Fixed cost per request
 * @property {string} [defaultModel] - Default model name
 * @property {Object} pool - Connection pool config
 * @property {Object} rateLimit - Rate limiting config
 */

/**
 * @typedef {Object} HydraConfig
 * @property {Object} providers - Provider configurations
 * @property {Object} router - Router configuration
 * @property {Object} pipeline - Pipeline configuration
 * @property {Object} cache - Cache configuration
 * @property {Object} stats - Statistics configuration
 * @property {Object} logging - Logging configuration
 */

/**
 * Provider configuration schema
 */
const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.number().min(1000).max(600000).default(120000),
  maxRetries: z.number().min(0).max(10).default(3),
  costPerToken: z.number().min(0).default(0),
  fixedCost: z.number().min(0).default(0),
  defaultModel: z.string().optional(),
  pool: z.object({
    maxConcurrent: z.number().min(1).max(100).default(5),
    maxQueueSize: z.number().min(0).max(1000).default(100),
    acquireTimeout: z.number().min(1000).max(60000).default(30000)
  }).default({}),
  rateLimit: z.object({
    enabled: z.boolean().default(false),
    tokensPerInterval: z.number().min(1).default(10),
    interval: z.number().min(100).default(1000)
  }).default({})
});

/**
 * LlamaCpp-specific configuration schema (replaces Ollama)
 */
const LlamaCppConfigSchema = ProviderConfigSchema.extend({
  models: z.object({
    router: z.string().default('draft'),
    researcher: z.string().default('main'),
    coder: z.string().default('main'),
    reasoner: z.string().default('main'),
    default: z.string().default('main')
  }).default({}),
  tools: z.object({
    default: z.string().default('llama_generate'),
    fast: z.string().default('llama_generate_fast'),
    code: z.string().default('llama_code'),
    json: z.string().default('llama_json'),
    vision: z.string().default('llama_vision'),
    functionCall: z.string().default('llama_function_call')
  }).default({})
});

/**
 * Gemini-specific configuration schema
 */
const GeminiConfigSchema = ProviderConfigSchema.extend({
  cliPath: z.string().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().default('gemini-2.0-flash-exp'),
  thinkingModel: z.string().default('gemini-2.0-flash-thinking-exp'),
  costPerToken: z.number().default(0.000001),
  fixedCost: z.number().default(0.001),
  autoSelectBestModel: z.boolean().default(true),
  modelRefreshInterval: z.number().min(60000).default(300000) // 5 minutes
});

/**
 * Router configuration schema
 */
const RouterConfigSchema = z.object({
  useLLMRouting: z.boolean().default(true),
  fallbackToHeuristic: z.boolean().default(true),
  complexityThresholds: z.object({
    simple: z.number().default(1),
    medium: z.number().default(2),
    complex: z.number().default(4)
  }).default({}),
  categoryPatterns: z.record(z.array(z.string())).default({})
});

/**
 * Pipeline configuration schema
 */
const PipelineConfigSchema = z.object({
  verbose: z.boolean().default(false),
  enableSpeculation: z.boolean().default(true),
  enablePlanning: z.boolean().default(true),
  enableSynthesis: z.boolean().default(true),
  enableFeedbackLoop: z.boolean().default(true),
  maxPlanSteps: z.number().min(1).max(20).default(5),
  maxFeedbackIterations: z.number().min(1).max(5).default(3),
  qualityThreshold: z.number().min(0).max(10).default(7),
  fallbackProvider: z.enum(['ollama', 'gemini']).default('gemini'),
  parallelExecution: z.boolean().default(false)
});

/**
 * Cache configuration schema
 */
const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  healthCheck: z.object({
    ttl: z.number().min(1000).default(30000),
    staleTTL: z.number().min(1000).default(60000),
    autoRefresh: z.boolean().default(true)
  }).default({}),
  responses: z.object({
    enabled: z.boolean().default(false),
    ttl: z.number().min(1000).default(300000),
    maxSize: z.number().min(10).default(1000)
  }).default({})
});

/**
 * Stats configuration schema
 */
const StatsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  rollingWindowSize: z.number().min(10).max(1000).default(100),
  timeSeriesBucketSize: z.number().min(1000).default(60000),
  timeSeriesRetention: z.number().min(1).default(60),
  exportFormat: z.enum(['json', 'prometheus']).default('json')
});

/**
 * Main HYDRA configuration schema
 */
const HydraConfigSchema = z.object({
  providers: z.object({
    llamacpp: LlamaCppConfigSchema.default({}),
    gemini: GeminiConfigSchema.default({})
  }).default({}),
  router: RouterConfigSchema.default({}),
  pipeline: PipelineConfigSchema.default({}),
  cache: CacheConfigSchema.default({}),
  stats: StatsConfigSchema.default({}),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    timestamps: z.boolean().default(true),
    colors: z.boolean().default(true)
  }).default({})
});

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  providers: {
    llamacpp: {
      enabled: true,
      timeout: 120000,
      maxRetries: 3,
      costPerToken: 0,
      fixedCost: 0,
      models: {
        router: 'draft',
        researcher: 'main',
        coder: 'main',
        reasoner: 'main',
        default: 'main'
      },
      tools: {
        default: 'llama_generate',
        fast: 'llama_generate_fast',
        code: 'llama_code',
        json: 'llama_json',
        vision: 'llama_vision',
        functionCall: 'llama_function_call'
      },
      pool: {
        maxConcurrent: 5,
        maxQueueSize: 100,
        acquireTimeout: 30000
      },
      rateLimit: {
        enabled: false,
        tokensPerInterval: 10,
        interval: 1000
      }
    },
    gemini: {
      enabled: true,
      timeout: 120000,
      maxRetries: 3,
      costPerToken: 0.000001,
      fixedCost: 0.001,
      defaultModel: 'gemini-2.0-flash-exp',
      thinkingModel: 'gemini-2.0-flash-thinking-exp',
      autoSelectBestModel: true,
      modelRefreshInterval: 300000, // 5 minutes
      pool: {
        maxConcurrent: 3,
        maxQueueSize: 50,
        acquireTimeout: 30000
      },
      rateLimit: {
        enabled: true,
        tokensPerInterval: 5,
        interval: 1000
      }
    }
  },
  router: {
    useLLMRouting: true,
    fallbackToHeuristic: true,
    complexityThresholds: {
      simple: 1,
      medium: 2,
      complex: 4
    }
  },
  pipeline: {
    verbose: false,
    enableSpeculation: true,
    enablePlanning: true,
    enableSynthesis: true,
    enableFeedbackLoop: true,
    maxPlanSteps: 5,
    maxFeedbackIterations: 3,
    qualityThreshold: 7,
    fallbackProvider: 'gemini',
    parallelExecution: false
  },
  cache: {
    enabled: true,
    healthCheck: {
      ttl: 30000,
      staleTTL: 60000,
      autoRefresh: true
    },
    responses: {
      enabled: false,
      ttl: 300000,
      maxSize: 1000
    }
  },
  stats: {
    enabled: true,
    rollingWindowSize: 100,
    timeSeriesBucketSize: 60000,
    timeSeriesRetention: 60,
    exportFormat: 'json'
  },
  logging: {
    level: 'info',
    timestamps: true,
    colors: true
  }
};

/**
 * Configuration Manager
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
      const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
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

  /**
   * Apply environment variable overrides and main config integration
   * @param {Object} config
   * @returns {Object}
   * @private
   */
  _applyEnvOverrides(config) {
    let result = { ...config };

    // Integration with main application config (src/config.js)
    // This provides seamless configuration sharing between modules
    result = this._applyMainConfigIntegration(result);

    // LlamaCpp default model from env
    if (process.env.LLAMACPP_DEFAULT_MODEL) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: {
            ...result.providers?.llamacpp?.models,
            default: process.env.LLAMACPP_DEFAULT_MODEL
          }
        }
      };
    }

    // Verbose logging
    if (process.env.HYDRA_VERBOSE === 'true') {
      result.pipeline = {
        ...result.pipeline,
        verbose: true
      };
    }

    // Log level
    if (process.env.HYDRA_LOG_LEVEL) {
      result.logging = {
        ...result.logging,
        level: process.env.HYDRA_LOG_LEVEL
      };
    }

    // Provider timeouts
    if (process.env.HYDRA_TIMEOUT) {
      const timeout = parseInt(process.env.HYDRA_TIMEOUT, 10);
      if (!isNaN(timeout)) {
        result.providers = {
          ...result.providers,
          llamacpp: { ...result.providers?.llamacpp, timeout },
          gemini: { ...result.providers?.gemini, timeout }
        };
      }
    }

    // YOLO mode from main config
    if (process.env.HYDRA_YOLO === 'true') {
      result.pipeline = {
        ...result.pipeline,
        verbose: false
      };
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          maxRetries: 1,
          timeout: Math.min(result.providers?.llamacpp?.timeout || 30000, 30000)
        },
        gemini: {
          ...result.providers?.gemini,
          maxRetries: 1,
          timeout: Math.min(result.providers?.gemini?.timeout || 30000, 30000)
        }
      };
    }

    return result;
  }

  /**
   * Apply main application config integration
   * Maps values from src/config.js to HYDRA config structure
   *
   * @param {Object} config - Current configuration
   * @returns {Object} Config with main app values applied
   * @private
   */
  _applyMainConfigIntegration(config) {
    const result = { ...config };

    // Dynamically import main config to get current values
    // Uses synchronous check of process.env which is populated by dotenv
    const mainConfigValues = {
      // Queue/concurrency settings
      maxConcurrent: parseInt(process.env.QUEUE_MAX_CONCURRENT, 10) || config.providers?.llamacpp?.pool?.maxConcurrent,
      maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES, 10) || config.providers?.llamacpp?.maxRetries,
      timeout: parseInt(process.env.QUEUE_TIMEOUT_MS, 10) || config.providers?.llamacpp?.timeout,

      // Cache settings
      cacheEnabled: process.env.CACHE_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.CACHE_TTL, 10) * 1000 || config.cache?.healthCheck?.ttl,

      // Models - LlamaCpp uses GGUF model names
      defaultModel: process.env.LLAMACPP_DEFAULT_MODEL || config.providers?.llamacpp?.models?.default,
      fastModel: process.env.LLAMACPP_FAST_MODEL || config.providers?.llamacpp?.models?.router,
      coderModel: process.env.LLAMACPP_CODER_MODEL || config.providers?.llamacpp?.models?.coder
    };

    // Apply main config values where appropriate
    if (mainConfigValues.maxConcurrent && !isNaN(mainConfigValues.maxConcurrent)) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          pool: {
            ...result.providers?.llamacpp?.pool,
            maxConcurrent: mainConfigValues.maxConcurrent
          }
        }
      };
    }

    if (mainConfigValues.maxRetries && !isNaN(mainConfigValues.maxRetries)) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          maxRetries: mainConfigValues.maxRetries
        },
        gemini: {
          ...result.providers?.gemini,
          maxRetries: mainConfigValues.maxRetries
        }
      };
    }

    if (mainConfigValues.timeout && !isNaN(mainConfigValues.timeout)) {
      result.providers = {
        ...result.providers,
        llamacpp: { ...result.providers?.llamacpp, timeout: mainConfigValues.timeout },
        gemini: { ...result.providers?.gemini, timeout: mainConfigValues.timeout }
      };
    }

    if (mainConfigValues.cacheEnabled !== undefined) {
      result.cache = {
        ...result.cache,
        enabled: mainConfigValues.cacheEnabled
      };
    }

    if (mainConfigValues.cacheTTL && !isNaN(mainConfigValues.cacheTTL)) {
      result.cache = {
        ...result.cache,
        healthCheck: {
          ...result.cache?.healthCheck,
          ttl: mainConfigValues.cacheTTL
        }
      };
    }

    // Apply model configurations
    if (mainConfigValues.defaultModel) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: {
            ...result.providers?.llamacpp?.models,
            default: mainConfigValues.defaultModel
          }
        }
      };
    }

    if (mainConfigValues.fastModel) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: {
            ...result.providers?.llamacpp?.models,
            router: mainConfigValues.fastModel
          }
        }
      };
    }

    if (mainConfigValues.coderModel) {
      result.providers = {
        ...result.providers,
        llamacpp: {
          ...result.providers?.llamacpp,
          models: {
            ...result.providers?.llamacpp?.models,
            coder: mainConfigValues.coderModel
          }
        }
      };
    }

    return result;
  }

  /**
   * Deep merge objects
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
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

// Singleton instance
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

// Export schemas for external validation
export const Schemas = {
  HydraConfigSchema,
  ProviderConfigSchema,
  LlamaCppConfigSchema,
  GeminiConfigSchema,
  RouterConfigSchema,
  PipelineConfigSchema,
  CacheConfigSchema,
  StatsConfigSchema
};

// =============================================================================
// Default Export
// =============================================================================

/**
 * Default export with all configuration utilities
 */
export default {
  DEFAULT_CONFIG,
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  Schemas
};
