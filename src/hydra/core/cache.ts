/**
 * HYDRA Cache - Health check caching and general-purpose caching utilities
 */

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {any} value - Cached value
 * @property {number} expiresAt - Expiration timestamp
 * @property {number} createdAt - Creation timestamp
 * @property {number} accessCount - Number of times accessed
 * @property {number} lastAccessedAt - Last access timestamp
 */

/**
 * Cache configuration
 * @typedef {Object} CacheConfig
 * @property {number} defaultTTL - Default time-to-live in ms (default: 60000)
 * @property {number} maxSize - Maximum cache entries (default: 1000)
 * @property {string} evictionPolicy - Eviction policy: 'lru', 'lfu', 'fifo' (default: 'lru')
 * @property {boolean} staleWhileRevalidate - Return stale data while fetching fresh (default: true)
 */

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG = {
  defaultTTL: 60000,
  maxSize: 1000,
  evictionPolicy: 'lru',
  staleWhileRevalidate: true
};

/**
 * Generic TTL Cache implementation
 */
export class TTLCache {
  /**
   * @param {CacheConfig} config
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this._cache = new Map();
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      staleHits: 0
    };
  }

  /**
   * Get value from cache
   * @param {string} key
   * @returns {any|undefined}
   */
  get(key) {
    const entry = this._cache.get(key);

    if (!entry) {
      this._stats.misses++;
      return undefined;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      if (this.config.staleWhileRevalidate) {
        this._stats.staleHits++;
        entry.accessCount++;
        entry.lastAccessedAt = now;
        return { value: entry.value, stale: true };
      }
      this._cache.delete(key);
      this._stats.misses++;
      return undefined;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = now;
    this._stats.hits++;

    return { value: entry.value, stale: false };
  }

  /**
   * Set value in cache
   * @param {string} key
   * @param {any} value
   * @param {number} ttl - Time-to-live in ms (optional)
   */
  set(key, value, ttl = this.config.defaultTTL) {
    // Check if we need to evict
    if (this._cache.size >= this.config.maxSize && !this._cache.has(key)) {
      this._evict();
    }

    const now = Date.now();
    this._cache.set(key, {
      value,
      expiresAt: now + ttl,
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now
    });
  }

  /**
   * Delete entry from cache
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this._cache.delete(key);
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const entry = this._cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get or fetch value
   * @param {string} key
   * @param {() => Promise<any>} fetcher - Function to fetch fresh value
   * @param {number} ttl - Time-to-live in ms
   * @returns {Promise<any>}
   */
  async getOrFetch(key, fetcher, ttl = this.config.defaultTTL) {
    const cached = this.get(key);

    if (cached && !cached.stale) {
      return cached.value;
    }

    // If stale, return stale value but trigger refresh
    if (cached && cached.stale && this.config.staleWhileRevalidate) {
      // Fire and forget refresh
      fetcher().then(value => this.set(key, value, ttl)).catch(() => {});
      return cached.value;
    }

    // Fetch fresh value
    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Evict entries based on eviction policy
   */
  _evict() {
    const entries = Array.from(this._cache.entries());

    let keyToEvict;
    switch (this.config.evictionPolicy) {
      case 'lru':
        // Least Recently Used
        entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
        keyToEvict = entries[0]?.[0];
        break;

      case 'lfu':
        // Least Frequently Used
        entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
        keyToEvict = entries[0]?.[0];
        break;

      case 'fifo':
      default:
        // First In First Out
        entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
        keyToEvict = entries[0]?.[0];
        break;
    }

    if (keyToEvict) {
      this._cache.delete(keyToEvict);
      this._stats.evictions++;
    }
  }

  /**
   * Clear all entries
   */
  clear() {
    this._cache.clear();
  }

  /**
   * Remove expired entries
   * @returns {number} Number of entries removed
   */
  prune() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this._cache) {
      if (now > entry.expiresAt) {
        this._cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const total = this._stats.hits + this._stats.misses;
    return {
      ...this._stats,
      size: this._cache.size,
      hitRate: total > 0 ? (this._stats.hits / total * 100).toFixed(2) : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      staleHits: 0
    };
  }

  /**
   * Get all keys
   * @returns {string[]}
   */
  keys() {
    return Array.from(this._cache.keys());
  }

  /**
   * Get cache size
   * @returns {number}
   */
  size() {
    return this._cache.size;
  }
}

/**
 * Health Check Cache - Specialized cache for provider health checks
 */
export class HealthCheckCache {
  /**
   * @param {Object} config
   * @property {number} ttl - Cache TTL in ms (default: 30000)
   * @property {number} staleTTL - Stale cache TTL in ms (default: 60000)
   * @property {boolean} autoRefresh - Auto-refresh before expiry (default: true)
   * @property {number} refreshThreshold - Refresh when this % of TTL remains (default: 0.2)
   */
  constructor(config = {}) {
    this.ttl = config.ttl || 30000;
    this.staleTTL = config.staleTTL || 60000;
    this.autoRefresh = config.autoRefresh !== false;
    this.refreshThreshold = config.refreshThreshold || 0.2;

    this._cache = new Map();
    this._refreshTimers = new Map();
    this._healthCheckers = new Map();
  }

  /**
   * Register a health check function for a provider
   * @param {string} providerName
   * @param {() => Promise<Object>} healthCheckFn
   */
  register(providerName, healthCheckFn) {
    this._healthCheckers.set(providerName, healthCheckFn);
  }

  /**
   * Get cached health status
   * @param {string} providerName
   * @returns {Object|null}
   */
  getCached(providerName) {
    const entry = this._cache.get(providerName);
    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if completely stale
    if (age > this.staleTTL) {
      this._cache.delete(providerName);
      return null;
    }

    return {
      ...entry.data,
      cached: true,
      age,
      stale: age > this.ttl
    };
  }

  /**
   * Get health status (cached or fresh)
   * @param {string} providerName
   * @param {boolean} forceRefresh
   * @returns {Promise<Object>}
   */
  async get(providerName, forceRefresh = false) {
    // Check cache first
    if (!forceRefresh) {
      const cached = this.getCached(providerName);
      if (cached && !cached.stale) {
        this._maybeScheduleRefresh(providerName);
        return cached;
      }

      // Return stale if we have it, but trigger refresh
      if (cached && cached.stale) {
        this._refresh(providerName).catch(() => {});
        return cached;
      }
    }

    // Fetch fresh
    return this._refresh(providerName);
  }

  /**
   * Refresh health status for a provider
   * @param {string} providerName
   * @returns {Promise<Object>}
   */
  async _refresh(providerName) {
    const healthChecker = this._healthCheckers.get(providerName);
    if (!healthChecker) {
      throw new Error(`No health checker registered for provider: ${providerName}`);
    }

    const startTime = Date.now();
    const data = await healthChecker();
    const latency = Date.now() - startTime;

    const entry = {
      data: { ...data, latency_ms: latency },
      timestamp: Date.now()
    };

    this._cache.set(providerName, entry);
    this._maybeScheduleRefresh(providerName);

    return {
      ...entry.data,
      cached: false,
      age: 0,
      stale: false
    };
  }

  /**
   * Schedule auto-refresh if enabled
   * @param {string} providerName
   */
  _maybeScheduleRefresh(providerName) {
    if (!this.autoRefresh) return;

    // Clear existing timer
    const existingTimer = this._refreshTimers.get(providerName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule refresh at threshold
    const refreshTime = this.ttl * (1 - this.refreshThreshold);
    const timer = setTimeout(() => {
      this._refresh(providerName).catch(() => {});
    }, refreshTime);

    this._refreshTimers.set(providerName, timer);
  }

  /**
   * Get all cached health statuses
   * @returns {Object}
   */
  getAll() {
    const result = {};
    for (const providerName of this._healthCheckers.keys()) {
      result[providerName] = this.getCached(providerName);
    }
    return result;
  }

  /**
   * Refresh all providers
   * @returns {Promise<Object>}
   */
  async refreshAll() {
    const results = {};
    const providers = Array.from(this._healthCheckers.keys());

    await Promise.all(
      providers.map(async (provider) => {
        try {
          results[provider] = await this._refresh(provider);
        } catch (error) {
          results[provider] = { available: false, error: error.message };
        }
      })
    );

    return results;
  }

  /**
   * Clear cache for a provider
   * @param {string} providerName
   */
  clear(providerName) {
    this._cache.delete(providerName);
    const timer = this._refreshTimers.get(providerName);
    if (timer) {
      clearTimeout(timer);
      this._refreshTimers.delete(providerName);
    }
  }

  /**
   * Clear all caches
   */
  clearAll() {
    this._cache.clear();
    for (const timer of this._refreshTimers.values()) {
      clearTimeout(timer);
    }
    this._refreshTimers.clear();
  }

  /**
   * Stop all auto-refresh timers
   */
  stopAutoRefresh() {
    for (const timer of this._refreshTimers.values()) {
      clearTimeout(timer);
    }
    this._refreshTimers.clear();
  }
}

/**
 * Memoization utility for expensive function calls
 * @param {Function} fn - Function to memoize
 * @param {Object} options - Cache options
 * @returns {Function}
 */
export function memoize(fn, options = {}) {
  const cache = new TTLCache(options);
  const keyGenerator = options.keyGenerator || ((...args) => JSON.stringify(args));

  return async function(...args) {
    const key = keyGenerator(...args);
    return cache.getOrFetch(key, () => fn.apply(this, args), options.ttl);
  };
}
