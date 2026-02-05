/**
 * @fileoverview Environment Validator for GeminiCLI
 * Validates environment variables for Gemini and Ollama configurations.
 *
 * @module env-validator
 * @example
 * import { validateEnv, printEnvReport, assertEnv } from './env-validator.js';
 *
 * // Get validation result
 * const result = validateEnv();
 * if (!result.valid) {
 *   console.error('Missing:', result.missing);
 * }
 *
 * // Print formatted report
 * printEnvReport();
 *
 * // Throw on missing required vars
 * assertEnv();
 */

import 'dotenv/config';

// =============================================================================
// Constants
// =============================================================================

/**
 * Required environment variables with defaults
 * @readonly
 */
const REQUIRED_VARS = Object.freeze({
  OLLAMA_HOST: {
    default: 'http://localhost:11434',
    description: 'Ollama API endpoint URL',
    sensitive: false
  },
  DEFAULT_MODEL: {
    default: 'llama3.2:3b',
    description: 'Default LLM model for operations',
    sensitive: false
  }
});

/**
 * Optional sensitive environment variables (API keys, secrets)
 * @readonly
 */
const OPTIONAL_SENSITIVE_VARS = Object.freeze({
  GOOGLE_API_KEY: {
    description: 'Google AI API key',
    sensitive: true
  },
  GEMINI_API_KEY: {
    description: 'Gemini API key (alias for GOOGLE_API_KEY)',
    sensitive: true
  },
  CACHE_ENCRYPTION_KEY: {
    description: 'AES-256-GCM encryption key for cache',
    sensitive: true
  }
});

/**
 * Optional non-sensitive environment variables with defaults
 * @readonly
 */
const OPTIONAL_VARS = Object.freeze({
  CACHE_ENABLED: {
    default: 'true',
    description: 'Enable response caching',
    sensitive: false
  },
  CACHE_TTL: {
    default: '3600',
    description: 'Cache TTL in seconds',
    sensitive: false
  },
  LOG_LEVEL: {
    default: 'info',
    description: 'Logging verbosity level',
    sensitive: false
  },
  NODE_ENV: {
    default: 'development',
    description: 'Runtime environment',
    sensitive: false
  }
});

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Masks sensitive values, showing only first N characters
 *
 * @param {string} value - The value to mask
 * @param {number} [showChars=8] - Number of characters to show at the start
 * @returns {string} Masked value or placeholder if too short
 *
 * @example
 * maskSensitive('sk-1234567890abcdef', 4); // 'sk-1**************'
 * maskSensitive('abc', 8); // '***'
 */
export function maskSensitive(value, showChars = 8) {
  if (!value || typeof value !== 'string') {
    return '(not set)';
  }

  const len = value.length;

  // If value is shorter than showChars, mask entirely
  if (len <= showChars) {
    return '*'.repeat(len);
  }

  const visiblePart = value.substring(0, showChars);
  const maskedPart = '*'.repeat(len - showChars);

  return `${visiblePart}${maskedPart}`;
}

/**
 * Gets the effective value of an environment variable
 *
 * @param {string} name - Variable name
 * @param {string|undefined} defaultValue - Default value if not set
 * @returns {string|undefined} The effective value
 */
function getEnvValue(name, defaultValue) {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }
  return defaultValue;
}

/**
 * Checks if a value is considered "set" (not empty/undefined)
 *
 * @param {string|undefined} value - Value to check
 * @returns {boolean} True if value is set
 */
function isSet(value) {
  return value !== undefined && value !== null && value !== '';
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * @typedef {Object} EnvValidationResult
 * @property {boolean} valid - Whether all required variables are present
 * @property {string[]} missing - List of missing required variables
 * @property {string[]} warnings - List of warning messages
 * @property {Object<string, string>} masked - Object with masked sensitive values
 * @property {Object<string, string>} values - Object with all effective values (sensitive masked)
 */

/**
 * Validates all environment variables for Gemini + Ollama configuration
 *
 * @returns {EnvValidationResult} Validation result with status, missing vars, warnings, and masked values
 *
 * @example
 * const result = validateEnv();
 * if (!result.valid) {
 *   console.error('Missing required variables:', result.missing.join(', '));
 * }
 * if (result.warnings.length > 0) {
 *   result.warnings.forEach(w => console.warn(w));
 * }
 */
export function validateEnv() {
  const missing = [];
  const warnings = [];
  const masked = {};
  const values = {};

  // Check required variables
  for (const [name, config] of Object.entries(REQUIRED_VARS)) {
    const value = getEnvValue(name, config.default);

    if (!isSet(value)) {
      missing.push(name);
    } else {
      values[name] = config.sensitive ? maskSensitive(value) : value;
    }
  }

  // Check optional sensitive variables
  for (const [name, config] of Object.entries(OPTIONAL_SENSITIVE_VARS)) {
    const value = process.env[name];

    if (isSet(value)) {
      masked[name] = maskSensitive(value);
      values[name] = masked[name];
    } else {
      values[name] = '(not set)';
    }
  }

  // Check optional non-sensitive variables
  for (const [name, config] of Object.entries(OPTIONAL_VARS)) {
    const value = getEnvValue(name, config.default);
    values[name] = value;
  }

  // Generate warnings
  const hasGeminiKey = isSet(process.env.GEMINI_API_KEY) || isSet(process.env.GOOGLE_API_KEY);
  if (!hasGeminiKey) {
    warnings.push('No Gemini/Google API key configured - Gemini provider will be unavailable');
  }

  if (!isSet(process.env.CACHE_ENCRYPTION_KEY)) {
    warnings.push('CACHE_ENCRYPTION_KEY not set - cache will not be encrypted');
  }

  // Check OLLAMA_HOST connectivity hint
  const ollamaHost = getEnvValue('OLLAMA_HOST', REQUIRED_VARS.OLLAMA_HOST.default);
  if (ollamaHost && !ollamaHost.startsWith('http://') && !ollamaHost.startsWith('https://')) {
    warnings.push(`OLLAMA_HOST should include protocol (http:// or https://): ${ollamaHost}`);
  }

  // Check for conflicting API keys
  if (isSet(process.env.GEMINI_API_KEY) && isSet(process.env.GOOGLE_API_KEY)) {
    if (process.env.GEMINI_API_KEY !== process.env.GOOGLE_API_KEY) {
      warnings.push('Both GEMINI_API_KEY and GOOGLE_API_KEY are set with different values');
    }
  }

  // Validate LOG_LEVEL
  const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
  const logLevel = getEnvValue('LOG_LEVEL', OPTIONAL_VARS.LOG_LEVEL.default);
  if (logLevel && !validLogLevels.includes(logLevel.toLowerCase())) {
    warnings.push(`LOG_LEVEL '${logLevel}' is not a recognized level (valid: ${validLogLevels.join(', ')})`);
  }

  // Validate NODE_ENV
  const validEnvs = ['development', 'production', 'test'];
  const nodeEnv = getEnvValue('NODE_ENV', OPTIONAL_VARS.NODE_ENV.default);
  if (nodeEnv && !validEnvs.includes(nodeEnv.toLowerCase())) {
    warnings.push(`NODE_ENV '${nodeEnv}' is non-standard (typical: ${validEnvs.join(', ')})`);
  }

  // Validate CACHE_TTL is a positive number
  const cacheTtl = getEnvValue('CACHE_TTL', OPTIONAL_VARS.CACHE_TTL.default);
  if (cacheTtl) {
    const ttlNum = parseInt(cacheTtl, 10);
    if (isNaN(ttlNum) || ttlNum < 0) {
      warnings.push(`CACHE_TTL should be a positive number, got: ${cacheTtl}`);
    } else if (ttlNum === 0) {
      warnings.push('CACHE_TTL is 0 - caching will be effectively disabled');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    masked,
    values
  };
}

/**
 * Asserts that all required environment variables are present.
 * Throws an error if any required variables are missing.
 *
 * @throws {Error} If required environment variables are missing
 *
 * @example
 * try {
 *   assertEnv();
 *   // Proceed with application startup
 * } catch (err) {
 *   console.error(err.message);
 *   process.exit(1);
 * }
 */
export function assertEnv() {
  const result = validateEnv();

  if (!result.valid) {
    const missingList = result.missing
      .map(name => {
        const config = REQUIRED_VARS[name];
        return `  - ${name}: ${config?.description || 'Required variable'}`;
      })
      .join('\n');

    throw new Error(
      `Missing required environment variables:\n${missingList}\n\n` +
      'Set these variables in your .env file or environment.'
    );
  }
}

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Creates a horizontal line for the ASCII box
 * @param {number} width - Total width including corners
 * @param {string} left - Left corner character
 * @param {string} right - Right corner character
 * @param {string} fill - Fill character
 * @returns {string} Horizontal line
 */
function createLine(width, left, right, fill = '-') {
  return left + fill.repeat(width - 2) + right;
}

/**
 * Pads a string to a specific width
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @returns {string} Padded string
 */
function padRight(str, width) {
  const strLen = str.length;
  if (strLen >= width) return str.substring(0, width);
  return str + ' '.repeat(width - strLen);
}

/**
 * Creates a centered line for the ASCII box
 * @param {string} text - Text to center
 * @param {number} width - Total width
 * @returns {string} Centered line with borders
 */
function centerLine(text, width) {
  const innerWidth = width - 4; // Account for "| " and " |"
  const textLen = text.length;
  const leftPad = Math.floor((innerWidth - textLen) / 2);
  const rightPad = innerWidth - textLen - leftPad;
  return '| ' + ' '.repeat(leftPad) + text + ' '.repeat(rightPad) + ' |';
}

/**
 * Creates a left-aligned line for the ASCII box
 * @param {string} text - Text content
 * @param {number} width - Total width
 * @returns {string} Left-aligned line with borders
 */
function leftLine(text, width) {
  const innerWidth = width - 4;
  return '| ' + padRight(text, innerWidth) + ' |';
}

/**
 * Prints a formatted environment validation report to the console.
 * Displays all variables with their values (sensitive values masked),
 * status indicators, and any warnings.
 *
 * @param {Object} [options] - Report options
 * @param {boolean} [options.colors=true] - Use ANSI colors in output
 * @param {Function} [options.output=console.log] - Output function
 *
 * @example
 * // Print to console with colors
 * printEnvReport();
 *
 * // Print without colors (for logs)
 * printEnvReport({ colors: false });
 *
 * // Custom output function
 * printEnvReport({ output: (line) => writeToFile(line) });
 */
export function printEnvReport(options = {}) {
  const { colors = true, output = console.log } = options;
  const result = validateEnv();

  // ANSI color codes
  const c = colors ? {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
  } : {
    reset: '', bold: '', dim: '', green: '', yellow: '', red: '', cyan: '', magenta: ''
  };

  const boxWidth = 72;
  const line = createLine(boxWidth, '+', '+', '-');
  const doubleLine = createLine(boxWidth, '+', '+', '=');

  // Header
  output('');
  output(doubleLine);
  output(centerLine('ENVIRONMENT VALIDATION REPORT', boxWidth));
  output(centerLine('GeminiCLI - Gemini + Ollama', boxWidth));
  output(doubleLine);

  // Status summary
  const statusIcon = result.valid ? `${c.green}[OK]${c.reset}` : `${c.red}[FAIL]${c.reset}`;
  const statusText = result.valid ? 'All required variables configured' : `Missing ${result.missing.length} required variable(s)`;
  output(centerLine(`Status: ${colors ? statusIcon : (result.valid ? '[OK]' : '[FAIL]')} ${statusText}`, boxWidth));
  output(line);

  // Required variables section
  output(leftLine(`${c.bold}REQUIRED VARIABLES${c.reset}`, boxWidth));
  output(line);

  for (const [name, config] of Object.entries(REQUIRED_VARS)) {
    const value = getEnvValue(name, config.default);
    const isDefault = !isSet(process.env[name]);
    const status = isSet(value)
      ? (isDefault ? `${c.cyan}[default]${c.reset}` : `${c.green}[set]${c.reset}`)
      : `${c.red}[missing]${c.reset}`;

    const displayValue = config.sensitive ? maskSensitive(value) : (value || '(not set)');
    const statusPlain = isSet(value) ? (isDefault ? '[default]' : '[set]') : '[missing]';

    output(leftLine(`  ${name}`, boxWidth));
    output(leftLine(`    Value: ${displayValue}`, boxWidth));
    output(leftLine(`    Status: ${colors ? status : statusPlain}  |  ${config.description}`, boxWidth));
  }

  output(line);

  // Optional sensitive variables section
  output(leftLine(`${c.bold}OPTIONAL (SENSITIVE)${c.reset}`, boxWidth));
  output(line);

  for (const [name, config] of Object.entries(OPTIONAL_SENSITIVE_VARS)) {
    const value = process.env[name];
    const status = isSet(value)
      ? `${c.green}[set]${c.reset}`
      : `${c.dim}[not set]${c.reset}`;

    const displayValue = isSet(value) ? maskSensitive(value) : '(not set)';
    const statusPlain = isSet(value) ? '[set]' : '[not set]';

    output(leftLine(`  ${name}`, boxWidth));
    output(leftLine(`    Value: ${displayValue}`, boxWidth));
    output(leftLine(`    Status: ${colors ? status : statusPlain}  |  ${config.description}`, boxWidth));
  }

  output(line);

  // Optional non-sensitive variables section
  output(leftLine(`${c.bold}OPTIONAL (NON-SENSITIVE)${c.reset}`, boxWidth));
  output(line);

  for (const [name, config] of Object.entries(OPTIONAL_VARS)) {
    const value = getEnvValue(name, config.default);
    const isDefault = !isSet(process.env[name]);
    const status = isDefault
      ? `${c.cyan}[default]${c.reset}`
      : `${c.green}[set]${c.reset}`;

    const statusPlain = isDefault ? '[default]' : '[set]';

    output(leftLine(`  ${name}`, boxWidth));
    output(leftLine(`    Value: ${value}`, boxWidth));
    output(leftLine(`    Status: ${colors ? status : statusPlain}  |  ${config.description}`, boxWidth));
  }

  // Warnings section
  if (result.warnings.length > 0) {
    output(line);
    output(leftLine(`${c.yellow}${c.bold}WARNINGS${c.reset}`, boxWidth));
    output(line);

    for (const warning of result.warnings) {
      const warningIcon = colors ? `${c.yellow}!${c.reset}` : '!';
      // Split long warnings into multiple lines
      const maxLen = boxWidth - 8;
      if (warning.length > maxLen) {
        const words = warning.split(' ');
        let currentLine = `  ${warningIcon} `;
        for (const word of words) {
          if ((currentLine + word).length > maxLen) {
            output(leftLine(currentLine, boxWidth));
            currentLine = '    ' + word + ' ';
          } else {
            currentLine += word + ' ';
          }
        }
        if (currentLine.trim()) {
          output(leftLine(currentLine, boxWidth));
        }
      } else {
        output(leftLine(`  ${warningIcon} ${warning}`, boxWidth));
      }
    }
  }

  // Missing variables section (if any)
  if (result.missing.length > 0) {
    output(line);
    output(leftLine(`${c.red}${c.bold}MISSING REQUIRED${c.reset}`, boxWidth));
    output(line);

    for (const name of result.missing) {
      const config = REQUIRED_VARS[name];
      const errorIcon = colors ? `${c.red}X${c.reset}` : 'X';
      output(leftLine(`  ${errorIcon} ${name}`, boxWidth));
      if (config?.description) {
        output(leftLine(`    ${config.description}`, boxWidth));
      }
      if (config?.default) {
        output(leftLine(`    Default: ${config.default}`, boxWidth));
      }
    }
  }

  // Footer
  output(doubleLine);

  // Summary line
  const totalVars = Object.keys(REQUIRED_VARS).length +
                    Object.keys(OPTIONAL_SENSITIVE_VARS).length +
                    Object.keys(OPTIONAL_VARS).length;
  const setCount = Object.entries(result.values).filter(([, v]) => v !== '(not set)').length;

  output(centerLine(`Total: ${totalVars} variables | Configured: ${setCount} | Warnings: ${result.warnings.length}`, boxWidth));
  output(doubleLine);
  output('');
}

// =============================================================================
// Module Exports (for convenience)
// =============================================================================

/**
 * All variable definitions for external use
 */
export const ENV_DEFINITIONS = Object.freeze({
  required: REQUIRED_VARS,
  optionalSensitive: OPTIONAL_SENSITIVE_VARS,
  optional: OPTIONAL_VARS
});

/**
 * Quick check if environment is valid (for startup guards)
 * @returns {boolean} True if all required variables are set
 */
export function isEnvValid() {
  return validateEnv().valid;
}

/**
 * Get a specific environment variable with its default
 * @param {string} name - Variable name
 * @returns {string|undefined} Value or default
 */
export function getEnv(name) {
  const allVars = { ...REQUIRED_VARS, ...OPTIONAL_SENSITIVE_VARS, ...OPTIONAL_VARS };
  const config = allVars[name];
  return getEnvValue(name, config?.default);
}
