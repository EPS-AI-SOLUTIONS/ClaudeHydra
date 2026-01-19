/**
 * Jules Async Handler
 * 
 * Comprehensive async task handling for Google Jules.
 * Features: Queue management, GitHub integration via Octokit, webhook support.
 * 
 * Jules is an async coding agent - no streaming, but background task execution.
 */

import { v4 as uuidv4 } from 'uuid';
import { Octokit } from '@octokit/rest';
import { EventEmitter } from 'events';
import { createLogger } from './logger.js';
import { CONFIG } from './config.js';

const logger = createLogger('jules-handler');

// ============================================
// CONSTANTS
// ============================================

export const HandlerStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

export const TaskType = {
  CODE_GENERATION: 'code-generation',
  TEST_GENERATION: 'test-generation',
  REFACTORING: 'refactoring',
  BUG_FIX: 'bug-fix',
  DOCUMENTATION: 'documentation',
  CODE_REVIEW: 'code-review',
  GENERAL: 'general'
};

// ============================================
// QUEUE MANAGER
// ============================================

/**
 * Task Queue Manager
 * Manages concurrent task execution with priority support.
 */
class TaskQueueManager extends EventEmitter {
  constructor(maxConcurrent = 5) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.running = new Map();
    this.completed = new Map();
  }

  /**
   * Add task to queue
   */
  enqueue(task) {
    task.queuedAt = Date.now();
    this.queue.push(task);
    this._sortQueue();
    this.emit('taskQueued', { taskId: task.id, queueLength: this.queue.length });
    logger.debug('Task enqueued', { taskId: task.id, queueLength: this.queue.length });
    return task;
  }

  /**
   * Sort queue by priority (lower number = higher priority)
   */
  _sortQueue() {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.queuedAt - b.queuedAt; // FIFO for same priority
    });
  }

  /**
   * Get next task from queue (if capacity available)
   */
  dequeue() {
    if (this.running.size >= this.maxConcurrent || this.queue.length === 0) {
      return null;
    }
    const task = this.queue.shift();
    this.running.set(task.id, task);
    this.emit('taskStarted', { taskId: task.id, runningCount: this.running.size });
    logger.debug('Task dequeued', { taskId: task.id, runningCount: this.running.size });
    return task;
  }

  /**
   * Mark task as complete
   */
  complete(taskId, result) {
    const task = this.running.get(taskId);
    if (task) {
      task.result = result;
      task.completedAt = Date.now();
      task.status = result.error ? HandlerStatus.FAILED : HandlerStatus.COMPLETED;
      this.running.delete(taskId);
      this.completed.set(taskId, task);
      this.emit('taskCompleted', { taskId, status: task.status });
      logger.info('Task completed', { taskId, status: task.status });
    }
    return task;
  }

  /**
   * Cancel a queued or running task
   */
  cancel(taskId) {
    // Check queue first
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.status = HandlerStatus.CANCELLED;
      task.completedAt = Date.now();
      this.completed.set(taskId, task);
      this.emit('taskCancelled', { taskId, wasRunning: false });
      return { success: true, wasRunning: false };
    }

    // Check running tasks
    if (this.running.has(taskId)) {
      const task = this.running.get(taskId);
      task.status = HandlerStatus.CANCELLED;
      task.completedAt = Date.now();
      this.running.delete(taskId);
      this.completed.set(taskId, task);
      this.emit('taskCancelled', { taskId, wasRunning: true });
      return { success: true, wasRunning: true };
    }

    return { success: false, error: 'Task not found in queue or running' };
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      maxConcurrent: this.maxConcurrent,
      capacity: this.maxConcurrent - this.running.size
    };
  }

  /**
   * Clear completed tasks older than specified hours
   */
  clearOldCompleted(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    let cleared = 0;
    for (const [id, task] of this.completed.entries()) {
      if (task.completedAt < cutoff) {
        this.completed.delete(id);
        cleared++;
      }
    }
    return cleared;
  }
}

// ============================================
// WEBHOOK MANAGER
// ============================================

/**
 * Webhook Manager
 * Handles webhook notifications for task events.
 */
class WebhookManager {
  constructor() {
    this.webhooks = new Map();
    this.retryConfig = {
      maxRetries: 3,
      backoffMs: 1000,
      backoffMultiplier: 2
    };
  }

  /**
   * Register a webhook endpoint
   */
  register(id, config) {
    const webhook = {
      id: id || uuidv4(),
      url: config.url,
      events: config.events || ['*'],
      secret: config.secret || null,
      headers: config.headers || {},
      enabled: config.enabled !== false,
      createdAt: Date.now(),
      lastTriggered: null,
      successCount: 0,
      failureCount: 0
    };
    this.webhooks.set(webhook.id, webhook);
    logger.info('Webhook registered', { id: webhook.id, url: webhook.url });
    return webhook;
  }

  /**
   * Unregister a webhook
   */
  unregister(id) {
    const deleted = this.webhooks.delete(id);
    if (deleted) {
      logger.info('Webhook unregistered', { id });
    }
    return deleted;
  }

  /**
   * List all webhooks
   */
  list() {
    return Array.from(this.webhooks.values()).map(w => ({
      id: w.id,
      url: w.url,
      events: w.events,
      enabled: w.enabled,
      successCount: w.successCount,
      failureCount: w.failureCount,
      lastTriggered: w.lastTriggered
    }));
  }

  /**
   * Trigger webhooks for an event
   */
  async trigger(event, payload) {
    const promises = [];

    for (const webhook of this.webhooks.values()) {
      if (!webhook.enabled) continue;
      if (!webhook.events.includes('*') && !webhook.events.includes(event)) continue;

      promises.push(this._sendWebhook(webhook, event, payload));
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    logger.debug('Webhooks triggered', { event, total: results.length, successful, failed });
    return { event, total: results.length, successful, failed };
  }

  /**
   * Send webhook with retry logic
   */
  async _sendWebhook(webhook, event, payload, attempt = 1) {
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      payload
    });

    const headers = {
      'Content-Type': 'application/json',
      'X-Jules-Event': event,
      'X-Jules-Delivery': uuidv4(),
      ...webhook.headers
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      const crypto = await import('crypto');
      const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
      headers['X-Jules-Signature'] = `sha256=${signature}`;
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000) // 10s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      webhook.lastTriggered = Date.now();
      webhook.successCount++;
      return { success: true, webhookId: webhook.id };

    } catch (error) {
      if (attempt < this.retryConfig.maxRetries) {
        const delay = this.retryConfig.backoffMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
        logger.warn('Webhook failed, retrying', { 
          webhookId: webhook.id, 
          attempt, 
          delay, 
          error: error.message 
        });
        await new Promise(r => setTimeout(r, delay));
        return this._sendWebhook(webhook, event, payload, attempt + 1);
      }

      webhook.failureCount++;
      logger.error('Webhook failed permanently', { 
        webhookId: webhook.id, 
        error: error.message 
      });
      return { success: false, webhookId: webhook.id, error: error.message };
    }
  }
}

// ============================================
// JULES ASYNC HANDLER
// ============================================

/**
 * JulesAsyncHandler
 * 
 * Main class for managing async task handling with Google Jules.
 * Provides queue management, GitHub integration, and webhook support.
 */
export class JulesAsyncHandler extends EventEmitter {
  /**
   * Create a new JulesAsyncHandler instance
   * @param {Object} config - Configuration options
   * @param {string} config.githubToken - GitHub personal access token
   * @param {string} config.githubOwner - Default GitHub repository owner
   * @param {string} config.githubRepo - Default GitHub repository name
   * @param {number} config.maxConcurrent - Maximum concurrent tasks
   * @param {number} config.defaultTimeout - Default task timeout in ms
   * @param {number} config.pollInterval - Default polling interval in ms
   */
  constructor(config = {}) {
    super();

    this.config = {
      githubToken: config.githubToken || CONFIG.GITHUB_TOKEN,
      githubOwner: config.githubOwner || CONFIG.GITHUB_DEFAULT_OWNER,
      githubRepo: config.githubRepo || CONFIG.GITHUB_DEFAULT_REPO,
      maxConcurrent: config.maxConcurrent || CONFIG.TASK_MAX_CONCURRENT,
      defaultTimeout: config.defaultTimeout || CONFIG.TASK_DEFAULT_TIMEOUT_MS,
      pollInterval: config.pollInterval || CONFIG.TASK_POLL_INTERVAL_MS,
      simulationMode: config.simulationMode ?? CONFIG.SIMULATION_MODE
    };

    // Initialize components
    this.tasks = new Map();
    this.queueManager = new TaskQueueManager(this.config.maxConcurrent);
    this.webhookManager = new WebhookManager();
    this.octokit = null;
    this.pollingIntervals = new Map();

    // Initialize GitHub client
    this._initGitHub();

    // Forward queue events
    this.queueManager.on('taskQueued', (data) => this.emit('taskQueued', data));
    this.queueManager.on('taskStarted', (data) => this.emit('taskStarted', data));
    this.queueManager.on('taskCompleted', (data) => {
      this.emit('taskCompleted', data);
      this.webhookManager.trigger('task.completed', data);
    });
    this.queueManager.on('taskCancelled', (data) => {
      this.emit('taskCancelled', data);
      this.webhookManager.trigger('task.cancelled', data);
    });

    // Start queue processor
    this._startQueueProcessor();

    logger.info('JulesAsyncHandler initialized', {
      maxConcurrent: this.config.maxConcurrent,
      simulationMode: this.config.simulationMode,
      githubConfigured: Boolean(this.config.githubToken)
    });
  }

  /**
   * Initialize GitHub client
   */
  _initGitHub() {
    if (this.config.githubToken) {
      this.octokit = new Octokit({ auth: this.config.githubToken });
      logger.info('GitHub client initialized');
    } else {
      logger.warn('GitHub token not provided - GitHub integration disabled');
    }
  }

  /**
   * Start the queue processor
   */
  _startQueueProcessor() {
    setInterval(() => {
      this._processQueue();
    }, 100); // Check queue every 100ms
  }

  /**
   * Process the task queue
   */
  async _processQueue() {
    const task = this.queueManager.dequeue();
    if (!task) return;

    task.status = HandlerStatus.RUNNING;
    task.startedAt = Date.now();
    this.webhookManager.trigger('task.started', { taskId: task.id });

    try {
      const result = await this._executeTask(task);
      this.queueManager.complete(task.id, result);
    } catch (error) {
      this.queueManager.complete(task.id, { error: error.message });
    }
  }

  /**
   * Execute a task (simulation or real)
   */
  async _executeTask(task) {
    if (this.config.simulationMode) {
      return this._simulateTaskExecution(task);
    }
    // TODO: Implement real Jules API integration when available
    return this._simulateTaskExecution(task);
  }

  /**
   * Simulate task execution
   */
  async _simulateTaskExecution(task) {
    const durations = {
      [TaskType.CODE_GENERATION]: { min: 3000, max: 8000 },
      [TaskType.TEST_GENERATION]: { min: 5000, max: 12000 },
      [TaskType.REFACTORING]: { min: 6000, max: 15000 },
      [TaskType.BUG_FIX]: { min: 4000, max: 10000 },
      [TaskType.DOCUMENTATION]: { min: 2000, max: 6000 },
      [TaskType.CODE_REVIEW]: { min: 3000, max: 8000 },
      [TaskType.GENERAL]: { min: 2000, max: 5000 }
    };

    const range = durations[task.type] || durations[TaskType.GENERAL];
    const duration = Math.floor(Math.random() * (range.max - range.min) + range.min);
    const steps = 5;
    const stepDuration = duration / steps;

    task.logs = task.logs || [];
    task.logs.push({ time: Date.now(), message: 'Task execution started' });

    for (let i = 1; i <= steps; i++) {
      // Check for cancellation
      if (task.status === HandlerStatus.CANCELLED) {
        return { cancelled: true };
      }

      await new Promise(resolve => setTimeout(resolve, stepDuration));
      task.progress = Math.round((i / steps) * 100);
      task.logs.push({ time: Date.now(), message: `Step ${i}/${steps} completed` });
      this.emit('taskProgress', { taskId: task.id, progress: task.progress });
    }

    task.logs.push({ time: Date.now(), message: 'Task execution completed' });

    return {
      success: true,
      summary: `Task "${task.description}" completed successfully`,
      output: this._generateSimulatedOutput(task),
      executionTime: duration
    };
  }

  /**
   * Generate simulated output based on task type
   */
  _generateSimulatedOutput(task) {
    const outputs = {
      [TaskType.CODE_GENERATION]: {
        filesGenerated: ['src/generated-module.js'],
        linesOfCode: Math.floor(Math.random() * 200) + 50,
        complexity: 'medium'
      },
      [TaskType.TEST_GENERATION]: {
        testFiles: ['tests/generated.test.js'],
        testCount: Math.floor(Math.random() * 20) + 5,
        coverage: `${Math.floor(Math.random() * 30) + 70}%`
      },
      [TaskType.REFACTORING]: {
        filesModified: ['src/refactored.js'],
        linesAdded: Math.floor(Math.random() * 100),
        linesRemoved: Math.floor(Math.random() * 150),
        improvements: ['Code modularization', 'Better naming', 'Reduced complexity']
      },
      [TaskType.BUG_FIX]: {
        fixedFile: 'src/bugfix.js',
        issueResolved: task.metadata?.issue || 'N/A',
        testsAdded: Math.floor(Math.random() * 5) + 1
      },
      [TaskType.DOCUMENTATION]: {
        docsGenerated: ['docs/API.md', 'docs/README.md'],
        sections: ['Overview', 'Installation', 'API Reference', 'Examples']
      },
      [TaskType.CODE_REVIEW]: {
        filesReviewed: Math.floor(Math.random() * 10) + 1,
        issuesFound: Math.floor(Math.random() * 8),
        suggestions: ['Add error handling', 'Improve variable names', 'Add JSDoc comments']
      }
    };

    return outputs[task.type] || { message: 'Task completed successfully' };
  }

  // ============================================
  // PUBLIC API - TASK MANAGEMENT
  // ============================================

  /**
   * Submit a new async task
   * @param {Object} task - Task configuration
   * @param {string} task.description - Task description
   * @param {string} task.type - Task type from TaskType enum
   * @param {number} task.priority - Task priority (1-5, lower = higher)
   * @param {Object} task.metadata - Additional task metadata
   * @param {number} task.timeout - Task timeout in ms
   * @returns {Object} Task submission result
   */
  async submitTask(task) {
    const taskId = `jules-${Date.now()}-${uuidv4().split('-')[0]}`;
    
    const newTask = {
      id: taskId,
      description: task.description || 'Unnamed task',
      type: task.type || TaskType.GENERAL,
      priority: task.priority || 3,
      status: HandlerStatus.PENDING,
      metadata: task.metadata || {},
      timeout: task.timeout || this.config.defaultTimeout,
      progress: 0,
      result: null,
      error: null,
      logs: [],
      createdAt: Date.now(),
      queuedAt: null,
      startedAt: null,
      completedAt: null
    };

    this.tasks.set(taskId, newTask);
    this.queueManager.enqueue(newTask);
    newTask.status = HandlerStatus.QUEUED;

    this.webhookManager.trigger('task.submitted', { taskId, type: newTask.type });
    logger.info('Task submitted', { taskId, type: newTask.type, priority: newTask.priority });

    return {
      id: taskId,
      status: newTask.status,
      queuePosition: this.queueManager.queue.findIndex(t => t.id === taskId) + 1,
      message: 'Task submitted successfully. Use getTaskStatus() to check progress.'
    };
  }

  /**
   * Get the status of a task
   * @param {string} taskId - Task ID
   * @returns {Object} Task status
   */
  async getTaskStatus(taskId) {
    const task = this.tasks.get(taskId) || 
                 this.queueManager.completed.get(taskId) ||
                 this.queueManager.running.get(taskId) ||
                 this.queueManager.queue.find(t => t.id === taskId);

    if (!task) {
      return {
        error: `Task ${taskId} not found`,
        found: false
      };
    }

    return {
      found: true,
      id: task.id,
      description: task.description,
      type: task.type,
      status: task.status,
      progress: task.progress,
      priority: task.priority,
      createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : null,
      queuedAt: task.queuedAt ? new Date(task.queuedAt).toISOString() : null,
      startedAt: task.startedAt ? new Date(task.startedAt).toISOString() : null,
      completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
      logs: task.logs?.slice(-10) || [],
      error: task.error
    };
  }

  /**
   * Get the result of a completed task
   * @param {string} taskId - Task ID
   * @returns {Object} Task result
   */
  async getTaskResult(taskId) {
    const task = this.tasks.get(taskId) || this.queueManager.completed.get(taskId);

    if (!task) {
      return {
        error: `Task ${taskId} not found`,
        found: false
      };
    }

    if (task.status !== HandlerStatus.COMPLETED && task.status !== HandlerStatus.FAILED) {
      return {
        found: true,
        id: taskId,
        status: task.status,
        progress: task.progress,
        ready: false,
        message: `Task is still ${task.status}. Check back later.`
      };
    }

    return {
      found: true,
      id: taskId,
      status: task.status,
      ready: true,
      result: task.result,
      error: task.error,
      executionTime: task.completedAt && task.startedAt 
        ? task.completedAt - task.startedAt 
        : null,
      completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null
    };
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   * @returns {Object} Cancellation result
   */
  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    // Check if already completed
    if ([HandlerStatus.COMPLETED, HandlerStatus.FAILED, HandlerStatus.CANCELLED].includes(task.status)) {
      return {
        success: false,
        error: `Cannot cancel task in ${task.status} status`
      };
    }

    // Stop any active polling
    this._stopPolling(taskId);

    // Cancel in queue manager
    const result = this.queueManager.cancel(taskId);
    
    if (result.success) {
      task.status = HandlerStatus.CANCELLED;
      task.completedAt = Date.now();
      task.logs.push({ time: Date.now(), message: 'Task cancelled by user' });
      
      logger.info('Task cancelled', { taskId, wasRunning: result.wasRunning });
    }

    return {
      success: result.success,
      taskId,
      wasRunning: result.wasRunning,
      message: result.success ? 'Task cancelled successfully' : result.error
    };
  }

  /**
   * Poll for task completion with callback
   * @param {string} taskId - Task ID
   * @param {number} interval - Polling interval in ms
   * @param {Function} callback - Callback function (status) => void
   * @param {Object} options - Polling options
   * @returns {Object} Polling control object
   */
  pollForCompletion(taskId, interval = null, callback = null, options = {}) {
    const pollInterval = interval || this.config.pollInterval;
    const maxAttempts = options.maxAttempts || Math.ceil(this.config.defaultTimeout / pollInterval);
    let attempts = 0;

    // Stop any existing polling for this task
    this._stopPolling(taskId);

    const poll = async () => {
      attempts++;
      const status = await this.getTaskStatus(taskId);

      if (callback) {
        try {
          callback(status, attempts);
        } catch (err) {
          logger.error('Polling callback error', { taskId, error: err.message });
        }
      }

      // Check if complete or max attempts reached
      const isComplete = [
        HandlerStatus.COMPLETED, 
        HandlerStatus.FAILED, 
        HandlerStatus.CANCELLED,
        HandlerStatus.TIMEOUT
      ].includes(status.status);

      if (isComplete || attempts >= maxAttempts || !status.found) {
        this._stopPolling(taskId);
        
        if (options.onComplete) {
          const result = await this.getTaskResult(taskId);
          options.onComplete(result);
        }

        this.emit('pollingComplete', { 
          taskId, 
          attempts, 
          status: status.status,
          timedOut: attempts >= maxAttempts && !isComplete
        });
      }
    };

    // Start polling
    const intervalId = setInterval(poll, pollInterval);
    this.pollingIntervals.set(taskId, intervalId);

    // Run immediately
    poll();

    logger.debug('Polling started', { taskId, interval: pollInterval, maxAttempts });

    return {
      taskId,
      interval: pollInterval,
      stop: () => this._stopPolling(taskId),
      getAttempts: () => attempts
    };
  }

  /**
   * Stop polling for a task
   */
  _stopPolling(taskId) {
    const intervalId = this.pollingIntervals.get(taskId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(taskId);
      logger.debug('Polling stopped', { taskId });
    }
  }

  // ============================================
  // PUBLIC API - QUEUE MANAGEMENT
  // ============================================

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return this.queueManager.getStats();
  }

  /**
   * List all tasks with optional filtering
   */
  listTasks(options = {}) {
    const { status, type, limit = 50 } = options;
    
    let tasks = Array.from(this.tasks.values());

    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }

    if (type) {
      tasks = tasks.filter(t => t.type === type);
    }

    tasks.sort((a, b) => b.createdAt - a.createdAt);
    tasks = tasks.slice(0, limit);

    return {
      total: this.tasks.size,
      filtered: tasks.length,
      queueStats: this.getQueueStats(),
      tasks: tasks.map(t => ({
        id: t.id,
        description: t.description.substring(0, 80) + (t.description.length > 80 ? '...' : ''),
        type: t.type,
        status: t.status,
        progress: t.progress,
        priority: t.priority,
        createdAt: new Date(t.createdAt).toISOString()
      }))
    };
  }

  /**
   * Clear old completed tasks
   */
  clearOldTasks(hours = CONFIG.TASK_RETENTION_HOURS) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    let cleared = 0;

    for (const [id, task] of this.tasks.entries()) {
      const isTerminal = [
        HandlerStatus.COMPLETED, 
        HandlerStatus.FAILED, 
        HandlerStatus.CANCELLED
      ].includes(task.status);

      if (isTerminal && task.completedAt < cutoff) {
        this.tasks.delete(id);
        cleared++;
      }
    }

    // Also clear from queue manager
    cleared += this.queueManager.clearOldCompleted(hours);

    logger.info('Old tasks cleared', { cleared, remaining: this.tasks.size });
    return { cleared, remaining: this.tasks.size };
  }

  // ============================================
  // PUBLIC API - GITHUB INTEGRATION
  // ============================================

  /**
   * Create a GitHub issue for a task
   */
  async createGitHubIssue(options) {
    if (!this.octokit) {
      return {
        success: false,
        error: 'GitHub not configured. Provide githubToken in constructor config.'
      };
    }

    const { title, body, labels = [], owner, repo } = options;
    const targetOwner = owner || this.config.githubOwner;
    const targetRepo = repo || this.config.githubRepo;

    if (!targetOwner || !targetRepo) {
      return {
        success: false,
        error: 'GitHub owner and repo are required'
      };
    }

    try {
      const response = await this.octokit.issues.create({
        owner: targetOwner,
        repo: targetRepo,
        title,
        body,
        labels
      });

      logger.info('GitHub issue created', { 
        number: response.data.number, 
        url: response.data.html_url 
      });

      return {
        success: true,
        issue: {
          number: response.data.number,
          title: response.data.title,
          url: response.data.html_url,
          state: response.data.state
        }
      };
    } catch (err) {
      logger.error('Failed to create GitHub issue', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Create a GitHub Pull Request
   */
  async createGitHubPR(options) {
    if (!this.octokit) {
      return {
        success: false,
        error: 'GitHub not configured. Provide githubToken in constructor config.'
      };
    }

    const { title, body, head, base = 'main', owner, repo, draft = false } = options;
    const targetOwner = owner || this.config.githubOwner;
    const targetRepo = repo || this.config.githubRepo;

    if (!targetOwner || !targetRepo) {
      return { success: false, error: 'GitHub owner and repo are required' };
    }

    if (!head) {
      return { success: false, error: 'Head branch is required for PR creation' };
    }

    try {
      const response = await this.octokit.pulls.create({
        owner: targetOwner,
        repo: targetRepo,
        title,
        body,
        head,
        base,
        draft
      });

      logger.info('GitHub PR created', { 
        number: response.data.number, 
        url: response.data.html_url 
      });

      return {
        success: true,
        pr: {
          number: response.data.number,
          title: response.data.title,
          url: response.data.html_url,
          state: response.data.state,
          head: response.data.head.ref,
          base: response.data.base.ref
        }
      };
    } catch (err) {
      logger.error('Failed to create GitHub PR', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Get GitHub repository information
   */
  async getGitHubRepo(owner, repo) {
    if (!this.octokit) {
      return {
        success: false,
        error: 'GitHub not configured'
      };
    }

    const targetOwner = owner || this.config.githubOwner;
    const targetRepo = repo || this.config.githubRepo;

    try {
      const response = await this.octokit.repos.get({
        owner: targetOwner,
        repo: targetRepo
      });

      return {
        success: true,
        repository: {
          name: response.data.name,
          fullName: response.data.full_name,
          description: response.data.description,
          url: response.data.html_url,
          defaultBranch: response.data.default_branch,
          openIssues: response.data.open_issues_count,
          stars: response.data.stargazers_count
        }
      };
    } catch (err) {
      logger.error('Failed to get GitHub repo', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ============================================
  // PUBLIC API - WEBHOOKS
  // ============================================

  /**
   * Register a webhook
   */
  registerWebhook(config) {
    return this.webhookManager.register(config.id, config);
  }

  /**
   * Unregister a webhook
   */
  unregisterWebhook(webhookId) {
    return this.webhookManager.unregister(webhookId);
  }

  /**
   * List all webhooks
   */
  listWebhooks() {
    return this.webhookManager.list();
  }

  /**
   * Trigger a webhook manually
   */
  async triggerWebhook(event, payload) {
    return this.webhookManager.trigger(event, payload);
  }

  // ============================================
  // PUBLIC API - HEALTH & STATUS
  // ============================================

  /**
   * Get handler health status
   */
  getHealth() {
    return {
      status: 'ok',
      mode: this.config.simulationMode ? 'simulation' : 'live',
      queue: this.getQueueStats(),
      github: {
        configured: Boolean(this.octokit),
        owner: this.config.githubOwner || null,
        repo: this.config.githubRepo || null
      },
      webhooks: {
        count: this.webhookManager.webhooks.size
      },
      config: {
        maxConcurrent: this.config.maxConcurrent,
        defaultTimeout: this.config.defaultTimeout,
        pollInterval: this.config.pollInterval
      },
      uptime: process.uptime()
    };
  }

  /**
   * Shutdown the handler gracefully
   */
  async shutdown() {
    // Stop all polling
    for (const taskId of this.pollingIntervals.keys()) {
      this._stopPolling(taskId);
    }

    // Cancel all queued tasks
    for (const task of this.queueManager.queue) {
      await this.cancelTask(task.id);
    }

    logger.info('JulesAsyncHandler shutdown complete');
    return { success: true };
  }
}

// ============================================
// MODULE EXPORTS
// ============================================

// Default export - the main handler class
export default JulesAsyncHandler;

// Named exports for convenience
export {
  TaskQueueManager,
  WebhookManager
};
