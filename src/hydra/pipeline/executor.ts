/**
 * @fileoverview HYDRA Executor - Orchestrates Gemini + LlamaCpp pipeline
 * Implements the SWARM pipeline with proper error recovery
 *
 * NEW: Gemini 2.0 Flash Thinking for ROUTE and SYNTHESIZE stages
 * NEW: Feedback loop - if synthesis quality is insufficient,
 *      returns to ROUTE with accumulated knowledge
 *
 * @description
 * This module provides:
 * - Pipeline execution context management
 * - Stage-based execution with timeout and fallback support
 * - Error handling with recovery options
 * - Configurable pipeline building
 * - Quality evaluation and feedback loop
 *
 * @module hydra/pipeline/executor
 */

import { getLlamaCppProvider } from '../providers/llamacpp-provider.js';
import { getGeminiProvider } from '../providers/gemini-provider.js';
import { route, routeWithCost, routeWithThinking } from './router.js';
import { PipelineError, AggregateError, normalizeError, isRecoverable } from '../core/errors.js';
import { getConfigManager } from '../core/config.js';
import { getStatsCollector } from '../core/stats.js';

// Fallback imports for backward compatibility
import * as llamacppBridge from '../providers/llamacpp-bridge.js';
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
 * @typedef {Object} FeedbackContext
 * @property {number} iteration - Current iteration number
 * @property {Array<Object>} previousResults - Results from previous iterations
 * @property {Array<string>} learnings - Accumulated learnings
 * @property {number} lastQualityScore - Last quality score
 */

/**
 * Pipeline execution context
 * Tracks execution state, stages, errors, and feedback loop
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

    /** @type {FeedbackContext} */
    this.feedback = {
      iteration: 1,
      previousResults: [],
      learnings: [],
      lastQualityScore: 0
    };
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
      completedAt: Date.now(),
      iteration: this.feedback.iteration
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
      timestamp: Date.now(),
      iteration: this.feedback.iteration
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

  /**
   * Add learning from current iteration
   * @param {string} learning - Learning to add
   */
  addLearning(learning) {
    this.feedback.learnings.push(learning);
  }

  /**
   * Increment iteration and save result
   * @param {Object} result - Current result
   * @param {number} qualityScore - Quality score
   */
  nextIteration(result, qualityScore) {
    this.feedback.previousResults.push({
      iteration: this.feedback.iteration,
      result,
      qualityScore,
      timestamp: Date.now()
    });
    this.feedback.lastQualityScore = qualityScore;
    this.feedback.iteration++;
  }

  /**
   * Get accumulated knowledge for routing
   * @returns {string} Accumulated knowledge summary
   */
  getAccumulatedKnowledge() {
    if (this.feedback.previousResults.length === 0) {
      return '';
    }

    const learnings = this.feedback.learnings.join('\n- ');
    const previousAttempts = this.feedback.previousResults
      .map(r => `Iteration ${r.iteration} (score: ${r.qualityScore}/10): ${r.result?.content?.slice(0, 200)}...`)
      .join('\n');

    return `
## Accumulated Knowledge from ${this.feedback.iteration - 1} previous iteration(s):

### Learnings:
- ${learnings || 'None yet'}

### Previous Attempts:
${previousAttempts}

### What to improve:
- Quality was ${this.feedback.lastQualityScore}/10, need at least 7/10
- Focus on completeness and accuracy
`;
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
 * Executes a series of stages with feedback loop support
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
   * Executes the pipeline with feedback loop
   * @param {string} prompt - User prompt
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<ExecutionResult>} Execution result
   */
  async execute(prompt, options = {}) {
    const context = new ExecutionContext(prompt, options);
    const maxIterations = this.config.maxFeedbackIterations || 3;
    const qualityThreshold = this.config.qualityThreshold || 7;

    let finalResult = null;

    // Feedback loop
    while (context.feedback.iteration <= maxIterations) {
      if (options.verbose) {
        console.log(`[HYDRA] Starting iteration ${context.feedback.iteration}/${maxIterations}`);
      }

      let currentInput = {
        prompt,
        accumulatedKnowledge: context.getAccumulatedKnowledge(),
        iteration: context.feedback.iteration
      };

      // Execute all stages
      for (const stage of this.stages) {
        if (options.verbose) {
          console.log(`[HYDRA] Executing stage: ${stage.name} (iteration ${context.feedback.iteration})`);
        }

        const result = await stage.execute(context, currentInput);
        currentInput = { ...currentInput, [stage.name]: result };
      }

      // Get quality evaluation from evaluate stage
      const evaluateResult = currentInput.evaluate;
      const qualityScore = evaluateResult?.qualityScore || 0;
      const content = currentInput.synthesize?.content || currentInput.execute?.results?.[0]?.content;

      if (options.verbose) {
        console.log(`[HYDRA] Iteration ${context.feedback.iteration} quality: ${qualityScore}/10`);
      }

      // Check if quality meets threshold or if feedback loop is disabled
      if (qualityScore >= qualityThreshold || !this.config.enableFeedbackLoop) {
        finalResult = this._buildResult(context, currentInput, true);
        break;
      }

      // Add learnings and continue to next iteration
      if (evaluateResult?.improvements) {
        for (const improvement of evaluateResult.improvements) {
          context.addLearning(improvement);
        }
      }

      context.nextIteration({ content }, qualityScore);

      // If this is the last iteration, accept the result anyway
      if (context.feedback.iteration > maxIterations) {
        finalResult = this._buildResult(context, currentInput, false);
        break;
      }
    }

    return finalResult || this._buildResult(context, { prompt }, false);
  }

  /**
   * Builds the final result from context and stage outputs
   * @param {ExecutionContext} context - Execution context
   * @param {Object} stageResults - Results from all stages
   * @param {boolean} metQuality - Whether quality threshold was met
   * @returns {ExecutionResult} Final execution result
   * @private
   */
  _buildResult(context, stageResults, metQuality) {
    return {
      success: !context.hasErrors() || context.getRecoverableErrors().length === context.errors.length,
      content: stageResults.synthesize?.content || stageResults.execute?.results?.[0]?.content,
      metadata: {
        duration_ms: context.getDuration(),
        stages: context.stages,
        errors: context.errors.map(e => ({ stage: e.stage, message: e.error.message })),
        feedbackLoop: {
          iterations: context.feedback.iteration,
          metQualityThreshold: metQuality,
          finalQualityScore: context.feedback.lastQualityScore,
          learnings: context.feedback.learnings
        }
      }
    };
  }
}

/**
 * Creates the default HYDRA pipeline with Gemini Thinking for ROUTE and SYNTHESIZE
 * @returns {Pipeline} Configured default pipeline
 */
export function createDefaultPipeline() {
  let llamacpp, gemini;

  try {
    llamacpp = getLlamaCppProvider();
    gemini = getGeminiProvider();
  } catch {
    // Fall back to legacy bridge if provider not initialized
    const bridge = llamacppBridge.getLlamaCppBridge();
    llamacpp = {
      generate: (prompt, opts) => bridge.generate(prompt, opts),
      selectModel: () => 'main',
      selectTool: () => 'llama_generate'
    };
    gemini = {
      generate: geminiClient.generate,
      generateWithThinking: geminiClient.generateWithThinking || geminiClient.generate
    };
  }

  const config = getConfigManager().getValue('pipeline', {});
  const geminiConfig = getConfigManager().getValue('providers.gemini', {});
  const thinkingModel = geminiConfig.thinkingModel || 'gemini-2.0-flash-thinking-exp';

  return new PipelineBuilder()
    // STAGE 1: ROUTE (using Gemini Thinking for deep analysis)
    .addStage('route', async (ctx, input) => {
      const knowledge = input.accumulatedKnowledge || '';

      // Use Gemini Thinking for routing with accumulated knowledge
      const result = await routeWithThinking(ctx.prompt, {
        gemini,
        thinkingModel,
        accumulatedKnowledge: knowledge,
        iteration: input.iteration || 1
      });

      return result;
    }, {
      timeout: 30000,
      fallback: async (ctx) => {
        // Fallback to heuristic routing
        return routeWithCost(ctx.prompt);
      }
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

      const result = await llamacpp.generate(contextPrompt, {
        model: llamacpp.selectModel ? llamacpp.selectModel('research') : 'main',
        taskType: 'research',
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
      const knowledge = input.accumulatedKnowledge || '';

      if (routing.complexity <= 2) {
        return {
          plan: [{ task: 'direct_execution', provider: routing.provider }],
          skipped: true
        };
      }

      const planPrompt = `Create a brief execution plan for this task (max 5 steps):
Task: "${ctx.prompt.slice(0, 300)}"
${speculation?.context ? `Context: ${speculation.context}` : ''}
${knowledge ? `\nPrevious learnings:\n${knowledge}` : ''}
Format: numbered list, one line per step.`;

      // Use appropriate provider based on complexity
      const provider = routing.complexity >= 4 ? gemini : llamacpp;
      const result = await provider.generate(planPrompt, {
        model: routing.complexity >= 4 ? undefined : (llamacpp.selectModel ? llamacpp.selectModel('research') : 'main'),
        taskType: 'research',
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
        const result = await executeTask(ctx.prompt, routing, { llamacpp, gemini });
        results.push({ step: 'main', ...result });
        return { results, parallel: false };
      }

      // Multi-step execution
      for (const step of plan.plan) {
        const stepPrompt = `${step.task}\n\nOriginal request: ${ctx.prompt.slice(0, 200)}`;
        const stepRouting = step.provider === 'auto'
          ? await route(step.task)
          : { provider: step.provider, model: routing.model, tool: routing.tool };

        try {
          const result = await executeTask(stepPrompt, stepRouting, { llamacpp, gemini });
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

    // STAGE 5: SYNTHESIZE (using Gemini Thinking for deep synthesis)
    .addStage('synthesize', async (ctx, input) => {
      const execution = input.execute;
      const knowledge = input.accumulatedKnowledge || '';

      // Single result doesn't need synthesis
      if (execution.results.length === 1 && !knowledge) {
        return {
          content: execution.results[0].content,
          skipped: true
        };
      }

      const combinedResults = execution.results
        .map(r => `[Step ${r.step}]: ${r.content || r.error}`)
        .join('\n\n');

      const synthPrompt = `You are synthesizing results into a comprehensive, high-quality response.

## Original Task:
${ctx.prompt}

## Execution Results:
${combinedResults}

${knowledge ? `## Previous Iterations & Learnings:\n${knowledge}` : ''}

## Instructions:
1. Combine these results into a coherent, well-structured response
2. Ensure completeness - address ALL aspects of the original task
3. Be accurate and precise
4. If previous iterations exist, improve upon their weaknesses
5. Format the response appropriately (use markdown if helpful)

Provide the unified response:`;

      // Use Gemini Thinking for synthesis
      const result = await gemini.generate(synthPrompt, {
        model: thinkingModel,
        maxTokens: 4096
      });

      return {
        content: result.content,
        duration_ms: result.duration_ms,
        skipped: false,
        usedThinkingModel: true
      };
    }, {
      optional: true,
      skipCondition: () => !config.enableSynthesis,
      timeout: 90000,
      fallback: async (ctx, input) => ({
        content: input.execute.results.map(r => r.content).filter(Boolean).join('\n\n'),
        fallback: true
      })
    })

    // STAGE 6: EVALUATE (quality assessment for feedback loop)
    .addStage('evaluate', async (ctx, input) => {
      const synthesis = input.synthesize;
      const content = synthesis?.content || input.execute?.results?.[0]?.content || '';

      if (!config.enableFeedbackLoop) {
        return { qualityScore: 10, skipped: true };
      }

      const evalPrompt = `You are evaluating the quality of an AI response.

## Original Task:
${ctx.prompt}

## Response to Evaluate:
${content.slice(0, 3000)}

## Evaluation Criteria:
1. Completeness (0-10): Does it address all parts of the task?
2. Accuracy (0-10): Is the information correct and precise?
3. Clarity (0-10): Is it well-organized and easy to understand?
4. Usefulness (0-10): Would this response help the user?

## Output Format (JSON only):
{
  "completeness": <score>,
  "accuracy": <score>,
  "clarity": <score>,
  "usefulness": <score>,
  "overall": <average score>,
  "improvements": ["suggestion 1", "suggestion 2"]
}

Respond with ONLY the JSON, no other text:`;

      try {
        // Use Gemini Thinking for evaluation
        const result = await gemini.generate(evalPrompt, {
          model: thinkingModel,
          maxTokens: 512,
          temperature: 0.1
        });

        // Parse JSON response
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const evaluation = JSON.parse(jsonMatch[0]);
          return {
            qualityScore: evaluation.overall || 5,
            completeness: evaluation.completeness,
            accuracy: evaluation.accuracy,
            clarity: evaluation.clarity,
            usefulness: evaluation.usefulness,
            improvements: evaluation.improvements || [],
            duration_ms: result.duration_ms
          };
        }

        return { qualityScore: 7, improvements: [], duration_ms: result.duration_ms };

      } catch (error) {
        // If evaluation fails, assume quality is acceptable
        return { qualityScore: 7, improvements: [], error: error.message };
      }
    }, {
      optional: true,
      skipCondition: () => !config.enableFeedbackLoop,
      timeout: 30000,
      fallback: async () => ({ qualityScore: 7, improvements: [], fallback: true })
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
  const { llamacpp, gemini } = providers;
  const { provider, model, tool } = routing;

  if (provider === 'llamacpp') {
    return llamacpp.generate(prompt, { model, tool });
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

  let llamacpp, gemini;
  try {
    llamacpp = getLlamaCppProvider();
    gemini = getGeminiProvider();
  } catch {
    const bridge = llamacppBridge.getLlamaCppBridge();
    llamacpp = { generate: (p, o) => bridge.generate(p, o) };
    gemini = { generate: geminiClient.generate };
  }

  if (routing.provider === 'llamacpp') {
    const result = await llamacpp.generate(prompt, {
      model: routing.model,
      tool: routing.tool
    });
    return { ...result, provider: 'llamacpp', model: routing.model, tool: routing.tool };
  }

  const result = await gemini.generate(prompt);
  return { ...result, provider: 'gemini' };
}

// Export classes for advanced usage
export { Pipeline, ExecutionContext };

// Export executeTask for backward compatibility
export { executeTask };
