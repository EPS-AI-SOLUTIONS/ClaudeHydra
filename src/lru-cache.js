/**
 * LRU Cache - In-memory Least Recently Used cache with TTL support
 *
 * Features:
 * - LRU eviction policy using doubly-linked list
 * - Time-to-live (TTL) support per entry
 * - Comprehensive statistics tracking
 * - Pre-configured cache instances for common use cases
 *
 * Based on ClaudeHYDRA cache patterns
 */

/**
 * Node for doubly-linked list in LRU Cache
 * @private
 */
class LRUNode {
  constructor(key, value, expiresAt) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.createdAt = Date.now();
    this.prev = null;
    this.next = null;
  }
}

/**
 * LRU Cache implementation with TTL support
 */
export class LRUCache {
  /**
   * Create a new LRU Cache
   * @param {Object} options - Configuration options
   * @param {number} [options.maxSize=100] - Maximum number of entries
   * @param {number} [options.ttlMs=300000] - Default TTL in milliseconds (5 minutes)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.defaultTtlMs = options.ttlMs ?? 300000;

    // Internal storage
    this._map = new Map();
    this._head = null; // Most recently used
    this._tail = null; // Least recently used

    // Statistics
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0
    };
  }

  /**
   * Move node to front (most recently used)
   * @private
   */
  _moveToFront(node) {
    if (node === this._head) return;

    // Remove from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this._tail) this._tail = node.prev;

    // Move to front
    node.prev = null;
    node.next = this._head;
    if (this._head) this._head.prev = node;
    this._head = node;
    if (!this._tail) this._tail = node;
  }

  /**
   * Add node to front
   * @private
   */
  _addToFront(node) {
    node.prev = null;
    node.next = this._head;
    if (this._head) this._head.prev = node;
    this._head = node;
    if (!this._tail) this._tail = node;
  }

  /**
   * Remove least recently used node
   * @private
   */
  _removeLRU() {
    if (!this._tail) return null;

    const removed = this._tail;
    this._map.delete(removed.key);

    if (this._tail.prev) {
      this._tail = this._tail.prev;
      this._tail.next = null;
    } else {
      this._head = null;
      this._tail = null;
    }

    this._stats.evictions++;
    return removed;
  }

  /**
   * Remove a specific node from the list
   * @private
   */
  _removeNode(node) {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this._head) this._head = node.next;
    if (node === this._tail) this._tail = node.prev;
    this._map.delete(node.key);
  }

  /**
   * Check if a node is expired
   * @private
   */
  _isExpired(node) {
    return Date.now() > node.expiresAt;
  }

  /**
   * Get value from cache with recency update
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found/expired
   */
  get(key) {
    const node = this._map.get(key);

    if (!node) {
      this._stats.misses++;
      return undefined;
    }

    // Check if expired
    if (this._isExpired(node)) {
      this._removeNode(node);
      this._stats.expired++;
      this._stats.misses++;
      return undefined;
    }

    // Update recency
    this._moveToFront(node);
    this._stats.hits++;
    return node.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttlMs] - Optional custom TTL in milliseconds
   */
  set(key, value, ttlMs) {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    const existingNode = this._map.get(key);

    if (existingNode) {
      // Update existing entry
      existingNode.value = value;
      existingNode.expiresAt = expiresAt;
      this._moveToFront(existingNode);
      return;
    }

    // Evict if needed
    while (this._map.size >= this.maxSize && this._tail) {
      this._removeLRU();
    }

    // Create new node
    const node = new LRUNode(key, value, expiresAt);
    this._map.set(key, node);
    this._addToFront(node);
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    const node = this._map.get(key);
    if (!node) return false;

    if (this._isExpired(node)) {
      this._removeNode(node);
      this._stats.expired++;
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if entry was deleted
   */
  delete(key) {
    const node = this._map.get(key);
    if (!node) return false;

    this._removeNode(node);
    return true;
  }

  /**
   * Clear all entries from cache
   */
  clear() {
    this._map.clear();
    this._head = null;
    this._tail = null;
  }

  /**
   * Get number of entries in cache
   * @returns {number} Number of entries
   */
  get size() {
    return this._map.size;
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics object with hits, misses, evictions, expired, and hitRate
   */
  getStats() {
    const total = this._stats.hits + this._stats.misses;
    const hitRate = total > 0 ? (this._stats.hits / total) : 0;

    return {
      hits: this._stats.hits,
      misses: this._stats.misses,
      evictions: this._stats.evictions,
      expired: this._stats.expired,
      hitRate: Math.round(hitRate * 10000) / 100 // Percentage with 2 decimal places
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
      expired: 0
    };
  }

  /**
   * Remove all expired entries
   * @returns {number} Number of entries removed
   */
  prune() {
    let removed = 0;
    const now = Date.now();

    for (const [key, node] of this._map) {
      if (now > node.expiresAt) {
        this._removeNode(node);
        removed++;
      }
    }

    this._stats.expired += removed;
    return removed;
  }

  /**
   * Get all keys in LRU order (most recent first)
   * @returns {string[]} Array of keys
   */
  keys() {
    const keys = [];
    let current = this._head;
    while (current) {
      if (!this._isExpired(current)) {
        keys.push(current.key);
      }
      current = current.next;
    }
    return keys;
  }

  /**
   * Get all entries with metadata
   * @returns {Array<Object>} Array of entry objects with key, value, expiresAt, createdAt, ttlRemaining
   */
  entries() {
    const entries = [];
    const now = Date.now();
    let current = this._head;

    while (current) {
      if (!this._isExpired(current)) {
        entries.push({
          key: current.key,
          value: current.value,
          expiresAt: current.expiresAt,
          createdAt: current.createdAt,
          ttlRemaining: current.expiresAt - now
        });
      }
      current = current.next;
    }

    return entries;
  }
}

// ============================================================
// Pre-configured cache instances
// ============================================================

/**
 * Cache for model-related data
 * - maxSize: 50 entries
 * - ttlMs: 600000 (10 minutes)
 */
export const modelCache = new LRUCache({
  maxSize: 50,
  ttlMs: 600000
});

/**
 * Cache for API responses
 * - maxSize: 200 entries
 * - ttlMs: 300000 (5 minutes)
 */
export const responseCache = new LRUCache({
  maxSize: 200,
  ttlMs: 300000
});

/**
 * Cache for symbol/code analysis data
 * - maxSize: 500 entries
 * - ttlMs: 120000 (2 minutes)
 */
export const symbolCache = new LRUCache({
  maxSize: 500,
  ttlMs: 120000
});

export default LRUCache;
