/**
 * CodexCLI Configuration
 * OpenAI API configuration for HYDRA integration
 */

import 'dotenv/config';

const parseNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return value === 'true';
};

const yoloMode = parseBoolean(process.env.HYDRA_YOLO, false);

export const CONFIG = {
  // API Configuration
  API_VERSION: process.env.API_VERSION || 'v1',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID || '',

  // Model Configuration
  DEFAULT_MODEL: process.env.CODEX_DEFAULT_MODEL || 'gpt-4o',
  CODER_MODEL: process.env.CODEX_CODER_MODEL || 'gpt-4o',
  FAST_MODEL: process.env.CODEX_FAST_MODEL || 'gpt-4o-mini',
  REASONING_MODEL: process.env.CODEX_REASONING_MODEL || 'o1-preview',

  // Generation Defaults
  DEFAULT_TEMPERATURE: parseNumber(process.env.CODEX_TEMPERATURE, 0.3),
  DEFAULT_MAX_TOKENS: parseNumber(process.env.CODEX_MAX_TOKENS, 4096),
  DEFAULT_TOP_P: parseNumber(process.env.CODEX_TOP_P, 1),
  DEFAULT_FREQUENCY_PENALTY: parseNumber(process.env.CODEX_FREQUENCY_PENALTY, 0),
  DEFAULT_PRESENCE_PENALTY: parseNumber(process.env.CODEX_PRESENCE_PENALTY, 0),

  // Timeouts
  REQUEST_TIMEOUT_MS: parseNumber(process.env.CODEX_REQUEST_TIMEOUT_MS, 120000),
  HEALTH_CHECK_TIMEOUT_MS: parseNumber(process.env.CODEX_HEALTH_CHECK_TIMEOUT_MS, 10000),

  // Cache Configuration
  CACHE_DIR: process.env.CODEX_CACHE_DIR || './cache',
  CACHE_TTL_MS: parseNumber(process.env.CODEX_CACHE_TTL, 3600) * 1000,
  CACHE_ENABLED: parseBoolean(process.env.CODEX_CACHE_ENABLED, true),

  // Rate Limiting
  MAX_RETRIES: parseNumber(process.env.CODEX_MAX_RETRIES, 3),
  RETRY_DELAY_BASE: parseNumber(process.env.CODEX_RETRY_DELAY_BASE, 1000),

  // Self-Correction
  SELF_CORRECT_MAX_ATTEMPTS: parseNumber(process.env.CODEX_SELF_CORRECT_ATTEMPTS, 3),

  // Runtime Modes
  YOLO_MODE: yoloMode,
  RISK_BLOCKING: parseBoolean(process.env.HYDRA_RISK_BLOCKING, !yoloMode),
  STREAMING_ENABLED: parseBoolean(process.env.CODEX_STREAMING, false),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

/**
 * Validate that required configuration is present
 */
export function validateConfig() {
  const errors = [];

  if (!CONFIG.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get masked API key for logging
 */
export function getMaskedApiKey() {
  if (!CONFIG.OPENAI_API_KEY) return 'not set';
  const key = CONFIG.OPENAI_API_KEY;
  if (key.length < 8) return '***';
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}
