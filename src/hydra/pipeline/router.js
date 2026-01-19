/**
 * HYDRA Router - Task Classification & Model Selection
 * Uses Ollama llama3.2:1b for fast routing decisions
 */

import * as ollama from '../providers/ollama-client.js';

// Task categories and their optimal providers
const TASK_CATEGORIES = {
  // Simple tasks → Ollama (cost=$0, fast)
  simple: {
    patterns: ['hello', 'hi', 'thanks', 'ok', 'yes', 'no', 'what is', 'define'],
    provider: 'ollama',
    model: 'llama3.2:1b',
    maxComplexity: 1
  },

  // Code generation → Ollama Qwen for simple, Gemini for complex
  code: {
    patterns: ['code', 'function', 'implement', 'write', 'create', 'script', 'class', 'api'],
    provider: 'auto', // Decides based on complexity
    ollamaModel: 'qwen2.5-coder:1.5b',
    maxComplexity: 3
  },

  // Research & analysis → Ollama for gathering, Gemini for synthesis
  research: {
    patterns: ['explain', 'analyze', 'compare', 'research', 'find', 'search', 'list'],
    provider: 'auto',
    ollamaModel: 'llama3.2:3b',
    maxComplexity: 2
  },

  // Complex reasoning → Gemini (best quality)
  complex: {
    patterns: ['architecture', 'design', 'optimize', 'refactor', 'debug', 'plan', 'strategy'],
    provider: 'gemini',
    maxComplexity: 5
  },

  // Creative tasks → Gemini
  creative: {
    patterns: ['write', 'story', 'poem', 'creative', 'imagine', 'generate'],
    provider: 'gemini',
    maxComplexity: 4
  }
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
    'architecture', 'microservices', 'comprehensive', 'design',
    'deployment', 'strategy', 'production', 'scalable',
    'distributed', 'enterprise', 'full-stack', 'end-to-end'
  ];

  for (const keyword of highComplexityKeywords) {
    if (lower.includes(keyword)) {
      score = Math.max(score, 4);
      break;
    }
  }

  // Medium complexity indicators
  const complexIndicators = [
    'multiple', 'several', 'all', 'detailed',
    'step by step', 'system', 'integration',
    'performance', 'security', 'authentication',
    'database', 'api', 'contracts', 'include'
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
 * Route task using Ollama for fast classification
 * @param {string} prompt - User prompt
 * @returns {Promise<{category: string, provider: string, model: string, complexity: number, reasoning: string}>}
 */
export async function route(prompt) {
  const startTime = Date.now();

  // Quick heuristic classification first
  const heuristicCategory = detectCategory(prompt);
  const complexity = analyzeComplexity(prompt);

  // For very simple prompts, skip LLM routing
  if (complexity <= 1 && prompt.split(/\s+/).length < 10) {
    return {
      category: 'simple',
      provider: 'ollama',
      model: 'llama3.2:1b',
      complexity,
      reasoning: 'Heuristic: simple short prompt',
      duration_ms: Date.now() - startTime
    };
  }

  // Use Ollama for intelligent routing on ambiguous cases
  try {
    const routingPrompt = `Classify this task into ONE category: simple, code, research, complex, creative.
Task: "${prompt.slice(0, 200)}"
Respond with ONLY the category name, nothing else.`;

    const result = await ollama.generate(routingPrompt, {
      model: 'llama3.2:1b',
      temperature: 0.1,
      maxTokens: 10
    });

    const llmCategory = result.content.trim().toLowerCase();
    const validCategories = Object.keys(TASK_CATEGORIES);
    const finalCategory = validCategories.includes(llmCategory) ? llmCategory : heuristicCategory;

    // Determine provider based on category and complexity
    const config = TASK_CATEGORIES[finalCategory];
    let provider = config.provider;
    let model = config.model || config.ollamaModel;

    // Auto-routing logic
    if (provider === 'auto') {
      if (complexity <= config.maxComplexity) {
        provider = 'ollama';
        model = config.ollamaModel;
      } else {
        provider = 'gemini';
        model = null; // Use default Gemini model
      }
    }

    return {
      category: finalCategory,
      provider,
      model,
      complexity,
      reasoning: `LLM: ${llmCategory}, Heuristic: ${heuristicCategory}, Complexity: ${complexity}`,
      duration_ms: Date.now() - startTime
    };
  } catch (error) {
    // Fallback to heuristic on Ollama failure
    const config = TASK_CATEGORIES[heuristicCategory];

    return {
      category: heuristicCategory,
      provider: complexity > 2 ? 'gemini' : 'ollama',
      model: complexity > 2 ? null : (config.ollamaModel || 'llama3.2:3b'),
      complexity,
      reasoning: `Fallback heuristic (Ollama error: ${error.message})`,
      duration_ms: Date.now() - startTime
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
    ollama: { perToken: 0, fixedCost: 0 },
    gemini: { perToken: 0.000001, fixedCost: 0.001 } // Approximate
  };

  const estimatedTokens = Math.ceil(prompt.length / 4) * 2; // Input + output estimate
  const providerCost = costs[decision.provider];

  decision.estimatedCost = decision.provider === 'ollama'
    ? 0
    : (providerCost.fixedCost + estimatedTokens * providerCost.perToken);

  decision.costSavings = decision.provider === 'ollama'
    ? costs.gemini.fixedCost + estimatedTokens * costs.gemini.perToken
    : 0;

  return decision;
}

export { TASK_CATEGORIES, analyzeComplexity, detectCategory };
