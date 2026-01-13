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
    const index = this.heap.findIndex(item => item.id === id);
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
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this._compare(this.heap[leftChild], this.heap[smallest]) < 0) {
        smallest = leftChild;
      }
      if (rightChild < length && this._compare(this.heap[rightChild], this.heap[smallest]) < 0) {
        smallest = rightChild;
      }

      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
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
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    this.emit('enqueued', { id: item.id, priority: item.priority, prompt: prompt.substring(0, 50) });

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
        metadata: { ...options.metadata, batchIndex: index, batchSize: prompts.length }
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
    const queued = this.queue.getAll().find(item => item.id === id);
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

    if (item.status === Status.COMPLETED || item.status === Status.FAILED || item.status === Status.CANCELLED) {
      return item;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = timeout ? setTimeout(() => {
        reject(new Error(`Timeout waiting for item ${id}`));
      }, timeout) : null;

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
    return Promise.all(ids.map(id => this.waitFor(id, timeout)));
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
      this.stats.averageTime = (this.stats.averageTime * (this.stats.totalCompleted - 1) + duration) / this.stats.totalCompleted;

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

        this.emit('retrying', { id: item.id, attempt: item.attempts, delay, error: error.message });

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

        this.emit('failed', { id: item.id, error: error.message, attempts: item.attempts });
      }
    }

    // Continue processing
    this._processQueue();
  }

  /**
   * Internal: Wait for a processing slot
   */
  async _waitForSlot() {
    return new Promise(resolve => {
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
    return new Promise(resolve => setTimeout(resolve, ms));
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
