/**
 * @fileoverview Configuration module for Gemini CLI / Hydra
 *
 * This module provides centralized, validated configuration using Zod schemas.
 * All environment variables are validated at startup with descriptive error messages.
 *
 * @example
 * import { CONFIG, configSchema } from './config.js';
 * console.log(CONFIG.DEFAULT_MODEL); // 'llama3.2:3b'
 *
 * @see .env.example for all available environment variables
 */

import 'dotenv/config';
import { z } from 'zod';
import {
  envBoolean,
  envNumberInRange,
  envString,
  formatZodErrors,
  parseZodErrors,
} from './utils/zod-helpers.js';

// =============================================================================
// Configuration Schema Definition
// =============================================================================

/**
 * Zod schema for the complete application configuration.
 * Each field includes validation rules and descriptive error messages.
 */
export const configSchema = z
  .object({
    // -------------------------------------------------------------------------
    // API Configuration
    // -------------------------------------------------------------------------
    /** @description API version string (e.g., 'v1', 'v2') */
    API_VERSION: envString('v1').describe('API version identifier'),

    // -------------------------------------------------------------------------
    // Model Configuration
    // -------------------------------------------------------------------------
    /** @description Default model for general queries */
    DEFAULT_MODEL: envString('llama3.2:3b').describe('Default LLM model for general operations'),

    /** @description Fast model for quick, lightweight operations */
    FAST_MODEL: envString('llama3.2:1b').describe('Lightweight model for fast operations'),

    /** @description Specialized model for code generation/analysis */
    CODER_MODEL: envString('qwen2.5-coder:1.5b').describe(
      'Specialized model for code-related tasks',
    ),

    // -------------------------------------------------------------------------
    // Cache Configuration
    // -------------------------------------------------------------------------
    /** @description Directory path for cache storage */
    CACHE_DIR: envString('./cache').describe('Cache directory path'),

    /** @description Cache time-to-live in seconds (converted to ms internally) */
    CACHE_TTL: envNumberInRange(3600, 0, 86400 * 30).describe('Cache TTL in seconds (0-2592000)'),

    /** @description Whether caching is enabled */
    CACHE_ENABLED: envBoolean(true).describe('Enable/disable response caching'),

    /**
     * @description AES-256-GCM encryption key for cache (hex or base64 encoded)
     * Must be exactly 32 bytes when decoded. Empty string disables encryption.
     */
    CACHE_ENCRYPTION_KEY: z
      .string()
      .optional()
      .default('')
      .refine(
        (val) => {
          if (!val || val === '') return true;
          // Check if it's a valid hex (64 chars) or base64 (44 chars with padding)
          const isValidHex = /^[a-fA-F0-9]{64}$/.test(val);
          const isValidBase64 = /^[A-Za-z0-9+/]{43}=$/.test(val);
          return isValidHex || isValidBase64;
        },
        {
          message:
            'CACHE_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex chars or 44 base64 chars (with padding)',
        },
      )
      .describe('AES-256-GCM encryption key (empty to disable)'),

    /** @description Maximum number of entries in the LRU memory cache */
    CACHE_MAX_MEMORY_ENTRIES: envNumberInRange(1000, 10, 100000).describe(
      'Max entries in memory cache (10-100000)',
    ),

    /** @description Maximum memory usage for cache in MB */
    CACHE_MAX_MEMORY_MB: envNumberInRange(100, 1, 2048).describe(
      'Max memory for cache in MB (1-2048)',
    ),

    /** @description Interval for automatic cache cleanup in ms */
    CACHE_CLEANUP_INTERVAL_MS: envNumberInRange(300000, 10000, 3600000).describe(
      'Cache cleanup interval in ms (10000-3600000)',
    ),

    /** @description Whether to persist cache to disk */
    CACHE_PERSIST_TO_DISK: envBoolean(true).describe('Enable disk persistence for cache'),

    /** @description Minimum response length to cache */
    CACHE_MIN_RESPONSE_LENGTH: envNumberInRange(10, 1, 1000).describe(
      'Minimum response length to cache (1-1000)',
    ),

    // -------------------------------------------------------------------------
    // Queue Configuration
    // -------------------------------------------------------------------------
    /** @description Maximum concurrent queue operations */
    QUEUE_MAX_CONCURRENT: envNumberInRange(10, 1, 100).describe(
      'Max concurrent queue operations (1-100)',
    ),

    /** @description Maximum retry attempts for failed operations */
    QUEUE_MAX_RETRIES: envNumberInRange(3, 0, 10).describe('Max retry attempts (0-10)'),

    /** @description Base delay in ms for exponential backoff */
    QUEUE_RETRY_DELAY_BASE: envNumberInRange(1000, 100, 30000).describe(
      'Base retry delay in ms (100-30000)',
    ),

    /** @description Queue operation timeout in ms */
    QUEUE_TIMEOUT_MS: envNumberInRange(60000, 1000, 600000).describe(
      'Queue timeout in ms (1000-600000)',
    ),

    /** @description Rate limit token bucket size */
    QUEUE_RATE_LIMIT_TOKENS: envNumberInRange(10, 1, 1000).describe(
      'Rate limit token bucket size (1-1000)',
    ),

    /** @description Rate limit token refill rate per second */
    QUEUE_RATE_LIMIT_REFILL: envNumberInRange(2, 1, 100).describe(
      'Rate limit refill per second (1-100)',
    ),

    // -------------------------------------------------------------------------
    // Model Cache Configuration
    // -------------------------------------------------------------------------
    /** @description TTL for model metadata cache in ms */
    MODEL_CACHE_TTL_MS: envNumberInRange(300000, 0, 3600000).describe(
      'Model cache TTL in ms (0-3600000)',
    ),

    // -------------------------------------------------------------------------
    // Health Check Configuration
    // -------------------------------------------------------------------------
    /** @description Timeout for health check requests in ms */
    HEALTH_CHECK_TIMEOUT_MS: envNumberInRange(5000, 500, 30000).describe(
      'Health check timeout in ms (500-30000)',
    ),

    // -------------------------------------------------------------------------
    // Runtime Mode Configuration
    // -------------------------------------------------------------------------
    /** @description YOLO mode: faster but less safe defaults */
    HYDRA_YOLO: envBoolean(false).describe('Enable YOLO mode (faster, fewer retries)'),

    /** @description Whether to block risky operations */
    HYDRA_RISK_BLOCKING: envBoolean(true).describe('Block potentially risky operations'),
  })
  .strict();

// =============================================================================
// Configuration Parsing and Validation
// =============================================================================

/**
 * Parses and validates environment variables against the config schema.
 * Throws a detailed error if validation fails.
 *
 * @returns {z.infer<typeof configSchema>} Validated raw configuration
 * @throws {Error} If environment variables fail validation
 */
function parseEnvConfig() {
  const rawEnv = {
    API_VERSION: process.env.API_VERSION,
    DEFAULT_MODEL: process.env.DEFAULT_MODEL,
    FAST_MODEL: process.env.FAST_MODEL,
    CODER_MODEL: process.env.CODER_MODEL,
    CACHE_DIR: process.env.CACHE_DIR,
    CACHE_TTL: process.env.CACHE_TTL,
    CACHE_ENABLED: process.env.CACHE_ENABLED,
    CACHE_ENCRYPTION_KEY: process.env.CACHE_ENCRYPTION_KEY,
    CACHE_MAX_MEMORY_ENTRIES: process.env.CACHE_MAX_MEMORY_ENTRIES,
    CACHE_MAX_MEMORY_MB: process.env.CACHE_MAX_MEMORY_MB,
    CACHE_CLEANUP_INTERVAL_MS: process.env.CACHE_CLEANUP_INTERVAL_MS,
    CACHE_PERSIST_TO_DISK: process.env.CACHE_PERSIST_TO_DISK,
    CACHE_MIN_RESPONSE_LENGTH: process.env.CACHE_MIN_RESPONSE_LENGTH,
    QUEUE_MAX_CONCURRENT: process.env.QUEUE_MAX_CONCURRENT,
    QUEUE_MAX_RETRIES: process.env.QUEUE_MAX_RETRIES,
    QUEUE_RETRY_DELAY_BASE: process.env.QUEUE_RETRY_DELAY_BASE,
    QUEUE_TIMEOUT_MS: process.env.QUEUE_TIMEOUT_MS,
    QUEUE_RATE_LIMIT_TOKENS: process.env.QUEUE_RATE_LIMIT_TOKENS,
    QUEUE_RATE_LIMIT_REFILL: process.env.QUEUE_RATE_LIMIT_REFILL,
    MODEL_CACHE_TTL_MS: process.env.MODEL_CACHE_TTL_MS,
    HEALTH_CHECK_TIMEOUT_MS: process.env.HEALTH_CHECK_TIMEOUT_MS,
    HYDRA_YOLO: process.env.HYDRA_YOLO,
    HYDRA_RISK_BLOCKING: process.env.HYDRA_RISK_BLOCKING,
  };

  const result = configSchema.safeParse(rawEnv);

  if (!result.success) {
    throw new Error(
      `Configuration validation failed:\n${formatZodErrors(result.error.issues)}\n\nCheck your .env file or environment variables.`,
    );
  }

  return result.data;
}

/**
 * Transforms raw config into the final CONFIG object with computed values.
 * Applies YOLO mode overrides and converts units where needed.
 *
 * @param {z.infer<typeof configSchema>} rawConfig - Validated raw configuration
 * @returns {Readonly<Config>} Frozen configuration object
 */
function buildConfig(rawConfig) {
  const yoloMode = rawConfig.HYDRA_YOLO;

  // YOLO mode overrides: faster but less resilient settings
  const queueMaxConcurrent = yoloMode
    ? Math.max(rawConfig.QUEUE_MAX_CONCURRENT, 20)
    : rawConfig.QUEUE_MAX_CONCURRENT;

  const queueMaxRetries = yoloMode
    ? Math.min(rawConfig.QUEUE_MAX_RETRIES, 1)
    : rawConfig.QUEUE_MAX_RETRIES;

  const queueTimeoutMs = yoloMode
    ? Math.min(rawConfig.QUEUE_TIMEOUT_MS, 15000)
    : rawConfig.QUEUE_TIMEOUT_MS;

  // RISK_BLOCKING defaults to opposite of YOLO_MODE unless explicitly set
  const riskBlocking =
    process.env.HYDRA_RISK_BLOCKING !== undefined ? rawConfig.HYDRA_RISK_BLOCKING : !yoloMode;

  return {
    // API
    API_VERSION: rawConfig.API_VERSION,

    // Models
    DEFAULT_MODEL: rawConfig.DEFAULT_MODEL,
    FAST_MODEL: rawConfig.FAST_MODEL,
    CODER_MODEL: rawConfig.CODER_MODEL,

    // Cache (convert TTL from seconds to milliseconds)
    CACHE_DIR: rawConfig.CACHE_DIR,
    CACHE_TTL_MS: rawConfig.CACHE_TTL * 1000,
    CACHE_ENABLED: rawConfig.CACHE_ENABLED,
    CACHE_ENCRYPTION_KEY: rawConfig.CACHE_ENCRYPTION_KEY,
    CACHE_MAX_MEMORY_ENTRIES: rawConfig.CACHE_MAX_MEMORY_ENTRIES,
    CACHE_MAX_MEMORY_MB: rawConfig.CACHE_MAX_MEMORY_MB,
    CACHE_CLEANUP_INTERVAL_MS: rawConfig.CACHE_CLEANUP_INTERVAL_MS,
    CACHE_PERSIST_TO_DISK: rawConfig.CACHE_PERSIST_TO_DISK,
    CACHE_MIN_RESPONSE_LENGTH: rawConfig.CACHE_MIN_RESPONSE_LENGTH,

    // Queue (with YOLO overrides applied)
    QUEUE_MAX_CONCURRENT: queueMaxConcurrent,
    QUEUE_MAX_RETRIES: queueMaxRetries,
    QUEUE_RETRY_DELAY_BASE: rawConfig.QUEUE_RETRY_DELAY_BASE,
    QUEUE_TIMEOUT_MS: queueTimeoutMs,
    QUEUE_RATE_LIMIT_TOKENS: rawConfig.QUEUE_RATE_LIMIT_TOKENS,
    QUEUE_RATE_LIMIT_REFILL: rawConfig.QUEUE_RATE_LIMIT_REFILL,

    // Model Cache
    MODEL_CACHE_TTL_MS: rawConfig.MODEL_CACHE_TTL_MS,

    // Health Check
    HEALTH_CHECK_TIMEOUT_MS: rawConfig.HEALTH_CHECK_TIMEOUT_MS,

    // Runtime Modes
    YOLO_MODE: yoloMode,
    RISK_BLOCKING: riskBlocking,
  };
}

// =============================================================================
// Type Definitions (JSDoc for JavaScript consumers)
// =============================================================================

/**
 * @typedef {Object} Config
 * @property {string} API_VERSION - API version identifier
 * @property {string} DEFAULT_MODEL - Default LLM model
 * @property {string} FAST_MODEL - Fast/lightweight LLM model
 * @property {string} CODER_MODEL - Code-specialized LLM model
 * @property {string} CACHE_DIR - Cache directory path
 * @property {number} CACHE_TTL_MS - Cache TTL in milliseconds
 * @property {boolean} CACHE_ENABLED - Whether caching is enabled
 * @property {string} CACHE_ENCRYPTION_KEY - AES-256-GCM key (empty = no encryption)
 * @property {number} CACHE_MAX_MEMORY_ENTRIES - Max entries in LRU memory cache
 * @property {number} CACHE_MAX_MEMORY_MB - Max memory usage for cache in MB
 * @property {number} CACHE_CLEANUP_INTERVAL_MS - Interval for automatic cache cleanup in ms
 * @property {boolean} CACHE_PERSIST_TO_DISK - Whether to persist cache to disk
 * @property {number} CACHE_MIN_RESPONSE_LENGTH - Minimum response length to cache
 * @property {number} QUEUE_MAX_CONCURRENT - Max concurrent queue operations
 * @property {number} QUEUE_MAX_RETRIES - Max retry attempts
 * @property {number} QUEUE_RETRY_DELAY_BASE - Base retry delay in ms
 * @property {number} QUEUE_TIMEOUT_MS - Queue operation timeout in ms
 * @property {number} QUEUE_RATE_LIMIT_TOKENS - Rate limit bucket size
 * @property {number} QUEUE_RATE_LIMIT_REFILL - Rate limit refill per second
 * @property {number} MODEL_CACHE_TTL_MS - Model metadata cache TTL in ms
 * @property {number} HEALTH_CHECK_TIMEOUT_MS - Health check timeout in ms
 * @property {boolean} YOLO_MODE - Whether YOLO mode is enabled
 * @property {boolean} RISK_BLOCKING - Whether risky operations are blocked
 */

// =============================================================================
// Configuration Export
// =============================================================================

/**
 * Validated and frozen application configuration.
 * This object is deeply frozen to prevent accidental mutations.
 *
 * @type {Readonly<Config>}
 */
export const CONFIG = Object.freeze(buildConfig(parseEnvConfig()));

/**
 * Validates a partial config object against the schema.
 * Useful for testing or validating config overrides.
 *
 * @param {Partial<z.input<typeof configSchema>>} partialConfig - Config to validate
 * @returns {{ success: boolean, data?: z.infer<typeof configSchema>, error?: z.ZodError }}
 */
export function validateConfig(partialConfig) {
  return configSchema.safeParse(partialConfig);
}

/**
 * @typedef {Object} ValidationError
 * @property {string} field - Field name that failed validation
 * @property {string} message - Human-readable error message
 * @property {string} code - Zod error code
 * @property {*} [received] - Value that was received
 * @property {*} [expected] - Expected value or type
 * @property {string} path - Full path to the field (dot notation)
 */

/**
 * @typedef {Object} DetailedValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {ValidationError[]} errors - Array of detailed error objects
 * @property {string[]} warnings - Array of warning messages
 * @property {Object} [data] - Validated data (only if valid)
 * @property {string} summary - Human-readable summary
 */

/**
 * Validates configuration with detailed error reporting.
 * Returns structured errors with field paths, messages, and suggestions.
 *
 * @param {Partial<z.input<typeof configSchema>>} config - Configuration to validate
 * @returns {DetailedValidationResult} Detailed validation result
 *
 * @example
 * const result = validateConfigDetailed({ CACHE_TTL: -1 });
 * if (!result.valid) {
 *   result.errors.forEach(err => console.log(`${err.field}: ${err.message}`));
 * }
 */
export function validateConfigDetailed(config) {
  const result = configSchema.safeParse(config);
  const warnings = [];

  if (result.success) {
    // Check for warnings (valid but potentially problematic values)
    if (result.data.CACHE_TTL === 0) {
      warnings.push('CACHE_TTL is 0 - caching will be effectively disabled');
    }
    if (result.data.QUEUE_MAX_CONCURRENT > 50) {
      warnings.push(
        `QUEUE_MAX_CONCURRENT is ${result.data.QUEUE_MAX_CONCURRENT} - high concurrency may cause resource exhaustion`,
      );
    }
    if (result.data.QUEUE_MAX_RETRIES === 0) {
      warnings.push('QUEUE_MAX_RETRIES is 0 - failed operations will not be retried');
    }
    if (result.data.CACHE_MAX_MEMORY_MB > 1024) {
      warnings.push(
        `CACHE_MAX_MEMORY_MB is ${result.data.CACHE_MAX_MEMORY_MB}MB - high memory usage may impact system performance`,
      );
    }

    return {
      valid: true,
      errors: [],
      warnings,
      data: result.data,
      summary:
        warnings.length > 0
          ? `Configuration valid with ${warnings.length} warning(s)`
          : 'Configuration valid',
    };
  }

  // Parse Zod errors into detailed format
  const errors = parseZodErrors(result.error.issues).map((err) => {
    const issue = result.error.issues.find((i) => i.path.join('.') === err.path);
    const error = { ...err };

    if (issue && 'received' in issue) {
      error.received = issue.received;
    }

    if (issue) {
      if (issue.code === 'invalid_type') {
        error.expected = issue.expected;
      } else if (issue.code === 'too_small') {
        error.expected = `>= ${issue.minimum}`;
      } else if (issue.code === 'too_big') {
        error.expected = `<= ${issue.maximum}`;
      } else if (issue.code === 'invalid_enum_value') {
        error.expected = issue.options;
      }
    }

    return error;
  });

  return {
    valid: false,
    errors,
    warnings,
    summary: `Configuration invalid: ${errors.length} error(s) found`,
  };
}

/**
 * Gets configuration documentation for all fields.
 * Useful for generating help text or config file templates.
 *
 * @returns {Array<{field: string, description: string, type: string, default: *, required: boolean}>}
 */
export function getConfigDocumentation() {
  const shape = configSchema.shape;
  const docs = [];

  for (const [field, schema] of Object.entries(shape)) {
    const description = schema.description || 'No description available';
    let type = 'unknown';
    let defaultValue;
    let required = true;

    // Extract type information from Zod schema
    if (schema._def) {
      const typeName = schema._def.typeName;
      if (typeName === 'ZodString') type = 'string';
      else if (typeName === 'ZodNumber') type = 'number';
      else if (typeName === 'ZodBoolean') type = 'boolean';
      else if (typeName === 'ZodOptional') {
        required = false;
        type = schema._def.innerType?._def?.typeName?.replace('Zod', '').toLowerCase() || 'unknown';
      }
    }

    docs.push({
      field,
      description,
      type,
      default: defaultValue,
      required,
    });
  }

  return docs;
}

/**
 * Returns a copy of the current config for inspection.
 * The returned object is a shallow copy, not a reference.
 *
 * @returns {Config} Copy of current configuration
 */
export function getConfigSnapshot() {
  return { ...CONFIG };
}

/**
 * Load and return the current configuration.
 * Alias for getConfigSnapshot() for backwards compatibility.
 *
 * @returns {Config} Current configuration
 */
export function loadConfig() {
  return getConfigSnapshot();
}
