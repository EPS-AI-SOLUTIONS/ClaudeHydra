/**
 * Language Detection Module
 *
 * Pure functions for detecting programming languages in prompts.
 * Uses both keyword matching and contextual clues.
 */

import { matchesWord } from './patterns.js';

/**
 * @typedef {object} LanguageResult
 * @property {string | null} language - Detected language or null
 * @property {number} confidence - Confidence score (0-100)
 * @property {string[]} matchedKeywords - Keywords that matched
 * @property {string} source - Detection source ('keyword' | 'context' | 'none')
 */

/**
 * Detect language from explicit keywords
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {object} languages - Language keywords configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled patterns
 * @returns {LanguageResult}
 */
export function detectFromKeywords(prompt, languages, patternRegistry) {
  const promptLower = prompt.toLowerCase();

  for (const [lang, keywords] of Object.entries(languages)) {
    const langPatterns = patternRegistry?.get(lang);

    for (const keyword of keywords) {
      const matches = langPatterns?.patterns
        ? langPatterns.patterns.get(keyword)?.test(promptLower)
        : matchesWord(promptLower, keyword);

      if (matches) {
        return {
          language: lang,
          confidence: 90,
          matchedKeywords: [keyword],
          source: 'keyword'
        };
      }
    }
  }

  return {
    language: null,
    confidence: 0,
    matchedKeywords: [],
    source: 'none'
  };
}

/**
 * Default context clues for language detection
 * Maps contextual patterns to programming languages
 */
export const DEFAULT_CONTEXT_CLUES = Object.freeze({
  javascript: [
    'const ', 'let ', 'var ', '=>', 'async ', 'await ',
    'document.', 'window.', 'console.log', 'require(',
    'import ', 'export ', 'npm ', 'node ', '.js', 'package.json'
  ],
  typescript: [
    'interface ', ': string', ': number', ': boolean',
    '<T>', 'type ', 'tsconfig', '.ts', '.tsx'
  ],
  python: [
    'def ', 'import ', 'from ', '__init__', 'self.',
    'pip ', 'requirements.txt', '.py', 'elif ', 'print('
  ],
  java: [
    'public class', 'private ', 'protected ', 'void ',
    'System.out', '.java', 'Maven', 'gradle', 'extends ', 'implements '
  ],
  csharp: [
    'using System', 'namespace ', 'public class', '.cs',
    'Console.Write', 'var ', 'async Task', '.NET', 'NuGet'
  ],
  go: [
    'func ', 'package ', 'import (', 'go mod', '.go',
    'fmt.', 'err != nil', ':= ', 'goroutine'
  ],
  rust: [
    'fn ', 'let mut', 'impl ', '&str', 'cargo',
    '.rs', 'Cargo.toml', 'pub fn', 'struct ', 'enum '
  ],
  cpp: [
    '#include', 'std::', 'cout <<', 'cin >>', '.cpp',
    '.hpp', 'namespace ', 'template<', 'class '
  ],
  ruby: [
    'def ', 'end', 'puts ', 'gem ', 'Gemfile',
    '.rb', 'require ', 'attr_', 'class ', 'module '
  ],
  php: [
    '<?php', '$_', 'echo ', 'composer', '.php',
    'namespace ', 'use ', 'public function', '->'
  ],
  sql: [
    'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE ',
    'FROM ', 'WHERE ', 'JOIN ', 'CREATE TABLE', 'ALTER TABLE'
  ],
  html: [
    '<html', '<div', '<span', '<body', '<head',
    'class="', 'id="', '</div>', '</span>'
  ],
  css: [
    '.class', '#id', 'display:', 'margin:', 'padding:',
    '@media', 'flex', 'grid', ':hover', 'font-'
  ],
  bash: [
    '#!/bin/bash', '#!/bin/sh', 'echo ', 'if [', 'fi',
    '$1', '$2', 'export ', 'chmod ', 'grep '
  ],
  powershell: [
    'Write-Host', 'Get-', 'Set-', 'New-', '-eq',
    '$_', '.ps1', 'param(', 'function '
  ]
});

/**
 * Detect language from context clues
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {object} contextClues - Context clues configuration
 * @returns {LanguageResult}
 */
export function detectFromContext(prompt, contextClues = DEFAULT_CONTEXT_CLUES) {
  const scores = new Map();

  for (const [lang, clues] of Object.entries(contextClues)) {
    let matchCount = 0;
    const matchedClues = [];

    for (const clue of clues) {
      if (prompt.includes(clue)) {
        matchCount++;
        matchedClues.push(clue);
      }
    }

    if (matchCount > 0) {
      scores.set(lang, {
        count: matchCount,
        ratio: matchCount / clues.length,
        matchedClues
      });
    }
  }

  if (scores.size === 0) {
    return {
      language: null,
      confidence: 0,
      matchedKeywords: [],
      source: 'none'
    };
  }

  // Find best match by count, then by ratio
  const sorted = Array.from(scores.entries())
    .sort((a, b) => {
      if (a[1].count !== b[1].count) return b[1].count - a[1].count;
      return b[1].ratio - a[1].ratio;
    });

  const [bestLang, bestData] = sorted[0];

  // Calculate confidence based on matches and ratio
  const confidence = Math.min(
    85,
    Math.round(40 + (bestData.count * 10) + (bestData.ratio * 30))
  );

  return {
    language: bestLang,
    confidence,
    matchedKeywords: bestData.matchedClues,
    source: 'context'
  };
}

/**
 * Detect programming language in prompt
 * Pure function - tries keyword detection first, then context
 *
 * @param {string} prompt - The prompt text
 * @param {object} languages - Language keywords configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled patterns
 * @param {object} contextClues - Context clues configuration
 * @returns {LanguageResult}
 */
export function detectLanguage(
  prompt,
  languages = {},
  patternRegistry = null,
  contextClues = DEFAULT_CONTEXT_CLUES
) {
  if (!prompt || typeof prompt !== 'string') {
    return {
      language: null,
      confidence: 0,
      matchedKeywords: [],
      source: 'none'
    };
  }

  // Try keyword detection first (more reliable)
  const keywordResult = detectFromKeywords(prompt, languages, patternRegistry);
  if (keywordResult.language) {
    return keywordResult;
  }

  // Fall back to context detection
  return detectFromContext(prompt, contextClues);
}

/**
 * Get language with simple string return (backward compatible)
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {object} languages - Language keywords configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled patterns
 * @returns {string | null} Language name or null
 */
export function getLanguage(prompt, languages, patternRegistry) {
  return detectLanguage(prompt, languages, patternRegistry).language;
}

/**
 * Check if prompt is about a specific language
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {string} targetLanguage - Language to check for
 * @param {object} languages - Language keywords configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled patterns
 * @returns {boolean}
 */
export function isLanguage(prompt, targetLanguage, languages, patternRegistry) {
  const result = detectLanguage(prompt, languages, patternRegistry);
  return result.language === targetLanguage;
}

/**
 * Get all possible languages with confidence scores
 * Pure function
 *
 * @param {string} prompt - The prompt text
 * @param {object} languages - Language keywords configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled patterns
 * @param {object} contextClues - Context clues configuration
 * @returns {Array<{ language: string, confidence: number }>}
 */
export function getAllPossibleLanguages(
  prompt,
  languages = {},
  patternRegistry = null,
  contextClues = DEFAULT_CONTEXT_CLUES
) {
  const results = [];
  const promptLower = prompt.toLowerCase();

  // Check keyword matches
  for (const [lang, keywords] of Object.entries(languages)) {
    const langPatterns = patternRegistry?.get(lang);
    let matchCount = 0;

    for (const keyword of keywords) {
      const matches = langPatterns?.patterns
        ? langPatterns.patterns.get(keyword)?.test(promptLower)
        : matchesWord(promptLower, keyword);

      if (matches) matchCount++;
    }

    if (matchCount > 0) {
      results.push({
        language: lang,
        confidence: Math.min(95, 70 + matchCount * 10)
      });
    }
  }

  // Check context clues
  for (const [lang, clues] of Object.entries(contextClues)) {
    // Skip if already found via keyword
    if (results.find(r => r.language === lang)) continue;

    let matchCount = 0;
    for (const clue of clues) {
      if (prompt.includes(clue)) matchCount++;
    }

    if (matchCount > 0) {
      results.push({
        language: lang,
        confidence: Math.min(80, 30 + matchCount * 15)
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Create a language detector factory with pre-bound configuration
 * Returns functions with configuration pre-applied
 *
 * @param {object} languages - Language keywords configuration
 * @param {Map<string, object>} patternRegistry - Pre-compiled patterns
 * @param {object} contextClues - Context clues configuration
 * @returns {object} Object with bound detector functions
 */
export function createLanguageDetector(languages, patternRegistry, contextClues) {
  const clues = contextClues || DEFAULT_CONTEXT_CLUES;

  return Object.freeze({
    detect: (prompt) => detectLanguage(prompt, languages, patternRegistry, clues),
    getLanguage: (prompt) => getLanguage(prompt, languages, patternRegistry),
    isLanguage: (prompt, target) => isLanguage(prompt, target, languages, patternRegistry),
    getAllPossible: (prompt) => getAllPossibleLanguages(prompt, languages, patternRegistry, clues)
  });
}
