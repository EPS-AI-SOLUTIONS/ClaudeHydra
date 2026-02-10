/**
 * @fileoverview ClaudeCodeInstance — Single Claude Code subprocess with state machine
 *
 * Represents one managed Claude Code CLI instance in the pool.
 * Each instance tracks its lifecycle state, task count, failures,
 * and delegates execution to the shared SDK call utilities from claude-client.ts.
 *
 * State Machine:
 *   COLD → SPAWNING → READY → BUSY → READY (or CRASHED → TERMINATED)
 *
 * Improvements v2.2:
 *   #1  — Task Cancellation via AbortController
 *   #2  — Timeout Enforcement via Promise.race()
 *   #6  — Health Check ping (lightweight probe)
 *   #7  — Circuit Breaker pattern (CLOSED → OPEN → HALF_OPEN)
 *   #8  — Zombie Detection (watchdog for stuck BUSY state)
 *   #16 — Structured Logging with correlationId
 *   #19 — Per-Agent Cost Attribution (token/cost tracking per agent)
 *
 * @module hydra/managers/claude-code-instance
 * @version 2.2.0
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('claude-code-instance');

// =============================================================================
// Types
// =============================================================================

/** Instance lifecycle states */
export type InstanceState = 'cold' | 'spawning' | 'ready' | 'busy' | 'crashed' | 'terminated';

/** Circuit breaker states (#7) */
export type CircuitState = 'closed' | 'open' | 'half_open';

/** Options for creating a new instance */
export interface ClaudeCodeInstanceOptions {
  instanceId: string;
  model?: string;
  maxConsecutiveFailures?: number;
  spawnTimeout?: number;
  perInstanceTimeout?: number;
  /** Zombie detection timeout — busy longer than this triggers force-restart (#8) */
  zombieTimeout?: number;
  /** Circuit breaker cooldown (ms) before trying half-open (#7) */
  circuitBreakerCooldown?: number;
}

/** Task info tracked while instance is BUSY */
export interface TaskInfo {
  prompt: string;
  agent?: string;
  startedAt: number;
  /** Unique correlation ID for structured logging (#16) */
  correlationId: string;
  /** AbortController for cancellation (#1) */
  abortController: AbortController;
}

/** Metrics snapshot for an instance */
export interface InstanceMetrics {
  instanceId: string;
  state: InstanceState;
  circuitState: CircuitState;
  createdAt: number;
  lastUsedAt: number | null;
  taskCount: number;
  totalDuration: number;
  consecutiveFailures: number;
  currentTask: { prompt: string; agent?: string; startedAt: number; correlationId: string } | null;
  avgResponseTime: number;
  /** Per-agent cost tracking (#19) */
  agentCosts: Record<string, { tasks: number; totalDuration: number; totalCostUSD: number }>;
  lastHealthCheck: number | null;
}

/** Options passed to execute() */
export interface ExecuteOptions {
  model?: string;
  system?: string;
  maxTurns?: number;
  timeout?: number;
  agent?: string;
  /** If true, this is a critical task eligible for hedging (#12) */
  critical?: boolean;
  /** External AbortSignal for cancellation (#1) */
  signal?: AbortSignal;
  onSdkMessage?: (message: any) => void;
  [key: string]: any;
}

// =============================================================================
// ClaudeCodeInstance
// =============================================================================

/**
 * A single managed Claude Code instance.
 *
 * Each call to execute() spawns a fresh Claude Code subprocess via the SDK
 * (since the SDK's `query()` doesn't support persistent processes).
 * The instance's value is in concurrency control, state tracking, crash isolation,
 * circuit breaking, and metrics collection — not in process reuse.
 *
 * Events:
 *   'stateChange' (oldState, newState, instanceId)
 *   'taskStart' (instanceId, taskInfo)
 *   'taskComplete' (instanceId, duration, success, correlationId)
 *   'crashed' (instanceId, error)
 *   'terminated' (instanceId, reason)
 *   'circuitStateChange' (instanceId, oldState, newState)
 *   'zombie' (instanceId, taskInfo)
 *   'healthCheck' (instanceId, healthy, latencyMs)
 */
export class ClaudeCodeInstance extends EventEmitter {
  readonly instanceId: string;
  private _state: InstanceState = 'cold';
  private _model: string;
  private _maxConsecutiveFailures: number;
  private _perInstanceTimeout: number;

  // Lifecycle tracking
  readonly createdAt: number = Date.now();
  private _lastUsedAt: number | null = null;
  private _taskCount: number = 0;
  private _totalDuration: number = 0;
  private _consecutiveFailures: number = 0;
  private _currentTask: TaskInfo | null = null;

  // #7 — Circuit Breaker
  private _circuitState: CircuitState = 'closed';
  private _circuitBreakerCooldown: number;
  private _circuitBreakerTimer: ReturnType<typeof setTimeout> | null = null;

  // #8 — Zombie Detection
  private _zombieTimeout: number;
  private _zombieTimer: ReturnType<typeof setTimeout> | null = null;

  // #6 — Health Check
  private _lastHealthCheck: number | null = null;

  // #19 — Per-Agent Cost Attribution
  private _agentCosts: Map<string, { tasks: number; totalDuration: number; totalCostUSD: number }> =
    new Map();

  // SDK utilities (injected via setExecutor)
  private _executeSdkCall:
    | ((prompt: string, modelId: string, options: any, extra?: any) => Promise<any>)
    | null = null;
  private _resolveModel: ((model: string) => string) | null = null;
  private _diagnoseSDKError: ((msg: string, stderr?: string) => any) | null = null;

  constructor(options: ClaudeCodeInstanceOptions) {
    super();
    this.instanceId = options.instanceId;
    this._model = options.model || 'claude-sonnet';
    this._maxConsecutiveFailures = options.maxConsecutiveFailures ?? 3;
    this._spawnTimeout = options.spawnTimeout ?? 30000;
    this._perInstanceTimeout = options.perInstanceTimeout ?? 300000;
    this._zombieTimeout = options.zombieTimeout ?? 600000;
    this._circuitBreakerCooldown = options.circuitBreakerCooldown ?? 30000;
  }

  // ===========================================================================
  // SDK utility injection (called by ClaudeInstanceManager after import)
  // ===========================================================================

  /**
   * Inject SDK execution utilities from claude-client.ts.
   * This avoids circular dependency — the manager imports both modules
   * and wires them together.
   */
  setExecutor(fns: {
    executeSdkCall: (prompt: string, modelId: string, options: any, extra?: any) => Promise<any>;
    resolveModel: (model: string) => string;
    diagnoseSDKError: (msg: string, stderr?: string) => any;
  }) {
    this._executeSdkCall = fns.executeSdkCall;
    this._resolveModel = fns.resolveModel;
    this._diagnoseSDKError = fns.diagnoseSDKError;
  }

  // ===========================================================================
  // State Machine
  // ===========================================================================

  get state(): InstanceState {
    return this._state;
  }

  get isAvailable(): boolean {
    return this._state === 'ready' && this._circuitState !== 'open';
  }

  get isBusy(): boolean {
    return this._state === 'busy';
  }

  get isAlive(): boolean {
    return this._state === 'ready' || this._state === 'busy' || this._state === 'spawning';
  }

  /** #7 — Circuit breaker state */
  get circuitState(): CircuitState {
    return this._circuitState;
  }

  private _setState(newState: InstanceState): void {
    const oldState = this._state;
    if (oldState === newState) return;

    // Validate state transitions
    const validTransitions: Record<InstanceState, InstanceState[]> = {
      cold: ['spawning'],
      spawning: ['ready', 'crashed'],
      ready: ['busy', 'crashed', 'terminated'],
      busy: ['ready', 'crashed'],
      crashed: ['spawning', 'terminated'],
      terminated: [], // terminal state
    };

    if (!validTransitions[oldState].includes(newState)) {
      logger.warn(`Invalid state transition: ${oldState} → ${newState} [${this.instanceId}]`);
      return;
    }

    this._state = newState;
    logger.debug(`Instance ${this.instanceId}: ${oldState} → ${newState}`);
    this.emit('stateChange', oldState, newState, this.instanceId);
  }

  // ===========================================================================
  // #7 — Circuit Breaker
  // ===========================================================================

  private _setCircuitState(newState: CircuitState): void {
    const oldState = this._circuitState;
    if (oldState === newState) return;

    this._circuitState = newState;
    logger.info(`Instance ${this.instanceId} circuit: ${oldState} → ${newState}`);
    this.emit('circuitStateChange', this.instanceId, oldState, newState);

    if (newState === 'open') {
      this._circuitOpenedAt = Date.now();
      // Schedule transition to half-open after cooldown
      this._circuitBreakerTimer = setTimeout(() => {
        if (this._circuitState === 'open' && this.isAlive) {
          this._setCircuitState('half_open');
        }
      }, this._circuitBreakerCooldown);
    }
  }

  /** Record a circuit success — close the breaker if half-open */
  private _circuitSuccess(): void {
    this._consecutiveFailures = 0;
    if (this._circuitState === 'half_open') {
      this._setCircuitState('closed');
    }
  }

  /** Record a circuit failure — open the breaker if threshold exceeded */
  private _circuitFailure(): void {
    this._consecutiveFailures++;
    if (this._consecutiveFailures >= this._maxConsecutiveFailures) {
      this._setCircuitState('open');
    }
  }

  // ===========================================================================
  // #8 — Zombie Detection
  // ===========================================================================

  private _startZombieWatchdog(): void {
    this._clearZombieWatchdog();
    this._zombieTimer = setTimeout(() => {
      if (this._state === 'busy' && this._currentTask) {
        logger.error(
          `ZOMBIE detected: instance ${this.instanceId} busy for ${this._zombieTimeout}ms (task: ${this._currentTask.correlationId})`,
        );
        this.emit('zombie', this.instanceId, this._currentTask);

        // Cancel via AbortController
        if (this._currentTask.abortController) {
          this._currentTask.abortController.abort(new Error('Zombie timeout'));
        }

        // Force crash state → will be recovered by manager
        this._currentTask = null;
        this._setState('crashed');
        this.emit('crashed', this.instanceId, new Error('Zombie timeout'));
      }
    }, this._zombieTimeout);
  }

  private _clearZombieWatchdog(): void {
    if (this._zombieTimer) {
      clearTimeout(this._zombieTimer);
      this._zombieTimer = null;
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Mark instance as ready (warm-up complete).
   * Since the SDK spawns a fresh process per query, "spawning" is really
   * just validating that we can spawn and marking ourselves available.
   */
  async spawn(): Promise<void> {
    if (this._state !== 'cold' && this._state !== 'crashed') {
      throw new Error(`Cannot spawn from state: ${this._state}`);
    }

    this._setState('spawning');

    try {
      // Validate that SDK executor is wired
      if (!this._executeSdkCall || !this._resolveModel) {
        throw new Error('SDK executor not set — call setExecutor() before spawn()');
      }

      // Mark ready immediately — the SDK spawns per-query, no persistent process
      this._setState('ready');
      // Reset circuit on fresh spawn
      this._circuitState = 'closed';
      this._consecutiveFailures = 0;
      logger.info(`Instance ${this.instanceId} ready`);
    } catch (error) {
      this._circuitFailure();
      this._setState('crashed');
      this.emit('crashed', this.instanceId, error);

      if (this._circuitState === 'open') {
        this._setState('terminated');
        this.emit('terminated', this.instanceId, 'circuit breaker opened');
      }
      throw error;
    }
  }

  /**
   * Execute a prompt on this instance.
   * Transitions: READY → BUSY → READY (or CRASHED)
   *
   * #1  — Supports AbortSignal via options.signal
   * #2  — Enforces timeout via Promise.race()
   * #7  — Respects circuit breaker state
   * #8  — Starts zombie watchdog during execution
   * #16 — Generates correlationId for structured tracing
   * #19 — Tracks per-agent cost
   */
  async execute(prompt: string, options: ExecuteOptions = {}): Promise<any> {
    if (this._state !== 'ready') {
      throw new Error(`Instance ${this.instanceId} not ready (state: ${this._state})`);
    }

    // #7 — Circuit breaker check
    if (this._circuitState === 'open') {
      throw new Error(`Instance ${this.instanceId} circuit breaker is OPEN — refusing task`);
    }

    if (!this._executeSdkCall || !this._resolveModel) {
      throw new Error('SDK executor not set');
    }

    const model = options.model || this._model;
    const modelId = this._resolveModel(model);
    const timeout = options.timeout || this._perInstanceTimeout;

    // #1 — AbortController (merges external signal if provided)
    const abortController = new AbortController();
    if (options.signal) {
      // Propagate external abort
      if (options.signal.aborted) {
        throw new Error('Task cancelled before start');
      }
      options.signal.addEventListener(
        'abort',
        () => {
          abortController.abort(options.signal?.reason || 'External cancellation');
        },
        { once: true },
      );
    }

    // #16 — Structured logging: generate correlationId
    const correlationId = randomUUID().slice(0, 12);

    const taskInfo: TaskInfo = {
      prompt: prompt.substring(0, 200),
      agent: options.agent,
      startedAt: Date.now(),
      correlationId,
      abortController,
    };

    this._currentTask = taskInfo;
    this._setState('busy');
    this._lastUsedAt = Date.now();
    this.emit('taskStart', this.instanceId, {
      prompt: taskInfo.prompt,
      agent: taskInfo.agent,
      startedAt: taskInfo.startedAt,
      correlationId: taskInfo.correlationId,
    });

    // #8 — Start zombie watchdog
    this._startZombieWatchdog();

    logger.debug(
      `[${correlationId}] Task started on ${this.instanceId} (agent: ${options.agent || 'none'}, timeout: ${timeout}ms)`,
    );

    try {
      // #2 — Timeout Enforcement via Promise.race
      const sdkPromise = this._executeSdkCall(prompt, modelId, {
        ...options,
        timeout,
        abortSignal: abortController.signal,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const tid = setTimeout(() => {
          abortController.abort(new Error(`Task timeout (${timeout}ms)`));
          reject(
            new Error(
              `Task timeout: ${timeout}ms exceeded on instance ${this.instanceId} [${correlationId}]`,
            ),
          );
        }, timeout);

        // Clear timeout if SDK completes first
        sdkPromise.then(
          () => clearTimeout(tid),
          () => clearTimeout(tid),
        );
      });

      // #1 — AbortSignal race
      const abortPromise = new Promise<never>((_, reject) => {
        if (abortController.signal.aborted) {
          reject(new Error('Task cancelled'));
          return;
        }
        abortController.signal.addEventListener(
          'abort',
          () => {
            reject(
              new Error(
                abortController.signal.reason?.message ||
                  abortController.signal.reason ||
                  'Task cancelled',
              ),
            );
          },
          { once: true },
        );
      });

      const result = await Promise.race([sdkPromise, timeoutPromise, abortPromise]);

      const duration = Date.now() - taskInfo.startedAt;
      this._taskCount++;
      this._totalDuration += duration;
      this._currentTask = null;

      // #8 — Clear zombie watchdog
      this._clearZombieWatchdog();

      // #7 — Circuit success
      this._circuitSuccess();

      this._setState('ready');
      this.emit('taskComplete', this.instanceId, duration, true, correlationId);

      // Handle SDK result with error
      if (result.error) {
        const diagnosis = this._diagnoseSDKError?.(
          result.error?.message || 'Unknown error',
          result.stderrOutput,
        );

        // #19 — Track agent cost even on controlled errors
        this._trackAgentCost(options.agent, duration, 0);

        logger.debug(
          `[${correlationId}] Task completed with error: ${result.error?.message} (${duration}ms)`,
        );
        return {
          success: false,
          error: result.error?.message || 'SDK error',
          errorType: diagnosis?.errorType || 'unknown',
          suggestions: diagnosis?.suggestions || [],
          stderrOutput: result.stderrOutput,
          model: modelId,
          duration_ms: duration,
          instanceId: this.instanceId,
          correlationId,
        };
      }

      // Handle result message
      const resultMessage = result.resultMessage;
      if (!resultMessage) {
        this._trackAgentCost(options.agent, duration, 0);
        return {
          success: false,
          error: 'No result message from SDK',
          model: modelId,
          duration_ms: duration,
          instanceId: this.instanceId,
          correlationId,
        };
      }

      if (resultMessage.type === 'result' && (resultMessage as any).subtype === 'error_max_turns') {
        this._trackAgentCost(options.agent, duration, 0);
        return {
          success: false,
          error: 'Max turns exhausted',
          errorType: 'max_turns',
          model: modelId,
          duration_ms: duration,
          instanceId: this.instanceId,
          correlationId,
        };
      }

      // Success
      const text = (resultMessage as any).result || '';
      const costUSD = (resultMessage as any).cost_usd ?? (resultMessage as any).costUSD ?? 0;

      // #19 — Track agent cost on success
      this._trackAgentCost(options.agent, duration, costUSD);

      logger.debug(
        `[${correlationId}] Task completed successfully (${duration}ms, cost: $${costUSD})`,
      );
      return {
        success: true,
        content: text,
        model: modelId,
        duration_ms: duration,
        costUSD,
        claudeCodeVersion: result.claudeCodeVersion,
        instanceId: this.instanceId,
        correlationId,
      };
    } catch (error: any) {
      const duration = Date.now() - taskInfo.startedAt;
      this._currentTask = null;

      // #8 — Clear zombie watchdog
      this._clearZombieWatchdog();

      // #7 — Circuit failure
      this._circuitFailure();

      // #19 — Track agent cost on failure
      this._trackAgentCost(options.agent, duration, 0);

      logger.error(
        `[${correlationId}] Instance ${this.instanceId} task failed after ${duration}ms: ${error.message}`,
      );
      this.emit('taskComplete', this.instanceId, duration, false, correlationId);

      if (this._circuitState === 'open') {
        this._setState('crashed');
        this.emit('crashed', this.instanceId, error);
        this._setState('terminated');
        this.emit('terminated', this.instanceId, 'circuit breaker opened after task error');
      } else {
        this._setState('crashed');
        this.emit('crashed', this.instanceId, error);
      }

      throw error;
    }
  }

  // ===========================================================================
  // #1 — Task Cancellation
  // ===========================================================================

  /**
   * Cancel the currently running task (if any).
   * Aborts the AbortController which races in execute().
   */
  cancelCurrentTask(reason: string = 'manual cancellation'): boolean {
    if (!this._currentTask) return false;
    logger.info(
      `[${this._currentTask.correlationId}] Cancelling task on ${this.instanceId}: ${reason}`,
    );
    this._currentTask.abortController.abort(new Error(reason));
    return true;
  }

  // ===========================================================================
  // #6 — Health Check
  // ===========================================================================

  /**
   * Lightweight health probe. Returns latency in ms or throws on failure.
   * Does NOT use the SDK — just verifies the instance is responsive and in valid state.
   */
  async healthCheck(): Promise<number> {
    const start = Date.now();

    if (this._state === 'terminated' || this._state === 'crashed') {
      throw new Error(`Instance ${this.instanceId} unhealthy: state=${this._state}`);
    }

    if (this._circuitState === 'open') {
      throw new Error(`Instance ${this.instanceId} unhealthy: circuit=open`);
    }

    // Verify SDK is wired
    if (!this._executeSdkCall || !this._resolveModel) {
      throw new Error(`Instance ${this.instanceId} unhealthy: SDK not wired`);
    }

    const latency = Date.now() - start;
    this._lastHealthCheck = Date.now();
    this.emit('healthCheck', this.instanceId, true, latency);
    return latency;
  }

  // ===========================================================================
  // #19 — Per-Agent Cost Attribution
  // ===========================================================================

  private _trackAgentCost(agent: string | undefined, durationMs: number, costUSD: number): void {
    const key = agent || '__unassigned__';
    const existing = this._agentCosts.get(key) || { tasks: 0, totalDuration: 0, totalCostUSD: 0 };
    existing.tasks++;
    existing.totalDuration += durationMs;
    existing.totalCostUSD += costUSD;
    this._agentCosts.set(key, existing);
  }

  /** Get per-agent cost breakdown for this instance */
  getAgentCosts(): Record<string, { tasks: number; totalDuration: number; totalCostUSD: number }> {
    return Object.fromEntries(this._agentCosts);
  }

  // ===========================================================================
  // Lifecycle — Terminate
  // ===========================================================================

  /**
   * Gracefully terminate this instance.
   */
  terminate(reason: string = 'manual'): void {
    if (this._state === 'terminated') return;

    logger.info(`Terminating instance ${this.instanceId}: ${reason}`);

    // Cancel current task if any
    if (this._currentTask) {
      this._currentTask.abortController.abort(new Error(`Instance terminating: ${reason}`));
    }

    this._currentTask = null;
    this._clearZombieWatchdog();
    if (this._circuitBreakerTimer) {
      clearTimeout(this._circuitBreakerTimer);
      this._circuitBreakerTimer = null;
    }
    this._setState('terminated');
    this.emit('terminated', this.instanceId, reason);
    this.removeAllListeners();
  }

  // ===========================================================================
  // Metrics
  // ===========================================================================

  getMetrics(): InstanceMetrics {
    return {
      instanceId: this.instanceId,
      state: this._state,
      circuitState: this._circuitState,
      createdAt: this.createdAt,
      lastUsedAt: this._lastUsedAt,
      taskCount: this._taskCount,
      totalDuration: this._totalDuration,
      consecutiveFailures: this._consecutiveFailures,
      currentTask: this._currentTask
        ? {
            prompt: this._currentTask.prompt,
            agent: this._currentTask.agent,
            startedAt: this._currentTask.startedAt,
            correlationId: this._currentTask.correlationId,
          }
        : null,
      avgResponseTime: this._taskCount > 0 ? Math.round(this._totalDuration / this._taskCount) : 0,
      agentCosts: this.getAgentCosts(),
      lastHealthCheck: this._lastHealthCheck,
    };
  }

  get lastUsedAt(): number | null {
    return this._lastUsedAt;
  }

  get taskCount(): number {
    return this._taskCount;
  }

  get avgResponseTime(): number {
    return this._taskCount > 0 ? Math.round(this._totalDuration / this._taskCount) : 0;
  }

  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }
}
