/**
 * HYDRA Prompt Optimizer - Automatic prompt enhancement for Gemini CLI
 *
 * This file re-exports from the new modular architecture for backward compatibility.
 * The implementation has been refactored into separate modules:
 *
 * - prompt-optimizer/config-schema.js: Configuration validation and defaults
 * - prompt-optimizer/patterns.js: Compiled regex patterns for performance
 * - prompt-optimizer/category-detector.js: Intent/category detection
 * - prompt-optimizer/clarity-analyzer.js: Prompt clarity analysis
 * - prompt-optimizer/language-detector.js: Programming language detection
 * - prompt-optimizer/analysis-cache.js: LRU caching for results
 * - prompt-optimizer/enhancer.js: Prompt enhancement logic
 * - prompt-optimizer/index.js: Main orchestration module
 *
 * New features in the refactored version:
 * - Pre-compiled regex patterns (compile once, use many times)
 * - LRU caching with TTL for analysis results
 * - Pure functions for better testability
 * - Configuration validation with helpful error messages
 * - Factory functions for creating custom optimizer instances
 * - Detailed detection results with confidence scores
 */

// Re-export all public functions from the modular implementation
export {
  // Core API (backward compatible)
  getPromptCategory,
  getPromptClarity,
  getPromptLanguage,
  getModelOptimization,
  optimizePrompt,
  getBetterPrompt,
  testPromptQuality,
  optimizePromptBatch,
  analyzePrompt,
  getSuggestions,
  getSmartSuggestions,
  getAutoCompletions,
  detectLanguageFromContext,
  getPromptTemplate,
  autoFixPrompt,

  // New advanced API
  detectCategoryDetailed,
  detectLanguageDetailed,
  createOptimizer,
  initialize,
  getConfig,

  // Cache management
  getCacheStats,
  clearCaches,
  getPatternStats,
  reset,

  // Factory functions for custom instances
  createCategoryDetector,
  createClarityAnalyzer,
  createLanguageDetector,
  createEnhancer,
  createPatternRegistry,
  createAnalysisCaches,

  // Configuration utilities
  validateConfig,
  DEFAULT_CONFIG,

  // Utilities
  getQualityLevel,
  DEFAULT_CONTEXT_CLUES
} from './prompt-optimizer/index.js';
