/**
 * IntelligentQueue - Cost-aware routing and semantic batch optimization
 * Integrates with PromptPredictor for smart scheduling
 *
 * @module prompt-prediction/intelligent-queue
 */

import { EventEmitter } from 'events';
import { Priority, Status } from '../prompt-queue.js';

/**
 * Provider cost configuration (cost per 1K tokens)
 */
export const PROVIDER_COSTS = {
  ollama: {
    'llama3.2:1b': { input: 0, output: 0, speed: 'fast', quality: 0.6 },
    'llama3.2:3b': { input: 0, output: 0, speed: 'medium', quality: 0.75 },
    'phi3:mini': { input: 0, output: 0, speed: 'medium', quality: 0.7 },
    'qwen2.5-coder:1.5b': { input: 0, output: 0, speed: 'fast', quality: 0.7 }
  },
  gemini: {
    'gemini-2.0-flash': { input: 0.075, output: 0.30, speed: 'fast', quality: 0.85 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00, speed: 'slow', quality: 0.95 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30, speed: 'fast', quality: 0.8 }
  },
  anthropic: {
    'claude-3-5-sonnet': { input: 3.00, output: 15.00, speed: 'medium', quality: 0.95 },
    'claude-3-haiku': { input: 0.25, output: 1.25, speed: 'fast', quality: 0.8 }
  }
};

/**
 * Task complexity thresholds
 */
export const COMPLEXITY_THRESHOLDS = {
  simple: { maxTokens: 100, maxScore: 2 },
  moderate: { maxTokens: 500, maxScore: 5 },
  complex: { maxTokens: 2000, maxScore: 8 },
  advanced: { maxTokens: Infinity, maxScore: Infinity }
};

/**
 * Semantic similarity calculator using TF-IDF-like approach
 */
class SemanticAnalyzer {
  constructor() {
    this.vocabulary = new Map();
    this.documentFrequency = new Map();
    this.totalDocuments = 0;
  }

  /**
   * Tokenize and normalize text
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  /**
   * Add document to corpus for IDF calculation
   */
  addDocument(text) {
    const tokens = new Set(this.tokenize(text));
    this.totalDocuments++;

    for (const token of tokens) {
      this.documentFrequency.set(
        token,
        (this.documentFrequency.get(token) || 0) + 1
      );
    }
  }

  /**
   * Calculate TF-IDF vector
   */
  getTfIdfVector(text) {
    const tokens = this.tokenize(text);
    const termFreq = new Map();

    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    const vector = new Map();
    for (const [term, tf] of termFreq) {
      const df = this.documentFrequency.get(term) || 1;
      const idf = Math.log((this.totalDocuments + 1) / (df + 1)) + 1;
      vector.set(term, (tf / tokens.length) * idf);
    }

    return vector;
  }

  /**
   * Calculate cosine similarity between two texts
   */
  similarity(text1, text2) {
    const vec1 = this.getTfIdfVector(text1);
    const vec2 = this.getTfIdfVector(text2);

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (const [term, val] of vec1) {
      norm1 += val * val;
      if (vec2.has(term)) {
        dotProduct += val * vec2.get(term);
      }
    }

    for (const [, val] of vec2) {
      norm2 += val * val;
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Find similar prompts from a list
   */
  findSimilar(prompt, candidates, threshold = 0.5) {
    return candidates
      .map(c => ({ prompt: c, similarity: this.similarity(prompt, c.text || c) }))
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  }
}

/**
 * Cost calculator for provider/model selection
 */
class CostCalculator {
  constructor(config = {}) {
    this.costs = { ...PROVIDER_COSTS, ...config.customCosts };
    this.budgetLimit = config.budgetLimit || Infinity;
    this.totalSpent = 0;
    this.costHistory = [];
  }

  /**
   * Estimate cost for a prompt
   */
  estimateCost(prompt, provider, model) {
    const pricing = this.costs[provider]?.[model];
    if (!pricing) return { cost: 0, breakdown: null };

    // Estimate tokens (rough: ~4 chars per token)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(inputTokens * 1.5); // Assume 1.5x response

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;

    return {
      cost: inputCost + outputCost,
      breakdown: {
        inputTokens,
        outputTokens,
        inputCost,
        outputCost,
        provider,
        model
      }
    };
  }

  /**
   * Record actual cost after completion
   */
  recordCost(cost, metadata = {}) {
    this.totalSpent += cost;
    this.costHistory.push({
      cost,
      timestamp: Date.now(),
      ...metadata
    });
  }

  /**
   * Check if within budget
   */
  withinBudget(estimatedCost) {
    return (this.totalSpent + estimatedCost) <= this.budgetLimit;
  }

  /**
   * Get cost statistics
   */
  getStats() {
    return {
      totalSpent: this.totalSpent,
      remaining: this.budgetLimit - this.totalSpent,
      history: this.costHistory.slice(-100)
    };
  }
}

/**
 * Complexity analyzer for routing decisions
 */
class ComplexityAnalyzer {
  constructor() {
    this.patterns = {
      code: /```|function|class|def |const |let |var |import |export |async |await /gi,
      multiTask: /\d\.\s|•|\*\s|-\s|firstly|secondly|then|finally|step\s*\d/gi,
      technical: /api|database|async|parallel|thread|memory|performance|cache|queue|stream|algorithm|architecture/gi,
      reasoning: /explain|analyze|compare|contrast|evaluate|argue|justify|design|optimize/gi,
      simple: /what is|how to|define|list|show|get|set|quick|simple|easy/gi
    };
  }

  /**
   * Analyze prompt complexity
   */
  analyze(prompt) {
    const wordCount = prompt.split(/\s+/).length;
    const codeMatches = (prompt.match(this.patterns.code) || []).length;
    const multiTaskMatches = (prompt.match(this.patterns.multiTask) || []).length;
    const technicalMatches = (prompt.match(this.patterns.technical) || []).length;
    const reasoningMatches = (prompt.match(this.patterns.reasoning) || []).length;
    const simpleMatches = (prompt.match(this.patterns.simple) || []).length;

    let score = 0;
    score += Math.min(wordCount / 20, 3);
    score += codeMatches * 0.5;
    score += multiTaskMatches * 1.5;
    score += technicalMatches * 0.3;
    score += reasoningMatches * 0.8;
    score -= simpleMatches * 0.5;

    score = Math.max(0, Math.min(10, score));

    let level;
    if (score <= COMPLEXITY_THRESHOLDS.simple.maxScore) level = 'simple';
    else if (score <= COMPLEXITY_THRESHOLDS.moderate.maxScore) level = 'moderate';
    else if (score <= COMPLEXITY_THRESHOLDS.complex.maxScore) level = 'complex';
    else level = 'advanced';

    return {
      score: Math.round(score * 10) / 10,
      level,
      wordCount,
      features: {
        hasCode: codeMatches > 0,
        isMultiTask: multiTaskMatches > 0,
        technicalTerms: technicalMatches,
        requiresReasoning: reasoningMatches > 0
      }
    };
  }
}

/**
 * Intelligent routing engine
 */
class RoutingEngine {
  constructor(config = {}) {
    this.costCalculator = new CostCalculator(config);
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.preferLocal = config.preferLocal ?? true;
    this.qualityThreshold = config.qualityThreshold || 0.7;
  }

  /**
   * Select optimal provider and model for a prompt
   */
  selectProvider(prompt, options = {}) {
    const complexity = this.complexityAnalyzer.analyze(prompt);
    const candidates = [];

    // Evaluate Ollama models (free, local)
    if (this.preferLocal) {
      for (const [model, specs] of Object.entries(PROVIDER_COSTS.ollama)) {
        if (specs.quality >= this.getRequiredQuality(complexity.level)) {
          candidates.push({
            provider: 'ollama',
            model,
            cost: 0,
            quality: specs.quality,
            speed: specs.speed,
            local: true
          });
        }
      }
    }

    // Evaluate cloud providers for complex tasks
    if (complexity.level === 'complex' || complexity.level === 'advanced' || options.forceCloud) {
      for (const [provider, models] of Object.entries(PROVIDER_COSTS)) {
        if (provider === 'ollama') continue;

        for (const [model, specs] of Object.entries(models)) {
          const estimate = this.costCalculator.estimateCost(prompt, provider, model);

          if (this.costCalculator.withinBudget(estimate.cost) &&
              specs.quality >= this.getRequiredQuality(complexity.level)) {
            candidates.push({
              provider,
              model,
              cost: estimate.cost,
              quality: specs.quality,
              speed: specs.speed,
              local: false
            });
          }
        }
      }
    }

    // Sort by: cost (ascending), quality (descending), speed
    candidates.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      if (a.quality !== b.quality) return b.quality - a.quality;
      const speedRank = { fast: 0, medium: 1, slow: 2 };
      return speedRank[a.speed] - speedRank[b.speed];
    });

    const selected = candidates[0] || {
      provider: 'ollama',
      model: 'llama3.2:3b',
      cost: 0,
      quality: 0.75,
      speed: 'medium',
      local: true,
      fallback: true
    };

    return {
      ...selected,
      complexity,
      alternatives: candidates.slice(1, 4)
    };
  }

  /**
   * Get required quality level based on complexity
   */
  getRequiredQuality(level) {
    const requirements = {
      simple: 0.5,
      moderate: 0.65,
      complex: 0.8,
      advanced: 0.9
    };
    return requirements[level] || this.qualityThreshold;
  }
}

/**
 * Batch optimizer for grouping similar prompts
 */
class BatchOptimizer {
  constructor() {
    this.semanticAnalyzer = new SemanticAnalyzer();
    this.batches = new Map();
    this.batchTimeout = 5000; // 5 seconds
  }

  /**
   * Add prompt to potential batch
   */
  addToBatch(item) {
    // Find similar batch
    for (const [batchId, batch] of this.batches) {
      if (batch.items.length < 5 &&
          Date.now() - batch.createdAt < this.batchTimeout) {
        const similarity = this.semanticAnalyzer.similarity(
          item.prompt,
          batch.representative
        );

        if (similarity > 0.6) {
          batch.items.push(item);
          return { batched: true, batchId };
        }
      }
    }

    // Create new batch
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.batches.set(batchId, {
      id: batchId,
      items: [item],
      representative: item.prompt,
      createdAt: Date.now()
    });

    return { batched: true, batchId, isNew: true };
  }

  /**
   * Get batch ready for processing
   */
  getReadyBatch(batchId) {
    const batch = this.batches.get(batchId);
    if (!batch) return null;

    const isReady = batch.items.length >= 3 ||
                   Date.now() - batch.createdAt >= this.batchTimeout;

    if (isReady) {
      this.batches.delete(batchId);
      return batch;
    }

    return null;
  }

  /**
   * Force flush all batches
   */
  flushAll() {
    const batches = [...this.batches.values()];
    this.batches.clear();
    return batches;
  }

  /**
   * Clean up old batches
   */
  cleanup() {
    const now = Date.now();
    for (const [batchId, batch] of this.batches) {
      if (now - batch.createdAt > this.batchTimeout * 2) {
        this.batches.delete(batchId);
      }
    }
  }
}

/**
 * Main IntelligentQueue class
 */
export class IntelligentQueue extends EventEmitter {
  constructor(config = {}) {
    super();

    this.routingEngine = new RoutingEngine(config);
    this.batchOptimizer = new BatchOptimizer();
    this.semanticAnalyzer = new SemanticAnalyzer();

    this.queue = [];
    this.processing = new Map();
    this.completed = [];
    this.maxCompleted = config.maxCompleted || 1000;

    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalCost: 0,
      byProvider: {},
      byComplexity: {}
    };

    // Periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.batchOptimizer.cleanup();
      this._pruneCompleted();
    }, 30000);
  }

  /**
   * Enqueue a prompt with intelligent routing
   */
  enqueue(prompt, options = {}) {
    const id = options.id || `iq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Analyze and route
    const routing = this.routingEngine.selectProvider(prompt, options);

    // Learn from prompt
    this.semanticAnalyzer.addDocument(prompt);

    const item = {
      id,
      prompt,
      options,
      routing,
      priority: options.priority ?? Priority.NORMAL,
      status: Status.PENDING,
      createdAt: Date.now(),
      estimatedCost: routing.cost
    };

    // Try batch optimization for non-urgent items
    if (item.priority > Priority.HIGH && !options.noBatch) {
      const batchResult = this.batchOptimizer.addToBatch(item);
      item.batchId = batchResult.batchId;
    }

    this.queue.push(item);
    this._sortQueue();

    this.stats.totalEnqueued++;
    this.emit('enqueued', item);

    return {
      id,
      routing,
      position: this.queue.findIndex(i => i.id === id) + 1
    };
  }

  /**
   * Get next item to process
   */
  dequeue() {
    const item = this.queue.shift();
    if (!item) return null;

    item.status = Status.RUNNING;
    item.startedAt = Date.now();
    this.processing.set(item.id, item);

    this.emit('dequeued', item);
    return item;
  }

  /**
   * Mark item as completed
   */
  complete(id, result) {
    const item = this.processing.get(id);
    if (!item) return false;

    item.status = Status.COMPLETED;
    item.completedAt = Date.now();
    item.duration = item.completedAt - item.startedAt;
    item.result = result;

    this.processing.delete(id);
    this.completed.push(item);

    // Update stats
    this.stats.totalProcessed++;
    this.stats.totalCost += item.estimatedCost;

    const provider = item.routing.provider;
    this.stats.byProvider[provider] = (this.stats.byProvider[provider] || 0) + 1;

    const complexity = item.routing.complexity.level;
    this.stats.byComplexity[complexity] = (this.stats.byComplexity[complexity] || 0) + 1;

    this.routingEngine.costCalculator.recordCost(item.estimatedCost, {
      provider,
      model: item.routing.model,
      duration: item.duration
    });

    this.emit('completed', item);
    return true;
  }

  /**
   * Mark item as failed
   */
  fail(id, error) {
    const item = this.processing.get(id);
    if (!item) return false;

    item.status = Status.FAILED;
    item.error = error;
    item.completedAt = Date.now();

    this.processing.delete(id);
    this.completed.push(item);

    this.emit('failed', item);
    return true;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.length,
      stats: { ...this.stats },
      costStats: this.routingEngine.costCalculator.getStats()
    };
  }

  /**
   * Get item by ID
   */
  getItem(id) {
    return this.queue.find(i => i.id === id) ||
           this.processing.get(id) ||
           this.completed.find(i => i.id === id);
  }

  /**
   * Find similar queued prompts
   */
  findSimilar(prompt, threshold = 0.5) {
    const candidates = this.queue.map(i => ({ text: i.prompt, id: i.id }));
    return this.semanticAnalyzer.findSimilar(prompt, candidates, threshold);
  }

  /**
   * Sort queue by priority and other factors
   */
  _sortQueue() {
    this.queue.sort((a, b) => {
      // Priority first
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Then estimated cost (cheaper first for same priority)
      if (a.estimatedCost !== b.estimatedCost) return a.estimatedCost - b.estimatedCost;
      // Then FIFO
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Prune old completed items
   */
  _pruneCompleted() {
    if (this.completed.length > this.maxCompleted) {
      this.completed = this.completed.slice(-this.maxCompleted);
    }
  }

  /**
   * Cleanup on destroy
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.removeAllListeners();
  }

  /**
   * Export state for persistence
   */
  export() {
    return {
      queue: this.queue,
      stats: this.stats,
      completed: this.completed.slice(-100)
    };
  }

  /**
   * Import state from persistence
   */
  import(data) {
    if (data.queue) this.queue = data.queue;
    if (data.stats) this.stats = { ...this.stats, ...data.stats };
    if (data.completed) this.completed = data.completed;
  }
}

// Export classes for direct use
export {
  SemanticAnalyzer,
  CostCalculator,
  ComplexityAnalyzer,
  RoutingEngine,
  BatchOptimizer
};

// Default export
export default IntelligentQueue;
