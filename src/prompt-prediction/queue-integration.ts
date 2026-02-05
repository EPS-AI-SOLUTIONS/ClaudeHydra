/**
 * Queue Integration - Bridges IntelligentQueue with existing PromptQueue
 * Adds cost-aware routing and prediction to the legacy queue system
 *
 * @module prompt-prediction/queue-integration
 */

import { EventEmitter } from 'events';
import { IntelligentQueue, ComplexityAnalyzer, RoutingEngine } from './intelligent-queue.js';
import { PromptPredictor } from './predictor.js';

/**
 * Enhanced queue that wraps existing PromptQueue with intelligent features
 */
export class EnhancedPromptQueue extends EventEmitter {
  /**
   * @param {Object} legacyQueue - Existing PromptQueue instance
   * @param {Object} config - Configuration
   */
  constructor(legacyQueue, config = {}) {
    super();

    this.legacyQueue = legacyQueue;
    this.intelligentQueue = new IntelligentQueue(config);
    this.predictor = new PromptPredictor(config.predictor);
    this.routingEngine = new RoutingEngine(config.routing);
    this.complexityAnalyzer = new ComplexityAnalyzer();

    // Sync mode: 'intelligent', 'legacy', 'hybrid'
    this.syncMode = config.syncMode || 'hybrid';

    // Bind events
    this._bindEvents();
  }

  /**
   * Bind event handlers between queues
   */
  _bindEvents() {
    // Forward intelligent queue events
    this.intelligentQueue.on('enqueued', item => {
      this.emit('enqueued', item);
    });

    this.intelligentQueue.on('completed', item => {
      this.emit('completed', item);
      // Learn from successful completion
      this.predictor.learn(item.prompt, {
        success: true,
        duration: item.duration,
        provider: item.routing?.provider
      });
    });

    this.intelligentQueue.on('failed', item => {
      this.emit('failed', item);
    });
  }

  /**
   * Enqueue a prompt with intelligent routing
   * @param {string} prompt - The prompt
   * @param {Object} options - Options
   * @returns {Object} Enqueue result
   */
  async enqueue(prompt, options = {}) {
    // Analyze complexity
    const complexity = this.complexityAnalyzer.analyze(prompt);

    // Get routing decision
    const routing = this.routingEngine.selectProvider(prompt, options);

    // Get predictions for context
    const predictions = this.predictor.predict(prompt.slice(0, 50));

    const enhancedOptions = {
      ...options,
      complexity,
      routing,
      predictions: predictions.slice(0, 3),
      timestamp: Date.now()
    };

    // Enqueue based on sync mode
    if (this.syncMode === 'legacy') {
      return this._enqueueLegacy(prompt, enhancedOptions);
    } else if (this.syncMode === 'intelligent') {
      return this._enqueueIntelligent(prompt, enhancedOptions);
    } else {
      // Hybrid: use intelligent for routing, legacy for execution
      return this._enqueueHybrid(prompt, enhancedOptions);
    }
  }

  /**
   * Enqueue to legacy queue only
   */
  async _enqueueLegacy(prompt, options) {
    if (this.legacyQueue?.enqueue) {
      return this.legacyQueue.enqueue(prompt, options);
    }
    throw new Error('Legacy queue not available');
  }

  /**
   * Enqueue to intelligent queue only
   */
  _enqueueIntelligent(prompt, options) {
    return this.intelligentQueue.enqueue(prompt, options);
  }

  /**
   * Hybrid mode: intelligent routing with legacy execution
   */
  async _enqueueHybrid(prompt, options) {
    // Use intelligent queue for routing decision
    const result = this.intelligentQueue.enqueue(prompt, options);

    // Also add to legacy queue if available (for backup/compatibility)
    if (this.legacyQueue?.enqueue) {
      try {
        await this.legacyQueue.enqueue(prompt, {
          ...options,
          intelligentId: result.id,
          routing: result.routing
        });
      } catch (error) {
        // Log but don't fail
        console.warn('Legacy queue enqueue failed:', error.message);
      }
    }

    return result;
  }

  /**
   * Get next item to process
   * @returns {Object|null} Next item
   */
  dequeue() {
    if (this.syncMode === 'legacy' && this.legacyQueue?.dequeue) {
      return this.legacyQueue.dequeue();
    }
    return this.intelligentQueue.dequeue();
  }

  /**
   * Mark item as completed
   * @param {string} id - Item ID
   * @param {Object} result - Result data
   */
  complete(id, result) {
    this.intelligentQueue.complete(id, result);

    // Also complete in legacy if exists
    if (this.legacyQueue?.complete) {
      try {
        this.legacyQueue.complete(id, result);
      } catch {
        // Ignore legacy errors
      }
    }
  }

  /**
   * Mark item as failed
   * @param {string} id - Item ID
   * @param {Error} error - Error
   */
  fail(id, error) {
    this.intelligentQueue.fail(id, error);

    if (this.legacyQueue?.fail) {
      try {
        this.legacyQueue.fail(id, error);
      } catch {
        // Ignore legacy errors
      }
    }
  }

  /**
   * Get combined status
   * @returns {Object} Status
   */
  getStatus() {
    const intelligent = this.intelligentQueue.getStatus();
    const legacy = this.legacyQueue?.getStatus?.() || {};

    return {
      mode: this.syncMode,
      intelligent,
      legacy,
      predictor: this.predictor.getStats()
    };
  }

  /**
   * Find similar queued prompts
   * @param {string} prompt - Prompt to compare
   * @returns {Array} Similar items
   */
  findSimilar(prompt) {
    return this.intelligentQueue.findSimilar(prompt);
  }

  /**
   * Get predictions for input
   * @param {string} input - Partial input
   * @returns {Array} Predictions
   */
  predict(input) {
    return this.predictor.predict(input);
  }

  /**
   * Export state
   * @returns {Object} Serialized state
   */
  export() {
    return {
      intelligent: this.intelligentQueue.export(),
      predictor: this.predictor.export()
    };
  }

  /**
   * Import state
   * @param {Object} data - Serialized state
   */
  import(data) {
    if (data.intelligent) this.intelligentQueue.import(data.intelligent);
    if (data.predictor) this.predictor.import(data.predictor);
  }

  /**
   * Cleanup
   */
  destroy() {
    this.intelligentQueue.destroy();
    this.removeAllListeners();
  }
}

/**
 * Adapter for AgentQueueManager integration
 * Adds intelligent routing to agent-based queuing
 */
export class AgentQueueAdapter {
  constructor(agentQueueManager, config = {}) {
    this.manager = agentQueueManager;
    this.routingEngine = new RoutingEngine(config);
    this.complexityAnalyzer = new ComplexityAnalyzer();
  }

  /**
   * Route prompt to best agent with cost consideration
   * @param {string} prompt - The prompt
   * @param {Object} options - Options
   * @returns {Object} Routing decision
   */
  routePrompt(prompt, options = {}) {
    const complexity = this.complexityAnalyzer.analyze(prompt);
    const routing = this.routingEngine.selectProvider(prompt, options);

    // Map complexity to agent recommendation
    const agentRecommendation = this._mapComplexityToAgent(complexity, prompt);

    return {
      complexity,
      routing,
      recommendedAgent: agentRecommendation,
      estimatedCost: routing.cost,
      provider: routing.provider,
      model: routing.model
    };
  }

  /**
   * Map complexity to appropriate agent
   */
  _mapComplexityToAgent(complexity, prompt) {
    const promptLower = prompt.toLowerCase();

    // Check for specific patterns first
    if (/security|threat|attack/.test(promptLower)) return 'Geralt';
    if (/test|qa|bug/.test(promptLower)) return 'Triss';
    if (/document|explain/.test(promptLower)) return 'Jaskier';
    if (/deploy|docker|ci/.test(promptLower)) return 'Eskel';
    if (/debug|profile|performance/.test(promptLower)) return 'Lambert';
    if (/database|sql|data/.test(promptLower)) return 'Zoltan';
    if (/api|integration/.test(promptLower)) return 'Philippa';
    if (/plan|strategy/.test(promptLower)) return 'Dijkstra';
    if (/review|mentor/.test(promptLower)) return 'Vesemir';

    // Fall back to complexity-based selection
    switch (complexity.level) {
      case 'simple': return 'Ciri';
      case 'moderate': return 'Yennefer';
      case 'complex': return 'Regis';
      case 'advanced': return 'Regis';
      default: return 'Yennefer';
    }
  }

  /**
   * Enqueue with agent routing
   * @param {string} prompt - The prompt
   * @param {Object} options - Options
   */
  async enqueueWithRouting(prompt, options = {}) {
    const routing = this.routePrompt(prompt, options);

    // Use agent-specific channel if available
    if (this.manager?.getChannel) {
      const channel = this.manager.getChannel(routing.recommendedAgent);
      if (channel?.enqueue) {
        return channel.enqueue(prompt, {
          ...options,
          routing
        });
      }
    }

    // Fallback to manager enqueue
    if (this.manager?.enqueue) {
      return this.manager.enqueue(prompt, {
        ...options,
        routing,
        agent: routing.recommendedAgent
      });
    }

    throw new Error('No queue available');
  }
}

// Export default
export default {
  EnhancedPromptQueue,
  AgentQueueAdapter
};
