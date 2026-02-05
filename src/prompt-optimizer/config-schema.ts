/**
 * Configuration schema and validation for Prompt Optimizer
 * Provides type-safe configuration with validation and defaults
 */

import { ValidationError } from '../errors/AppError.js';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = Object.freeze({
  categories: {},
  modelOptimizations: {},
  languages: {},
  vagueWords: ['something', 'stuff', 'thing', 'it', 'this', 'that'],
  specificIndicators: ['specifically', 'exactly', 'must', 'should'],
  promptTemplates: {},
  smartSuggestions: {
    contextClues: {},
    autoCompletions: {}
  },
  settings: {
    autoOptimize: true,
    lowClarityThreshold: 60,
    wrapLowClarity: true,
    maxCacheSize: 1000,
    cacheTtlMs: 300000 // 5 minutes
  }
});

/**
 * Schema definition for validation
 */
const SCHEMA = {
  categories: {
    type: 'object',
    itemSchema: {
      keywords: { type: 'array', itemType: 'string', required: true },
      enhancers: { type: 'array', itemType: 'string', required: false },
      priority: { type: 'number', min: 1, max: 10, required: false }
    }
  },
  modelOptimizations: {
    type: 'object',
    itemSchema: {
      maxTokens: { type: 'number', min: 1, required: false },
      style: { type: 'string', enum: ['balanced', 'concise', 'detailed'], required: false },
      prefix: { type: 'string', required: false },
      temperature: { type: 'number', min: 0, max: 2, required: false }
    }
  },
  languages: {
    type: 'object',
    itemSchema: { type: 'array', itemType: 'string' }
  },
  vagueWords: {
    type: 'array',
    itemType: 'string'
  },
  specificIndicators: {
    type: 'array',
    itemType: 'string'
  },
  settings: {
    type: 'object',
    schema: {
      autoOptimize: { type: 'boolean', required: false },
      lowClarityThreshold: { type: 'number', min: 0, max: 100, required: false },
      wrapLowClarity: { type: 'boolean', required: false },
      maxCacheSize: { type: 'number', min: 1, required: false },
      cacheTtlMs: { type: 'number', min: 0, required: false }
    }
  }
};

/**
 * Validate a value against a type specification
 * @param {*} value - Value to validate
 * @param {object} spec - Type specification
 * @param {string} path - Current path for error messages
 * @returns {Array<string>} Array of validation errors
 */
function validateValue(value, spec, path) {
  const errors = [];

  if (value === undefined || value === null) {
    if (spec.required) {
      errors.push(`${path}: Required field is missing`);
    }
    return errors;
  }

  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path}: Expected string, got ${typeof value}`);
      } else if (spec.enum && !spec.enum.includes(value)) {
        errors.push(`${path}: Value must be one of: ${spec.enum.join(', ')}`);
      }
      break;

    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(`${path}: Expected number, got ${typeof value}`);
      } else {
        if (spec.min !== undefined && value < spec.min) {
          errors.push(`${path}: Value ${value} is less than minimum ${spec.min}`);
        }
        if (spec.max !== undefined && value > spec.max) {
          errors.push(`${path}: Value ${value} is greater than maximum ${spec.max}`);
        }
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${path}: Expected boolean, got ${typeof value}`);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: Expected array, got ${typeof value}`);
      } else if (spec.itemType) {
        value.forEach((item, index) => {
          if (typeof item !== spec.itemType) {
            errors.push(`${path}[${index}]: Expected ${spec.itemType}, got ${typeof item}`);
          }
        });
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${path}: Expected object, got ${typeof value}`);
      } else if (spec.schema) {
        // Validate nested schema
        for (const [key, fieldSpec] of Object.entries(spec.schema)) {
          errors.push(...validateValue(value[key], fieldSpec, `${path}.${key}`));
        }
      } else if (spec.itemSchema) {
        // Validate each item in the object
        for (const [key, itemValue] of Object.entries(value)) {
          if (typeof spec.itemSchema === 'object' && spec.itemSchema.type === 'array') {
            errors.push(...validateValue(itemValue, spec.itemSchema, `${path}.${key}`));
          } else {
            for (const [fieldKey, fieldSpec] of Object.entries(spec.itemSchema)) {
              if (typeof itemValue === 'object' && itemValue !== null) {
                errors.push(...validateValue(itemValue[fieldKey], fieldSpec, `${path}.${key}.${fieldKey}`));
              }
            }
          }
        }
      }
      break;
  }

  return errors;
}

/**
 * Validate configuration object
 * @param {object} config - Configuration to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be an object'], warnings: [] };
  }

  // Validate each top-level key
  for (const [key, spec] of Object.entries(SCHEMA)) {
    if (config[key] !== undefined) {
      errors.push(...validateValue(config[key], spec, key));
    }
  }

  // Warn about unknown keys
  for (const key of Object.keys(config)) {
    if (!(key in SCHEMA) && key !== 'promptTemplates' && key !== 'smartSuggestions') {
      warnings.push(`Unknown configuration key: ${key}`);
    }
  }

  // Validate category keywords are non-empty
  if (config.categories) {
    for (const [category, data] of Object.entries(config.categories)) {
      if (data.keywords && data.keywords.length === 0) {
        warnings.push(`Category '${category}' has empty keywords array`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Merge configuration with defaults
 * @param {object} userConfig - User-provided configuration
 * @returns {object} Merged configuration
 */
export function mergeWithDefaults(userConfig) {
  const merged = { ...DEFAULT_CONFIG };

  if (!userConfig) return merged;

  // Deep merge for nested objects
  for (const [key, value] of Object.entries(userConfig)) {
    if (value === undefined) continue;

    if (key === 'settings' && typeof value === 'object') {
      merged.settings = { ...DEFAULT_CONFIG.settings, ...value };
    } else if (key === 'smartSuggestions' && typeof value === 'object') {
      merged.smartSuggestions = { ...DEFAULT_CONFIG.smartSuggestions, ...value };
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Load and validate configuration, throwing on critical errors
 * @param {object} rawConfig - Raw configuration object
 * @param {object} options - Options
 * @param {boolean} options.strict - Throw on any validation error
 * @returns {object} Validated and merged configuration
 */
export function loadConfig(rawConfig, options = {}) {
  const { strict = false } = options;

  const validation = validateConfig(rawConfig);

  if (!validation.valid) {
    if (strict) {
      throw new ValidationError(`Configuration validation failed: ${validation.errors.join('; ')}`);
    }
    // Log warnings but continue with defaults for invalid fields
    for (const error of validation.errors) {
      console.warn(`[prompt-optimizer] Config error: ${error}`);
    }
  }

  for (const warning of validation.warnings) {
    console.warn(`[prompt-optimizer] Config warning: ${warning}`);
  }

  return mergeWithDefaults(rawConfig);
}

/**
 * Create a frozen, immutable configuration
 * @param {object} config - Configuration to freeze
 * @returns {object} Frozen configuration
 */
export function freezeConfig(config) {
  const frozen = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null) {
      frozen[key] = Array.isArray(value)
        ? Object.freeze([...value])
        : Object.freeze({ ...value });
    } else {
      frozen[key] = value;
    }
  }

  return Object.freeze(frozen);
}
