/**
 * HYDRA Prompt Optimizer - Automatic prompt enhancement for Gemini CLI
 *
 * Features:
 * - Intent detection (code, analysis, question, creative, etc.)
 * - Clarity scoring and enhancement
 * - Model-specific optimizations
 * - Language detection for code prompts
 * - Category-based enhancements
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'prompt-optimizer-gemini.json');

// Load configuration
let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
} catch (error) {
  // Default config if file not found
  config = {
    categories: {},
    modelOptimizations: {},
    languages: {},
    vagueWords: ['something', 'stuff', 'thing', 'it', 'this', 'that'],
    specificIndicators: ['specifically', 'exactly', 'must', 'should'],
    settings: { autoOptimize: true, lowClarityThreshold: 60 }
  };
}

/**
 * Detect the category/intent of a prompt
 */
export function getPromptCategory(prompt) {
  const promptLower = prompt.toLowerCase();
  const scores = {};

  for (const [category, data] of Object.entries(config.categories)) {
    let score = 0;
    for (const keyword of data.keywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        // Longer keywords get higher scores (more specific)
        score += keyword.length;
      }
    }
    // Apply priority multiplier if available
    const priority = data.priority || 5;
    scores[category] = { score, priority };
  }

  // Find best match - prefer higher score, then higher priority
  const entries = Object.entries(scores).filter(([_, v]) => v.score > 0);
  if (entries.length === 0) return 'general';

  const best = entries.reduce((a, b) => {
    // First compare scores
    if (a[1].score !== b[1].score) {
      return a[1].score > b[1].score ? a : b;
    }
    // If scores equal, compare priority
    return a[1].priority > b[1].priority ? a : b;
  });

  return best[0];
}

/**
 * Score prompt clarity (0-100)
 */
export function getPromptClarity(prompt) {
  let score = 100;
  const issues = [];
  const suggestions = [];

  // Check length
  if (prompt.length < 10) {
    score -= 30;
    issues.push('Too short');
    suggestions.push('Add more context or details');
  } else if (prompt.length < 30) {
    score -= 15;
    issues.push('Brief prompt');
    suggestions.push('Consider adding specifics');
  }

  // Check for vague words
  for (const word of config.vagueWords || []) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(prompt)) {
      score -= 5;
      issues.push(`Vague term: '${word}'`);
    }
  }

  // Check for specificity indicators (positive)
  for (const indicator of config.specificIndicators || []) {
    const regex = new RegExp(`\\b${indicator}\\b`, 'i');
    if (regex.test(prompt)) {
      score += 3;
    }
  }

  // Check for context
  if (!/\b(for|to|because|since|using|with|in)\s+\w+/i.test(prompt)) {
    score -= 10;
    suggestions.push('Add context (for what purpose, using what)');
  }

  // Check for format request
  if (!/\b(format|output|return|show|display|as|like)\b/i.test(prompt)) {
    suggestions.push('Consider specifying desired output format');
  }

  // Normalize score
  score = Math.max(0, Math.min(100, score));

  // Determine quality level
  let quality;
  if (score >= 80) quality = 'Good';
  else if (score >= 60) quality = 'Fair';
  else if (score >= 40) quality = 'Needs improvement';
  else quality = 'Poor';

  return { score, issues, suggestions, quality };
}

/**
 * Detect programming language mentioned in prompt
 */
export function getPromptLanguage(prompt) {
  const promptLower = prompt.toLowerCase();

  for (const [lang, keywords] of Object.entries(config.languages || {})) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(promptLower)) {
        return lang;
      }
    }
  }

  return null;
}

/**
 * Get model-specific optimizations
 */
export function getModelOptimization(model) {
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
 */
export function optimizePrompt(prompt, options = {}) {
  const model = options.model || 'llama3.2:3b';
  let category = options.category || 'auto';
  const addExamples = options.addExamples || false;

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

  // Build enhanced prompt
  let enhanced = prompt;
  const enhancements = [];

  // 1. Add model prefix if available
  if (modelOpt.prefix) {
    enhanced = modelOpt.prefix + enhanced;
    enhancements.push('Added model-specific prefix');
  }

  // 2. Add category-specific enhancements
  const categoryData = config.categories[category];
  if (categoryData && categoryData.enhancers && categoryData.enhancers.length > 0) {
    const enhancerText = categoryData.enhancers.join(' ');
    // Check if not already present
    if (!enhanced.includes(enhancerText.substring(0, 20))) {
      enhanced = `${enhanced}\n\n${enhancerText}`;
      enhancements.push(`Added ${category}-specific instructions`);
    }
  }

  // 3. Add language context for code
  if (category === 'code' && language) {
    if (!enhanced.toLowerCase().includes(language)) {
      enhanced = `[${language}] ${enhanced}`;
      enhancements.push(`Added language tag: ${language}`);
    }
  }

  // 4. Add structure for low-clarity prompts
  const lowClarityThreshold = config.settings?.lowClarityThreshold || 60;
  if (clarity.score < lowClarityThreshold && config.settings?.wrapLowClarity !== false) {
    enhanced = `Task: ${enhanced}\n\nPlease provide a clear, well-structured response.`;
    enhancements.push('Added structure wrapper');
  }

  return {
    originalPrompt: prompt,
    optimizedPrompt: enhanced.trim(),
    category,
    language,
    clarityScore: clarity.score,
    clarityQuality: clarity.quality,
    clarityIssues: clarity.issues,
    claritySuggestions: clarity.suggestions,
    enhancements,
    wasEnhanced: enhancements.length > 0,
    modelOptimization: modelOpt
  };
}

/**
 * Quick function to get an improved prompt
 */
export function getBetterPrompt(prompt, model = 'llama3.2:3b') {
  const result = optimizePrompt(prompt, { model });
  return result.optimizedPrompt;
}

/**
 * Test prompt quality and return detailed report
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
    recommendation: clarity.score >= 60
      ? 'Prompt is acceptable'
      : 'Consider improving the prompt using suggestions'
  };
}

/**
 * Optimize multiple prompts
 */
export function optimizePromptBatch(prompts, options = {}) {
  return prompts.map(prompt => optimizePrompt(prompt, options));
}

/**
 * Analyze a prompt without enhancing it
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
    sentiment: prompt.toLowerCase().includes('error') || prompt.toLowerCase().includes('bug')
      ? 'problem-solving'
      : 'neutral'
  };
}

/**
 * Get optimization suggestions without applying them
 */
export function getSuggestions(prompt, model = 'llama3.2:3b') {
  const analysis = analyzePrompt(prompt);
  const modelOpt = getModelOptimization(model);
  const suggestions = [...analysis.clarity.suggestions];

  // Category-specific suggestions
  const categoryData = config.categories[analysis.category];
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

  // Smart suggestions based on patterns
  const smartSuggestions = getSmartSuggestions(prompt, analysis);
  suggestions.push(...smartSuggestions);

  return {
    prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
    category: analysis.category,
    clarityScore: analysis.clarity.score,
    suggestions: [...new Set(suggestions)], // Remove duplicates
    wouldEnhance: analysis.clarity.score < 60 || suggestions.length > 0
  };
}

/**
 * Get smart suggestions based on advanced pattern matching
 */
export function getSmartSuggestions(prompt, analysis = null) {
  if (!analysis) analysis = analyzePrompt(prompt);
  const suggestions = [];
  const promptLower = prompt.toLowerCase();
  const smartConfig = config.smartSuggestions || {};

  // Check for missing error handling mention in code prompts
  if (analysis.category === 'code') {
    const mentionsErrors = /error|exception|try|catch|handle|throw/i.test(prompt);
    if (!mentionsErrors) {
      suggestions.push('Consider specifying error handling requirements');
    }

    // Check for missing input validation
    if (!/valid|check|verify|sanitize|input/i.test(prompt)) {
      suggestions.push('Consider specifying input validation requirements');
    }
  }

  // API-specific suggestions
  if (analysis.category === 'api') {
    if (!/auth|token|key|bearer/i.test(prompt)) {
      suggestions.push('Specify authentication method if needed');
    }
    if (!/status|response|error code/i.test(prompt)) {
      suggestions.push('Specify expected HTTP status codes');
    }
  }

  // Database-specific suggestions
  if (analysis.category === 'database') {
    if (!/index|performance|optimize/i.test(prompt)) {
      suggestions.push('Consider indexing and performance implications');
    }
    if (!/transaction|rollback|commit/i.test(prompt)) {
      suggestions.push('Specify transaction handling if applicable');
    }
  }

  // Security-specific suggestions
  if (analysis.category === 'security') {
    if (!/owasp|best practice/i.test(prompt)) {
      suggestions.push('Reference OWASP or specific security standards');
    }
  }

  // Testing-specific suggestions
  if (analysis.category === 'testing') {
    if (!/edge case|boundary|negative/i.test(prompt)) {
      suggestions.push('Include edge cases and negative test scenarios');
    }
    if (!/mock|stub|fixture/i.test(prompt)) {
      suggestions.push('Specify mocking requirements for dependencies');
    }
  }

  // Architecture-specific suggestions
  if (analysis.category === 'architecture') {
    if (!/scale|load|traffic/i.test(prompt)) {
      suggestions.push('Specify expected scale and load requirements');
    }
  }

  return suggestions;
}

/**
 * Get auto-completions for partial prompts
 */
export function getAutoCompletions(partialPrompt) {
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
    completions: completions.slice(0, 5), // Return top 5
    hasCompletions: completions.length > 0
  };
}

/**
 * Detect language from code context clues
 */
export function detectLanguageFromContext(prompt) {
  const contextClues = config.smartSuggestions?.contextClues || {};

  for (const [lang, clues] of Object.entries(contextClues)) {
    for (const clue of clues) {
      if (prompt.includes(clue)) {
        return lang;
      }
    }
  }

  // Fallback to existing language detection
  return getPromptLanguage(prompt);
}

/**
 * Get prompt template for category
 */
export function getPromptTemplate(category, variant = 'basic') {
  const templates = config.promptTemplates || {};
  const categoryTemplates = templates[category] || {};
  return categoryTemplates[variant] || null;
}

/**
 * Apply auto-fix to prompt based on smart suggestions
 */
export function autoFixPrompt(prompt, options = {}) {
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

  // Category-specific auto-fixes
  switch (analysis.category) {
    case 'code':
      // Add format specification
      if (!/format|output|return as|show as|```/i.test(prompt)) {
        fixed += '\n\nProvide the code in a code block.';
        appliedFixes.push('Added code format instruction');
      }
      // Add error handling instruction
      if (!/error|exception|try|catch|handle/i.test(prompt)) {
        fixed += ' Include proper error handling.';
        appliedFixes.push('Added error handling instruction');
      }
      break;

    case 'api':
      // Add response format
      if (!/json|response|status|format/i.test(prompt)) {
        fixed += ' Return JSON response format.';
        appliedFixes.push('Added JSON response format');
      }
      // Add error handling
      if (!/error|status code|exception/i.test(prompt)) {
        fixed += ' Include appropriate HTTP status codes and error responses.';
        appliedFixes.push('Added API error handling');
      }
      break;

    case 'database':
      // Add performance consideration
      if (!/index|optim|perform/i.test(prompt)) {
        fixed += ' Consider query performance and indexing.';
        appliedFixes.push('Added performance consideration');
      }
      break;

    case 'testing':
      // Add edge cases
      if (!/edge|boundary|negative|corner/i.test(prompt)) {
        fixed += ' Include edge cases and negative test scenarios.';
        appliedFixes.push('Added edge case instruction');
      }
      break;

    case 'security':
      // Add OWASP reference
      if (!/owasp|best practice|guideline/i.test(prompt)) {
        fixed += ' Follow OWASP security guidelines.';
        appliedFixes.push('Added OWASP reference');
      }
      break;

    case 'devops':
      // Add rollback consideration
      if (!/rollback|revert|recovery/i.test(prompt)) {
        fixed += ' Include rollback strategy.';
        appliedFixes.push('Added rollback consideration');
      }
      break;
  }

  return {
    original: prompt,
    fixed: fixed.trim(),
    appliedFixes,
    wasFixed: appliedFixes.length > 0,
    analysis
  };
}
