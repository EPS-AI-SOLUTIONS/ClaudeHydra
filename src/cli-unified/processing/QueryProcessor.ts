/**
 * Query Processor - Hydra orchestration with Agentic Loop
 * @module cli-unified/processing/QueryProcessor
 */

import { EventEmitter } from 'node:events';
import { ClaudeSDKError } from '../../errors/index.js';
import { generate as claudeGenerate, isClaudeModel } from '../../hydra/providers/claude-client.js';
import { getLlamaCppBridge } from '../../hydra/providers/llamacpp-bridge.js';
import { getModelForAgent } from '../../hydra/providers/llamacpp-models.js';
import { getLogger } from '../../utils/logger.js';
import type { IterationContext, ResponseMetadata } from './AgenticLoop.js';
import { AgenticLoop, DEFAULT_AGENTIC_CONFIG } from './AgenticLoop.js';

const logger = getLogger('QueryProcessor');

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
    this.timeout = options.timeout || 300_000; // 5 min — multi-turn SDK tasks need time

    // Agentic loop configuration
    this.agenticConfig = options.agentic || null;

    // LlamaCpp bridge
    this.bridge = getLlamaCppBridge();

    // Multi-instance Claude Code pool (optional)
    this.instanceManager = options.instanceManager || null;

    // Request queue for batch processing
    this.queue = [];
    this.processing = false;

    // Concurrency: use pool size if multi-instance enabled, otherwise fallback
    const poolSize = this.instanceManager?.isEnabled
      ? this.instanceManager.getConfig().maxInstances
      : 0;
    this.concurrency = options.concurrency || (poolSize > 0 ? poolSize : 1);
    this.activeRequests = 0;
  }

  /**
   * Resolve agentic config from options cascade:
   * per-query options > constructor config > defaults
   */
  _getAgenticConfig(options) {
    if (options.agentic === false) return { ...DEFAULT_AGENTIC_CONFIG, enabled: false };
    if (options.agentic && typeof options.agentic === 'object') {
      return { ...DEFAULT_AGENTIC_CONFIG, enabled: true, ...options.agentic };
    }
    if (this.agenticConfig) {
      return { ...DEFAULT_AGENTIC_CONFIG, ...this.agenticConfig };
    }
    return { ...DEFAULT_AGENTIC_CONFIG, enabled: false };
  }

  /**
   * Process a query with optional agentic loop
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

    // Execute query
    const startTime = Date.now();
    const model = options.model || agent?.model || this.defaultModel;

    // Build final prompt with agent persona (Claude-aware format)
    if (agent) {
      fullPrompt = this.agentRouter.buildPrompt(agent, fullPrompt, {
        isClaudeModel: isClaudeModel(model),
      });
    }
    const temperature = options.temperature ?? agent?.temperature ?? 0.7;

    // Resolve maxTokens: explicit option > agent config > 1024 default
    let maxTokens = options.maxTokens;
    if (!maxTokens && agent?.name) {
      const agentModelConfig = getModelForAgent(agent.name);
      maxTokens = agentModelConfig?.maxTokens;
    }
    if (!maxTokens) maxTokens = 1024;

    logger.debug('Processing query', {
      agent: agent?.name || 'none',
      model,
      temperature,
      maxTokens,
      streaming: this.streaming && !!options.onToken,
      promptLength: fullPrompt.length,
    });

    // --- Agentic Loop Setup ---
    const agenticCfg = this._getAgenticConfig(options);
    const loop = agenticCfg.enabled ? new AgenticLoop(agenticCfg) : null;

    const iterCtx: IterationContext = {
      originalPrompt: prompt,
      iteration: 0,
      previousResponses: [],
      accumulatedKnowledge: '',
      totalDuration: 0,
    };

    try {
      let finalResponse;
      let finalMetadata: ResponseMetadata = {};

      // --- Main execution loop ---
      do {
        iterCtx.iteration++;
        const iterStart = Date.now();

        // On subsequent iterations, use continuation prompt
        let currentPrompt = fullPrompt;
        if (loop && iterCtx.iteration > 1) {
          const _lastDecision = iterCtx.previousResponses[iterCtx.previousResponses.length - 1];
          currentPrompt = loop.buildContinuationPrompt(
            iterCtx,
            finalMetadata.stopReason === 'max_tokens' ? 'continue' : 'improve',
          );
          // Re-wrap with agent persona
          if (agent) {
            currentPrompt = this.agentRouter.buildPrompt(agent, currentPrompt, {
              isClaudeModel: isClaudeModel(model),
            });
          }
        }

        // Execute the query
        let responseData;
        if (this.streaming && options.onToken) {
          responseData = await this.streamQuery(currentPrompt, {
            model,
            temperature,
            maxTokens,
            onToken: options.onToken,
          });
        } else {
          responseData = await this.executeQuery(currentPrompt, { model, temperature, maxTokens });
        }

        // Normalize response: could be string (Ollama) or object (Claude)
        const response =
          typeof responseData === 'string' ? responseData : (responseData?.content ?? '');
        const metadata: ResponseMetadata =
          typeof responseData === 'object' && responseData !== null
            ? { stopReason: responseData.stopReason, tokens: responseData.tokens }
            : {};

        finalResponse = response;
        finalMetadata = metadata;

        const iterDuration = Date.now() - iterStart;

        // If no loop, break immediately (backward compatibility: single-turn)
        if (!loop) break;

        // Evaluate response quality
        const decision = loop.evaluate(response, iterCtx, metadata);

        iterCtx.previousResponses.push({
          response,
          score: decision.score,
          reason: decision.reason,
          duration: iterDuration,
        });
        iterCtx.totalDuration = Date.now() - startTime;

        // Check FIRST if we should continue — so the event carries this info
        const willContinue = loop.shouldIterate(decision, iterCtx);

        // Emit iteration event for UI feedback (includes willContinue flag)
        this.emit('agentic:iteration', {
          iteration: iterCtx.iteration,
          score: decision.score,
          reason: decision.reason,
          duration: iterDuration,
          willContinue,
        });

        if (!willContinue) {
          // Merge responses if multiple iterations
          if (iterCtx.previousResponses.length > 1) {
            finalResponse = loop.mergeResponses(iterCtx.previousResponses);
          }
          break;
        }
      } while (true);

      const duration = Date.now() - startTime;

      logger.info(`Query completed in ${duration}ms`, {
        responseLength: finalResponse?.length || 0,
        iterations: iterCtx.iteration,
        cached: false,
      });

      // Record agent stats
      if (agent && this.agentRouter) {
        this.agentRouter.recordExecution(agent.name, duration);
      }

      // Cache response
      if (this.cacheManager?.isEnabled && !options.noCache) {
        this.cacheManager.set(prompt, finalResponse, { agent: agent?.name });
      }

      this.emit('complete', { prompt, response: finalResponse, duration, agent: agent?.name });

      return {
        response: finalResponse,
        cached: false,
        duration,
        agent: agent?.name,
        model,
        iterations: iterCtx.iteration,
        finalScore:
          iterCtx.previousResponses.length > 0
            ? iterCtx.previousResponses[iterCtx.previousResponses.length - 1].score
            : undefined,
      };
    } catch (error) {
      // On error during iteration, try to return partial work
      if (loop && iterCtx.previousResponses.length > 0) {
        const duration = Date.now() - startTime;
        const partialResponse = loop.mergeResponses(iterCtx.previousResponses);

        logger.warn('Agentic loop error, returning partial result', {
          iterations: iterCtx.iteration,
          error: error.message,
        });

        if (agent && this.agentRouter) {
          this.agentRouter.recordExecution(agent.name, duration, error);
        }

        return {
          response: partialResponse,
          cached: false,
          duration,
          agent: agent?.name,
          model,
          iterations: iterCtx.iteration,
          partial: true,
        };
      }

      if (agent && this.agentRouter) {
        this.agentRouter.recordExecution(agent.name, Date.now() - startTime, error);
      }

      this.emit('error', { prompt, error, agent: agent?.name });
      throw error;
    }
  }

  /**
   * Execute query - routes to Claude API or local Ollama based on model
   */
  async executeQuery(prompt, options = {}) {
    const model = options.model || this.defaultModel;

    // Route Claude models through Anthropic API
    if (isClaudeModel(model)) {
      return this.executeClaudeQuery(prompt, options);
    }

    // Local Ollama path
    try {
      const result = await this.bridge.generate(prompt, {
        maxTokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.7,
        stop: [
          '<|end|>', // Custom stop token from buildPrompt()
          '<|user|>', // Prevent model from continuing conversation
          '<|system|>', // Prevent repeating system prompt
          '<|im_end|>', // ChatML (Qwen3 native format)
          '### System', // Fallback for old format
          '### User Request', // Fallback for old format
          '\n\n\n\n', // Stop on excessive newlines
        ],
      });

      if (!result.success) {
        throw new Error(result.error || 'LlamaCpp generation failed');
      }

      return result.content;
    } catch (error) {
      if (error.message.includes('MCP invoker not set')) {
        throw new Error('AI not available. Ensure llama-cpp MCP server is running and configured.');
      }
      throw error;
    }
  }

  /**
   * Execute query via Claude Anthropic API.
   * Returns an object with content + metadata (stopReason, tokens).
   */
  async executeClaudeQuery(prompt, options = {}) {
    const model = options.model || 'claude-opus';

    logger.info(`Routing to Claude API: ${model}`);

    // Pass through agentic options (maxTurns, tools) to claude-client
    const agenticCfg = this.agenticConfig || {};

    const result = await claudeGenerate(prompt, {
      model,
      maxTokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      timeout: this.timeout,
      maxTurns: agenticCfg.maxTurns ?? 1,
      tools: agenticCfg.tools ?? [],
      // Multi-instance pool: route through pool when enabled
      instanceManager: this.instanceManager,
      // Live preview: emit SDK messages so UI can show real-time progress
      onSdkMessage: (msg: any) => {
        this.emit('sdk:message', msg);
      },
    });

    if (!result.success) {
      throw new ClaudeSDKError(result.error || `Claude API failed (${model})`, {
        errorType: result.errorType || 'unknown',
        suggestions: result.suggestions || [],
        stderrOutput: result.stderrOutput,
        service: 'claude-agent-sdk',
        context: {
          model,
          duration_ms: result.duration_ms,
          claudeCodeVersion: result.claudeCodeVersion,
        },
      });
    }

    // Return enriched object instead of bare string
    return {
      content: result.content,
      stopReason: result.stopReason || 'end_turn',
      tokens: result.tokens,
    };
  }

  /**
   * Stream query - routes to Claude API or local Ollama based on model
   * Note: Both paths simulate streaming (word-by-word) since neither supports native token streaming here
   */
  async streamQuery(prompt, options = {}) {
    const model = options.model || this.defaultModel;
    let fullResponseData;

    if (isClaudeModel(model)) {
      // Claude API path — returns object with metadata
      fullResponseData = await this.executeClaudeQuery(prompt, options);
    } else {
      // Local Ollama path
      try {
        const result = await this.bridge.generate(prompt, {
          maxTokens: options.maxTokens || 1024,
          temperature: options.temperature ?? 0.7,
          stop: [
            '<|end|>',
            '<|user|>',
            '<|system|>',
            '<|im_end|>', // ChatML (Qwen3 native format)
            '### System',
            '### User Request',
            '\n\n\n\n',
          ],
        });

        if (!result.success) {
          throw new Error(result.error || 'LlamaCpp generation failed');
        }

        fullResponseData = result.content;
      } catch (error) {
        if (error.message.includes('MCP invoker not set')) {
          throw new Error(
            'AI not available. Ensure llama-cpp MCP server is running and configured.',
          );
        }
        throw error;
      }
    }

    // Extract text for streaming display
    const fullResponse =
      typeof fullResponseData === 'string' ? fullResponseData : (fullResponseData?.content ?? '');

    // Simulate streaming by emitting tokens in chunks.
    // Use line-based chunking to avoid garbled output from split(' ') on
    // special characters, empty strings, and emoji sequences.
    if (options.onToken && fullResponse) {
      const lines = fullResponse.split('\n');
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        // Emit line content in word-groups (≤80 chars) for smooth rendering
        let pos = 0;
        while (pos < line.length) {
          let end = Math.min(pos + 80, line.length);
          // Break at word boundary if not at end of line
          if (end < line.length) {
            const spaceIdx = line.lastIndexOf(' ', end);
            if (spaceIdx > pos) end = spaceIdx + 1;
          }
          const chunk = line.slice(pos, end);
          if (chunk) {
            try {
              options.onToken(chunk);
            } catch (callbackError) {
              logger.debug(`Token callback error: ${callbackError.message}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          pos = end;
        }
        // Emit newline between lines (except after last)
        if (li < lines.length - 1) {
          try {
            options.onToken('\n');
          } catch {}
        }
      }
    }

    // Return the full data (object or string) so process() can extract metadata
    return fullResponseData;
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
        this.processQueueItem(item);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single queue item (extracted for clarity)
   */
  private async processQueueItem(item) {
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
      const promises = chunk.map(async (query, _idx) => {
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
          models: info.availableModels || ['main', 'draft', 'vision', 'functionary'],
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
