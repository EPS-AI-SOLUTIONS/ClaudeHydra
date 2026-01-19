/**
 * Performance Utilities Module
 * Provides timing, debouncing, throttling, memoization, batching, and retry utilities
 * @module performance
 */

/**
 * Measure execution time of an async function
 * @param {Function} fn - Async function to measure
 * @param {string} [label='Operation'] - Label for logging
 * @returns {Promise<{result: any, duration: number, label: string}>}
 */
export async function measureTime(fn, label = 'Operation') {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;

    return {
      result,
      duration,
      label,
      success: true
    };
  } catch (error) {
    const duration = performance.now() - start;

    return {
      result: null,
      error,
      duration,
      label,
      success: false
    };
  }
}

/**
 * Create a debounced function that delays invoking fn until after delay ms
 * have elapsed since the last time the debounced function was invoked
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function & {cancel: Function, pending: Function, flush: Function}}
 */
export function debounce(fn, delay) {
  let timeoutId = null;
  let lastArgs = null;
  let lastThis = null;
  let lastCallTime = null;

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    lastCallTime = Date.now();

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        timeoutId = null;
        try {
          const result = await fn.apply(lastThis, lastArgs);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }

  /**
   * Cancel any pending debounced call
   */
  debounced.cancel = function() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    lastThis = null;
    lastCallTime = null;
  };

  /**
   * Check if there is a pending debounced call
   * @returns {boolean}
   */
  debounced.pending = function() {
    return timeoutId !== null;
  };

  /**
   * Immediately invoke the debounced function if pending
   * @returns {Promise<any>}
   */
  debounced.flush = async function() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;

      if (lastArgs !== null) {
        return fn.apply(lastThis, lastArgs);
      }
    }
    return undefined;
  };

  return debounced;
}

/**
 * Create a throttled function that only invokes fn at most once per limit ms
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function & {cancel: Function, pending: Function}}
 */
export function throttle(fn, limit) {
  let lastCall = 0;
  let timeoutId = null;
  let lastArgs = null;
  let lastThis = null;

  function throttled(...args) {
    const now = Date.now();
    const remaining = limit - (now - lastCall);

    lastArgs = args;
    lastThis = this;

    if (remaining <= 0 || remaining > limit) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      return fn.apply(lastThis, lastArgs);
    }

    if (!timeoutId) {
      return new Promise((resolve, reject) => {
        timeoutId = setTimeout(async () => {
          lastCall = Date.now();
          timeoutId = null;
          try {
            const result = await fn.apply(lastThis, lastArgs);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, remaining);
      });
    }
  }

  /**
   * Cancel any pending throttled call
   */
  throttled.cancel = function() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastCall = 0;
    lastArgs = null;
    lastThis = null;
  };

  /**
   * Check if there is a pending throttled call
   * @returns {boolean}
   */
  throttled.pending = function() {
    return timeoutId !== null;
  };

  return throttled;
}

/**
 * Memoization cache entry
 * @typedef {Object} MemoizeCacheEntry
 * @property {any} value - Cached value
 * @property {number} expiresAt - Expiration timestamp
 * @property {number} createdAt - Creation timestamp
 */

/**
 * Memoization options
 * @typedef {Object} MemoizeOptions
 * @property {number} [ttl=0] - Time-to-live in ms (0 = no expiration)
 * @property {number} [maxSize=1000] - Maximum cache size
 * @property {Function} [keyGenerator] - Custom key generator function
 */

/**
 * Create a memoized function with TTL and maxSize support
 * @param {Function} fn - Function to memoize
 * @param {MemoizeOptions} [options={}] - Memoization options
 * @returns {Function & {clear: Function, delete: Function, has: Function, size: Function, stats: Function}}
 */
export function memoize(fn, options = {}) {
  const {
    ttl = 0,
    maxSize = 1000,
    keyGenerator = (...args) => JSON.stringify(args)
  } = options;

  const cache = new Map();
  const stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /**
   * Evict least recently used entry
   */
  function evictLRU() {
    let oldest = null;
    let oldestKey = null;

    for (const [key, entry] of cache.entries()) {
      if (!oldest || entry.createdAt < oldest.createdAt) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      cache.delete(oldestKey);
      stats.evictions++;
    }
  }

  /**
   * Check if entry is expired
   * @param {MemoizeCacheEntry} entry
   * @returns {boolean}
   */
  function isExpired(entry) {
    if (ttl === 0) return false;
    return Date.now() > entry.expiresAt;
  }

  async function memoized(...args) {
    const key = keyGenerator(...args);

    // Check cache
    if (cache.has(key)) {
      const entry = cache.get(key);

      if (!isExpired(entry)) {
        stats.hits++;
        return entry.value;
      }

      // Entry expired, remove it
      cache.delete(key);
    }

    stats.misses++;

    // Evict if at max size
    if (cache.size >= maxSize) {
      evictLRU();
    }

    // Execute function and cache result
    const value = await fn.apply(this, args);
    const now = Date.now();

    cache.set(key, {
      value,
      createdAt: now,
      expiresAt: ttl > 0 ? now + ttl : Infinity
    });

    return value;
  }

  /**
   * Clear entire cache
   */
  memoized.clear = function() {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.evictions = 0;
  };

  /**
   * Delete specific key from cache
   * @param {...any} args - Arguments to generate key for deletion
   * @returns {boolean}
   */
  memoized.delete = function(...args) {
    const key = keyGenerator(...args);
    return cache.delete(key);
  };

  /**
   * Check if key exists in cache (and is not expired)
   * @param {...any} args - Arguments to check
   * @returns {boolean}
   */
  memoized.has = function(...args) {
    const key = keyGenerator(...args);

    if (!cache.has(key)) return false;

    const entry = cache.get(key);
    if (isExpired(entry)) {
      cache.delete(key);
      return false;
    }

    return true;
  };

  /**
   * Get current cache size
   * @returns {number}
   */
  memoized.size = function() {
    return cache.size;
  };

  /**
   * Get cache statistics
   * @returns {{hits: number, misses: number, evictions: number, size: number, hitRate: string}}
   */
  memoized.stats = function() {
    const total = stats.hits + stats.misses;
    return {
      ...stats,
      size: cache.size,
      hitRate: total > 0 ? ((stats.hits / total) * 100).toFixed(2) + '%' : '0%'
    };
  };

  /**
   * Get raw cache entries (for debugging)
   * @returns {Map}
   */
  memoized.entries = function() {
    return new Map(cache);
  };

  return memoized;
}

/**
 * Batch request options
 * @typedef {Object} BatchRequestOptions
 * @property {number} [delayBetweenBatches=0] - Delay between batch executions in ms
 * @property {boolean} [stopOnError=false] - Stop processing on first error
 * @property {Function} [onBatchComplete] - Callback after each batch completes
 * @property {Function} [onProgress] - Progress callback (completed, total)
 */

/**
 * Batch result
 * @typedef {Object} BatchResult
 * @property {any[]} results - Successful results
 * @property {Error[]} errors - Errors that occurred
 * @property {number} totalTime - Total execution time in ms
 * @property {number} batchCount - Number of batches processed
 */

/**
 * Execute requests in batches with configurable concurrency
 * @param {Function[]} requests - Array of async functions to execute
 * @param {number} batchSize - Number of requests per batch
 * @param {BatchRequestOptions} [options={}] - Batch options
 * @returns {Promise<BatchResult>}
 */
export async function batchRequests(requests, batchSize, options = {}) {
  const {
    delayBetweenBatches = 0,
    stopOnError = false,
    onBatchComplete = null,
    onProgress = null
  } = options;

  const results = [];
  const errors = [];
  const startTime = performance.now();
  let batchCount = 0;
  let completed = 0;

  // Split requests into batches
  const batches = [];
  for (let i = 0; i < requests.length; i += batchSize) {
    batches.push(requests.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    batchCount++;

    // Execute batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map(async (request, index) => {
        try {
          const result = await request();
          return { success: true, result, index };
        } catch (error) {
          return { success: false, error, index };
        }
      })
    );

    // Process batch results
    for (const outcome of batchResults) {
      if (outcome.status === 'fulfilled') {
        if (outcome.value.success) {
          results.push(outcome.value.result);
        } else {
          errors.push(outcome.value.error);

          if (stopOnError) {
            return {
              results,
              errors,
              totalTime: performance.now() - startTime,
              batchCount,
              stopped: true
            };
          }
        }
      } else {
        errors.push(outcome.reason);

        if (stopOnError) {
          return {
            results,
            errors,
            totalTime: performance.now() - startTime,
            batchCount,
            stopped: true
          };
        }
      }

      completed++;

      if (onProgress) {
        onProgress(completed, requests.length);
      }
    }

    // Callback after batch completion
    if (onBatchComplete) {
      onBatchComplete({
        batchNumber: batchCount,
        totalBatches: batches.length,
        batchResults: batchResults.map(r =>
          r.status === 'fulfilled' ? r.value : { success: false, error: r.reason }
        ),
        completed,
        total: requests.length
      });
    }

    // Delay between batches (except after last batch)
    if (delayBetweenBatches > 0 && batchCount < batches.length) {
      await sleep(delayBetweenBatches);
    }
  }

  return {
    results,
    errors,
    totalTime: performance.now() - startTime,
    batchCount,
    stopped: false
  };
}

/**
 * Retry options
 * @typedef {Object} RetryOptions
 * @property {number} [maxDelay=30000] - Maximum delay between retries in ms
 * @property {number} [factor=2] - Exponential backoff factor
 * @property {boolean} [jitter=true] - Add random jitter to delays
 * @property {Function} [shouldRetry] - Custom function to determine if retry should occur
 * @property {Function} [onRetry] - Callback on each retry attempt
 */

/**
 * Retry with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {RetryOptions} [options={}] - Retry options
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, maxRetries, baseDelay, options = {}) {
  const {
    maxDelay = 30000,
    factor = 2,
    jitter = true,
    shouldRetry = null,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt === maxRetries) {
        throw error;
      }

      // Check custom shouldRetry function
      if (shouldRetry && !shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = baseDelay * Math.pow(factor, attempt);

      // Apply jitter (random factor between 0.5 and 1.5)
      if (jitter) {
        const jitterFactor = 0.5 + Math.random();
        delay *= jitterFactor;
      }

      // Cap at max delay
      delay = Math.min(delay, maxDelay);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          error,
          delay,
          nextAttemptIn: delay
        });
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep utility for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a rate limiter for function calls
 * @param {number} maxCalls - Maximum calls allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function}
 */
export function rateLimit(fn, maxCalls, windowMs) {
  const calls = [];

  return async function rateLimited(...args) {
    const now = Date.now();

    // Remove old calls outside the window
    while (calls.length > 0 && calls[0] <= now - windowMs) {
      calls.shift();
    }

    // Check if we've hit the limit
    if (calls.length >= maxCalls) {
      const oldestCall = calls[0];
      const waitTime = oldestCall + windowMs - now;

      if (waitTime > 0) {
        await sleep(waitTime);
        return rateLimited.apply(this, args);
      }
    }

    calls.push(Date.now());
    return fn.apply(this, args);
  };
}

/**
 * Run function with timeout
 * @param {Function} fn - Async function to run
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [message='Operation timed out'] - Error message
 * @returns {Promise<any>}
 */
export async function withTimeout(fn, timeoutMs, message = 'Operation timed out') {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeoutMs)
    )
  ]);
}

/**
 * Pool of concurrent workers for parallel execution
 * @param {Function[]} tasks - Array of async tasks
 * @param {number} concurrency - Maximum concurrent tasks
 * @returns {Promise<{results: any[], errors: Error[]}>}
 */
export async function parallelLimit(tasks, concurrency) {
  const results = [];
  const errors = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      try {
        results[currentIndex] = await tasks[currentIndex]();
      } catch (error) {
        errors.push({ index: currentIndex, error });
        results[currentIndex] = undefined;
      }
    }
  }

  // Create worker pool
  const workers = [];
  const workerCount = Math.min(concurrency, tasks.length);

  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return { results, errors };
}

/**
 * Performance profiler for measuring multiple operations
 */
export class Profiler {
  constructor() {
    this.measurements = new Map();
    this.running = new Map();
  }

  /**
   * Start timing an operation
   * @param {string} label - Operation label
   */
  start(label) {
    this.running.set(label, performance.now());
  }

  /**
   * Stop timing an operation
   * @param {string} label - Operation label
   * @returns {number} Duration in milliseconds
   */
  stop(label) {
    const startTime = this.running.get(label);
    if (startTime === undefined) {
      throw new Error(`No running measurement for label: ${label}`);
    }

    const duration = performance.now() - startTime;
    this.running.delete(label);

    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    this.measurements.get(label).push(duration);

    return duration;
  }

  /**
   * Measure an async function
   * @param {string} label - Operation label
   * @param {Function} fn - Async function to measure
   * @returns {Promise<any>}
   */
  async measure(label, fn) {
    this.start(label);
    try {
      return await fn();
    } finally {
      this.stop(label);
    }
  }

  /**
   * Get statistics for a label
   * @param {string} label - Operation label
   * @returns {{count: number, total: number, avg: number, min: number, max: number}}
   */
  getStats(label) {
    const measurements = this.measurements.get(label);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const total = measurements.reduce((a, b) => a + b, 0);
    const sorted = [...measurements].sort((a, b) => a - b);

    return {
      count: measurements.length,
      total,
      avg: total / measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(measurements.length * 0.5)],
      p95: sorted[Math.floor(measurements.length * 0.95)],
      p99: sorted[Math.floor(measurements.length * 0.99)]
    };
  }

  /**
   * Get all statistics
   * @returns {Object}
   */
  getAllStats() {
    const stats = {};
    for (const label of this.measurements.keys()) {
      stats[label] = this.getStats(label);
    }
    return stats;
  }

  /**
   * Clear all measurements
   */
  clear() {
    this.measurements.clear();
    this.running.clear();
  }

  /**
   * Get formatted report
   * @returns {string}
   */
  report() {
    const stats = this.getAllStats();
    const lines = ['Performance Report', '='.repeat(50)];

    for (const [label, data] of Object.entries(stats)) {
      lines.push(`\n${label}:`);
      lines.push(`  Count: ${data.count}`);
      lines.push(`  Total: ${data.total.toFixed(2)}ms`);
      lines.push(`  Avg: ${data.avg.toFixed(2)}ms`);
      lines.push(`  Min: ${data.min.toFixed(2)}ms`);
      lines.push(`  Max: ${data.max.toFixed(2)}ms`);
      lines.push(`  P95: ${data.p95?.toFixed(2) || 'N/A'}ms`);
    }

    return lines.join('\n');
  }
}

export default {
  measureTime,
  debounce,
  throttle,
  memoize,
  batchRequests,
  retryWithBackoff,
  sleep,
  rateLimit,
  withTimeout,
  parallelLimit,
  Profiler
};
