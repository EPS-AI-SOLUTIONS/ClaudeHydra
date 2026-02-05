/**
 * HTTP Transport for MCP
 *
 * Handles communication with MCP servers via HTTP/REST.
 * Supports standard request/response pattern.
 *
 * @module src/mcp/transports/http
 */

import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

/**
 * Transport states
 * @enum {string}
 */
export const TransportState = {
  IDLE: 'idle',
  READY: 'ready',
  CLOSED: 'closed',
  ERROR: 'error'
};

// ============================================================================
// HTTP Transport Class
// ============================================================================

/**
 * HTTP Transport
 *
 * Manages HTTP-based communication with MCP servers.
 *
 * @extends EventEmitter
 * @fires HttpTransport#ready
 * @fires HttpTransport#message
 * @fires HttpTransport#error
 * @fires HttpTransport#close
 */
export class HttpTransport extends EventEmitter {
  /**
   * @param {Object} config - Transport configuration
   * @param {string} config.url - Server URL
   * @param {Object} [config.headers] - Default headers
   * @param {number} [config.timeout] - Request timeout in ms
   * @param {Object} [config.retry] - Retry configuration
   */
  constructor(config) {
    super();

    this.config = {
      url: config.url,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      timeout: config.timeout || 30000,
      retry: {
        maxRetries: config.retry?.maxRetries ?? 3,
        baseDelay: config.retry?.baseDelay ?? 1000,
        maxDelay: config.retry?.maxDelay ?? 10000,
        backoffMultiplier: config.retry?.backoffMultiplier ?? 2
      }
    };

    /** @type {TransportState} */
    this.state = TransportState.IDLE;

    /** @type {number} */
    this.requestId = 0;

    /** @type {AbortController | null} */
    this.abortController = null;
  }

  /**
   * Start the transport (verify connectivity)
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.state !== TransportState.IDLE) {
      throw new Error(`Cannot start transport in state: ${this.state}`);
    }

    try {
      // Verify connectivity with a simple request
      this.abortController = new AbortController();

      const response = await fetch(this.config.url, {
        method: 'HEAD',
        headers: this.config.headers,
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      this.state = TransportState.READY;
      this.emit('ready');
    } catch (error) {
      // Even if HEAD fails, server might still work for POST
      // Mark as ready and let actual requests determine availability
      this.state = TransportState.READY;
      this.emit('ready');
    }
  }

  /**
   * Send a JSON-RPC request
   *
   * @param {string} method - Method name
   * @param {Object} [params] - Method parameters
   * @param {number} [timeout] - Request timeout in ms
   * @returns {Promise<any>}
   */
  async request(method, params = {}, timeout) {
    if (this.state !== TransportState.READY) {
      throw new Error(`Transport not ready, current state: ${this.state}`);
    }

    const id = ++this.requestId;
    const requestTimeout = timeout || this.config.timeout;

    const message = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    return this.sendWithRetry(message, requestTimeout);
  }

  /**
   * Send request with retry logic
   *
   * @param {Object} message - JSON-RPC message
   * @param {number} timeout - Request timeout
   * @param {number} [attempt=0] - Current attempt number
   * @returns {Promise<any>}
   */
  async sendWithRetry(message, timeout, attempt = 0) {
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new MCPError(data.error);
      }

      return data.result;
    } catch (error) {
      // Check if we should retry
      if (attempt < this.config.retry.maxRetries && this.isRetryableError(error)) {
        const delay = Math.min(
          this.config.retry.baseDelay * Math.pow(this.config.retry.backoffMultiplier, attempt),
          this.config.retry.maxDelay
        );

        await this.sleep(delay);

        return this.sendWithRetry(message, timeout, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Send a JSON-RPC notification (fire and forget)
   *
   * @param {string} method - Method name
   * @param {Object} [params] - Method parameters
   */
  async notify(method, params = {}) {
    if (this.state !== TransportState.READY) {
      throw new Error(`Transport not ready, current state: ${this.state}`);
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params
    };

    // Fire and forget - don't await response
    fetch(this.config.url, {
      method: 'POST',
      headers: this.config.headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5000)
    }).catch((error) => {
      this.emit('error', error);
    });
  }

  /**
   * Check if error is retryable
   *
   * @param {Error} error - Error to check
   * @returns {boolean}
   */
  isRetryableError(error) {
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }

    // Timeout errors
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return true;
    }

    // HTTP 5xx errors
    if (error.message?.includes('HTTP error: 5')) {
      return true;
    }

    // Connection errors
    if (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Sleep utility
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close the transport
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.state === TransportState.CLOSED) {
      return;
    }

    if (this.abortController) {
      this.abortController.abort();
    }

    this.state = TransportState.CLOSED;
    this.emit('close');
  }

  /**
   * Check if transport is ready
   *
   * @returns {boolean}
   */
  isReady() {
    return this.state === TransportState.READY;
  }

  /**
   * Get transport info
   *
   * @returns {Object}
   */
  getInfo() {
    return {
      type: 'http',
      url: this.config.url,
      state: this.state,
      requestCount: this.requestId
    };
  }
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * MCP Error from server response
 */
export class MCPError extends Error {
  constructor(errorObj) {
    super(errorObj.message || 'Unknown MCP error');
    this.name = 'MCPError';
    this.code = errorObj.code;
    this.data = errorObj.data;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an HTTP transport
 *
 * @param {Object} config - Server configuration
 * @returns {HttpTransport}
 */
export function createHttpTransport(config) {
  return new HttpTransport({
    url: config.url,
    headers: config.headers,
    timeout: config.timeout,
    retry: config.retry
  });
}

export default HttpTransport;
