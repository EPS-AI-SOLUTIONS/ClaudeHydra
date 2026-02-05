/**
 * @fileoverview HYDRA Tools - Central Integration Module
 *
 * Provides unified access to all HYDRA subsystems and utilities.
 * This is the recommended entry point for external integrations.
 *
 * @module hydra-tools
 * @version 2.0.0
 */

// ============================================================================
// HYDRA Core System
// ============================================================================

export {
  // Main Hydra class and singleton
  Hydra,
  getHydra,
  resetHydra,

  // Providers
  getOllamaProvider,
  getGeminiProvider,

  // Pipeline utilities
  route,
  routeWithCost,
  execute,
  quickExecute,
  TASK_CATEGORIES,

  // Legacy clients
  ollama,
  gemini,

  // Configuration
  DEFAULT_CONFIG,
  getConfigManager
} from './hydra/index.js';

// ============================================================================
// HYDRA Core Utilities
// ============================================================================

export {
  // Interfaces and base classes
  BaseProvider,
  ProviderRegistry,
  Types,

  // Retry logic and circuit breaker
  withRetry,
  createRetryable,
  isRetryableError,
  calculateDelay,
  sleep as retrySleep,
  CircuitBreaker,
  CircuitState,
  DEFAULT_RETRY_CONFIG,

  // Connection pooling and rate limiting
  ConnectionPool,
  RateLimiter,
  ManagedPool,
  DEFAULT_POOL_CONFIG,

  // Caching (from core)
  TTLCache,
  HealthCheckCache,
  memoize,
  DEFAULT_CACHE_CONFIG,

  // Statistics and metrics
  RollingStats,
  TimeSeriesMetrics,
  Counter,
  Histogram,
  StatsCollector,
  getStatsCollector,

  // Configuration management
  ConfigManager,
  resetConfigManager,
  Schemas,

  // Error handling
  HydraError,
  ProviderError,
  OllamaError,
  GeminiError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
  RoutingError,
  PipelineError,
  RateLimitError,
  CircuitOpenError,
  ValidationError,
  PoolExhaustedError,
  AggregateError,
  ErrorHandler,
  normalizeError,
  isRetryable,
  isRecoverable,
  getErrorCode
} from './hydra/core/index.js';

// ============================================================================
// Cache System (LRU-based)
// ============================================================================

export {
  // Cache Manager
  CacheManager,
  getCacheManager,
  initializeCache,

  // LRU Cache class
  LRUCache,
  CacheStats,

  // Legacy cache functions (backwards compatible)
  hashKey,
  getCache,
  getCacheAsync,
  setCache,
  setCacheAsync,
  getCacheStats,
  getCacheStatsAsync
} from './cache.js';

// ============================================================================
// Health Check System
// ============================================================================

export {
  createHealthCheck,
  geminiHealth
} from './health.js';

// ============================================================================
// Logger with Correlation ID Support
// ============================================================================

export {
  // Logger factory
  createLogger,
  configureLogger,
  getLoggerConfig,

  // Correlation ID support
  generateCorrelationId,
  withCorrelationId,
  correlationMiddleware,

  // Logger class and utilities
  Logger,
  LogLevels,
  COLORS
} from './logger.js';

// ============================================================================
// Security Module
// ============================================================================

export {
  // Pattern checking
  DANGEROUS_PATTERNS,
  BLOCKED_COMMANDS,
  SENSITIVE_PATTERNS,
  DANGEROUS_PATH_PATTERNS,
  SUSPICIOUS_NETWORK_PATTERNS,
  SHELL_ESCAPE_CHARS,
  RiskLevel,
  PATTERN_RISK_LEVELS,
  matchesAnyPattern,
  getMatchingPatterns,
  isBlockedCommand,
  isSensitivePath,
  isDangerousPath,

  // Security enforcer
  SecurityEnforcer,
  getSecurityEnforcer,
  resetSecurityEnforcer,
  isCommandSafe,
  isPathSafe,

  // Audit logging
  AuditLogger,
  auditLoggerReady,
  auditChildLogger,

  // Convenience functions
  checkCommand,
  checkPath,
  assessRisk,
  logSecurityEvent,
  logCommand,
  initializeSecurity
} from './security/index.js';

// ============================================================================
// Utility Functions - String
// ============================================================================

export {
  generateId,
  shortId as stringShortId,
  normalize,
  sanitize,
  truncate,
  toTitleCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  pad,
  stripAnsi,
  wordCount,
  escapeRegex,
  escapeHtml,
  isBlank,
  slugify
} from './utils/string.js';

// ============================================================================
// Utility Functions - Filesystem
// ============================================================================

export {
  ensureDir,
  ensureParentDir,
  safeRead,
  safeReadJson,
  safeWrite,
  safeWriteJson,
  exists,
  isDirectory,
  isFile,
  getFileSize,
  listFiles,
  safeDelete,
  safeDeleteDir,
  copyFile,
  moveFile,
  getAbsolutePath
} from './utils/fs.js';

// ============================================================================
// Utility Functions - Time
// ============================================================================

export {
  formatDate,
  formatLocalDate,
  formatRelative,
  formatDuration,
  sleep,
  timeout,
  withTimeout,
  debounce,
  throttle,
  now,
  nowSeconds,
  parseDuration
} from './utils/time.js';

// ============================================================================
// Utility Functions - Object
// ============================================================================

export {
  deepClone,
  deepMerge,
  pick,
  omit,
  get,
  set,
  flatten as flattenObject,
  deepEqual
} from './utils/object.js';

// ============================================================================
// Utility Functions - Array
// ============================================================================

export {
  chunk,
  unique,
  groupBy,
  sortBy,
  shuffle,
  flatten as flattenArray,
  take,
  takeLast,
  compact,
  difference,
  intersection,
  union,
  partition,
  find,
  sum,
  average
} from './utils/array.js';

// ============================================================================
// Utility Functions - Validation
// ============================================================================

export {
  isEmail,
  isUrl,
  isUuid,
  isJson,
  isEmpty,
  isNil,
  isDefined,
  isObject,
  isArray,
  isString,
  isNumber,
  isInteger,
  isPositive,
  isNonNegative,
  isBoolean,
  isFunction,
  isDate,
  matches,
  inRange,
  hasMinLength,
  hasMaxLength,
  assert,
  validate
} from './utils/validation.js';

// ============================================================================
// Utility Functions - Crypto
// ============================================================================

export {
  hash,
  simpleHash,
  generateToken,
  generateUrlSafeToken,
  generateUuid,
  shortId,
  hashObject,
  combineHash,
  hashPassword,
  verifyPassword,
  hmac
} from './utils/crypto.js';

// ============================================================================
// Utility Functions - Environment
// ============================================================================

export {
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
  parseEnvCustom
} from './utils/env.js';

// ============================================================================
// Convenience Re-exports (Grouped Objects)
// ============================================================================

import * as hydra from './hydra/index.js';
import * as core from './hydra/core/index.js';
import * as cache from './cache.js';
import * as health from './health.js';
import * as logger from './logger.js';
import * as security from './security/index.js';
import * as utils from './utils/index.js';

/**
 * Grouped module exports for namespace access
 */
export const modules = {
  hydra,
  core,
  cache,
  health,
  logger,
  security,
  utils
};

// ============================================================================
// Default Export - Full Toolbox
// ============================================================================

/**
 * HYDRA Tools default export
 * Provides convenient access to commonly used functions
 */
export default {
  // HYDRA main
  getHydra,
  resetHydra,

  // Providers
  getOllamaProvider,
  getGeminiProvider,

  // Pipeline
  route,
  routeWithCost,
  execute,
  quickExecute,

  // Cache
  getCacheManager,
  initializeCache,
  getCache,
  setCache,

  // Health
  createHealthCheck,
  geminiHealth,

  // Logger
  createLogger,
  generateCorrelationId,
  withCorrelationId,
  correlationMiddleware,

  // Security
  getSecurityEnforcer,
  checkCommand,
  checkPath,
  assessRisk,

  // Config
  getConfigManager,

  // Stats
  getStatsCollector,

  // Modules (grouped)
  modules
};
