/**
 * Query Processor - Hydra orchestration
 * @module cli-unified/processing/QueryProcessor
 */

import { EventEmitter } from 'events';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';

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

    this.ollamaHost = options.ollamaHost || 'http://localhost:11434';
    this.defaultModel = options.defaultModel || 'llama3.2:1b';
    this.streaming = options.streaming !== false;
    this.timeout = options.timeout || 60000;

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
   * Execute query to Ollama
   */
  async executeQuery(prompt, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Model '${options.model || this.defaultModel}' not found. Run: ollama pull ${options.model || this.defaultModel}`);
        }
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Query timeout');
      }
      throw error;
    }
  }

  /**
   * Stream query to Ollama
   */
  async streamQuery(prompt, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    let reader = null;

    try {
      const response = await fetch(`${this.ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          prompt,
          stream: true,
          options: {
            temperature: options.temperature ?? 0.7
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      // Set a read timeout for each chunk
      const readTimeout = this.timeout;

      while (true) {
        const readPromise = reader.read();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Stream read timeout')), readTimeout)
        );

        const { done, value } = await Promise.race([readPromise, timeoutPromise]);
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullResponse += data.response;
              if (options.onToken) {
                try {
                  options.onToken(data.response);
                } catch (callbackError) {
                  // Log but don't break stream on callback error
                  console.error('Token callback error:', callbackError.message);
                }
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      return fullResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Stream query timeout');
      }
      throw error;
    } finally {
      // Always release the reader
      if (reader) {
        try {
          reader.releaseLock();
        } catch {
          // Reader may already be released
        }
      }
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
   * Check Ollama health
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.ollamaHost}/api/tags`, {
        method: 'GET'
      });

      if (!response.ok) {
        return { healthy: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return {
        healthy: true,
        models: data.models?.map(m => m.name) || []
      };
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
