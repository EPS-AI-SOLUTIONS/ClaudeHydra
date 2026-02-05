/**
 * HYDRA Core Module Index
 * Exports all core utilities and abstractions
 */

// Interfaces and base classes
export {
  BaseProvider,
  ProviderRegistry,
  Types
} from './interfaces.js';

// Retry logic and circuit breaker
export {
  withRetry,
  createRetryable,
  isRetryableError,
  calculateDelay,
  sleep,
  CircuitBreaker,
  CircuitState,
  DEFAULT_RETRY_CONFIG
} from './retry.js';

// Connection pooling and rate limiting
export {
  ConnectionPool,
  RateLimiter,
  ManagedPool,
  DEFAULT_POOL_CONFIG
} from './pool.js';

// Caching
export {
  TTLCache,
  HealthCheckCache,
  memoize,
  DEFAULT_CACHE_CONFIG
} from './cache.js';

// Statistics and metrics
export {
  RollingStats,
  TimeSeriesMetrics,
  Counter,
  Histogram,
  StatsCollector,
  getStatsCollector
} from './stats.js';

// Configuration management
export {
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  Schemas,
  DEFAULT_CONFIG
} from './config.js';

// Error handling
export {
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
} from './errors.js';
