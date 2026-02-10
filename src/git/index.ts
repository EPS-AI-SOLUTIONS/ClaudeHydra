/**
 * Git Module
 *
 * Git integration with commit and PR workflows.
 *
 * @module src/git
 */

// Commit Workflow
import {
  CommitWorkflow as _CommitWorkflow,
  commitFiles as _commitFiles,
  DEFAULT_CO_AUTHOR as _DEFAULT_CO_AUTHOR,
  getCommitWorkflow as _getCommitWorkflow,
  getGitStatus as _getGitStatus,
  resetCommitWorkflow as _resetCommitWorkflow,
} from './commit-workflow.js';

export {
  _CommitWorkflow as CommitWorkflow,
  _DEFAULT_CO_AUTHOR as DEFAULT_CO_AUTHOR,
  _getCommitWorkflow as getCommitWorkflow,
  _resetCommitWorkflow as resetCommitWorkflow,
  _commitFiles as commitFiles,
  _getGitStatus as getGitStatus,
};

// PR Workflow
import {
  createPR as _createPR,
  getPRWorkflow as _getPRWorkflow,
  listPRs as _listPRs,
  PRWorkflow as _PRWorkflow,
  resetPRWorkflow as _resetPRWorkflow,
} from './pr-workflow.js';

export {
  _PRWorkflow as PRWorkflow,
  _getPRWorkflow as getPRWorkflow,
  _resetPRWorkflow as resetPRWorkflow,
  _createPR as createPR,
  _listPRs as listPRs,
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize git module
 *
 * @param {Object} [options] - Options
 * @returns {Promise<Object>}
 */
export async function initGit(options = {}) {
  const commitWorkflow = _getCommitWorkflow(options);
  const prWorkflow = _getPRWorkflow(options);

  return { commitWorkflow, prWorkflow };
}

/**
 * Shutdown git module
 */
export function shutdownGit() {
  _resetCommitWorkflow();
  _resetPRWorkflow();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Commit
  CommitWorkflow: _CommitWorkflow,
  DEFAULT_CO_AUTHOR: _DEFAULT_CO_AUTHOR,
  getCommitWorkflow: _getCommitWorkflow,
  resetCommitWorkflow: _resetCommitWorkflow,
  commitFiles: _commitFiles,
  getGitStatus: _getGitStatus,

  // PR
  PRWorkflow: _PRWorkflow,
  getPRWorkflow: _getPRWorkflow,
  resetPRWorkflow: _resetPRWorkflow,
  createPR: _createPR,
  listPRs: _listPRs,

  // System
  initGit,
  shutdownGit,
};
