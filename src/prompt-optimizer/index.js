/**
 * HYDRA Prompt Optimizer - Modular Architecture
 *
 * Main entry point that composes all submodules:
 * - config-schema.js: Configuration validation
 * - patterns.js: Compiled regex patterns
 * - category-detector.js: Intent/category detection
 * - clarity-analyzer.js: Prompt clarity analysis
 * - language-detector.js: Programming language detection
 * - analysis-cache.js: LRU caching for results
 * - enhancer.js: Prompt enhancement logic
 *
 * Features:
 * - Intent detection (code, analysis, question, creative, etc.)
 * - Clarity scoring and enhancement
 * - Model-specific optimizations
 * - Language detection for code prompts
 * - Category-based enhancements
 * - Configurable caching with TTL
 * - Pure functions for testability
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Submodule imports
import { loadConfig, freezeConfig, DEFAULT_CONFIG, validateConfig } from './config-schema.js';
import { createPatternRegistry, clearPatternCache, getPatternCacheStats } from './patterns.js';
import { createCategoryDetector, detectCategory, getCategory } from './category-detector.js';
import { createClarityAnalyzer, analyzeClarity, getQualityLevel } from './clarity-analyzer.js';
import { createLanguageDetector, detectLanguage, getLanguage, DEFAULT_CONTEXT_CLUES } from './language-detector.js';
import { createAnalysisCaches, getGlobalCache, resetGlobalCache } from './analysis-cache.js';
import { createEnhancer, enhancePrompt, applyCategoryAutoFix } from './enhancer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '..', 'prompt-optimizer-gemini.json');

// ============================================================================
// Module State (initialized lazily)
// ============================================================================

let config = null;
let patternRegistry = null;
let caches = null;
let initialized = false;

/**
 * Initialize the optimizer with configuration
 * @param {object} userConfig - Optional custom configuration
 * @param {object} options - Initialization options
 */
export function initialize(userConfig = null, options = {}) {
  const { useCache = true, strict = false } = options;

  // Load config from file or use provided
  let rawConfig = userConfig;
  if (!rawConfig) {
    try {
      rawConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (_error) {
      rawConfig = {};
    }
  }

  // Validate and merge with defaults
  config = freezeConfig(loadConfig(rawConfig, { strict }));

  // Compile regex patterns
  patternRegistry = createPatternRegistry(config);

  // Initialize caches
  if (useCache) {
    caches = createAnalysisCaches({
      categoryMaxSize: config.settings?.maxCacheSize || 500,
      clarityMaxSize: config.settings?.maxCacheSize || 500,
      languageMaxSize: 300,
      fullMaxSize: 200,
      ttlMs: config.settings?.cacheTtlMs || 300000
    });
  }

  initialized = true;
}

/**
 * Ensure module is initialized
 */
function ensureInitialized() {
  if (!initialized) {
    initialize();
  }
}

/**
 * Get current configuration
 * @returns {object}
 */
export function getConfig() {
  ensureInitialized();
  return config;
}

// ============================================================================
// Core API Functions (Backward Compatible)
// ============================================================================

/**
 * Detect the category/intent of a prompt
 * @param {string} prompt - The prompt text
 * @returns {string} Category name
 */
export function getPromptCategory(prompt) {
  ensureInitialized();

  // Check cache first
  if (caches) {
    const cacheKey = caches.category.generateKey(prompt, 'cat');
    const cached = caches.category.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = getCategory(prompt, config.categories, patternRegistry.categoryKeywords);
    caches.category.set(cacheKey, result);
    return result;
  }

  return getCategory(prompt, config.categories, patternRegistry.categoryKeywords);
}

/**
 * Score prompt clarity (0-100)
 * @param {string} prompt - The prompt text
 * @returns {{ score: number, issues: string[], suggestions: string[], quality: string }}
 */
export function getPromptClarity(prompt) {
  ensureInitialized();

  const options = {
    vagueWords: config.vagueWords || [],
    specificIndicators: config.specificIndicators || [],
    vaguePatterns: patternRegistry.vagueWords,
    indicatorPatterns: patternRegistry.specificIndicators
  };

  // Check cache first
  if (caches) {
    const cacheKey = caches.clarity.generateKey(prompt, 'clarity');
    const cached = caches.clarity.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = analyzeClarity(prompt, options);
    caches.clarity.set(cacheKey, result);
    return result;
  }

  return analyzeClarity(prompt, options);
}

/**
 * Detect programming language mentioned in prompt
 * @param {string} prompt - The prompt text
 * @returns {string | null} Language name or null
 */
export function getPromptLanguage(prompt) {
  ensureInitialized();

  // Check cache first
  if (caches) {
    const cacheKey = caches.language.generateKey(prompt, 'lang');
    const cached = caches.language.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = getLanguage(prompt, config.languages || {}, patternRegistry.languageKeywords);
    caches.language.set(cacheKey, result);
    return result;
  }

  return getLanguage(prompt, config.languages || {}, patternRegistry.languageKeywords);
}

/**
 * Get model-specific optimizations
 * @param {string} model - Model name
 * @returns {object} Model optimization options
 */
export function getModelOptimization(model) {
  ensureInitialized();

  const modelLower = model.toLowerCase();

  for (const [key, opts] of Object.entries(config.modelOptimizations || {})) {
    if (modelLower.includes(key.toLowerCase())) {
      return opts;
    }
  }

  return { maxTokens: 2048, style: 'balanced', prefix: '', temperature: 0.5 };
}

/**
 * Main optimization function - analyzes and enhances a prompt
 * @param {string} prompt - The prompt to optimize
 * @param {object} options - Optimization options
 * @returns {object} Optimization result
 */
export function optimizePrompt(prompt, options = {}) {
  ensureInitialized();

  const model = options.model || 'llama3.2:3b';
  let category = options.category || 'auto';
  const addExamples = options.addExamples || false;

  // Check full result cache
  if (caches && !options.skipCache) {
    const cacheKey = caches.full.generateKey(`${prompt}:${model}:${category}:${addExamples}`, 'opt');
    const cached = caches.full.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  // Detect category if auto
  if (category === 'auto') {
    category = getPromptCategory(prompt);
  }

  // Analyze clarity
  const clarity = getPromptClarity(prompt);

  // Detect language
  const language = getPromptLanguage(prompt);

  // Get model optimization
  const modelOpt = getModelOptimization(model);

  // Build analysis object
  const analysis = {
    category,
    language,
    clarityScore: clarity.score
  };

  // Enhance prompt
  const enhanceResult = enhancePrompt(prompt, analysis, config, {
    addExamples,
    model
  });

  const result = {
    originalPrompt: prompt,
    optimizedPrompt: enhanceResult.prompt,
    category,
    language,
    clarityScore: clarity.score,
    clarityQuality: clarity.quality,
    clarityIssues: clarity.issues,
    claritySuggestions: clarity.suggestions,
    enhancements: enhanceResult.appliedEnhancements,
    wasEnhanced: enhanceResult.wasEnhanced,
    modelOptimization: modelOpt
  };

  // Cache the result
  if (caches && !options.skipCache) {
    const cacheKey = caches.full.generateKey(`${prompt}:${model}:${category}:${addExamples}`, 'opt');
    caches.full.set(cacheKey, result);
  }

  return result;
}

/**
 * Quick function to get an improved prompt
 * @param {string} prompt - The prompt
 * @param {string} model - Model name
 * @returns {string} Optimized prompt
 */
export function getBetterPrompt(prompt, model = 'llama3.2:3b') {
  const result = optimizePrompt(prompt, { model });
  return result.optimizedPrompt;
}

/**
 * Test prompt quality and return detailed report
 * @param {string} prompt - The prompt to test
 * @returns {object} Quality report
 */
export function testPromptQuality(prompt) {
  const clarity = getPromptClarity(prompt);
  const category = getPromptCategory(prompt);
  const language = getPromptLanguage(prompt);

  return {
    prompt: prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt,
    score: clarity.score,
    quality: clarity.quality,
    category,
    language,
    issues: clarity.issues,
    suggestions: clarity.suggestions,
    recommendation:
      clarity.score >= 60
        ? 'Prompt is acceptable'
        : 'Consider improving the prompt using suggestions'
  };
}

/**
 * Optimize multiple prompts
 * @param {string[]} prompts - Array of prompts
 * @param {object} options - Optimization options
 * @returns {object[]} Array of optimization results
 */
export function optimizePromptBatch(prompts, options = {}) {
  return prompts.map((prompt) => optimizePrompt(prompt, options));
}

/**
 * Analyze a prompt without enhancing it
 * @param {string} prompt - The prompt to analyze
 * @returns {object} Analysis result
 */
export function analyzePrompt(prompt) {
  return {
    length: prompt.length,
    wordCount: prompt.split(/\s+/).length,
    category: getPromptCategory(prompt),
    language: getPromptLanguage(prompt),
    clarity: getPromptClarity(prompt),
    hasQuestion: prompt.includes('?'),
    hasCodeMarkers: /```/.test(prompt),
    sentiment:
      prompt.toLowerCase().includes('error') || prompt.toLowerCase().includes('bug')
        ? 'problem-solving'
        : 'neutral'
  };
}

/**
 * Get optimization suggestions without applying them
 * @param {string} prompt - The prompt
 * @param {string} model - Model name
 * @returns {object} Suggestions
 */
export function getSuggestions(prompt, model = 'llama3.2:3b') {
  const analysis = analyzePrompt(prompt);
  const modelOpt = getModelOptimization(model);
  const suggestions = [...analysis.clarity.suggestions];

  // Category-specific suggestions
  const categoryData = config.categories?.[analysis.category];
  if (categoryData) {
    if (analysis.category === 'code' && !analysis.language) {
      suggestions.push('Specify the programming language');
    }
    if (analysis.category === 'task' && !prompt.toLowerCase().includes('step')) {
      suggestions.push('Ask for step-by-step instructions');
    }
  }

  // Model-specific suggestions
  if (modelOpt.style === 'concise' && prompt.length > 200) {
    suggestions.push('Prompt may be too long for this model');
  }

  // Smart suggestions
  const smartSuggestions = getSmartSuggestions(prompt, analysis);
  suggestions.push(...smartSuggestions);

  return {
    prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
    category: analysis.category,
    clarityScore: analysis.clarity.score,
    suggestions: [...new Set(suggestions)],
    wouldEnhance: analysis.clarity.score < 60 || suggestions.length > 0
  };
}

/**
 * Get smart suggestions based on advanced pattern matching
 * @param {string} prompt - The prompt
 * @param {object} analysis - Analysis result (optional)
 * @returns {string[]} Smart suggestions
 */
export function getSmartSuggestions(prompt, analysis = null) {
  if (!analysis) analysis = analyzePrompt(prompt);
  const suggestions = [];

  // Code suggestions
  if (analysis.category === 'code') {
    if (!/error|exception|try|catch|handle|throw/i.test(prompt)) {
      suggestions.push('Consider specifying error handling requirements');
    }
    if (!/valid|check|verify|sanitize|input/i.test(prompt)) {
      suggestions.push('Consider specifying input validation requirements');
    }
  }

  // API suggestions
  if (analysis.category === 'api') {
    if (!/auth|token|key|bearer/i.test(prompt)) {
      suggestions.push('Specify authentication method if needed');
    }
    if (!/status|response|error code/i.test(prompt)) {
      suggestions.push('Specify expected HTTP status codes');
    }
  }

  // Database suggestions
  if (analysis.category === 'database') {
    if (!/index|performance|optimize/i.test(prompt)) {
      suggestions.push('Consider indexing and performance implications');
    }
    if (!/transaction|rollback|commit/i.test(prompt)) {
      suggestions.push('Specify transaction handling if applicable');
    }
  }

  // Security suggestions
  if (analysis.category === 'security') {
    if (!/owasp|best practice/i.test(prompt)) {
      suggestions.push('Reference OWASP or specific security standards');
    }
  }

  // Testing suggestions
  if (analysis.category === 'testing') {
    if (!/edge case|boundary|negative/i.test(prompt)) {
      suggestions.push('Include edge cases and negative test scenarios');
    }
    if (!/mock|stub|fixture/i.test(prompt)) {
      suggestions.push('Specify mocking requirements for dependencies');
    }
  }

  // Architecture suggestions
  if (analysis.category === 'architecture') {
    if (!/scale|load|traffic/i.test(prompt)) {
      suggestions.push('Specify expected scale and load requirements');
    }
  }

  return suggestions;
}

/**
 * Get auto-completions for partial prompts
 * @param {string} partialPrompt - Partial prompt text
 * @returns {object} Completions
 */
export function getAutoCompletions(partialPrompt) {
  ensureInitialized();

  const autoCompletions = config.smartSuggestions?.autoCompletions || {};
  const completions = [];
  const words = partialPrompt.toLowerCase().split(/\s+/);
  const lastWord = words[words.length - 1];

  for (const [keyword, templates] of Object.entries(autoCompletions)) {
    if (keyword.startsWith(lastWord) || lastWord.includes(keyword)) {
      completions.push(...templates);
    }
  }

  return {
    partial: partialPrompt,
    completions: completions.slice(0, 5),
    hasCompletions: completions.length > 0
  };
}

/**
 * Detect language from code context clues
 * @param {string} prompt - The prompt
 * @returns {string | null} Detected language
 */
export function detectLanguageFromContext(prompt) {
  ensureInitialized();

  const contextClues = config.smartSuggestions?.contextClues || DEFAULT_CONTEXT_CLUES;

  for (const [lang, clues] of Object.entries(contextClues)) {
    for (const clue of clues) {
      if (prompt.includes(clue)) {
        return lang;
      }
    }
  }

  return getPromptLanguage(prompt);
}

/**
 * Get prompt template for category
 * @param {string} category - Category name
 * @param {string} variant - Template variant
 * @returns {string | null} Template or null
 */
export function getPromptTemplate(category, variant = 'basic') {
  ensureInitialized();
  const templates = config.promptTemplates || {};
  const categoryTemplates = templates[category] || {};
  return categoryTemplates[variant] || null;
}

/**
 * Apply auto-fix to prompt based on smart suggestions
 * @param {string} prompt - The prompt
 * @param {object} options - Options
 * @returns {object} Auto-fix result
 */
export function autoFixPrompt(prompt, _options = {}) {
  ensureInitialized();

  const analysis = analyzePrompt(prompt);
  let fixed = prompt;
  const appliedFixes = [];

  // Auto-detect language if missing for code
  if (analysis.category === 'code' && !analysis.language) {
    const detectedLang = detectLanguageFromContext(prompt);
    if (detectedLang && !prompt.toLowerCase().includes(detectedLang)) {
      fixed = `[${detectedLang}] ${fixed}`;
      appliedFixes.push(`Added language tag: ${detectedLang}`);
    }
  }

  // Apply category-specific fixes
  const fixResult = applyCategoryAutoFix(fixed, analysis.category);
  fixed = fixResult.prompt;
  appliedFixes.push(...fixResult.fixes);

  return {
    original: prompt,
    fixed: fixed.trim(),
    appliedFixes,
    wasFixed: appliedFixes.length > 0,
    analysis
  };
}

// ============================================================================
// Advanced API (New Functionality)
// ============================================================================

/**
 * Get detailed category detection result
 * @param {string} prompt - The prompt
 * @returns {object} Detailed category result with confidence
 */
export function detectCategoryDetailed(prompt) {
  ensureInitialized();
  return detectCategory(prompt, config.categories, patternRegistry.categoryKeywords);
}

/**
 * Get detailed language detection result
 * @param {string} prompt - The prompt
 * @returns {object} Detailed language result with confidence
 */
export function detectLanguageDetailed(prompt) {
  ensureInitialized();
  return detectLanguage(
    prompt,
    config.languages || {},
    patternRegistry.languageKeywords,
    config.smartSuggestions?.contextClues || DEFAULT_CONTEXT_CLUES
  );
}

/**
 * Create a custom optimizer instance with specific configuration
 * @param {object} customConfig - Custom configuration
 * @returns {object} Optimizer instance
 */
export function createOptimizer(customConfig) {
  const cfg = freezeConfig(loadConfig(customConfig));
  const patterns = createPatternRegistry(cfg);
  const localCaches = createAnalysisCaches({
    ttlMs: cfg.settings?.cacheTtlMs || 300000
  });

  const categoryDetector = createCategoryDetector(cfg.categories, patterns.categoryKeywords);
  const clarityAnalyzer = createClarityAnalyzer(cfg, patterns);
  const languageDetector = createLanguageDetector(
    cfg.languages || {},
    patterns.languageKeywords,
    cfg.smartSuggestions?.contextClues
  );
  const enhancer = createEnhancer(cfg);

  return Object.freeze({
    config: cfg,
    patterns,
    caches: localCaches,

    getCategory: categoryDetector.getCategory,
    detectCategory: categoryDetector.detect,
    analyzeClarity: clarityAnalyzer.analyze,
    getClarityScore: clarityAnalyzer.getScore,
    detectLanguage: languageDetector.detect,
    getLanguage: languageDetector.getLanguage,
    enhance: enhancer.enhance,

    optimize(prompt, options = {}) {
      const category = options.category === 'auto'
        ? categoryDetector.getCategory(prompt)
        : (options.category || categoryDetector.getCategory(prompt));
      const clarity = clarityAnalyzer.analyze(prompt);
      const language = languageDetector.getLanguage(prompt);

      const analysis = { category, language, clarityScore: clarity.score };
      const enhanced = enhancer.enhance(prompt, analysis, options);

      return {
        originalPrompt: prompt,
        optimizedPrompt: enhanced.prompt,
        category,
        language,
        clarityScore: clarity.score,
        clarityQuality: clarity.quality,
        clarityIssues: clarity.issues,
        claritySuggestions: clarity.suggestions,
        enhancements: enhanced.appliedEnhancements,
        wasEnhanced: enhanced.wasEnhanced
      };
    },

    getCacheStats: () => localCaches.getAllStats(),
    clearCaches: () => localCaches.clearAll()
  });
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
export function getCacheStats() {
  ensureInitialized();
  return caches ? caches.getAllStats() : null;
}

/**
 * Clear all caches
 */
export function clearCaches() {
  if (caches) {
    caches.clearAll();
  }
  clearPatternCache();
}

/**
 * Get pattern cache statistics
 * @returns {object} Pattern cache stats
 */
export function getPatternStats() {
  return getPatternCacheStats();
}

/**
 * Reset module state (useful for testing)
 */
export function reset() {
  config = null;
  patternRegistry = null;
  caches = null;
  initialized = false;
  clearPatternCache();
  resetGlobalCache();
}

// ============================================================================
// Re-exports for advanced usage
// ============================================================================

export {
  // Config
  validateConfig,
  DEFAULT_CONFIG,

  // Patterns
  createPatternRegistry,

  // Category
  createCategoryDetector,

  // Clarity
  createClarityAnalyzer,
  getQualityLevel,

  // Language
  createLanguageDetector,
  DEFAULT_CONTEXT_CLUES,

  // Cache
  createAnalysisCaches,

  // Enhancer
  createEnhancer
};
