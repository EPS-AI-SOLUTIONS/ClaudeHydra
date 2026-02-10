/**
 * Planning Module
 *
 * Multi-phase plan execution system with Witcher agent integration.
 *
 * @module src/planning
 */

// Phase definitions and utilities
import {
  canPhaseStart as _canPhaseStart,
  createInitialPhaseStatuses as _createInitialPhaseStatuses,
  getAgentForTaskType as _getAgentForTaskType,
  getOrderedPhases as _getOrderedPhases,
  getPhaseConfig as _getPhaseConfig,
  inferAgentFromDescription as _inferAgentFromDescription,
  PHASE_CONFIGS as _PHASE_CONFIGS,
  PhaseName as _PhaseName,
  PhaseStatus as _PhaseStatus,
  TASK_AGENT_MAPPING as _TASK_AGENT_MAPPING,
} from './phases.js';

export {
  _PhaseName as PhaseName,
  _PhaseStatus as PhaseStatus,
  _PHASE_CONFIGS as PHASE_CONFIGS,
  _TASK_AGENT_MAPPING as TASK_AGENT_MAPPING,
  _getAgentForTaskType as getAgentForTaskType,
  _inferAgentFromDescription as inferAgentFromDescription,
  _getOrderedPhases as getOrderedPhases,
  _canPhaseStart as canPhaseStart,
  _getPhaseConfig as getPhaseConfig,
  _createInitialPhaseStatuses as createInitialPhaseStatuses,
};

// Plan storage
import {
  getPlanStorage as _getPlanStorage,
  PlanStorage as _PlanStorage,
  resetPlanStorage as _resetPlanStorage,
} from './plan-storage.js';

export {
  _PlanStorage as PlanStorage,
  _getPlanStorage as getPlanStorage,
  _resetPlanStorage as resetPlanStorage,
};

// Plan mode controller
import {
  cancelPlan as _cancelPlan,
  getPlanModeController as _getPlanModeController,
  getPlanStatus as _getPlanStatus,
  PlanModeController as _PlanModeController,
  PlanModeState as _PlanModeState,
  resetPlanModeController as _resetPlanModeController,
  startPlan as _startPlan,
} from './plan-mode.js';

export {
  _PlanModeController as PlanModeController,
  _PlanModeState as PlanModeState,
  _getPlanModeController as getPlanModeController,
  _resetPlanModeController as resetPlanModeController,
  _startPlan as startPlan,
  _getPlanStatus as getPlanStatus,
  _cancelPlan as cancelPlan,
};

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
  const storage = _getPlanStorage({ storageDir: options.storageDir });
  const controller = _getPlanModeController({
    storage,
    agentExecutor: options.agentExecutor,
  });

  return { storage, controller };
}

/**
 * Shutdown planning system
 */
export async function shutdownPlanning() {
  _resetPlanModeController();
  _resetPlanStorage();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Phase definitions
  PhaseName: _PhaseName,
  PhaseStatus: _PhaseStatus,
  PHASE_CONFIGS: _PHASE_CONFIGS,
  TASK_AGENT_MAPPING: _TASK_AGENT_MAPPING,

  // Utilities
  getAgentForTaskType: _getAgentForTaskType,
  inferAgentFromDescription: _inferAgentFromDescription,
  getOrderedPhases: _getOrderedPhases,
  canPhaseStart: _canPhaseStart,
  getPhaseConfig: _getPhaseConfig,
  createInitialPhaseStatuses: _createInitialPhaseStatuses,

  // Storage
  PlanStorage: _PlanStorage,
  getPlanStorage: _getPlanStorage,
  resetPlanStorage: _resetPlanStorage,

  // Controller
  PlanModeController: _PlanModeController,
  PlanModeState: _PlanModeState,
  getPlanModeController: _getPlanModeController,
  resetPlanModeController: _resetPlanModeController,
  startPlan: _startPlan,
  getPlanStatus: _getPlanStatus,
  cancelPlan: _cancelPlan,

  // System
  initPlanning,
  shutdownPlanning,
};
