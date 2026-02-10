/**
 * HYDRA Router - Task Classification & Model Selection
 * Uses LlamaCpp (via MCP tools) for fast routing decisions
 */

import { getLlamaCppBridge } from '../providers/llamacpp-bridge.js';
import { getModelForTask } from '../providers/llamacpp-models.js';

// Task categories and their optimal providers
const TASK_CATEGORIES = {
  // Simple tasks → LlamaCpp (cost=$0, fast)
  simple: {
    patterns: ['hello', 'hi', 'thanks', 'ok', 'yes', 'no', 'what is', 'define'],
    provider: 'llamacpp',
    model: 'draft',
    tool: 'llama_generate_fast',
    maxComplexity: 1,
  },

  // Code generation → LlamaCpp for simple, Gemini for complex
  code: {
    patterns: ['code', 'function', 'implement', 'write', 'create', 'script', 'class', 'api'],
    provider: 'auto', // Decides based on complexity
    llamacppModel: 'main',
    llamacppTool: 'llama_code',
    maxComplexity: 3,
  },

  // Research & analysis → LlamaCpp for gathering, Gemini for synthesis
  research: {
    patterns: ['explain', 'analyze', 'compare', 'research', 'find', 'search', 'list'],
    provider: 'auto',
    llamacppModel: 'main',
    llamacppTool: 'llama_generate',
    maxComplexity: 2,
  },

  // Complex reasoning → Gemini (best quality)
  complex: {
    patterns: ['architecture', 'design', 'optimize', 'refactor', 'debug', 'plan', 'strategy'],
    provider: 'gemini',
    maxComplexity: 5,
  },

  // Creative tasks → Gemini
  creative: {
    patterns: ['write', 'story', 'poem', 'creative', 'imagine', 'generate'],
    provider: 'gemini',
    maxComplexity: 4,
  },

  // JSON structured output → LlamaCpp
  json: {
    patterns: ['json', 'structured', 'schema', 'format as'],
    provider: 'llamacpp',
    llamacppModel: 'main',
    llamacppTool: 'llama_json',
    maxComplexity: 2,
  },

  // Analysis tasks → LlamaCpp
  analyze: {
    patterns: ['sentiment', 'summarize', 'keywords', 'classify', 'translate'],
    provider: 'llamacpp',
    llamacppModel: 'main',
    llamacppTool: 'llama_analyze',
    maxComplexity: 2,
  },
};

/**
 * Analyze task complexity (1-5 scale)
 * @param {string} prompt - User prompt
 * @returns {number} Complexity score
 */
function analyzeComplexity(prompt) {
  let score = 1;
  const lower = prompt.toLowerCase();

  // Length factor - stronger impact
  const words = prompt.split(/\s+/).length;
  if (words > 20) score += 0.5;
  if (words > 40) score += 0.5;
  if (words > 60) score += 0.5;
  if (words > 100) score += 0.5;

  // High complexity keywords - immediate bump to 4+
  const highComplexityKeywords = [
    'architecture',
    'microservices',
    'comprehensive',
    'design',
    'deployment',
    'strategy',
    'production',
    'scalable',
    'distributed',
    'enterprise',
    'full-stack',
    'end-to-end',
  ];

  for (const keyword of highComplexityKeywords) {
    if (lower.includes(keyword)) {
      score = Math.max(score, 4);
      break;
    }
  }

  // Medium complexity indicators
  const complexIndicators = [
    'multiple',
    'several',
    'all',
    'detailed',
    'step by step',
    'system',
    'integration',
    'performance',
    'security',
    'authentication',
    'database',
    'api',
    'contracts',
    'include',
  ];

  for (const indicator of complexIndicators) {
    if (lower.includes(indicator)) {
      score += 0.5;
    }
  }

  // Code complexity - look for multi-component requests
  if (/```|\bcode\b|function|class|implement/i.test(prompt)) {
    const codeIndicators = ['test', 'error handling', 'async', 'database', 'api', 'crud'];
    for (const ind of codeIndicators) {
      if (lower.includes(ind)) {
        score += 0.5;
      }
    }
  }

  // Multiple distinct tasks indicator (commas, "and", lists)
  const taskCount = (prompt.match(/,\s*and\s+|\band\b|,/g) || []).length;
  if (taskCount >= 3) score += 1;
  if (taskCount >= 5) score += 1;

  return Math.min(5, Math.round(score));
}

/**
 * Detect task category from prompt
 * @param {string} prompt - User prompt
 * @returns {string} Category name
 */
function detectCategory(prompt) {
  const lower = prompt.toLowerCase();

  for (const [category, config] of Object.entries(TASK_CATEGORIES)) {
    for (const pattern of config.patterns) {
      if (lower.includes(pattern)) {
        return category;
      }
    }
  }

  return 'research'; // Default category
}

/**
 * Route task using LlamaCpp for fast classification
 * @param {string} prompt - User prompt
 * @returns {Promise<{category: string, provider: string, model: string, tool: string, complexity: number, reasoning: string}>}
 */
export async function route(prompt) {
  const startTime = Date.now();

  // Quick heuristic classification first
  const heuristicCategory = detectCategory(prompt);
  const complexity = analyzeComplexity(prompt);

  // For very simple prompts, skip LLM routing
  if (complexity <= 1 && prompt.split(/\s+/).length < 10) {
    const taskConfig = getModelForTask('route');
    return {
      category: 'simple',
      provider: 'llamacpp',
      model: taskConfig.model,
      tool: taskConfig.tool,
      complexity,
      reasoning: 'Heuristic: simple short prompt',
      duration_ms: Date.now() - startTime,
    };
  }

  // Use LlamaCpp for intelligent routing on ambiguous cases
  try {
    const bridge = getLlamaCppBridge();
    const routingPrompt = `Classify this task into ONE category: simple, code, research, complex, creative, json, analyze.
Task: "${prompt.slice(0, 200)}"
Respond with ONLY the category name, nothing else.`;

    const result = await bridge.generateFast(routingPrompt, {
      maxTokens: 10,
      temperature: 0.1,
    });

    const llmCategory = result.content.trim().toLowerCase();
    const validCategories = Object.keys(TASK_CATEGORIES);
    const finalCategory = validCategories.includes(llmCategory) ? llmCategory : heuristicCategory;

    // Determine provider based on category and complexity
    const config = TASK_CATEGORIES[finalCategory];
    let provider = config.provider;
    let model = config.model || config.llamacppModel;
    let tool = config.tool || config.llamacppTool;

    // Auto-routing logic
    if (provider === 'auto') {
      if (complexity <= config.maxComplexity) {
        provider = 'llamacpp';
        model = config.llamacppModel;
        tool = config.llamacppTool;
      } else {
        provider = 'gemini';
        model = null; // Use default Gemini model
        tool = null;
      }
    }

    return {
      category: finalCategory,
      provider,
      model,
      tool,
      complexity,
      reasoning: `LLM: ${llmCategory}, Heuristic: ${heuristicCategory}, Complexity: ${complexity}`,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    // Fallback to heuristic on LlamaCpp failure
    const config = TASK_CATEGORIES[heuristicCategory];
    const taskConfig = getModelForTask(heuristicCategory);

    return {
      category: heuristicCategory,
      provider: complexity > 2 ? 'gemini' : 'llamacpp',
      model: complexity > 2 ? null : config.llamacppModel || taskConfig.model,
      tool: complexity > 2 ? null : config.llamacppTool || taskConfig.tool,
      complexity,
      reasoning: `Fallback heuristic (LlamaCpp error: ${error.message})`,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Get routing decision with cost estimation
 * @param {string} prompt - User prompt
 * @returns {Promise<object>} Routing decision with cost info
 */
export async function routeWithCost(prompt) {
  const decision = await route(prompt);

  // Cost estimation
  const costs = {
    llamacpp: { perToken: 0, fixedCost: 0 }, // Local = free
    gemini: { perToken: 0.000001, fixedCost: 0.001 }, // Approximate
  };

  const estimatedTokens = Math.ceil(prompt.length / 4) * 2; // Input + output estimate
  const providerCost = costs[decision.provider] || costs.llamacpp;

  decision.estimatedCost =
    decision.provider === 'llamacpp'
      ? 0
      : providerCost.fixedCost + estimatedTokens * providerCost.perToken;

  decision.costSavings =
    decision.provider === 'llamacpp'
      ? costs.gemini.fixedCost + estimatedTokens * costs.gemini.perToken
      : 0;

  return decision;
}

/**
 * Route task using Gemini Thinking model for deep analysis
 * Uses accumulated knowledge from previous iterations
 * @param {string} prompt - User prompt
 * @param {Object} options - Routing options
 * @param {Object} options.gemini - Gemini provider instance
 * @param {string} options.thinkingModel - Thinking model name
 * @param {string} [options.accumulatedKnowledge] - Knowledge from previous iterations
 * @param {number} [options.iteration=1] - Current iteration number
 * @returns {Promise<Object>} Routing decision with deep analysis
 */
export async function routeWithThinking(prompt, options = {}) {
  const startTime = Date.now();
  const { gemini, thinkingModel, accumulatedKnowledge = '', iteration = 1 } = options;

  // For first iteration without knowledge, use fast heuristic for simple prompts
  if (iteration === 1 && !accumulatedKnowledge && prompt.split(/\s+/).length < 10) {
    const complexity = analyzeComplexity(prompt);
    if (complexity <= 1) {
      const taskConfig = getModelForTask('route');
      return {
        category: 'simple',
        provider: 'llamacpp',
        model: taskConfig.model,
        tool: taskConfig.tool,
        complexity,
        reasoning: 'Fast path: simple short prompt',
        duration_ms: Date.now() - startTime,
        usedThinkingModel: false,
      };
    }
  }

  // Use Gemini Thinking for deep analysis
  const routingPrompt = `You are an intelligent task router for a multi-model AI system.
Analyze this task and determine the optimal execution strategy.

## Task to Analyze:
"${prompt.slice(0, 500)}"

${accumulatedKnowledge ? `## Previous Iterations Knowledge:\n${accumulatedKnowledge}` : ''}

## Available Models:
1. **llamacpp/draft** - Fast routing, simple tasks (tool: llama_generate_fast)
2. **llamacpp/main** - Research, analysis, general tasks (tool: llama_generate)
3. **llamacpp/main** - Code generation (tool: llama_code)
4. **llamacpp/main** - JSON structured output (tool: llama_json)
5. **llamacpp/main** - Text analysis (tool: llama_analyze)
6. **gemini** - Creative writing, architecture, complex multi-step tasks

## Analysis Required:
1. Task category: simple | code | research | complex | creative | json | analyze
2. Complexity score (1-5)
3. Best provider: llamacpp | gemini
4. Best model (if llamacpp): draft | main
5. Best tool (if llamacpp): llama_generate_fast | llama_generate | llama_code | llama_json | llama_analyze
6. Reasoning for your choice
${iteration > 1 ? '7. How to improve based on previous iterations' : ''}

## Output Format (JSON only):
{
  "category": "<category>",
  "complexity": <1-5>,
  "provider": "<llamacpp|gemini>",
  "model": "<model or null for gemini>",
  "tool": "<tool or null for gemini>",
  "reasoning": "<brief explanation>",
  "improvements": ["<improvement 1>", "<improvement 2>"]
}

Respond with ONLY the JSON:`;

  try {
    const result = await gemini.generate(routingPrompt, {
      model: thinkingModel,
      maxTokens: 512,
      temperature: 0.1,
    });

    // Parse JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const routing = JSON.parse(jsonMatch[0]);

      // Validate and normalize response
      const validCategories = [
        'simple',
        'code',
        'research',
        'complex',
        'creative',
        'json',
        'analyze',
      ];
      const category = validCategories.includes(routing.category) ? routing.category : 'research';
      const complexity = Math.min(5, Math.max(1, routing.complexity || analyzeComplexity(prompt)));

      // Cost estimation
      const costs = {
        llamacpp: { perToken: 0, fixedCost: 0 },
        gemini: { perToken: 0.000001, fixedCost: 0.001 },
      };
      const estimatedTokens = Math.ceil(prompt.length / 4) * 2;
      const provider = routing.provider === 'gemini' ? 'gemini' : 'llamacpp';

      // Get default tool for category if not specified
      const taskConfig = getModelForTask(category);
      const model = provider === 'llamacpp' ? routing.model || taskConfig.model : null;
      const tool = provider === 'llamacpp' ? routing.tool || taskConfig.tool : null;

      return {
        category,
        provider,
        model,
        tool,
        complexity,
        reasoning: routing.reasoning || 'Gemini Thinking analysis',
        improvements: routing.improvements || [],
        estimatedCost:
          provider === 'gemini'
            ? costs.gemini.fixedCost + estimatedTokens * costs.gemini.perToken
            : 0,
        costSavings:
          provider === 'llamacpp'
            ? costs.gemini.fixedCost + estimatedTokens * costs.gemini.perToken
            : 0,
        duration_ms: Date.now() - startTime,
        usedThinkingModel: true,
        iteration,
      };
    }

    // Fallback to heuristic if JSON parsing fails
    return await routeWithCost(prompt);
  } catch (error) {
    console.warn('[Router] Gemini Thinking failed, falling back to heuristic:', error.message);
    return await routeWithCost(prompt);
  }
}

export { TASK_CATEGORIES, analyzeComplexity, detectCategory };
