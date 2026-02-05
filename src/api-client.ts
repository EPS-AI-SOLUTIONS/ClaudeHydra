/**
 * @fileoverview Universal API Client with advanced features
 *
 * Features:
 * - Retry with exponential backoff
 * - Rate limiting (429) handling with Retry-After header support
 * - Timeout handling with AbortController
 * - Response caching with LRU cache
 * - Request/response logging with correlation ID
 * - Custom headers and Bearer token authorization
 * - Comprehensive statistics tracking
 *
 * Based on ClaudeHYDRA patterns for robust API communication.
 *
 * @module api-client
 */

import { createLogger } from './logger.js';
import { LRUCache } from './lru-cache.js';
import { createHash, randomBytes } from 'crypto';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base API Error class
 * @extends Error
 */
export class ApiError extends Error {
  /**
   * Creates a new ApiError
   * @param {string} message - Error message
   * @param {Object} options - Error options
   * @param {number} [options.statusCode] - HTTP status code
   * @param {string} [options.url] - Request URL
   * @param {string} [options.method] - HTTP method
   * @param {Object} [options.response] - Response body
   * @param {Object} [options.headers] - Response headers
   * @param {string} [options.correlationId] - Request correlation ID
   * @param {Error} [options.cause] - Original error
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = options.statusCode || 0;
    this.url = options.url || '';
    this.method = options.method || '';
    this.response = options.response || null;
    this.headers = options.headers || {};
    this.correlationId = options.correlationId || '';
    this.cause = options.cause || null;
    this.timestamp = new Date().toISOString();
    this.isRetryable = this.statusCode >= 500 || this.statusCode === 0;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to JSON representation
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      url: this.url,
      method: this.method,
      correlationId: this.correlationId,
      timestamp: this.timestamp,
      isRetryable: this.isRetryable,
      response: this.response
    };
  }
}

/**
 * Rate Limit Error - thrown when API returns 429
 * @extends ApiError
 */
export class RateLimitError extends ApiError {
  /**
   * Creates a new RateLimitError
   * @param {string} message - Error message
   * @param {Object} options - Error options
   * @param {number} [options.retryAfter] - Seconds until retry is allowed
   * @param {number} [options.limit] - Rate limit threshold
   * @param {number} [options.remaining] - Remaining requests
   * @param {number} [options.resetAt] - Timestamp when limit resets
   */
  constructor(message, options = {}) {
    super(message, { ...options, statusCode: 429 });
    this.name = 'RateLimitError';
    this.retryAfter = options.retryAfter || 60;
    this.limit = options.limit || null;
    this.remaining = options.remaining || 0;
    this.resetAt = options.resetAt || null;
    this.isRetryable = true;
  }

  /**
   * Convert to JSON representation
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
      limit: this.limit,
      remaining: this.remaining,
      resetAt: this.resetAt
    };
  }
}

/**
 * Timeout Error - thrown when request exceeds time limit
 * @extends ApiError
 */
export class TimeoutError extends ApiError {
  /**
   * Creates a new TimeoutError
   * @param {string} message - Error message
   * @param {Object} options - Error options
   * @param {number} [options.timeoutMs] - Timeout duration in milliseconds
   */
  constructor(message, options = {}) {
    super(message, { ...options, statusCode: 408 });
    this.name = 'TimeoutError';
    this.timeoutMs = options.timeoutMs || 0;
    this.isRetryable = true;
  }

  /**
   * Convert to JSON representation
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      timeoutMs: this.timeoutMs
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique correlation ID for request tracking
 * @returns {string} Correlation ID (16 hex characters)
 */
export function generateCorrelationId() {
  return randomBytes(8).toString('hex');
}

/**
 * Create a wrapper that adds correlation ID to all log calls
 * @param {Object} logger - Logger instance
 * @param {string} correlationId - Correlation ID to attach
 * @returns {Object} Wrapped logger
 */
export function withCorrelationId(logger, correlationId) {
  const methods = ['error', 'warn', 'info', 'http', 'debug', 'trace'];
  const wrapped = {};

  for (const method of methods) {
    wrapped[method] = (message, meta = {}) => {
      logger[method](message, { ...meta, correlationId });
    };
  }

  return wrapped;
}

/**
 * Generate cache key from request parameters
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Object} params - Query parameters
 * @param {*} body - Request body
 * @returns {string} Cache key hash
 */
function generateCacheKey(method, url, params = {}, body = null) {
  const data = JSON.stringify({ method, url, params, body });
  return createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Sleep for specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @param {number} jitter - Jitter factor (0-1)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000, jitter = 0.1) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  const jitterAmount = cappedDelay * jitter * Math.random();
  return Math.floor(cappedDelay + jitterAmount);
}

// ============================================================================
// Statistics Tracker
// ============================================================================

/**
 * API Client Statistics Tracker
 */
class ApiStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.retries = 0;
    this.cacheHits = 0;
    this.rateLimitHits = 0;
    this.timeouts = 0;
    this.totalDurationMs = 0;
    this.startTime = Date.now();
    this.statusCodes = {};
    this.methodCounts = {};
  }

  recordRequest(method) {
    this.totalRequests++;
    this.methodCounts[method] = (this.methodCounts[method] || 0) + 1;
  }

  recordSuccess(statusCode, durationMs) {
    this.successfulRequests++;
    this.totalDurationMs += durationMs;
    this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;
  }

  recordFailure(statusCode = 0) {
    this.failedRequests++;
    if (statusCode > 0) {
      this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;
    }
  }

  recordRetry() {
    this.retries++;
  }

  recordCacheHit() {
    this.cacheHits++;
  }

  recordRateLimit() {
    this.rateLimitHits++;
  }

  recordTimeout() {
    this.timeouts++;
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const avgDuration = this.successfulRequests > 0
      ? Math.round(this.totalDurationMs / this.successfulRequests)
      : 0;
    const successRate = this.totalRequests > 0
      ? Math.round((this.successfulRequests / this.totalRequests) * 10000) / 100
      : 0;
    const cacheHitRate = (this.totalRequests + this.cacheHits) > 0
      ? Math.round((this.cacheHits / (this.totalRequests + this.cacheHits)) * 10000) / 100
      : 0;
    const requestsPerSecond = uptime > 0
      ? Math.round((this.totalRequests / (uptime / 1000)) * 100) / 100
      : 0;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      retries: this.retries,
      cacheHits: this.cacheHits,
      rateLimitHits: this.rateLimitHits,
      timeouts: this.timeouts,
      successRate,
      cacheHitRate,
      avgDurationMs: avgDuration,
      requestsPerSecond,
      uptimeMs: uptime,
      statusCodes: { ...this.statusCodes },
      methodCounts: { ...this.methodCounts }
    };
  }
}

// ============================================================================
// API Client Class
// ============================================================================

/**
 * Universal API Client with advanced features
 */
export class ApiClient {
  /**
   * Creates a new API Client
   * @param {Object} options - Configuration options
   * @param {string} [options.baseUrl=''] - Base URL for all requests
   * @param {Object} [options.headers={}] - Default headers for all requests
   * @param {string} [options.authToken] - Bearer token for authorization
   * @param {number} [options.timeout=30000] - Default timeout in milliseconds
   * @param {number} [options.maxRetries=3] - Maximum number of retries
   * @param {number} [options.retryDelay=1000] - Base delay between retries in ms
   * @param {number} [options.maxRetryDelay=30000] - Maximum retry delay in ms
   * @param {boolean} [options.enableCache=false] - Enable response caching
   * @param {number} [options.cacheMaxSize=100] - Maximum cache entries
   * @param {number} [options.cacheTtlMs=300000] - Cache TTL in milliseconds
   * @param {string[]} [options.cacheableMethods=['GET']] - Methods to cache
   * @param {boolean} [options.enableLogging=true] - Enable request/response logging
   * @param {string} [options.logLevel='http'] - Log level for requests
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };
    this.authToken = options.authToken || null;
    this.timeout = options.timeout ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.maxRetryDelay = options.maxRetryDelay ?? 30000;
    this.enableCache = options.enableCache ?? false;
    this.cacheableMethods = options.cacheableMethods ?? ['GET'];
    this.enableLogging = options.enableLogging ?? true;
    this.logLevel = options.logLevel ?? 'http';

    // Initialize cache if enabled
    if (this.enableCache) {
      this.cache = new LRUCache({
        maxSize: options.cacheMaxSize ?? 100,
        ttlMs: options.cacheTtlMs ?? 300000
      });
    } else {
      this.cache = null;
    }

    // Initialize statistics
    this.stats = new ApiStats();

    // Initialize logger
    this.logger = createLogger('api-client');
  }

  // ==========================================================================
  // Configuration Methods
  // ==========================================================================

  /**
   * Set authorization token
   * @param {string} token - Bearer token
   * @returns {ApiClient} This instance for chaining
   */
  setAuthToken(token) {
    this.authToken = token;
    return this;
  }

  /**
   * Set default header
   * @param {string} name - Header name
   * @param {string} value - Header value
   * @returns {ApiClient} This instance for chaining
   */
  setHeader(name, value) {
    this.defaultHeaders[name] = value;
    return this;
  }

  /**
   * Set multiple headers
   * @param {Object} headers - Headers object
   * @returns {ApiClient} This instance for chaining
   */
  setHeaders(headers) {
    Object.assign(this.defaultHeaders, headers);
    return this;
  }

  /**
   * Set base URL
   * @param {string} url - Base URL
   * @returns {ApiClient} This instance for chaining
   */
  setBaseUrl(url) {
    this.baseUrl = url;
    return this;
  }

  /**
   * Set timeout
   * @param {number} ms - Timeout in milliseconds
   * @returns {ApiClient} This instance for chaining
   */
  setTimeout(ms) {
    this.timeout = ms;
    return this;
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  /**
   * Perform GET request
   * @param {string} url - Request URL (relative or absolute)
   * @param {Object} [options={}] - Request options
   * @param {Object} [options.params] - Query parameters
   * @param {Object} [options.headers] - Additional headers
   * @param {number} [options.timeout] - Request timeout
   * @param {boolean} [options.useCache] - Use caching for this request
   * @returns {Promise<*>} Response data
   */
  async get(url, options = {}) {
    return this.request('GET', url, options);
  }

  /**
   * Perform POST request
   * @param {string} url - Request URL
   * @param {*} [body] - Request body
   * @param {Object} [options={}] - Request options
   * @returns {Promise<*>} Response data
   */
  async post(url, body, options = {}) {
    return this.request('POST', url, { ...options, body });
  }

  /**
   * Perform PUT request
   * @param {string} url - Request URL
   * @param {*} [body] - Request body
   * @param {Object} [options={}] - Request options
   * @returns {Promise<*>} Response data
   */
  async put(url, body, options = {}) {
    return this.request('PUT', url, { ...options, body });
  }

  /**
   * Perform DELETE request
   * @param {string} url - Request URL
   * @param {Object} [options={}] - Request options
   * @returns {Promise<*>} Response data
   */
  async delete(url, options = {}) {
    return this.request('DELETE', url, options);
  }

  /**
   * Perform PATCH request
   * @param {string} url - Request URL
   * @param {*} [body] - Request body
   * @param {Object} [options={}] - Request options
   * @returns {Promise<*>} Response data
   */
  async patch(url, body, options = {}) {
    return this.request('PATCH', url, { ...options, body });
  }

  // ==========================================================================
  // Core Request Method
  // ==========================================================================

  /**
   * Perform HTTP request with full options
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} [options={}] - Request options
   * @returns {Promise<*>} Response data
   */
  async request(method, url, options = {}) {
    const correlationId = generateCorrelationId();
    const log = this.enableLogging
      ? withCorrelationId(this.logger, correlationId)
      : { error: () => {}, warn: () => {}, info: () => {}, http: () => {}, debug: () => {} };

    const {
      params = {},
      body = null,
      headers = {},
      timeout = this.timeout,
      useCache = this.enableCache && this.cacheableMethods.includes(method),
      skipRetry = false,
      maxRetries = this.maxRetries
    } = options;

    // Build full URL
    const fullUrl = this.buildUrl(url, params);

    // Check cache first
    if (useCache && this.cache) {
      const cacheKey = generateCacheKey(method, fullUrl, params, body);
      const cached = this.cache.get(cacheKey);

      if (cached !== undefined) {
        this.stats.recordCacheHit();
        log.debug('Cache hit', { method, url: fullUrl, cacheKey });
        return cached;
      }
    }

    // Record request
    this.stats.recordRequest(method);
    const startTime = Date.now();

    log.http('Request started', {
      method,
      url: fullUrl,
      hasBody: body !== null,
      timeout
    });

    // Attempt request with retries
    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const result = await this._executeRequest(method, fullUrl, {
          body,
          headers,
          timeout,
          correlationId
        });

        const duration = Date.now() - startTime;
        this.stats.recordSuccess(result.status, duration);

        log.http('Request completed', {
          method,
          url: fullUrl,
          status: result.status,
          durationMs: duration,
          attempt
        });

        // Cache successful GET responses
        if (useCache && this.cache && result.data !== undefined) {
          const cacheKey = generateCacheKey(method, fullUrl, params, body);
          this.cache.set(cacheKey, result.data);
          log.debug('Response cached', { cacheKey });
        }

        return result.data;

      } catch (error) {
        lastError = error;

        // Handle rate limiting
        if (error instanceof RateLimitError) {
          this.stats.recordRateLimit();
          const waitTime = error.retryAfter * 1000;

          log.warn('Rate limited', {
            method,
            url: fullUrl,
            retryAfter: error.retryAfter,
            attempt
          });

          if (!skipRetry && attempt < maxRetries) {
            await sleep(waitTime);
            attempt++;
            this.stats.recordRetry();
            continue;
          }
        }

        // Handle timeouts
        if (error instanceof TimeoutError) {
          this.stats.recordTimeout();

          log.warn('Request timeout', {
            method,
            url: fullUrl,
            timeoutMs: error.timeoutMs,
            attempt
          });

          if (!skipRetry && attempt < maxRetries) {
            const backoff = calculateBackoff(attempt, this.retryDelay, this.maxRetryDelay);
            await sleep(backoff);
            attempt++;
            this.stats.recordRetry();
            continue;
          }
        }

        // Handle retryable errors (5xx, network errors)
        if (error.isRetryable && !skipRetry && attempt < maxRetries) {
          const backoff = calculateBackoff(attempt, this.retryDelay, this.maxRetryDelay);

          log.warn('Request failed, retrying', {
            method,
            url: fullUrl,
            error: error.message,
            attempt,
            nextRetryMs: backoff
          });

          await sleep(backoff);
          attempt++;
          this.stats.recordRetry();
          continue;
        }

        // Non-retryable error or max retries reached
        break;
      }
    }

    // All retries exhausted
    const duration = Date.now() - startTime;
    this.stats.recordFailure(lastError?.statusCode);

    log.error('Request failed', {
      method,
      url: fullUrl,
      error: lastError?.message,
      statusCode: lastError?.statusCode,
      attempts: attempt + 1,
      durationMs: duration
    });

    throw lastError;
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Build full URL with query parameters
   * @param {string} url - Request URL
   * @param {Object} params - Query parameters
   * @returns {string} Full URL
   * @private
   */
  buildUrl(url, params = {}) {
    // Handle absolute URLs
    const isAbsolute = url.startsWith('http://') || url.startsWith('https://');
    const baseUrl = isAbsolute ? '' : this.baseUrl;
    let fullUrl = baseUrl + url;

    // Add query parameters
    const queryParams = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');

    if (queryParams) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryParams;
    }

    return fullUrl;
  }

  /**
   * Build request headers
   * @param {Object} customHeaders - Custom headers
   * @param {string} correlationId - Correlation ID
   * @returns {Object} Headers object
   * @private
   */
  buildHeaders(customHeaders = {}, correlationId = '') {
    const headers = {
      ...this.defaultHeaders,
      ...customHeaders
    };

    // Add authorization header
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    // Add correlation ID
    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId;
    }

    return headers;
  }

  /**
   * Execute single request without retries
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response with status and data
   * @private
   */
  async _executeRequest(method, url, options = {}) {
    const { body, headers, timeout, correlationId } = options;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestHeaders = this.buildHeaders(headers, correlationId);

      const fetchOptions = {
        method,
        headers: requestHeaders,
        signal: controller.signal
      };

      // Add body for methods that support it
      if (body !== null && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Parse response
      let data;
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else if (contentType.includes('text/')) {
        data = await response.text();
      } else {
        // Try JSON first, fall back to text
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      // Handle error responses
      if (!response.ok) {
        // Rate limiting
        if (response.status === 429) {
          const retryAfter = this._parseRetryAfter(response.headers.get('retry-after'));
          throw new RateLimitError(`Rate limit exceeded: ${response.statusText}`, {
            statusCode: 429,
            url,
            method,
            response: data,
            correlationId,
            retryAfter,
            limit: parseInt(response.headers.get('x-ratelimit-limit'), 10) || null,
            remaining: parseInt(response.headers.get('x-ratelimit-remaining'), 10) || 0,
            resetAt: response.headers.get('x-ratelimit-reset') || null
          });
        }

        // Other errors
        throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, {
          statusCode: response.status,
          url,
          method,
          response: data,
          headers: Object.fromEntries(response.headers.entries()),
          correlationId
        });
      }

      return {
        status: response.status,
        data,
        headers: Object.fromEntries(response.headers.entries())
      };

    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timeout after ${timeout}ms`, {
          url,
          method,
          timeoutMs: timeout,
          correlationId
        });
      }

      // Re-throw our custom errors
      if (error instanceof ApiError) {
        throw error;
      }

      // Wrap other errors
      throw new ApiError(`Network error: ${error.message}`, {
        url,
        method,
        correlationId,
        cause: error
      });
    }
  }

  /**
   * Parse Retry-After header value
   * @param {string|null} value - Header value
   * @returns {number} Seconds to wait
   * @private
   */
  _parseRetryAfter(value) {
    if (!value) return 60;

    // Try parsing as number (seconds)
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds)) return seconds;

    // Try parsing as HTTP date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const diff = Math.max(0, (date.getTime() - Date.now()) / 1000);
      return Math.ceil(diff);
    }

    return 60; // Default fallback
  }

  // ==========================================================================
  // Cache Methods
  // ==========================================================================

  /**
   * Clear the response cache
   */
  clearCache() {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object|null} Cache statistics or null if caching disabled
   */
  getCacheStats() {
    if (this.cache) {
      return this.cache.getStats();
    }
    return null;
  }

  /**
   * Invalidate cache entry for specific request
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} [params={}] - Query parameters
   */
  invalidateCache(method, url, params = {}) {
    if (this.cache) {
      const fullUrl = this.buildUrl(url, params);
      const cacheKey = generateCacheKey(method, fullUrl, params);
      this.cache.delete(cacheKey);
    }
  }

  // ==========================================================================
  // Statistics Methods
  // ==========================================================================

  /**
   * Get request statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return this.stats.getStats();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.reset();
  }

  // ==========================================================================
  // Factory Methods
  // ==========================================================================

  /**
   * Create a new client with merged options
   * @param {Object} options - Additional options to merge
   * @returns {ApiClient} New client instance
   */
  extend(options = {}) {
    return new ApiClient({
      baseUrl: this.baseUrl,
      headers: { ...this.defaultHeaders },
      authToken: this.authToken,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      maxRetryDelay: this.maxRetryDelay,
      enableCache: this.enableCache,
      enableLogging: this.enableLogging,
      ...options
    });
  }
}

// ============================================================================
// Default Instance and Factory
// ============================================================================

/**
 * Create a new API client instance
 * @param {Object} options - Client options
 * @returns {ApiClient} API client instance
 */
export function createApiClient(options = {}) {
  return new ApiClient(options);
}

/**
 * Default API client instance
 */
export const defaultClient = new ApiClient();

export default ApiClient;
