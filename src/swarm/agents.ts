/**
 * ClaudeHydra - The 12 Witcher Agents
 * School of the Wolf - Agent Definitions and Management
 *
 * 3-Tier Model Hierarchy:
 * - COMMANDER (Claude Opus): Strategic planning and coordination
 * - COORDINATOR (Claude Sonnet): Research, synthesis, communication
 * - EXECUTOR (llama-cpp): Task execution via local inference (MCP tools)
 *
 * @module swarm/agents
 */

import { getLlamaCppBridge } from '../hydra/providers/llamacpp-bridge.js';
import { EXECUTOR_AGENT_MODELS, getModelForAgent } from '../hydra/providers/llamacpp-models.js';
import { generate as claudeGenerate, healthCheck as claudeHealthCheck, selectModel as claudeSelectModel } from '../hydra/providers/claude-client.js';

// =============================================================================
// MODEL TIER HIERARCHY
// =============================================================================

/**
 * Model tier definitions
 * Maps tier names to model configurations
 */
export const MODEL_TIERS = {
  // TIER 1: COMMANDER - Claude Opus (highest capability)
  commander: {
    provider: 'claude',
    model: 'claude-opus',
    displayName: 'Claude Opus',
    description: 'Strategic planning, task allocation, complex reasoning'
  },

  // TIER 2: COORDINATOR - Claude Sonnet (balanced)
  coordinator: {
    provider: 'claude',
    model: 'claude-sonnet',
    displayName: 'Claude Sonnet',
    description: 'Research, synthesis, summarization, communication'
  },

  // TIER 3: EXECUTOR - llama-cpp (local inference via MCP)
  executor: {
    provider: 'llamacpp',
    model: 'main',  // Default executor model
    tool: 'llama_generate',
    displayName: 'llama-cpp Local',
    description: 'Task execution, code generation, focused work'
  }
};

/**
 * Agent tier assignments
 * Maps each agent to their operational tier
 */
export const AGENT_TIERS = {
  // COMMANDER (1 agent) - Claude Opus
  Dijkstra: 'commander',

  // COORDINATORS (3 agents) - Claude Sonnet
  Regis: 'coordinator',
  Yennefer: 'coordinator',
  Jaskier: 'coordinator',

  // EXECUTORS (8 agents) - llama.cpp
  Geralt: 'executor',
  Triss: 'executor',
  Vesemir: 'executor',
  Ciri: 'executor',
  Eskel: 'executor',
  Lambert: 'executor',
  Zoltan: 'executor',
  Philippa: 'executor'
};

/**
 * Executor model specializations
 * LlamaCpp models and tools for different executor tasks
 * Uses EXECUTOR_AGENT_MODELS from llamacpp-models.js
 */
export const EXECUTOR_MODELS = {
  Ciri: { model: 'draft', tool: 'llama_generate_fast' },     // Fastest - simple tasks
  Geralt: { model: 'main', tool: 'llama_generate' },         // General - security/ops
  Triss: { model: 'main', tool: 'llama_code' },              // Code - testing
  Vesemir: { model: 'main', tool: 'llama_generate' },        // General - mentoring/review
  Eskel: { model: 'main', tool: 'llama_generate' },          // General - devops/infra
  Lambert: { model: 'main', tool: 'llama_code' },            // Code - debug
  Zoltan: { model: 'main', tool: 'llama_json' },             // Data/database - JSON output
  Philippa: { model: 'functionary', tool: 'llama_function_call' } // API integrations
};

// =============================================================================
// AGENT SPECIFICATIONS
// =============================================================================

/**
 * Agent specializations with persona and skills
 */
export const AGENT_SPECS = {
  // COMMANDER
  Dijkstra: {
    persona: 'Spymaster',
    focus: 'Planning/Strategy',
    tier: 'commander',
    skills: ['strategic planning', 'coordination', 'resource allocation', 'task decomposition']
  },

  // COORDINATORS
  Regis: {
    persona: 'Sage',
    focus: 'Research/Analysis',
    tier: 'coordinator',
    skills: ['deep analysis', 'research', 'complex reasoning', 'knowledge synthesis']
  },
  Yennefer: {
    persona: 'Sorceress',
    focus: 'Synthesis/Architecture',
    tier: 'coordinator',
    skills: ['result synthesis', 'architecture design', 'integration', 'quality assurance']
  },
  Jaskier: {
    persona: 'Bard',
    focus: 'Communication/Summary',
    tier: 'coordinator',
    skills: ['documentation', 'summarization', 'reports', 'user communication']
  },

  // EXECUTORS
  Geralt: {
    persona: 'White Wolf',
    focus: 'Security/Ops',
    tier: 'executor',
    skills: ['system commands', 'security checks', 'threat analysis', 'operations']
  },
  Triss: {
    persona: 'Healer',
    focus: 'QA/Testing',
    tier: 'executor',
    skills: ['tests', 'validation', 'bug fixes', 'quality assurance']
  },
  Vesemir: {
    persona: 'Mentor',
    focus: 'Mentoring/Review',
    tier: 'executor',
    skills: ['code review', 'best practices', 'teaching', 'guidance']
  },
  Ciri: {
    persona: 'Prodigy',
    focus: 'Speed/Quick',
    tier: 'executor',
    skills: ['fast tasks', 'simple operations', 'quick responses']
  },
  Eskel: {
    persona: 'Pragmatist',
    focus: 'DevOps/Infrastructure',
    tier: 'executor',
    skills: ['CI/CD', 'deployment', 'infrastructure', 'automation']
  },
  Lambert: {
    persona: 'Skeptic',
    focus: 'Debugging/Profiling',
    tier: 'executor',
    skills: ['debugging', 'performance optimization', 'profiling', 'troubleshooting']
  },
  Zoltan: {
    persona: 'Craftsman',
    focus: 'Data/Database',
    tier: 'executor',
    skills: ['data operations', 'DB migrations', 'data modeling', 'SQL']
  },
  Philippa: {
    persona: 'Strategist',
    focus: 'Integration/API',
    tier: 'executor',
    skills: ['external APIs', 'integrations', 'third-party services', 'webhooks']
  }
};

/**
 * All available agent names
 */
export const AGENT_NAMES = Object.keys(AGENT_SPECS);

// =============================================================================
// MODEL RESOLUTION
// =============================================================================

/**
 * Get the model configuration for a specific agent
 * @param {string} agent - Agent name
 * @returns {Object} Model configuration with provider, model, and tool
 */
export function getAgentModel(agent) {
  const tier = AGENT_TIERS[agent];

  if (!tier) {
    // Fallback to executor tier
    return {
      provider: 'llamacpp',
      model: 'main',
      tool: 'llama_generate'
    };
  }

  const tierConfig = MODEL_TIERS[tier];

  // For executors, use specialized model/tool if available
  if (tier === 'executor') {
    const executorConfig = EXECUTOR_MODELS[agent] || getModelForAgent(agent);
    if (executorConfig) {
      return {
        provider: 'llamacpp',
        model: executorConfig.model,
        tool: executorConfig.tool
      };
    }
  }

  return {
    provider: tierConfig.provider,
    model: tierConfig.model,
    tool: tierConfig.tool || null
  };
}

/**
 * Get agent specification
 * @param {string} agent - Agent name
 * @returns {Object|null} Agent spec or null
 */
export function getAgentSpec(agent) {
  return AGENT_SPECS[agent] || null;
}

/**
 * Get agent tier
 * @param {string} agent - Agent name
 * @returns {string} Tier name
 */
export function getAgentTier(agent) {
  return AGENT_TIERS[agent] || 'executor';
}

/**
 * Get all agents by tier
 * @param {string} tier - Tier name
 * @returns {string[]} Agent names
 */
export function getAgentsByTier(tier) {
  return Object.entries(AGENT_TIERS)
    .filter(([_, t]) => t === tier)
    .map(([agent]) => agent);
}

// =============================================================================
// AGENT PROMPTS
// =============================================================================

/**
 * Build system prompt for an agent
 * @param {string} agent - Agent name
 * @returns {string} System prompt
 */
export function buildAgentPrompt(agent) {
  const spec = getAgentSpec(agent);
  if (!spec) {
    return 'You are a helpful AI assistant.';
  }

  const tierInfo = MODEL_TIERS[spec.tier];

  return `You are ${agent}, the ${spec.persona} from the School of the Wolf.
Your role: ${tierInfo?.description || spec.focus}
Your specialization: ${spec.focus}
Your skills: ${spec.skills.join(', ')}

${spec.tier === 'commander' ? 'As Commander, you plan and coordinate the swarm. Create clear task plans with agent assignments.' : ''}
${spec.tier === 'coordinator' ? 'As Coordinator, you synthesize information and communicate findings clearly.' : ''}
${spec.tier === 'executor' ? 'As Executor, you focus on completing tasks efficiently and thoroughly.' : ''}

Respond in character while completing the task professionally.
Be concise but thorough. Focus on your area of expertise.`;
}

// =============================================================================
// AGENT INVOCATION
// =============================================================================

/**
 * Execute a task with a specific agent
 * Routes to appropriate provider based on agent tier
 *
 * @param {string} agent - Agent name
 * @param {string} prompt - Task prompt
 * @param {Object} options - Options
 * @param {string} [options.context] - Additional context
 * @param {number} [options.timeout] - Timeout in ms
 * @returns {Promise<Object>} Result with success, response, duration
 */
export async function invokeAgent(agent, prompt, options = {}) {
  const { context = '', timeout = 60000 } = options;

  const modelConfig = getAgentModel(agent);
  const systemPrompt = buildAgentPrompt(agent);

  const fullPrompt = context
    ? `${systemPrompt}\n\nContext: ${context}\n\nTask: ${prompt}`
    : `${systemPrompt}\n\nTask: ${prompt}`;

  const startTime = Date.now();

  try {
    let result;

    if (modelConfig.provider === 'claude') {
      // Use Claude API for commander/coordinator tiers
      result = await claudeGenerate(prompt, {
        model: modelConfig.model,
        system: systemPrompt,
        timeout,
        temperature: 0.7
      });
    } else {
      // Use LlamaCpp (via MCP bridge) for executor tier
      const bridge = getLlamaCppBridge();

      // Select appropriate bridge method based on tool
      switch (modelConfig.tool) {
        case 'llama_generate_fast':
          result = await bridge.generateFast(fullPrompt, {
            maxTokens: 512,
            temperature: 0.7
          });
          break;
        case 'llama_code':
          result = await bridge.code('generate', {
            description: prompt,
            language: 'javascript'
          });
          break;
        case 'llama_json':
          result = await bridge.json(fullPrompt, {}, {
            maxTokens: 2048
          });
          break;
        case 'llama_function_call':
          result = await bridge.functionCall([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ], [], { maxTokens: 2048 });
          break;
        default:
          result = await bridge.generate(fullPrompt, {
            maxTokens: 2048,
            temperature: 0.7
          });
      }
    }

    if (result.success !== false) {
      return {
        success: true,
        agent,
        tier: getAgentTier(agent),
        provider: modelConfig.provider,
        model: modelConfig.model,
        tool: modelConfig.tool,
        response: result.content,
        duration: Date.now() - startTime,
        tokens: result.tokens
      };
    } else {
      return {
        success: false,
        agent,
        tier: getAgentTier(agent),
        provider: modelConfig.provider,
        model: modelConfig.model,
        tool: modelConfig.tool,
        error: result.error,
        duration: Date.now() - startTime
      };
    }
  } catch (error) {
    return {
      success: false,
      agent,
      tier: getAgentTier(agent),
      provider: modelConfig.provider,
      model: modelConfig.model,
      tool: modelConfig.tool,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

// =============================================================================
// CLASSIFICATION
// =============================================================================

/**
 * Classify a prompt to determine the best agent
 * @param {string} prompt - The prompt to classify
 * @returns {Object} Classification result with agent, tier, and model
 */
export function classifyPrompt(prompt) {
  const promptLower = prompt.toLowerCase();

  let agent;

  // Pattern matching for agent selection
  if (/security|threat|attack|vulnerability|auth|hack|exploit/.test(promptLower)) {
    agent = 'Geralt';
  } else if (/architect|design|structure|refactor|code|implement|write/.test(promptLower)) {
    agent = 'Yennefer';
  } else if (/test|qa|quality|bug|validate|assert|spec/.test(promptLower)) {
    agent = 'Triss';
  } else if (/document|readme|explain|report|log|comment|summarize/.test(promptLower)) {
    agent = 'Jaskier';
  } else if (/review|mentor|best.?practice|guideline|improve/.test(promptLower)) {
    agent = 'Vesemir';
  } else if (/quick|fast|simple|easy|trivial/.test(promptLower)) {
    agent = 'Ciri';
  } else if (/deploy|ci|cd|docker|kubernetes|infra|devops/.test(promptLower)) {
    agent = 'Eskel';
  } else if (/debug|profile|performance|optimize|slow|memory/.test(promptLower)) {
    agent = 'Lambert';
  } else if (/data|database|sql|migration|schema|query/.test(promptLower)) {
    agent = 'Zoltan';
  } else if (/research|analyze|complex|deep|investigate|understand/.test(promptLower)) {
    agent = 'Regis';
  } else if (/plan|strategy|coordinate|schedule|allocate|roadmap/.test(promptLower)) {
    agent = 'Dijkstra';
  } else if (/api|integration|external|third.?party|http|webhook/.test(promptLower)) {
    agent = 'Philippa';
  } else {
    // Default to Yennefer for general coding tasks
    agent = 'Yennefer';
  }

  const modelConfig = getAgentModel(agent);

  return {
    prompt,
    agent,
    tier: getAgentTier(agent),
    provider: modelConfig.provider,
    model: modelConfig.model
  };
}

/**
 * Classify multiple prompts in parallel
 * @param {string[]} prompts - Array of prompts
 * @returns {Object[]} Classifications
 */
export function classifyPrompts(prompts) {
  return prompts.map(prompt => classifyPrompt(prompt));
}

// =============================================================================
// COMPLEXITY ANALYSIS
// =============================================================================

/**
 * Get prompt complexity analysis
 * @param {string} prompt - The prompt to analyze
 * @returns {Object} Complexity analysis
 */
export function analyzeComplexity(prompt) {
  const words = prompt.split(/\s+/);
  const wordCount = words.length;
  const hasCode = /```|function|class|def |const |let |var |import |export /.test(prompt);
  const hasMultipleTasks = /\d\.\s|•|\*\s|-\s/.test(prompt);
  const technicalTerms = (prompt.match(/api|database|async|parallel|thread|memory|performance|cache|queue|stream/gi) || []).length;

  let score = 0;
  score += Math.min(wordCount / 10, 5);
  score += hasCode ? 3 : 0;
  score += hasMultipleTasks ? 2 : 0;
  score += technicalTerms;

  let level;
  if (score <= 2) level = 'Simple';
  else if (score <= 5) level = 'Moderate';
  else if (score <= 8) level = 'Complex';
  else level = 'Advanced';

  // Recommended tier based on complexity
  const recommendedTier = {
    Simple: 'executor',
    Moderate: 'executor',
    Complex: 'coordinator',
    Advanced: 'commander'
  }[level];

  const recommendedAgent = {
    Simple: 'Ciri',
    Moderate: 'Yennefer',
    Complex: 'Regis',
    Advanced: 'Dijkstra'
  }[level];

  return {
    score: Math.round(score * 10) / 10,
    level,
    wordCount,
    hasCode,
    hasMultipleTasks,
    technicalTerms,
    recommendedTier,
    recommendedAgent
  };
}

// =============================================================================
// HEALTH CHECKS
// =============================================================================

/**
 * Check if all required providers are available
 * @returns {Promise<Object>} Status with provider availability
 */
export async function checkProviders() {
  const results = {
    claude: { available: false, models: [] },
    llamacpp: { available: false, models: [] }
  };

  // Check Claude
  try {
    const claudeHealth = await claudeHealthCheck();
    results.claude = {
      available: claudeHealth.available,
      models: claudeHealth.models || [],
      latency: claudeHealth.latency_ms
    };
  } catch (error) {
    results.claude.error = error.message;
  }

  // Check LlamaCpp (via MCP bridge)
  try {
    const bridge = getLlamaCppBridge();
    const llamacppHealth = await bridge.healthCheck(true);
    results.llamacpp = {
      available: llamacppHealth.available,
      models: llamacppHealth.models || ['main', 'draft', 'vision', 'functionary'],
      latency: llamacppHealth.duration_ms
    };
  } catch (error) {
    results.llamacpp.error = error.message;
  }

  // Determine overall readiness
  const commanderReady = results.claude.available;
  const coordinatorReady = results.claude.available;
  const executorReady = results.llamacpp.available;

  return {
    ...results,
    tiers: {
      commander: commanderReady,
      coordinator: coordinatorReady,
      executor: executorReady
    },
    allReady: commanderReady && coordinatorReady && executorReady,
    partialReady: commanderReady || coordinatorReady || executorReady
  };
}

/**
 * Check if all required LlamaCpp models are available
 * LlamaCpp models are managed by the MCP server, so we check via the bridge
 * @returns {Promise<Object>} Status with available models
 */
export async function checkRequiredModels() {
  const required = ['main', 'draft']; // Core models for executor tier

  try {
    const bridge = getLlamaCppBridge();
    const health = await bridge.healthCheck(true);

    if (!health.available) {
      return {
        available: false,
        installed: [],
        missing: required,
        allPresent: false
      };
    }

    // LlamaCpp MCP manages its own models
    const installed = health.models || ['main', 'draft', 'vision', 'functionary'];
    const missing = required.filter(m => !installed.includes(m));

    return {
      available: true,
      installed,
      missing,
      allPresent: missing.length === 0
    };
  } catch (error) {
    return {
      available: false,
      installed: [],
      missing: required,
      allPresent: false,
      error: error.message
    };
  }
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  // Tier configuration
  MODEL_TIERS,
  AGENT_TIERS,
  EXECUTOR_MODELS,

  // Agent definitions
  AGENT_SPECS,
  AGENT_NAMES,

  // Model resolution
  getAgentModel,
  getAgentSpec,
  getAgentTier,
  getAgentsByTier,

  // Prompts
  buildAgentPrompt,

  // Invocation
  invokeAgent,

  // Classification
  classifyPrompt,
  classifyPrompts,
  analyzeComplexity,

  // Health checks
  checkProviders,
  checkRequiredModels
};
