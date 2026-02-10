/**
 * @fileoverview ClaudeInstanceManager — Pool of Claude Code instances
 *
 * Manages a pool of ClaudeCodeInstance objects with:
 * - Least-loaded / round-robin / agent-affinity load balancing
 * - Auto-scaling (scale up when queue grows, scale down when idle)
 * - Queued acquire with timeout
 * - Health monitoring and crash recovery
 * - Stats integration with StatsCollector
 *
 * Improvements v2.2:
 *   #3  — Queue Overflow Protection (maxQueueSize)
 *   #4  — Rate Limiting enforcement (token bucket)
 *   #9  — Mutex on initialize() and scaling
 *   #10 — Spawn Retry with exponential backoff
 *   #11 — Pre-Warming (proactive scale-up)
 *   #12 — Hedged Requests (dual execution, use fastest)
 *   #13 — Pool Drain Mode (stop accepting, finish current)
 *   #14 — Adaptive Scaling Thresholds
 *   #15 — Ring Buffer for acquire wait times (O(1) operations)
 *   #17 — Pool Status as JSON (for HTTP endpoint / GUI dashboard)
 *   #18 — Scaling History & Decision Log
 *   #19 — Per-Agent Cost Attribution (aggregated across all instances)
 *
 * Follows the singleton pattern from provider-manager.ts.
 *
 * @module hydra/managers/claude-instance-manager
 * @version 2.2.0
 */

import { EventEmitter } from 'node:events';
import { getLogger } from '../../utils/logger.js';
import {
  applyEnvOverrides,
  type ClaudeInstancesConfig,
  DEFAULT_CLAUDE_INSTANCES_CONFIG,
} from '../core/config-schemas-claude-instances.js';
import {
  ClaudeCodeInstance,
  type ExecuteOptions,
  type InstanceMetrics,
} from './claude-code-instance.js';

const logger = getLogger('claude-instance-manager');

// =============================================================================
// Types
// =============================================================================

/** Pending request in the acquire queue */
interface QueuedAcquire {
  resolve: (instance: ClaudeCodeInstance) => void;
  reject: (error: Error) => void;
  options: AcquireOptions;
  enqueuedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

/** Options for acquiring an instance */
export interface AcquireOptions {
  agent?: string;
  priority?: 'high' | 'normal' | 'low';
  timeout?: number;
  /** If true, eligible for hedged execution (#12) */
  critical?: boolean;
}

/** Pool status snapshot */
export interface PoolStatus {
  enabled: boolean;
  total: number;
  ready: number;
  busy: number;
  crashed: number;
  spawning: number;
  terminated: number;
  queueLength: number;
  maxQueueSize: number;
  strategy: string;
  draining: boolean;
  instances: InstanceMetrics[];
}

/** Pool statistics */
export interface PoolStats {
  totalTasksExecuted: number;
  totalTasksFailed: number;
  totalAcquireTimeouts: number;
  totalAutoScaleUps: number;
  totalAutoScaleDowns: number;
  avgAcquireWaitTime: number;
  peakConcurrent: number;
  totalRateLimitHits: number;
  totalHedgedRequests: number;
  totalZombiesDetected: number;
}

/** #18 — Scaling decision log entry */
export interface ScalingEvent {
  timestamp: number;
  action: 'scale_up' | 'scale_down' | 'auto_scale_up' | 'auto_scale_down' | 'scale_to';
  reason: string;
  fromCount: number;
  toCount: number;
  queueLength: number;
  busyCount: number;
}

// =============================================================================
// #15 — Ring Buffer for O(1) push/pop statistics
// =============================================================================

class RingBuffer<T> {
  private _buffer: (T | undefined)[];
  private _head: number = 0;
  private _size: number = 0;
  private _capacity: number;

  constructor(capacity: number) {
    this._capacity = capacity;
    this._buffer = new Array(capacity);
  }

  push(item: T): void {
    this._buffer[(this._head + this._size) % this._capacity] = item;
    if (this._size < this._capacity) {
      this._size++;
    } else {
      this._head = (this._head + 1) % this._capacity;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this._size; i++) {
      result.push(this._buffer[(this._head + i) % this._capacity] as T);
    }
    return result;
  }

  get length(): number {
    return this._size;
  }

  average(selector: (item: T) => number): number {
    if (this._size === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this._size; i++) {
      sum += selector(this._buffer[(this._head + i) % this._capacity] as T);
    }
    return sum / this._size;
  }

  clear(): void {
    this._head = 0;
    this._size = 0;
  }
}

// =============================================================================
// #4 — Token Bucket Rate Limiter
// =============================================================================

class TokenBucketRateLimiter {
  private _tokens: number;
  private _maxTokens: number;
  private _refillRate: number; // tokens per ms
  private _lastRefill: number;

  constructor(maxTokens: number, intervalMs: number) {
    this._maxTokens = maxTokens;
    this._tokens = maxTokens;
    this._refillRate = maxTokens / intervalMs;
    this._lastRefill = Date.now();
  }

  tryAcquire(): boolean {
    this._refill();
    if (this._tokens >= 1) {
      this._tokens -= 1;
      return true;
    }
    return false;
  }

  /** Time in ms until next token is available */
  getWaitTime(): number {
    this._refill();
    if (this._tokens >= 1) return 0;
    return Math.ceil((1 - this._tokens) / this._refillRate);
  }

  private _refill(): void {
    const now = Date.now();
    const elapsed = now - this._lastRefill;
    this._tokens = Math.min(this._maxTokens, this._tokens + elapsed * this._refillRate);
    this._lastRefill = now;
  }
}

// =============================================================================
// ClaudeInstanceManager
// =============================================================================

export class ClaudeInstanceManager extends EventEmitter {
  private _config: ClaudeInstancesConfig;
  private _instances: Map<string, ClaudeCodeInstance> = new Map();
  private _queue: QueuedAcquire[] = [];
  private _roundRobinIndex: number = 0;
  private _scaleDownTimer: ReturnType<typeof setInterval> | null = null;
  private _autoScaleTimer: ReturnType<typeof setInterval> | null = null;
  private _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _zombieCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _initialized: boolean = false;
  private _shuttingDown: boolean = false;

  // #13 — Drain mode
  private _draining: boolean = false;

  // #9 — Mutex (simple promise-based lock)
  private _initializeLock: Promise<void> | null = null;
  private _scalingLock: boolean = false;

  // #4 — Rate limiter
  private _rateLimiter: TokenBucketRateLimiter | null = null;

  // #15 — Ring buffer for wait times
  private _acquireWaitTimes: RingBuffer<number>;

  // #14 — Adaptive scaling: queue length samples
  private _queueLengthSamples: RingBuffer<number>;

  // #18 — Scaling history
  private _scalingHistory: ScalingEvent[] = [];
  private static readonly MAX_SCALING_HISTORY = 100;

  // SDK utilities to inject into instances
  private _sdkExecutor: {
    executeSdkCall: (prompt: string, modelId: string, options: any, extra?: any) => Promise<any>;
    resolveModel: (model: string) => string;
    diagnoseSDKError: (msg: string, stderr?: string) => any;
  } | null = null;

  // Stats
  private _stats: PoolStats = {
    totalTasksExecuted: 0,
    totalTasksFailed: 0,
    totalAcquireTimeouts: 0,
    totalAutoScaleUps: 0,
    totalAutoScaleDowns: 0,
    avgAcquireWaitTime: 0,
    peakConcurrent: 0,
    totalRateLimitHits: 0,
    totalHedgedRequests: 0,
    totalZombiesDetected: 0,
  };

  constructor(config?: Partial<ClaudeInstancesConfig>) {
    super();
    // #20 — Apply env overrides on top of provided config
    const merged = { ...DEFAULT_CLAUDE_INSTANCES_CONFIG, ...config };
    this._config = applyEnvOverrides(merged);

    // #15 — Ring buffer for wait times
    this._acquireWaitTimes = new RingBuffer<number>(100);

    // #14 — Adaptive scaling samples
    this._queueLengthSamples = new RingBuffer<number>(this._config.adaptiveScaling.windowSize);

    // #4 — Initialize rate limiter if enabled
    if (this._config.rateLimit.enabled) {
      this._rateLimiter = new TokenBucketRateLimiter(
        this._config.rateLimit.requestsPerInterval,
        this._config.rateLimit.interval,
      );
    }
  }

  // ===========================================================================
  // SDK Executor Injection
  // ===========================================================================

  /**
   * Set SDK execution utilities that will be injected into each instance.
   * Must be called before initialize().
   */
  setSdkExecutor(fns: {
    executeSdkCall: (prompt: string, modelId: string, options: any, extra?: any) => Promise<any>;
    resolveModel: (model: string) => string;
    diagnoseSDKError: (msg: string, stderr?: string) => any;
  }): void {
    this._sdkExecutor = fns;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  get isEnabled(): boolean {
    return this._config.enabled;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  get isDraining(): boolean {
    return this._draining;
  }

  /**
   * Initialize the pool: spawn minInstances and start monitoring.
   * #9 — Protected by mutex to prevent double initialization.
   */
  async initialize(): Promise<void> {
    // #9 — Mutex: if already initializing, wait for that to finish
    if (this._initializeLock) {
      await this._initializeLock;
      return;
    }

    if (this._initialized) return;
    if (!this._config.enabled) {
      logger.info('Claude multi-instance mode disabled');
      this._initialized = true;
      return;
    }

    if (!this._sdkExecutor) {
      throw new Error('SDK executor not set — call setSdkExecutor() before initialize()');
    }

    // #9 — Set lock
    let resolveLock!: () => void;
    this._initializeLock = new Promise((r) => {
      resolveLock = r;
    });

    try {
      logger.info(
        `Initializing instance pool: min=${this._config.minInstances}, max=${this._config.maxInstances}, strategy=${this._config.strategy}`,
      );

      // Spawn minimum instances with retry (#10)
      const spawnPromises: Promise<void>[] = [];
      for (let i = 0; i < this._config.minInstances; i++) {
        spawnPromises.push(this._spawnInstanceWithRetry());
      }

      const results = await Promise.allSettled(spawnPromises);
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        logger.warn(
          `${failed.length}/${this._config.minInstances} instances failed to spawn after retries`,
        );
      }

      // Start auto-scale-down timer
      this._scaleDownTimer = setInterval(() => this._checkScaleDown(), 30000);

      // Start auto-scale-up check timer
      this._autoScaleTimer = setInterval(() => this._checkAutoScaleUp(), 5000);

      // #6 — Start health check timer
      if (this._config.healthCheckInterval > 0) {
        this._healthCheckTimer = setInterval(
          () => this._runHealthChecks(),
          this._config.healthCheckInterval,
        );
      }

      // #8 — Zombie check every 30s
      this._zombieCheckTimer = setInterval(() => this._checkZombies(), 30000);

      this._initialized = true;
      const status = this.getStatus();
      logger.info(`Instance pool ready: ${status.ready} ready, ${status.total} total`);
      this.emit('initialized', status);
    } finally {
      this._initializeLock = null;
      resolveLock();
    }
  }

  /**
   * Graceful shutdown: wait for busy instances, then terminate all.
   * #13 — Supports drain mode: stop accepting new tasks before shutdown.
   */
  async shutdown(): Promise<void> {
    if (this._shuttingDown) return;
    this._shuttingDown = true;

    // #13 — Enter drain mode first
    this._draining = true;

    logger.info('Shutting down instance pool...');

    // Clear all timers
    if (this._scaleDownTimer) clearInterval(this._scaleDownTimer);
    if (this._autoScaleTimer) clearInterval(this._autoScaleTimer);
    if (this._healthCheckTimer) clearInterval(this._healthCheckTimer);
    if (this._zombieCheckTimer) clearInterval(this._zombieCheckTimer);

    // Reject all queued requests
    for (const queued of this._queue) {
      clearTimeout(queued.timeoutId);
      queued.reject(new Error('Instance pool shutting down'));
    }
    this._queue = [];

    // Wait for busy instances (max 30s) if drain-on-shutdown enabled
    if (this._config.drainOnShutdown) {
      const busyInstances = [...this._instances.values()].filter((i) => i.isBusy);
      if (busyInstances.length > 0) {
        logger.info(
          `Draining: waiting for ${busyInstances.length} busy instance(s) to complete...`,
        );
        await Promise.race([
          Promise.all(
            busyInstances.map(
              (i) =>
                new Promise<void>((resolve) => {
                  i.once('taskComplete', () => resolve());
                }),
            ),
          ),
          new Promise<void>((resolve) => setTimeout(resolve, 30000)),
        ]);
      }
    }

    // Terminate all instances
    for (const instance of this._instances.values()) {
      instance.terminate('shutdown');
    }
    this._instances.clear();

    this._initialized = false;
    this._shuttingDown = false;
    this._draining = false;
    logger.info('Instance pool shut down');
    this.emit('shutdown');
  }

  // ===========================================================================
  // #13 — Drain Mode
  // ===========================================================================

  /**
   * Enter drain mode: stop accepting new tasks, finish current ones.
   * Pool stays alive but acquireInstance() rejects new requests.
   */
  startDrain(): void {
    this._draining = true;
    logger.info('Pool entering drain mode — no new tasks accepted');
    this.emit('drain:start');
  }

  /**
   * Exit drain mode: resume accepting new tasks.
   */
  stopDrain(): void {
    this._draining = false;
    logger.info('Pool exiting drain mode — accepting tasks again');
    this._processQueue();
    this.emit('drain:stop');
  }

  // ===========================================================================
  // Instance Acquire / Release
  // ===========================================================================

  /**
   * Acquire a free instance from the pool.
   * If no instance is available, queues the request with a timeout.
   * May trigger auto-scale-up.
   *
   * #3  — Queue overflow protection (maxQueueSize)
   * #4  — Rate limiting enforcement
   * #13 — Drain mode rejection
   */
  async acquireInstance(options: AcquireOptions = {}): Promise<ClaudeCodeInstance> {
    if (!this._config.enabled || !this._initialized) {
      throw new Error('Instance pool not enabled or not initialized');
    }

    // #13 — Drain mode
    if (this._draining) {
      throw new Error('Instance pool is draining — not accepting new tasks');
    }

    // #4 — Rate limiting
    if (this._rateLimiter && !this._rateLimiter.tryAcquire()) {
      this._stats.totalRateLimitHits++;
      const waitTime = this._rateLimiter.getWaitTime();
      logger.warn(`Rate limit hit — next token in ${waitTime}ms`);
      // Wait for rate limit instead of rejecting
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      // Re-check after wait
      if (this._rateLimiter && !this._rateLimiter.tryAcquire()) {
        throw new Error(
          `Rate limit exceeded: max ${this._config.rateLimit.requestsPerInterval} requests per ${this._config.rateLimit.interval}ms`,
        );
      }
    }

    const instance = this._selectInstance(options);
    if (instance) {
      return instance;
    }

    // No instance available — try auto-scale-up first
    const aliveCount = this._getAliveCount();
    if (aliveCount < this._config.maxInstances) {
      logger.info(`Auto-scaling up: all ${aliveCount} instances busy, queue=${this._queue.length}`);
      this._stats.totalAutoScaleUps++;
      this._logScalingEvent(
        'auto_scale_up',
        'all instances busy on acquire',
        aliveCount,
        aliveCount + 1,
      );
      try {
        await this._spawnInstanceWithRetry();
        const newInstance = this._selectInstance(options);
        if (newInstance) return newInstance;
      } catch (e) {
        logger.warn(`Auto-scale-up failed: ${(e as Error).message}`);
      }
    }

    // #3 — Queue overflow protection
    if (this._config.maxQueueSize > 0 && this._queue.length >= this._config.maxQueueSize) {
      throw new Error(
        `Queue overflow: ${this._queue.length} pending requests (max: ${this._config.maxQueueSize}). Pool: ${this.getStatus().total} instances, ${this.getStatus().busy} busy.`,
      );
    }

    // Queue the request
    const timeout = options.timeout || this._config.acquireTimeout;
    return new Promise<ClaudeCodeInstance>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue
        const idx = this._queue.findIndex((q) => q.resolve === resolve);
        if (idx !== -1) this._queue.splice(idx, 1);
        this._stats.totalAcquireTimeouts++;
        reject(
          new Error(
            `Acquire timeout: no instance available within ${timeout}ms (pool: ${this.getStatus().total}, busy: ${this.getStatus().busy})`,
          ),
        );
      }, timeout);

      const queued: QueuedAcquire = {
        resolve,
        reject,
        options,
        enqueuedAt: Date.now(),
        timeoutId,
      };

      // Insert by priority
      if (options.priority === 'high') {
        this._queue.unshift(queued);
      } else {
        this._queue.push(queued);
      }
    });
  }

  /**
   * Release an instance back to the pool (mark as READY).
   * Called automatically by the instance after task completion,
   * but exposed for manual release if needed.
   */
  releaseInstance(instanceId: string): void {
    const instance = this._instances.get(instanceId);
    if (!instance) return;

    // Check if there are queued requests waiting
    this._processQueue();
  }

  /**
   * Execute a task on an available instance (acquire + execute + release).
   * This is the primary high-level API for task execution.
   */
  async executeTask(prompt: string, options: ExecuteOptions & AcquireOptions = {}): Promise<any> {
    const instance = await this.acquireInstance({
      agent: options.agent,
      priority: options.priority,
      timeout: options.timeout,
      critical: options.critical,
    });

    try {
      const result = await instance.execute(prompt, options);
      this._stats.totalTasksExecuted++;
      this._processQueue();
      return result;
    } catch (error) {
      this._stats.totalTasksFailed++;
      this._processQueue();
      throw error;
    }
  }

  /**
   * Execute multiple tasks in parallel across available instances.
   */
  async executeParallel(
    tasks: Array<{ prompt: string; options?: ExecuteOptions & AcquireOptions }>,
  ): Promise<any[]> {
    return Promise.all(tasks.map((task) => this.executeTask(task.prompt, task.options || {})));
  }

  // ===========================================================================
  // #12 — Hedged Requests
  // ===========================================================================

  /**
   * Execute a task with hedging: send to 2 instances, use fastest response.
   * Only works when pool has 2+ ready instances and hedging is enabled.
   */
  async executeHedged(prompt: string, options: ExecuteOptions & AcquireOptions = {}): Promise<any> {
    if (!this._config.hedging.enabled) {
      return this.executeTask(prompt, options);
    }

    const readyCount = [...this._instances.values()].filter((i) => i.isAvailable).length;
    if (readyCount < 2) {
      return this.executeTask(prompt, options);
    }

    this._stats.totalHedgedRequests++;
    logger.info('Executing hedged request (2 instances racing)');

    const abortController1 = new AbortController();
    const abortController2 = new AbortController();

    const task1 = this.executeTask(prompt, { ...options, signal: abortController1.signal });
    const task2 = this.executeTask(prompt, { ...options, signal: abortController2.signal });

    try {
      const result = await Promise.race([
        task1.then((r) => {
          abortController2.abort('Hedge lost');
          return r;
        }),
        task2.then((r) => {
          abortController1.abort('Hedge lost');
          return r;
        }),
      ]);
      return result;
    } catch (error) {
      // If both fail, throw first error
      abortController1.abort('Cleanup');
      abortController2.abort('Cleanup');
      throw error;
    }
  }

  // ===========================================================================
  // Scaling
  // ===========================================================================

  /**
   * Scale pool up by spawning additional instances.
   * #9 — Protected by scaling lock.
   * #10 — Uses spawn retry with exponential backoff.
   */
  async scaleUp(count: number = 1): Promise<void> {
    if (this._scalingLock) {
      logger.warn('Scaling operation already in progress');
      return;
    }
    this._scalingLock = true;

    try {
      const aliveCount = this._getAliveCount();
      const toSpawn = Math.min(count, this._config.maxInstances - aliveCount);

      if (toSpawn <= 0) {
        logger.warn(`Cannot scale up: already at max (${this._config.maxInstances})`);
        return;
      }

      this._logScalingEvent(
        'scale_up',
        `manual scale up +${toSpawn}`,
        aliveCount,
        aliveCount + toSpawn,
      );
      logger.info(`Scaling up: spawning ${toSpawn} instance(s)`);

      const promises = Array.from({ length: toSpawn }, () => this._spawnInstanceWithRetry());
      await Promise.allSettled(promises);
      this._processQueue();
      this.emit('scaled', this.getStatus());
    } finally {
      this._scalingLock = false;
    }
  }

  /**
   * Scale pool down by terminating idle instances.
   * #9 — Protected by scaling lock.
   */
  async scaleDown(count: number = 1): Promise<void> {
    if (this._scalingLock) {
      logger.warn('Scaling operation already in progress');
      return;
    }
    this._scalingLock = true;

    try {
      const aliveCount = this._getAliveCount();
      const toRemove = Math.min(count, aliveCount - this._config.minInstances);

      if (toRemove <= 0) {
        logger.warn(`Cannot scale down: already at min (${this._config.minInstances})`);
        return;
      }

      this._logScalingEvent(
        'scale_down',
        `manual scale down -${toRemove}`,
        aliveCount,
        aliveCount - toRemove,
      );

      // Prefer idle instances, sorted by last used (oldest idle first)
      const readyInstances = [...this._instances.values()]
        .filter((i) => i.isAvailable)
        .sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));

      const removed = readyInstances.slice(0, toRemove);
      for (const inst of removed) {
        inst.terminate('scale-down');
        this._instances.delete(inst.instanceId);
      }

      logger.info(`Scaled down: removed ${removed.length} instance(s)`);
      this._stats.totalAutoScaleDowns += removed.length;
      this.emit('scaled', this.getStatus());
    } finally {
      this._scalingLock = false;
    }
  }

  /**
   * Scale to an exact number of instances.
   */
  async scaleTo(target: number): Promise<void> {
    const clamped = Math.max(
      this._config.minInstances,
      Math.min(target, this._config.maxInstances),
    );
    const aliveCount = this._getAliveCount();

    this._logScalingEvent('scale_to', `scale to ${clamped}`, aliveCount, clamped);

    if (clamped > aliveCount) {
      await this.scaleUp(clamped - aliveCount);
    } else if (clamped < aliveCount) {
      await this.scaleDown(aliveCount - clamped);
    }
  }

  // ===========================================================================
  // Status & Stats
  // ===========================================================================

  getStatus(): PoolStatus {
    const instances = [...this._instances.values()];
    return {
      enabled: this._config.enabled,
      total: instances.length,
      ready: instances.filter((i) => i.state === 'ready').length,
      busy: instances.filter((i) => i.state === 'busy').length,
      crashed: instances.filter((i) => i.state === 'crashed').length,
      spawning: instances.filter((i) => i.state === 'spawning').length,
      terminated: instances.filter((i) => i.state === 'terminated').length,
      queueLength: this._queue.length,
      maxQueueSize: this._config.maxQueueSize,
      strategy: this._config.strategy,
      draining: this._draining,
      instances: instances.map((i) => i.getMetrics()),
    };
  }

  getStats(): PoolStats {
    // Update peak concurrent
    const busyCount = [...this._instances.values()].filter((i) => i.isBusy).length;
    if (busyCount > this._stats.peakConcurrent) {
      this._stats.peakConcurrent = busyCount;
    }

    // #15 — Ring buffer average
    this._stats.avgAcquireWaitTime = Math.round(this._acquireWaitTimes.average((t) => t));

    return { ...this._stats };
  }

  getConfig(): ClaudeInstancesConfig {
    return { ...this._config };
  }

  /**
   * #20 — Hot-reload config at runtime.
   * Only safe-to-change fields are updated (scaling thresholds, timeouts, queue size).
   * Pool size changes trigger scale-up/down as needed.
   */
  async updateConfig(newConfig: Partial<ClaudeInstancesConfig>): Promise<void> {
    const old = { ...this._config };
    Object.assign(this._config, newConfig);

    // Re-validate constraints
    if (this._config.maxInstances < this._config.minInstances) {
      this._config.maxInstances = this._config.minInstances;
    }

    // Update rate limiter if config changed
    if (
      this._config.rateLimit.enabled &&
      (old.rateLimit.requestsPerInterval !== this._config.rateLimit.requestsPerInterval ||
        old.rateLimit.interval !== this._config.rateLimit.interval)
    ) {
      this._rateLimiter = new TokenBucketRateLimiter(
        this._config.rateLimit.requestsPerInterval,
        this._config.rateLimit.interval,
      );
    } else if (!this._config.rateLimit.enabled) {
      this._rateLimiter = null;
    }

    // Update adaptive scaling window
    if (old.adaptiveScaling.windowSize !== this._config.adaptiveScaling.windowSize) {
      this._queueLengthSamples = new RingBuffer<number>(this._config.adaptiveScaling.windowSize);
    }

    // Trigger scaling if pool size bounds changed
    if (this._initialized && this._config.enabled) {
      const alive = this._getAliveCount();
      if (alive < this._config.minInstances) {
        await this.scaleUp(this._config.minInstances - alive);
      } else if (alive > this._config.maxInstances) {
        await this.scaleDown(alive - this._config.maxInstances);
      }
    }

    logger.info(
      `Config hot-reloaded: maxInstances=${this._config.maxInstances}, scaleUpThreshold=${this._config.scaleUpThreshold}, maxQueueSize=${this._config.maxQueueSize}`,
    );
    this.emit('config:updated', this._config);
  }

  // ===========================================================================
  // #17 — Full Status JSON (for HTTP endpoint / GUI dashboard)
  // ===========================================================================

  /**
   * Returns a comprehensive JSON snapshot of the entire pool.
   * Suitable for HTTP /api/instances/status endpoint or GUI dashboard.
   */
  getFullStatusJSON(): object {
    const status = this.getStatus();
    const stats = this.getStats();
    const agentCosts = this.getAggregatedAgentCosts();

    return {
      pool: status,
      stats,
      agentCosts,
      scalingHistory: this._scalingHistory.slice(-20), // last 20 events
      config: {
        strategy: this._config.strategy,
        minInstances: this._config.minInstances,
        maxInstances: this._config.maxInstances,
        maxQueueSize: this._config.maxQueueSize,
        healthCheckInterval: this._config.healthCheckInterval,
        hedging: this._config.hedging,
        adaptiveScaling: this._config.adaptiveScaling,
      },
      uptime: this._initialized
        ? Date.now() -
          Math.min(...[...this._instances.values()].map((i) => i.createdAt), Date.now())
        : 0,
    };
  }

  // ===========================================================================
  // #18 — Scaling History
  // ===========================================================================

  getScalingHistory(): ScalingEvent[] {
    return [...this._scalingHistory];
  }

  private _logScalingEvent(
    action: ScalingEvent['action'],
    reason: string,
    fromCount: number,
    toCount: number,
  ): void {
    const event: ScalingEvent = {
      timestamp: Date.now(),
      action,
      reason,
      fromCount,
      toCount,
      queueLength: this._queue.length,
      busyCount: [...this._instances.values()].filter((i) => i.isBusy).length,
    };
    this._scalingHistory.push(event);
    // Keep bounded
    if (this._scalingHistory.length > ClaudeInstanceManager.MAX_SCALING_HISTORY) {
      this._scalingHistory.shift();
    }
    logger.info(
      `[SCALING] ${action}: ${reason} (${fromCount} → ${toCount}, queue=${event.queueLength})`,
    );
    this.emit('scaling:event', event);
  }

  // ===========================================================================
  // #19 — Aggregated Per-Agent Cost Attribution
  // ===========================================================================

  /**
   * Get aggregated per-agent cost data across all instances.
   */
  getAggregatedAgentCosts(): Record<
    string,
    { tasks: number; totalDuration: number; totalCostUSD: number }
  > {
    const aggregated: Record<
      string,
      { tasks: number; totalDuration: number; totalCostUSD: number }
    > = {};

    for (const instance of this._instances.values()) {
      const costs = instance.getAgentCosts();
      for (const [agent, data] of Object.entries(costs)) {
        if (!aggregated[agent]) {
          aggregated[agent] = { tasks: 0, totalDuration: 0, totalCostUSD: 0 };
        }
        aggregated[agent].tasks += data.tasks;
        aggregated[agent].totalDuration += data.totalDuration;
        aggregated[agent].totalCostUSD += data.totalCostUSD;
      }
    }

    return aggregated;
  }

  // ===========================================================================
  // Private: Instance Management
  // ===========================================================================

  /**
   * #10 — Spawn with exponential backoff retry.
   */
  private async _spawnInstanceWithRetry(): Promise<void> {
    const { maxRetries, baseDelay, maxDelay } = this._config.spawnRetry;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this._spawnInstance();
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          logger.error(
            `Spawn failed after ${maxRetries + 1} attempts: ${(error as Error).message}`,
          );
          throw error;
        }

        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
        logger.warn(
          `Spawn attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async _spawnInstance(): Promise<void> {
    const instanceId = `cc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const instance = new ClaudeCodeInstance({
      instanceId,
      maxConsecutiveFailures: this._config.maxConsecutiveFailures,
      spawnTimeout: this._config.spawnTimeout,
      perInstanceTimeout: this._config.perInstanceTimeout,
      zombieTimeout: this._config.zombieTimeout,
    });

    // Inject SDK executor
    if (this._sdkExecutor) {
      instance.setExecutor(this._sdkExecutor);
    }

    // Wire events
    instance.on('stateChange', (oldState: string, newState: string, id: string) => {
      this.emit('instance:stateChange', oldState, newState, id);
      // When an instance becomes READY after being BUSY, process the queue
      if (newState === 'ready' && oldState === 'busy') {
        this._processQueue();
      }
    });

    instance.on('crashed', (id: string, error: Error) => {
      logger.warn(`Instance ${id} crashed: ${error.message}`);
      this.emit('instance:crashed', id, error);
    });

    instance.on('terminated', (id: string, reason: string) => {
      logger.info(`Instance ${id} terminated: ${reason}`);
      this._instances.delete(id);
      this.emit('instance:terminated', id, reason);

      // Replace terminated instance if below min (with retry)
      if (
        !this._shuttingDown &&
        !this._draining &&
        this._getAliveCount() < this._config.minInstances
      ) {
        logger.info(`Below minInstances (${this._config.minInstances}), spawning replacement`);
        this._spawnInstanceWithRetry().catch((e) =>
          logger.error(`Failed to spawn replacement after retries: ${(e as Error).message}`),
        );
      }
    });

    instance.on(
      'taskComplete',
      (id: string, duration: number, success: boolean, correlationId?: string) => {
        this.emit('instance:taskComplete', id, duration, success, correlationId);
      },
    );

    // #8 — Zombie event
    instance.on('zombie', (id: string, taskInfo: any) => {
      this._stats.totalZombiesDetected++;
      logger.error(`Zombie detected on instance ${id} (task: ${taskInfo?.correlationId})`);
      this.emit('instance:zombie', id, taskInfo);
    });

    // #7 — Circuit breaker event
    instance.on('circuitStateChange', (id: string, oldState: string, newState: string) => {
      this.emit('instance:circuitStateChange', id, oldState, newState);
    });

    this._instances.set(instanceId, instance);

    try {
      await instance.spawn();
    } catch (error) {
      this._instances.delete(instanceId);
      throw error;
    }
  }

  // ===========================================================================
  // Private: Load Balancing
  // ===========================================================================

  private _selectInstance(options: AcquireOptions): ClaudeCodeInstance | null {
    // #7 — Filter by circuit breaker state (isAvailable now includes circuit check)
    const ready = [...this._instances.values()].filter((i) => i.isAvailable);
    if (ready.length === 0) return null;

    switch (this._config.strategy) {
      case 'round-robin':
        return this._selectRoundRobin(ready);
      case 'agent-affinity':
        return this._selectAgentAffinity(ready, options.agent);
      default:
        return this._selectLeastLoaded(ready);
    }
  }

  private _selectLeastLoaded(ready: ClaudeCodeInstance[]): ClaudeCodeInstance {
    return ready.sort((a, b) => {
      // Fewest tasks first
      if (a.taskCount !== b.taskCount) return a.taskCount - b.taskCount;
      // Then shortest avg response time
      return a.avgResponseTime - b.avgResponseTime;
    })[0];
  }

  private _selectRoundRobin(ready: ClaudeCodeInstance[]): ClaudeCodeInstance {
    const idx = this._roundRobinIndex % ready.length;
    this._roundRobinIndex++;
    return ready[idx];
  }

  private _selectAgentAffinity(ready: ClaudeCodeInstance[], agent?: string): ClaudeCodeInstance {
    if (!agent) return this._selectLeastLoaded(ready);

    // Simple hash-based affinity: agent name → preferred instance index
    const hash = agent.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const preferredIdx = Math.abs(hash) % ready.length;
    return ready[preferredIdx];
  }

  // ===========================================================================
  // Private: Queue Management
  // ===========================================================================

  private _processQueue(): void {
    while (this._queue.length > 0) {
      const ready = [...this._instances.values()].filter((i) => i.isAvailable);
      if (ready.length === 0) break;

      const queued = this._queue.shift()!;
      clearTimeout(queued.timeoutId);

      const waitTime = Date.now() - queued.enqueuedAt;
      // #15 — Ring buffer push (O(1))
      this._acquireWaitTimes.push(waitTime);

      const instance = this._selectInstance(queued.options);
      if (instance) {
        queued.resolve(instance);
      } else {
        // Shouldn't happen since we checked ready.length, but handle gracefully
        this._queue.unshift(queued);
        break;
      }
    }
  }

  // ===========================================================================
  // Private: Auto-Scaling
  // ===========================================================================

  private _checkAutoScaleUp(): void {
    if (this._shuttingDown || this._draining) return;

    const aliveCount = this._getAliveCount();
    const busyCount = [...this._instances.values()].filter((i) => i.isBusy).length;

    // #14 — Adaptive scaling: sample queue length
    this._queueLengthSamples.push(this._queue.length);

    // Determine effective threshold
    let effectiveThreshold = this._config.scaleUpThreshold;
    if (this._config.adaptiveScaling.enabled) {
      const avgQueueLength = this._queueLengthSamples.average((x) => x);
      // If average queue length exceeds scaled threshold, lower the threshold
      if (avgQueueLength > effectiveThreshold * this._config.adaptiveScaling.scaleFactor) {
        effectiveThreshold = Math.max(1, Math.floor(effectiveThreshold * 0.75));
        logger.debug(
          `Adaptive scaling: effective threshold lowered to ${effectiveThreshold} (avg queue: ${avgQueueLength.toFixed(1)})`,
        );
      }
    }

    // #11 — Pre-Warming: if ANY requests are queued and no instances ready, scale up
    const readyCount = [...this._instances.values()].filter((i) => i.isAvailable).length;
    if (this._queue.length > 0 && readyCount === 0 && aliveCount < this._config.maxInstances) {
      logger.info(`Pre-warming: queue=${this._queue.length}, ready=0, spawning preemptively`);
      this._stats.totalAutoScaleUps++;
      this._logScalingEvent(
        'auto_scale_up',
        'pre-warming: no ready instances',
        aliveCount,
        aliveCount + 1,
      );
      this._spawnInstanceWithRetry()
        .then(() => this._processQueue())
        .catch((e) => logger.error(`Pre-warm spawn failed: ${(e as Error).message}`));
      return;
    }

    // Standard auto-scale: all instances busy AND queue exceeds threshold
    if (
      busyCount >= aliveCount &&
      this._queue.length >= effectiveThreshold &&
      aliveCount < this._config.maxInstances
    ) {
      logger.info(
        `Auto-scale up triggered: busy=${busyCount}/${aliveCount}, queue=${this._queue.length}, threshold=${effectiveThreshold}`,
      );
      this._stats.totalAutoScaleUps++;
      this._logScalingEvent(
        'auto_scale_up',
        `queue(${this._queue.length}) >= threshold(${effectiveThreshold})`,
        aliveCount,
        aliveCount + 1,
      );
      this._spawnInstanceWithRetry()
        .then(() => this._processQueue())
        .catch((e) => logger.error(`Auto-scale-up failed: ${(e as Error).message}`));
    }

    // Track peak concurrent
    if (busyCount > this._stats.peakConcurrent) {
      this._stats.peakConcurrent = busyCount;
    }
  }

  private _checkScaleDown(): void {
    if (this._shuttingDown || this._draining) return;

    const aliveCount = this._getAliveCount();
    if (aliveCount <= this._config.minInstances) return;
    if (this._queue.length > 0) return;

    const now = Date.now();
    const idleThreshold = this._config.scaleDownIdleTime;

    // Find instances idle longer than threshold
    const idleInstances = [...this._instances.values()].filter(
      (i) => i.isAvailable && i.lastUsedAt !== null && now - i.lastUsedAt > idleThreshold,
    );

    // Don't scale below min
    const canRemove = Math.min(idleInstances.length, aliveCount - this._config.minInstances);

    for (let i = 0; i < canRemove; i++) {
      const inst = idleInstances[i];
      logger.info(
        `Auto-scale down: instance ${inst.instanceId} idle for ${Math.round((now - (inst.lastUsedAt || 0)) / 1000)}s`,
      );
      inst.terminate('idle-scale-down');
      this._instances.delete(inst.instanceId);
      this._stats.totalAutoScaleDowns++;
    }

    if (canRemove > 0) {
      this._logScalingEvent(
        'auto_scale_down',
        `${canRemove} idle instances removed`,
        aliveCount,
        aliveCount - canRemove,
      );
      this.emit('scaled', this.getStatus());
    }
  }

  // ===========================================================================
  // #6 — Health Checks
  // ===========================================================================

  private async _runHealthChecks(): Promise<void> {
    const instances = [...this._instances.values()].filter((i) => i.isAlive && !i.isBusy);

    for (const instance of instances) {
      try {
        const latency = await instance.healthCheck();
        logger.trace(`Health check OK: ${instance.instanceId} (${latency}ms)`);
      } catch (error) {
        logger.warn(`Health check FAILED: ${instance.instanceId}: ${(error as Error).message}`);
        // Failed health check → consider restarting
        if (instance.state === 'ready') {
          instance.terminate('health-check-failed');
          this._instances.delete(instance.instanceId);
        }
      }
    }
  }

  // ===========================================================================
  // #8 — Zombie Check (manager-level, supplements per-instance watchdog)
  // ===========================================================================

  private _checkZombies(): void {
    if (this._shuttingDown) return;

    const now = Date.now();
    const zombieTimeout = this._config.zombieTimeout;

    for (const instance of this._instances.values()) {
      if (instance.isBusy) {
        const metrics = instance.getMetrics();
        if (metrics.currentTask && now - metrics.currentTask.startedAt > zombieTimeout) {
          logger.error(
            `Manager-level zombie detection: ${instance.instanceId} busy for ${Math.round((now - metrics.currentTask.startedAt) / 1000)}s`,
          );
          // Instance's own zombie watchdog should have fired, but in case it didn't:
          instance.cancelCurrentTask('manager zombie detection');
        }
      }
    }
  }

  private _getAliveCount(): number {
    return [...this._instances.values()].filter((i) => i.isAlive).length;
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _instance: ClaudeInstanceManager | null = null;

/**
 * Get or create the ClaudeInstanceManager singleton.
 */
export function getClaudeInstanceManager(
  config?: Partial<ClaudeInstancesConfig>,
): ClaudeInstanceManager {
  if (!_instance) {
    _instance = new ClaudeInstanceManager(config);
  }
  return _instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetClaudeInstanceManager(): void {
  if (_instance) {
    _instance.shutdown().catch(() => {});
  }
  _instance = null;
}
