/**
 * Git Pipeline Hooks
 *
 * Hook handlers for git lifecycle events: post-commit, pre-push, post-push.
 * Integrates with the Vesemir code reviewer for automated review on every commit.
 *
 * @module src/hooks/git-hooks
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('git-hooks');
const execAsync = promisify(exec);

// =============================================================================
// TYPES
// =============================================================================

/**
 * Git commit info extracted from git log
 */
export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  branch: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/**
 * Git hook context passed to hook handlers
 */
export interface GitHookContext {
  /** Current working directory */
  cwd: string;

  /** Hook options from configuration */
  hookOptions?: {
    /** Auto-review on commit (default: true) */
    autoReview?: boolean;
    /** Review strictness: lenient | normal | strict */
    strictness?: 'lenient' | 'normal' | 'strict';
    /** Save reviews to disk */
    saveReviews?: boolean;
    /** Directory for saving reviews */
    reviewDir?: string;
    /** Block push on critical findings */
    blockOnCritical?: boolean;
    /** Minimum score to pass pre-push check */
    minScore?: number;
    /** File patterns to ignore in review */
    ignorePatterns?: string[];
  };
}

/**
 * Result returned by git hooks
 */
export interface GitHookResult {
  success: boolean;
  blocked?: boolean;
  message: string;
  commitInfo?: CommitInfo;
  // biome-ignore lint/suspicious/noExplicitAny: ReviewResult imported dynamically to avoid circular deps
  reviewResult?: any;
  error?: string;
}

// =============================================================================
// GIT HELPERS
// =============================================================================

/**
 * Get info about the latest commit
 *
 * @param cwd - Working directory
 * @returns CommitInfo or null
 */
async function getLatestCommit(cwd: string): Promise<CommitInfo | null> {
  try {
    // Get commit details
    const { stdout: logOutput } = await execAsync('git log -1 --format="%H|%h|%an|%ae|%aI|%s"', {
      cwd,
    });

    const parts = logOutput.trim().split('|');
    if (parts.length < 6) return null;

    // Get current branch
    const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });

    // Get stats
    const { stdout: statsOutput } = await execAsync(
      'git diff --shortstat HEAD~1 HEAD 2>/dev/null || echo "0 files changed"',
      { cwd },
    );

    // Parse stats: "3 files changed, 45 insertions(+), 12 deletions(-)"
    const filesMatch = statsOutput.match(/(\d+) file/);
    const insertionsMatch = statsOutput.match(/(\d+) insertion/);
    const deletionsMatch = statsOutput.match(/(\d+) deletion/);

    return {
      hash: parts[0],
      shortHash: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      message: parts.slice(5).join('|'), // Message might contain pipes
      branch: branchOutput.trim(),
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      insertions: insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0,
      deletions: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0,
    };
  } catch (error: unknown) {
    logger.warn(`[GitHooks] Failed to get commit info: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Get the diff for the latest commit
 *
 * @param cwd - Working directory
 * @param ignorePatterns - File patterns to exclude
 * @returns Diff string
 */
async function getCommitDiff(cwd: string, ignorePatterns: string[] = []): Promise<string> {
  try {
    // Build exclude args
    const excludeArgs = ignorePatterns.map((p) => `':(exclude)${p}'`).join(' ');

    const { stdout } = await execAsync(
      `git diff HEAD~1 HEAD -- . ${excludeArgs}`,
      { cwd, maxBuffer: 1024 * 1024 * 10 }, // 10MB buffer
    );

    return stdout;
  } catch (error: unknown) {
    // If HEAD~1 doesn't exist (first commit), diff against empty tree
    try {
      const { stdout } = await execAsync(
        'git diff --cached 4b825dc642cb6eb9a060e54bf899d69f245822 HEAD',
        { cwd, maxBuffer: 1024 * 1024 * 10 },
      );
      return stdout;
    } catch {
      logger.warn(`[GitHooks] Failed to get diff: ${(error as Error).message}`);
      return '';
    }
  }
}

/**
 * Get pending (unpushed) commits diff
 *
 * @param cwd - Working directory
 * @returns Diff string
 */
async function getUnpushedDiff(cwd: string): Promise<string> {
  try {
    // Get the upstream tracking branch
    const { stdout: upstream } = await execAsync(
      'git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo ""',
      { cwd },
    );

    if (!upstream.trim()) {
      // No upstream, diff against first commit
      return '';
    }

    const { stdout } = await execAsync(`git diff ${upstream.trim()}..HEAD`, {
      cwd,
      maxBuffer: 1024 * 1024 * 10,
    });

    return stdout;
  } catch {
    return '';
  }
}

/**
 * Save review result to disk
 *
 * @param reviewResult - The review result to save
 * @param commitInfo - Associated commit info
 * @param reviewDir - Directory to save in
 */
async function saveReviewToDisk(
  reviewResult: Record<string, unknown>,
  commitInfo: CommitInfo | null,
  reviewDir: string,
): Promise<void> {
  try {
    await fs.mkdir(reviewDir, { recursive: true });

    const filename = commitInfo
      ? `${commitInfo.shortHash}-${Date.now()}.json`
      : `review-${Date.now()}.json`;

    const filePath = path.join(reviewDir, filename);

    const data = {
      commit: commitInfo,
      review: reviewResult,
      savedAt: new Date().toISOString(),
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`[GitHooks] Review saved to ${filePath}`);
  } catch (error: unknown) {
    logger.warn(`[GitHooks] Failed to save review: ${(error as Error).message}`);
  }
}

// =============================================================================
// GIT HOOK HANDLERS
// =============================================================================

/**
 * Post-Commit Hook
 *
 * Triggered after a git commit. Runs Vesemir code review on the committed changes.
 *
 * @param context - Hook context
 * @returns GitHookResult
 */
export async function postCommitReview(context: GitHookContext): Promise<GitHookResult> {
  const { cwd = process.cwd(), hookOptions = {} } = context;

  const {
    autoReview = true,
    strictness = 'normal',
    saveReviews = true,
    reviewDir = path.join(cwd, '.hydra', 'reviews'),
    ignorePatterns = ['*.lock', 'package-lock.json', 'pnpm-lock.yaml', '*.min.js', '*.min.css'],
  } = hookOptions;

  logger.info('[GitHooks] Post-commit hook triggered');

  // Get commit info
  const commitInfo = await getLatestCommit(cwd);
  if (!commitInfo) {
    return {
      success: true,
      message: 'Could not retrieve commit info, skipping review.',
    };
  }

  logger.info(`[GitHooks] Commit: ${commitInfo.shortHash} — ${commitInfo.message}`);

  if (!autoReview) {
    return {
      success: true,
      message: 'Auto-review disabled, skipping.',
      commitInfo,
    };
  }

  // Get the diff
  const diff = await getCommitDiff(cwd, ignorePatterns);
  if (!diff || diff.trim().length === 0) {
    return {
      success: true,
      message: 'No reviewable changes in commit.',
      commitInfo,
    };
  }

  // Import Vesemir reviewer dynamically to avoid circular dependencies
  try {
    const { reviewDiff, formatReview } = await import('../swarm/vesemir-reviewer.js');

    const reviewResult = await reviewDiff(diff, {
      strictness,
      context: `Commit: ${commitInfo.shortHash} — ${commitInfo.message}\nBranch: ${commitInfo.branch}\nAuthor: ${commitInfo.author}`,
      ignorePatterns,
    });

    // Save review to disk
    if (saveReviews) {
      await saveReviewToDisk(reviewResult, commitInfo, reviewDir);
    }

    // Log formatted review
    const formatted = formatReview(reviewResult);
    logger.info(`\n${formatted}`);

    return {
      success: true,
      message: `Review complete: score=${reviewResult.score}/100, verdict=${reviewResult.verdict}`,
      commitInfo,
      reviewResult,
    };
  } catch (error: unknown) {
    const errMsg = (error as Error).message;
    logger.error(`[GitHooks] Review failed: ${errMsg}`);

    return {
      success: true, // Don't block on review failures
      message: `Review failed: ${errMsg}`,
      commitInfo,
      error: errMsg,
    };
  }
}

/**
 * Pre-Push Hook
 *
 * Triggered before git push. Can block push if code quality is below threshold.
 *
 * @param context - Hook context
 * @returns GitHookResult
 */
export async function prePushGate(context: GitHookContext): Promise<GitHookResult> {
  const { cwd = process.cwd(), hookOptions = {} } = context;

  const {
    blockOnCritical = true,
    minScore = 40,
    strictness = 'normal',
    ignorePatterns = ['*.lock', 'package-lock.json', 'pnpm-lock.yaml'],
  } = hookOptions;

  logger.info('[GitHooks] Pre-push gate triggered');

  // Get unpushed diff
  const diff = await getUnpushedDiff(cwd);
  if (!diff || diff.trim().length === 0) {
    return {
      success: true,
      message: 'No unpushed changes to review. Push allowed.',
    };
  }

  try {
    const { reviewDiff } = await import('../swarm/vesemir-reviewer.js');

    const reviewResult = await reviewDiff(diff, {
      strictness,
      context: 'Pre-push quality gate review',
      ignorePatterns,
    });

    // Gate logic
    if (blockOnCritical && reviewResult.counts.critical > 0) {
      return {
        success: false,
        blocked: true,
        message: `Push BLOCKED: ${reviewResult.counts.critical} critical finding(s). Fix before pushing.`,
        reviewResult,
      };
    }

    if (reviewResult.score < minScore) {
      return {
        success: false,
        blocked: true,
        message: `Push BLOCKED: Score ${reviewResult.score}/100 is below minimum ${minScore}. Improve code quality before pushing.`,
        reviewResult,
      };
    }

    return {
      success: true,
      message: `Pre-push check passed: score=${reviewResult.score}/100, verdict=${reviewResult.verdict}`,
      reviewResult,
    };
  } catch (error: unknown) {
    const errMsg = (error as Error).message;
    logger.warn(`[GitHooks] Pre-push review failed: ${errMsg}`);

    // Don't block push if review itself fails
    return {
      success: true,
      message: `Pre-push review error (not blocking): ${errMsg}`,
      error: errMsg,
    };
  }
}

/**
 * Post-Push Hook
 *
 * Triggered after a successful push. Logs the push event and optionally
 * generates a summary of all pushed changes.
 *
 * @param context - Hook context
 * @returns GitHookResult
 */
export async function postPushLog(context: GitHookContext): Promise<GitHookResult> {
  const { cwd = process.cwd() } = context;

  logger.info('[GitHooks] Post-push hook triggered');

  const commitInfo = await getLatestCommit(cwd);

  return {
    success: true,
    message: commitInfo
      ? `Push complete: ${commitInfo.shortHash} (${commitInfo.branch}) — ${commitInfo.message}`
      : 'Push complete.',
    commitInfo: commitInfo || undefined,
  };
}

// =============================================================================
// BUILTIN HOOK REGISTRATION
// =============================================================================

/**
 * All git hooks exported for registration in builtin-hooks
 */
export const GIT_HOOKS = {
  postCommitReview,
  prePushGate,
  postPushLog,
};

export default GIT_HOOKS;
