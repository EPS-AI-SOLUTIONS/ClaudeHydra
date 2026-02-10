/**
 * Git PR Workflow
 *
 * Handles pull request creation and management.
 * Uses GitHub CLI (gh) for GitHub operations.
 *
 * @module src/git/pr-workflow
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { safeGit } from '../security/safe-command.js';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

/**
 * PR template footer
 * @constant {string}
 */
const PR_FOOTER = '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';

// ============================================================================
// Git/GH Utilities
// ============================================================================

/**
 * Execute git command (delegated to safeGit for security validation).
 *
 * SECURITY FIX: Replaced raw `execAsync(\`git ${command}\`)` with safeGit()
 * which validates the git subcommand against injection patterns before execution.
 *
 * @param {string} command - Git command
 * @param {Object} [options] - Execution options
 * @returns {Promise<Object>}
 */
async function git(command, options = {}) {
  const { cwd = process.cwd() } = options;
  return safeGit(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
}

/**
 * Execute gh command
 *
 * @param {string} command - GH command
 * @param {Object} [options] - Execution options
 * @returns {Promise<Object>}
 */
async function gh(command, options = {}) {
  const { cwd = process.cwd() } = options;

  try {
    const { stdout, stderr } = await execAsync(`gh ${command}`, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    return {
      success: false,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || error.message,
      error,
    };
  }
}

// ============================================================================
// PR Workflow Class
// ============================================================================

/**
 * Git PR Workflow
 *
 * Manages pull request creation and operations.
 */
export class PRWorkflow {
  /**
   * @param {Object} options - Workflow options
   * @param {string} [options.cwd] - Working directory
   * @param {string} [options.baseBranch] - Default base branch
   */
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.baseBranch = options.baseBranch || 'main';
  }

  /**
   * Get current branch info
   *
   * @returns {Promise<Object>}
   */
  async getBranchInfo() {
    const [branchResult, remoteResult, aheadBehindResult] = await Promise.all([
      git('branch --show-current', { cwd: this.cwd }),
      git('rev-parse --abbrev-ref --symbolic-full-name @{u}', { cwd: this.cwd }),
      git(`rev-list --left-right --count ${this.baseBranch}...HEAD`, { cwd: this.cwd }),
    ]);

    const currentBranch = branchResult.stdout;
    const hasRemote = remoteResult.success;
    const remote = hasRemote ? remoteResult.stdout.split('/')[0] : null;

    let ahead = 0;
    let behind = 0;

    if (aheadBehindResult.success) {
      const [b, a] = aheadBehindResult.stdout.split(/\s+/);
      behind = parseInt(b, 10) || 0;
      ahead = parseInt(a, 10) || 0;
    }

    return {
      branch: currentBranch,
      hasRemote,
      remote,
      ahead,
      behind,
      baseBranch: this.baseBranch,
    };
  }

  /**
   * Get commits for PR
   *
   * @returns {Promise<Object[]>}
   */
  async getCommitsForPR() {
    const result = await git(`log ${this.baseBranch}..HEAD --format="%h|%s|%an|%ae"`, {
      cwd: this.cwd,
    });

    if (!result.success || !result.stdout) {
      return [];
    }

    return result.stdout
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const [hash, subject, author, email] = line.split('|');
        return { hash, subject, author, email };
      });
  }

  /**
   * Get files changed from base branch
   *
   * @returns {Promise<Object>}
   */
  async getChangedFiles() {
    const result = await git(`diff --name-status ${this.baseBranch}...HEAD`, { cwd: this.cwd });

    if (!result.success) {
      return { files: [], stats: {} };
    }

    const files = result.stdout
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const [status, ...pathParts] = line.split(/\s+/);
        return {
          status: status[0],
          path: pathParts.join(' '),
        };
      });

    const stats = {
      added: files.filter((f) => f.status === 'A').length,
      modified: files.filter((f) => f.status === 'M').length,
      deleted: files.filter((f) => f.status === 'D').length,
      renamed: files.filter((f) => f.status === 'R').length,
      total: files.length,
    };

    return { files, stats };
  }

  /**
   * Get diff stats
   *
   * @returns {Promise<Object>}
   */
  async getDiffStats() {
    const result = await git(`diff --stat ${this.baseBranch}...HEAD`, { cwd: this.cwd });

    if (!result.success) {
      return { additions: 0, deletions: 0 };
    }

    // Parse the last line which contains the summary
    const lines = result.stdout.split('\n');
    const summaryLine = lines[lines.length - 1];

    let additions = 0;
    let deletions = 0;

    const insertMatch = summaryLine.match(/(\d+) insertion/);
    const deleteMatch = summaryLine.match(/(\d+) deletion/);

    if (insertMatch) additions = parseInt(insertMatch[1], 10);
    if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);

    return { additions, deletions };
  }

  /**
   * Push branch to remote
   *
   * @param {Object} [options] - Push options
   * @returns {Promise<Object>}
   */
  async push(options = {}) {
    const { force = false, setUpstream = true } = options;

    const branchInfo = await this.getBranchInfo();
    let command = 'push';

    if (setUpstream && !branchInfo.hasRemote) {
      command += ` -u origin ${branchInfo.branch}`;
    }

    if (force) {
      // Warn about force push
      if (branchInfo.branch === 'main' || branchInfo.branch === 'master') {
        throw new Error('Refusing to force push to main/master branch');
      }
      command += ' --force-with-lease';
    }

    const result = await git(command, { cwd: this.cwd });

    if (!result.success) {
      throw new Error(`Push failed: ${result.stderr}`);
    }

    return result;
  }

  /**
   * Create a pull request
   *
   * @param {Object} options - PR options
   * @param {string} options.title - PR title
   * @param {string} options.body - PR body
   * @param {string} [options.base] - Base branch
   * @param {boolean} [options.draft] - Create as draft
   * @returns {Promise<Object>}
   */
  async createPR(options) {
    const { title, body, base = this.baseBranch, draft = false } = options;

    // Ensure we're pushed to remote
    await this.push();

    // Build gh pr create command
    let command = `pr create --title "${title.replace(/"/g, '\\"')}"`;
    command += ` --base "${base}"`;

    if (draft) {
      command += ' --draft';
    }

    // Add body with footer
    const fullBody = body + PR_FOOTER;
    command += ` --body "${fullBody.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    const result = await gh(command, { cwd: this.cwd });

    if (!result.success) {
      throw new Error(`Failed to create PR: ${result.stderr}`);
    }

    // Extract PR URL from output
    const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
    const prUrl = urlMatch ? urlMatch[0] : result.stdout;

    return {
      success: true,
      url: prUrl,
      stdout: result.stdout,
    };
  }

  /**
   * Generate PR title from commits
   *
   * @param {Object[]} commits - Commits
   * @returns {string}
   */
  generateTitle(commits) {
    if (commits.length === 0) {
      return 'Update';
    }

    if (commits.length === 1) {
      // Use single commit subject (truncate if needed)
      const subject = commits[0].subject;
      return subject.length > 70 ? `${subject.slice(0, 67)}...` : subject;
    }

    // Multiple commits - summarize
    const types = new Set();

    for (const commit of commits) {
      const subject = commit.subject.toLowerCase();
      if (subject.startsWith('feat') || subject.includes('add')) {
        types.add('feat');
      } else if (subject.startsWith('fix')) {
        types.add('fix');
      } else if (subject.startsWith('refactor')) {
        types.add('refactor');
      } else if (subject.startsWith('docs')) {
        types.add('docs');
      } else if (subject.startsWith('test')) {
        types.add('test');
      } else {
        types.add('update');
      }
    }

    const typeList = Array.from(types).join(', ');
    return `${typeList}: Multiple changes (${commits.length} commits)`;
  }

  /**
   * Generate PR body from commits and changes
   *
   * @param {Object[]} commits - Commits
   * @param {Object} changedFiles - Changed files info
   * @param {Object} stats - Diff stats
   * @returns {string}
   */
  generateBody(commits, changedFiles, stats) {
    const parts = [];

    // Summary section
    parts.push('## Summary');
    if (commits.length <= 3) {
      for (const commit of commits) {
        parts.push(`- ${commit.subject}`);
      }
    } else {
      // Group by type
      const grouped = {};
      for (const commit of commits) {
        const type = commit.subject.split(':')[0] || 'other';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(commit.subject);
      }

      for (const [type, subjects] of Object.entries(grouped)) {
        parts.push(`- **${type}**: ${subjects.length} changes`);
      }
    }
    parts.push('');

    // Changes section
    parts.push('## Changes');
    parts.push(`- Files changed: ${changedFiles.stats.total}`);
    parts.push(`- Additions: +${stats.additions}`);
    parts.push(`- Deletions: -${stats.deletions}`);
    parts.push('');

    // Test plan section
    parts.push('## Test plan');
    parts.push('- [ ] Run existing tests');
    parts.push('- [ ] Manual verification');
    parts.push('- [ ] Review changes');

    return parts.join('\n');
  }

  /**
   * Create PR with full workflow
   *
   * @param {Object} [options] - Options
   * @returns {Promise<Object>}
   */
  async createPRWithWorkflow(options = {}) {
    // Step 1: Get branch info
    const branchInfo = await this.getBranchInfo();

    if (branchInfo.branch === this.baseBranch) {
      throw new Error(`Cannot create PR from ${this.baseBranch} branch`);
    }

    // Step 2: Get commits
    const commits = await this.getCommitsForPR();

    if (commits.length === 0) {
      throw new Error('No commits to include in PR');
    }

    // Step 3: Get changed files
    const changedFiles = await this.getChangedFiles();

    // Step 4: Get stats
    const stats = await this.getDiffStats();

    // Step 5: Generate title and body
    const title = options.title || this.generateTitle(commits);
    const body = options.body || this.generateBody(commits, changedFiles, stats);

    // Step 6: Create PR
    const result = await this.createPR({
      title,
      body,
      base: options.base || this.baseBranch,
      draft: options.draft,
    });

    return {
      ...result,
      title,
      commits: commits.length,
      filesChanged: changedFiles.stats.total,
    };
  }

  /**
   * List open PRs for current repo
   *
   * @returns {Promise<Object[]>}
   */
  async listPRs() {
    const result = await gh('pr list --json number,title,state,url,author', { cwd: this.cwd });

    if (!result.success) {
      return [];
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }

  /**
   * Get PR details
   *
   * @param {number} prNumber - PR number
   * @returns {Promise<Object>}
   */
  async getPR(prNumber) {
    const result = await gh(
      `pr view ${prNumber} --json number,title,state,body,url,author,reviews,comments`,
      { cwd: this.cwd },
    );

    if (!result.success) {
      throw new Error(`Failed to get PR: ${result.stderr}`);
    }

    return JSON.parse(result.stdout);
  }

  /**
   * Get PR comments
   *
   * @param {number} prNumber - PR number
   * @returns {Promise<Object[]>}
   */
  async getPRComments(prNumber) {
    const result = await gh(`api repos/{owner}/{repo}/pulls/${prNumber}/comments`, {
      cwd: this.cwd,
    });

    if (!result.success) {
      return [];
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create PR workflow instance
 *
 * @param {Object} [options] - Workflow options
 * @returns {PRWorkflow}
 */
export function getPRWorkflow(options = {}) {
  if (!_instance) {
    _instance = new PRWorkflow(options);
  }
  return _instance;
}

/**
 * Reset singleton instance
 */
export function resetPRWorkflow() {
  _instance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a PR with automatic title and body
 *
 * @param {Object} [options] - Options
 * @returns {Promise<Object>}
 */
export async function createPR(options = {}) {
  const workflow = getPRWorkflow(options);
  return workflow.createPRWithWorkflow(options);
}

/**
 * List open PRs
 *
 * @returns {Promise<Object[]>}
 */
export async function listPRs() {
  const workflow = getPRWorkflow();
  return workflow.listPRs();
}

export default PRWorkflow;
