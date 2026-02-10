/**
 * @fileoverview Centralized constants for GeminiCLI (Hydra)
 * Provides type-safe, well-organized configuration constants with JSDoc documentation.
 * @module constants
 */

import { join } from 'node:path';

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Available AI model identifiers organized by capability
 * @readonly
 * @enum {string}
 */
export const Models = Object.freeze({
  /** Fast inference model for quick responses */
  FAST: 'llama3.2:1b',
  /** Core general-purpose model */
  CORE: 'llama3.2:3b',
  /** Specialized coding model */
  CODE: 'qwen2.5-coder:1.5b',
  /** Analysis and reasoning model */
  ANALYSIS: 'phi3:mini',
  /** Text embedding model */
  EMBEDDING: 'nomic-embed-text',
});

/**
 * Model capabilities and their recommended models
 * @readonly
 */
export const ModelCapabilities = Object.freeze({
  GENERATION: [Models.FAST, Models.CORE, Models.ANALYSIS],
  CODE_COMPLETION: [Models.CODE],
  CODE_ANALYSIS: [Models.CODE, Models.ANALYSIS],
  EMBEDDING: [Models.EMBEDDING],
  SUMMARIZATION: [Models.CORE, Models.ANALYSIS],
  CHAT: [Models.CORE, Models.FAST],
});

/**
 * Default model parameters
 * @readonly
 */
export const ModelDefaults = Object.freeze({
  TEMPERATURE: 0.7,
  TOP_P: 0.9,
  TOP_K: 40,
  MAX_TOKENS: 4096,
  CONTEXT_WINDOW: 4096,
});

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Swarm agent identifiers (Witcher-themed)
 * @readonly
 * @enum {string}
 */
export const Agents = Object.freeze({
  GERALT: 'Geralt',
  YENNEFER: 'Yennefer',
  TRISS: 'Triss',
  JASKIER: 'Jaskier',
  VESEMIR: 'Vesemir',
  CIRI: 'Ciri',
  ESKEL: 'Eskel',
  LAMBERT: 'Lambert',
  ZOLTAN: 'Zoltan',
  REGIS: 'Regis',
  DIJKSTRA: 'Dijkstra',
  PHILIPPA: 'Philippa',
});

/**
 * Agent role assignments
 * @readonly
 */
export const AgentRoles = Object.freeze({
  [Agents.GERALT]: {
    role: 'coordinator',
    model: Models.CORE,
    description: 'Main coordinator and decision maker',
  },
  [Agents.YENNEFER]: {
    role: 'analyst',
    model: Models.ANALYSIS,
    description: 'Deep analysis and reasoning',
  },
  [Agents.TRISS]: { role: 'coder', model: Models.CODE, description: 'Code generation and review' },
  [Agents.JASKIER]: {
    role: 'writer',
    model: Models.CORE,
    description: 'Documentation and creative writing',
  },
  [Agents.VESEMIR]: {
    role: 'reviewer',
    model: Models.ANALYSIS,
    description: 'Quality review and validation',
  },
  [Agents.CIRI]: {
    role: 'fast',
    model: Models.FAST,
    description: 'Quick responses and simple tasks',
  },
  [Agents.ESKEL]: {
    role: 'tester',
    model: Models.CODE,
    description: 'Test generation and validation',
  },
  [Agents.LAMBERT]: {
    role: 'debugger',
    model: Models.CODE,
    description: 'Debugging and error analysis',
  },
  [Agents.ZOLTAN]: {
    role: 'optimizer',
    model: Models.ANALYSIS,
    description: 'Performance optimization',
  },
  [Agents.REGIS]: { role: 'security', model: Models.ANALYSIS, description: 'Security analysis' },
  [Agents.DIJKSTRA]: { role: 'architect', model: Models.CORE, description: 'System architecture' },
  [Agents.PHILIPPA]: {
    role: 'researcher',
    model: Models.ANALYSIS,
    description: 'Research and information gathering',
  },
});

// ============================================================================
// Path Configuration
// ============================================================================

/**
 * Directory paths relative to project root
 * @readonly
 */
export const Paths = Object.freeze({
  /** Memory storage directory */
  MEMORY_DIR: '.serena/memories',
  /** Log files directory */
  LOG_DIR: '.hydra-data/logs',
  /** Configuration directory */
  CONFIG_DIR: '.gemini',
  /** Temporary files directory */
  TEMP_DIR: '.gemini/tmp',
  /** Cache directory */
  CACHE_DIR: 'cache',
  /** Audit log directory */
  AUDIT_DIR: '.hydra-data/audit',
});

/**
 * Get absolute path from relative path constant
 * @param {string} relativePath - Relative path from Paths constant
 * @param {string} [basePath=process.cwd()] - Base path (defaults to cwd)
 * @returns {string} Absolute path
 */
export function resolvePath(relativePath, basePath = process.cwd()) {
  return join(basePath, relativePath);
}

// ============================================================================
// Timing & Limits Configuration
// ============================================================================

/**
 * Default timeout values in milliseconds
 * @readonly
 */
export const Timeouts = Object.freeze({
  /** Default operation timeout */
  DEFAULT: 30_000,
  /** Short timeout for quick operations */
  SHORT: 5_000,
  /** Long timeout for complex operations */
  LONG: 120_000,
  /** API call timeout */
  API: 60_000,
  /** Health check timeout */
  HEALTH_CHECK: 5_000,
  /** Shell command timeout */
  SHELL: 30_000,
  /** File operation timeout */
  FILE: 10_000,
});

/**
 * Retry configuration
 * @readonly
 */
export const Retry = Object.freeze({
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
  /** Base delay between retries (ms) */
  BASE_DELAY: 1_000,
  /** Maximum delay between retries (ms) */
  MAX_DELAY: 30_000,
  /** Backoff multiplier */
  BACKOFF_FACTOR: 2,
});

/**
 * Rate limiting configuration
 * @readonly
 */
export const RateLimits = Object.freeze({
  /** Maximum concurrent requests */
  MAX_CONCURRENT: 10,
  /** Requests per minute */
  REQUESTS_PER_MINUTE: 60,
  /** Token bucket size */
  BUCKET_SIZE: 10,
  /** Token refill rate per second */
  REFILL_RATE: 2,
});

/**
 * Size limits
 * @readonly
 */
export const SizeLimits = Object.freeze({
  /** Maximum prompt length in characters */
  MAX_PROMPT_LENGTH: 100_000,
  /** Maximum file size for processing (bytes) */
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  /** Maximum log file size before rotation (bytes) */
  MAX_LOG_SIZE: 50 * 1024 * 1024, // 50MB
  /** Maximum memory entries */
  MAX_MEMORY_ENTRIES: 1000,
  /** Maximum context window tokens */
  MAX_CONTEXT_TOKENS: 128_000,
});

// ============================================================================
// Cache Configuration
// ============================================================================

/**
 * Cache time-to-live values in milliseconds
 * @readonly
 */
export const CacheTTL = Object.freeze({
  /** Model list cache */
  MODELS: 3600_000, // 1 hour
  /** API response cache */
  API_RESPONSE: 300_000, // 5 minutes
  /** Configuration cache */
  CONFIG: 60_000, // 1 minute
  /** Health status cache */
  HEALTH: 30_000, // 30 seconds
});

// ============================================================================
// Security Configuration
// ============================================================================

/**
 * Security-related constants
 * @readonly
 *
 * NOTE: DANGEROUS_PATTERNS have been moved to src/security/patterns.js
 * for more comprehensive security pattern management. This export is
 * maintained for backward compatibility.
 *
 * For new code, import from './security/patterns.js' instead:
 * ```js
 * import { DANGEROUS_PATTERNS, BLOCKED_COMMANDS, SENSITIVE_PATTERNS } from './security/patterns.js';
 * ```
 */
export const Security = Object.freeze({
  /** Audit log severity levels */
  SEVERITY: Object.freeze({
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL',
  }),

  /** Audit event types */
  EVENT_TYPES: Object.freeze({
    SHELL_COMMAND: 'SHELL_COMMAND',
    FILE_ACCESS: 'FILE_ACCESS',
    API_CALL: 'API_CALL',
    AUTH_EVENT: 'AUTH_EVENT',
    CONFIG_CHANGE: 'CONFIG_CHANGE',
    SECURITY_EVENT: 'SECURITY_EVENT',
    TOOL_EXECUTION: 'TOOL_EXECUTION',
  }),

  /**
   * Dangerous shell patterns to flag
   * @deprecated Use DANGEROUS_PATTERNS from './security/patterns.js' instead
   */
  DANGEROUS_PATTERNS: Object.freeze([
    /rm\s+-rf?\s+[/~]/i,
    /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // Fork bomb
    />\s*\/dev\/sd[a-z]/i,
    /mkfs/i,
    /dd\s+if=/i,
    /chmod\s+777/i,
    /curl.*\|\s*(?:ba)?sh/i,
    /wget.*\|\s*(?:ba)?sh/i,
  ]),
});

// ============================================================================
// HTTP Status Codes
// ============================================================================

/**
 * Common HTTP status codes
 * @readonly
 */
export const HttpStatus = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
});

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Environment variable names
 * @readonly
 */
export const EnvVars = Object.freeze({
  API_KEY: 'GEMINI_API_KEY',
  DEBUG: 'DEBUG',
  NODE_ENV: 'NODE_ENV',
  LOG_LEVEL: 'LOG_LEVEL',
  YOLO_MODE: 'HYDRA_YOLO',
  CACHE_DIR: 'CACHE_DIR',
  CONFIG_PATH: 'GEMINI_CONFIG_PATH',
});

// ============================================================================
// Backward Compatibility Exports
// ============================================================================

/**
 * @deprecated Use Models instead
 */
export const MODELS = Models;

/**
 * @deprecated Use Agents instead
 */
export const AGENTS = Agents;

/**
 * @deprecated Use Paths instead
 */
export const PATHS = Paths;

/**
 * @deprecated Use individual constant objects instead
 */
export const DEFAULTS = Object.freeze({
  TIMEOUT_MS: Timeouts.DEFAULT,
  MAX_RETRIES: Retry.MAX_RETRIES,
  CONTEXT_WINDOW: ModelDefaults.CONTEXT_WINDOW,
});
