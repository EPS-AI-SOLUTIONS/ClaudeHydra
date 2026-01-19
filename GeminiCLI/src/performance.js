/**
 * GeminiCLI Performance Utilities
 * Agent: Ciri (Performance)
 *
 * High-performance utility functions for optimizing execution,
 * managing request rates, and improving application responsiveness.
 */

/**
 * Measures execution time of a function
 * @param {Function} fn - Function to measure
 * @param {string} label - Label for logging
 * @returns {Promise<{result: any, duration: number}>} Result and duration in ms
 */
async function measureTime(fn, label = 'Operation') {
    const start = performance.now();

    try {
        const result = await fn();
        const duration = performance.now() - start;

        console.log(`[${label}] Completed in ${duration.toFixed(2)}ms`);

        return {
            result,
            duration,
            label,
            success: true
        };
    } catch (error) {
        const duration = performance.now() - start;

        console.error(`[${label}] Failed after ${duration.toFixed(2)}ms:`, error.message);

        return {
            result: null,
            duration,
            label,
            success: false,
            error
        };
    }
}

/**
 * Creates a debounced version of a function
 * Delays execution until after wait milliseconds have elapsed since last call
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function with cancel() method
 */
function debounce(fn, delay = 300) {
    let timeoutId = null;
    let pendingPromise = null;
    let resolve = null;

    const debounced = function (...args) {
        // Clear existing timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        // Create new promise if none exists
        if (!pendingPromise) {
            pendingPromise = new Promise((res) => {
                resolve = res;
            });
        }

        // Set new timeout
        timeoutId = setTimeout(async () => {
            timeoutId = null;
            const currentResolve = resolve;
            pendingPromise = null;
            resolve = null;

            try {
                const result = await fn.apply(this, args);
                currentResolve(result);
            } catch (error) {
                currentResolve(Promise.reject(error));
            }
        }, delay);

        return pendingPromise;
    };

    // Allow cancellation
    debounced.cancel = function () {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (resolve) {
            resolve(undefined);
        }
        pendingPromise = null;
        resolve = null;
    };

    // Check if pending
    debounced.pending = function () {
        return timeoutId !== null;
    };

    return debounced;
}

/**
 * Creates a throttled version of a function
 * Ensures function is called at most once per limit milliseconds
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(fn, limit = 300) {
    let lastCall = 0;
    let timeoutId = null;
    let lastArgs = null;
    let lastThis = null;

    const throttled = function (...args) {
        const now = Date.now();
        const remaining = limit - (now - lastCall);

        lastArgs = args;
        lastThis = this;

        if (remaining <= 0) {
            // Enough time has passed, execute immediately
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastCall = now;
            return fn.apply(this, args);
        } else if (!timeoutId) {
            // Schedule execution for when limit expires
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = null;
                fn.apply(lastThis, lastArgs);
            }, remaining);
        }
    };

    // Allow cancellation
    throttled.cancel = function () {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        lastCall = 0;
        lastArgs = null;
        lastThis = null;
    };

    return throttled;
}

/**
 * Creates a memoized version of a function with TTL support
 * Caches results based on arguments
 * @param {Function} fn - Function to memoize
 * @param {Object} options - Memoization options
 * @param {number} options.ttl - Time-to-live in milliseconds (default: 5 minutes)
 * @param {number} options.maxSize - Maximum cache size (default: 100)
 * @param {Function} options.keyGenerator - Custom key generator function
 * @returns {Function} Memoized function with cache management methods
 */
function memoize(fn, options = {}) {
    const {
        ttl = 5 * 60 * 1000, // 5 minutes default
        maxSize = 100,
        keyGenerator = (...args) => JSON.stringify(args)
    } = options;

    const cache = new Map();

    const memoized = function (...args) {
        const key = keyGenerator(...args);
        const now = Date.now();

        // Check if cached and not expired
        if (cache.has(key)) {
            const entry = cache.get(key);
            if (now - entry.timestamp < ttl) {
                entry.hits++;
                return entry.value;
            }
            // Expired, remove it
            cache.delete(key);
        }

        // Compute new value
        const value = fn.apply(this, args);

        // Evict oldest if at max size
        if (cache.size >= maxSize) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }

        // Store in cache
        cache.set(key, {
            value,
            timestamp: now,
            hits: 0
        });

        return value;
    };

    // Cache management methods
    memoized.clear = function () {
        cache.clear();
    };

    memoized.delete = function (...args) {
        const key = keyGenerator(...args);
        return cache.delete(key);
    };

    memoized.has = function (...args) {
        const key = keyGenerator(...args);
        if (!cache.has(key)) return false;

        const entry = cache.get(key);
        if (Date.now() - entry.timestamp >= ttl) {
            cache.delete(key);
            return false;
        }
        return true;
    };

    memoized.size = function () {
        return cache.size;
    };

    memoized.stats = function () {
        let totalHits = 0;
        let expired = 0;
        const now = Date.now();

        for (const [key, entry] of cache.entries()) {
            if (now - entry.timestamp >= ttl) {
                expired++;
            } else {
                totalHits += entry.hits;
            }
        }

        return {
            size: cache.size,
            totalHits,
            expired,
            maxSize,
            ttl
        };
    };

    return memoized;
}

/**
 * Batches multiple requests and executes them in groups
 * @param {Array<Function>} requests - Array of async functions to execute
 * @param {number} batchSize - Number of requests per batch
 * @param {Object} options - Batch options
 * @param {number} options.delayBetweenBatches - Delay between batches in ms
 * @param {boolean} options.stopOnError - Stop execution on first error
 * @param {Function} options.onBatchComplete - Callback after each batch
 * @returns {Promise<Array>} Array of results (or errors)
 */
async function batchRequests(requests, batchSize = 5, options = {}) {
    const {
        delayBetweenBatches = 0,
        stopOnError = false,
        onBatchComplete = null
    } = options;

    if (!Array.isArray(requests) || requests.length === 0) {
        return [];
    }

    const results = [];
    const totalBatches = Math.ceil(requests.length / batchSize);

    for (let i = 0; i < requests.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1;
        const batch = requests.slice(i, i + batchSize);

        try {
            // Execute batch in parallel
            const batchResults = await Promise.allSettled(
                batch.map(async (request, index) => {
                    if (typeof request !== 'function') {
                        throw new Error(`Request at index ${i + index} is not a function`);
                    }
                    return await request();
                })
            );

            // Process results
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push({ success: true, value: result.value });
                } else {
                    results.push({ success: false, error: result.reason });
                    if (stopOnError) {
                        return results;
                    }
                }
            }

            // Callback after batch
            if (onBatchComplete) {
                onBatchComplete({
                    batchNumber,
                    totalBatches,
                    completed: Math.min(i + batchSize, requests.length),
                    total: requests.length,
                    batchResults
                });
            }

            // Delay between batches (except for last batch)
            if (delayBetweenBatches > 0 && i + batchSize < requests.length) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }

        } catch (error) {
            console.error(`Batch ${batchNumber} failed:`, error);
            if (stopOnError) {
                throw error;
            }
        }
    }

    return results;
}

/**
 * Retries a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {Object} options - Retry options
 * @param {number} options.maxDelay - Maximum delay cap in ms
 * @param {number} options.factor - Exponential factor (default: 2)
 * @param {boolean} options.jitter - Add random jitter to delays
 * @param {Function} options.shouldRetry - Custom retry condition function
 * @param {Function} options.onRetry - Callback before each retry
 * @returns {Promise<any>} Result of successful execution
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000, options = {}) {
    const {
        maxDelay = 30000,
        factor = 2,
        jitter = true,
        shouldRetry = () => true,
        onRetry = null
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (attempt >= maxRetries) {
                break;
            }

            // Check custom retry condition
            if (!shouldRetry(error, attempt)) {
                break;
            }

            // Calculate delay with exponential backoff
            let delay = Math.min(
                baseDelay * Math.pow(factor, attempt),
                maxDelay
            );

            // Add jitter (0-25% of delay)
            if (jitter) {
                delay = delay * (1 + Math.random() * 0.25);
            }

            // Callback before retry
            if (onRetry) {
                onRetry({
                    attempt: attempt + 1,
                    maxRetries,
                    delay,
                    error
                });
            }

            console.log(
                `Retry ${attempt + 1}/${maxRetries} after ${delay.toFixed(0)}ms: ${error.message}`
            );

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // All retries exhausted
    throw new Error(
        `Failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`
    );
}

// Export all utilities
export {
    measureTime,
    debounce,
    throttle,
    memoize,
    batchRequests,
    retryWithBackoff
};
