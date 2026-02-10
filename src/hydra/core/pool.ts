/**
 * HYDRA Connection Pool - Manages concurrent connections and request queuing
 */

/**
 * Pool configuration options
 * @typedef {Object} PoolConfig
 * @property {number} maxConcurrent - Maximum concurrent requests (default: 5)
 * @property {number} maxQueueSize - Maximum queue size (default: 100)
 * @property {number} acquireTimeout - Timeout for acquiring a connection (default: 30000)
 * @property {number} idleTimeout - Timeout for idle connections (default: 60000)
 * @property {boolean} fifo - Use FIFO queue (default: true)
 */

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG = {
  maxConcurrent: 5,
  maxQueueSize: 100,
  acquireTimeout: 30000,
  idleTimeout: 60000,
  fifo: true,
};

/**
 * Request wrapper for queuing
 */
class QueuedRequest {
  constructor(fn, resolve, reject, timeout) {
    this.fn = fn;
    this.resolve = resolve;
    this.reject = reject;
    this.createdAt = Date.now();
    this.timeoutId = timeout
      ? setTimeout(() => {
          this.reject(new Error('Request timed out while waiting in queue'));
        }, timeout)
      : null;
  }

  cancel() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}

/**
 * Connection Pool implementation
 * Manages concurrent requests to a provider with queuing
 */
export class ConnectionPool {
  /**
   * @param {PoolConfig} config
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this._active = 0;
    this._queue = [];
    this._stats = {
      totalRequests: 0,
      queuedRequests: 0,
      rejectedRequests: 0,
      peakConcurrent: 0,
      peakQueueSize: 0,
      averageWaitTime: 0,
      totalWaitTime: 0,
    };
  }

  /**
   * Execute a function through the pool
   * @template T
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>}
   */
  async execute(fn) {
    this._stats.totalRequests++;

    // If we have capacity, execute immediately
    if (this._active < this.config.maxConcurrent) {
      return this._executeImmediate(fn);
    }

    // Check queue capacity
    if (this._queue.length >= this.config.maxQueueSize) {
      this._stats.rejectedRequests++;
      throw new Error(`Connection pool queue full (max: ${this.config.maxQueueSize})`);
    }

    // Queue the request
    return this._queueRequest(fn);
  }

  /**
   * Execute function immediately
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async _executeImmediate(fn) {
    this._active++;
    this._updatePeakConcurrent();

    try {
      return await fn();
    } finally {
      this._active--;
      this._processQueue();
    }
  }

  /**
   * Queue a request for later execution
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  _queueRequest(fn) {
    this._stats.queuedRequests++;

    return new Promise((resolve, reject) => {
      const request = new QueuedRequest(fn, resolve, reject, this.config.acquireTimeout);

      if (this.config.fifo) {
        this._queue.push(request);
      } else {
        this._queue.unshift(request);
      }

      this._updatePeakQueueSize();
    });
  }

  /**
   * Process next item in queue
   */
  async _processQueue() {
    if (this._queue.length === 0 || this._active >= this.config.maxConcurrent) {
      return;
    }

    const request = this._queue.shift();
    if (!request) return;

    request.cancel();

    // Track wait time
    const waitTime = Date.now() - request.createdAt;
    this._stats.totalWaitTime += waitTime;
    this._updateAverageWaitTime();

    this._active++;
    this._updatePeakConcurrent();

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this._active--;
      this._processQueue();
    }
  }

  /**
   * Update peak concurrent metric
   */
  _updatePeakConcurrent() {
    if (this._active > this._stats.peakConcurrent) {
      this._stats.peakConcurrent = this._active;
    }
  }

  /**
   * Update peak queue size metric
   */
  _updatePeakQueueSize() {
    if (this._queue.length > this._stats.peakQueueSize) {
      this._stats.peakQueueSize = this._queue.length;
    }
  }

  /**
   * Update average wait time
   */
  _updateAverageWaitTime() {
    if (this._stats.queuedRequests > 0) {
      this._stats.averageWaitTime = this._stats.totalWaitTime / this._stats.queuedRequests;
    }
  }

  /**
   * Get current pool status
   * @returns {Object}
   */
  getStatus() {
    return {
      active: this._active,
      queued: this._queue.length,
      available: this.config.maxConcurrent - this._active,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize,
    };
  }

  /**
   * Get pool statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Reset pool statistics
   */
  resetStats() {
    this._stats = {
      totalRequests: 0,
      queuedRequests: 0,
      rejectedRequests: 0,
      peakConcurrent: 0,
      peakQueueSize: 0,
      averageWaitTime: 0,
      totalWaitTime: 0,
    };
  }

  /**
   * Drain the queue (cancel all pending requests)
   */
  drain() {
    for (const request of this._queue) {
      request.cancel();
      request.reject(new Error('Pool drained'));
    }
    this._queue = [];
  }

  /**
   * Check if pool has capacity
   * @returns {boolean}
   */
  hasCapacity() {
    return this._active < this.config.maxConcurrent;
  }
}

/**
 * Rate Limiter implementation
 * Limits requests per time window using token bucket algorithm
 */
export class RateLimiter {
  /**
   * @param {Object} options
   * @property {number} tokensPerInterval - Tokens added per interval (default: 10)
   * @property {number} interval - Interval in ms (default: 1000)
   * @property {number} maxBurst - Maximum burst capacity (default: tokensPerInterval)
   */
  constructor(options = {}) {
    this.tokensPerInterval = options.tokensPerInterval || 10;
    this.interval = options.interval || 1000;
    this.maxBurst = options.maxBurst || this.tokensPerInterval;

    this._tokens = this.maxBurst;
    this._lastRefill = Date.now();
    this._queue = [];
  }

  /**
   * Refill tokens based on elapsed time
   */
  _refill() {
    const now = Date.now();
    const elapsed = now - this._lastRefill;
    const tokensToAdd = (elapsed / this.interval) * this.tokensPerInterval;

    this._tokens = Math.min(this.maxBurst, this._tokens + tokensToAdd);
    this._lastRefill = now;
  }

  /**
   * Try to acquire a token
   * @returns {boolean}
   */
  tryAcquire() {
    this._refill();

    if (this._tokens >= 1) {
      this._tokens--;
      return true;
    }

    return false;
  }

  /**
   * Acquire a token, waiting if necessary
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<boolean>}
   */
  async acquire(timeout = 30000) {
    if (this.tryAcquire()) {
      return true;
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const tryAcquire = () => {
        if (this.tryAcquire()) {
          resolve(true);
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('Rate limit acquire timeout'));
          return;
        }

        // Calculate time until next token
        const timeUntilToken = this.interval / this.tokensPerInterval;
        setTimeout(tryAcquire, Math.min(timeUntilToken, 100));
      };

      tryAcquire();
    });
  }

  /**
   * Execute function with rate limiting
   * @template T
   * @param {() => Promise<T>} fn
   * @param {number} timeout
   * @returns {Promise<T>}
   */
  async execute(fn, timeout = 30000) {
    await this.acquire(timeout);
    return fn();
  }

  /**
   * Get current token count
   * @returns {number}
   */
  getTokens() {
    this._refill();
    return this._tokens;
  }

  /**
   * Get rate limiter status
   * @returns {Object}
   */
  getStatus() {
    this._refill();
    return {
      availableTokens: Math.floor(this._tokens),
      tokensPerInterval: this.tokensPerInterval,
      interval: this.interval,
      maxBurst: this.maxBurst,
    };
  }
}

/**
 * Combined Pool with Rate Limiting
 * Provides both connection pooling and rate limiting
 */
export class ManagedPool {
  /**
   * @param {PoolConfig} poolConfig
   * @param {Object} rateLimitConfig
   */
  constructor(poolConfig = {}, rateLimitConfig = {}) {
    this.pool = new ConnectionPool(poolConfig);
    this.rateLimiter = rateLimitConfig.enabled !== false ? new RateLimiter(rateLimitConfig) : null;
  }

  /**
   * Execute function through managed pool
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async execute(fn) {
    // Apply rate limiting first if enabled
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }

    // Then use connection pool
    return this.pool.execute(fn);
  }

  /**
   * Get combined status
   * @returns {Object}
   */
  getStatus() {
    return {
      pool: this.pool.getStatus(),
      rateLimit: this.rateLimiter ? this.rateLimiter.getStatus() : null,
    };
  }

  /**
   * Get combined stats
   * @returns {Object}
   */
  getStats() {
    return {
      pool: this.pool.getStats(),
    };
  }
}
