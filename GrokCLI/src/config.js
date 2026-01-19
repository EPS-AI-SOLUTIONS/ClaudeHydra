/**
 * GrokCLI Configuration
 * xAI Grok API configuration and environment variables
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

export const CONFIG = {
  // xAI API Configuration
  XAI_API_KEY: process.env.XAI_API_KEY || '',
  API_BASE_URL: process.env.XAI_API_BASE_URL || 'https://api.x.ai/v1',

  // Model Configuration
  DEFAULT_MODEL: process.env.GROK_DEFAULT_MODEL || 'grok-3',
  FAST_MODEL: process.env.GROK_FAST_MODEL || 'grok-3-fast',
  VISION_MODEL: process.env.GROK_VISION_MODEL || 'grok-2-vision-1212',

  // API Version
  API_VERSION: process.env.GROK_API_VERSION || 'v1',

  // Request Configuration
  DEFAULT_TEMPERATURE: parseNumber(process.env.GROK_TEMPERATURE, 0.7),
  DEFAULT_MAX_TOKENS: parseNumber(process.env.GROK_MAX_TOKENS, 4096),
  REQUEST_TIMEOUT_MS: parseNumber(process.env.GROK_TIMEOUT_MS, 120000),
  MAX_RETRIES: parseNumber(process.env.GROK_MAX_RETRIES, 3),
  RETRY_DELAY_BASE: parseNumber(process.env.GROK_RETRY_DELAY_BASE, 1000),

  // Streaming Configuration
  STREAM_ENABLED: parseBoolean(process.env.GROK_STREAM_ENABLED, true),

  // Rate Limiting
  RATE_LIMIT_REQUESTS_PER_MINUTE: parseNumber(process.env.GROK_RATE_LIMIT_RPM, 60),
  RATE_LIMIT_TOKENS_PER_MINUTE: parseNumber(process.env.GROK_RATE_LIMIT_TPM, 100000),

  // Features
  REALTIME_ENABLED: parseBoolean(process.env.GROK_REALTIME_ENABLED, true),
  DEEPSEARCH_ENABLED: parseBoolean(process.env.GROK_DEEPSEARCH_ENABLED, true),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Server
  SERVER_NAME: 'grok-hydra',
  SERVER_VERSION: '1.0.0'
};

/**
 * Validate configuration
 */
export const validateConfig = () => {
  const errors = [];

  if (!CONFIG.XAI_API_KEY) {
    errors.push('XAI_API_KEY is required. Set it in environment variables.');
  }

  if (!CONFIG.API_BASE_URL) {
    errors.push('API_BASE_URL is required.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Get sanitized config for display (hides API key)
 */
export const getSanitizedConfig = () => {
  return {
    ...CONFIG,
    XAI_API_KEY: CONFIG.XAI_API_KEY ? '***configured***' : '***missing***'
  };
};

export default CONFIG;
