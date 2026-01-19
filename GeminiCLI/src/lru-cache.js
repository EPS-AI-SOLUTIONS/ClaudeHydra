/**
 * HYDRA LRU Cache - Least Recently Used Cache
 * BLOK 6: Performance - Ciri
 * In-memory cache with LRU eviction and TTL support
 */

/**
 * LRU Cache implementation
 */
export class LRUCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttlMs = options.ttlMs || 300000; // 5 minutes default
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0
    };
  }

  /**
   * Get item from cache
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Set item in cache
   */
  set(key, value, ttlMs = this.ttlMs) {
    // Delete existing entry to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs
    });

    return this;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expired++;
      return false;
    }

    return true;
  }

  /**
   * Delete item from cache
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    return this;
  }

  /**
   * Get cache size
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { hits: 0, misses: 0, evictions: 0, expired: 0 };
    return this;
  }

  /**
   * Prune expired entries
   */
  prune() {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    this.stats.expired += pruned;
    return pruned;
  }

  /**
   * Get all keys
   */
  keys() {
    return [...this.cache.keys()];
  }

  /**
   * Get entries as array
   */
  entries() {
    return [...this.cache.entries()].map(([key, entry]) => ({
      key,
      value: entry.value,
      expiresIn: Math.max(0, entry.expiresAt - Date.now())
    }));
  }
}

// Singleton instances for common use cases
const caches = new Map();

/**
 * Get or create a named cache instance
 */
export function getCache(name, options = {}) {
  if (!caches.has(name)) {
    caches.set(name, new LRUCache(options));
  }
  return caches.get(name);
}

/**
 * Create default caches for HYDRA
 */
export const modelCache = new LRUCache({ maxSize: 50, ttlMs: 600000 }); // 10 min
export const responseCache = new LRUCache({ maxSize: 200, ttlMs: 300000 }); // 5 min
export const symbolCache = new LRUCache({ maxSize: 500, ttlMs: 120000 }); // 2 min

export default LRUCache;
