/**
 * Hooks Module
 *
 * Lifecycle hooks system for session, tool, and plan events.
 *
 * @module src/hooks
 */

// Built-in hooks
export {
  BUILTIN_HOOKS,
  getBuiltinHook,
  loadProjectContext,
  checkMCPHealth,
  securityAudit,
  rateLimit,
  logToolExecution,
  attemptRecovery,
  validatePlanPhase,
  logPlanPhase,
  cleanupSession
} from './builtin-hooks.js';

// Hook manager
export {
  HookManager,
  HookEvent,
  getHookManager,
  initializeHookManager,
  resetHookManager
} from './hook-manager.js';

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
  BUILTIN_HOOKS,
  getBuiltinHook,
  loadProjectContext,
  checkMCPHealth,
  securityAudit,
  rateLimit,
  logToolExecution,
  attemptRecovery,
  validatePlanPhase,
  logPlanPhase,
  cleanupSession,

  // Manager
  HookManager,
  HookEvent,
  getHookManager,
  initializeHookManager,
  resetHookManager,

  // System
  initHooks,
  shutdownHooks
};
