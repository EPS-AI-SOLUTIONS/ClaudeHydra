/**
 * Plan Mode Controller
 *
 * Orchestrates multi-phase execution workflow with Witcher agent integration.
 * Implements the SPECULATE → PLAN → EXECUTE → SYNTHESIZE → LOG → ARCHIVE pipeline.
 *
 * @module src/planning/plan-mode
 */

import { EventEmitter } from 'node:events';
import {
  canPhaseStart,
  getOrderedPhases,
  inferAgentFromDescription,
  PhaseName,
  PhaseStatus,
} from './phases.js';
import { getPlanStorage } from './plan-storage.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Plan Mode states
 * @enum {string}
 */
export const PlanModeState = {
  IDLE: 'idle',
  PLANNING: 'planning',
  EXECUTING: 'executing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// ============================================================================
// Plan Mode Controller
// ============================================================================

/**
 * Plan Mode Controller
 *
 * Manages the execution of multi-phase plans with agent orchestration.
 *
 * @extends EventEmitter
 * @fires PlanModeController#stateChange
 * @fires PlanModeController#phaseStart
 * @fires PlanModeController#phaseComplete
 * @fires PlanModeController#phaseFailed
 * @fires PlanModeController#taskStart
 * @fires PlanModeController#taskComplete
 * @fires PlanModeController#planComplete
 * @fires PlanModeController#error
 */
export class PlanModeController extends EventEmitter {
  /**
   * @param {Object} options - Controller options
   * @param {Object} [options.agentExecutor] - Agent execution function
   * @param {Object} [options.storage] - Plan storage instance
   * @param {boolean} [options.autoArchive=true] - Auto-archive completed plans
   */
  constructor(options = {}) {
    super();

    this.agentExecutor = options.agentExecutor || this.defaultAgentExecutor.bind(this);
    this.storage = options.storage || getPlanStorage();
    this.autoArchive = options.autoArchive !== false;

    /** @type {PlanModeState} */
    this.state = PlanModeState.IDLE;

    /** @type {Object | null} */
    this.currentPlan = null;

    /** @type {string | null} */
    this.currentPhase = null;

    /** @type {AbortController | null} */
    this.abortController = null;

    /** @type {Map<string, any>} */
    this.phaseOutputs = new Map();
  }

  /**
   * Start a new plan
   *
   * @param {string} query - User query/request
   * @param {Object} [options] - Plan options
   * @returns {Promise<Object>} Created plan
   */
  async startPlan(query, options = {}) {
    if (this.state !== PlanModeState.IDLE) {
      throw new Error(`Cannot start plan in state: ${this.state}`);
    }

    this.setState(PlanModeState.PLANNING);
    this.abortController = new AbortController();
    this.phaseOutputs.clear();

    try {
      // Create new plan
      this.currentPlan = await this.storage.create(query, {
        ...options.metadata,
        startedAt: new Date().toISOString(),
      });

      this.emit('planStart', { plan: this.currentPlan });

      // Execute phases sequentially
      await this.executePhases();

      return this.currentPlan;
    } catch (error) {
      this.setState(PlanModeState.FAILED);
      this.emit('error', { error, plan: this.currentPlan });
      throw error;
    }
  }

  /**
   * Execute all phases in sequence
   *
   * @returns {Promise<void>}
   */
  async executePhases() {
    const phases = getOrderedPhases({ includeOptional: true });

    for (const phaseConfig of phases) {
      // Check if cancelled
      if (this.abortController?.signal.aborted) {
        this.setState(PlanModeState.CANCELLED);
        return;
      }

      // Check dependencies
      const phaseStatuses = this.getPhaseStatuses();
      if (!canPhaseStart(phaseConfig.name, phaseStatuses)) {
        continue;
      }

      try {
        await this.executePhase(phaseConfig);
      } catch (error) {
        if (phaseConfig.required) {
          throw error;
        }
        // Optional phase failed - continue
        await this.markPhaseFailed(phaseConfig.name, error);
      }
    }

    // All phases complete
    await this.completePlan();
  }

  /**
   * Execute a single phase
   *
   * @param {Object} phaseConfig - Phase configuration
   * @returns {Promise<any>}
   */
  async executePhase(phaseConfig) {
    this.currentPhase = phaseConfig.name;
    this.setState(PlanModeState.EXECUTING);

    // Mark phase as active
    await this.storage.updatePhase(this.currentPlan.id, phaseConfig.name, {
      status: PhaseStatus.ACTIVE,
      agent: phaseConfig.agent,
      startedAt: new Date().toISOString(),
    });

    this.emit('phaseStart', {
      phase: phaseConfig.name,
      agent: phaseConfig.agent,
      plan: this.currentPlan,
    });

    try {
      let output;

      // Handle special phases
      switch (phaseConfig.name) {
        case PhaseName.EXECUTE:
          output = await this.executeTaskPhase();
          break;

        case PhaseName.ARCHIVE:
          output = await this.executeArchivePhase();
          break;

        default:
          output = await this.executeAgentPhase(phaseConfig);
      }

      // Store output
      this.phaseOutputs.set(phaseConfig.name, output);

      // Mark phase complete
      await this.storage.updatePhase(this.currentPlan.id, phaseConfig.name, {
        status: PhaseStatus.COMPLETED,
        completedAt: new Date().toISOString(),
        output,
      });

      this.emit('phaseComplete', {
        phase: phaseConfig.name,
        output,
        plan: this.currentPlan,
      });

      return output;
    } catch (error) {
      await this.markPhaseFailed(phaseConfig.name, error);
      throw error;
    }
  }

  /**
   * Execute an agent-based phase
   *
   * @param {Object} phaseConfig - Phase configuration
   * @returns {Promise<any>}
   */
  async executeAgentPhase(phaseConfig) {
    const context = this.buildPhaseContext(phaseConfig);

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Phase timeout: ${phaseConfig.name}`)),
        phaseConfig.timeout,
      );
    });

    const executionPromise = this.agentExecutor({
      agent: phaseConfig.agent,
      phase: phaseConfig.name,
      systemPrompt: phaseConfig.systemPrompt,
      query: this.currentPlan.query,
      context,
      signal: this.abortController?.signal,
    });

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Execute the EXECUTE phase (parallel task execution)
   *
   * @returns {Promise<Object>}
   */
  async executeTaskPhase() {
    // Get plan from PLAN phase
    const planOutput = this.phaseOutputs.get(PhaseName.PLAN);

    if (!planOutput?.tasks) {
      throw new Error('No tasks found from PLAN phase');
    }

    const results = {
      completed: [],
      failed: [],
      skipped: [],
    };

    // Execute parallel groups
    const parallelGroups = planOutput.parallelGroups || [planOutput.executionOrder || []];

    for (const group of parallelGroups) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      // Execute tasks in parallel within each group
      const groupResults = await Promise.allSettled(
        group.map((taskId) => this.executeTask(planOutput.tasks.find((t) => t.id === taskId))),
      );

      // Process results
      groupResults.forEach((result, index) => {
        const taskId = group[index];
        if (result.status === 'fulfilled') {
          results.completed.push({ taskId, output: result.value });
        } else {
          results.failed.push({ taskId, error: result.reason.message });
        }
      });
    }

    return results;
  }

  /**
   * Execute a single task
   *
   * @param {Object} task - Task object
   * @returns {Promise<any>}
   */
  async executeTask(task) {
    if (!task) {
      throw new Error('Task not found');
    }

    // Add task to plan
    await this.storage.addTask(this.currentPlan.id, task);

    this.emit('taskStart', { task, plan: this.currentPlan });

    // Update task status
    await this.storage.updateTask(this.currentPlan.id, task.id, {
      status: 'in_progress',
    });

    try {
      // Determine agent for task
      const agent = task.agent || inferAgentFromDescription(task.description);

      // Execute task
      const output = await this.agentExecutor({
        agent,
        task,
        query: task.description,
        context: {
          planId: this.currentPlan.id,
          taskId: task.id,
          previousOutputs: Object.fromEntries(this.phaseOutputs),
        },
        signal: this.abortController?.signal,
      });

      // Update task status
      await this.storage.updateTask(this.currentPlan.id, task.id, {
        status: 'completed',
        output,
      });

      this.emit('taskComplete', { task, output, plan: this.currentPlan });

      return output;
    } catch (error) {
      await this.storage.updateTask(this.currentPlan.id, task.id, {
        status: 'failed',
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute the ARCHIVE phase
   *
   * @returns {Promise<Object>}
   */
  async executeArchivePhase() {
    if (this.autoArchive) {
      const archivePath = await this.storage.archive(this.currentPlan.id);
      return { archived: true, path: archivePath };
    }

    return { archived: false, reason: 'autoArchive disabled' };
  }

  /**
   * Build context for a phase
   *
   * @param {Object} phaseConfig - Phase configuration
   * @returns {Object}
   */
  buildPhaseContext(phaseConfig) {
    const context = {
      planId: this.currentPlan.id,
      query: this.currentPlan.query,
      previousPhases: {},
    };

    // Add outputs from dependency phases
    for (const dep of phaseConfig.dependencies) {
      if (this.phaseOutputs.has(dep)) {
        context.previousPhases[dep] = this.phaseOutputs.get(dep);
      }
    }

    return context;
  }

  /**
   * Mark phase as failed
   *
   * @param {string} phaseName - Phase name
   * @param {Error} error - Error object
   */
  async markPhaseFailed(phaseName, error) {
    await this.storage.updatePhase(this.currentPlan.id, phaseName, {
      status: PhaseStatus.FAILED,
      completedAt: new Date().toISOString(),
      error: error.message,
    });

    this.emit('phaseFailed', {
      phase: phaseName,
      error,
      plan: this.currentPlan,
    });
  }

  /**
   * Complete the plan
   */
  async completePlan() {
    await this.storage.updateStatus(this.currentPlan.id, 'completed');

    // Add final outputs
    await this.storage.addOutput(
      this.currentPlan.id,
      'phaseOutputs',
      Object.fromEntries(this.phaseOutputs),
    );

    this.setState(PlanModeState.COMPLETED);

    this.emit('planComplete', { plan: this.currentPlan });

    // Reset for next plan
    this.currentPlan = null;
    this.currentPhase = null;
    this.abortController = null;
  }

  /**
   * Get current phase statuses
   *
   * @returns {Object<string, PhaseStatus>}
   */
  getPhaseStatuses() {
    if (!this.currentPlan?.phases) {
      return {};
    }

    const statuses = {};
    for (const [name, phase] of Object.entries(this.currentPlan.phases)) {
      statuses[name] = phase.status;
    }
    return statuses;
  }

  /**
   * Set controller state
   *
   * @param {PlanModeState} newState - New state
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;

    this.emit('stateChange', { oldState, newState });
  }

  /**
   * Cancel current plan
   *
   * @returns {Promise<void>}
   */
  async cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }

    if (this.currentPlan) {
      await this.storage.updateStatus(this.currentPlan.id, 'cancelled');
    }

    this.setState(PlanModeState.CANCELLED);
  }

  /**
   * Pause current plan
   */
  pause() {
    if (this.state === PlanModeState.EXECUTING) {
      this.setState(PlanModeState.PAUSED);
    }
  }

  /**
   * Resume paused plan
   */
  async resume() {
    if (this.state === PlanModeState.PAUSED) {
      this.setState(PlanModeState.EXECUTING);
      // Continue from current phase
      await this.executePhases();
    }
  }

  /**
   * Default agent executor (placeholder)
   *
   * @param {Object} params - Execution parameters
   * @returns {Promise<any>}
   */
  async defaultAgentExecutor(params) {
    // This should be replaced with actual agent integration
    console.log(`[PlanMode] Executing with agent: ${params.agent}`);
    console.log(`[PlanMode] Phase: ${params.phase || 'task'}`);
    console.log(`[PlanMode] Query: ${params.query}`);

    // Return placeholder result
    return {
      agent: params.agent,
      phase: params.phase,
      timestamp: new Date().toISOString(),
      result: 'Placeholder - implement actual agent executor',
    };
  }

  /**
   * Get current status
   *
   * @returns {Object}
   */
  getStatus() {
    return {
      state: this.state,
      planId: this.currentPlan?.id,
      currentPhase: this.currentPhase,
      phaseOutputs: Object.fromEntries(this.phaseOutputs),
      plan: this.currentPlan,
    };
  }

  /**
   * Reset controller
   */
  reset() {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.state = PlanModeState.IDLE;
    this.currentPlan = null;
    this.currentPhase = null;
    this.abortController = null;
    this.phaseOutputs.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create Plan Mode controller instance
 *
 * @param {Object} [options] - Controller options
 * @returns {PlanModeController}
 */
export function getPlanModeController(options = {}) {
  if (!_instance) {
    _instance = new PlanModeController(options);
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetPlanModeController() {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Start a new plan with default controller
 *
 * @param {string} query - User query
 * @param {Object} [options] - Plan options
 * @returns {Promise<Object>}
 */
export async function startPlan(query, options = {}) {
  const controller = getPlanModeController(options);
  return controller.startPlan(query, options);
}

/**
 * Get current plan status
 *
 * @returns {Object}
 */
export function getPlanStatus() {
  const controller = getPlanModeController();
  return controller.getStatus();
}

/**
 * Cancel current plan
 *
 * @returns {Promise<void>}
 */
export async function cancelPlan() {
  const controller = getPlanModeController();
  return controller.cancel();
}

export default PlanModeController;
