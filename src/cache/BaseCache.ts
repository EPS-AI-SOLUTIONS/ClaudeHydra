/**
 * @fileoverview BaseCache — Unified LRU + TTL Cache Implementation
 *
 * Consolidates the 6+ duplicate LRU cache implementations across ClaudeHydra
 * into a single, well-tested, doubly-linked-list-based LRU cache.
 *
 * Replaces:
 * - src/lru-cache.ts (LRUCache)          → Use BaseCache directly
 * - src/cache.ts (inner LRUCache)         → Use BaseCache + disk layer on top
 * - src/hydra/core/cache.ts (TTLCache)    → Use BaseCache
 * - src/cli-unified/processing/CacheManager.ts (inner LRUCache) → Use BaseCache
 * - src/memory.ts (MemoryCache)           → Use BaseCache
 * - src/mcp/health-checker.ts (TTLCache)  → Use BaseCache
 *
 * Features:
 * - O(1) get/set/delete via doubly-linked list + Map
 * - Per-entry TTL with lazy expiration
 * - Configurable max size
 * - Comprehensive statistics (hits, misses, evictions, expired)
 * - prune() for eager expiration cleanup
 * - getOrFetch() for async cache-aside pattern
 * - Implements ICache<T> and IFetchCache<T> interfaces
 *
 * @module cache/BaseCache
 * @version 1.0.0
 */

import type { CacheConfig, CacheSetOptions, CacheStats, ICache, IFetchCache } from './ICache.js';
import { DEFAULT_CACHE_CONFIG } from './ICache.js';

// ============================================================================
// Internal: Doubly-Linked List Node
// ============================================================================

/**
 * Node in the LRU doubly-linked list.
 * @internal
 */
class LRUNode<T> {
  key: string;
  value: T;
  expiresAt: number;
  createdAt: number;
  prev: LRUNode<T> | null = null;
  next: LRUNode<T> | null = null;

  constructor(key: string, value: T, expiresAt: number) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.createdAt = Date.now();
  }
}

// ============================================================================
// BaseCache
// ============================================================================

/**
 * BaseCache<T> — The single canonical LRU+TTL cache for ClaudeHydra.
 *
 * Implements both ICache<T> and IFetchCache<T>.
 *
 * All new cache instances in the project should use this class
 * (or a thin wrapper around it for domain-specific logic).
 *
 * @template T - Type of cached values
 *
 * @example
 * ```typescript
 * import { BaseCache } from '../cache/BaseCache.js';
 *
 * const cache = new BaseCache<string>({ maxSize: 200, defaultTtlMs: 60_000 });
 * cache.set('key', 'value');
 * const val = cache.get('key'); // 'value'
 * ```
 *
 * @example Async fetch-through
 * ```typescript
 * const data = await cache.getOrFetch('api-result', async () => {
 *   return fetch('/api/data').then(r => r.json());
 * });
 * ```
 */
export class BaseCache<T = any> implements ICache<T>, IFetchCache<T> {
  // Config
  private readonly _maxSize: number;
  private readonly _defaultTtlMs: number;
  private readonly _name: string;

  // Storage
  private readonly _map: Map<string, LRUNode<T>> = new Map();
  private _head: LRUNode<T> | null = null; // Most recently used
  private _tail: LRUNode<T> | null = null; // Least recently used

  // Statistics
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _expired = 0;

  constructor(config: CacheConfig = {}) {
    this._maxSize = config.maxSize ?? DEFAULT_CACHE_CONFIG.maxSize;
    this._defaultTtlMs = config.defaultTtlMs ?? DEFAULT_CACHE_CONFIG.defaultTtlMs;
    this._name = config.name ?? DEFAULT_CACHE_CONFIG.name;
  }

  // ==========================================================================
  // ICache Implementation
  // ==========================================================================

  /**
   * Get a value from the cache.
   * Returns `undefined` if key is missing or expired.
   * Moves the accessed node to the front (most recently used).
   */
  get(key: string): T | undefined {
    const node = this._map.get(key);

    if (!node) {
      this._misses++;
      return undefined;
    }

    // Lazy expiration check
    if (Date.now() > node.expiresAt) {
      this._removeNode(node);
      this._expired++;
      this._misses++;
      return undefined;
    }

    // Update recency
    this._moveToFront(node);
    this._hits++;
    return node.value;
  }

  /**
   * Store a value in the cache.
   * If the key exists, updates value and TTL, moves to front.
   * If cache is full, evicts the least recently used entry.
   */
  set(key: string, value: T, options?: CacheSetOptions): void {
    const ttlMs = options?.ttlMs ?? this._defaultTtlMs;
    const expiresAt = Date.now() + ttlMs;
    const existing = this._map.get(key);

    if (existing) {
      // Update in-place
      existing.value = value;
      existing.expiresAt = expiresAt;
      this._moveToFront(existing);
      return;
    }

    // Evict if at capacity
    while (this._map.size >= this._maxSize && this._tail) {
      this._evictLRU();
    }

    // Insert new node at front
    const node = new LRUNode<T>(key, value, expiresAt);
    this._map.set(key, node);
    this._addToFront(node);
  }

  /**
   * Check if key exists and is not expired.
   * Does NOT update recency (peek semantics).
   */
  has(key: string): boolean {
    const node = this._map.get(key);
    if (!node) return false;

    if (Date.now() > node.expiresAt) {
      this._removeNode(node);
      this._expired++;
      return false;
    }

    return true;
  }

  /**
   * Remove a specific entry.
   */
  delete(key: string): boolean {
    const node = this._map.get(key);
    if (!node) return false;

    this._removeNode(node);
    return true;
  }

  /**
   * Remove all entries and reset the linked list.
   */
  clear(): void {
    this._map.clear();
    this._head = null;
    this._tail = null;
  }

  /**
   * Current number of entries.
   */
  get size(): number {
    return this._map.size;
  }

  /**
   * Cache name (for logging/debugging).
   */
  get name(): string {
    return this._name;
  }

  /**
   * Get cache performance statistics.
   */
  getStats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      expired: this._expired,
      hitRate: total > 0 ? Math.round((this._hits / total) * 10000) / 100 : 0,
      size: this._map.size,
    };
  }

  /**
   * Reset statistics counters.
   */
  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._expired = 0;
  }

  /**
   * Remove all expired entries eagerly.
   * @returns Number of entries pruned
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [, node] of this._map) {
      if (now > node.expiresAt) {
        this._removeNode(node);
        removed++;
      }
    }

    this._expired += removed;
    return removed;
  }

  /**
   * Get all non-expired keys in LRU order (most recent first).
   */
  keys(): string[] {
    const result: string[] = [];
    const now = Date.now();
    let current = this._head;

    while (current) {
      if (now <= current.expiresAt) {
        result.push(current.key);
      }
      current = current.next;
    }

    return result;
  }

  /**
   * Get all non-expired entries with metadata.
   */
  entries(): Array<{ key: string; value: T; expiresAt: number; ttlRemaining: number }> {
    const result: Array<{ key: string; value: T; expiresAt: number; ttlRemaining: number }> = [];
    const now = Date.now();
    let current = this._head;

    while (current) {
      if (now <= current.expiresAt) {
        result.push({
          key: current.key,
          value: current.value,
          expiresAt: current.expiresAt,
          ttlRemaining: current.expiresAt - now,
        });
      }
      current = current.next;
    }

    return result;
  }

  // ==========================================================================
  // IFetchCache Implementation
  // ==========================================================================

  /**
   * Get a value, or fetch it asynchronously if not cached.
   * The fetched value is automatically stored in the cache.
   *
   * @param key - Cache key
   * @param fetcher - Async function producing the value on miss
   * @param options - Optional per-entry settings
   * @returns Cached or freshly-fetched value
   */
  async getOrFetch(key: string, fetcher: () => Promise<T>, options?: CacheSetOptions): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, options);
    return value;
  }

  // ==========================================================================
  // Internal: Doubly-Linked List Operations (O(1))
  // ==========================================================================

  /** Move existing node to front (most recently used) */
  private _moveToFront(node: LRUNode<T>): void {
    if (node === this._head) return;

    // Detach from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this._tail) this._tail = node.prev;

    // Attach at front
    node.prev = null;
    node.next = this._head;
    if (this._head) this._head.prev = node;
    this._head = node;
    if (!this._tail) this._tail = node;
  }

  /** Add a new node to front */
  private _addToFront(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this._head;
    if (this._head) this._head.prev = node;
    this._head = node;
    if (!this._tail) this._tail = node;
  }

  /** Remove a node from the list and map */
  private _removeNode(node: LRUNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this._head) this._head = node.next;
    if (node === this._tail) this._tail = node.prev;
    this._map.delete(node.key);
  }

  /** Evict the least recently used node (tail) */
  private _evictLRU(): void {
    if (!this._tail) return;

    const evicted = this._tail;
    if (this._tail.prev) {
      this._tail = this._tail.prev;
      this._tail.next = null;
    } else {
      this._head = null;
      this._tail = null;
    }

    this._map.delete(evicted.key);
    this._evictions++;
  }
}

// ============================================================================
// Pre-configured Singleton Instances
// ============================================================================

/**
 * Cache for AI model-related data (model lists, capabilities).
 * Replaces: modelCache from src/lru-cache.ts
 */
export const modelCache = new BaseCache<any>({
  maxSize: 50,
  defaultTtlMs: 600_000, // 10 minutes
  name: 'model',
});

/**
 * Cache for API responses (generation results, completions).
 * Replaces: responseCache from src/lru-cache.ts
 */
export const responseCache = new BaseCache<any>({
  maxSize: 200,
  defaultTtlMs: 300_000, // 5 minutes
  name: 'response',
});

/**
 * Cache for code symbol/analysis data.
 * Replaces: symbolCache from src/lru-cache.ts
 */
export const symbolCache = new BaseCache<any>({
  maxSize: 500,
  defaultTtlMs: 120_000, // 2 minutes
  name: 'symbol',
});

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BaseCache instance.
 * Convenience function for modules that don't need to import the class.
 *
 * @param config - Cache configuration
 * @returns New BaseCache instance
 */
export function createCache<T = any>(config?: CacheConfig): BaseCache<T> {
  return new BaseCache<T>(config);
}

export default BaseCache;
