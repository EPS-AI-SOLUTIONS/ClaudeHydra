/**
 * Prompt Enhancer Module
 *
 * Pure functions for enhancing prompts based on analysis results.
 * Separated from analysis logic for cleaner architecture.
 */

import { STATIC_PATTERNS } from './patterns.js';

/**
 * @typedef {object} EnhancementResult
 * @property {string} prompt - Enhanced prompt
 * @property {string[]} appliedEnhancements - List of enhancements applied
 * @property {boolean} wasEnhanced - Whether any changes were made
 */

/**
 * Add model-specific prefix to prompt
 * Pure function
 *
 * @param {string} prompt - Original prompt
 * @param {object} modelOpts - Model optimization options
 * @returns {{ prompt: string, enhancement: string | null }}
 */
export function addModelPrefix(prompt, modelOpts) {
  if (!modelOpts?.prefix) {
    return { prompt, enhancement: null };
  }

  return {
    prompt: modelOpts.prefix + prompt,
    enhancement: 'Added model-specific prefix'
  };
}

/**
 * Add category-specific enhancements
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @param {string} category - Detected category
 * @param {object} categoryData - Category configuration data
 * @returns {{ prompt: string, enhancement: string | null }}
 */
export function addCategoryEnhancements(prompt, category, categoryData) {
  if (!categoryData?.enhancers?.length) {
    return { prompt, enhancement: null };
  }

  const enhancerText = categoryData.enhancers.join(' ');

  // Check if not already present (avoid duplicates)
  if (prompt.includes(enhancerText.substring(0, 20))) {
    return { prompt, enhancement: null };
  }

  return {
    prompt: `${prompt}\n\n${enhancerText}`,
    enhancement: `Added ${category}-specific instructions`
  };
}

/**
 * Add language tag for code prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @param {string} category - Detected category
 * @param {string | null} language - Detected language
 * @returns {{ prompt: string, enhancement: string | null }}
 */
export function addLanguageTag(prompt, category, language) {
  if (category !== 'code' || !language) {
    return { prompt, enhancement: null };
  }

  if (prompt.toLowerCase().includes(language.toLowerCase())) {
    return { prompt, enhancement: null };
  }

  return {
    prompt: `[${language}] ${prompt}`,
    enhancement: `Added language tag: ${language}`
  };
}

/**
 * Add structure wrapper for low-clarity prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @param {number} clarityScore - Prompt clarity score
 * @param {number} threshold - Low clarity threshold
 * @param {boolean} enabled - Whether wrapping is enabled
 * @returns {{ prompt: string, enhancement: string | null }}
 */
export function addStructureWrapper(prompt, clarityScore, threshold = 60, enabled = true) {
  if (!enabled || clarityScore >= threshold) {
    return { prompt, enhancement: null };
  }

  return {
    prompt: `Task: ${prompt}\n\nPlease provide a clear, well-structured response.`,
    enhancement: 'Added structure wrapper'
  };
}

/**
 * Add example template to prompt
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @param {string} category - Detected category
 * @param {object} templates - Prompt templates configuration
 * @returns {{ prompt: string, enhancement: string | null }}
 */
export function addExampleTemplate(prompt, category, templates) {
  const categoryTemplates = templates?.[category];
  if (!categoryTemplates) {
    return { prompt, enhancement: null };
  }

  const template = categoryTemplates.basic || Object.values(categoryTemplates)[0];
  if (!template || prompt.includes(template)) {
    return { prompt, enhancement: null };
  }

  return {
    prompt: `${prompt}\n\nExample: ${template}`,
    enhancement: 'Added example template'
  };
}

/**
 * Apply auto-fix for code prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @returns {{ prompt: string, fixes: string[] }}
 */
export function autoFixCodePrompt(prompt) {
  let fixed = prompt;
  const fixes = [];

  // Add format specification
  if (!STATIC_PATTERNS.codeFormat.test(prompt)) {
    fixed += '\n\nProvide the code in a code block.';
    fixes.push('Added code format instruction');
  }

  // Add error handling instruction
  if (!STATIC_PATTERNS.errorHandling.test(prompt)) {
    fixed += ' Include proper error handling.';
    fixes.push('Added error handling instruction');
  }

  return { prompt: fixed, fixes };
}

/**
 * Apply auto-fix for API prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @returns {{ prompt: string, fixes: string[] }}
 */
export function autoFixApiPrompt(prompt) {
  let fixed = prompt;
  const fixes = [];

  // Add response format
  if (!STATIC_PATTERNS.apiJson.test(prompt)) {
    fixed += ' Return JSON response format.';
    fixes.push('Added JSON response format');
  }

  // Add error handling
  if (!STATIC_PATTERNS.apiErrors.test(prompt)) {
    fixed += ' Include appropriate HTTP status codes and error responses.';
    fixes.push('Added API error handling');
  }

  return { prompt: fixed, fixes };
}

/**
 * Apply auto-fix for database prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @returns {{ prompt: string, fixes: string[] }}
 */
export function autoFixDatabasePrompt(prompt) {
  let fixed = prompt;
  const fixes = [];

  if (!STATIC_PATTERNS.dbOptimize.test(prompt)) {
    fixed += ' Consider query performance and indexing.';
    fixes.push('Added performance consideration');
  }

  return { prompt: fixed, fixes };
}

/**
 * Apply auto-fix for testing prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @returns {{ prompt: string, fixes: string[] }}
 */
export function autoFixTestingPrompt(prompt) {
  let fixed = prompt;
  const fixes = [];

  if (!STATIC_PATTERNS.testEdge.test(prompt)) {
    fixed += ' Include edge cases and negative test scenarios.';
    fixes.push('Added edge case instruction');
  }

  return { prompt: fixed, fixes };
}

/**
 * Apply auto-fix for security prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @returns {{ prompt: string, fixes: string[] }}
 */
export function autoFixSecurityPrompt(prompt) {
  let fixed = prompt;
  const fixes = [];

  if (!STATIC_PATTERNS.securityGuidelines.test(prompt)) {
    fixed += ' Follow OWASP security guidelines.';
    fixes.push('Added OWASP reference');
  }

  return { prompt: fixed, fixes };
}

/**
 * Apply auto-fix for devops prompts
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @returns {{ prompt: string, fixes: string[] }}
 */
export function autoFixDevopsPrompt(prompt) {
  let fixed = prompt;
  const fixes = [];

  if (!STATIC_PATTERNS.rollbackStrategy.test(prompt)) {
    fixed += ' Include rollback strategy.';
    fixes.push('Added rollback consideration');
  }

  return { prompt: fixed, fixes };
}

/**
 * Category-specific auto-fix dispatcher
 */
const AUTO_FIX_HANDLERS = {
  code: autoFixCodePrompt,
  api: autoFixApiPrompt,
  database: autoFixDatabasePrompt,
  testing: autoFixTestingPrompt,
  security: autoFixSecurityPrompt,
  devops: autoFixDevopsPrompt
};

/**
 * Apply category-specific auto-fixes
 * Pure function
 *
 * @param {string} prompt - Current prompt
 * @param {string} category - Detected category
 * @returns {{ prompt: string, fixes: string[] }}
 */
export function applyCategoryAutoFix(prompt, category) {
  const handler = AUTO_FIX_HANDLERS[category];
  if (!handler) {
    return { prompt, fixes: [] };
  }
  return handler(prompt);
}

/**
 * Full prompt enhancement pipeline
 * Pure function combining all enhancement steps
 *
 * @param {string} prompt - Original prompt
 * @param {object} analysis - Analysis results
 * @param {object} config - Configuration
 * @param {object} options - Enhancement options
 * @returns {EnhancementResult}
 */
export function enhancePrompt(prompt, analysis, config, options = {}) {
  const {
    addExamples = false,
    autoFix = false,
    model = null
  } = options;

  let enhanced = prompt;
  const appliedEnhancements = [];

  // 1. Add model prefix
  const modelOpts = model ? config.modelOptimizations?.[model] : null;
  const prefixResult = addModelPrefix(enhanced, modelOpts);
  enhanced = prefixResult.prompt;
  if (prefixResult.enhancement) appliedEnhancements.push(prefixResult.enhancement);

  // 2. Add category enhancements
  const categoryData = config.categories?.[analysis.category];
  const categoryResult = addCategoryEnhancements(enhanced, analysis.category, categoryData);
  enhanced = categoryResult.prompt;
  if (categoryResult.enhancement) appliedEnhancements.push(categoryResult.enhancement);

  // 3. Add language tag
  const langResult = addLanguageTag(enhanced, analysis.category, analysis.language);
  enhanced = langResult.prompt;
  if (langResult.enhancement) appliedEnhancements.push(langResult.enhancement);

  // 4. Add structure wrapper for low clarity
  const threshold = config.settings?.lowClarityThreshold || 60;
  const wrapEnabled = config.settings?.wrapLowClarity !== false;
  const wrapResult = addStructureWrapper(enhanced, analysis.clarityScore, threshold, wrapEnabled);
  enhanced = wrapResult.prompt;
  if (wrapResult.enhancement) appliedEnhancements.push(wrapResult.enhancement);

  // 5. Add example template if requested
  if (addExamples) {
    const templateResult = addExampleTemplate(enhanced, analysis.category, config.promptTemplates);
    enhanced = templateResult.prompt;
    if (templateResult.enhancement) appliedEnhancements.push(templateResult.enhancement);
  }

  // 6. Apply auto-fixes if requested
  if (autoFix) {
    const fixResult = applyCategoryAutoFix(enhanced, analysis.category);
    enhanced = fixResult.prompt;
    appliedEnhancements.push(...fixResult.fixes);
  }

  return {
    prompt: enhanced.trim(),
    appliedEnhancements,
    wasEnhanced: appliedEnhancements.length > 0
  };
}

/**
 * Create an enhancer factory with pre-bound configuration
 *
 * @param {object} config - Configuration
 * @returns {object} Object with bound enhancer functions
 */
export function createEnhancer(config) {
  return Object.freeze({
    enhance: (prompt, analysis, options) => enhancePrompt(prompt, analysis, config, options),
    addModelPrefix: (prompt, model) => addModelPrefix(prompt, config.modelOptimizations?.[model]),
    addCategoryEnhancements: (prompt, category) =>
      addCategoryEnhancements(prompt, category, config.categories?.[category]),
    addLanguageTag,
    addStructureWrapper,
    applyCategoryAutoFix
  });
}
