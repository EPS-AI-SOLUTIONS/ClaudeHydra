/**
 * Jules CLI Configuration
 * Google Async Coding Agent - Environment Configuration
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
  // API Version
  API_VERSION: process.env.API_VERSION || 'v1',

  // Google/Jules Configuration
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  JULES_API_URL: process.env.JULES_API_URL || 'https://jules.google/api/v1',

  // GitHub Integration
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_DEFAULT_OWNER: process.env.GITHUB_DEFAULT_OWNER || '',
  GITHUB_DEFAULT_REPO: process.env.GITHUB_DEFAULT_REPO || '',

  // Task Queue Configuration
  TASK_STORE_DIR: process.env.TASK_STORE_DIR || './tasks',
  TASK_MAX_CONCURRENT: parseNumber(process.env.TASK_MAX_CONCURRENT, 5),
  TASK_DEFAULT_TIMEOUT_MS: parseNumber(process.env.TASK_DEFAULT_TIMEOUT_MS, 300000), // 5 min
  TASK_POLL_INTERVAL_MS: parseNumber(process.env.TASK_POLL_INTERVAL_MS, 5000),
  TASK_MAX_RETRIES: parseNumber(process.env.TASK_MAX_RETRIES, 3),
  TASK_RETENTION_HOURS: parseNumber(process.env.TASK_RETENTION_HOURS, 24),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Runtime Modes
  SIMULATION_MODE: parseBoolean(process.env.JULES_SIMULATION_MODE, true), // Simulate Jules API
  GITHUB_ENABLED: parseBoolean(process.env.GITHUB_ENABLED, true),

  // Health Check
  HEALTH_CHECK_TIMEOUT_MS: parseNumber(process.env.HEALTH_CHECK_TIMEOUT_MS, 5000)
};
