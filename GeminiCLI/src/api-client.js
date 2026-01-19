/**
 * HYDRA Universal API Client
 * Agent: Philippa (Integration/API)
 *
 * Features:
 * - HTTP methods: GET, POST, PUT, DELETE
 * - Retry with exponential backoff
 * - Rate limiting (429) handling
 * - Automatic headers (Authorization, Content-Type)
 * - Timeout handling
 * - Response caching (optional)
 * - Request/response logging with correlation ID
 */

import { createHash } from 'crypto';
import {
  createLogger,
  generateCorrelationId,
  withCorrelationId
} from './logger.js';
import { LRUCache } from './lru-cache.js';

const logger = createLogger('api-client');

/**
 * Default configuration for ApiClient
 */
const DEFAULT_CONFIG = {
  baseUrl: '',
  timeout: 30000,
  maxRetries: 3,
  retryDelayBase: 1000,
  retryDelayMax: 30000,
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  cacheEnabled: false,
  cacheTtlMs: 300000, // 5 minutes
  cacheMaxSize: 100,
  logRequests: true,
  logResponses: true
};

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(message, status, response, correlationId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
    this.correlationId = correlationId;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      correlationId: this.correlationId,
      timestamp: this.timestamp
    };
  }
}

/**
 * Rate Limit Error class
 */
export class RateLimitError extends ApiError {
  constructor(message, retryAfter, correlationId) {
    super(message, 429, null, correlationId);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Timeout Error class
 */
export class TimeoutError extends ApiError {
  constructor(message, correlationId) {
    super(message, 0, null, correlationId);
    this.name = 'TimeoutError';
  }
}

/**
 * Universal API Client class
 */
export class ApiClient {
  /**
   * @param {Object} config - Configuration options
   * @param {string} config.baseUrl - Base URL for all requests
   * @param {number} config.timeout - Request timeout in ms
   * @param {number} config.maxRetries - Maximum retry attempts
   * @param {number} config.retryDelayBase - Base delay for exponential backoff
   * @param {number} config.retryDelayMax - Maximum retry delay
   * @param {number[]} config.retryStatusCodes - HTTP status codes to retry
   * @param {Object} config.headers - Default headers
   * @param {string} config.authToken - Authorization token
   * @param {string} config.authType - Authorization type (Bearer, Basic, etc.)
   * @param {boolean} config.cacheEnabled - Enable response caching
   * @param {number} config.cacheTtlMs - Cache TTL in ms
   * @param {number} config.cacheMaxSize - Maximum cache entries
   * @param {boolean} config.logRequests - Log outgoing requests
   * @param {boolean} config.logResponses - Log incoming responses
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize cache if enabled
    if (this.config.cacheEnabled) {
      this.cache = new LRUCache({
        maxSize: this.config.cacheMaxSize,
        ttlMs: this.config.cacheTtlMs
      });
    }

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimitHits: 0,
      timeouts: 0
    };

    logger.info('ApiClient initialized', {
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      cacheEnabled: this.config.cacheEnabled
    });
  }

  /**
   * Generate cache key from request parameters
   */
  _generateCacheKey(method, url, body) {
    const data = JSON.stringify({ method, url, body });
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  _calculateRetryDelay(attempt, retryAfter = null) {
    if (retryAfter !== null) {
      return Math.min(retryAfter * 1000, this.config.retryDelayMax);
    }

    // Exponential backoff with jitter
    const exponentialDelay = this.config.retryDelayBase * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
    return Math.min(exponentialDelay + jitter, this.config.retryDelayMax);
  }

  /**
   * Parse Retry-After header
   */
  _parseRetryAfter(headers) {
    const retryAfter = headers.get('retry-after');
    if (!retryAfter) return null;

    // Check if it's a number (seconds) or date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds;
    }

    // Try parsing as date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
    }

    return null;
  }

  /**
   * Build full URL
   */
  _buildUrl(endpoint, params = {}) {
    const url = new URL(endpoint, this.config.baseUrl || undefined);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    return url.toString();
  }

  /**
   * Build request headers
   */
  _buildHeaders(customHeaders = {}) {
    const headers = { ...this.config.headers, ...customHeaders };

    // Add authorization header if configured
    if (this.config.authToken) {
      const authType = this.config.authType || 'Bearer';
      headers['Authorization'] = `${authType} ${this.config.authToken}`;
    }

    return headers;
  }

  /**
   * Sleep utility for retry delays
   */
  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute request with retry logic
   */
  async _executeWithRetry(method, url, options, correlationId) {
    let lastError;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const requestOptions = {
          method,
          headers: this._buildHeaders(options.headers),
          signal: controller.signal
        };

        // Add body for non-GET requests
        if (options.body && method !== 'GET') {
          requestOptions.body = typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
        }

        // Log request
        if (this.config.logRequests) {
          logger.info('API Request', {
            correlationId,
            method,
            url,
            attempt: attempt + 1,
            headers: Object.keys(requestOptions.headers)
          });
        }

        const startTime = Date.now();
        const response = await fetch(url, requestOptions);
        const duration = Date.now() - startTime;

        clearTimeout(timeoutId);

        // Log response
        if (this.config.logResponses) {
          logger.info('API Response', {
            correlationId,
            status: response.status,
            duration: `${duration}ms`,
            headers: Object.fromEntries(response.headers.entries())
          });
        }

        // Handle rate limiting
        if (response.status === 429) {
          this.stats.rateLimitHits++;
          const retryAfter = this._parseRetryAfter(response.headers);

          if (attempt < this.config.maxRetries) {
            const delay = this._calculateRetryDelay(attempt, retryAfter);
            logger.warn('Rate limited, retrying', {
              correlationId,
              retryAfter,
              delay,
              attempt: attempt + 1
            });
            this.stats.retries++;
            await this._sleep(delay);
            continue;
          }

          throw new RateLimitError(
            'Rate limit exceeded',
            retryAfter,
            correlationId
          );
        }

        // Handle other retryable status codes
        if (this.config.retryStatusCodes.includes(response.status)) {
          if (attempt < this.config.maxRetries) {
            const delay = this._calculateRetryDelay(attempt);
            logger.warn('Retryable error, retrying', {
              correlationId,
              status: response.status,
              delay,
              attempt: attempt + 1
            });
            this.stats.retries++;
            await this._sleep(delay);
            continue;
          }
        }

        // Parse response
        const contentType = response.headers.get('content-type') || '';
        let data;

        if (contentType.includes('application/json')) {
          data = await response.json();
        } else if (contentType.includes('text/')) {
          data = await response.text();
        } else {
          data = await response.arrayBuffer();
        }

        // Handle error responses
        if (!response.ok) {
          throw new ApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            data,
            correlationId
          );
        }

        return {
          data,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          duration,
          correlationId
        };

      } catch (error) {
        // Handle timeout
        if (error.name === 'AbortError') {
          this.stats.timeouts++;
          lastError = new TimeoutError(
            `Request timeout after ${this.config.timeout}ms`,
            correlationId
          );

          if (attempt < this.config.maxRetries) {
            const delay = this._calculateRetryDelay(attempt);
            logger.warn('Request timeout, retrying', {
              correlationId,
              timeout: this.config.timeout,
              delay,
              attempt: attempt + 1
            });
            this.stats.retries++;
            await this._sleep(delay);
            continue;
          }
        } else {
          lastError = error;
        }

        // Last attempt failed
        if (attempt === this.config.maxRetries) {
          logger.error('Request failed after all retries', {
            correlationId,
            error: lastError.message,
            attempts: attempt + 1
          });
        }
      }
    }

    throw lastError;
  }

  /**
   * Main request method
   */
  async request(method, endpoint, options = {}) {
    const correlationId = options.correlationId || generateCorrelationId();
    this.stats.totalRequests++;

    return withCorrelationId(correlationId, async () => {
      const url = this._buildUrl(endpoint, options.params);

      // Check cache for GET requests
      if (method === 'GET' && this.config.cacheEnabled && !options.skipCache) {
        const cacheKey = this._generateCacheKey(method, url, null);
        const cached = this.cache.get(cacheKey);

        if (cached) {
          this.stats.cacheHits++;
          logger.debug('Cache hit', { correlationId, url });
          return { ...cached, cached: true, correlationId };
        }
        this.stats.cacheMisses++;
      }

      try {
        const result = await this._executeWithRetry(method, url, options, correlationId);
        this.stats.successfulRequests++;

        // Cache successful GET responses
        if (method === 'GET' && this.config.cacheEnabled && !options.skipCache) {
          const cacheKey = this._generateCacheKey(method, url, null);
          this.cache.set(cacheKey, {
            data: result.data,
            status: result.status,
            headers: result.headers,
            duration: result.duration
          }, options.cacheTtl || this.config.cacheTtlMs);
          logger.debug('Response cached', { correlationId, url });
        }

        return { ...result, cached: false };

      } catch (error) {
        this.stats.failedRequests++;
        throw error;
      }
    });
  }

  /**
   * GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @param {Object} options.params - Query parameters
   * @param {Object} options.headers - Custom headers
   * @param {boolean} options.skipCache - Skip cache lookup
   * @param {number} options.cacheTtl - Custom cache TTL
   * @param {string} options.correlationId - Correlation ID
   */
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, options);
  }

  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @param {Object} options - Request options
   */
  async post(endpoint, body, options = {}) {
    return this.request('POST', endpoint, { ...options, body });
  }

  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @param {Object} options - Request options
   */
  async put(endpoint, body, options = {}) {
    return this.request('PUT', endpoint, { ...options, body });
  }

  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   */
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, options);
  }

  /**
   * PATCH request
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @param {Object} options - Request options
   */
  async patch(endpoint, body, options = {}) {
    return this.request('PATCH', endpoint, { ...options, body });
  }

  /**
   * Set authorization token
   */
  setAuthToken(token, type = 'Bearer') {
    this.config.authToken = token;
    this.config.authType = type;
    logger.info('Auth token updated', { authType: type });
    return this;
  }

  /**
   * Clear authorization token
   */
  clearAuthToken() {
    this.config.authToken = null;
    this.config.authType = null;
    logger.info('Auth token cleared');
    return this;
  }

  /**
   * Set default header
   */
  setHeader(key, value) {
    this.config.headers[key] = value;
    return this;
  }

  /**
   * Remove default header
   */
  removeHeader(key) {
    delete this.config.headers[key];
    return this;
  }

  /**
   * Update configuration
   */
  configure(config) {
    this.config = { ...this.config, ...config };

    // Reinitialize cache if settings changed
    if (config.cacheEnabled !== undefined || config.cacheMaxSize || config.cacheTtlMs) {
      if (this.config.cacheEnabled) {
        this.cache = new LRUCache({
          maxSize: this.config.cacheMaxSize,
          ttlMs: this.config.cacheTtlMs
        });
      } else {
        this.cache = null;
      }
    }

    logger.info('Configuration updated', config);
    return this;
  }

  /**
   * Clear response cache
   */
  clearCache() {
    if (this.cache) {
      this.cache.clear();
      logger.info('Cache cleared');
    }
    return this;
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheStats: this.cache ? this.cache.getStats() : null,
      successRate: this.stats.totalRequests > 0
        ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimitHits: 0,
      timeouts: 0
    };
    if (this.cache) {
      this.cache.resetStats();
    }
    logger.info('Statistics reset');
    return this;
  }
}

/**
 * Create a pre-configured API client instance
 */
export function createApiClient(config) {
  return new ApiClient(config);
}

/**
 * Default singleton instance
 */
let defaultClient = null;

/**
 * Get or create default API client
 */
export function getDefaultClient(config = {}) {
  if (!defaultClient) {
    defaultClient = new ApiClient(config);
  }
  return defaultClient;
}

export default ApiClient;
