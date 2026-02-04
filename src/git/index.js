/**
 * Git Module
 *
 * Git integration with commit and PR workflows.
 *
 * @module src/git
 */

// Commit Workflow
export {
  CommitWorkflow,
  DEFAULT_CO_AUTHOR,
  getCommitWorkflow,
  resetCommitWorkflow,
  commitFiles,
  getGitStatus
} from './commit-workflow.js';

// PR Workflow
export {
  PRWorkflow,
  getPRWorkflow,
  resetPRWorkflow,
  createPR,
  listPRs
} from './pr-workflow.js';

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize git module
 *
 * @param {Object} [options] - Options
 * @returns {Object}
 */
export function initGit(options = {}) {
  const { getCommitWorkflow } = require('./commit-workflow.js');
  const { getPRWorkflow } = require('./pr-workflow.js');

  const commitWorkflow = getCommitWorkflow(options);
  const prWorkflow = getPRWorkflow(options);

  return { commitWorkflow, prWorkflow };
}

/**
 * Shutdown git module
 */
export function shutdownGit() {
  const { resetCommitWorkflow } = require('./commit-workflow.js');
  const { resetPRWorkflow } = require('./pr-workflow.js');

  resetCommitWorkflow();
  resetPRWorkflow();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Commit
  CommitWorkflow,
  DEFAULT_CO_AUTHOR,
  getCommitWorkflow,
  resetCommitWorkflow,
  commitFiles,
  getGitStatus,

  // PR
  PRWorkflow,
  getPRWorkflow,
  resetPRWorkflow,
  createPR,
  listPRs,

  // System
  initGit,
  shutdownGit
};
