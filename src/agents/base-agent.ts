/**
 * Base Agent
 *
 * Abstract base class for all Task Agents.
 *
 * @module src/agents/base-agent
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Constants
// ============================================================================

/**
 * Agent states
 * @enum {string}
 */
export const AgentState = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// ============================================================================
// Base Agent Class
// ============================================================================

/**
 * Base Agent
 *
 * Abstract base class providing common functionality for all agents.
 *
 * @extends EventEmitter
 * @fires BaseAgent#started
 * @fires BaseAgent#progress
 * @fires BaseAgent#completed
 * @fires BaseAgent#failed
 * @fires BaseAgent#cancelled
 */
export class BaseAgent extends EventEmitter {
  /**
   * @param {Object} options - Agent options
   * @param {string} options.name - Agent name
   * @param {string} [options.description] - Agent description
   * @param {string} [options.witcherName] - Corresponding Witcher agent
   * @param {string[]} [options.capabilities] - Agent capabilities
   * @param {number} [options.timeout] - Default timeout in ms
   */
  constructor(options = {}) {
    super();

    this.name = options.name || 'BaseAgent';
    this.description = options.description || '';
    this.witcherName = options.witcherName || null;
    this.capabilities = options.capabilities || [];
    this.timeout = options.timeout || 120000;

    /** @type {AgentState} */
    this.state = AgentState.IDLE;

    /** @type {string | null} */
    this.currentTaskId = null;

    /** @type {AbortController | null} */
    this.abortController = null;

    /** @type {Object} */
    this.context = {};

    /** @type {number} */
    this.startTime = 0;
  }

  /**
   * Execute agent task
   *
   * @abstract
   * @param {Object} params - Task parameters
   * @returns {Promise<any>}
   */
  async execute(_params) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Run the agent with proper lifecycle management
   *
   * @param {Object} params - Task parameters
   * @param {Object} [options] - Execution options
   * @returns {Promise<Object>}
   */
  async run(params, options = {}) {
    if (this.state === AgentState.RUNNING) {
      throw new Error(`Agent ${this.name} is already running`);
    }

    this.state = AgentState.RUNNING;
    this.startTime = Date.now();
    this.currentTaskId = params.taskId || `task-${Date.now()}`;
    this.abortController = new AbortController();
    this.context = params.context || {};

    this.emit('started', {
      taskId: this.currentTaskId,
      params,
    });

    try {
      // Create timeout promise
      const timeoutMs = options.timeout || this.timeout;
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          // Signal abort so execute() can stop work
          this.abortController.abort();
          reject(new Error(`Agent timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Execute with signal
      const executePromise = this.execute({
        ...params,
        signal: this.abortController.signal,
      });

      // Race execution against timeout
      const result = await Promise.race([executePromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const duration = Date.now() - this.startTime;

      this.state = AgentState.COMPLETED;
      this.emit('completed', {
        taskId: this.currentTaskId,
        result,
        duration,
      });

      return {
        success: true,
        taskId: this.currentTaskId,
        result,
        duration,
        agent: this.name,
      };
    } catch (error) {
      const duration = Date.now() - this.startTime;

      if (this.abortController?.signal.aborted) {
        this.state = AgentState.CANCELLED;
        this.emit('cancelled', {
          taskId: this.currentTaskId,
          duration,
        });

        return {
          success: false,
          taskId: this.currentTaskId,
          cancelled: true,
          duration,
          agent: this.name,
        };
      }

      this.state = AgentState.FAILED;
      this.emit('failed', {
        taskId: this.currentTaskId,
        error,
        duration,
      });

      return {
        success: false,
        taskId: this.currentTaskId,
        error: error.message,
        duration,
        agent: this.name,
      };
    } finally {
      this.cleanup();
    }
  }

  /**
   * Cancel current execution
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Report progress
   *
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} [message] - Progress message
   */
  reportProgress(percent, message = '') {
    this.emit('progress', {
      taskId: this.currentTaskId,
      percent,
      message,
    });
  }

  /**
   * Cleanup after execution
   */
  cleanup() {
    this.currentTaskId = null;
    this.abortController = null;
    this.context = {};
    this.startTime = 0;
  }

  /**
   * Reset agent to idle state
   */
  reset() {
    this.cancel();
    this.state = AgentState.IDLE;
    this.cleanup();
  }

  /**
   * Check if agent can handle a task type
   *
   * @param {string} taskType - Task type
   * @returns {boolean}
   */
  canHandle(taskType) {
    return this.capabilities.includes(taskType);
  }

  /**
   * Get agent info
   *
   * @returns {Object}
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      witcherName: this.witcherName,
      capabilities: this.capabilities,
      state: this.state,
      currentTaskId: this.currentTaskId,
    };
  }

  /**
   * Get system prompt for agent
   *
   * @returns {string}
   */
  getSystemPrompt() {
    return `You are ${this.name}${this.witcherName ? ` (${this.witcherName})` : ''}.
${this.description}

Your capabilities: ${this.capabilities.join(', ')}`;
  }
}

export default BaseAgent;
