/**
 * Hooks Module
 *
 * Lifecycle hooks system for session, tool, and plan events.
 *
 * @module src/hooks
 */

// Built-in hooks
import {
  attemptRecovery as _attemptRecovery,
  BUILTIN_HOOKS as _BUILTIN_HOOKS,
  checkMCPHealth as _checkMCPHealth,
  cleanupSession as _cleanupSession,
  getBuiltinHook as _getBuiltinHook,
  loadProjectContext as _loadProjectContext,
  logPlanPhase as _logPlanPhase,
  logToolExecution as _logToolExecution,
  postCommitReview as _postCommitReview,
  postPushLog as _postPushLog,
  prePushGate as _prePushGate,
  rateLimit as _rateLimit,
  securityAudit as _securityAudit,
  validatePlanPhase as _validatePlanPhase,
} from './builtin-hooks.js';

export {
  _BUILTIN_HOOKS as BUILTIN_HOOKS,
  _getBuiltinHook as getBuiltinHook,
  _loadProjectContext as loadProjectContext,
  _checkMCPHealth as checkMCPHealth,
  _securityAudit as securityAudit,
  _rateLimit as rateLimit,
  _logToolExecution as logToolExecution,
  _attemptRecovery as attemptRecovery,
  _validatePlanPhase as validatePlanPhase,
  _logPlanPhase as logPlanPhase,
  _cleanupSession as cleanupSession,
  _postCommitReview as postCommitReview,
  _prePushGate as prePushGate,
  _postPushLog as postPushLog,
};

// Git hooks module
export {
  GIT_HOOKS,
  postCommitReview as gitPostCommitReview,
  postPushLog as gitPostPushLog,
  prePushGate as gitPrePushGate,
} from './git-hooks.js';

// Hook manager
import {
  getHookManager as _getHookManager,
  HookEvent as _HookEvent,
  HookManager as _HookManager,
  initializeHookManager as _initializeHookManager,
  resetHookManager as _resetHookManager,
} from './hook-manager.js';

export {
  _HookManager as HookManager,
  _HookEvent as HookEvent,
  _getHookManager as getHookManager,
  _initializeHookManager as initializeHookManager,
  _resetHookManager as resetHookManager,
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize hooks system
 *
 * @param {Object} [options] - Options
 * @returns {Promise<Object>}
 */
export async function initHooks(options = {}) {
  const { initializeHookManager } = await import('./hook-manager.js');
  const manager = await initializeHookManager(options);
  return { manager };
}

/**
 * Shutdown hooks system
 */
export function shutdownHooks() {
  const { resetHookManager } = require('./hook-manager.js');
  resetHookManager();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Built-in hooks
  BUILTIN_HOOKS: _BUILTIN_HOOKS,
  getBuiltinHook: _getBuiltinHook,
  loadProjectContext: _loadProjectContext,
  checkMCPHealth: _checkMCPHealth,
  securityAudit: _securityAudit,
  rateLimit: _rateLimit,
  logToolExecution: _logToolExecution,
  attemptRecovery: _attemptRecovery,
  validatePlanPhase: _validatePlanPhase,
  logPlanPhase: _logPlanPhase,
  cleanupSession: _cleanupSession,

  // Git pipeline hooks
  postCommitReview: _postCommitReview,
  prePushGate: _prePushGate,
  postPushLog: _postPushLog,

  // Manager
  HookManager: _HookManager,
  HookEvent: _HookEvent,
  getHookManager: _getHookManager,
  initializeHookManager: _initializeHookManager,
  resetHookManager: _resetHookManager,

  // System
  initHooks,
  shutdownHooks,
};
