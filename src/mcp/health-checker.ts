/**
 * MCP Health Checker
 *
 * Monitors health of MCP server connections with TTL caching.
 * Provides periodic health checks and status reporting.
 *
 * @module src/mcp/health-checker
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Constants
// ============================================================================

/**
 * Health status enum
 * @enum {string}
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
};

// ============================================================================
// TTL Cache
// ============================================================================

/**
 * TTL Cache for health check results
 */
export class TTLCache {
  /**
   * @param {Object} options - Cache options
   * @param {number} [options.defaultTTL=30000] - Default TTL in ms
   * @param {number} [options.maxSize=100] - Maximum cache size
   */
  constructor(options = {}) {
    this.defaultTTL = options.defaultTTL || 30000;
    this.maxSize = options.maxSize || 100;

    /** @type {Map<string, { value: any, expires: number }>} */
    this.cache = new Map();
  }

  /**
   * Get value from cache
   *
   * @param {string} key - Cache key
   * @returns {any | null}
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set value in cache
   *
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} [ttl] - TTL in ms (uses default if not provided)
   */
  set(key, value, ttl) {
    // Enforce max size
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl || this.defaultTTL),
    });
  }

  /**
   * Check if key exists and is not expired
   *
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   *
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns {Object}
   */
  getStats() {
    let valid = 0;
    let expired = 0;
    const now = Date.now();

    for (const [, entry] of this.cache) {
      if (now > entry.expires) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
    };
  }

  /**
   * Clean up expired entries
   *
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expires) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

// ============================================================================
// Health Check Result
// ============================================================================

/**
 * @typedef {Object} HealthCheckResult
 * @property {string} serverId - Server identifier
 * @property {HealthStatus} status - Health status
 * @property {boolean} available - Whether server is available
 * @property {number} latency - Response time in ms
 * @property {Date} timestamp - Check timestamp
 * @property {Object} [details] - Additional details
 * @property {Error} [error] - Error if check failed
 */

// ============================================================================
// Health Checker Class
// ============================================================================

/**
 * MCP Health Checker
 *
 * @extends EventEmitter
 * @fires HealthChecker#healthCheck
 * @fires HealthChecker#healthChanged
 * @fires HealthChecker#error
 */
export class HealthChecker extends EventEmitter {
  /**
   * @param {Object} options - Checker options
   * @param {number} [options.defaultInterval=60000] - Default check interval
   * @param {number} [options.defaultTimeout=5000] - Default check timeout
   * @param {number} [options.cacheTTL=30000] - Cache TTL in ms
   * @param {number} [options.degradedThreshold=1000] - Latency threshold for degraded status
   */
  constructor(options = {}) {
    super();

    this.defaultInterval = options.defaultInterval || 60000;
    this.defaultTimeout = options.defaultTimeout || 5000;
    this.cacheTTL = options.cacheTTL || 30000;
    this.degradedThreshold = options.degradedThreshold || 1000;

    /** @type {TTLCache} */
    this.cache = new TTLCache({ defaultTTL: this.cacheTTL });

    /** @type {Map<string, NodeJS.Timeout>} */
    this.intervals = new Map();

    /** @type {Map<string, HealthCheckResult>} */
    this.lastResults = new Map();

    /** @type {boolean} */
    this.isRunning = false;
  }

  /**
   * Check health of a server
   *
   * @param {string} serverId - Server identifier
   * @param {Object} transport - Transport instance
   * @param {Object} [options] - Check options
   * @param {number} [options.timeout] - Check timeout
   * @param {boolean} [options.useCache=true] - Use cached result if available
   * @returns {Promise<HealthCheckResult>}
   */
  async check(serverId, transport, options = {}) {
    const { timeout = this.defaultTimeout, useCache = true } = options;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(serverId);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();

    /** @type {HealthCheckResult} */
    let result;

    try {
      // Check if transport is ready
      if (!transport.isReady()) {
        result = {
          serverId,
          status: HealthStatus.UNHEALTHY,
          available: false,
          latency: 0,
          timestamp: new Date(),
          error: new Error('Transport not ready'),
        };
      } else {
        // Perform actual health check
        const checkPromise = this.performCheck(transport, timeout);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), timeout);
        });

        await Promise.race([checkPromise, timeoutPromise]);

        const latency = Date.now() - startTime;

        result = {
          serverId,
          status: this.determineStatus(latency),
          available: true,
          latency,
          timestamp: new Date(),
          details: {
            responseTime: latency,
            transportInfo: transport.getInfo?.() || transport.getProcessInfo?.(),
          },
        };
      }
    } catch (error) {
      result = {
        serverId,
        status: HealthStatus.UNHEALTHY,
        available: false,
        latency: Date.now() - startTime,
        timestamp: new Date(),
        error,
      };
    }

    // Update cache
    this.cache.set(serverId, result);

    // Check for status change
    const previousResult = this.lastResults.get(serverId);
    if (previousResult && previousResult.status !== result.status) {
      this.emit('healthChanged', {
        serverId,
        previous: previousResult,
        current: result,
      });
    }

    this.lastResults.set(serverId, result);
    this.emit('healthCheck', result);

    return result;
  }

  /**
   * Perform the actual health check
   *
   * @param {Object} transport - Transport instance
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<void>}
   */
  async performCheck(transport, timeout) {
    // Try to list tools as a health check
    // This is a lightweight operation that most MCP servers support
    try {
      await transport.request('tools/list', {}, timeout);
    } catch (error) {
      // Some servers might not support tools/list
      // Try a ping or just verify the transport is connected
      if (transport.isReady()) {
        return; // Transport is ready, consider it healthy
      }
      throw error;
    }
  }

  /**
   * Determine health status based on latency
   *
   * @param {number} latency - Response latency in ms
   * @returns {HealthStatus}
   */
  determineStatus(latency) {
    if (latency > this.degradedThreshold) {
      return HealthStatus.DEGRADED;
    }
    return HealthStatus.HEALTHY;
  }

  /**
   * Start periodic health checks for a server
   *
   * @param {string} serverId - Server identifier
   * @param {Object} transport - Transport instance
   * @param {Object} [config] - Health check config
   * @param {number} [config.interval] - Check interval
   * @param {number} [config.timeout] - Check timeout
   */
  startMonitoring(serverId, transport, config = {}) {
    // Stop existing monitor if any
    this.stopMonitoring(serverId);

    const interval = config.interval || this.defaultInterval;
    const timeout = config.timeout || this.defaultTimeout;

    // Perform initial check
    this.check(serverId, transport, { timeout, useCache: false }).catch((error) => {
      this.emit('error', { serverId, error });
    });

    // Set up interval
    const timer = setInterval(async () => {
      try {
        await this.check(serverId, transport, { timeout, useCache: false });
      } catch (error) {
        this.emit('error', { serverId, error });
      }
    }, interval);

    this.intervals.set(serverId, timer);
  }

  /**
   * Stop periodic health checks for a server
   *
   * @param {string} serverId - Server identifier
   */
  stopMonitoring(serverId) {
    const timer = this.intervals.get(serverId);

    if (timer) {
      clearInterval(timer);
      this.intervals.delete(serverId);
    }
  }

  /**
   * Stop all health monitoring
   */
  stopAllMonitoring() {
    for (const [serverId] of this.intervals) {
      this.stopMonitoring(serverId);
    }
  }

  /**
   * Get last health check result for a server
   *
   * @param {string} serverId - Server identifier
   * @returns {HealthCheckResult | null}
   */
  getLastResult(serverId) {
    return this.lastResults.get(serverId) ?? null;
  }

  /**
   * Get all last health check results
   *
   * @returns {Map<string, HealthCheckResult>}
   */
  getAllResults() {
    return new Map(this.lastResults);
  }

  /**
   * Get summary of all server health
   *
   * @returns {Object}
   */
  getSummary() {
    const results = Array.from(this.lastResults.values());

    const summary = {
      total: results.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
      averageLatency: 0,
    };

    let totalLatency = 0;
    let latencyCount = 0;

    for (const result of results) {
      switch (result.status) {
        case HealthStatus.HEALTHY:
          summary.healthy++;
          break;
        case HealthStatus.DEGRADED:
          summary.degraded++;
          break;
        case HealthStatus.UNHEALTHY:
          summary.unhealthy++;
          break;
        default:
          summary.unknown++;
      }

      if (result.available) {
        totalLatency += result.latency;
        latencyCount++;
      }
    }

    summary.averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    return summary;
  }

  /**
   * Force refresh health for a server
   *
   * @param {string} serverId - Server identifier
   * @param {Object} transport - Transport instance
   * @returns {Promise<HealthCheckResult>}
   */
  async refresh(serverId, transport) {
    this.cache.delete(serverId);
    return this.check(serverId, transport, { useCache: false });
  }

  /**
   * Clear all cached results
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get monitored server IDs
   *
   * @returns {string[]}
   */
  getMonitoredServers() {
    return Array.from(this.intervals.keys());
  }

  /**
   * Check if server is being monitored
   *
   * @param {string} serverId - Server identifier
   * @returns {boolean}
   */
  isMonitoring(serverId) {
    return this.intervals.has(serverId);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create health checker instance
 *
 * @param {Object} [options] - Checker options
 * @returns {HealthChecker}
 */
export function getHealthChecker(options = {}) {
  if (!_instance) {
    _instance = new HealthChecker(options);
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetHealthChecker() {
  if (_instance) {
    _instance.stopAllMonitoring();
    _instance.clearCache();
    _instance = null;
  }
}

export default HealthChecker;
