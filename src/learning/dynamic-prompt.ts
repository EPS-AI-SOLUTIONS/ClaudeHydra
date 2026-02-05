/**
 * @fileoverview Dynamic Prompt Builder
 * Constructs context-aware system prompts from RAG and user preferences
 *
 * @description
 * Builds intelligent system prompts by combining:
 * - User preferences from knowledge graph
 * - Recent interaction history
 * - RAG-retrieved relevant context
 * - Task-specific instructions
 *
 * @module learning/dynamic-prompt
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ragEngine from './rag-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

/** @type {string} User preferences file */
const PREFERENCES_FILE = join(REPO_ROOT, 'data', 'preferences.json');

/** @type {number} Maximum context length in tokens (approx) */
const MAX_CONTEXT_TOKENS = 4000;

/** @type {number} Approx chars per token */
const CHARS_PER_TOKEN = 4;

/**
 * @typedef {Object} UserPreferences
 * @property {string} [language] - Preferred spoken language
 * @property {string} [codeLanguage] - Preferred code language
 * @property {string[]} [frameworks] - Preferred frameworks
 * @property {string} [codingStyle] - Coding style preferences
 * @property {string} [persona] - AI persona preference
 * @property {Object} [custom] - Custom preferences
 */

/**
 * @typedef {Object} PromptContext
 * @property {string} [task] - Current task type
 * @property {string} [query] - User's query (for RAG retrieval)
 * @property {string[]} [recentMessages] - Recent conversation messages
 * @property {Object} [taskMetadata] - Task-specific metadata
 */

/**
 * @typedef {Object} GeneratedPrompt
 * @property {string} system - System prompt
 * @property {string[]} sources - RAG sources used
 * @property {number} contextTokens - Approximate token count
 */

/**
 * Default user preferences
 * @type {UserPreferences}
 */
const DEFAULT_PREFERENCES = {
  language: 'Polish',
  codeLanguage: 'English',
  frameworks: ['React 19', 'TypeScript', 'Zustand', 'Tauri'],
  codingStyle: 'functional, strict TypeScript, no-any',
  persona: 'Jaskier',
  custom: {}
};

/**
 * In-memory preferences cache
 * @type {UserPreferences|null}
 */
let preferencesCache = null;

/**
 * Recent interactions buffer
 * @type {Array<{role: string, content: string, timestamp: number}>}
 */
const recentInteractions = [];

/** @type {number} Max interactions to keep */
const MAX_RECENT_INTERACTIONS = 20;

/**
 * Loads user preferences from disk
 *
 * @returns {Promise<UserPreferences>}
 */
export async function loadPreferences() {
  if (preferencesCache) return preferencesCache;

  try {
    const content = await readFile(PREFERENCES_FILE, 'utf8');
    preferencesCache = { ...DEFAULT_PREFERENCES, ...JSON.parse(content) };
  } catch {
    preferencesCache = { ...DEFAULT_PREFERENCES };
  }

  return preferencesCache;
}

/**
 * Saves user preferences to disk
 *
 * @param {Partial<UserPreferences>} preferences - Preferences to save
 * @returns {Promise<void>}
 */
export async function savePreferences(preferences) {
  await mkdir(dirname(PREFERENCES_FILE), { recursive: true });

  preferencesCache = { ...DEFAULT_PREFERENCES, ...preferencesCache, ...preferences };
  await writeFile(PREFERENCES_FILE, JSON.stringify(preferencesCache, null, 2), 'utf8');
}

/**
 * Updates a single preference
 *
 * @param {string} key - Preference key
 * @param {any} value - Preference value
 * @returns {Promise<void>}
 */
export async function updatePreference(key, value) {
  const prefs = await loadPreferences();
  prefs[key] = value;
  await savePreferences(prefs);
}

/**
 * Adds an interaction to recent history
 * Also stores in RAG for future retrieval
 *
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @returns {Promise<void>}
 */
export async function addInteraction(role, content) {
  const interaction = {
    role,
    content,
    timestamp: Date.now()
  };

  recentInteractions.push(interaction);

  // Keep only recent interactions
  while (recentInteractions.length > MAX_RECENT_INTERACTIONS) {
    recentInteractions.shift();
  }

  // Store significant interactions in RAG
  if (content.length > 100) {
    const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await ragEngine.addDocument(id, content, {
      role,
      type: 'interaction',
      timestamp: interaction.timestamp
    });
  }
}

/**
 * Gets recent interactions summary
 *
 * @param {number} [count=5] - Number of recent interactions
 * @returns {string} Formatted summary
 */
export function getRecentInteractionsSummary(count = 5) {
  const recent = recentInteractions.slice(-count * 2); // Get last N exchanges

  if (recent.length === 0) return '';

  return recent
    .map(i => `${i.role.toUpperCase()}: ${i.content.slice(0, 200)}${i.content.length > 200 ? '...' : ''}`)
    .join('\n');
}

/**
 * Builds persona-specific system prompt section
 *
 * @param {string} persona - Persona name
 * @returns {string} Persona instructions
 */
function buildPersonaSection(persona) {
  const personas = {
    'Jaskier': `You are Jaskier, the witty bard from The Witcher.
Communication style: Ironic, uses anecdotes, occasional roasts
You solve problems with creativity and flair, but always deliver accurate technical information.
Use Polish for explanations, English for code.`,

    'Professional': `You are a professional software engineer.
Communication style: Concise, technical, focused
Provide direct answers without unnecessary elaboration.`,

    'Teacher': `You are a patient programming teacher.
Communication style: Educational, step-by-step explanations
Break down complex concepts into digestible parts.`
  };

  return personas[persona] || personas['Professional'];
}

/**
 * Builds dynamic system prompt with full context
 *
 * @param {PromptContext} context - Prompt context
 * @returns {Promise<GeneratedPrompt>}
 *
 * @example
 * const { system, sources } = await buildPrompt({
 *   task: 'code',
 *   query: 'Write a React hook for dark mode'
 * });
 */
export async function buildPrompt(context = {}) {
  const { task = 'general', query = '', recentMessages = [], taskMetadata = {} } = context;

  const preferences = await loadPreferences();
  const sources = [];

  // Start building prompt sections
  const sections = [];

  // 1. Persona
  sections.push(buildPersonaSection(preferences.persona));

  // 2. User preferences
  sections.push(`## User Preferences
- Spoken language: ${preferences.language}
- Code language: ${preferences.codeLanguage}
- Frameworks: ${preferences.frameworks.join(', ')}
- Coding style: ${preferences.codingStyle}`);

  // 3. Recent context
  const recentSummary = getRecentInteractionsSummary(3);
  if (recentSummary) {
    sections.push(`## Recent Conversation Context
${recentSummary}`);
  }

  // 4. RAG context (if query provided)
  if (query) {
    try {
      const { context: ragContext, sources: ragSources } = await ragEngine.retrieveContext(query, {
        topK: 3,
        minScore: 0.6
      });

      if (ragContext) {
        sections.push(`## Relevant Context from Memory
${ragContext}`);
        sources.push(...ragSources.map(s => s.id));
      }
    } catch {
      // RAG unavailable, continue without it
    }
  }

  // 5. Task-specific instructions
  const taskInstructions = {
    code: `Focus on writing clean, maintainable code.
Follow ${preferences.codingStyle} conventions.
Prefer ${preferences.frameworks.join(', ')} patterns.`,

    explain: `Explain concepts clearly in ${preferences.language}.
Use analogies and examples.
Break down complex topics.`,

    debug: `Analyze the problem systematically.
Identify root cause before suggesting fixes.
Consider edge cases.`,

    review: `Review code for:
- Correctness and logic errors
- Performance issues
- Security vulnerabilities
- Adherence to ${preferences.codingStyle}`,

    general: `Assist with the task at hand.
Be helpful and accurate.`
  };

  sections.push(`## Task Instructions
${taskInstructions[task] || taskInstructions.general}`);

  // 6. Additional metadata
  if (Object.keys(taskMetadata).length > 0) {
    sections.push(`## Additional Context
${JSON.stringify(taskMetadata, null, 2)}`);
  }

  // Combine sections
  let systemPrompt = sections.join('\n\n');

  // Truncate if too long
  const maxChars = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;
  if (systemPrompt.length > maxChars) {
    systemPrompt = systemPrompt.slice(0, maxChars) + '\n\n[Context truncated due to length]';
  }

  return {
    system: systemPrompt,
    sources,
    contextTokens: Math.ceil(systemPrompt.length / CHARS_PER_TOKEN)
  };
}

/**
 * Builds a quick prompt without RAG (faster)
 *
 * @param {string} [task='general'] - Task type
 * @returns {Promise<string>} System prompt
 */
export async function buildQuickPrompt(task = 'general') {
  const preferences = await loadPreferences();

  return `${buildPersonaSection(preferences.persona)}

Preferences: ${preferences.frameworks.join(', ')}, ${preferences.codingStyle}
Language: ${preferences.language} (speech), ${preferences.codeLanguage} (code)`;
}

/**
 * Learns from user feedback to update preferences
 *
 * @param {string} feedbackType - Type of feedback
 * @param {any} value - Feedback value
 * @returns {Promise<void>}
 */
export async function learnFromFeedback(feedbackType, value) {
  const prefs = await loadPreferences();

  switch (feedbackType) {
    case 'preferred_framework':
      if (!prefs.frameworks.includes(value)) {
        prefs.frameworks.push(value);
        await savePreferences(prefs);
      }
      break;

    case 'coding_style':
      prefs.codingStyle = value;
      await savePreferences(prefs);
      break;

    case 'custom':
      prefs.custom = { ...prefs.custom, ...value };
      await savePreferences(prefs);
      break;
  }
}

/**
 * Clears recent interactions buffer
 */
export function clearRecentInteractions() {
  recentInteractions.length = 0;
}

/**
 * Gets current preferences
 *
 * @returns {Promise<UserPreferences>}
 */
export async function getPreferences() {
  return loadPreferences();
}

export default {
  loadPreferences,
  savePreferences,
  updatePreference,
  addInteraction,
  getRecentInteractionsSummary,
  buildPrompt,
  buildQuickPrompt,
  learnFromFeedback,
  clearRecentInteractions,
  getPreferences,
  DEFAULT_PREFERENCES
};
