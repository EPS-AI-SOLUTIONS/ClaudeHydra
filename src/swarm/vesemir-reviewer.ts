/**
 * Vesemir Code Reviewer
 *
 * Dedicated code review module powered by Claude Sonnet 4.5.
 * Vesemir — the oldest and most experienced witcher — reviews code changes
 * with a mentor's eye: firm but fair, focused on teaching good practices.
 *
 * Uses Claude Sonnet (not Opus) for cost-effective automated review.
 *
 * @module swarm/vesemir-reviewer
 */

import { generate as claudeGenerate } from '../hydra/providers/claude-client.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('vesemir-reviewer');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Claude Sonnet 4.5 — cost-effective model for automated reviews
 */
export const REVIEW_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Review severity levels
 */
export const Severity = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  SUGGESTION: 'suggestion',
  PRAISE: 'praise',
} as const;

export type SeverityLevel = (typeof Severity)[keyof typeof Severity];

/**
 * Review categories
 */
export const Category = {
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  CORRECTNESS: 'correctness',
  STYLE: 'style',
  ARCHITECTURE: 'architecture',
  ERROR_HANDLING: 'error-handling',
  TESTING: 'testing',
  DOCUMENTATION: 'documentation',
  BEST_PRACTICES: 'best-practices',
} as const;

export type CategoryType = (typeof Category)[keyof typeof Category];

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single review finding
 */
export interface ReviewFinding {
  severity: SeverityLevel;
  category: CategoryType;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

/**
 * Complete review result
 */
export interface ReviewResult {
  success: boolean;
  reviewId: string;
  timestamp: string;
  model: string;
  duration: number;

  /** Overall quality score (0-100) */
  score: number;

  /** Summary in 1-3 sentences */
  summary: string;

  /** Individual findings */
  findings: ReviewFinding[];

  /** Counts by severity */
  counts: {
    critical: number;
    warning: number;
    suggestion: number;
    praise: number;
  };

  /** Pass/fail verdict */
  verdict: 'pass' | 'warn' | 'fail';

  /** Raw AI response (for debugging) */
  rawResponse?: string;

  /** Error message if review failed */
  error?: string;
}

/**
 * Review request options
 */
export interface ReviewOptions {
  /** Focus areas for review */
  focus?: CategoryType[];

  /** Strictness level: lenient, normal, strict */
  strictness?: 'lenient' | 'normal' | 'strict';

  /** Maximum tokens for response */
  maxTokens?: number;

  /** Timeout in ms */
  timeout?: number;

  /** Include raw AI response in result */
  includeRaw?: boolean;

  /** Additional context (e.g. PR description, commit message) */
  context?: string;

  /** File patterns to ignore */
  ignorePatterns?: string[];
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const VESEMIR_SYSTEM_PROMPT = `You are Vesemir, the eldest and most experienced witcher from the School of the Wolf.
You are reviewing code changes as a mentor — firm but fair, focused on teaching good practices.

Your personality:
- Patient and thorough, you've seen every mistake in the book
- You explain the "why" behind your advice, not just the "what"
- You praise good patterns when you see them
- You never nitpick formatting — focus on substance

Your review output MUST be valid JSON with this exact structure:
{
  "score": <number 0-100>,
  "summary": "<1-3 sentence overview>",
  "findings": [
    {
      "severity": "critical" | "warning" | "suggestion" | "praise",
      "category": "security" | "performance" | "correctness" | "style" | "architecture" | "error-handling" | "testing" | "documentation" | "best-practices",
      "file": "<filename>",
      "line": <line number or null>,
      "message": "<what you found>",
      "suggestion": "<how to fix it, or null>"
    }
  ]
}

Scoring guide:
- 90-100: Excellent code, minor suggestions at most
- 70-89: Good code with some improvements needed
- 50-69: Significant issues that should be addressed
- 0-49: Critical problems that must be fixed before merge

Severity guide:
- critical: Security vulnerabilities, data loss risks, crashes, race conditions
- warning: Bugs, missing error handling, performance issues, logic errors
- suggestion: Refactoring opportunities, cleaner patterns, better naming
- praise: Well-written code, good patterns, thorough error handling

IMPORTANT: Output ONLY the JSON object, no markdown fences, no explanation before/after.`;

// =============================================================================
// REVIEW FUNCTIONS
// =============================================================================

/**
 * Generate a unique review ID
 */
function generateReviewId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `vesemir-${timestamp}-${random}`;
}

/**
 * Build the review prompt from a git diff
 *
 * @param diff - The git diff string
 * @param options - Review options
 * @returns Formatted prompt string
 */
function buildReviewPrompt(diff: string, options: ReviewOptions = {}): string {
  const { focus, strictness = 'normal', context } = options;

  let prompt = 'Review the following code changes:\n\n';

  if (context) {
    prompt += `Context: ${context}\n\n`;
  }

  if (focus && focus.length > 0) {
    prompt += `Focus areas: ${focus.join(', ')}\n\n`;
  }

  prompt += `Strictness: ${strictness}\n\n`;

  // Truncate very large diffs to stay within token limits
  const maxDiffLength = 50000;
  const truncatedDiff =
    diff.length > maxDiffLength
      ? `${diff.substring(0, maxDiffLength)}\n\n[... diff truncated at ${maxDiffLength} chars, ${diff.length - maxDiffLength} chars omitted ...]`
      : diff;

  prompt += `\`\`\`diff\n${truncatedDiff}\n\`\`\``;

  return prompt;
}

/**
 * Parse the AI's JSON response into a structured ReviewResult
 *
 * @param raw - Raw AI response string
 * @param reviewId - Review ID
 * @param startTime - Start timestamp for duration calculation
 * @param includeRaw - Whether to include raw response
 * @returns Parsed ReviewResult
 */
function parseReviewResponse(
  raw: string,
  reviewId: string,
  startTime: number,
  includeRaw: boolean,
): ReviewResult {
  const duration = Date.now() - startTime;

  try {
    // Strip potential markdown fences
    let jsonStr = raw.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    // Validate and normalize findings
    // biome-ignore lint/suspicious/noExplicitAny: parsing untyped JSON from AI response
    const findings: ReviewFinding[] = (parsed.findings || []).map((f: any) => ({
      severity: f.severity || 'suggestion',
      category: f.category || 'best-practices',
      file: f.file || 'unknown',
      line: f.line || undefined,
      message: f.message || '',
      suggestion: f.suggestion || undefined,
    }));

    // Count by severity
    const counts = {
      critical: findings.filter((f) => f.severity === 'critical').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      suggestion: findings.filter((f) => f.severity === 'suggestion').length,
      praise: findings.filter((f) => f.severity === 'praise').length,
    };

    // Determine verdict
    let verdict: 'pass' | 'warn' | 'fail';
    if (counts.critical > 0) {
      verdict = 'fail';
    } else if (counts.warning > 2) {
      verdict = 'warn';
    } else {
      verdict = 'pass';
    }

    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));

    return {
      success: true,
      reviewId,
      timestamp: new Date().toISOString(),
      model: REVIEW_MODEL,
      duration,
      score,
      summary: parsed.summary || 'No summary provided.',
      findings,
      counts,
      verdict,
      rawResponse: includeRaw ? raw : undefined,
    };
  } catch (parseError: unknown) {
    logger.warn(`[Vesemir] Failed to parse review JSON: ${(parseError as Error).message}`);

    return {
      success: false,
      reviewId,
      timestamp: new Date().toISOString(),
      model: REVIEW_MODEL,
      duration,
      score: 0,
      summary: 'Failed to parse review response.',
      findings: [],
      counts: { critical: 0, warning: 0, suggestion: 0, praise: 0 },
      verdict: 'fail',
      rawResponse: raw,
      error: `Parse error: ${(parseError as Error).message}`,
    };
  }
}

/**
 * Review a git diff using Claude Sonnet (Vesemir agent)
 *
 * @param diff - The git diff to review
 * @param options - Review options
 * @returns ReviewResult
 */
export async function reviewDiff(diff: string, options: ReviewOptions = {}): Promise<ReviewResult> {
  const { maxTokens = 4096, timeout = 120000, includeRaw = false } = options;

  const reviewId = generateReviewId();
  const startTime = Date.now();

  logger.info(`[Vesemir] Starting review ${reviewId} (model: ${REVIEW_MODEL})`);

  if (!diff || diff.trim().length === 0) {
    return {
      success: true,
      reviewId,
      timestamp: new Date().toISOString(),
      model: REVIEW_MODEL,
      duration: 0,
      score: 100,
      summary: 'No changes to review.',
      findings: [],
      counts: { critical: 0, warning: 0, suggestion: 0, praise: 0 },
      verdict: 'pass',
    };
  }

  try {
    const prompt = buildReviewPrompt(diff, options);

    const result = await claudeGenerate(prompt, {
      model: REVIEW_MODEL,
      system: VESEMIR_SYSTEM_PROMPT,
      timeout,
      temperature: 0.3, // Low temperature for consistent, focused reviews
      maxTokens,
    });

    if (result.success === false) {
      logger.error(`[Vesemir] Claude API error: ${result.error}`);
      return {
        success: false,
        reviewId,
        timestamp: new Date().toISOString(),
        model: REVIEW_MODEL,
        duration: Date.now() - startTime,
        score: 0,
        summary: 'Review failed due to API error.',
        findings: [],
        counts: { critical: 0, warning: 0, suggestion: 0, praise: 0 },
        verdict: 'fail',
        error: result.error,
      };
    }

    const rawResponse = result.content || '';
    const reviewResult = parseReviewResponse(rawResponse, reviewId, startTime, includeRaw);

    logger.info(
      `[Vesemir] Review ${reviewId} complete: score=${reviewResult.score}, verdict=${reviewResult.verdict}, ` +
        `findings=${reviewResult.findings.length} (${reviewResult.counts.critical}C/${reviewResult.counts.warning}W/${reviewResult.counts.suggestion}S/${reviewResult.counts.praise}P), ` +
        `duration=${reviewResult.duration}ms`,
    );

    return reviewResult;
  } catch (error: unknown) {
    logger.error(`[Vesemir] Review ${reviewId} failed: ${(error as Error).message}`);

    return {
      success: false,
      reviewId,
      timestamp: new Date().toISOString(),
      model: REVIEW_MODEL,
      duration: Date.now() - startTime,
      score: 0,
      summary: 'Review failed due to unexpected error.',
      findings: [],
      counts: { critical: 0, warning: 0, suggestion: 0, praise: 0 },
      verdict: 'fail',
      error: (error as Error).message,
    };
  }
}

/**
 * Review specific files (not a diff, but full file contents)
 *
 * @param files - Map of filename → content
 * @param options - Review options
 * @returns ReviewResult
 */
export async function reviewFiles(
  files: Record<string, string>,
  options: ReviewOptions = {},
): Promise<ReviewResult> {
  // Convert files to a pseudo-diff format
  let diff = '';
  for (const [filename, content] of Object.entries(files)) {
    const lines = content.split('\n');
    diff += `diff --git a/${filename} b/${filename}\n`;
    diff += `--- a/${filename}\n`;
    diff += `+++ b/${filename}\n`;
    diff += `@@ -0,0 +1,${lines.length} @@\n`;
    diff += lines.map((line) => `+${line}`).join('\n');
    diff += '\n\n';
  }

  return reviewDiff(diff, options);
}

/**
 * Quick review — lenient strictness, fewer tokens, faster response
 *
 * @param diff - The git diff to review
 * @param context - Optional context string
 * @returns ReviewResult
 */
export async function quickReview(diff: string, context?: string): Promise<ReviewResult> {
  return reviewDiff(diff, {
    strictness: 'lenient',
    maxTokens: 2048,
    timeout: 60000,
    context,
  });
}

/**
 * Strict review — thorough analysis, higher standards
 *
 * @param diff - The git diff to review
 * @param context - Optional context string
 * @returns ReviewResult
 */
export async function strictReview(diff: string, context?: string): Promise<ReviewResult> {
  return reviewDiff(diff, {
    strictness: 'strict',
    maxTokens: 8192,
    timeout: 180000,
    context,
    focus: [
      Category.SECURITY,
      Category.CORRECTNESS,
      Category.ERROR_HANDLING,
      Category.ARCHITECTURE,
    ],
  });
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format a ReviewResult as a human-readable string
 *
 * @param result - The review result
 * @returns Formatted string
 */
export function formatReview(result: ReviewResult): string {
  const lines: string[] = [];

  // Header
  const verdictEmoji = { pass: '✅', warn: '⚠️', fail: '❌' }[result.verdict];
  lines.push(
    `${verdictEmoji} Vesemir Code Review — Score: ${result.score}/100 [${result.verdict.toUpperCase()}]`,
  );
  lines.push(`${'─'.repeat(70)}`);
  lines.push(`Review ID: ${result.reviewId}`);
  lines.push(`Model: ${result.model} | Duration: ${result.duration}ms`);
  lines.push('');
  lines.push(`📋 ${result.summary}`);
  lines.push('');

  // Findings by severity
  const severityOrder: SeverityLevel[] = ['critical', 'warning', 'suggestion', 'praise'];
  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    suggestion: '🔵',
    praise: '🟢',
  };

  for (const severity of severityOrder) {
    const findings = result.findings.filter((f) => f.severity === severity);
    if (findings.length === 0) continue;

    lines.push(`${severityEmoji[severity]} ${severity.toUpperCase()} (${findings.length})`);

    for (const finding of findings) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      lines.push(`  • [${finding.category}] ${location}`);
      lines.push(`    ${finding.message}`);
      if (finding.suggestion) {
        lines.push(`    → ${finding.suggestion}`);
      }
    }
    lines.push('');
  }

  // Summary counts
  lines.push(`${'─'.repeat(70)}`);
  lines.push(
    `Findings: ${result.counts.critical} critical, ${result.counts.warning} warnings, ` +
      `${result.counts.suggestion} suggestions, ${result.counts.praise} praise`,
  );

  return lines.join('\n');
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  REVIEW_MODEL,
  Severity,
  Category,
  reviewDiff,
  reviewFiles,
  quickReview,
  strictReview,
  formatReview,
};
