/**
 * PromptPrediction Module - AI-powered prompt prediction and intelligent queuing
 * GeminiHydra - School of the Wolf
 *
 * @module prompt-prediction
 */

// Core predictor
export {
  PromptPredictor,
  default as Predictor
} from './predictor.js';

// Intelligent queue with cost-aware routing
export {
  IntelligentQueue,
  SemanticAnalyzer,
  CostCalculator,
  ComplexityAnalyzer,
  RoutingEngine,
  BatchOptimizer,
  PROVIDER_COSTS,
  COMPLEXITY_THRESHOLDS
} from './intelligent-queue.js';

// Autocomplete providers
export {
  createPredictionProvider,
  HistoryLearningProvider,
  AgentAwarePredictionProvider
} from './prediction-provider.js';

// Queue integration
export {
  EnhancedPromptQueue,
  AgentQueueAdapter
} from './queue-integration.js';

// Re-export for convenience
import { PromptPredictor } from './predictor.js';
import { IntelligentQueue } from './intelligent-queue.js';
import {
  createPredictionProvider,
  HistoryLearningProvider,
  AgentAwarePredictionProvider
} from './prediction-provider.js';

/**
 * Create a fully configured prediction system
 * @param {Object} config - Configuration options
 * @returns {Object} Prediction system instance
 */
export function createPredictionSystem(config = {}) {
  const predictor = new PromptPredictor(config.predictor);
  const queue = new IntelligentQueue(config.queue);
  const provider = createPredictionProvider({
    ...config.provider,
    predictor // Share predictor instance
  });

  return {
    predictor,
    queue,
    provider,

    /**
     * Process a prompt through the intelligent system
     * @param {string} prompt - The prompt to process
     * @param {Object} options - Processing options
     * @returns {Object} Enqueue result with routing info
     */
    process(prompt, options = {}) {
      // Learn from prompt
      predictor.learn(prompt, { source: 'user' });

      // Enqueue with intelligent routing
      return queue.enqueue(prompt, options);
    },

    /**
     * Get predictions for partial input
     * @param {string} input - Partial input
     * @returns {Array} Predictions
     */
    predict(input) {
      return predictor.predict(input);
    },

    /**
     * Get system statistics
     * @returns {Object} Combined statistics
     */
    getStats() {
      return {
        predictor: predictor.getStats(),
        queue: queue.getStatus()
      };
    },

    /**
     * Export full system state
     * @returns {Object} Serialized state
     */
    export() {
      return {
        predictor: predictor.export(),
        queue: queue.export()
      };
    },

    /**
     * Import full system state
     * @param {Object} data - Serialized state
     */
    import(data) {
      if (data.predictor) predictor.import(data.predictor);
      if (data.queue) queue.import(data.queue);
    },

    /**
     * Cleanup resources
     */
    destroy() {
      queue.destroy();
    }
  };
}

// Default export
export default {
  PromptPredictor,
  IntelligentQueue,
  createPredictionProvider,
  HistoryLearningProvider,
  AgentAwarePredictionProvider,
  createPredictionSystem
};
