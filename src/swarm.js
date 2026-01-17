import { checkHealth, generate, listModels } from './ollama-client.js';
import { CONFIG } from './config.js';
import { writeSwarmMemory } from './memory.js';

const AGENTS = [
  {
    name: 'Geralt',
    persona: 'White Wolf',
    specialization: 'Security/Ops',
    model: 'llama3.2:3b'
  },
  {
    name: 'Yennefer',
    persona: 'Sorceress',
    specialization: 'Architecture/Code',
    model: 'qwen2.5-coder:1.5b'
  },
  {
    name: 'Triss',
    persona: 'Healer',
    specialization: 'QA/Testing',
    model: 'qwen2.5-coder:1.5b'
  },
  {
    name: 'Jaskier',
    persona: 'Bard',
    specialization: 'Docs/Comms',
    model: 'llama3.2:3b'
  },
  {
    name: 'Vesemir',
    persona: 'Mentor',
    specialization: 'Review/Best Practices',
    model: 'llama3.2:3b'
  },
  {
    name: 'Ciri',
    persona: 'Prodigy',
    specialization: 'Speed/Quick',
    model: 'llama3.2:1b'
  },
  {
    name: 'Eskel',
    persona: 'Pragmatist',
    specialization: 'DevOps/Infra',
    model: 'llama3.2:3b'
  },
  {
    name: 'Lambert',
    persona: 'Skeptic',
    specialization: 'Debug/Perf',
    model: 'qwen2.5-coder:1.5b'
  },
  {
    name: 'Zoltan',
    persona: 'Craftsman',
    specialization: 'Data/DB',
    model: 'llama3.2:3b'
  },
  {
    name: 'Regis',
    persona: 'Sage',
    specialization: 'Research/Analysis',
    model: 'phi3:mini'
  },
  {
    name: 'Dijkstra',
    persona: 'Spymaster',
    specialization: 'Planning/Strategy',
    model: 'llama3.2:3b'
  },
  {
    name: 'Philippa',
    persona: 'Strategist',
    specialization: 'Integrations/API',
    model: 'qwen2.5-coder:1.5b'
  }
];

const modelCache = { models: null, updatedAt: 0 };

const truncate = (value, limit) => {
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
};

const getCachedModels = async () => {
  const now = Date.now();
  if (
    modelCache.models &&
    now - modelCache.updatedAt < CONFIG.MODEL_CACHE_TTL_MS
  ) {
    return modelCache.models;
  }
  const health = await checkHealth();
  if (!health.available) {
    modelCache.models = [];
    modelCache.updatedAt = now;
    return modelCache.models;
  }
  modelCache.models = await listModels();
  modelCache.updatedAt = now;
  return modelCache.models;
};

const resolveModel = async (requestedModel) => {
  if (!requestedModel)
    return { model: CONFIG.DEFAULT_MODEL, fallbackUsed: false };
  const models = await getCachedModels();
  const available = models
    .map((model) => model.name ?? model.model)
    .filter(Boolean);
  if (available.includes(requestedModel)) {
    return { model: requestedModel, fallbackUsed: false };
  }
  return { model: CONFIG.DEFAULT_MODEL, fallbackUsed: true };
};

const runWithLimit = async (items, limit, handler) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(Math.min(limit, items.length))
    .fill(null)
    .map(async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        results[currentIndex] = await handler(
          items[currentIndex],
          currentIndex
        );
      }
    });
  await Promise.all(workers);
  return results;
};

export const isComplexPrompt = (prompt) => {
  if (!prompt) return false;
  const text = `${prompt}`;
  const keywordPattern =
    /(audit|architecture|refactor|migrate|design|implement|plan|strategy|spec|multi-step|swarm)/i;
  const bulletPattern = /(^\s*[-*]|\d+\.)/m;
  const lineCount = text.split('\n').length;
  return (
    text.length > 600 ||
    lineCount > 6 ||
    keywordPattern.test(text) ||
    bulletPattern.test(text)
  );
};

const buildSpeculationPrompt = (prompt) =>
  [
    'You are a fast research scout. Provide context, risks, unknowns, and key questions.',
    'Keep it short and actionable.',
    '',
    `Task: ${prompt}`
  ].join('\n');

const buildPlanPrompt = (prompt, speculation) =>
  [
    'You are the planner. Create a concise JSON plan with steps, assumptions, and dependencies.',
    'Output JSON only.',
    '',
    `Task: ${prompt}`,
    '',
    `Speculation: ${speculation}`
  ].join('\n');

const buildAgentPrompt = (agent, prompt, speculation, plan) =>
  [
    `You are ${agent.name} (${agent.persona}).`,
    `Specialization: ${agent.specialization}.`,
    'Provide your best contribution for this task, focused on your specialty.',
    '',
    `Task: ${prompt}`,
    '',
    `Speculation: ${speculation}`,
    '',
    `Plan: ${plan}`
  ].join('\n');

const buildSynthesisPrompt = (prompt, speculation, plan, agentOutputs) =>
  [
    'You are the synthesizer. Combine agent outputs into a single final answer.',
    'Be concise, concrete, and actionable.',
    '',
    `Task: ${prompt}`,
    '',
    `Speculation: ${speculation}`,
    '',
    `Plan: ${plan}`,
    '',
    'Agent Outputs:',
    agentOutputs
      .map((agent) => `- ${agent.name}: ${truncate(agent.response, 1500)}`)
      .join('\n')
  ].join('\n');

const buildLogPrompt = (prompt, finalAnswer) =>
  [
    'Summarize the task and outcome in 4-6 bullet points.',
    'Focus on decisions, actions, and verification steps.',
    '',
    `Task: ${prompt}`,
    '',
    `Final Answer: ${finalAnswer}`
  ].join('\n');

export const runSwarm = async ({
  prompt,
  title,
  agents,
  includeTranscript = false,
  saveMemory = true,
  logger
}) => {
  const selectedAgents =
    Array.isArray(agents) && agents.length
      ? AGENTS.filter((agent) => agents.includes(agent.name))
      : AGENTS;
  const unknownAgents = Array.isArray(agents)
    ? agents.filter((name) => !AGENTS.some((agent) => agent.name === name))
    : [];

  const speculationResult = await generate(
    CONFIG.FAST_MODEL,
    buildSpeculationPrompt(prompt),
    {
      temperature: 0.2,
      maxTokens: 600
    }
  );

  const planResult = await generate(
    CONFIG.DEFAULT_MODEL,
    buildPlanPrompt(prompt, speculationResult.response),
    {
      temperature: 0.2,
      maxTokens: 900
    }
  );

  const agentResults = await runWithLimit(
    selectedAgents,
    Math.max(1, CONFIG.QUEUE_MAX_CONCURRENT || 5),
    async (agent) => {
      const resolved = await resolveModel(agent.model);
      const response = await generate(
        resolved.model,
        buildAgentPrompt(
          agent,
          prompt,
          speculationResult.response,
          planResult.response
        ),
        {
          temperature: 0.3,
          maxTokens: 1400
        }
      );
      return {
        name: agent.name,
        model: resolved.model,
        fallbackUsed: resolved.fallbackUsed,
        response: response.response
      };
    }
  );

  const synthesisResult = await generate(
    CONFIG.DEFAULT_MODEL,
    buildSynthesisPrompt(
      prompt,
      speculationResult.response,
      planResult.response,
      agentResults
    ),
    { temperature: 0.25, maxTokens: 1800 }
  );

  const logResult = await generate(
    CONFIG.FAST_MODEL,
    buildLogPrompt(prompt, synthesisResult.response),
    { temperature: 0.2, maxTokens: 400 }
  );

  let memoryInfo = null;
  if (saveMemory) {
    try {
      memoryInfo = await writeSwarmMemory({
        title,
        prompt,
        steps: {
          speculation: speculationResult.response,
          plan: planResult.response
        },
        agents: agentResults,
        summary: logResult.response,
        finalAnswer: synthesisResult.response
      });
    } catch (error) {
      if (logger) {
        logger.warn('Failed to write swarm memory', { error: error.message });
      }
      memoryInfo = { error: error.message };
    }
  }

  const result = {
    mode: 'swarm',
    title: title || null,
    summary: logResult.response,
    final: synthesisResult.response,
    agents: agentResults.map((agent) => ({
      name: agent.name,
      model: agent.model,
      fallbackUsed: agent.fallbackUsed,
      preview: truncate(agent.response, 180)
    })),
    warnings: unknownAgents.length
      ? [`Unknown agents: ${unknownAgents.join(', ')}`]
      : [],
    memory: memoryInfo
  };

  if (includeTranscript) {
    result.transcript = {
      speculation: speculationResult.response,
      plan: planResult.response,
      agents: agentResults,
      synthesis: synthesisResult.response,
      log: logResult.response
    };
  }

  return result;
};
