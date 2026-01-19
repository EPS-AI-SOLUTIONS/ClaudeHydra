/**
 * Category Detection Module
 *
 * Pure functions for detecting prompt categories/intents.
 * Uses pre-compiled patterns for performance.
 */

/**
 * @typedef {object} CategoryScore
 * @property {number} score - Matching score
 * @property {number} priority - Category priority
 * @property {string[]} matchedKeywords - Keywords that matched
 */

/**
 * @typedef {object} CategoryResult
 * @property {string} category - Detected category
 * @property {number} confidence - Confidence score (0-100)
 * @property {object} scores - All category scores
 * @property {string[]} matchedKeywords - Keywords that matched
 */

/**
 * Calculate score for a single category based on keyword matches
 * Pure function - no side effects
 *
 * @param {string} promptLower - Lowercased prompt text
 * @param {string[]} keywords - Category keywords
 * @param {Map<string, RegExp>} patterns - Compiled patterns for keywords
 * @returns {{ score: number, matchedKeywords: string[] }}
 */
export function calculateCategoryScore(promptLower, keywords, patterns) {
  let score = 0;
  const matchedKeywords = [];

  for (const keyword of keywords) {
    const pattern = patterns.get(keyword);
    if (pattern && pattern.test(promptLower)) {
      // Longer keywords are more specific, so they get higher scores
      score += keyword.length;
      matchedKeywords.push(keyword);
    }
  }

  return { score, matchedKeywords };
}

/**
 * Score all categories for a prompt
 * Pure function - no side effects
 *
 * @param {string} prompt - The prompt text
 * @param {object} categories - Categories configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled pattern registry
 * @returns {Map<string, CategoryScore>}
 */
export function scoreAllCategories(prompt, categories, patternRegistry) {
  const promptLower = prompt.toLowerCase();
  const scores = new Map();

  for (const [category, data] of Object.entries(categories)) {
    const categoryPatterns = patternRegistry.get(category);

    if (!categoryPatterns) {
      scores.set(category, { score: 0, priority: data.priority || 5, matchedKeywords: [] });
      continue;
    }

    const { score, matchedKeywords } = calculateCategoryScore(
      promptLower,
      data.keywords,
      categoryPatterns.patterns
    );

    scores.set(category, {
      score,
      priority: categoryPatterns.priority,
      matchedKeywords
    });
  }

  return scores;
}

/**
 * Select the best matching category from scores
 * Pure function - deterministic output for same input
 *
 * @param {Map<string, CategoryScore>} scores - Category scores
 * @param {string} defaultCategory - Default category if no matches
 * @returns {CategoryResult}
 */
export function selectBestCategory(scores, defaultCategory = 'general') {
  // Filter to categories with positive scores
  const positiveScores = Array.from(scores.entries())
    .filter(([_, v]) => v.score > 0)
    .map(([category, v]) => ({ category, ...v }));

  if (positiveScores.length === 0) {
    return {
      category: defaultCategory,
      confidence: 0,
      scores: Object.fromEntries(scores),
      matchedKeywords: []
    };
  }

  // Sort by score (desc), then by priority (desc)
  positiveScores.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.priority - a.priority;
  });

  const best = positiveScores[0];

  // Calculate confidence based on score gap to second place
  const maxScore = best.score;
  const secondScore = positiveScores[1]?.score || 0;
  const scoreGap = maxScore > 0 ? ((maxScore - secondScore) / maxScore) * 100 : 0;

  // Confidence is higher when there's a clear winner
  const confidence = Math.min(100, Math.round(50 + scoreGap / 2));

  return {
    category: best.category,
    confidence,
    scores: Object.fromEntries(scores),
    matchedKeywords: best.matchedKeywords
  };
}

/**
 * Detect the category of a prompt
 * Pure function combining scoring and selection
 *
 * @param {string} prompt - The prompt text
 * @param {object} categories - Categories configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled pattern registry
 * @param {string} defaultCategory - Default category if no matches
 * @returns {CategoryResult}
 */
export function detectCategory(prompt, categories, patternRegistry, defaultCategory = 'general') {
  if (!prompt || typeof prompt !== 'string') {
    return {
      category: defaultCategory,
      confidence: 0,
      scores: {},
      matchedKeywords: []
    };
  }

  const scores = scoreAllCategories(prompt, categories, patternRegistry);
  return selectBestCategory(scores, defaultCategory);
}

/**
 * Get category with simple string return (backward compatible)
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {object} categories - Categories configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled pattern registry
 * @returns {string} Category name
 */
export function getCategory(prompt, categories, patternRegistry) {
  return detectCategory(prompt, categories, patternRegistry).category;
}

/**
 * Check if a prompt belongs to a specific category
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {string} targetCategory - Category to check
 * @param {object} categories - Categories configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled pattern registry
 * @param {number} minConfidence - Minimum confidence threshold (0-100)
 * @returns {boolean}
 */
export function isCategory(prompt, targetCategory, categories, patternRegistry, minConfidence = 0) {
  const result = detectCategory(prompt, categories, patternRegistry);
  return result.category === targetCategory && result.confidence >= minConfidence;
}

/**
 * Get all categories that match a prompt above a threshold
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {object} categories - Categories configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled pattern registry
 * @param {number} minScore - Minimum score threshold
 * @returns {Array<{ category: string, score: number, matchedKeywords: string[] }>}
 */
export function getAllMatchingCategories(prompt, categories, patternRegistry, minScore = 1) {
  const scores = scoreAllCategories(prompt, categories, patternRegistry);

  return Array.from(scores.entries())
    .filter(([_, v]) => v.score >= minScore)
    .map(([category, v]) => ({
      category,
      score: v.score,
      matchedKeywords: v.matchedKeywords
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Create a category detector factory with pre-bound configuration
 * Returns functions with configuration pre-applied for convenience
 *
 * @param {object} categories - Categories configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled pattern registry
 * @returns {object} Object with bound detector functions
 */
export function createCategoryDetector(categories, patternRegistry) {
  return Object.freeze({
    detect: (prompt) => detectCategory(prompt, categories, patternRegistry),
    getCategory: (prompt) => getCategory(prompt, categories, patternRegistry),
    isCategory: (prompt, target, minConf) => isCategory(prompt, target, categories, patternRegistry, minConf),
    getAllMatching: (prompt, minScore) => getAllMatchingCategories(prompt, categories, patternRegistry, minScore)
  });
}
