/**
 * Analysis Cache Module
 *
 * LRU cache with TTL for caching prompt analysis results.
 * Improves performance by avoiding repeated analysis of the same prompts.
 */

import { createHash } from 'crypto';

/**
 * @typedef {object} CacheEntry
 * @property {*} value - Cached value
 * @property {number} timestamp - When entry was created
 * @property {number} hits - Number of times accessed
 */

/**
 * @typedef {object} CacheStats
 * @property {number} size - Current cache size
 * @property {number} maxSize - Maximum cache size
 * @property {number} hits - Total cache hits
 * @property {number} misses - Total cache misses
 * @property {number} hitRate - Hit rate percentage
 * @property {number} evictions - Number of entries evicted
 */

/**
 * Create a hash key for a prompt
 * @param {string} prompt - The prompt text
 * @param {string} [prefix=''] - Optional prefix for namespace separation
 * @returns {string} Hash key
 */
export function createCacheKey(prompt, prefix = '') {
  const hash = createHash('sha256')
    .update(prompt)
    .digest('hex')
    .substring(0, 16);
  return prefix ? `${prefix}:${hash}` : hash;
}

/**
 * Create a simple hash for short strings (faster than crypto)
 * @param {string} str - String to hash
 * @returns {number} Simple hash number
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * LRU Cache with TTL support
 */
export class AnalysisCache {
  /**
   * @param {object} options - Cache options
   * @param {number} options.maxSize - Maximum number of entries (default: 1000)
   * @param {number} options.ttlMs - Time to live in milliseconds (default: 300000 = 5 min)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttlMs = options.ttlMs || 300000;

    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Generate cache key for a prompt with optional context
   * @param {string} prompt - The prompt
   * @param {string} context - Optional context (e.g., 'category', 'clarity')
   * @returns {string}
   */
  generateKey(prompt, context = '') {
    // For short prompts, use simple hash for speed
    if (prompt.length < 100) {
      return `${context}:${simpleHash(prompt)}`;
    }
    return createCacheKey(prompt, context);
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {* | undefined} Cached value or undefined
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.hits++;
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    // Remove if exists (for LRU ordering)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0
    });
  }

  /**
   * Check if key exists and is valid
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    this.stats.evictions = 0;
  }

  /**
   * Get cache statistics
   * @returns {CacheStats}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
      evictions: this.stats.evictions
    };
  }

  /**
   * Remove expired entries (garbage collection)
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get or compute value (cache-aside pattern)
   * @param {string} key - Cache key
   * @param {function} compute - Function to compute value if not cached
   * @returns {*} Cached or computed value
   */
  getOrCompute(key, compute) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = compute();
    this.set(key, value);
    return value;
  }

  /**
   * Get or compute value async
   * @param {string} key - Cache key
   * @param {function} compute - Async function to compute value
   * @returns {Promise<*>} Cached or computed value
   */
  async getOrComputeAsync(key, compute) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value);
    return value;
  }
}

/**
 * Create a memoized version of a function with caching
 * @param {function} fn - Function to memoize
 * @param {object} options - Cache options
 * @param {function} options.keyFn - Function to generate cache key from args
 * @param {number} options.maxSize - Max cache size
 * @param {number} options.ttlMs - TTL in milliseconds
 * @returns {function} Memoized function
 */
export function memoize(fn, options = {}) {
  const {
    keyFn = (...args) => JSON.stringify(args),
    maxSize = 100,
    ttlMs = 60000
  } = options;

  const cache = new AnalysisCache({ maxSize, ttlMs });

  const memoized = (...args) => {
    const key = keyFn(...args);
    return cache.getOrCompute(key, () => fn(...args));
  };

  // Attach cache control methods
  memoized.cache = cache;
  memoized.clearCache = () => cache.clear();
  memoized.getCacheStats = () => cache.getStats();

  return memoized;
}

/**
 * Create specialized caches for different analysis types
 * @param {object} options - Options for cache sizes
 * @returns {object} Object with specialized caches
 */
export function createAnalysisCaches(options = {}) {
  const {
    categoryMaxSize = 500,
    clarityMaxSize = 500,
    languageMaxSize = 300,
    fullMaxSize = 200,
    ttlMs = 300000
  } = options;

  return {
    category: new AnalysisCache({ maxSize: categoryMaxSize, ttlMs }),
    clarity: new AnalysisCache({ maxSize: clarityMaxSize, ttlMs }),
    language: new AnalysisCache({ maxSize: languageMaxSize, ttlMs }),
    full: new AnalysisCache({ maxSize: fullMaxSize, ttlMs }),

    /**
     * Clear all caches
     */
    clearAll() {
      this.category.clear();
      this.clarity.clear();
      this.language.clear();
      this.full.clear();
    },

    /**
     * Get combined statistics
     */
    getAllStats() {
      return {
        category: this.category.getStats(),
        clarity: this.clarity.getStats(),
        language: this.language.getStats(),
        full: this.full.getStats()
      };
    },

    /**
     * Cleanup all expired entries
     */
    cleanupAll() {
      return {
        category: this.category.cleanup(),
        clarity: this.clarity.cleanup(),
        language: this.language.cleanup(),
        full: this.full.cleanup()
      };
    }
  };
}

/**
 * Singleton cache instance for global use
 */
let globalCache = null;

/**
 * Get or create global analysis cache
 * @param {object} options - Cache options (only used on first call)
 * @returns {object} Global cache instance
 */
export function getGlobalCache(options = {}) {
  if (!globalCache) {
    globalCache = createAnalysisCaches(options);
  }
  return globalCache;
}

/**
 * Reset global cache (useful for testing)
 */
export function resetGlobalCache() {
  if (globalCache) {
    globalCache.clearAll();
  }
  globalCache = null;
}
