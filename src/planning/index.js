/**
 * Planning Module
 *
 * Multi-phase plan execution system with Witcher agent integration.
 *
 * @module src/planning
 */

// Phase definitions and utilities
export {
  PhaseName,
  PhaseStatus,
  PHASE_CONFIGS,
  TASK_AGENT_MAPPING,
  getAgentForTaskType,
  inferAgentFromDescription,
  getOrderedPhases,
  canPhaseStart,
  getPhaseConfig,
  createInitialPhaseStatuses
} from './phases.js';

// Plan storage
export {
  PlanStorage,
  getPlanStorage,
  resetPlanStorage
} from './plan-storage.js';

// Plan mode controller
export {
  PlanModeController,
  PlanModeState,
  getPlanModeController,
  resetPlanModeController,
  startPlan,
  getPlanStatus,
  cancelPlan
} from './plan-mode.js';

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize planning system
 *
 * @param {Object} [options] - Options
 * @param {Object} [options.agentExecutor] - Agent executor function
 * @param {string} [options.storageDir] - Storage directory
 * @returns {Object} Planning system instances
 */
export function initPlanning(options = {}) {
  const { getPlanStorage } = require('./plan-storage.js');
  const { getPlanModeController } = require('./plan-mode.js');

  const storage = getPlanStorage({ storageDir: options.storageDir });
  const controller = getPlanModeController({
    storage,
    agentExecutor: options.agentExecutor
  });

  return { storage, controller };
}

/**
 * Shutdown planning system
 */
export async function shutdownPlanning() {
  const { resetPlanStorage } = await import('./plan-storage.js');
  const { resetPlanModeController } = await import('./plan-mode.js');

  resetPlanModeController();
  resetPlanStorage();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Phase definitions
  PhaseName,
  PhaseStatus,
  PHASE_CONFIGS,
  TASK_AGENT_MAPPING,

  // Utilities
  getAgentForTaskType,
  inferAgentFromDescription,
  getOrderedPhases,
  canPhaseStart,
  getPhaseConfig,
  createInitialPhaseStatuses,

  // Storage
  PlanStorage,
  getPlanStorage,
  resetPlanStorage,

  // Controller
  PlanModeController,
  PlanModeState,
  getPlanModeController,
  resetPlanModeController,
  startPlan,
  getPlanStatus,
  cancelPlan,

  // System
  initPlanning,
  shutdownPlanning
};
