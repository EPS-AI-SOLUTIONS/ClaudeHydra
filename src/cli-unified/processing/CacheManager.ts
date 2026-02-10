/**
 * Cache Manager with LRU and TTL
 * Based on src/cli-enhanced/cache-manager.js
 * @module cli-unified/processing/CacheManager
 */

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { EVENT_TYPES, eventBus } from '../core/EventBus.js';

/**
 * LRU Cache implementation
 */
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);

    return value;
  }

  set(key, value) {
    // Delete if exists to update order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    this.cache.set(key, value);

    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  values() {
    return Array.from(this.cache.values());
  }

  entries() {
    return Array.from(this.cache.entries());
  }
}

/**
 * Token utilities
 */
export const TokenUtils = {
  /**
   * Estimate token count (rough approximation)
   */
  estimate(text) {
    if (!text) return 0;
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  },

  /**
   * Calculate cost estimate
   */
  estimateCost(inputTokens, outputTokens, model = 'default') {
    // Example pricing (adjust based on actual model costs)
    const pricing = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.001, output: 0.002 },
      'claude-3': { input: 0.015, output: 0.075 },
      default: { input: 0.001, output: 0.002 },
    };

    const rates = pricing[model] || pricing.default;
    const inputCost = (inputTokens / 1000) * rates.input;
    const outputCost = (outputTokens / 1000) * rates.output;

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  },
};

/**
 * Cache Manager
 */
export class CacheManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.cache = new LRUCache(options.maxSize || 100);
    this.ttl = options.ttl || 3600000; // 1 hour default
    this.enabled = options.enabled !== false;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      totalTokensSaved: 0,
    };
  }

  /**
   * Generate cache key from prompt
   * Filters out non-serializable properties (functions, cli references, etc.)
   */
  generateKey(prompt, options = {}) {
    // Filter out properties that cannot be serialized or cause circular references
    const safeOptions = {};
    const unsafeKeys = ['cli', 'onToken', 'onProgress', 'onComplete', 'onError', 'callback'];

    for (const [key, value] of Object.entries(options)) {
      // Skip functions and known circular references
      if (typeof value === 'function') continue;
      if (unsafeKeys.includes(key)) continue;
      // Skip objects that might have circular references
      if (value && typeof value === 'object' && (value.cli || value.mode)) continue;
      safeOptions[key] = value;
    }

    const data = JSON.stringify({ prompt, ...safeOptions });
    return createHash('md5').update(data).digest('hex');
  }

  /**
   * Get cached response
   */
  get(prompt, options = {}) {
    if (!this.enabled) {
      return null;
    }

    const key = this.generateKey(prompt, options);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      eventBus.emit(EVENT_TYPES.CACHE_MISS, { key });
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      eventBus.emit(EVENT_TYPES.CACHE_MISS, { key, reason: 'expired' });
      return null;
    }

    this.stats.hits++;
    this.stats.totalTokensSaved += entry.tokens || 0;
    eventBus.emit(EVENT_TYPES.CACHE_HIT, { key });
    this.emit('hit', key, entry);

    return entry.response;
  }

  /**
   * Set cached response
   */
  set(prompt, response, options = {}) {
    if (!this.enabled) {
      return;
    }

    const key = this.generateKey(prompt, options);
    const tokens = TokenUtils.estimate(response);

    const entry = {
      response,
      timestamp: Date.now(),
      tokens,
      metadata: options.metadata || {},
    };

    this.cache.set(key, entry);
    this.stats.sets++;

    this.emit('set', key, entry);
  }

  /**
   * Delete cache entry
   */
  delete(prompt, options = {}) {
    const key = this.generateKey(prompt, options);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.evictions += size;

    eventBus.emit(EVENT_TYPES.CACHE_CLEAR);
    this.emit('clear', size);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.cache.maxSize,
      estimatedSavings: TokenUtils.estimateCost(this.stats.totalTokensSaved, 0).total.toFixed(4),
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      totalTokensSaved: 0,
    };
  }

  /**
   * Enable caching
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable caching
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Set TTL
   */
  setTTL(ttl) {
    this.ttl = ttl;
  }

  /**
   * Prune expired entries
   */
  prune() {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }

    this.stats.evictions += pruned;
    return pruned;
  }

  /**
   * Get cache size
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Check if cache is enabled
   */
  get isEnabled() {
    return this.enabled;
  }
}

export function createCacheManager(options) {
  return new CacheManager(options);
}

export default CacheManager;
