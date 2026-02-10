/**
 * Environment Utilities
 * @module utils/env
 */

/**
 * Get an environment variable value
 * @param {string} key - Environment variable name
 * @param {string} [defaultValue] - Default value if not set
 * @returns {string|undefined} Environment variable value or default
 */
export function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Get a required environment variable, throwing if not set
 * @param {string} key - Environment variable name
 * @param {string} [errorMessage] - Custom error message
 * @returns {string} Environment variable value
 * @throws {Error} If environment variable is not set
 */
export function requireEnv(key, errorMessage) {
  const value = process.env[key];

  if (value === undefined || value === '') {
    throw new Error(errorMessage || `Required environment variable '${key}' is not set`);
  }

  return value;
}

/**
 * Parse an environment variable as a boolean
 * @param {string} key - Environment variable name
 * @param {boolean} [defaultValue=false] - Default value if not set
 * @returns {boolean} Parsed boolean value
 */
export function parseEnvBool(key, defaultValue = false) {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  const lowered = value.toLowerCase().trim();

  if (['true', '1', 'yes', 'on', 'enabled'].includes(lowered)) {
    return true;
  }

  if (['false', '0', 'no', 'off', 'disabled', ''].includes(lowered)) {
    return false;
  }

  return defaultValue;
}

/**
 * Parse an environment variable as a number
 * @param {string} key - Environment variable name
 * @param {number} [defaultValue=0] - Default value if not set or invalid
 * @returns {number} Parsed number value
 */
export function parseEnvNumber(key, defaultValue = 0) {
  const value = process.env[key];

  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse an environment variable as an integer
 * @param {string} key - Environment variable name
 * @param {number} [defaultValue=0] - Default value if not set or invalid
 * @returns {number} Parsed integer value
 */
export function parseEnvInt(key, defaultValue = 0) {
  const value = process.env[key];

  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse an environment variable as a JSON object
 * @param {string} key - Environment variable name
 * @param {*} [defaultValue=null] - Default value if not set or invalid
 * @returns {*} Parsed JSON value or default
 */
export function parseEnvJson(key, defaultValue = null) {
  const value = process.env[key];

  if (value === undefined || value === '') {
    return defaultValue;
  }

  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

/**
 * Parse an environment variable as a comma-separated list
 * @param {string} key - Environment variable name
 * @param {string[]} [defaultValue=[]] - Default value if not set
 * @param {string} [separator=','] - List separator
 * @returns {string[]} Parsed array
 */
export function parseEnvList(key, defaultValue = [], separator = ',') {
  const value = process.env[key];

  if (value === undefined || value === '') {
    return defaultValue;
  }

  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * Check if running in production environment
 * @returns {boolean} True if production
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development environment
 * @returns {boolean} True if development
 */
export function isDevelopment() {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Check if running in test environment
 * @returns {boolean} True if test
 */
export function isTest() {
  return process.env.NODE_ENV === 'test';
}

/**
 * Get current environment name
 * @returns {string} Environment name
 */
export function getEnvironment() {
  return process.env.NODE_ENV || 'development';
}

/**
 * Set an environment variable
 * @param {string} key - Environment variable name
 * @param {string|number|boolean} value - Value to set
 */
export function setEnv(key, value) {
  process.env[key] = String(value);
}

/**
 * Delete an environment variable
 * @param {string} key - Environment variable name
 */
export function deleteEnv(key) {
  delete process.env[key];
}

/**
 * Check if an environment variable is set
 * @param {string} key - Environment variable name
 * @returns {boolean} True if set
 */
export function hasEnv(key) {
  return process.env[key] !== undefined;
}

/**
 * Get multiple environment variables at once
 * @param {string[]} keys - Environment variable names
 * @param {Object} [defaults={}] - Default values
 * @returns {Object} Object with environment values
 */
export function getEnvMultiple(keys, defaults = {}) {
  return keys.reduce((acc, key) => {
    acc[key] = getEnv(key, defaults[key]);
    return acc;
  }, {});
}

/**
 * Parse environment variable with a custom parser
 * @param {string} key - Environment variable name
 * @param {Function} parser - Parser function
 * @param {*} [defaultValue] - Default value if parsing fails
 * @returns {*} Parsed value or default
 */
export function parseEnvCustom(key, parser, defaultValue = undefined) {
  const value = process.env[key];

  if (value === undefined || value === '') {
    return defaultValue;
  }

  try {
    return parser(value);
  } catch {
    return defaultValue;
  }
}

export default {
  getEnv,
  requireEnv,
  parseEnvBool,
  parseEnvNumber,
  parseEnvInt,
  parseEnvJson,
  parseEnvList,
  isProduction,
  isDevelopment,
  isTest,
  getEnvironment,
  setEnv,
  deleteEnv,
  hasEnv,
  getEnvMultiple,
  parseEnvCustom,
};
