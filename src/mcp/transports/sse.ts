/**
 * SSE Transport for MCP
 *
 * Handles communication with MCP servers via Server-Sent Events.
 * Supports streaming responses and real-time updates.
 *
 * @module src/mcp/transports/sse
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Constants
// ============================================================================

/**
 * Transport states
 * @enum {string}
 */
export const TransportState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  READY: 'ready',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
  ERROR: 'error',
};

/**
 * SSE event types
 * @enum {string}
 */
export const SSEEventType = {
  MESSAGE: 'message',
  RESULT: 'result',
  ERROR: 'error',
  PING: 'ping',
  NOTIFICATION: 'notification',
};

// ============================================================================
// SSE Transport Class
// ============================================================================

/**
 * SSE Transport
 *
 * Manages SSE-based communication with MCP servers.
 *
 * @extends EventEmitter
 * @fires SseTransport#ready
 * @fires SseTransport#message
 * @fires SseTransport#error
 * @fires SseTransport#close
 * @fires SseTransport#reconnecting
 */
export class SseTransport extends EventEmitter {
  /**
   * @param {Object} config - Transport configuration
   * @param {string} config.url - SSE endpoint URL
   * @param {Object} [config.headers] - HTTP headers
   * @param {number} [config.timeout] - Request timeout in ms
   * @param {Object} [config.reconnect] - Reconnect configuration
   */
  constructor(config) {
    super();

    this.config = {
      url: config.url,
      headers: config.headers || {},
      timeout: config.timeout || 30000,
      reconnect: {
        maxAttempts: config.reconnect?.maxAttempts ?? 5,
        delay: config.reconnect?.delay ?? 2000,
        maxDelay: config.reconnect?.maxDelay ?? 30000,
        backoffMultiplier: config.reconnect?.backoffMultiplier ?? 1.5,
      },
    };

    /** @type {TransportState} */
    this.state = TransportState.IDLE;

    /** @type {number} */
    this.requestId = 0;

    /** @type {Map<string|number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
    this.pendingRequests = new Map();

    /** @type {AbortController | null} */
    this.abortController = null;

    /** @type {number} */
    this.reconnectAttempts = 0;

    /** @type {NodeJS.Timeout | null} */
    this.reconnectTimer = null;

    /** @type {ReadableStreamDefaultReader | null} */
    this.reader = null;

    /** @type {string} */
    this.buffer = '';

    /** @type {string | null} */
    this.sessionId = null;
  }

  /**
   * Start the transport (connect to SSE endpoint)
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.state !== TransportState.IDLE && this.state !== TransportState.CLOSED) {
      throw new Error(`Cannot start transport in state: ${this.state}`);
    }

    this.state = TransportState.CONNECTING;

    return this.connect();
  }

  /**
   * Connect to SSE endpoint
   *
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      this.abortController = new AbortController();

      const response = await fetch(this.config.url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...this.config.headers,
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      // Get the response body reader
      this.reader = response.body.getReader();
      const decoder = new TextDecoder();

      this.state = TransportState.READY;
      this.reconnectAttempts = 0;
      this.emit('ready');

      // Start reading the stream
      this.readStream(decoder);
    } catch (error) {
      if (error.name === 'AbortError') {
        return; // Intentional abort
      }

      this.state = TransportState.ERROR;
      this.emit('error', error);

      // Try to reconnect
      this.scheduleReconnect();

      throw error;
    }
  }

  /**
   * Read SSE stream
   *
   * @param {TextDecoder} decoder - Text decoder
   */
  async readStream(decoder) {
    try {
      while (true) {
        const { done, value } = await this.reader.read();

        if (done) {
          break;
        }

        this.buffer += decoder.decode(value, { stream: true });
        this.processBuffer();
      }

      // Stream ended normally
      this.handleDisconnect();
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.emit('error', error);
        this.handleDisconnect();
      }
    }
  }

  /**
   * Process SSE buffer
   */
  processBuffer() {
    const lines = this.buffer.split('\n');

    // Keep incomplete last line in buffer
    this.buffer = lines.pop() || '';

    let currentEvent = {
      type: 'message',
      data: '',
    };

    for (const line of lines) {
      if (line === '') {
        // Empty line = end of event
        if (currentEvent.data) {
          this.handleEvent(currentEvent);
        }
        currentEvent = { type: 'message', data: '' };
      } else if (line.startsWith('event:')) {
        currentEvent.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data += line.slice(5).trim();
      } else if (line.startsWith('id:')) {
        this.sessionId = line.slice(3).trim();
      } else if (line.startsWith(':')) {
        // Comment, ignore (often used for keep-alive)
      }
    }
  }

  /**
   * Handle SSE event
   *
   * @param {Object} event - SSE event
   */
  handleEvent(event) {
    try {
      const data = JSON.parse(event.data);

      // Check if it's a response to a pending request
      if (data.id !== undefined && this.pendingRequests.has(data.id)) {
        const pending = this.pendingRequests.get(data.id);
        clearTimeout(pending.timer);
        this.pendingRequests.delete(data.id);

        if (data.error) {
          pending.reject(new MCPError(data.error));
        } else {
          pending.resolve(data.result);
        }
      } else {
        // Notification or other message
        this.emit('message', {
          type: event.type,
          data,
        });
      }
    } catch (_error) {
      // Not JSON, emit as raw
      this.emit('output', event.data);
    }
  }

  /**
   * Handle disconnection
   */
  handleDisconnect() {
    if (this.state === TransportState.CLOSED) {
      return;
    }

    this.state = TransportState.RECONNECTING;
    this.emit('reconnecting', { attempt: this.reconnectAttempts + 1 });

    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.config.reconnect.maxAttempts) {
      this.state = TransportState.ERROR;
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.config.reconnect.delay *
        this.config.reconnect.backoffMultiplier ** this.reconnectAttempts,
      this.config.reconnect.maxDelay,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;

      try {
        await this.connect();
      } catch (_error) {
        // Error handling is done in connect()
      }
    }, delay);
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
      id,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${requestTimeout}ms: ${method}`));
      }, requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      // Send request via POST to separate endpoint
      this.sendRequest(message).catch((error) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  /**
   * Send HTTP request (for SSE, requests go via POST)
   *
   * @param {Object} message - JSON-RPC message
   * @returns {Promise<void>}
   */
  async sendRequest(message) {
    // SSE typically uses a separate POST endpoint for requests
    // The response comes back via the SSE stream
    const requestUrl = this.config.url.replace(/\/sse\/?$/, '/request');

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Send a notification
   *
   * @param {string} method - Method name
   * @param {Object} [params] - Method parameters
   */
  async notify(method, params = {}) {
    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await this.sendRequest(message);
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

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Abort ongoing connection
    if (this.abortController) {
      this.abortController.abort();
    }

    // Cancel reader
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // Ignore cancel errors
      }
      this.reader = null;
    }

    // Reject pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();

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
      type: 'sse',
      url: this.config.url,
      state: this.state,
      sessionId: this.sessionId,
      reconnectAttempts: this.reconnectAttempts,
      requestCount: this.requestId,
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
 * Create an SSE transport
 *
 * @param {Object} config - Server configuration
 * @returns {SseTransport}
 */
export function createSseTransport(config) {
  return new SseTransport({
    url: config.url,
    headers: config.headers,
    timeout: config.timeout,
    reconnect: config.reconnect,
  });
}

export default SseTransport;
