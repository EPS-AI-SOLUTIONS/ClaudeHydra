/**
 * @fileoverview HYDRA Executor - Orchestrates Gemini + Ollama pipeline
 * Implements the SWARM pipeline with proper error recovery
 *
 * @description
 * This module provides:
 * - Pipeline execution context management
 * - Stage-based execution with timeout and fallback support
 * - Error handling with recovery options
 * - Configurable pipeline building
 *
 * @module hydra/pipeline/executor
 */

import { getOllamaProvider } from '../providers/ollama-provider.js';
import { getGeminiProvider } from '../providers/gemini-provider.js';
import { route, routeWithCost } from './router.js';
import { PipelineError, AggregateError, normalizeError, isRecoverable } from '../core/errors.js';
import { getConfigManager } from '../core/config.js';
import { getStatsCollector } from '../core/stats.js';

// Fallback imports for backward compatibility
import * as ollamaClient from '../providers/ollama-client.js';
import * as geminiClient from '../providers/gemini-client.js';

/**
 * @typedef {Object} StageResult
 * @property {boolean} [skipped] - Whether the stage was skipped
 * @property {string} [reason] - Reason for skipping
 * @property {*} [data] - Stage output data
 * @property {number} [duration_ms] - Stage execution time
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} content - Generated content
 * @property {Object} metadata - Execution metadata
 * @property {string} [error] - Error message if failed
 */

/**
 * Pipeline execution context
 * Tracks execution state, stages, and errors
 * @class
 */
class ExecutionContext {
  /**
   * Creates a new execution context
   * @param {string} prompt - User prompt
   * @param {Object} [options={}] - Execution options
   */
  constructor(prompt, options = {}) {
    /** @type {string} */
    this.prompt = prompt;

    /** @type {Object} */
    this.options = options;

    /** @type {number} */
    this.startTime = Date.now();

    /** @type {Object<string, Object>} */
    this.stages = {};

    /** @type {Array<Object>} */
    this.errors = [];

    /** @type {Object} */
    this.metadata = {};
  }

  /**
   * Records completion of a pipeline stage
   * @param {string} stage - Stage name
   * @param {Object} data - Stage result data
   */
  recordStage(stage, data) {
    this.stages[stage] = {
      ...data,
      duration_ms: Date.now() - (data.startTime || this.startTime),
      completedAt: Date.now()
    };
  }

  /**
   * Adds an error to the context
   * @param {string} stage - Stage where error occurred
   * @param {Error} error - The error
   */
  addError(stage, error) {
    this.errors.push({
      stage,
      error: normalizeError(error),
      timestamp: Date.now()
    });
  }

  /**
   * Gets total execution duration
   * @returns {number} Duration in milliseconds
   */
  getDuration() {
    return Date.now() - this.startTime;
  }

  /**
   * Checks if any errors occurred
   * @returns {boolean}
   */
  hasErrors() {
    return this.errors.length > 0;
  }

  /**
   * Gets recoverable errors only
   * @returns {Array<Object>}
   */
  getRecoverableErrors() {
    return this.errors.filter(e => isRecoverable(e.error));
  }
}

/**
 * Pipeline Stage Executor
 * Represents a single stage in the pipeline
 * @class
 */
class PipelineStage {
  /**
   * Creates a new pipeline stage
   * @param {string} name - Stage name
   * @param {Function} executor - Stage executor function
   * @param {Object} [options={}] - Stage options
   * @param {boolean} [options.optional=false] - Whether stage is optional
   * @param {Function} [options.skipCondition] - Condition to skip stage
   * @param {Function} [options.fallback] - Fallback function on error
   * @param {number} [options.timeout=60000] - Stage timeout in ms
   */
  constructor(name, executor, options = {}) {
    /** @type {string} */
    this.name = name;

    /** @type {Function} */
    this.executor = executor;

    /** @type {boolean} */
    this.optional = options.optional || false;

    /** @type {Function|undefined} */
    this.skipCondition = options.skipCondition;

    /** @type {Function|undefined} */
    this.fallback = options.fallback;

    /** @type {number} */
    this.timeout = options.timeout || 60000;
  }

  /**
   * Executes the stage
   * @param {ExecutionContext} context - Execution context
   * @param {Object} input - Input from previous stages
   * @returns {Promise<StageResult>} Stage result
   * @throws {PipelineError} If stage fails and is not optional
   */
  async execute(context, input) {
    // Check skip condition
    if (this.skipCondition && this.skipCondition(context, input)) {
      return { skipped: true, reason: 'skip condition met' };
    }

    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await Promise.race([
        this.executor(context, input),
        this._timeoutPromise()
      ]);

      context.recordStage(this.name, { ...result, startTime });
      return result;

    } catch (error) {
      context.addError(this.name, error);

      // Try fallback if available
      if (this.fallback) {
        try {
          const fallbackResult = await this.fallback(context, input, error);
          context.recordStage(this.name, { ...fallbackResult, startTime, fallback: true });
          return fallbackResult;
        } catch (fallbackError) {
          context.addError(`${this.name}_fallback`, fallbackError);
        }
      }

      // If optional, continue with null result
      if (this.optional) {
        context.recordStage(this.name, { skipped: true, error: error.message, startTime });
        return { skipped: true, error: error.message };
      }

      throw new PipelineError(this.name, error.message, { cause: error });
    }
  }

  /**
   * Creates a timeout promise
   * @returns {Promise<never>}
   * @private
   */
  _timeoutPromise() {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Stage '${this.name}' timed out after ${this.timeout}ms`)), this.timeout);
    });
  }
}

/**
 * Pipeline Builder
 * Fluent API for constructing pipelines
 * @class
 */
export class PipelineBuilder {
  /**
   * Creates a new pipeline builder
   */
  constructor() {
    /** @type {Array<PipelineStage>} */
    this.stages = [];

    /** @type {Object} */
    this.config = getConfigManager().getValue('pipeline', {});
  }

  /**
   * Adds a stage to the pipeline
   * @param {string} name - Stage name
   * @param {Function} executor - Stage executor function
   * @param {Object} [options={}] - Stage options
   * @returns {PipelineBuilder} This builder for chaining
   */
  addStage(name, executor, options = {}) {
    this.stages.push(new PipelineStage(name, executor, options));
    return this;
  }

  /**
   * Builds the pipeline
   * @returns {Pipeline} Constructed pipeline
   */
  build() {
    return new Pipeline(this.stages, this.config);
  }
}

/**
 * Pipeline Executor
 * Executes a series of stages
 * @class
 */
class Pipeline {
  /**
   * Creates a new pipeline
   * @param {Array<PipelineStage>} stages - Pipeline stages
   * @param {Object} [config={}] - Pipeline configuration
   */
  constructor(stages, config = {}) {
    /** @type {Array<PipelineStage>} */
    this.stages = stages;

    /** @type {Object} */
    this.config = config;

    /** @type {Object} */
    this.stats = getStatsCollector();
  }

  /**
   * Executes the pipeline
   * @param {string} prompt - User prompt
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<ExecutionResult>} Execution result
   */
  async execute(prompt, options = {}) {
    const context = new ExecutionContext(prompt, options);
    let currentInput = { prompt };

    for (const stage of this.stages) {
      if (options.verbose) {
        console.log(`[HYDRA] Executing stage: ${stage.name}`);
      }

      const result = await stage.execute(context, currentInput);
      currentInput = { ...currentInput, [stage.name]: result };
    }

    return this._buildResult(context, currentInput);
  }

  /**
   * Builds the final result from context and stage outputs
   * @param {ExecutionContext} context - Execution context
   * @param {Object} stageResults - Results from all stages
   * @returns {ExecutionResult} Final execution result
   * @private
   */
  _buildResult(context, stageResults) {
    return {
      success: !context.hasErrors() || context.getRecoverableErrors().length === context.errors.length,
      content: stageResults.synthesize?.content || stageResults.execute?.results?.[0]?.content,
      metadata: {
        duration_ms: context.getDuration(),
        stages: context.stages,
        errors: context.errors.map(e => ({ stage: e.stage, message: e.error.message }))
      }
    };
  }
}

/**
 * Creates the default HYDRA pipeline
 * @returns {Pipeline} Configured default pipeline
 */
export function createDefaultPipeline() {
  let ollama, gemini;

  try {
    ollama = getOllamaProvider();
    gemini = getGeminiProvider();
  } catch {
    // Fall back to legacy clients if providers not initialized
    ollama = {
      generate: ollamaClient.generate,
      selectModel: ollamaClient.selectModel || (() => 'llama3.2:3b')
    };
    gemini = {
      generate: geminiClient.generate
    };
  }

  const config = getConfigManager().getValue('pipeline', {});

  return new PipelineBuilder()
    // STAGE 1: ROUTE
    .addStage('route', async (ctx) => {
      return routeWithCost(ctx.prompt);
    }, {
      timeout: 10000
    })

    // STAGE 2: SPECULATE (optional, for context gathering)
    .addStage('speculate', async (ctx, input) => {
      const routing = input.route;

      if (routing.complexity <= 1) {
        return { context: null, skipped: true };
      }

      const contextPrompt = `Analyze this task and extract key requirements in bullet points (max 5):
"${ctx.prompt.slice(0, 500)}"
Be concise.`;

      const result = await ollama.generate(contextPrompt, {
        model: ollama.selectModel ? ollama.selectModel('research') : 'llama3.2:3b',
        maxTokens: 256
      });

      return {
        context: result.content,
        duration_ms: result.duration_ms,
        skipped: false
      };
    }, {
      optional: true,
      skipCondition: () => !config.enableSpeculation,
      timeout: 30000
    })

    // STAGE 3: PLAN (optional, for complex tasks)
    .addStage('plan', async (ctx, input) => {
      const routing = input.route;
      const speculation = input.speculate;

      if (routing.complexity <= 2) {
        return {
          plan: [{ task: 'direct_execution', provider: routing.provider }],
          skipped: true
        };
      }

      const planPrompt = `Create a brief execution plan for this task (max 5 steps):
Task: "${ctx.prompt.slice(0, 300)}"
${speculation?.context ? `Context: ${speculation.context}` : ''}
Format: numbered list, one line per step.`;

      // Use appropriate provider based on complexity
      const provider = routing.complexity >= 4 ? gemini : ollama;
      const result = await provider.generate(planPrompt, {
        model: routing.complexity >= 4 ? undefined : (ollama.selectModel ? ollama.selectModel('research') : 'llama3.2:3b'),
        maxTokens: 512
      });

      return {
        plan: parsePlan(result.content),
        duration_ms: result.duration_ms
      };
    }, {
      optional: true,
      skipCondition: () => !config.enablePlanning,
      timeout: 45000,
      fallback: async (ctx, input) => ({
        plan: [{ task: 'direct_execution', provider: input.route.provider }],
        fallback: true
      })
    })

    // STAGE 4: EXECUTE
    .addStage('execute', async (ctx, input) => {
      const routing = input.route;
      const plan = input.plan;
      const results = [];

      // Direct execution for simple plans
      if (plan.skipped || plan.plan.length <= 1) {
        const result = await executeTask(ctx.prompt, routing, { ollama, gemini });
        results.push({ step: 'main', ...result });
        return { results, parallel: false };
      }

      // Multi-step execution
      for (const step of plan.plan) {
        const stepPrompt = `${step.task}\n\nOriginal request: ${ctx.prompt.slice(0, 200)}`;
        const stepRouting = step.provider === 'auto'
          ? await route(step.task)
          : { provider: step.provider, model: routing.model };

        try {
          const result = await executeTask(stepPrompt, stepRouting, { ollama, gemini });
          results.push({
            step: step.step,
            task: step.task,
            provider: stepRouting.provider,
            ...result
          });
        } catch (error) {
          results.push({
            step: step.step,
            task: step.task,
            error: error.message
          });
        }
      }

      return { results, parallel: false };
    }, {
      timeout: 120000
    })

    // STAGE 5: SYNTHESIZE (combine multi-step results)
    .addStage('synthesize', async (ctx, input) => {
      const execution = input.execute;

      // Single result doesn't need synthesis
      if (execution.results.length === 1) {
        return {
          content: execution.results[0].content,
          skipped: true
        };
      }

      const combinedResults = execution.results
        .map(r => `[Step ${r.step}]: ${r.content || r.error}`)
        .join('\n\n');

      const synthPrompt = `Combine these results into a coherent response:
${combinedResults}

Provide a unified, well-structured answer.`;

      const result = await ollama.generate(synthPrompt, {
        model: ollama.selectModel ? ollama.selectModel('research') : 'llama3.2:3b',
        maxTokens: 2048
      });

      return {
        content: result.content,
        duration_ms: result.duration_ms,
        skipped: false
      };
    }, {
      optional: true,
      skipCondition: () => !config.enableSynthesis,
      timeout: 60000,
      fallback: async (ctx, input) => ({
        content: input.execute.results.map(r => r.content).filter(Boolean).join('\n\n'),
        fallback: true
      })
    })

    .build();
}

/**
 * Execute a single task with the appropriate provider
 * @param {string} prompt - Task prompt
 * @param {Object} routing - Routing decision
 * @param {Object} providers - Provider instances
 * @returns {Promise<Object>} Task result
 */
async function executeTask(prompt, routing, providers) {
  const { ollama, gemini } = providers;
  const { provider, model } = routing;

  if (provider === 'ollama') {
    return ollama.generate(prompt, { model });
  } else {
    return gemini.generate(prompt);
  }
}

/**
 * Parse plan text into structured steps
 * @param {string} planText - Raw plan text
 * @returns {Array<Object>} Parsed plan steps
 */
function parsePlan(planText) {
  const lines = planText.split('\n').filter(line => /^\d+[\.\)]/.test(line.trim()));
  return lines.map((line, idx) => ({
    step: idx + 1,
    task: line.replace(/^\d+[\.\)]\s*/, '').trim(),
    provider: 'auto'
  }));
}

/**
 * Main execution function
 * @param {string} prompt - User prompt
 * @param {Object} [options={}] - Execution options
 * @returns {Promise<ExecutionResult>} Execution result
 */
export async function execute(prompt, options = {}) {
  const pipeline = createDefaultPipeline();

  try {
    const result = await pipeline.execute(prompt, options);

    // Add routing metadata to result
    const routeStage = result.metadata.stages.route;
    if (routeStage) {
      result.metadata.category = routeStage.category;
      result.metadata.complexity = routeStage.complexity;
      result.metadata.provider = routeStage.provider;
      result.metadata.model = routeStage.model;
      result.metadata.estimatedCost = routeStage.estimatedCost;
      result.metadata.costSavings = routeStage.costSavings;
      result.metadata.totalDuration_ms = result.metadata.duration_ms;
    }

    return result;

  } catch (error) {
    const config = getConfigManager().getValue('pipeline', {});

    // Fallback to direct provider execution
    if (config.fallbackProvider) {
      try {
        let fallbackProvider;
        try {
          fallbackProvider = getGeminiProvider();
        } catch {
          fallbackProvider = { generate: geminiClient.generate };
        }

        const fallbackResult = await fallbackProvider.generate(prompt);

        return {
          success: true,
          content: fallbackResult.content,
          metadata: {
            fallback: true,
            error: error.message,
            provider: 'gemini',
            duration_ms: fallbackResult.duration_ms,
            totalDuration_ms: fallbackResult.duration_ms
          }
        };
      } catch (fallbackError) {
        return {
          success: false,
          content: null,
          error: `Pipeline failed: ${error.message}. Fallback failed: ${fallbackError.message}`
        };
      }
    }

    return {
      success: false,
      content: null,
      error: error.message
    };
  }
}

/**
 * Quick execution - skip planning for simple queries
 * @param {string} prompt - User prompt
 * @returns {Promise<Object>} Quick execution result
 */
export async function quickExecute(prompt) {
  const routing = await route(prompt);

  let ollama, gemini;
  try {
    ollama = getOllamaProvider();
    gemini = getGeminiProvider();
  } catch {
    ollama = { generate: ollamaClient.generate };
    gemini = { generate: geminiClient.generate };
  }

  if (routing.provider === 'ollama') {
    const result = await ollama.generate(prompt, { model: routing.model });
    return { ...result, provider: 'ollama', model: routing.model };
  }

  const result = await gemini.generate(prompt);
  return { ...result, provider: 'gemini' };
}

// Export classes for advanced usage
export { Pipeline, ExecutionContext };

// Export executeTask for backward compatibility
export { executeTask };
