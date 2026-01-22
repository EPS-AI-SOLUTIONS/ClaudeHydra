/**
 * @fileoverview Gemini Models - Dynamic model discovery and auto-fallback
 * Fetches available models from Gemini API and selects the best one with fallback
 *
 * @description
 * This module provides:
 * - Dynamic fetching of available Gemini models via API
 * - Model ranking by capability (reasoning, speed, cost)
 * - Automatic fallback to next best model on failure
 * - Caching of model list with TTL
 *
 * @module hydra/providers/gemini-models
 * @see https://ai.google.dev/api/models
 */

import { getConfigManager } from '../core/config.js';
import { TTLCache } from '../core/cache.js';

/**
 * Gemini API base URL
 * @constant
 */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Model ranking by capability tier (higher = better)
 * Based on Google's model hierarchy as of 2025
 * @constant
 */
const MODEL_RANKINGS = {
  // Tier 1: Most intelligent/capable (score 100)
  'gemini-2.5-pro': { tier: 1, score: 100, capabilities: ['reasoning', 'thinking', 'complex'] },
  'gemini-2.5-pro-preview': { tier: 1, score: 99, capabilities: ['reasoning', 'thinking', 'complex'] },
  'gemini-2.0-flash-thinking-exp': { tier: 1, score: 98, capabilities: ['reasoning', 'thinking'] },
  'gemini-2.0-flash-thinking-exp-01-21': { tier: 1, score: 97, capabilities: ['reasoning', 'thinking'] },

  // Tier 2: Balanced performance (score 80-89)
  'gemini-2.5-flash': { tier: 2, score: 89, capabilities: ['balanced', 'fast', 'multimodal'] },
  'gemini-2.5-flash-preview': { tier: 2, score: 88, capabilities: ['balanced', 'fast', 'multimodal'] },
  'gemini-2.0-flash': { tier: 2, score: 85, capabilities: ['balanced', 'fast'] },
  'gemini-2.0-flash-exp': { tier: 2, score: 84, capabilities: ['balanced', 'fast'] },
  'gemini-2.0-flash-001': { tier: 2, score: 83, capabilities: ['balanced', 'fast'] },

  // Tier 3: Cost-efficient (score 70-79)
  'gemini-2.5-flash-lite': { tier: 3, score: 79, capabilities: ['fast', 'cheap'] },
  'gemini-2.5-flash-lite-preview': { tier: 3, score: 78, capabilities: ['fast', 'cheap'] },
  'gemini-1.5-flash': { tier: 3, score: 75, capabilities: ['fast', 'cheap'] },
  'gemini-1.5-flash-latest': { tier: 3, score: 74, capabilities: ['fast', 'cheap'] },
  'gemini-1.5-flash-001': { tier: 3, score: 73, capabilities: ['fast', 'cheap'] },
  'gemini-1.5-flash-002': { tier: 3, score: 72, capabilities: ['fast', 'cheap'] },

  // Tier 4: Legacy/stable (score 60-69)
  'gemini-1.5-pro': { tier: 4, score: 69, capabilities: ['stable', 'multimodal'] },
  'gemini-1.5-pro-latest': { tier: 4, score: 68, capabilities: ['stable', 'multimodal'] },
  'gemini-1.5-pro-001': { tier: 4, score: 67, capabilities: ['stable'] },
  'gemini-1.5-pro-002': { tier: 4, score: 66, capabilities: ['stable'] },
  'gemini-pro': { tier: 4, score: 60, capabilities: ['stable'] },

  // Tier 5: Specialized (score varies)
  'gemini-2.0-flash-live-001': { tier: 5, score: 55, capabilities: ['live', 'streaming'] },
  'text-embedding-004': { tier: 5, score: 50, capabilities: ['embedding'] },
  'embedding-001': { tier: 5, score: 45, capabilities: ['embedding'] },
};

/**
 * Default fallback chain if API fetch fails
 * @constant
 */
const DEFAULT_FALLBACK_CHAIN = [
  'gemini-2.5-pro',
  'gemini-2.0-flash-thinking-exp',
  'gemini-2.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

/**
 * @typedef {Object} GeminiModel
 * @property {string} name - Full model name (e.g., "models/gemini-2.5-pro")
 * @property {string} displayName - Human-readable name
 * @property {string} description - Model description
 * @property {number} inputTokenLimit - Maximum input tokens
 * @property {number} outputTokenLimit - Maximum output tokens
 * @property {string[]} supportedGenerationMethods - Supported methods
 * @property {boolean} [thinking] - Whether model supports thinking
 */

/**
 * @typedef {Object} ModelSelection
 * @property {string} model - Selected model name
 * @property {number} score - Model capability score
 * @property {string[]} fallbackChain - Ordered fallback models
 * @property {boolean} fromCache - Whether result was from cache
 */

/**
 * Cache for model list
 */
const modelCache = new TTLCache({
  ttl: 300000, // 5 minutes
  maxSize: 10,
  evictionPolicy: 'LRU'
});

/**
 * Fetch available models from Gemini API
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<GeminiModel[]>} List of available models
 */
export async function fetchAvailableModels(apiKey) {
  if (!apiKey) {
    console.warn('[GeminiModels] No API key provided, using default fallback chain');
    return [];
  }

  // Check cache first
  const cacheKey = `models_${apiKey.slice(-8)}`;
  const cached = modelCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=100`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      shortName: m.name.replace('models/', ''),
      displayName: m.displayName,
      description: m.description,
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
      supportedGenerationMethods: m.supportedGenerationMethods || [],
      thinking: m.thinking || false,
      temperature: m.temperature,
      topP: m.topP,
      topK: m.topK
    }));

    // Cache the result
    modelCache.set(cacheKey, models);

    console.log(`[GeminiModels] Fetched ${models.length} models from API`);
    return models;

  } catch (error) {
    console.error('[GeminiModels] Failed to fetch models:', error.message);
    return [];
  }
}

/**
 * Get model score based on ranking
 * @param {string} modelName - Model name (with or without "models/" prefix)
 * @returns {number} Model score (0-100)
 */
export function getModelScore(modelName) {
  const shortName = modelName.replace('models/', '');

  // Direct match
  if (MODEL_RANKINGS[shortName]) {
    return MODEL_RANKINGS[shortName].score;
  }

  // Partial match (for versioned models)
  for (const [key, ranking] of Object.entries(MODEL_RANKINGS)) {
    if (shortName.startsWith(key) || key.startsWith(shortName)) {
      return ranking.score;
    }
  }

  // Unknown model - assign low score
  return 30;
}

/**
 * Get model capabilities
 * @param {string} modelName - Model name
 * @returns {string[]} Model capabilities
 */
export function getModelCapabilities(modelName) {
  const shortName = modelName.replace('models/', '');

  if (MODEL_RANKINGS[shortName]) {
    return MODEL_RANKINGS[shortName].capabilities;
  }

  // Check partial matches
  for (const [key, ranking] of Object.entries(MODEL_RANKINGS)) {
    if (shortName.startsWith(key) || key.startsWith(shortName)) {
      return ranking.capabilities;
    }
  }

  return ['unknown'];
}

/**
 * Check if model supports a specific capability
 * @param {string} modelName - Model name
 * @param {string} capability - Required capability
 * @returns {boolean}
 */
export function modelSupportsCapability(modelName, capability) {
  const capabilities = getModelCapabilities(modelName);
  return capabilities.includes(capability);
}

/**
 * Select best available model with fallback chain
 * @param {Object} options - Selection options
 * @param {string} [options.apiKey] - Gemini API key
 * @param {string} [options.preferredCapability] - Preferred capability (e.g., 'thinking', 'fast')
 * @param {string[]} [options.excludeModels] - Models to exclude
 * @param {boolean} [options.useCache=true] - Whether to use cached model list
 * @returns {Promise<ModelSelection>} Selected model with fallback chain
 */
export async function selectBestModel(options = {}) {
  const {
    apiKey,
    preferredCapability,
    excludeModels = [],
    useCache = true
  } = options;

  // Fetch available models
  let availableModels = [];
  if (apiKey) {
    availableModels = await fetchAvailableModels(apiKey);
  }

  // Build ranked list
  let rankedModels;

  if (availableModels.length > 0) {
    // Filter to only generateContent-capable models
    const generateModels = availableModels.filter(m =>
      m.supportedGenerationMethods.includes('generateContent')
    );

    // Score and sort
    rankedModels = generateModels
      .map(m => ({
        name: m.shortName,
        score: getModelScore(m.shortName),
        capabilities: getModelCapabilities(m.shortName),
        thinking: m.thinking,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit
      }))
      .filter(m => !excludeModels.includes(m.name))
      .sort((a, b) => b.score - a.score);

  } else {
    // Use default fallback chain
    rankedModels = DEFAULT_FALLBACK_CHAIN
      .filter(name => !excludeModels.includes(name))
      .map(name => ({
        name,
        score: getModelScore(name),
        capabilities: getModelCapabilities(name)
      }));
  }

  // If preferred capability specified, prioritize those models
  if (preferredCapability) {
    rankedModels.sort((a, b) => {
      const aHas = a.capabilities.includes(preferredCapability) ? 1 : 0;
      const bHas = b.capabilities.includes(preferredCapability) ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return b.score - a.score;
    });
  }

  if (rankedModels.length === 0) {
    // Ultimate fallback
    return {
      model: 'gemini-2.0-flash-exp',
      score: 84,
      fallbackChain: DEFAULT_FALLBACK_CHAIN,
      fromCache: false
    };
  }

  return {
    model: rankedModels[0].name,
    score: rankedModels[0].score,
    fallbackChain: rankedModels.map(m => m.name),
    fromCache: availableModels.length > 0 && useCache
  };
}

/**
 * Create a model executor with automatic fallback
 * @param {Object} options - Executor options
 * @param {string} options.apiKey - Gemini API key
 * @param {Function} options.generateFn - Function to call for generation
 * @param {number} [options.maxRetries=3] - Max fallback attempts
 * @returns {Object} Executor with generate method
 */
export function createModelExecutor(options) {
  const { apiKey, generateFn, maxRetries = 3 } = options;

  let currentSelection = null;
  let failedModels = [];

  return {
    /**
     * Generate with automatic fallback
     * @param {string} prompt - Prompt to send
     * @param {Object} genOptions - Generation options
     * @returns {Promise<Object>} Generation result
     */
    async generate(prompt, genOptions = {}) {
      // Get current selection or refresh
      if (!currentSelection || failedModels.length > 0) {
        currentSelection = await selectBestModel({
          apiKey,
          excludeModels: failedModels,
          preferredCapability: genOptions.preferredCapability
        });
      }

      let lastError = null;
      const fallbackChain = currentSelection.fallbackChain.slice(0, maxRetries);

      for (const model of fallbackChain) {
        if (failedModels.includes(model)) continue;

        try {
          console.log(`[GeminiModels] Trying model: ${model}`);
          const result = await generateFn(prompt, { ...genOptions, model });

          // Success - reset failures for this model
          failedModels = failedModels.filter(m => m !== model);

          return {
            ...result,
            model,
            modelScore: getModelScore(model),
            fallbackUsed: model !== currentSelection.model
          };

        } catch (error) {
          console.warn(`[GeminiModels] Model ${model} failed: ${error.message}`);
          lastError = error;

          // Check if error is model-specific (not transient)
          if (isModelSpecificError(error)) {
            failedModels.push(model);
          }
        }
      }

      // All models failed
      throw lastError || new Error('All models in fallback chain failed');
    },

    /**
     * Get current model selection
     * @returns {ModelSelection|null}
     */
    getCurrentSelection() {
      return currentSelection;
    },

    /**
     * Get list of failed models
     * @returns {string[]}
     */
    getFailedModels() {
      return [...failedModels];
    },

    /**
     * Reset failed models (e.g., after some time has passed)
     */
    resetFailedModels() {
      failedModels = [];
      currentSelection = null;
    },

    /**
     * Force refresh model selection
     */
    async refreshSelection() {
      failedModels = [];
      currentSelection = await selectBestModel({ apiKey });
      return currentSelection;
    }
  };
}

/**
 * Check if error is model-specific (should trigger fallback)
 * @param {Error} error - The error
 * @returns {boolean}
 */
function isModelSpecificError(error) {
  const message = error.message?.toLowerCase() || '';

  // Model not found or unavailable
  if (message.includes('not found') ||
      message.includes('not available') ||
      message.includes('model not supported') ||
      message.includes('invalid model')) {
    return true;
  }

  // Quota/billing issues for specific model
  if (message.includes('quota exceeded') ||
      message.includes('billing')) {
    return true;
  }

  // Transient errors - don't mark model as failed
  if (message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('500') ||
      message.includes('503')) {
    return false;
  }

  return false;
}

/**
 * Get all known model rankings
 * @returns {Object}
 */
export function getModelRankings() {
  return { ...MODEL_RANKINGS };
}

/**
 * Get default fallback chain
 * @returns {string[]}
 */
export function getDefaultFallbackChain() {
  return [...DEFAULT_FALLBACK_CHAIN];
}

/**
 * Clear model cache
 */
export function clearModelCache() {
  modelCache.clear();
}

export default {
  fetchAvailableModels,
  selectBestModel,
  createModelExecutor,
  getModelScore,
  getModelCapabilities,
  modelSupportsCapability,
  getModelRankings,
  getDefaultFallbackChain,
  clearModelCache,
  MODEL_RANKINGS,
  DEFAULT_FALLBACK_CHAIN
};
