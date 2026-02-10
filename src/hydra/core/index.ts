/**
 * HYDRA Core Module Index
 * Exports core utilities that are still in active use
 */

// Configuration management
export {
  ConfigManager,
  DEFAULT_CONFIG,
  getConfigManager,
  resetConfigManager,
  Schemas,
} from './config.js';
// Configuration schemas (granular access)
export {
  CacheConfigSchema,
  GeminiConfigSchema,
  HydraConfigSchema,
  LlamaCppConfigSchema,
  PipelineConfigSchema,
  ProviderConfigSchema,
  RouterConfigSchema,
  StatsConfigSchema,
} from './config-schemas.js';
// Error hierarchy (used by pipeline/executor)
export {
  CircuitOpenError,
  GeminiError,
  HydraError,
  OllamaError,
  PipelineError,
  PoolExhaustedError,
  ProviderError,
  RoutingError,
} from './errors.js';
// Connection pool (used by swarm/protocol)
export { ConnectionPool } from './pool.js';
// Statistics and metrics
export {
  Counter,
  getStatsCollector,
  Histogram,
  RollingStats,
  StatsCollector,
  TimeSeriesMetrics,
} from './stats.js';
