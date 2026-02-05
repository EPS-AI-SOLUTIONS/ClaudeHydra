/**
 * PromptPredictor - AI-powered prompt prediction engine
 * Uses N-gram analysis, pattern matching, and semantic similarity
 *
 * @module prompt-prediction/predictor
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} PredictionResult
 * @property {string} text - Predicted prompt text
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} source - Prediction source (ngram, pattern, semantic, template)
 * @property {Object} metadata - Additional metadata
 */

/**
 * @typedef {Object} PredictorConfig
 * @property {number} maxNgramSize - Maximum N-gram size (default: 4)
 * @property {number} minConfidence - Minimum confidence threshold (default: 0.3)
 * @property {number} maxPredictions - Maximum predictions to return (default: 5)
 * @property {boolean} enableSemanticAnalysis - Enable semantic analysis (default: true)
 * @property {boolean} enablePatternLearning - Learn from usage patterns (default: true)
 * @property {number} decayFactor - Time decay factor for frequency (default: 0.95)
 */

/**
 * N-gram token for statistical analysis
 */
class NGramToken {
  constructor(tokens, followedBy) {
    this.tokens = tokens;
    this.followedBy = new Map(); // next token -> frequency
    this.totalCount = 0;
    this.lastUsed = Date.now();

    if (followedBy) {
      this.addFollower(followedBy);
    }
  }

  addFollower(token) {
    const count = this.followedBy.get(token) || 0;
    this.followedBy.set(token, count + 1);
    this.totalCount++;
    this.lastUsed = Date.now();
  }

  getProbability(token) {
    if (this.totalCount === 0) return 0;
    return (this.followedBy.get(token) || 0) / this.totalCount;
  }

  getTopFollowers(n = 5) {
    return [...this.followedBy.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([token, count]) => ({
        token,
        probability: count / this.totalCount,
        count
      }));
  }
}

/**
 * Prompt pattern for template matching
 */
class PromptPattern {
  constructor(template, category, examples = []) {
    this.template = template;
    this.category = category;
    this.examples = examples;
    this.usageCount = 0;
    this.lastUsed = Date.now();
    this.successRate = 1.0;
    this.avgResponseTime = 0;
  }

  matches(input) {
    const regex = this.template
      .replace(/\{[^}]+\}/g, '(.+)')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{/g, '{')
      .replace(/\\\}/g, '}');

    try {
      return new RegExp(`^${regex}`, 'i').test(input);
    } catch {
      return false;
    }
  }

  extractVariables(input) {
    const variableNames = [...this.template.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
    const regex = this.template.replace(/\{[^}]+\}/g, '(.+)');

    try {
      const match = input.match(new RegExp(regex, 'i'));
      if (!match) return {};

      const variables = {};
      variableNames.forEach((name, i) => {
        variables[name] = match[i + 1];
      });
      return variables;
    } catch {
      return {};
    }
  }

  complete(variables) {
    let result = this.template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  recordUsage(success = true, responseTime = 0) {
    this.usageCount++;
    this.lastUsed = Date.now();
    this.successRate = (this.successRate * (this.usageCount - 1) + (success ? 1 : 0)) / this.usageCount;
    this.avgResponseTime = (this.avgResponseTime * (this.usageCount - 1) + responseTime) / this.usageCount;
  }
}

/**
 * Session context for contextual predictions
 */
class SessionContext {
  constructor() {
    this.prompts = [];
    this.responses = [];
    this.topics = new Set();
    this.entities = new Map();
    this.mood = 'neutral';
    this.taskType = null;
    this.startTime = Date.now();
  }

  addPrompt(prompt, response = null) {
    this.prompts.push({
      text: prompt,
      timestamp: Date.now(),
      response
    });

    // Extract topics/entities
    this._extractContext(prompt);
  }

  _extractContext(text) {
    // Simple keyword extraction
    const keywords = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    keywords.forEach(kw => this.topics.add(kw));

    // Detect task type
    if (/write|create|implement|build|develop/i.test(text)) {
      this.taskType = 'creation';
    } else if (/fix|debug|solve|repair/i.test(text)) {
      this.taskType = 'debugging';
    } else if (/explain|what|how|why/i.test(text)) {
      this.taskType = 'explanation';
    } else if (/refactor|improve|optimize/i.test(text)) {
      this.taskType = 'optimization';
    } else if (/test|validate|check/i.test(text)) {
      this.taskType = 'testing';
    }
  }

  getRecentTopics(n = 10) {
    return [...this.topics].slice(-n);
  }

  getLastPrompt() {
    return this.prompts[this.prompts.length - 1]?.text || '';
  }

  getSessionLength() {
    return this.prompts.length;
  }
}

/**
 * Main PromptPredictor class
 * Provides intelligent prompt predictions based on multiple signals
 */
export class PromptPredictor extends EventEmitter {
  /** @type {Map<string, NGramToken>} */
  #ngramIndex = new Map();

  /** @type {PromptPattern[]} */
  #patterns = [];

  /** @type {Map<string, number>} */
  #frequencyMap = new Map();

  /** @type {SessionContext} */
  #sessionContext;

  /** @type {PredictorConfig} */
  #config;

  /** @type {string[]} */
  #vocabulary = [];

  /** @type {Map<string, Set<string>>} */
  #cooccurrenceMap = new Map();

  /**
   * Create a new PromptPredictor
   * @param {PredictorConfig} config - Configuration options
   */
  constructor(config = {}) {
    super();

    this.#config = {
      maxNgramSize: config.maxNgramSize || 4,
      minConfidence: config.minConfidence || 0.3,
      maxPredictions: config.maxPredictions || 5,
      enableSemanticAnalysis: config.enableSemanticAnalysis !== false,
      enablePatternLearning: config.enablePatternLearning !== false,
      decayFactor: config.decayFactor || 0.95,
      ...config
    };

    this.#sessionContext = new SessionContext();
    this._initializeDefaultPatterns();
  }

  /**
   * Initialize default prompt patterns
   * @private
   */
  _initializeDefaultPatterns() {
    const defaultPatterns = [
      // Code patterns
      { template: 'Write a {language} function that {functionality}', category: 'coding' },
      { template: 'Create a {type} class for {purpose}', category: 'coding' },
      { template: 'Implement {feature} in {file}', category: 'coding' },
      { template: 'Fix the {issue} in {location}', category: 'debugging' },
      { template: 'Debug the {problem} issue', category: 'debugging' },
      { template: 'Add {feature} to {component}', category: 'feature' },

      // Explanation patterns
      { template: 'Explain {concept}', category: 'explanation' },
      { template: 'How does {thing} work?', category: 'explanation' },
      { template: 'What is {concept}?', category: 'explanation' },
      { template: 'Why is {thing} happening?', category: 'explanation' },

      // Refactoring patterns
      { template: 'Refactor {code} to {improvement}', category: 'refactoring' },
      { template: 'Optimize {thing} for {goal}', category: 'optimization' },
      { template: 'Improve the {aspect} of {component}', category: 'optimization' },

      // Testing patterns
      { template: 'Write tests for {component}', category: 'testing' },
      { template: 'Test the {functionality}', category: 'testing' },
      { template: 'Add unit tests for {function}', category: 'testing' },

      // Documentation patterns
      { template: 'Document {component}', category: 'documentation' },
      { template: 'Add documentation for {thing}', category: 'documentation' },
      { template: 'Update the README with {info}', category: 'documentation' },

      // Analysis patterns
      { template: 'Analyze {code} for {issue}', category: 'analysis' },
      { template: 'Review {code}', category: 'review' },
      { template: 'Find {problem} in {codebase}', category: 'analysis' }
    ];

    defaultPatterns.forEach(p => {
      this.#patterns.push(new PromptPattern(p.template, p.category));
    });
  }

  /**
   * Tokenize input text for N-gram analysis
   * @param {string} text - Input text
   * @returns {string[]} Tokens
   * @private
   */
  _tokenize(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  /**
   * Generate N-gram key
   * @param {string[]} tokens - Token array
   * @returns {string} N-gram key
   * @private
   */
  _ngramKey(tokens) {
    return tokens.join('|');
  }

  /**
   * Learn from a prompt (update N-gram index)
   * @param {string} prompt - The prompt to learn from
   * @param {Object} [metadata] - Optional metadata
   */
  learn(prompt, metadata = {}) {
    const tokens = this._tokenize(prompt);

    // Update vocabulary
    tokens.forEach(token => {
      if (!this.#vocabulary.includes(token)) {
        this.#vocabulary.push(token);
      }
    });

    // Update frequency map
    const currentFreq = this.#frequencyMap.get(prompt) || 0;
    this.#frequencyMap.set(prompt, currentFreq + 1);

    // Build N-grams for various sizes
    for (let n = 1; n <= this.#config.maxNgramSize; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const ngram = tokens.slice(i, i + n);
        const key = this._ngramKey(ngram);
        const nextToken = tokens[i + n];

        if (nextToken) {
          let ngramToken = this.#ngramIndex.get(key);
          if (!ngramToken) {
            ngramToken = new NGramToken(ngram);
            this.#ngramIndex.set(key, ngramToken);
          }
          ngramToken.addFollower(nextToken);
        }
      }
    }

    // Build co-occurrence map
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
        const token1 = tokens[i];
        const token2 = tokens[j];

        if (!this.#cooccurrenceMap.has(token1)) {
          this.#cooccurrenceMap.set(token1, new Set());
        }
        this.#cooccurrenceMap.get(token1).add(token2);

        if (!this.#cooccurrenceMap.has(token2)) {
          this.#cooccurrenceMap.set(token2, new Set());
        }
        this.#cooccurrenceMap.get(token2).add(token1);
      }
    }

    // Update session context
    this.#sessionContext.addPrompt(prompt, metadata.response);

    // Learn patterns if enabled
    if (this.#config.enablePatternLearning) {
      this._learnPattern(prompt);
    }

    this.emit('learned', { prompt, tokens: tokens.length });
  }

  /**
   * Try to learn a new pattern from prompt
   * @param {string} prompt - The prompt
   * @private
   */
  _learnPattern(prompt) {
    // Simple pattern extraction: replace specific terms with placeholders
    const variablePatterns = [
      { regex: /\b(function|class|method|variable)\s+(\w+)/gi, placeholder: '{name}' },
      { regex: /\b(in|for|to)\s+(\w+\.\w+)/gi, placeholder: '{file}' },
      { regex: /\b(JavaScript|TypeScript|Python|Rust|Go|Java|C\+\+|Ruby)/gi, placeholder: '{language}' }
    ];

    let template = prompt;
    variablePatterns.forEach(({ regex, placeholder }) => {
      template = template.replace(regex, (match, prefix) => `${prefix} ${placeholder}`);
    });

    // Only add if it's different enough and looks like a template
    if (template !== prompt && template.includes('{')) {
      const existing = this.#patterns.find(p => p.template === template);
      if (!existing) {
        this.#patterns.push(new PromptPattern(template, 'learned', [prompt]));
        this.emit('patternLearned', { template });
      }
    }
  }

  /**
   * Predict next prompts based on partial input
   * @param {string} input - Partial input
   * @returns {PredictionResult[]} Predictions sorted by confidence
   */
  predict(input) {
    const predictions = [];
    const tokens = this._tokenize(input);

    // 1. N-gram based predictions
    const ngramPredictions = this._predictFromNgrams(tokens);
    predictions.push(...ngramPredictions);

    // 2. Pattern-based predictions
    const patternPredictions = this._predictFromPatterns(input);
    predictions.push(...patternPredictions);

    // 3. Frequency-based predictions
    const frequencyPredictions = this._predictFromFrequency(input);
    predictions.push(...frequencyPredictions);

    // 4. Context-based predictions
    if (this.#config.enableSemanticAnalysis) {
      const contextPredictions = this._predictFromContext(input);
      predictions.push(...contextPredictions);
    }

    // 5. Co-occurrence based predictions
    const cooccurrencePredictions = this._predictFromCooccurrence(tokens);
    predictions.push(...cooccurrencePredictions);

    // Deduplicate and sort
    const uniquePredictions = this._deduplicatePredictions(predictions);
    const filtered = uniquePredictions
      .filter(p => p.confidence >= this.#config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.#config.maxPredictions);

    return filtered;
  }

  /**
   * Predict from N-gram model
   * @param {string[]} tokens - Input tokens
   * @returns {PredictionResult[]} Predictions
   * @private
   */
  _predictFromNgrams(tokens) {
    const predictions = [];

    if (tokens.length === 0) return predictions;

    // Try different N-gram sizes (larger first for more context)
    for (let n = Math.min(this.#config.maxNgramSize, tokens.length); n >= 1; n--) {
      const ngram = tokens.slice(-n);
      const key = this._ngramKey(ngram);
      const ngramToken = this.#ngramIndex.get(key);

      if (ngramToken) {
        const topFollowers = ngramToken.getTopFollowers(3);

        topFollowers.forEach(({ token, probability }) => {
          // Complete the sentence with predicted tokens
          const completedTokens = [...tokens, token];
          let fullPrediction = completedTokens.join(' ');

          // Try to extend prediction
          fullPrediction = this._extendPrediction(completedTokens, 5);

          predictions.push({
            text: fullPrediction,
            confidence: probability * (n / this.#config.maxNgramSize), // Weight by N-gram size
            source: 'ngram',
            metadata: { ngramSize: n, probability }
          });
        });
      }
    }

    return predictions;
  }

  /**
   * Extend a prediction using greedy N-gram following
   * @param {string[]} tokens - Starting tokens
   * @param {number} maxExtend - Maximum tokens to add
   * @returns {string} Extended prediction
   * @private
   */
  _extendPrediction(tokens, maxExtend) {
    let extended = [...tokens];

    for (let i = 0; i < maxExtend; i++) {
      const ngram = extended.slice(-this.#config.maxNgramSize);
      const key = this._ngramKey(ngram);
      const ngramToken = this.#ngramIndex.get(key);

      if (!ngramToken) break;

      const topFollowers = ngramToken.getTopFollowers(1);
      if (topFollowers.length === 0 || topFollowers[0].probability < 0.2) break;

      extended.push(topFollowers[0].token);
    }

    return extended.join(' ');
  }

  /**
   * Predict from pattern templates
   * @param {string} input - Partial input
   * @returns {PredictionResult[]} Predictions
   * @private
   */
  _predictFromPatterns(input) {
    const predictions = [];
    const inputLower = input.toLowerCase();

    for (const pattern of this.#patterns) {
      // Check if input could be start of this pattern
      const templateStart = pattern.template.split('{')[0].toLowerCase().trim();

      if (templateStart.startsWith(inputLower) || inputLower.startsWith(templateStart)) {
        // Calculate confidence based on match quality and usage
        const matchQuality = this._calculateMatchQuality(input, pattern.template);
        const usageScore = Math.min(pattern.usageCount / 10, 1);
        const recencyScore = this._calculateRecencyScore(pattern.lastUsed);

        const confidence = (matchQuality * 0.5 + usageScore * 0.3 + recencyScore * 0.2) * pattern.successRate;

        predictions.push({
          text: pattern.template,
          confidence,
          source: 'pattern',
          metadata: {
            category: pattern.category,
            usageCount: pattern.usageCount,
            template: true
          }
        });
      }
    }

    return predictions;
  }

  /**
   * Calculate match quality between input and pattern
   * @param {string} input - Input text
   * @param {string} pattern - Pattern template
   * @returns {number} Match quality (0-1)
   * @private
   */
  _calculateMatchQuality(input, pattern) {
    const inputTokens = this._tokenize(input);
    const patternTokens = this._tokenize(pattern.replace(/\{[^}]+\}/g, ''));

    if (inputTokens.length === 0 || patternTokens.length === 0) return 0;

    let matches = 0;
    inputTokens.forEach(token => {
      if (patternTokens.includes(token)) matches++;
    });

    return matches / inputTokens.length;
  }

  /**
   * Calculate recency score
   * @param {number} timestamp - Last used timestamp
   * @returns {number} Recency score (0-1)
   * @private
   */
  _calculateRecencyScore(timestamp) {
    const hoursSince = (Date.now() - timestamp) / (1000 * 60 * 60);
    return Math.pow(this.#config.decayFactor, hoursSince);
  }

  /**
   * Predict from frequency map
   * @param {string} input - Partial input
   * @returns {PredictionResult[]} Predictions
   * @private
   */
  _predictFromFrequency(input) {
    const predictions = [];
    const inputLower = input.toLowerCase();

    for (const [prompt, frequency] of this.#frequencyMap) {
      if (prompt.toLowerCase().startsWith(inputLower)) {
        const confidence = Math.min(frequency / 10, 1) * 0.8; // Max 0.8 for frequency alone

        predictions.push({
          text: prompt,
          confidence,
          source: 'frequency',
          metadata: { frequency }
        });
      }
    }

    return predictions;
  }

  /**
   * Predict from session context
   * @param {string} input - Partial input
   * @returns {PredictionResult[]} Predictions
   * @private
   */
  _predictFromContext(input) {
    const predictions = [];
    const context = this.#sessionContext;

    // Based on current task type, suggest relevant patterns
    if (context.taskType) {
      const relevantPatterns = this.#patterns.filter(p => p.category === context.taskType);

      relevantPatterns.slice(0, 3).forEach(pattern => {
        predictions.push({
          text: pattern.template,
          confidence: 0.4, // Moderate confidence for context-based
          source: 'context',
          metadata: {
            taskType: context.taskType,
            category: pattern.category
          }
        });
      });
    }

    // Suggest follow-up based on recent prompts
    const lastPrompt = context.getLastPrompt();
    if (lastPrompt) {
      const followUps = this._generateFollowUps(lastPrompt);
      followUps.forEach(followUp => {
        predictions.push({
          text: followUp,
          confidence: 0.35,
          source: 'context',
          metadata: { followUp: true }
        });
      });
    }

    return predictions;
  }

  /**
   * Generate follow-up suggestions based on previous prompt
   * @param {string} prompt - Previous prompt
   * @returns {string[]} Follow-up suggestions
   * @private
   */
  _generateFollowUps(prompt) {
    const followUps = [];
    const promptLower = prompt.toLowerCase();

    // If created something, suggest testing/documentation
    if (/create|write|implement/i.test(promptLower)) {
      followUps.push('Add tests for this');
      followUps.push('Document this code');
    }

    // If fixed something, suggest verification
    if (/fix|debug|solve/i.test(promptLower)) {
      followUps.push('Verify the fix works');
      followUps.push('Add a test to prevent regression');
    }

    // If explained something, suggest deeper exploration
    if (/explain|what is/i.test(promptLower)) {
      followUps.push('Show me an example');
      followUps.push('How can I use this?');
    }

    return followUps.slice(0, 2);
  }

  /**
   * Predict from co-occurrence
   * @param {string[]} tokens - Input tokens
   * @returns {PredictionResult[]} Predictions
   * @private
   */
  _predictFromCooccurrence(tokens) {
    const predictions = [];

    if (tokens.length === 0) return predictions;

    // Find common co-occurring words
    const lastToken = tokens[tokens.length - 1];
    const cooccurring = this.#cooccurrenceMap.get(lastToken);

    if (cooccurring) {
      const topCooccurring = [...cooccurring].slice(0, 3);

      topCooccurring.forEach(token => {
        const extended = [...tokens, token].join(' ');
        predictions.push({
          text: extended,
          confidence: 0.25,
          source: 'cooccurrence',
          metadata: { baseToken: lastToken, suggested: token }
        });
      });
    }

    return predictions;
  }

  /**
   * Deduplicate predictions
   * @param {PredictionResult[]} predictions - Predictions to deduplicate
   * @returns {PredictionResult[]} Unique predictions
   * @private
   */
  _deduplicatePredictions(predictions) {
    const seen = new Map();

    predictions.forEach(pred => {
      const normalized = pred.text.toLowerCase().trim();
      const existing = seen.get(normalized);

      if (!existing || existing.confidence < pred.confidence) {
        seen.set(normalized, pred);
      }
    });

    return [...seen.values()];
  }

  /**
   * Add a custom pattern
   * @param {string} template - Pattern template with {placeholders}
   * @param {string} category - Pattern category
   */
  addPattern(template, category) {
    const pattern = new PromptPattern(template, category);
    this.#patterns.push(pattern);
    this.emit('patternAdded', { template, category });
  }

  /**
   * Record pattern usage (for learning)
   * @param {string} template - Used template
   * @param {boolean} success - Whether it was successful
   * @param {number} responseTime - Response time in ms
   */
  recordPatternUsage(template, success = true, responseTime = 0) {
    const pattern = this.#patterns.find(p => p.template === template);
    if (pattern) {
      pattern.recordUsage(success, responseTime);
    }
  }

  /**
   * Get current session context
   * @returns {Object} Session context summary
   */
  getSessionContext() {
    return {
      promptCount: this.#sessionContext.getSessionLength(),
      topics: this.#sessionContext.getRecentTopics(),
      taskType: this.#sessionContext.taskType,
      duration: Date.now() - this.#sessionContext.startTime
    };
  }

  /**
   * Reset session context (start new session)
   */
  resetSession() {
    this.#sessionContext = new SessionContext();
    this.emit('sessionReset');
  }

  /**
   * Get predictor statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ngramCount: this.#ngramIndex.size,
      patternCount: this.#patterns.length,
      vocabularySize: this.#vocabulary.length,
      frequencyMapSize: this.#frequencyMap.size,
      cooccurrenceMapSize: this.#cooccurrenceMap.size,
      config: { ...this.#config }
    };
  }

  /**
   * Export learned data for persistence
   * @returns {Object} Exportable data
   */
  export() {
    const ngramData = [];
    for (const [key, token] of this.#ngramIndex) {
      ngramData.push({
        key,
        tokens: token.tokens,
        followers: [...token.followedBy.entries()],
        totalCount: token.totalCount,
        lastUsed: token.lastUsed
      });
    }

    const patternData = this.#patterns.map(p => ({
      template: p.template,
      category: p.category,
      usageCount: p.usageCount,
      successRate: p.successRate,
      avgResponseTime: p.avgResponseTime,
      lastUsed: p.lastUsed
    }));

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      ngrams: ngramData,
      patterns: patternData,
      frequency: [...this.#frequencyMap.entries()],
      vocabulary: this.#vocabulary,
      config: this.#config
    };
  }

  /**
   * Import learned data
   * @param {Object} data - Data from export()
   */
  import(data) {
    if (data.version !== '1.0') {
      throw new Error(`Unsupported data version: ${data.version}`);
    }

    // Import N-grams
    if (data.ngrams) {
      data.ngrams.forEach(item => {
        const token = new NGramToken(item.tokens);
        token.totalCount = item.totalCount;
        token.lastUsed = item.lastUsed;
        item.followers.forEach(([follower, count]) => {
          token.followedBy.set(follower, count);
        });
        this.#ngramIndex.set(item.key, token);
      });
    }

    // Import patterns
    if (data.patterns) {
      data.patterns.forEach(item => {
        const existing = this.#patterns.find(p => p.template === item.template);
        if (existing) {
          existing.usageCount = item.usageCount;
          existing.successRate = item.successRate;
          existing.avgResponseTime = item.avgResponseTime;
          existing.lastUsed = item.lastUsed;
        } else {
          const pattern = new PromptPattern(item.template, item.category);
          pattern.usageCount = item.usageCount;
          pattern.successRate = item.successRate;
          pattern.avgResponseTime = item.avgResponseTime;
          pattern.lastUsed = item.lastUsed;
          this.#patterns.push(pattern);
        }
      });
    }

    // Import frequency map
    if (data.frequency) {
      data.frequency.forEach(([prompt, freq]) => {
        this.#frequencyMap.set(prompt, freq);
      });
    }

    // Import vocabulary
    if (data.vocabulary) {
      this.#vocabulary = [...new Set([...this.#vocabulary, ...data.vocabulary])];
    }

    this.emit('imported', { ngramCount: data.ngrams?.length || 0 });
  }
}

/**
 * Create a new PromptPredictor instance
 * @param {PredictorConfig} config - Configuration
 * @returns {PromptPredictor} New predictor
 */
export function createPredictor(config) {
  return new PromptPredictor(config);
}

export default PromptPredictor;
