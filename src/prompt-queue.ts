/**
 * HYDRA Prompt Queue System - Advanced prompt scheduling and execution
 *
 * Features:
 * - Priority-based scheduling (urgent, high, normal, low, background)
 * - Rate limiting with token bucket algorithm
 * - Retry logic with exponential backoff
 * - Concurrency control
 * - Progress tracking
 * - Cancellation support
 * - Error recovery
 */

import { EventEmitter } from 'events';

// Priority levels
export const Priority = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  BACKGROUND: 4
};

// Queue item status
export const Status = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
};

/**
 * Priority Queue implementation using binary heap
 */
class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  enqueue(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
    return item.id;
  }

  dequeue() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop();

    const top = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._bubbleDown(0);
    return top;
  }

  peek() {
    return this.heap[0] || null;
  }

  remove(id) {
    const index = this.heap.findIndex((item) => item.id === id);
    if (index === -1) return false;

    if (index === this.heap.length - 1) {
      this.heap.pop();
    } else {
      this.heap[index] = this.heap.pop();
      this._bubbleUp(index);
      this._bubbleDown(index);
    }
    return true;
  }

  get length() {
    return this.heap.length;
  }

  getAll() {
    return [...this.heap].sort((a, b) => this._compare(a, b));
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this._compare(this.heap[index], this.heap[parentIndex]) >= 0) break;
      [this.heap[index], this.heap[parentIndex]] = [
        this.heap[parentIndex],
        this.heap[index]
      ];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < length &&
        this._compare(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild;
      }
      if (
        rightChild < length &&
        this._compare(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index]
      ];
      index = smallest;
    }
  }

  _compare(a, b) {
    // First by priority (lower = higher priority)
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Then by timestamp (older first - FIFO within same priority)
    return a.createdAt - b.createdAt;
  }
}

/**
 * Token Bucket Rate Limiter
 */
class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 10;
    this.refillRate = options.refillRate || 2; // tokens per second
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1) {
    this._refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    // Calculate wait time
    const needed = tokens - this.tokens;
    const waitMs = (needed / this.refillRate) * 1000;

    await this._sleep(waitMs);
    this._refill();
    this.tokens -= tokens;
    return true;
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate
    );
    this.lastRefill = now;
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus() {
    this._refill();
    return {
      availableTokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      refillRate: this.refillRate
    };
  }
}

/**
 * Main Prompt Queue Manager
 */
export class PromptQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxConcurrent: options.maxConcurrent || 4,
      maxRetries: options.maxRetries || 3,
      retryDelayBase: options.retryDelayBase || 1000,
      retryDelayMax: options.retryDelayMax || 30000,
      timeout: options.timeout || 60000,
      rateLimit: options.rateLimit || { maxTokens: 10, refillRate: 2 },
      ...options
    };

    this.queue = new PriorityQueue();
    this.rateLimiter = new RateLimiter(this.options.rateLimit);
    this.running = new Map(); // id -> item
    this.completed = new Map(); // id -> result
    this.nextId = 1;
    this.isProcessing = false;
    this.isPaused = false;

    // Statistics
    this.stats = {
      totalQueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      totalRetries: 0,
      averageTime: 0,
      startTime: Date.now()
    };
  }

  /**
   * Add a prompt to the queue
   */
  enqueue(prompt, options = {}) {
    const item = {
      id: this.nextId++,
      prompt,
      priority: options.priority ?? Priority.NORMAL,
      model: options.model || 'llama3.2:3b',
      handler: options.handler, // Custom handler function
      metadata: options.metadata || {},
      status: Status.PENDING,
      attempts: 0,
      maxRetries: options.maxRetries ?? this.options.maxRetries,
      timeout: options.timeout ?? this.options.timeout,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    };

    this.queue.enqueue(item);
    this.stats.totalQueued++;

    this.emit('enqueued', {
      id: item.id,
      priority: item.priority,
      prompt: prompt.substring(0, 50)
    });

    // Start processing if not already running
    if (!this.isProcessing && !this.isPaused) {
      this._processQueue();
    }

    return item.id;
  }

  /**
   * Add multiple prompts at once
   */
  enqueueBatch(prompts, options = {}) {
    return prompts.map((prompt, index) => {
      const itemOptions = {
        ...options,
        priority: options.priority ?? Priority.NORMAL,
        metadata: {
          ...options.metadata,
          batchIndex: index,
          batchSize: prompts.length
        }
      };
      return this.enqueue(prompt, itemOptions);
    });
  }

  /**
   * Cancel a queued item
   */
  cancel(id) {
    // Try to remove from queue
    if (this.queue.remove(id)) {
      this.stats.totalCancelled++;
      this.emit('cancelled', { id });
      return true;
    }

    // Mark running item for cancellation
    const running = this.running.get(id);
    if (running) {
      running.status = Status.CANCELLED;
      this.emit('cancelled', { id });
      return true;
    }

    return false;
  }

  /**
   * Cancel all items
   */
  cancelAll() {
    const cancelled = [];

    // Cancel queued items
    for (const item of this.queue.getAll()) {
      this.queue.remove(item.id);
      cancelled.push(item.id);
    }

    // Cancel running items
    for (const [id, item] of this.running) {
      item.status = Status.CANCELLED;
      cancelled.push(id);
    }

    this.stats.totalCancelled += cancelled.length;
    this.emit('allCancelled', { count: cancelled.length });
    return cancelled;
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.isPaused = true;
    this.emit('paused');
  }

  /**
   * Resume queue processing
   */
  resume() {
    this.isPaused = false;
    this.emit('resumed');
    this._processQueue();
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      isPaused: this.isPaused,
      isProcessing: this.isProcessing,
      rateLimit: this.rateLimiter.getStatus(),
      stats: { ...this.stats },
      uptime: Date.now() - this.stats.startTime
    };
  }

  /**
   * Get item by ID
   */
  getItem(id) {
    // Check running
    if (this.running.has(id)) {
      return { ...this.running.get(id) };
    }

    // Check completed
    if (this.completed.has(id)) {
      return { ...this.completed.get(id) };
    }

    // Check queue
    const queued = this.queue.getAll().find((item) => item.id === id);
    if (queued) {
      return { ...queued };
    }

    return null;
  }

  /**
   * Wait for an item to complete
   */
  async waitFor(id, timeout = null) {
    const item = this.getItem(id);
    if (!item) {
      throw new Error(`Item ${id} not found`);
    }

    if (
      item.status === Status.COMPLETED ||
      item.status === Status.FAILED ||
      item.status === Status.CANCELLED
    ) {
      return item;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = timeout
        ? setTimeout(() => {
            reject(new Error(`Timeout waiting for item ${id}`));
          }, timeout)
        : null;

      const handler = (event) => {
        if (event.id === id) {
          if (timeoutId) clearTimeout(timeoutId);
          this.off('completed', handler);
          this.off('failed', handler);
          this.off('cancelled', handler);
          resolve(this.getItem(id));
        }
      };

      this.on('completed', handler);
      this.on('failed', handler);
      this.on('cancelled', handler);
    });
  }

  /**
   * Wait for all items to complete
   */
  async waitForAll(ids, timeout = null) {
    return Promise.all(ids.map((id) => this.waitFor(id, timeout)));
  }

  /**
   * Set default handler for processing prompts
   */
  setHandler(handler) {
    this.defaultHandler = handler;
  }

  /**
   * Internal: Process the queue
   */
  async _processQueue() {
    if (this.isProcessing || this.isPaused) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && !this.isPaused) {
        // Check concurrency limit
        if (this.running.size >= this.options.maxConcurrent) {
          await this._waitForSlot();
          continue;
        }

        // Get next item
        const item = this.queue.dequeue();
        if (!item) break;

        // Acquire rate limit token
        await this.rateLimiter.acquire();

        // Start processing (don't await - run in parallel)
        this._processItem(item);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Internal: Process a single item
   */
  async _processItem(item) {
    item.status = Status.RUNNING;
    item.startedAt = Date.now();
    item.attempts++;
    this.running.set(item.id, item);

    this.emit('started', { id: item.id, attempt: item.attempts });

    try {
      // Get handler
      const handler = item.handler || this.defaultHandler;
      if (!handler) {
        throw new Error('No handler defined for prompt processing');
      }

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), item.timeout);
      });

      // Execute with timeout
      const result = await Promise.race([
        handler(item.prompt, item.model, item.metadata),
        timeoutPromise
      ]);

      // Check if cancelled during execution
      if (item.status === Status.CANCELLED) {
        this.running.delete(item.id);
        return;
      }

      // Success
      item.status = Status.COMPLETED;
      item.completedAt = Date.now();
      item.result = result;

      this.running.delete(item.id);
      this.completed.set(item.id, item);
      this.stats.totalCompleted++;

      // Update average time
      const duration = item.completedAt - item.startedAt;
      this.stats.averageTime =
        (this.stats.averageTime * (this.stats.totalCompleted - 1) + duration) /
        this.stats.totalCompleted;

      this.emit('completed', { id: item.id, result, duration });
    } catch (error) {
      // Check if cancelled
      if (item.status === Status.CANCELLED) {
        this.running.delete(item.id);
        return;
      }

      // Retry logic
      if (item.attempts < item.maxRetries) {
        item.status = Status.RETRYING;
        item.error = error.message;
        this.running.delete(item.id);
        this.stats.totalRetries++;

        // Exponential backoff
        const delay = Math.min(
          this.options.retryDelayBase * Math.pow(2, item.attempts - 1),
          this.options.retryDelayMax
        );

        this.emit('retrying', {
          id: item.id,
          attempt: item.attempts,
          delay,
          error: error.message
        });

        await this._sleep(delay);

        // Re-queue with same priority
        this.queue.enqueue(item);
        this._processQueue();
      } else {
        // Final failure
        item.status = Status.FAILED;
        item.completedAt = Date.now();
        item.error = error.message;

        this.running.delete(item.id);
        this.completed.set(item.id, item);
        this.stats.totalFailed++;

        this.emit('failed', {
          id: item.id,
          error: error.message,
          attempts: item.attempts
        });
      }
    }

    // Continue processing
    this._processQueue();
  }

  /**
   * Internal: Wait for a processing slot
   */
  async _waitForSlot() {
    return new Promise((resolve) => {
      const handler = () => {
        if (this.running.size < this.options.maxConcurrent) {
          this.off('completed', handler);
          this.off('failed', handler);
          this.off('cancelled', handler);
          resolve();
        }
      };
      this.on('completed', handler);
      this.on('failed', handler);
      this.on('cancelled', handler);
    });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let queueInstance = null;

/**
 * Get or create queue instance
 */
export function getQueue(options = {}) {
  if (!queueInstance) {
    queueInstance = new PromptQueue(options);
  }
  return queueInstance;
}

/**
 * Reset queue instance
 */
export function resetQueue() {
  if (queueInstance) {
    queueInstance.cancelAll();
    queueInstance.removeAllListeners();
  }
  queueInstance = null;
}

/**
 * Quick enqueue function
 */
export function enqueue(prompt, options = {}) {
  return getQueue().enqueue(prompt, options);
}

/**
 * Quick batch enqueue
 */
export function enqueueBatch(prompts, options = {}) {
  return getQueue().enqueueBatch(prompts, options);
}

/**
 * Get queue status
 */
export function getQueueStatus() {
  return getQueue().getStatus();
}

/**
 * Cancel item
 */
export function cancelItem(id) {
  return getQueue().cancel(id);
}

/**
 * Pause queue
 */
export function pauseQueue() {
  return getQueue().pause();
}

/**
 * Resume queue
 */
export function resumeQueue() {
  return getQueue().resume();
}

// ============================================================================
// AGENT QUEUE MANAGER - 12 Parallel Witcher Agent Queues
// ============================================================================

import { Agents, AgentRoles, Models } from './constants.js';

/**
 * Load balancing strategies
 * @readonly
 * @enum {string}
 */
export const LoadBalancingStrategy = Object.freeze({
  ROUND_ROBIN: 'round_robin',
  LEAST_LOADED: 'least_loaded',
  WEIGHTED: 'weighted',
  RANDOM: 'random',
  ROLE_BASED: 'role_based'
});

/**
 * Channel states
 * @readonly
 * @enum {string}
 */
export const ChannelState = Object.freeze({
  ACTIVE: 'active',
  PAUSED: 'paused',
  DRAINING: 'draining',
  OFFLINE: 'offline'
});

/**
 * Individual Agent Channel - manages queue for single agent
 */
class AgentChannel extends EventEmitter {
  constructor(agentName, agentConfig, options = {}) {
    super();
    this.agentName = agentName;
    this.agentConfig = agentConfig;
    this.options = {
      maxConcurrent: options.maxConcurrent || 2,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 60000,
      weight: options.weight || 1.0,
      ...options
    };

    this.queue = new PriorityQueue();
    this.rateLimiter = new RateLimiter({ maxTokens: 5, refillRate: 1 });
    this.running = new Map();
    this.state = ChannelState.ACTIVE;
    this.defaultHandler = null;

    // Per-agent metrics
    this.metrics = {
      totalQueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      totalRetries: 0,
      averageResponseTime: 0,
      lastResponseTime: 0,
      currentLoad: 0,
      peakLoad: 0,
      startTime: Date.now()
    };
  }

  enqueue(item) {
    item.channelId = `${this.agentName}-${this.metrics.totalQueued + 1}`;
    this.queue.enqueue(item);
    this.metrics.totalQueued++;
    this.emit('enqueued', { channelId: item.channelId, agentName: this.agentName });
    return item.channelId;
  }

  dequeue() {
    return this.queue.dequeue();
  }

  canAcceptWork() {
    return (
      this.state === ChannelState.ACTIVE &&
      this.running.size < this.options.maxConcurrent
    );
  }

  getLoad() {
    return this.running.size / this.options.maxConcurrent;
  }

  startItem(item) {
    item.status = Status.RUNNING;
    item.startedAt = Date.now();
    item.attempts++;
    this.running.set(item.channelId, item);
    this.metrics.currentLoad = this.getLoad();
    this.metrics.peakLoad = Math.max(this.metrics.peakLoad, this.metrics.currentLoad);
    this.emit('started', { channelId: item.channelId, agentName: this.agentName, attempt: item.attempts });
  }

  completeItem(item, result) {
    item.status = Status.COMPLETED;
    item.completedAt = Date.now();
    item.result = result;

    const duration = item.completedAt - item.startedAt;
    this.metrics.lastResponseTime = duration;
    this.metrics.totalCompleted++;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalCompleted - 1) + duration) /
      this.metrics.totalCompleted;

    this.running.delete(item.channelId);
    this.metrics.currentLoad = this.getLoad();
    this.emit('completed', { channelId: item.channelId, agentName: this.agentName, result, duration });
  }

  failItem(item, error) {
    item.status = Status.FAILED;
    item.completedAt = Date.now();
    item.error = error;
    this.metrics.totalFailed++;

    this.running.delete(item.channelId);
    this.metrics.currentLoad = this.getLoad();
    this.emit('failed', { channelId: item.channelId, agentName: this.agentName, error, attempts: item.attempts });
  }

  pause() {
    this.state = ChannelState.PAUSED;
    this.emit('stateChanged', { agentName: this.agentName, state: this.state });
  }

  resume() {
    this.state = ChannelState.ACTIVE;
    this.emit('stateChanged', { agentName: this.agentName, state: this.state });
  }

  drain() {
    this.state = ChannelState.DRAINING;
    this.emit('stateChanged', { agentName: this.agentName, state: this.state });
  }

  offline() {
    this.state = ChannelState.OFFLINE;
    this.emit('stateChanged', { agentName: this.agentName, state: this.state });
  }

  getStatus() {
    const uptime = Date.now() - this.metrics.startTime;
    const throughput = uptime > 0 ? (this.metrics.totalCompleted / (uptime / 60000)) : 0;
    const successRate = this.metrics.totalCompleted + this.metrics.totalFailed > 0
      ? (this.metrics.totalCompleted / (this.metrics.totalCompleted + this.metrics.totalFailed)) * 100
      : 100;

    return {
      agentName: this.agentName,
      role: this.agentConfig.role,
      model: this.agentConfig.model,
      state: this.state,
      queued: this.queue.length,
      running: this.running.size,
      load: this.getLoad(),
      metrics: {
        ...this.metrics,
        successRate,
        throughput,
        uptime
      }
    };
  }
}

/**
 * AgentQueueManager - Manages 12 parallel Witcher agent queues
 *
 * Features:
 * - 12 dedicated agent channels (Witcher-themed)
 * - Load balancing (round-robin, least-loaded, weighted, random, role-based)
 * - Per-agent metrics and monitoring
 * - Role-based task routing
 * - Automatic failover
 */
export class AgentQueueManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxConcurrentPerAgent: options.maxConcurrentPerAgent || 2,
      totalMaxConcurrent: options.totalMaxConcurrent || 12,
      defaultStrategy: options.defaultStrategy || LoadBalancingStrategy.LEAST_LOADED,
      enableMetrics: options.enableMetrics !== false,
      metricsInterval: options.metricsInterval || 30000,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 60000,
      ...options
    };

    this.channels = new Map();
    this._initializeChannels();

    this.isProcessing = false;
    this.isPaused = false;
    this.roundRobinIndex = 0;
    this.defaultHandler = null;

    this.globalMetrics = {
      totalQueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalRouted: 0,
      startTime: Date.now(),
      lastActivityTime: Date.now()
    };

    if (this.options.enableMetrics) {
      this._startMetricsCollection();
    }
  }

  _initializeChannels() {
    const agentNames = Object.values(Agents);

    for (const agentName of agentNames) {
      const agentConfig = AgentRoles[agentName];
      const channel = new AgentChannel(agentName, agentConfig, {
        maxConcurrent: this.options.maxConcurrentPerAgent,
        maxRetries: this.options.maxRetries,
        timeout: this.options.timeout,
        weight: this._getAgentWeight(agentConfig.role)
      });

      channel.on('enqueued', (data) => this.emit('agentEnqueued', data));
      channel.on('started', (data) => this.emit('agentStarted', data));
      channel.on('completed', (data) => {
        this.globalMetrics.totalCompleted++;
        this.globalMetrics.lastActivityTime = Date.now();
        this.emit('agentCompleted', data);
        this._processNextInQueue();
      });
      channel.on('failed', (data) => {
        this.globalMetrics.totalFailed++;
        this.globalMetrics.lastActivityTime = Date.now();
        this.emit('agentFailed', data);
        this._processNextInQueue();
      });
      channel.on('stateChanged', (data) => this.emit('channelStateChanged', data));

      this.channels.set(agentName, channel);
    }

    this.emit('initialized', { agentCount: this.channels.size });
  }

  _getAgentWeight(role) {
    const weights = {
      coordinator: 1.5,
      analyst: 1.2,
      coder: 1.3,
      writer: 1.0,
      reviewer: 1.1,
      fast: 2.0,
      tester: 1.2,
      debugger: 1.2,
      optimizer: 1.1,
      security: 1.0,
      architect: 1.1,
      researcher: 1.0
    };
    return weights[role] || 1.0;
  }

  enqueue(prompt, options = {}) {
    const strategy = options.strategy || this.options.defaultStrategy;
    const preferredRole = options.role;
    const preferredAgent = options.agent;

    let selectedAgent;

    if (preferredAgent && this.channels.has(preferredAgent)) {
      selectedAgent = preferredAgent;
    } else if (preferredRole) {
      selectedAgent = this._selectAgentByRole(preferredRole);
    } else {
      selectedAgent = this._selectAgent(strategy);
    }

    if (!selectedAgent) {
      throw new Error('No available agent to handle request');
    }

    const channel = this.channels.get(selectedAgent);
    const item = {
      id: this.globalMetrics.totalQueued + 1,
      prompt,
      priority: options.priority ?? Priority.NORMAL,
      model: options.model || channel.agentConfig.model,
      handler: options.handler,
      metadata: {
        ...options.metadata,
        routedBy: strategy,
        originalRole: preferredRole
      },
      status: Status.PENDING,
      attempts: 0,
      maxRetries: options.maxRetries ?? this.options.maxRetries,
      timeout: options.timeout ?? this.options.timeout,
      createdAt: Date.now()
    };

    const channelId = channel.enqueue(item);
    this.globalMetrics.totalQueued++;
    this.globalMetrics.totalRouted++;
    this.globalMetrics.lastActivityTime = Date.now();

    this.emit('enqueued', {
      id: item.id,
      channelId,
      agent: selectedAgent,
      strategy
    });

    if (!this.isProcessing && !this.isPaused) {
      this._processAllChannels();
    }

    return { id: item.id, channelId, agent: selectedAgent };
  }

  enqueueToAgent(agentName, prompt, options = {}) {
    if (!this.channels.has(agentName)) {
      throw new Error(`Unknown agent: ${agentName}`);
    }
    return this.enqueue(prompt, { ...options, agent: agentName });
  }

  enqueueBatch(prompts, options = {}) {
    return prompts.map((prompt, index) => {
      return this.enqueue(prompt, {
        ...options,
        metadata: {
          ...options.metadata,
          batchIndex: index,
          batchSize: prompts.length
        }
      });
    });
  }

  enqueueBatchDistributed(prompts, options = {}) {
    const agents = this._getActiveAgents();
    return prompts.map((prompt, index) => {
      const agentIndex = index % agents.length;
      return this.enqueueToAgent(agents[agentIndex], prompt, {
        ...options,
        metadata: {
          ...options.metadata,
          batchIndex: index,
          batchSize: prompts.length,
          distributedTo: agents[agentIndex]
        }
      });
    });
  }

  _selectAgent(strategy) {
    const activeAgents = this._getActiveAgents();
    if (activeAgents.length === 0) return null;

    switch (strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this._selectRoundRobin(activeAgents);
      case LoadBalancingStrategy.LEAST_LOADED:
        return this._selectLeastLoaded(activeAgents);
      case LoadBalancingStrategy.WEIGHTED:
        return this._selectWeighted(activeAgents);
      case LoadBalancingStrategy.RANDOM:
        return this._selectRandom(activeAgents);
      default:
        return this._selectLeastLoaded(activeAgents);
    }
  }

  _getActiveAgents() {
    const active = [];
    for (const [name, channel] of this.channels) {
      if (channel.state === ChannelState.ACTIVE) {
        active.push(name);
      }
    }
    return active;
  }

  _selectRoundRobin(agents) {
    const agent = agents[this.roundRobinIndex % agents.length];
    this.roundRobinIndex++;
    return agent;
  }

  _selectLeastLoaded(agents) {
    let minLoad = Infinity;
    let selected = agents[0];

    for (const name of agents) {
      const channel = this.channels.get(name);
      const load = channel.getLoad();
      if (load < minLoad) {
        minLoad = load;
        selected = name;
      }
    }

    return selected;
  }

  _selectWeighted(agents) {
    let totalWeight = 0;
    const weights = [];

    for (const name of agents) {
      const channel = this.channels.get(name);
      const weight = channel.options.weight * (1 - channel.getLoad());
      weights.push({ name, weight });
      totalWeight += weight;
    }

    let random = Math.random() * totalWeight;
    for (const { name, weight } of weights) {
      random -= weight;
      if (random <= 0) return name;
    }

    return agents[0];
  }

  _selectRandom(agents) {
    return agents[Math.floor(Math.random() * agents.length)];
  }

  _selectAgentByRole(role) {
    const roleAgents = [];

    for (const [name, channel] of this.channels) {
      if (
        channel.agentConfig.role === role &&
        channel.state === ChannelState.ACTIVE
      ) {
        roleAgents.push(name);
      }
    }

    if (roleAgents.length === 0) {
      return this._selectLeastLoaded(this._getActiveAgents());
    }

    return this._selectLeastLoaded(roleAgents);
  }

  async _processAllChannels() {
    if (this.isProcessing || this.isPaused) return;
    this.isProcessing = true;

    try {
      const processPromises = [];

      for (const [, channel] of this.channels) {
        if (channel.canAcceptWork() && channel.queue.length > 0) {
          processPromises.push(this._processChannel(channel));
        }
      }

      await Promise.all(processPromises);
    } finally {
      this.isProcessing = false;

      if (this._hasMoreWork() && !this.isPaused) {
        setImmediate(() => this._processAllChannels());
      }
    }
  }

  async _processChannel(channel) {
    while (channel.canAcceptWork() && channel.queue.length > 0) {
      const item = channel.dequeue();
      if (!item) break;

      await channel.rateLimiter.acquire();
      this._processItem(channel, item);
    }
  }

  async _processItem(channel, item) {
    channel.startItem(item);

    try {
      const handler = item.handler || this.defaultHandler;
      if (!handler) {
        throw new Error('No handler defined for prompt processing');
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), item.timeout);
      });

      const result = await Promise.race([
        handler(item.prompt, item.model, {
          ...item.metadata,
          agentName: channel.agentName,
          agentRole: channel.agentConfig.role
        }),
        timeoutPromise
      ]);

      channel.completeItem(item, result);
    } catch (error) {
      if (item.attempts < item.maxRetries) {
        item.status = Status.RETRYING;
        channel.metrics.totalRetries++;

        const delay = Math.min(1000 * Math.pow(2, item.attempts - 1), 30000);

        this.emit('retrying', {
          channelId: item.channelId,
          agentName: channel.agentName,
          attempt: item.attempts,
          delay,
          error: error.message
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
        channel.queue.enqueue(item);
        this._processNextInQueue();
      } else {
        channel.failItem(item, error.message);
      }
    }
  }

  _processNextInQueue() {
    if (!this.isPaused) {
      setImmediate(() => this._processAllChannels());
    }
  }

  _hasMoreWork() {
    for (const [, channel] of this.channels) {
      if (channel.queue.length > 0 && channel.canAcceptWork()) {
        return true;
      }
    }
    return false;
  }

  setHandler(handler) {
    this.defaultHandler = handler;
    for (const [, channel] of this.channels) {
      channel.defaultHandler = handler;
    }
  }

  getChannel(agentName) {
    return this.channels.get(agentName);
  }

  getAllChannelStatuses() {
    const statuses = {};
    for (const [name, channel] of this.channels) {
      statuses[name] = channel.getStatus();
    }
    return statuses;
  }

  getMetrics() {
    const perAgent = {};
    let totalQueued = 0;
    let totalRunning = 0;
    let totalCompleted = 0;
    let totalFailed = 0;
    let avgResponseTime = 0;
    let avgSuccessRate = 0;
    let totalThroughput = 0;

    for (const [name, channel] of this.channels) {
      const status = channel.getStatus();
      perAgent[name] = status.metrics;

      totalQueued += status.queued;
      totalRunning += status.running;
      totalCompleted += status.metrics.totalCompleted;
      totalFailed += status.metrics.totalFailed;
      avgResponseTime += status.metrics.averageResponseTime;
      avgSuccessRate += status.metrics.successRate;
      totalThroughput += status.metrics.throughput;
    }

    const agentCount = this.channels.size;

    return {
      summary: {
        totalAgents: agentCount,
        activeAgents: this._getActiveAgents().length,
        totalQueued,
        totalRunning,
        totalCompleted,
        totalFailed,
        averageResponseTime: avgResponseTime / agentCount,
        averageSuccessRate: avgSuccessRate / agentCount,
        totalThroughput,
        uptime: Date.now() - this.globalMetrics.startTime
      },
      perAgent,
      global: { ...this.globalMetrics }
    };
  }

  getStatus() {
    return {
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      channels: this.getAllChannelStatuses(),
      metrics: this.getMetrics(),
      config: {
        maxConcurrentPerAgent: this.options.maxConcurrentPerAgent,
        totalMaxConcurrent: this.options.totalMaxConcurrent,
        defaultStrategy: this.options.defaultStrategy
      }
    };
  }

  pause() {
    this.isPaused = true;
    for (const [, channel] of this.channels) {
      channel.pause();
    }
    this.emit('paused');
  }

  resume() {
    this.isPaused = false;
    for (const [, channel] of this.channels) {
      channel.resume();
    }
    this.emit('resumed');
    this._processAllChannels();
  }

  pauseAgent(agentName) {
    const channel = this.channels.get(agentName);
    if (channel) {
      channel.pause();
      return true;
    }
    return false;
  }

  resumeAgent(agentName) {
    const channel = this.channels.get(agentName);
    if (channel) {
      channel.resume();
      this._processAllChannels();
      return true;
    }
    return false;
  }

  offlineAgent(agentName) {
    const channel = this.channels.get(agentName);
    if (channel) {
      channel.offline();
      return true;
    }
    return false;
  }

  drainAgent(agentName) {
    const channel = this.channels.get(agentName);
    if (channel) {
      channel.drain();
      return true;
    }
    return false;
  }

  cancelAgent(agentName) {
    const channel = this.channels.get(agentName);
    if (!channel) return [];

    const cancelled = [];
    for (const item of channel.queue.getAll()) {
      channel.queue.remove(item.channelId);
      cancelled.push(item.channelId);
    }

    channel.metrics.totalCancelled += cancelled.length;
    return cancelled;
  }

  cancelAll() {
    const cancelled = [];
    for (const [name] of this.channels) {
      cancelled.push(...this.cancelAgent(name));
    }
    this.emit('allCancelled', { count: cancelled.length });
    return cancelled;
  }

  async waitForAgent(agentName, timeout = null) {
    const channel = this.channels.get(agentName);
    if (!channel) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = timeout
        ? setTimeout(() => {
            reject(new Error(`Timeout waiting for agent ${agentName}`));
          }, timeout)
        : null;

      const checkComplete = () => {
        if (channel.queue.length === 0 && channel.running.size === 0) {
          if (timeoutId) clearTimeout(timeoutId);
          channel.off('completed', checkComplete);
          channel.off('failed', checkComplete);
          resolve(channel.getStatus());
        }
      };

      channel.on('completed', checkComplete);
      channel.on('failed', checkComplete);
      checkComplete();
    });
  }

  async waitForAll(timeout = null) {
    const promises = [];
    for (const [name] of this.channels) {
      promises.push(this.waitForAgent(name, timeout));
    }
    return Promise.all(promises);
  }

  _startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getMetrics();
      this.emit('metrics', metrics);
    }, this.options.metricsInterval);
  }

  stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  shutdown() {
    this.stopMetricsCollection();
    this.cancelAll();
    this.removeAllListeners();
    for (const [, channel] of this.channels) {
      channel.removeAllListeners();
    }
    this.emit('shutdown');
  }
}

// ============================================================================
// Agent Queue Manager Singleton & Helper Functions
// ============================================================================

let agentQueueInstance = null;

/**
 * Get or create AgentQueueManager instance
 */
export function getAgentQueue(options = {}) {
  if (!agentQueueInstance) {
    agentQueueInstance = new AgentQueueManager(options);
  }
  return agentQueueInstance;
}

/**
 * Reset AgentQueueManager instance
 */
export function resetAgentQueue() {
  if (agentQueueInstance) {
    agentQueueInstance.shutdown();
  }
  agentQueueInstance = null;
}

/**
 * Quick enqueue to agent system
 */
export function enqueueToAgents(prompt, options = {}) {
  return getAgentQueue().enqueue(prompt, options);
}

/**
 * Quick enqueue to specific agent
 */
export function enqueueToSpecificAgent(agentName, prompt, options = {}) {
  return getAgentQueue().enqueueToAgent(agentName, prompt, options);
}

/**
 * Quick batch enqueue to agents
 */
export function enqueueBatchToAgents(prompts, options = {}) {
  return getAgentQueue().enqueueBatch(prompts, options);
}

/**
 * Quick batch enqueue distributed across agents
 */
export function enqueueBatchDistributed(prompts, options = {}) {
  return getAgentQueue().enqueueBatchDistributed(prompts, options);
}

/**
 * Get agent queue status
 */
export function getAgentQueueStatus() {
  return getAgentQueue().getStatus();
}

/**
 * Get agent metrics
 */
export function getAgentMetrics() {
  return getAgentQueue().getMetrics();
}

/**
 * Pause specific agent
 */
export function pauseAgentQueue(agentName) {
  return getAgentQueue().pauseAgent(agentName);
}

/**
 * Resume specific agent
 */
export function resumeAgentQueue(agentName) {
  return getAgentQueue().resumeAgent(agentName);
}

/**
 * Get agent channel
 */
export function getAgentChannel(agentName) {
  return getAgentQueue().getChannel(agentName);
}

/**
 * Get all active agents
 */
export function getActiveAgents() {
  return getAgentQueue()._getActiveAgents();
}

/**
 * Set handler for all agents
 */
export function setAgentHandler(handler) {
  return getAgentQueue().setHandler(handler);
}
