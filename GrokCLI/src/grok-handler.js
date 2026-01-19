/**
 * GrokCLI WebSocket Handler
 *
 * WebSocket client for xAI Grok API real-time communication
 * Supports: auto-reconnect, heartbeat/ping-pong, event emitters
 *
 * @module grok-handler
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { CONFIG } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('grok-ws-handler');

/**
 * Connection states
 * @readonly
 * @enum {string}
 */
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed'
};

/**
 * WebSocket handler configuration defaults
 */
const DEFAULT_CONFIG = {
  maxReconnectAttempts: 5,
  reconnectDelayBase: 1000,
  reconnectDelayMax: 30000,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  connectionTimeout: 15000
};

/**
 * GrokWebSocketHandler - WebSocket client for xAI Grok API
 *
 * @extends EventEmitter
 * @fires GrokWebSocketHandler#open - Connection established
 * @fires GrokWebSocketHandler#close - Connection closed
 * @fires GrokWebSocketHandler#message - Message received
 * @fires GrokWebSocketHandler#error - Error occurred
 * @fires GrokWebSocketHandler#reconnecting - Reconnection attempt started
 * @fires GrokWebSocketHandler#reconnected - Successfully reconnected
 * @fires GrokWebSocketHandler#reconnect_failed - All reconnection attempts exhausted
 * @fires GrokWebSocketHandler#state_change - Connection state changed
 */
export class GrokWebSocketHandler extends EventEmitter {
  /**
   * Create a GrokWebSocketHandler instance
   *
   * @param {Object} config - Configuration options
   * @param {string} [config.apiKey] - xAI API key (defaults to CONFIG.XAI_API_KEY)
   * @param {string} [config.endpoint] - WebSocket endpoint URL
   * @param {number} [config.maxReconnectAttempts=5] - Maximum reconnection attempts
   * @param {number} [config.reconnectDelayBase=1000] - Base delay for reconnection (ms)
   * @param {number} [config.reconnectDelayMax=30000] - Maximum delay for reconnection (ms)
   * @param {number} [config.heartbeatInterval=30000] - Heartbeat interval (ms)
   * @param {number} [config.heartbeatTimeout=10000] - Heartbeat timeout (ms)
   * @param {number} [config.connectionTimeout=15000] - Connection timeout (ms)
   */
  constructor(config = {}) {
    super();

    // Configuration
    this.apiKey = config.apiKey || CONFIG.XAI_API_KEY;
    this.endpoint = config.endpoint || this._buildEndpoint();
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? DEFAULT_CONFIG.maxReconnectAttempts;
    this.reconnectDelayBase = config.reconnectDelayBase ?? DEFAULT_CONFIG.reconnectDelayBase;
    this.reconnectDelayMax = config.reconnectDelayMax ?? DEFAULT_CONFIG.reconnectDelayMax;
    this.heartbeatInterval = config.heartbeatInterval ?? DEFAULT_CONFIG.heartbeatInterval;
    this.heartbeatTimeout = config.heartbeatTimeout ?? DEFAULT_CONFIG.heartbeatTimeout;
    this.connectionTimeout = config.connectionTimeout ?? DEFAULT_CONFIG.connectionTimeout;

    // Internal state
    this._ws = null;
    this._state = ConnectionState.DISCONNECTED;
    this._reconnectAttempts = 0;
    this._heartbeatTimer = null;
    this._heartbeatTimeoutTimer = null;
    this._connectionTimeoutTimer = null;
    this._reconnectTimer = null;
    this._messageQueue = [];
    this._pendingPong = false;
    this._intentionalClose = false;
    this._lastActivity = null;

    // Bind methods to preserve context
    this._handleOpen = this._handleOpen.bind(this);
    this._handleClose = this._handleClose.bind(this);
    this._handleError = this._handleError.bind(this);
    this._handleMessage = this._handleMessage.bind(this);
    this._handlePong = this._handlePong.bind(this);

    logger.debug('GrokWebSocketHandler initialized', {
      endpoint: this.endpoint,
      maxReconnectAttempts: this.maxReconnectAttempts,
      heartbeatInterval: this.heartbeatInterval
    });
  }

  /**
   * Build the WebSocket endpoint URL
   * @private
   * @returns {string} WebSocket endpoint URL
   */
  _buildEndpoint() {
    // Convert HTTP(S) URL to WS(S) URL
    const baseUrl = CONFIG.API_BASE_URL || 'https://api.x.ai/v1';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/realtime`;
  }

  /**
   * Get current connection state
   * @returns {string} Current connection state
   */
  get state() {
    return this._state;
  }

  /**
   * Check if connected
   * @returns {boolean} True if connected
   */
  get isConnected() {
    return this._state === ConnectionState.CONNECTED &&
           this._ws !== null &&
           this._ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get time since last activity
   * @returns {number|null} Milliseconds since last activity, or null if never active
   */
  get timeSinceLastActivity() {
    if (!this._lastActivity) return null;
    return Date.now() - this._lastActivity;
  }

  /**
   * Set connection state and emit event
   * @private
   * @param {string} newState - New connection state
   */
  _setState(newState) {
    const oldState = this._state;
    if (oldState !== newState) {
      this._state = newState;
      logger.debug('Connection state changed', { from: oldState, to: newState });
      this.emit('state_change', { oldState, newState });
    }
  }

  /**
   * Connect to the WebSocket server
   *
   * @returns {Promise<void>} Resolves when connected
   * @throws {Error} If connection fails
   */
  async connect() {
    if (this.isConnected) {
      logger.debug('Already connected, skipping connect');
      return;
    }

    if (this._state === ConnectionState.CONNECTING) {
      logger.debug('Connection in progress, skipping connect');
      return;
    }

    if (!this.apiKey) {
      throw new Error('API key is required for WebSocket connection');
    }

    this._intentionalClose = false;
    this._setState(ConnectionState.CONNECTING);

    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket with authorization headers
        this._ws = new WebSocket(this.endpoint, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'User-Agent': `${CONFIG.SERVER_NAME}/${CONFIG.SERVER_VERSION}`
          }
        });

        // Set connection timeout
        this._connectionTimeoutTimer = setTimeout(() => {
          if (this._state === ConnectionState.CONNECTING) {
            const error = new Error(`Connection timeout after ${this.connectionTimeout}ms`);
            logger.error('Connection timeout', { endpoint: this.endpoint });
            this._cleanup();
            this._setState(ConnectionState.FAILED);
            reject(error);
          }
        }, this.connectionTimeout);

        // Attach event handlers
        this._ws.on('open', () => {
          this._handleOpen();
          resolve();
        });

        this._ws.on('close', this._handleClose);
        this._ws.on('error', (error) => {
          if (this._state === ConnectionState.CONNECTING) {
            reject(error);
          }
          this._handleError(error);
        });
        this._ws.on('message', this._handleMessage);
        this._ws.on('pong', this._handlePong);

      } catch (error) {
        logger.error('Failed to create WebSocket', { error: error.message });
        this._setState(ConnectionState.FAILED);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   *
   * @param {number} [code=1000] - Close code
   * @param {string} [reason='Client disconnect'] - Close reason
   */
  disconnect(code = 1000, reason = 'Client disconnect') {
    logger.info('Disconnecting', { code, reason });
    this._intentionalClose = true;
    this._cleanup();

    if (this._ws) {
      try {
        if (this._ws.readyState === WebSocket.OPEN ||
            this._ws.readyState === WebSocket.CONNECTING) {
          this._ws.close(code, reason);
        }
      } catch (error) {
        logger.warn('Error during disconnect', { error: error.message });
      }
      this._ws = null;
    }

    this._setState(ConnectionState.DISCONNECTED);
  }

  /**
   * Send a message to the server
   *
   * @param {string|Object} message - Message to send (objects will be JSON stringified)
   * @returns {Promise<void>} Resolves when message is sent
   * @throws {Error} If not connected and queue is not enabled
   */
  async send(message) {
    const payload = typeof message === 'object' ? JSON.stringify(message) : message;

    if (!this.isConnected) {
      // Queue message for when connection is restored
      this._messageQueue.push(payload);
      logger.debug('Message queued (not connected)', { queueLength: this._messageQueue.length });

      // Attempt to reconnect if disconnected
      if (this._state === ConnectionState.DISCONNECTED) {
        this.reconnect();
      }
      return;
    }

    return new Promise((resolve, reject) => {
      this._ws.send(payload, (error) => {
        if (error) {
          logger.error('Failed to send message', { error: error.message });
          reject(error);
        } else {
          this._lastActivity = Date.now();
          logger.debug('Message sent', { payloadLength: payload.length });
          resolve();
        }
      });
    });
  }

  /**
   * Register a callback for incoming messages
   *
   * @param {Function} callback - Callback function(message, rawData)
   * @returns {Function} Unsubscribe function
   */
  onMessage(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    const handler = (data) => {
      try {
        // Try to parse as JSON, otherwise pass raw data
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        callback(parsed, data);
      } catch (error) {
        logger.error('Error in message callback', { error: error.message });
      }
    };

    this.on('message', handler);

    // Return unsubscribe function
    return () => {
      this.off('message', handler);
    };
  }

  /**
   * Reconnect to the server with exponential backoff
   *
   * @returns {Promise<void>} Resolves when reconnected
   * @throws {Error} If max reconnection attempts exceeded
   */
  async reconnect() {
    if (this._state === ConnectionState.RECONNECTING) {
      logger.debug('Reconnection already in progress');
      return;
    }

    if (this._reconnectAttempts >= this.maxReconnectAttempts) {
      const error = new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) exceeded`);
      logger.error('Reconnection failed', { attempts: this._reconnectAttempts });
      this._setState(ConnectionState.FAILED);
      this.emit('reconnect_failed', { attempts: this._reconnectAttempts });
      throw error;
    }

    this._setState(ConnectionState.RECONNECTING);
    this._reconnectAttempts++;

    // Calculate delay with exponential backoff and jitter
    const exponentialDelay = this.reconnectDelayBase * Math.pow(2, this._reconnectAttempts - 1);
    const jitter = Math.random() * 1000;
    const delay = Math.min(exponentialDelay + jitter, this.reconnectDelayMax);

    logger.info('Attempting reconnection', {
      attempt: this._reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay: Math.round(delay)
    });

    this.emit('reconnecting', {
      attempt: this._reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay: Math.round(delay)
    });

    // Wait for delay before reconnecting
    await new Promise((resolve) => {
      this._reconnectTimer = setTimeout(resolve, delay);
    });

    try {
      await this.connect();
      this._reconnectAttempts = 0;
      logger.info('Reconnection successful');
      this.emit('reconnected', { attempts: this._reconnectAttempts });

      // Flush message queue
      await this._flushMessageQueue();
    } catch (error) {
      logger.warn('Reconnection attempt failed', {
        attempt: this._reconnectAttempts,
        error: error.message
      });
      // Recursively try again
      return this.reconnect();
    }
  }

  /**
   * Handle WebSocket open event
   * @private
   */
  _handleOpen() {
    clearTimeout(this._connectionTimeoutTimer);
    this._connectionTimeoutTimer = null;
    this._lastActivity = Date.now();
    this._setState(ConnectionState.CONNECTED);

    logger.info('WebSocket connected', { endpoint: this.endpoint });
    this.emit('open');

    // Start heartbeat
    this._startHeartbeat();
  }

  /**
   * Handle WebSocket close event
   * @private
   * @param {number} code - Close code
   * @param {Buffer} reason - Close reason
   */
  _handleClose(code, reason) {
    const reasonStr = reason ? reason.toString() : 'No reason provided';
    logger.info('WebSocket closed', { code, reason: reasonStr });

    this._cleanup();
    this.emit('close', { code, reason: reasonStr });

    // Auto-reconnect if not intentional close
    if (!this._intentionalClose && code !== 1000) {
      this._setState(ConnectionState.DISCONNECTED);
      this.reconnect().catch((error) => {
        logger.error('Auto-reconnect failed', { error: error.message });
      });
    } else {
      this._setState(ConnectionState.DISCONNECTED);
    }
  }

  /**
   * Handle WebSocket error event
   * @private
   * @param {Error} error - Error object
   */
  _handleError(error) {
    logger.error('WebSocket error', {
      error: error.message,
      code: error.code
    });
    this.emit('error', error);
  }

  /**
   * Handle incoming message
   * @private
   * @param {Buffer|string} data - Raw message data
   */
  _handleMessage(data) {
    this._lastActivity = Date.now();
    const dataStr = data.toString();

    logger.debug('Message received', { length: dataStr.length });
    this.emit('message', dataStr);
  }

  /**
   * Handle pong response
   * @private
   */
  _handlePong() {
    this._pendingPong = false;
    clearTimeout(this._heartbeatTimeoutTimer);
    this._heartbeatTimeoutTimer = null;
    this._lastActivity = Date.now();
    logger.debug('Pong received');
  }

  /**
   * Start heartbeat mechanism
   * @private
   */
  _startHeartbeat() {
    this._stopHeartbeat();

    this._heartbeatTimer = setInterval(() => {
      if (!this.isConnected) {
        this._stopHeartbeat();
        return;
      }

      // Send ping
      try {
        this._pendingPong = true;
        this._ws.ping();
        logger.debug('Ping sent');

        // Set timeout for pong response
        this._heartbeatTimeoutTimer = setTimeout(() => {
          if (this._pendingPong) {
            logger.warn('Heartbeat timeout - no pong received');
            this._ws.terminate();
          }
        }, this.heartbeatTimeout);

      } catch (error) {
        logger.error('Failed to send ping', { error: error.message });
        this._ws.terminate();
      }
    }, this.heartbeatInterval);

    logger.debug('Heartbeat started', { interval: this.heartbeatInterval });
  }

  /**
   * Stop heartbeat mechanism
   * @private
   */
  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._heartbeatTimeoutTimer) {
      clearTimeout(this._heartbeatTimeoutTimer);
      this._heartbeatTimeoutTimer = null;
    }
    this._pendingPong = false;
  }

  /**
   * Flush queued messages
   * @private
   */
  async _flushMessageQueue() {
    if (this._messageQueue.length === 0) return;

    logger.info('Flushing message queue', { count: this._messageQueue.length });

    const queue = [...this._messageQueue];
    this._messageQueue = [];

    for (const message of queue) {
      try {
        await this.send(message);
      } catch (error) {
        logger.error('Failed to send queued message', { error: error.message });
        // Re-queue failed message
        this._messageQueue.unshift(message);
        break;
      }
    }
  }

  /**
   * Cleanup timers and internal state
   * @private
   */
  _cleanup() {
    this._stopHeartbeat();

    if (this._connectionTimeoutTimer) {
      clearTimeout(this._connectionTimeoutTimer);
      this._connectionTimeoutTimer = null;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Get handler statistics
   * @returns {Object} Handler statistics
   */
  getStats() {
    return {
      state: this._state,
      isConnected: this.isConnected,
      endpoint: this.endpoint,
      reconnectAttempts: this._reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      queuedMessages: this._messageQueue.length,
      lastActivity: this._lastActivity,
      timeSinceLastActivity: this.timeSinceLastActivity
    };
  }
}

/**
 * Create a GrokWebSocketHandler instance (factory function)
 *
 * @param {Object} config - Configuration options
 * @returns {GrokWebSocketHandler} New handler instance
 */
export function createGrokWebSocketHandler(config = {}) {
  return new GrokWebSocketHandler(config);
}

export default GrokWebSocketHandler;
