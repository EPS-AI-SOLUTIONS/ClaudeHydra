/**
 * @fileoverview Unified Cache Interface & Types
 *
 * Provides a single, consistent contract for ALL cache implementations
 * in ClaudeHydra. Previously the codebase had 6+ independent LRU/TTL
 * implementations with incompatible APIs.
 *
 * This interface unifies:
 * - src/lru-cache.ts (LRUCache)
 * - src/cache.ts (LRUCache + CacheManager)
 * - src/hydra/core/cache.ts (TTLCache + HealthCheckCache)
 * - src/cli-unified/processing/CacheManager.ts (LRUCache)
 * - src/prompt-optimizer/analysis-cache.ts (AnalysisCache)
 * - src/memory.ts (MemoryCache)
 * - src/mcp/health-checker.ts (TTLCache)
 *
 * @module cache/ICache
 * @version 1.0.0
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Statistics tracked by all cache implementations
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of entries evicted due to capacity */
  evictions: number;
  /** Number of entries removed due to TTL expiration */
  expired: number;
  /** Hit rate as percentage (0-100) */
  hitRate: number;
  /** Current number of entries in cache */
  size: number;
}

/**
 * Options for cache entry creation
 */
export interface CacheSetOptions {
  /** Time-to-live in milliseconds (overrides default TTL) */
  ttlMs?: number;
}

/**
 * Configuration for cache construction
 */
export interface CacheConfig {
  /** Maximum number of entries (default: 100) */
  maxSize?: number;
  /** Default time-to-live in milliseconds (default: 300000 = 5 min) */
  defaultTtlMs?: number;
  /** Name for logging/identification */
  name?: string;
}

/**
 * Extended configuration for TTL cache with eviction policies
 */
export interface TTLCacheConfig extends CacheConfig {
  /** Eviction policy when cache is full */
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
  /** Return stale data while fetching fresh (default: false) */
  staleWhileRevalidate?: boolean;
}

/**
 * Result from a cache get that may be stale
 */
export interface StaleResult<T> {
  /** The cached value */
  value: T;
  /** Whether the value has expired but is returned as stale */
  stale: boolean;
}

// ============================================================================
// Core Interface
// ============================================================================

/**
 * ICache<T> — Unified cache interface
 *
 * All cache implementations in ClaudeHydra SHOULD implement this interface.
 * This ensures consistent API surface across:
 * - In-memory LRU caches
 * - TTL-based caches
 * - Health check caches
 * - Persistent (disk-backed) caches
 *
 * @template T - Type of cached values
 *
 * @example
 * ```typescript
 * class MyCache<T> implements ICache<T> {
 *   get(key: string): T | undefined { ... }
 *   set(key: string, value: T, options?: CacheSetOptions): void { ... }
 *   // ...
 * }
 * ```
 */
export interface ICache<T = any> {
  /**
   * Retrieve a value from the cache.
   * Returns `undefined` if key is not found or has expired.
   * Implementations SHOULD update recency on access (for LRU).
   *
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  get(key: string): T | undefined;

  /**
   * Store a value in the cache.
   * If the cache is full, the least-recently-used (or policy-defined) entry is evicted.
   * If the key already exists, the value and TTL are updated.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Optional per-entry settings (e.g., custom TTL)
   */
  set(key: string, value: T, options?: CacheSetOptions): void;

  /**
   * Check whether a key exists and is not expired.
   *
   * @param key - Cache key
   * @returns true if the key exists and has not expired
   */
  has(key: string): boolean;

  /**
   * Remove a specific entry from the cache.
   *
   * @param key - Cache key
   * @returns true if the entry existed and was removed
   */
  delete(key: string): boolean;

  /**
   * Remove all entries from the cache.
   */
  clear(): void;

  /**
   * Get the number of entries currently in the cache.
   */
  readonly size: number;

  /**
   * Get cache performance statistics.
   */
  getStats(): CacheStats;

  /**
   * Remove all expired entries.
   * @returns Number of entries removed
   */
  prune(): number;

  /**
   * Get all non-expired keys (most recent first for LRU).
   */
  keys(): string[];
}

/**
 * Extended interface for caches that support async fetch-through.
 * Useful for caches that back expensive operations (API calls, disk I/O).
 *
 * @template T - Type of cached values
 */
export interface IFetchCache<T = any> extends ICache<T> {
  /**
   * Get a value, or fetch it if not cached.
   * Stores the fetched value in the cache before returning.
   *
   * @param key - Cache key
   * @param fetcher - Async function that produces the value on cache miss
   * @param options - Optional per-entry settings
   * @returns The cached or freshly-fetched value
   */
  getOrFetch(key: string, fetcher: () => Promise<T>, options?: CacheSetOptions): Promise<T>;
}

/**
 * Extended interface for caches that support stale-while-revalidate.
 * Returns `{ value, stale }` instead of plain values.
 *
 * @template T - Type of cached values
 */
export interface IStaleCachePolicy<T = any> {
  /**
   * Get a value, potentially returning a stale result.
   * @param key - Cache key
   * @returns StaleResult with value and staleness flag, or undefined
   */
  getWithStale(key: string): StaleResult<T> | undefined;
}

// ============================================================================
// Factory Type
// ============================================================================

/**
 * Factory function signature for creating cache instances.
 * Used by modules that need to create caches without importing concrete classes.
 */
export type CacheFactory<T = any> = (config?: CacheConfig) => ICache<T>;

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default cache configuration values
 */
export const DEFAULT_CACHE_CONFIG: Required<CacheConfig> = {
  maxSize: 100,
  defaultTtlMs: 300_000, // 5 minutes
  name: 'unnamed',
};

export default ICache;
