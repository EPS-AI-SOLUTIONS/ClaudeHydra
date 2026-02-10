/**
 * Stdio Transport for MCP
 *
 * Handles communication with MCP servers via standard input/output.
 * Spawns child processes and manages their lifecycle.
 *
 * @module src/mcp/transports/stdio
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { validateArgs, validateExecutable } from '../../security/safe-command.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Transport states
 * @enum {string}
 */
export const TransportState = {
  IDLE: 'idle',
  STARTING: 'starting',
  READY: 'ready',
  CLOSING: 'closing',
  CLOSED: 'closed',
  ERROR: 'error',
};

// ============================================================================
// Stdio Transport Class
// ============================================================================

/**
 * Stdio Transport
 *
 * Manages stdio-based communication with MCP servers.
 *
 * @extends EventEmitter
 * @fires StdioTransport#ready
 * @fires StdioTransport#message
 * @fires StdioTransport#error
 * @fires StdioTransport#close
 */
export class StdioTransport extends EventEmitter {
  /**
   * @param {Object} config - Transport configuration
   * @param {string} config.command - Command to execute
   * @param {string[]} [config.args] - Command arguments
   * @param {Object} [config.env] - Environment variables
   * @param {string} [config.cwd] - Working directory
   * @param {number} [config.timeout] - Startup timeout in ms
   */
  constructor(config) {
    super();

    this.config = {
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...config.env },
      cwd: config.cwd || process.cwd(),
      timeout: config.timeout || 30000,
    };

    /** @type {TransportState} */
    this.state = TransportState.IDLE;

    /** @type {import('child_process').ChildProcess | null} */
    this.process = null;

    /** @type {import('readline').Interface | null} */
    this.readline = null;

    /** @type {Map<string|number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
    this.pendingRequests = new Map();

    /** @type {number} */
    this.requestId = 0;

    /** @type {string} */
    this.buffer = '';
  }

  /**
   * Start the transport (spawn process)
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.state !== TransportState.IDLE) {
      throw new Error(`Cannot start transport in state: ${this.state}`);
    }

    this.state = TransportState.STARTING;

    return new Promise((resolve, reject) => {
      const startTimeout = setTimeout(() => {
        this.close();
        reject(new Error(`Transport startup timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      try {
        // SECURITY FIX: Validate command/args and remove shell: true.
        // MCP server commands come from .hydra/mcp-servers.json config.
        // With shell: false, argument array is passed directly to the OS,
        // preventing shell metacharacter interpretation.
        const execCheck = validateExecutable(
          this.config.command,
          true /* MCP servers can be unlisted */,
        );
        if (!execCheck.valid) {
          throw new Error(`Security: MCP server command rejected: ${execCheck.reason}`);
        }

        const argsCheck = validateArgs(this.config.args);
        if (!argsCheck.valid) {
          throw new Error(`Security: MCP server args rejected: ${argsCheck.reason}`);
        }

        this.process = spawn(this.config.command, this.config.args, {
          env: this.config.env,
          cwd: this.config.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false, // SECURITY: was `true` — shell interpretation disabled
        });

        // Handle process errors
        this.process.on('error', (error) => {
          clearTimeout(startTimeout);
          this.state = TransportState.ERROR;
          this.emit('error', error);
          reject(error);
        });

        // Handle process exit
        this.process.on('exit', (code, signal) => {
          this.state = TransportState.CLOSED;
          this.emit('close', { code, signal });
          this.cleanup();
        });

        // Set up readline for stdout
        this.readline = createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity,
        });

        this.readline.on('line', (line) => {
          this.handleLine(line);
        });

        // Capture stderr for debugging
        this.process.stderr.on('data', (data) => {
          const message = data.toString();
          // Log but don't error - some servers write to stderr for logging
          this.emit('stderr', message);
        });

        // Mark as ready once we see first output or after short delay
        const readyTimeout = setTimeout(() => {
          clearTimeout(startTimeout);
          this.state = TransportState.READY;
          this.emit('ready');
          resolve();
        }, 500);

        this.readline.once('line', () => {
          clearTimeout(readyTimeout);
          clearTimeout(startTimeout);
          this.state = TransportState.READY;
          this.emit('ready');
          resolve();
        });
      } catch (error) {
        clearTimeout(startTimeout);
        this.state = TransportState.ERROR;
        reject(error);
      }
    });
  }

  /**
   * Send a JSON-RPC request
   *
   * @param {string} method - Method name
   * @param {Object} [params] - Method parameters
   * @param {number} [timeout] - Request timeout in ms
   * @returns {Promise<any>}
   */
  async request(method, params = {}, timeout = 30000) {
    if (this.state !== TransportState.READY) {
      throw new Error(`Transport not ready, current state: ${this.state}`);
    }

    const id = ++this.requestId;

    const message = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeout}ms: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.send(message);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   *
   * @param {string} method - Method name
   * @param {Object} [params] - Method parameters
   */
  notify(method, params = {}) {
    if (this.state !== TransportState.READY) {
      throw new Error(`Transport not ready, current state: ${this.state}`);
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.send(message);
  }

  /**
   * Send raw message to process
   *
   * @param {Object} message - JSON-RPC message
   */
  send(message) {
    if (!this.process || !this.process.stdin.writable) {
      throw new Error('Process stdin not writable');
    }

    const json = JSON.stringify(message);
    this.process.stdin.write(`${json}\n`);
  }

  /**
   * Handle incoming line from stdout
   *
   * @param {string} line - Line of text
   */
  handleLine(line) {
    // Skip empty lines
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line);

      // Check if it's a response to a pending request
      if (message.id !== undefined && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id);
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new MCPError(message.error));
        } else {
          pending.resolve(message.result);
        }
      } else {
        // It's a notification or unexpected message
        this.emit('message', message);
      }
    } catch (_error) {
      // Not valid JSON, emit as raw output
      this.emit('output', line);
    }
  }

  /**
   * Close the transport
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.state === TransportState.CLOSED || this.state === TransportState.CLOSING) {
      return;
    }

    this.state = TransportState.CLOSING;

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();

    return new Promise((resolve) => {
      if (this.process) {
        // Give process time to exit gracefully
        const killTimeout = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
        }, 5000);

        this.process.once('exit', () => {
          clearTimeout(killTimeout);
          this.cleanup();
          resolve();
        });

        // Try graceful shutdown first
        this.process.kill('SIGTERM');
      } else {
        this.cleanup();
        resolve();
      }
    });
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    this.process = null;
    this.state = TransportState.CLOSED;
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
   * Get process info
   *
   * @returns {Object | null}
   */
  getProcessInfo() {
    if (!this.process) return null;

    return {
      pid: this.process.pid,
      connected: this.process.connected,
      killed: this.process.killed,
      exitCode: this.process.exitCode,
      signalCode: this.process.signalCode,
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
 * Create a stdio transport
 *
 * @param {Object} config - Server configuration
 * @returns {StdioTransport}
 */
export function createStdioTransport(config) {
  return new StdioTransport({
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
    timeout: config.timeout,
  });
}

export default StdioTransport;
