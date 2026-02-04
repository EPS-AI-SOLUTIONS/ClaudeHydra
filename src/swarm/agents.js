/**
 * ClaudeHydra - The 12 Witcher Agents
 * School of the Wolf - Agent Definitions and Management
 *
 * @module swarm/agents
 */

import { generate, healthCheck, selectModel } from '../hydra/providers/ollama-client.js';

/**
 * Agent model mapping - School of the Wolf
 * Maps each agent to their preferred Ollama model
 */
export const AGENT_MODELS = {
  Ciri: 'llama3.2:1b',         // Fastest - simple tasks
  Regis: 'phi3:mini',          // Analytical - deep research
  Yennefer: 'qwen2.5-coder:1.5b', // Code - architecture
  Triss: 'qwen2.5-coder:1.5b', // Code - testing
  Lambert: 'qwen2.5-coder:1.5b', // Code - debug
  Philippa: 'qwen2.5-coder:1.5b', // Code - integrations
  Geralt: 'llama3.2:3b',       // General - security/ops
  Jaskier: 'llama3.2:3b',      // General - docs/communication
  Vesemir: 'llama3.2:3b',      // General - mentoring/review
  Eskel: 'llama3.2:3b',        // General - devops/infra
  Zoltan: 'llama3.2:3b',       // General - data/database
  Dijkstra: 'llama3.2:3b'      // General - planning/strategy
};

/**
 * Agent specializations with persona and skills
 */
export const AGENT_SPECS = {
  Geralt: {
    persona: 'White Wolf',
    focus: 'Security/Ops',
    skills: ['system commands', 'security checks', 'threat analysis']
  },
  Yennefer: {
    persona: 'Sorceress',
    focus: 'Architecture/Code',
    skills: ['code implementation', 'architecture design', 'refactoring']
  },
  Triss: {
    persona: 'Healer',
    focus: 'QA/Testing',
    skills: ['tests', 'validation', 'bug fixes', 'quality assurance']
  },
  Jaskier: {
    persona: 'Bard',
    focus: 'Docs/Communication',
    skills: ['documentation', 'logs', 'reports', 'user communication']
  },
  Vesemir: {
    persona: 'Mentor',
    focus: 'Mentoring/Review',
    skills: ['code review', 'best practices', 'teaching', 'guidance']
  },
  Ciri: {
    persona: 'Prodigy',
    focus: 'Speed/Quick',
    skills: ['fast tasks', 'simple operations', 'quick responses']
  },
  Eskel: {
    persona: 'Pragmatist',
    focus: 'DevOps/Infrastructure',
    skills: ['CI/CD', 'deployment', 'infrastructure', 'automation']
  },
  Lambert: {
    persona: 'Skeptic',
    focus: 'Debugging/Profiling',
    skills: ['debugging', 'performance optimization', 'profiling']
  },
  Zoltan: {
    persona: 'Craftsman',
    focus: 'Data/Database',
    skills: ['data operations', 'DB migrations', 'data modeling']
  },
  Regis: {
    persona: 'Sage',
    focus: 'Research/Analysis',
    skills: ['deep analysis', 'research', 'complex reasoning']
  },
  Dijkstra: {
    persona: 'Spymaster',
    focus: 'Planning/Strategy',
    skills: ['strategic planning', 'coordination', 'resource allocation']
  },
  Philippa: {
    persona: 'Strategist',
    focus: 'Integration/API',
    skills: ['external APIs', 'integrations', 'third-party services']
  }
};

/**
 * All available agent names
 */
export const AGENT_NAMES = Object.keys(AGENT_SPECS);

/**
 * Get the Ollama model for a specific agent
 * @param {string} agent - Agent name
 * @returns {string} Model name
 */
export function getAgentModel(agent) {
  return AGENT_MODELS[agent] || 'llama3.2:3b';
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
 * Build system prompt for an agent
 * @param {string} agent - Agent name
 * @returns {string} System prompt
 */
export function buildAgentPrompt(agent) {
  const spec = getAgentSpec(agent);
  if (!spec) {
    return 'You are a helpful AI assistant.';
  }

  return `You are ${agent}, the ${spec.persona} from the School of the Wolf.
Your specialization: ${spec.focus}
Your skills: ${spec.skills.join(', ')}

Respond in character while completing the task professionally.
Be concise but thorough. Focus on your area of expertise.`;
}

/**
 * Execute a task with a specific agent
 * @param {string} agent - Agent name
 * @param {string} prompt - Task prompt
 * @param {Object} options - Options
 * @param {string} [options.context] - Additional context
 * @param {number} [options.timeout] - Timeout in ms
 * @returns {Promise<Object>} Result with success, response, duration
 */
export async function invokeAgent(agent, prompt, options = {}) {
  const { context = '', timeout = 60000 } = options;

  const model = getAgentModel(agent);
  const systemPrompt = buildAgentPrompt(agent);

  const fullPrompt = context
    ? `${systemPrompt}\n\nContext: ${context}\n\nTask: ${prompt}`
    : `${systemPrompt}\n\nTask: ${prompt}`;

  const startTime = Date.now();

  try {
    const result = await generate(fullPrompt, {
      model,
      timeout,
      temperature: 0.7
    });

    return {
      success: true,
      agent,
      model,
      response: result.content,
      duration: Date.now() - startTime,
      tokens: result.tokens
    };
  } catch (error) {
    return {
      success: false,
      agent,
      model,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Classify a prompt to determine the best agent
 * @param {string} prompt - The prompt to classify
 * @returns {Object} Classification result with agent and model
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
  } else if (/document|readme|explain|report|log|comment/.test(promptLower)) {
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

  return {
    prompt,
    agent,
    model: getAgentModel(agent)
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

  const recommendedAgent = {
    Simple: 'Ciri',
    Moderate: 'Yennefer',
    Complex: 'Regis',
    Advanced: 'Regis'
  }[level];

  return {
    score: Math.round(score * 10) / 10,
    level,
    wordCount,
    hasCode,
    hasMultipleTasks,
    technicalTerms,
    recommendedAgent
  };
}

/**
 * Check if all required models are available
 * @returns {Promise<Object>} Status with installed and missing models
 */
export async function checkRequiredModels() {
  const required = ['llama3.2:1b', 'llama3.2:3b', 'phi3:mini', 'qwen2.5-coder:1.5b'];

  const health = await healthCheck();
  if (!health.available) {
    return {
      available: false,
      installed: [],
      missing: required,
      allPresent: false
    };
  }

  const installed = health.models || [];
  const missing = required.filter(m => !installed.includes(m));

  return {
    available: true,
    installed,
    missing,
    allPresent: missing.length === 0
  };
}

// Default export
export default {
  AGENT_MODELS,
  AGENT_SPECS,
  AGENT_NAMES,
  getAgentModel,
  getAgentSpec,
  buildAgentPrompt,
  invokeAgent,
  classifyPrompt,
  classifyPrompts,
  analyzeComplexity,
  checkRequiredModels
};
