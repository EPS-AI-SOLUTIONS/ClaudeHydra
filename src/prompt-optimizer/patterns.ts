/**
 * Compiled Regex Patterns for Prompt Optimizer
 *
 * Pre-compiles all regex patterns at module load time for better performance.
 * Patterns are compiled once and reused across all function calls.
 */

/**
 * Cache for dynamically compiled patterns
 * @type {Map<string, RegExp>}
 */
const patternCache = new Map();

/**
 * Pre-compiled static patterns for common checks
 */
export const STATIC_PATTERNS = Object.freeze({
  // Context detection patterns
  contextIndicators: /\b(for|to|because|since|using|with|in)\s+\w+/i,

  // Format request patterns
  formatRequest: /\b(format|output|return|show|display|as|like)\b/i,

  // Code-related patterns
  codeMarkers: /```/,
  errorHandling: /error|exception|try|catch|handle|throw/i,
  inputValidation: /valid|check|verify|sanitize|input/i,

  // API-related patterns
  apiAuth: /auth|token|key|bearer/i,
  apiResponse: /status|response|error code/i,

  // Database-related patterns
  dbPerformance: /index|performance|optimize/i,
  dbTransaction: /transaction|rollback|commit/i,

  // Security-related patterns
  securityStandards: /owasp|best practice/i,

  // Testing-related patterns
  testingEdgeCases: /edge case|boundary|negative/i,
  testingMocks: /mock|stub|fixture/i,

  // Architecture-related patterns
  scaleRequirements: /scale|load|traffic/i,

  // DevOps-related patterns
  rollbackStrategy: /rollback|revert|recovery/i,

  // Format patterns for auto-fix
  codeFormat: /format|output|return as|show as|```/i,
  apiJson: /json|response|status|format/i,
  apiErrors: /error|status code|exception/i,
  dbOptimize: /index|optim|perform/i,
  testEdge: /edge|boundary|negative|corner/i,
  securityGuidelines: /owasp|best practice|guideline/i,

  // Sentiment detection
  problemSolving: /error|bug/i,

  // Word boundary for single words
  wordBoundary: /\b/
});

/**
 * Escape special regex characters in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a word boundary pattern for a term
 * @param {string} term - Term to create pattern for
 * @param {string} flags - Regex flags (default: 'i')
 * @returns {RegExp} Compiled regex pattern
 */
export function createWordBoundaryPattern(term, flags = 'i') {
  const cacheKey = `wb:${term}:${flags}`;

  if (patternCache.has(cacheKey)) {
    return patternCache.get(cacheKey);
  }

  const escaped = escapeRegex(term);
  const pattern = new RegExp(`\\b${escaped}\\b`, flags);
  patternCache.set(cacheKey, pattern);

  return pattern;
}

/**
 * Batch compile word boundary patterns for multiple terms
 * @param {string[]} terms - Array of terms
 * @param {string} flags - Regex flags
 * @returns {Map<string, RegExp>} Map of term to pattern
 */
export function compileTermPatterns(terms, flags = 'i') {
  const patterns = new Map();

  for (const term of terms) {
    patterns.set(term, createWordBoundaryPattern(term, flags));
  }

  return patterns;
}

/**
 * Create a combined pattern that matches any of the given terms
 * @param {string[]} terms - Array of terms
 * @param {string} flags - Regex flags
 * @returns {RegExp | null} Combined pattern or null if no terms
 */
export function createCombinedPattern(terms, flags = 'i') {
  if (!terms || terms.length === 0) return null;

  const cacheKey = `combined:${terms.sort().join('|')}:${flags}`;

  if (patternCache.has(cacheKey)) {
    return patternCache.get(cacheKey);
  }

  const escaped = terms.map(escapeRegex);
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, flags);
  patternCache.set(cacheKey, pattern);

  return pattern;
}

/**
 * Test if a string matches a word boundary pattern
 * @param {string} text - Text to search
 * @param {string} term - Term to find
 * @returns {boolean} True if term found
 */
export function matchesWord(text, term) {
  const pattern = createWordBoundaryPattern(term);
  return pattern.test(text);
}

/**
 * Count matches of a term in text
 * @param {string} text - Text to search
 * @param {string} term - Term to count
 * @returns {number} Number of matches
 */
export function countWordMatches(text, term) {
  const pattern = createWordBoundaryPattern(term, 'gi');
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Find all matching terms from a list
 * @param {string} text - Text to search
 * @param {string[]} terms - Terms to find
 * @returns {string[]} Array of matching terms
 */
export function findMatchingTerms(text, terms) {
  const textLower = text.toLowerCase();
  return terms.filter(term => matchesWord(textLower, term.toLowerCase()));
}

/**
 * Create pattern registry from config
 * Pre-compiles all patterns from configuration for efficient reuse
 * @param {object} config - Configuration object
 * @returns {object} Compiled pattern registry
 */
export function createPatternRegistry(config) {
  const registry = {
    vagueWords: null,
    specificIndicators: null,
    categoryKeywords: new Map(),
    languageKeywords: new Map()
  };

  // Compile vague words pattern
  if (config.vagueWords?.length > 0) {
    registry.vagueWords = compileTermPatterns(config.vagueWords);
    registry.vagueWordsCombined = createCombinedPattern(config.vagueWords);
  }

  // Compile specific indicators pattern
  if (config.specificIndicators?.length > 0) {
    registry.specificIndicators = compileTermPatterns(config.specificIndicators);
    registry.specificIndicatorsCombined = createCombinedPattern(config.specificIndicators);
  }

  // Compile category keyword patterns
  if (config.categories) {
    for (const [category, data] of Object.entries(config.categories)) {
      if (data.keywords?.length > 0) {
        registry.categoryKeywords.set(category, {
          patterns: compileTermPatterns(data.keywords),
          combined: createCombinedPattern(data.keywords),
          priority: data.priority || 5
        });
      }
    }
  }

  // Compile language keyword patterns
  if (config.languages) {
    for (const [lang, keywords] of Object.entries(config.languages)) {
      if (keywords?.length > 0) {
        registry.languageKeywords.set(lang, {
          patterns: compileTermPatterns(keywords),
          combined: createCombinedPattern(keywords)
        });
      }
    }
  }

  return Object.freeze(registry);
}

/**
 * Get pattern cache statistics
 * @returns {{ size: number, entries: string[] }}
 */
export function getPatternCacheStats() {
  return {
    size: patternCache.size,
    entries: Array.from(patternCache.keys())
  };
}

/**
 * Clear pattern cache (useful for testing or config reload)
 */
export function clearPatternCache() {
  patternCache.clear();
}
