/**
 * PromptPredictionProvider - Autocomplete provider using PromptPredictor
 * Integrates AI-powered predictions into the CLI autocomplete system
 *
 * @module prompt-prediction/prediction-provider
 */

import { PromptPredictor } from './predictor.js';

/**
 * @typedef {Object} PredictionProviderConfig
 * @property {number} [maxSuggestions=5] - Maximum suggestions to return
 * @property {number} [minConfidence=0.3] - Minimum confidence threshold
 * @property {number} [priority=50] - Provider priority in autocomplete chain
 * @property {boolean} [showConfidence=false] - Show confidence scores in suggestions
 * @property {string[]} [categories] - Filter by categories
 */

/**
 * Creates a PromptPredictionProvider for the Autocomplete system
 * @param {PredictionProviderConfig} config - Configuration
 * @returns {Object} Autocomplete provider
 */
export function createPredictionProvider(config = {}) {
  const {
    maxSuggestions = 5,
    minConfidence = 0.3,
    priority = 50,
    showConfidence = false,
    categories = null
  } = config;

  // Shared predictor instance
  const predictor = new PromptPredictor({
    maxPredictions: maxSuggestions,
    minConfidence
  });

  return {
    name: 'prompt-prediction',
    priority,
    predictor, // Expose for external learning

    /**
     * Complete function called by Autocomplete system
     * @param {string} input - Current input
     * @param {number} cursorPos - Cursor position
     * @returns {Promise<Object|null>} Completion result
     */
    async complete(input, cursorPos) {
      // Get text up to cursor
      const prefix = input.slice(0, cursorPos);

      // Skip if too short
      if (prefix.length < 2) {
        return null;
      }

      // Get predictions
      const predictions = predictor.predict(prefix, {
        maxResults: maxSuggestions,
        categories
      });

      if (predictions.length === 0) {
        return null;
      }

      // Format suggestions
      const suggestions = predictions.map(pred => {
        if (showConfidence) {
          return `${pred.text} (${Math.round(pred.confidence * 100)}%)`;
        }
        return pred.text;
      });

      // Find common prefix for completion
      const commonPrefix = findCommonPrefix(suggestions);

      return {
        suggestions,
        startIndex: 0,
        endIndex: cursorPos,
        prefix: commonPrefix,
        metadata: {
          source: 'prompt-prediction',
          predictions: predictions.map(p => ({
            text: p.text,
            confidence: p.confidence,
            source: p.source
          }))
        }
      };
    },

    /**
     * Learn from a completed prompt
     * @param {string} prompt - The prompt to learn from
     * @param {Object} context - Additional context
     */
    learn(prompt, context = {}) {
      predictor.learn(prompt, context);
    },

    /**
     * Export predictor state for persistence
     * @returns {Object} Serialized state
     */
    export() {
      return predictor.export();
    },

    /**
     * Import predictor state from persistence
     * @param {Object} data - Serialized state
     */
    import(data) {
      predictor.import(data);
    },

    /**
     * Get prediction statistics
     * @returns {Object} Statistics
     */
    getStats() {
      return predictor.getStats();
    }
  };
}

/**
 * Find common prefix of strings
 * @param {string[]} strings - Array of strings
 * @returns {string} Common prefix
 */
function findCommonPrefix(strings) {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];

  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

/**
 * HistoryLearningProvider - Learns from command history
 * Wraps PromptPredictor with history integration
 */
export class HistoryLearningProvider {
  constructor(historyManager, config = {}) {
    this.historyManager = historyManager;
    this.provider = createPredictionProvider(config);
    this.initialized = false;
  }

  /**
   * Initialize by learning from existing history
   */
  async initialize() {
    if (this.initialized) return;

    const history = this.historyManager?.getHistory?.() || [];
    for (const entry of history) {
      const prompt = typeof entry === 'string' ? entry : entry.command;
      if (prompt) {
        this.provider.learn(prompt, { source: 'history' });
      }
    }

    this.initialized = true;
  }

  /**
   * Get the autocomplete provider
   * @returns {Object} Provider for Autocomplete system
   */
  getProvider() {
    return {
      name: 'history-prediction',
      priority: this.provider.priority || 50,

      complete: async (input, cursorPos) => {
        await this.initialize();
        return this.provider.complete(input, cursorPos);
      }
    };
  }

  /**
   * Record a new command and learn from it
   * @param {string} command - The command to record
   */
  recordCommand(command) {
    this.provider.learn(command, { source: 'user', timestamp: Date.now() });
  }
}

/**
 * AgentAwarePredictionProvider - Predictions aware of Witcher agents
 * Suggests prompts optimized for specific agents
 */
export class AgentAwarePredictionProvider {
  constructor(config = {}) {
    this.provider = createPredictionProvider({
      ...config,
      priority: config.priority || 60
    });

    // Agent-specific patterns
    this.agentPatterns = {
      Geralt: ['security check', 'threat analysis', 'vulnerability scan', 'audit'],
      Yennefer: ['implement', 'refactor', 'architecture', 'design pattern'],
      Triss: ['write test', 'test coverage', 'validate', 'fix bug'],
      Jaskier: ['document', 'explain', 'summarize', 'write readme'],
      Vesemir: ['review', 'best practice', 'improve', 'optimize'],
      Ciri: ['quick', 'simple', 'fast', 'list'],
      Eskel: ['deploy', 'docker', 'ci/cd', 'kubernetes'],
      Lambert: ['debug', 'profile', 'performance', 'memory leak'],
      Zoltan: ['database', 'migration', 'query', 'schema'],
      Regis: ['analyze', 'research', 'investigate', 'complex'],
      Dijkstra: ['plan', 'strategy', 'coordinate', 'roadmap'],
      Philippa: ['api', 'integration', 'webhook', 'external service']
    };

    // Pre-populate with agent patterns
    this._initializeAgentPatterns();
  }

  _initializeAgentPatterns() {
    for (const [agent, patterns] of Object.entries(this.agentPatterns)) {
      for (const pattern of patterns) {
        this.provider.learn(pattern, {
          category: 'agent-pattern',
          agent,
          source: 'builtin'
        });
      }
    }
  }

  /**
   * Get suggestions for a specific agent
   * @param {string} input - Current input
   * @param {string} agent - Agent name
   * @returns {Promise<Object|null>} Completion result
   */
  async completeForAgent(input, agent) {
    const agentPrompts = this.agentPatterns[agent] || [];

    // Filter predictions to agent-relevant ones
    const result = await this.provider.complete(input, input.length);

    if (!result) return null;

    // Boost agent-specific suggestions
    const boosted = result.suggestions.map(suggestion => {
      const isAgentRelevant = agentPrompts.some(p =>
        suggestion.toLowerCase().includes(p.toLowerCase())
      );
      return {
        text: suggestion,
        boost: isAgentRelevant ? 0.2 : 0
      };
    });

    // Re-sort with boost
    boosted.sort((a, b) => b.boost - a.boost);

    return {
      ...result,
      suggestions: boosted.map(b => b.text)
    };
  }

  /**
   * Get the autocomplete provider
   * @returns {Object} Provider for Autocomplete system
   */
  getProvider() {
    return {
      name: 'agent-prediction',
      priority: 60,
      complete: (input, cursorPos) => this.provider.complete(input, cursorPos)
    };
  }

  /**
   * Learn from agent execution
   * @param {string} prompt - The prompt
   * @param {string} agent - Agent that handled it
   * @param {boolean} success - Whether execution succeeded
   */
  learnFromExecution(prompt, agent, success) {
    this.provider.learn(prompt, {
      category: 'execution',
      agent,
      success,
      timestamp: Date.now()
    });
  }
}

// Default export
export default {
  createPredictionProvider,
  HistoryLearningProvider,
  AgentAwarePredictionProvider
};
