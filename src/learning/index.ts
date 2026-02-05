/**
 * @fileoverview Hybrid AI Learning System
 * Main entry point for the learning module
 *
 * @description
 * Combines RAG (Retrieval Augmented Generation) with periodic fine-tuning
 * to create a continuously learning AI system for Ollama.
 *
 * Architecture:
 * - Real-time: RAG for instant context retrieval
 * - Long-term: Periodic fine-tuning for model improvement
 *
 * @module learning
 */

import trainingCollector from './training-collector.js';
import ragEngine from './rag-engine.js';
import dynamicPrompt from './dynamic-prompt.js';
import fineTuneExport from './fine-tune-export.js';

/**
 * @typedef {Object} LearningSystemConfig
 * @property {boolean} enableRAG - Enable RAG context retrieval
 * @property {boolean} collectTraining - Collect training data
 * @property {boolean} autoSaveRAG - Auto-save RAG store periodically
 * @property {number} ragSaveInterval - RAG save interval in ms
 */

/**
 * Default configuration
 * @type {LearningSystemConfig}
 */
const DEFAULT_CONFIG = {
  enableRAG: true,
  collectTraining: true,
  autoSaveRAG: true,
  ragSaveInterval: 5 * 60 * 1000 // 5 minutes
};

/** @type {LearningSystemConfig} */
let config = { ...DEFAULT_CONFIG };

/** @type {NodeJS.Timeout|null} */
let saveInterval = null;

/**
 * Initializes the learning system
 *
 * @param {Partial<LearningSystemConfig>} [options={}] - Configuration options
 * @returns {Promise<{
 *   ragReady: boolean,
 *   embeddingModel: string,
 *   documentsLoaded: number
 * }>}
 *
 * @example
 * const status = await learning.initialize({
 *   enableRAG: true,
 *   collectTraining: true
 * });
 */
export async function initialize(options = {}) {
  config = { ...DEFAULT_CONFIG, ...options };

  // Load RAG store
  let ragReady = false;
  let documentsLoaded = 0;

  if (config.enableRAG) {
    try {
      const { loaded } = await ragEngine.loadStore('default');
      documentsLoaded = loaded;
      ragReady = true;
    } catch (error) {
      console.warn('RAG store load failed:', error.message);
    }

    // Check embedding model
    const modelCheck = await ragEngine.checkEmbeddingModel();
    if (!modelCheck.available) {
      console.warn(`Embedding model not found. Run: ollama pull ${ragEngine.EMBEDDING_MODEL}`);
    }
  }

  // Start auto-save interval
  if (config.autoSaveRAG && config.enableRAG) {
    saveInterval = setInterval(async () => {
      try {
        await ragEngine.saveStore('default');
      } catch {
        // Silently fail auto-save
      }
    }, config.ragSaveInterval);
  }

  return {
    ragReady,
    embeddingModel: ragEngine.EMBEDDING_MODEL,
    documentsLoaded
  };
}

/**
 * Processes a user-AI interaction
 * Stores in RAG and collects for training
 *
 * @param {string} userMessage - User's message
 * @param {string} aiResponse - AI's response
 * @param {Object} [metadata={}] - Additional metadata
 * @returns {Promise<{
 *   ragStored: boolean,
 *   trainingCollected: boolean
 * }>}
 *
 * @example
 * await learning.processInteraction(
 *   'Write a sort function',
 *   'function sort(arr) { return arr.sort(); }',
 *   { task: 'code', model: 'llama3.2:3b' }
 * );
 */
export async function processInteraction(userMessage, aiResponse, metadata = {}) {
  let ragStored = false;
  let trainingCollected = false;

  // Add to dynamic prompt context
  await dynamicPrompt.addInteraction('user', userMessage);
  await dynamicPrompt.addInteraction('assistant', aiResponse);

  // Store in RAG
  if (config.enableRAG) {
    try {
      const id = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Store user query for retrieval
      await ragEngine.addDocument(`${id}-q`, userMessage, {
        type: 'query',
        ...metadata
      });

      // Store response for context
      await ragEngine.addDocument(`${id}-a`, aiResponse, {
        type: 'response',
        ...metadata
      });

      ragStored = true;
    } catch {
      // RAG storage failed, continue
    }
  }

  // Collect for training
  if (config.collectTraining) {
    try {
      // Collect as instruction
      const instructionResult = await trainingCollector.collectInstruction({
        instruction: userMessage,
        output: aiResponse,
        metadata
      });

      // Also collect as conversation
      await trainingCollector.collectConversation({
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: aiResponse }
        ]
      });

      trainingCollected = instructionResult.success;
    } catch {
      // Training collection failed, continue
    }
  }

  return { ragStored, trainingCollected };
}

/**
 * Generates a context-aware prompt for Ollama
 *
 * @param {string} userQuery - User's current query
 * @param {Object} [options={}] - Prompt options
 * @returns {Promise<{
 *   systemPrompt: string,
 *   contextSources: string[],
 *   tokens: number
 * }>}
 *
 * @example
 * const { systemPrompt } = await learning.generatePrompt(
 *   'How do I use React hooks?',
 *   { task: 'explain' }
 * );
 */
export async function generatePrompt(userQuery, options = {}) {
  const result = await dynamicPrompt.buildPrompt({
    query: userQuery,
    task: options.task || 'general',
    taskMetadata: options.metadata
  });

  return {
    systemPrompt: result.system,
    contextSources: result.sources,
    tokens: result.contextTokens
  };
}

/**
 * Quick prompt generation without RAG (faster)
 *
 * @param {string} [task='general'] - Task type
 * @returns {Promise<string>}
 */
export async function quickPrompt(task = 'general') {
  return dynamicPrompt.buildQuickPrompt(task);
}

/**
 * Prepares data for fine-tuning
 *
 * @param {Object} [options={}] - Export options
 * @returns {Promise<{
 *   trainPath: string,
 *   evalPath: string,
 *   notebookPath: string,
 *   modelfilePath: string,
 *   stats: Object
 * }>}
 *
 * @example
 * const result = await learning.prepareFineTuning({
 *   baseModel: 'llama3.2:3b',
 *   format: 'alpaca'
 * });
 */
export async function prepareFineTuning(options = {}) {
  // Export training data
  const exportResult = await fineTuneExport.exportForUnsloth(options);

  // Generate Colab notebook
  const notebookPath = await fineTuneExport.generateColabNotebook(options);

  // Generate Modelfile
  const modelfilePath = await fineTuneExport.generateModelfile(options);

  // Get stats
  const trainingStats = await trainingCollector.getTrainingStats();
  const exportStats = await fineTuneExport.getExportStats();

  return {
    trainPath: exportResult.trainPath,
    evalPath: exportResult.evalPath,
    trainCount: exportResult.trainCount,
    evalCount: exportResult.evalCount,
    notebookPath,
    modelfilePath,
    stats: {
      training: trainingStats,
      export: exportStats
    }
  };
}

/**
 * Gets system status and statistics
 *
 * @returns {Promise<{
 *   config: LearningSystemConfig,
 *   rag: Object,
 *   training: Object,
 *   preferences: Object
 * }>}
 */
export async function getStatus() {
  const ragStats = ragEngine.getStats();
  const trainingStats = await trainingCollector.getTrainingStats();
  const preferences = await dynamicPrompt.getPreferences();
  const embeddingCheck = await ragEngine.checkEmbeddingModel();

  return {
    config,
    rag: {
      ...ragStats,
      embeddingModelAvailable: embeddingCheck.available
    },
    training: trainingStats,
    preferences
  };
}

/**
 * Saves current state (RAG store, etc.)
 *
 * @returns {Promise<{saved: boolean}>}
 */
export async function save() {
  try {
    await ragEngine.saveStore('default');
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

/**
 * Shuts down the learning system
 *
 * @returns {Promise<void>}
 */
export async function shutdown() {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }

  // Final save
  await save();
}

/**
 * Updates user preferences
 *
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<void>}
 */
export async function updatePreferences(preferences) {
  await dynamicPrompt.savePreferences(preferences);
}

// Re-export sub-modules
export { trainingCollector, ragEngine, dynamicPrompt, fineTuneExport };

// Default export
export default {
  initialize,
  processInteraction,
  generatePrompt,
  quickPrompt,
  prepareFineTuning,
  getStatus,
  save,
  shutdown,
  updatePreferences,
  // Sub-modules
  trainingCollector,
  ragEngine,
  dynamicPrompt,
  fineTuneExport
};
