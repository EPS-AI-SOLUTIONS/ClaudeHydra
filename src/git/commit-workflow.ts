/**
 * Git Commit Workflow
 *
 * Handles git commit operations with Co-Authored-By support.
 * Follows Claude Code's git safety protocols.
 *
 * @module src/git/commit-workflow
 */

import { safeGit } from '../security/safe-command.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default co-author for AI-assisted commits
 * @constant {string}
 */
export const DEFAULT_CO_AUTHOR = 'Claude Opus 4.5 <noreply@anthropic.com>';

/**
 * Sensitive file patterns that should not be committed
 * @constant {RegExp[]}
 */
const SENSITIVE_PATTERNS = [
  /\.env$/,
  /\.env\.\w+$/,
  /credentials\.json$/,
  /secrets?\.(json|ya?ml|toml)$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /\.ssh\//,
  /password/i,
];

// ============================================================================
// Git Utilities
// ============================================================================

/**
 * Execute git command (delegated to safeGit for security validation).
 *
 * SECURITY FIX: Replaced raw `execAsync(\`git ${command}\`)` with safeGit()
 * which validates the git subcommand against injection patterns, dangerous
 * subcommands, and command chaining before execution.
 *
 * @param {string} command - Git command (without 'git' prefix)
 * @param {Object} [options] - Execution options
 * @returns {Promise<Object>}
 */
async function git(command, options = {}) {
  const { cwd = process.cwd() } = options;
  return safeGit(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
}

// ============================================================================
// Commit Workflow Class
// ============================================================================

/**
 * Git Commit Workflow
 *
 * Manages git commit operations with safety checks.
 */
export class CommitWorkflow {
  /**
   * @param {Object} options - Workflow options
   * @param {string} [options.cwd] - Working directory
   * @param {string} [options.coAuthor] - Co-author string
   */
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.coAuthor = options.coAuthor || DEFAULT_CO_AUTHOR;
  }

  /**
   * Get current git status
   *
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const result = await git('status --porcelain', { cwd: this.cwd });

    if (!result.success) {
      throw new Error(`Failed to get git status: ${result.stderr}`);
    }

    const lines = result.stdout.split('\n').filter((l) => l.trim());
    const files = {
      staged: [],
      unstaged: [],
      untracked: [],
    };

    for (const line of lines) {
      const indexStatus = line[0];
      const workingStatus = line[1];
      const filePath = line.slice(3);

      if (indexStatus !== ' ' && indexStatus !== '?') {
        files.staged.push({ status: indexStatus, path: filePath });
      }

      if (workingStatus !== ' ' && workingStatus !== '?') {
        files.unstaged.push({ status: workingStatus, path: filePath });
      }

      if (indexStatus === '?' && workingStatus === '?') {
        files.untracked.push(filePath);
      }
    }

    return files;
  }

  /**
   * Get recent commits for style reference
   *
   * @param {number} [count=5] - Number of commits to get
   * @returns {Promise<Object[]>}
   */
  async getRecentCommits(count = 5) {
    const result = await git(`log --oneline -${count} --format="%h|%s|%an"`, { cwd: this.cwd });

    if (!result.success) {
      return [];
    }

    return result.stdout
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const [hash, subject, author] = line.split('|');
        return { hash, subject, author };
      });
  }

  /**
   * Get diff of changes
   *
   * @param {boolean} [staged=true] - Get staged changes
   * @returns {Promise<string>}
   */
  async getDiff(staged = true) {
    const flag = staged ? '--cached' : '';
    const result = await git(`diff ${flag}`, { cwd: this.cwd });

    return result.stdout || '';
  }

  /**
   * Check for sensitive files
   *
   * @param {string[]} files - Files to check
   * @returns {Object}
   */
  checkSensitiveFiles(files) {
    const sensitive = [];

    for (const file of files) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(file)) {
          sensitive.push(file);
          break;
        }
      }
    }

    return {
      hasSensitive: sensitive.length > 0,
      files: sensitive,
    };
  }

  /**
   * Stage files for commit
   *
   * @param {string[]} files - Files to stage
   * @returns {Promise<Object>}
   */
  async stageFiles(files) {
    // Check for sensitive files
    const sensitiveCheck = this.checkSensitiveFiles(files);
    if (sensitiveCheck.hasSensitive) {
      throw new Error(`Refusing to stage sensitive files: ${sensitiveCheck.files.join(', ')}`);
    }

    // Stage each file individually (safer than git add -A)
    const results = [];
    for (const file of files) {
      const result = await git(`add "${file}"`, { cwd: this.cwd });
      results.push({ file, ...result });
    }

    return {
      success: results.every((r) => r.success),
      results,
    };
  }

  /**
   * Create a commit
   *
   * @param {string} message - Commit message
   * @param {Object} [options] - Commit options
   * @returns {Promise<Object>}
   */
  async commit(message, options = {}) {
    const { addCoAuthor = true, allowEmpty = false } = options;

    // Build commit message with co-author
    let fullMessage = message.trim();

    if (addCoAuthor && !fullMessage.includes('Co-Authored-By:')) {
      fullMessage += `\n\nCo-Authored-By: ${this.coAuthor}`;
    }

    // Use heredoc-style for proper formatting
    const escapedMessage = fullMessage.replace(/"/g, '\\"');
    const flags = allowEmpty ? '--allow-empty' : '';

    const result = await git(`commit ${flags} -m "${escapedMessage}"`, { cwd: this.cwd });

    if (!result.success) {
      // Check if it's a pre-commit hook failure
      if (result.stderr.includes('pre-commit')) {
        throw new Error(
          `Pre-commit hook failed. Fix the issues and create a NEW commit (do not amend).`,
        );
      }
      throw new Error(`Commit failed: ${result.stderr}`);
    }

    // Get the new commit hash
    const hashResult = await git('rev-parse HEAD', { cwd: this.cwd });

    return {
      success: true,
      hash: hashResult.stdout,
      message: fullMessage,
    };
  }

  /**
   * Create a commit with full workflow
   *
   * @param {Object} options - Commit options
   * @param {string[]} [options.files] - Files to stage (optional, uses existing staged)
   * @param {string} [options.message] - Commit message (will be generated if not provided)
   * @returns {Promise<Object>}
   */
  async createCommit(options = {}) {
    const { files, message } = options;

    // Step 1: Get current status
    const _status = await this.getStatus();

    // Step 2: Stage files if provided
    if (files && files.length > 0) {
      await this.stageFiles(files);
    }

    // Check if there are staged changes
    const updatedStatus = await this.getStatus();
    if (updatedStatus.staged.length === 0) {
      return {
        success: false,
        error: 'No changes staged for commit',
      };
    }

    // Step 3: Generate message if not provided
    let commitMessage = message;
    if (!commitMessage) {
      commitMessage = await this.generateCommitMessage(updatedStatus.staged);
    }

    // Step 4: Create commit
    const result = await this.commit(commitMessage);

    // Step 5: Verify
    const finalStatus = await this.getStatus();

    return {
      ...result,
      status: finalStatus,
    };
  }

  /**
   * Generate commit message from staged changes
   *
   * @param {Object[]} stagedFiles - Staged files
   * @returns {Promise<string>}
   */
  async generateCommitMessage(stagedFiles) {
    // Analyze the types of changes
    const types = {
      add: 0,
      modify: 0,
      delete: 0,
      rename: 0,
    };

    const affectedAreas = new Set();

    for (const file of stagedFiles) {
      switch (file.status) {
        case 'A':
          types.add++;
          break;
        case 'M':
          types.modify++;
          break;
        case 'D':
          types.delete++;
          break;
        case 'R':
          types.rename++;
          break;
      }

      // Determine affected area from path
      const parts = file.path.split('/');
      if (parts.length > 1) {
        affectedAreas.add(parts[0]);
      }
    }

    // Determine primary action
    let action = 'update';
    if (types.add > types.modify && types.add > types.delete) {
      action = 'add';
    } else if (types.delete > types.modify && types.delete > types.add) {
      action = 'remove';
    } else if (types.modify > 0) {
      action = 'update';
    }

    // Build message
    const scope = affectedAreas.size <= 2 ? Array.from(affectedAreas).join(', ') : 'multiple areas';

    const fileCount = stagedFiles.length;
    const fileWord = fileCount === 1 ? 'file' : 'files';

    return `${action}: ${scope} (${fileCount} ${fileWord})`;
  }

  /**
   * Amend the last commit (use with caution)
   *
   * @param {string} [message] - New message (optional)
   * @returns {Promise<Object>}
   */
  async amend(message) {
    console.warn(
      '[CommitWorkflow] WARNING: Amending commit. Only do this if explicitly requested.',
    );

    let command = 'commit --amend';

    if (message) {
      const escapedMessage = message.replace(/"/g, '\\"');
      command += ` -m "${escapedMessage}"`;
    } else {
      command += ' --no-edit';
    }

    const result = await git(command, { cwd: this.cwd });

    if (!result.success) {
      throw new Error(`Amend failed: ${result.stderr}`);
    }

    return {
      success: true,
      stdout: result.stdout,
    };
  }

  /**
   * Get current branch name
   *
   * @returns {Promise<string>}
   */
  async getCurrentBranch() {
    const result = await git('branch --show-current', { cwd: this.cwd });
    return result.stdout || 'HEAD';
  }

  /**
   * Check if working directory is clean
   *
   * @returns {Promise<boolean>}
   */
  async isClean() {
    const status = await this.getStatus();
    return (
      status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0
    );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create commit workflow instance
 *
 * @param {Object} [options] - Workflow options
 * @returns {CommitWorkflow}
 */
export function getCommitWorkflow(options = {}) {
  if (!_instance) {
    _instance = new CommitWorkflow(options);
  }
  return _instance;
}

/**
 * Reset singleton instance
 */
export function resetCommitWorkflow() {
  _instance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a commit with files
 *
 * @param {string[]} files - Files to commit
 * @param {string} message - Commit message
 * @returns {Promise<Object>}
 */
export async function commitFiles(files, message) {
  const workflow = getCommitWorkflow();
  return workflow.createCommit({ files, message });
}

/**
 * Get git status
 *
 * @returns {Promise<Object>}
 */
export async function getGitStatus() {
  const workflow = getCommitWorkflow();
  return workflow.getStatus();
}

export default CommitWorkflow;
