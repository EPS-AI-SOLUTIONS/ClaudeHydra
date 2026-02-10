/**
 * Agentic Loop — response quality evaluation and iterative refinement.
 *
 * After Claude returns a response (potentially after using tools via SDK),
 * this module evaluates whether the response is complete and of sufficient
 * quality. If not, it builds a continuation prompt and signals to iterate.
 *
 * @module cli-unified/processing/AgenticLoop
 */

import { getLogger } from '../../utils/logger.js';

const logger = getLogger('AgenticLoop');

// ============================================================================
// Types
// ============================================================================

export interface AgenticConfig {
  /** Enable the quality loop (default: true) */
  enabled: boolean;
  /** Maximum number of quality iterations (default: 3) */
  maxIterations: number;
  /** Score threshold 0-10 — stop iterating above this (default: 7) */
  qualityThreshold: number;
  /** Log iteration details to console (default: false) */
  verbose: boolean;
}

export interface IterationContext {
  originalPrompt: string;
  iteration: number;
  previousResponses: Array<{
    response: string;
    score: number;
    reason: string;
    duration: number;
  }>;
  accumulatedKnowledge: string;
  totalDuration: number;
}

export interface IterationDecision {
  shouldContinue: boolean;
  reason: string;
  score: number;
  continuationPrompt?: string;
}

export interface ResponseMetadata {
  stopReason?: string;
  tokens?: number;
}

export const DEFAULT_AGENTIC_CONFIG: AgenticConfig = {
  enabled: true,
  maxIterations: 3,
  qualityThreshold: 7,
  verbose: false,
};

// ============================================================================
// Heuristic signals and weights
// ============================================================================

/** Patterns that indicate the response is a refusal — do NOT iterate on these */
const REFUSAL_PATTERNS = [
  /\bi (don't|do not|cannot|can't|am unable to) know\b/i,
  /\bi (don't|do not|cannot|can't) (help|assist|provide|answer)\b/i,
  /\bthat('s| is) (beyond|outside) my\b/i,
  /\bi('m| am) not (able|sure|certain)\b/i,
];

/** Patterns that indicate incompleteness */
const INCOMPLETE_PATTERNS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bplaceholder\b/i,
  /\bto be (determined|decided|implemented)\b/i,
  /\bwork in progress\b/i,
  /\bI('ll| will) (continue|elaborate|expand)\b/i,
  /\bstay tuned\b/i,
  /\bmore on this (later|soon)\b/i,
];

// ============================================================================
// AgenticLoop class
// ============================================================================

export class AgenticLoop {
  private config: AgenticConfig;

  constructor(config: Partial<AgenticConfig> = {}) {
    this.config = { ...DEFAULT_AGENTIC_CONFIG, ...config };
  }

  /**
   * Evaluate a response and decide whether to iterate.
   */
  evaluate(
    response: string,
    context: IterationContext,
    metadata: ResponseMetadata = {},
  ): IterationDecision {
    if (!response || response.trim().length === 0) {
      return {
        shouldContinue: true,
        reason: 'Empty response',
        score: 0,
        continuationPrompt: this.buildContinuationPrompt(context, 'empty'),
      };
    }

    let score = 7; // Base score — "acceptable"
    const signals: string[] = [];

    // ---- Strong signals ----

    // [CONTINUE] marker from agent prompt instructions
    if (response.includes('[CONTINUE]')) {
      score -= 5;
      signals.push('[CONTINUE] marker detected');
    }

    // [DONE] marker — strong completion signal
    if (response.includes('[DONE]')) {
      score += 3;
      signals.push('[DONE] marker detected');
    }

    // stopReason: max_tokens — response was cut off by token limit
    if (metadata.stopReason === 'max_tokens') {
      score -= 4;
      signals.push('Truncated by max_tokens');
    }

    // ---- Refusal detection (do NOT iterate) ----
    for (const pattern of REFUSAL_PATTERNS) {
      if (pattern.test(response)) {
        score += 3;
        signals.push('Refusal detected — stopping');
        break;
      }
    }

    // ---- Incompleteness signals ----
    for (const pattern of INCOMPLETE_PATTERNS) {
      if (pattern.test(response)) {
        score -= 2;
        signals.push(`Incompleteness signal: ${pattern.source}`);
        break; // Count only once
      }
    }

    // ---- Structural signals ----

    // Ends mid-sentence (no terminal punctuation)
    const trimmed = response
      .replace(/\[CONTINUE\]/g, '')
      .replace(/\[DONE\]/g, '')
      .trim();
    const lastChar = trimmed.slice(-1);
    if (trimmed.length > 50 && !/[.!?:;\])"'`\n]/.test(lastChar)) {
      score -= 2;
      signals.push('Ends mid-sentence');
    }

    // Very short response for a non-trivial question
    if (trimmed.length < 100 && context.originalPrompt.length > 50) {
      score -= 2;
      signals.push('Very short response');
    }

    // Longer response bonus
    if (trimmed.length > 500) {
      score += 1;
      signals.push('Substantial response length');
    }

    // ---- Clamp ----
    score = Math.max(0, Math.min(10, score));

    const reason = signals.join('; ') || 'No notable signals';
    const shouldContinue = score < this.config.qualityThreshold;

    logger.debug(`Evaluation: score=${score}, continue=${shouldContinue}`, {
      signals,
      iteration: context.iteration,
    });

    if (this.config.verbose) {
      console.log(`  [AgenticLoop] Score: ${score}/10 — ${reason}`);
    }

    return {
      shouldContinue,
      reason,
      score,
      continuationPrompt: shouldContinue
        ? this.buildContinuationPrompt(context, 'improve')
        : undefined,
    };
  }

  /**
   * Check whether iteration should continue (guard function).
   */
  shouldIterate(decision: IterationDecision, context: IterationContext): boolean {
    if (!this.config.enabled) return false;
    if (context.iteration >= this.config.maxIterations) return false;
    if (!decision.shouldContinue) return false;
    return true;
  }

  /**
   * Build a continuation/refinement prompt.
   */
  buildContinuationPrompt(
    context: IterationContext,
    strategy: 'empty' | 'continue' | 'improve' = 'improve',
  ): string {
    const lastResponse =
      context.previousResponses.length > 0
        ? context.previousResponses[context.previousResponses.length - 1].response
        : '';

    // Trim to last 1500 chars to save tokens
    const trimmedPrevious =
      lastResponse.length > 1500 ? `...${lastResponse.slice(-1500)}` : lastResponse;

    switch (strategy) {
      case 'empty':
        return [
          'Your previous response was empty. Please provide a complete answer to the original question.',
          '',
          `Original question: ${context.originalPrompt}`,
        ].join('\n');

      case 'continue':
        return [
          'Your previous response was cut off. Please continue from where you left off.',
          '',
          `--- Previous response (end) ---`,
          trimmedPrevious,
          `--- End ---`,
          '',
          'Continue your answer:',
        ].join('\n');
      default: {
        const lastScore =
          context.previousResponses.length > 0
            ? context.previousResponses[context.previousResponses.length - 1].score
            : 0;
        const lastReason =
          context.previousResponses.length > 0
            ? context.previousResponses[context.previousResponses.length - 1].reason
            : 'unknown';

        return [
          `Your previous answer was evaluated as ${lastScore}/10 quality.`,
          `Issues found: ${lastReason}`,
          '',
          'Please provide an improved, more complete response that addresses these issues.',
          '',
          `Original question: ${context.originalPrompt}`,
          '',
          `--- Your previous answer (end) ---`,
          trimmedPrevious,
          `--- End ---`,
          '',
          'Improved answer:',
        ].join('\n');
      }
    }
  }

  /**
   * Merge responses from multiple iterations into a coherent output.
   *
   * Strategy:
   * - If the last response has a higher score than previous ones → use it as the final answer
   * - If scores are similar and responses look like continuations → concatenate
   */
  mergeResponses(responses: Array<{ response: string; score: number }>): string {
    if (responses.length === 0) return '';
    if (responses.length === 1) return this.cleanMarkers(responses[0].response);

    const last = responses[responses.length - 1];
    const secondLast = responses[responses.length - 2];

    // If the latest response is substantially better, just use it
    if (last.score > secondLast.score + 1) {
      return this.cleanMarkers(last.response);
    }

    // If the latest looks like a continuation (starts without a heading/intro)
    const startsLikeContination = /^[a-z\d\-*•]/.test(last.response.trim());
    if (startsLikeContination) {
      const combined = responses.map((r) => this.cleanMarkers(r.response)).join('\n\n');
      return combined;
    }

    // Default: use the latest response (it presumably incorporated previous context)
    return this.cleanMarkers(last.response);
  }

  /**
   * Strip [CONTINUE] and [DONE] markers from the response.
   */
  private cleanMarkers(text: string): string {
    return text
      .replace(/\[CONTINUE\]/g, '')
      .replace(/\[DONE\]/g, '')
      .trim();
  }
}

export default AgenticLoop;
