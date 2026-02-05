/**
 * Clarity Analyzer Module
 *
 * Pure functions for analyzing and scoring prompt clarity.
 * All functions are side-effect free and deterministic.
 */

import { STATIC_PATTERNS, matchesWord } from './patterns.js';

/**
 * @typedef {object} ClarityResult
 * @property {number} score - Clarity score (0-100)
 * @property {string} quality - Quality level string
 * @property {string[]} issues - List of identified issues
 * @property {string[]} suggestions - List of improvement suggestions
 */

/**
 * @typedef {object} LengthAnalysis
 * @property {number} scoreDelta - Score adjustment
 * @property {string|null} issue - Issue description if any
 * @property {string|null} suggestion - Suggestion if any
 */

/**
 * Analyze prompt length and return score adjustment
 * Pure function
 *
 * @param {number} length - Prompt length in characters
 * @returns {LengthAnalysis}
 */
export function analyzeLengthScore(length) {
  if (length < 10) {
    return {
      scoreDelta: -30,
      issue: 'Too short',
      suggestion: 'Add more context or details'
    };
  }

  if (length < 30) {
    return {
      scoreDelta: -15,
      issue: 'Brief prompt',
      suggestion: 'Consider adding specifics'
    };
  }

  return {
    scoreDelta: 0,
    issue: null,
    suggestion: null
  };
}

/**
 * Count vague words in prompt and calculate score penalty
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {string[]} vagueWords - List of vague words to check
 * @param {Map<string, RegExp>} patterns - Compiled patterns (optional)
 * @returns {{ scoreDelta: number, issues: string[] }}
 */
export function analyzeVagueWords(prompt, vagueWords, patterns = null) {
  let scoreDelta = 0;
  const issues = [];

  for (const word of vagueWords) {
    const matches = patterns
      ? patterns.get(word)?.test(prompt)
      : matchesWord(prompt, word);

    if (matches) {
      scoreDelta -= 5;
      issues.push(`Vague term: '${word}'`);
    }
  }

  return { scoreDelta, issues };
}

/**
 * Check for specificity indicators and calculate score bonus
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {string[]} indicators - List of specificity indicators
 * @param {Map<string, RegExp>} patterns - Compiled patterns (optional)
 * @returns {{ scoreDelta: number, count: number }}
 */
export function analyzeSpecificityIndicators(prompt, indicators, patterns = null) {
  let scoreDelta = 0;
  let count = 0;

  for (const indicator of indicators) {
    const matches = patterns
      ? patterns.get(indicator)?.test(prompt)
      : matchesWord(prompt, indicator);

    if (matches) {
      scoreDelta += 3;
      count++;
    }
  }

  return { scoreDelta, count };
}

/**
 * Check for context indicators in prompt
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @returns {{ hasContext: boolean, suggestion: string | null }}
 */
export function analyzeContext(prompt) {
  const hasContext = STATIC_PATTERNS.contextIndicators.test(prompt);

  return {
    hasContext,
    suggestion: hasContext ? null : 'Add context (for what purpose, using what)'
  };
}

/**
 * Check for format specification in prompt
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @returns {{ hasFormat: boolean, suggestion: string | null }}
 */
export function analyzeFormatRequest(prompt) {
  const hasFormat = STATIC_PATTERNS.formatRequest.test(prompt);

  return {
    hasFormat,
    suggestion: hasFormat ? null : 'Consider specifying desired output format'
  };
}

/**
 * Normalize score to 0-100 range
 * Pure function
 *
 * @param {number} score - Raw score
 * @returns {number} Normalized score
 */
export function normalizeScore(score) {
  return Math.max(0, Math.min(100, score));
}

/**
 * Get quality level string from score
 * Pure function
 *
 * @param {number} score - Normalized score (0-100)
 * @returns {string} Quality level
 */
export function getQualityLevel(score) {
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs improvement';
  return 'Poor';
}

/**
 * Analyze prompt clarity - main function
 * Pure function combining all analysis steps
 *
 * @param {string} prompt - The prompt text
 * @param {object} options - Analysis options
 * @param {string[]} options.vagueWords - List of vague words
 * @param {string[]} options.specificIndicators - List of specificity indicators
 * @param {Map<string, RegExp>} options.vaguePatterns - Pre-compiled vague word patterns
 * @param {Map<string, RegExp>} options.indicatorPatterns - Pre-compiled indicator patterns
 * @returns {ClarityResult}
 */
export function analyzeClarity(prompt, options = {}) {
  const {
    vagueWords = [],
    specificIndicators = [],
    vaguePatterns = null,
    indicatorPatterns = null
  } = options;

  let score = 100;
  const issues = [];
  const suggestions = [];

  // Length analysis
  const lengthResult = analyzeLengthScore(prompt.length);
  score += lengthResult.scoreDelta;
  if (lengthResult.issue) issues.push(lengthResult.issue);
  if (lengthResult.suggestion) suggestions.push(lengthResult.suggestion);

  // Vague words analysis
  const vagueResult = analyzeVagueWords(prompt, vagueWords, vaguePatterns);
  score += vagueResult.scoreDelta;
  issues.push(...vagueResult.issues);

  // Specificity indicators analysis
  const specificityResult = analyzeSpecificityIndicators(
    prompt,
    specificIndicators,
    indicatorPatterns
  );
  score += specificityResult.scoreDelta;

  // Context analysis
  const contextResult = analyzeContext(prompt);
  if (!contextResult.hasContext) {
    score -= 10;
    suggestions.push(contextResult.suggestion);
  }

  // Format analysis
  const formatResult = analyzeFormatRequest(prompt);
  if (formatResult.suggestion) {
    suggestions.push(formatResult.suggestion);
  }

  // Normalize and determine quality
  const normalizedScore = normalizeScore(score);
  const quality = getQualityLevel(normalizedScore);

  return {
    score: normalizedScore,
    quality,
    issues,
    suggestions
  };
}

/**
 * Quick clarity check - returns just the score
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {object} options - Analysis options
 * @returns {number} Clarity score (0-100)
 */
export function getQuickClarityScore(prompt, options = {}) {
  return analyzeClarity(prompt, options).score;
}

/**
 * Check if prompt needs improvement based on threshold
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {number} threshold - Score threshold (default: 60)
 * @param {object} options - Analysis options
 * @returns {boolean}
 */
export function needsImprovement(prompt, threshold = 60, options = {}) {
  return analyzeClarity(prompt, options).score < threshold;
}

/**
 * Get improvement priority based on issues
 * Pure function
 *
 * @param {ClarityResult} clarityResult - Result from analyzeClarity
 * @returns {'high' | 'medium' | 'low' | 'none'}
 */
export function getImprovementPriority(clarityResult) {
  if (clarityResult.score < 40) return 'high';
  if (clarityResult.score < 60) return 'medium';
  if (clarityResult.suggestions.length > 0) return 'low';
  return 'none';
}

/**
 * Create a clarity analyzer factory with pre-bound configuration
 * Returns functions with configuration pre-applied
 *
 * @param {object} config - Configuration with vagueWords, specificIndicators
 * @param {object} patterns - Pre-compiled pattern registry
 * @returns {object} Object with bound analyzer functions
 */
export function createClarityAnalyzer(config, patterns = {}) {
  const options = {
    vagueWords: config.vagueWords || [],
    specificIndicators: config.specificIndicators || [],
    vaguePatterns: patterns.vagueWords || null,
    indicatorPatterns: patterns.specificIndicators || null
  };

  return Object.freeze({
    analyze: (prompt) => analyzeClarity(prompt, options),
    getScore: (prompt) => getQuickClarityScore(prompt, options),
    needsImprovement: (prompt, threshold) => needsImprovement(prompt, threshold, options),
    getQualityLevel: (score) => getQualityLevel(score),
    getPriority: (result) => getImprovementPriority(result)
  });
}
