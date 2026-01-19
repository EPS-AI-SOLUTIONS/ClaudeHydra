/**
 * HYDRA Configuration Loader
 * Loads and validates hydra.config.json with defaults and env expansion
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CONFIG_PATH = join(REPO_ROOT, 'hydra.config.json');

/**
 * Default configuration values
 */
const DEFAULTS = {
  version: '1.0',
  ollama: {
    host: 'http://localhost:11434',
    defaultModel: 'llama3.2',
    fallbackModels: ['mistral', 'gemma2'],
    startupTimeout: 10000,
    healthCheckInterval: 5000,
  },
  watchdog: {
    enabled: false,
    checkInterval: 30000,
    maxRestarts: 5,
    restartDelay: 5000,
    notifyOnRestart: true,
  },
  launcher: {
    preferWindowsTerminal: true,
    terminalProfile: 'Gemini CLI (HYDRA)',
    cleanLocksOnStart: true,
    showBanner: true,
    yoloMode: false,
  },
  logging: {
    level: 'info',
    colorized: true,
    timestamps: false,
  },
  paths: {
    lockDirs: [
      '${USERPROFILE}/.gemini/locks',
      '${USERPROFILE}/.gemini/.locks',
      '${TEMP}/gemini-locks',
    ],
  },
  features: {
    autoStartOllama: true,
    autoPullModels: false,
    updateCheck: false,
  },
};

/**
 * Expand environment variables in a string
 * Supports ${VAR} and %VAR% syntax
 */
function expandEnvVars(str) {
  if (typeof str !== 'string') return str;

  // Expand ${VAR} syntax
  let result = str.replace(/\$\{(\w+)\}/g, (_, name) => {
    return process.env[name] || '';
  });

  // Expand %VAR% syntax (Windows style)
  result = result.replace(/%(\w+)%/g, (_, name) => {
    return process.env[name] || '';
  });

  return result;
}

/**
 * Deep expand environment variables in an object
 */
function expandEnvVarsDeep(obj) {
  if (typeof obj === 'string') {
    return expandEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVarsDeep);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsDeep(value);
    }
    return result;
  }
  return obj;
}

/**
 * Deep merge two objects (source into target)
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Load configuration from file
 */
function loadConfigFile(configPath = CONFIG_PATH) {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`[CONFIG] Error loading ${configPath}: ${error.message}`);
    return null;
  }
}

/**
 * Apply CLI overrides to config
 */
function applyCliOverrides(config, overrides = {}) {
  const result = { ...config };

  // Map CLI flags to config paths
  if (overrides.yolo !== undefined) {
    result.launcher = { ...result.launcher, yoloMode: overrides.yolo };
  }
  if (overrides.watchdog !== undefined) {
    result.watchdog = { ...result.watchdog, enabled: overrides.watchdog };
  }
  if (overrides.noBanner !== undefined) {
    result.launcher = { ...result.launcher, showBanner: !overrides.noBanner };
  }
  if (overrides.noColor !== undefined) {
    result.logging = { ...result.logging, colorized: !overrides.noColor };
  }
  if (overrides.host !== undefined) {
    result.ollama = { ...result.ollama, host: overrides.host };
  }
  if (overrides.model !== undefined) {
    result.ollama = { ...result.ollama, defaultModel: overrides.model };
  }
  if (overrides.logLevel !== undefined) {
    result.logging = { ...result.logging, level: overrides.logLevel };
  }

  return result;
}

/**
 * Parse CLI arguments into overrides object
 */
function parseCliArgs(args = process.argv.slice(2)) {
  const overrides = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--yolo':
      case '-Yolo':
        overrides.yolo = true;
        break;
      case '--watchdog':
      case '-w':
        overrides.watchdog = true;
        break;
      case '--no-banner':
        overrides.noBanner = true;
        break;
      case '--no-color':
        overrides.noColor = true;
        break;
      case '--host':
        overrides.host = args[++i];
        break;
      case '--model':
      case '-m':
        overrides.model = args[++i];
        break;
      case '--log-level':
        overrides.logLevel = args[++i];
        break;
    }
  }

  return overrides;
}

/**
 * Main config loader - combines defaults, file, env, and CLI
 */
export function loadConfig(cliOverrides = {}) {
  // 1. Start with defaults
  let config = { ...DEFAULTS };

  // 2. Merge file config if exists
  const fileConfig = loadConfigFile();
  if (fileConfig) {
    config = deepMerge(config, fileConfig);
  }

  // 3. Apply env overrides
  if (process.env.OLLAMA_HOST) {
    config.ollama.host = process.env.OLLAMA_HOST;
  }
  if (process.env.HYDRA_LOG_LEVEL) {
    config.logging.level = process.env.HYDRA_LOG_LEVEL;
  }
  if (process.env.HYDRA_YOLO === 'true') {
    config.launcher.yoloMode = true;
  }

  // 4. Apply CLI overrides
  config = applyCliOverrides(config, cliOverrides);

  // 5. Expand environment variables in paths
  config = expandEnvVarsDeep(config);

  return config;
}

/**
 * Load config with CLI args parsed automatically
 */
export function loadConfigWithCli() {
  const cliOverrides = parseCliArgs();
  return loadConfig(cliOverrides);
}

/**
 * Get a specific config value by dot-notation path
 */
export function getConfigValue(config, path, defaultValue = undefined) {
  const parts = path.split('.');
  let value = config;

  for (const part of parts) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    value = value[part];
  }

  return value !== undefined ? value : defaultValue;
}

// Export defaults for reference
export { DEFAULTS, CONFIG_PATH };
