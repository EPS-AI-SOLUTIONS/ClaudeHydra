/**
 * @fileoverview Unified Cache Module — Barrel Export
 *
 * Central entry point for the ClaudeHydra cache system.
 * Import from 'src/cache/index.js' (or 'src/cache') for all cache needs.
 *
 * @module cache
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import { BaseCache, createCache, modelCache } from '../cache/index.js';
 * import type { ICache, CacheStats } from '../cache/index.js';
 * ```
 */

// ============================================================================
// Interface & Types
// ============================================================================

export type {
  CacheConfig,
  CacheFactory,
  CacheSetOptions,
  CacheStats,
  ICache,
  IFetchCache,
  IStaleCachePolicy,
  StaleResult,
  TTLCacheConfig,
} from './ICache.js';

export { DEFAULT_CACHE_CONFIG } from './ICache.js';

// ============================================================================
// Implementation
// ============================================================================

export {
  BaseCache,
  createCache,
  modelCache,
  responseCache,
  symbolCache,
} from './BaseCache.js';

// ============================================================================
// Default Export
// ============================================================================

export { BaseCache as default } from './BaseCache.js';
