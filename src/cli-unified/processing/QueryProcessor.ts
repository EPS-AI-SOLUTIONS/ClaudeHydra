/**
 * Query Processor - Hydra orchestration
 * @module cli-unified/processing/QueryProcessor
 */

import { EventEmitter } from 'events';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';
import { getLlamaCppBridge } from '../../hydra/providers/llamacpp-bridge.js';

/**
 * Query Processor for orchestrating AI queries
 */
export class QueryProcessor extends EventEmitter {
  constructor(options = {}) {
    super();

    // Prevent unhandled error crashes - add default error handler
    this.on('error', (err) => {
      // Default error handler - prevents crash, errors are still thrown to caller
      if (process.env.DEBUG) {
        console.error('[QueryProcessor] Error event:', err);
      }
    });

    this.agentRouter = options.agentRouter;
    this.cacheManager = options.cacheManager;
    this.contextManager = options.contextManager;

    this.llamacppEnabled = options.llamacppEnabled !== false;
    this.defaultModel = options.defaultModel || 'main';
    this.streaming = options.streaming !== false;
    this.timeout = options.timeout || 60000;

    // LlamaCpp bridge
    this.bridge = getLlamaCppBridge();

    // Request queue for batch processing
    this.queue = [];
    this.processing = false;
    this.concurrency = options.concurrency || 1;
    this.activeRequests = 0;
  }

  /**
   * Process a query
   */
  async process(prompt, options = {}) {
    // Check cache first
    if (this.cacheManager?.isEnabled && !options.noCache) {
      const cached = this.cacheManager.get(prompt, options);
      if (cached) {
        this.emit('cached', prompt, cached);
        return { response: cached, cached: true };
      }
    }

    // Build context
    let fullPrompt = prompt;
    if (this.contextManager && !this.contextManager.isEmpty) {
      const context = this.contextManager.getContextString();
      fullPrompt = `Context:\n${context}\n\n---\n\nUser Request:\n${prompt}`;
    }

    // Select agent
    let agent = null;
    if (this.agentRouter && (options.agent || options.autoAgent !== false)) {
      agent = this.agentRouter.select(options.agent || 'auto', prompt);
    }

    // Build final prompt with agent persona
    if (agent) {
      fullPrompt = this.agentRouter.buildPrompt(agent, fullPrompt);
    }

    // Execute query
    const startTime = Date.now();
    const model = options.model || agent?.model || this.defaultModel;
    const temperature = options.temperature ?? agent?.temperature ?? 0.7;

    try {
      let response;

      if (this.streaming && options.onToken) {
        response = await this.streamQuery(fullPrompt, {
          model,
          temperature,
          onToken: options.onToken
        });
      } else {
        response = await this.executeQuery(fullPrompt, { model, temperature });
      }

      const duration = Date.now() - startTime;

      // Record agent stats
      if (agent && this.agentRouter) {
        this.agentRouter.recordExecution(agent.name, duration);
      }

      // Cache response
      if (this.cacheManager?.isEnabled && !options.noCache) {
        this.cacheManager.set(prompt, response, { agent: agent?.name });
      }

      this.emit('complete', { prompt, response, duration, agent: agent?.name });

      return {
        response,
        cached: false,
        duration,
        agent: agent?.name,
        model
      };
    } catch (error) {
      if (agent && this.agentRouter) {
        this.agentRouter.recordExecution(agent.name, Date.now() - startTime, error);
      }

      this.emit('error', { prompt, error, agent: agent?.name });
      throw error;
    }
  }

  /**
   * Execute query via LlamaCpp bridge
   */
  async executeQuery(prompt, options = {}) {
    try {
      const result = await this.bridge.generate(prompt, {
        maxTokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7
      });

      if (!result.success) {
        throw new Error(result.error || 'LlamaCpp generation failed');
      }

      return result.content;
    } catch (error) {
      // Provide user-friendly error when MCP is not configured
      if (error.message.includes('MCP invoker not set')) {
        throw new Error('AI not available. Ensure llama-cpp MCP server is running and configured.');
      }
      throw error;
    }
  }

  /**
   * Stream query via LlamaCpp bridge (simulated streaming)
   * Note: MCP doesn't support native streaming, so we simulate it
   */
  async streamQuery(prompt, options = {}) {
    try {
      // Use fast generation for streaming-like experience
      const result = await this.bridge.generateFast(prompt, {
        maxTokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7
      });

      if (!result.success) {
        throw new Error(result.error || 'LlamaCpp generation failed');
      }

      const fullResponse = result.content;

      // Simulate streaming by emitting tokens
      if (options.onToken && fullResponse) {
        const words = fullResponse.split(' ');
        for (const word of words) {
          try {
            options.onToken(word + ' ');
          } catch (callbackError) {
            console.error('Token callback error:', callbackError.message);
          }
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      return fullResponse;
    } catch (error) {
      // Provide user-friendly error when MCP is not configured
      if (error.message.includes('MCP invoker not set')) {
        throw new Error('AI not available. Ensure llama-cpp MCP server is running and configured.');
      }
      throw error;
    }
  }

  /**
   * Add query to batch queue
   */
  enqueue(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ prompt, options, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process batch queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0 && this.activeRequests < this.concurrency) {
        const item = this.queue.shift();
        this.activeRequests++;

        // Process asynchronously but track completion
        (async () => {
          try {
            const result = await this.process(item.prompt, item.options);
            item.resolve(result);
          } catch (error) {
            item.reject(error);
          } finally {
            this.activeRequests--;
            // Schedule next processing after current completes
            setImmediate(() => this.processQueue());
          }
        })();
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process multiple queries in parallel
   */
  async processParallel(queries, options = {}) {
    const concurrency = options.concurrency || this.concurrency;
    const results = [];
    const errors = [];

    const chunks = [];
    for (let i = 0; i < queries.length; i += concurrency) {
      chunks.push(queries.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (query, idx) => {
        try {
          const result = await this.process(query.prompt, query.options || options);
          results[queries.indexOf(query)] = result;
        } catch (error) {
          errors.push({ query, error });
          results[queries.indexOf(query)] = { error: error.message };
        }
      });

      await Promise.all(promises);
    }

    return { results, errors };
  }

  /**
   * Check LlamaCpp health
   */
  async checkHealth() {
    try {
      const info = await this.bridge.info();

      if (info.success) {
        return {
          healthy: true,
          models: info.availableModels || ['main', 'draft', 'vision', 'functionary']
        };
      }

      return { healthy: false, error: info.error || 'LlamaCpp unavailable' };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Get available models
   */
  async getModels() {
    const health = await this.checkHealth();
    return health.healthy ? health.models : [];
  }

  /**
   * Set components
   */
  setAgentRouter(router) {
    this.agentRouter = router;
  }

  setCacheManager(cache) {
    this.cacheManager = cache;
  }

  setContextManager(context) {
    this.contextManager = context;
  }
}

export function createQueryProcessor(options) {
  return new QueryProcessor(options);
}

export default QueryProcessor;
