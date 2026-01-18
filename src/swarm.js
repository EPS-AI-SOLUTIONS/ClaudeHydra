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
        try {
          results[currentIndex] = await handler(
            items[currentIndex],
            currentIndex
          );
        } catch (error) {
          results[currentIndex] = {
            error: error.message,
            failed: true
          };
        }
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
      .filter((a) => !a.failed && !a.error)
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
  try {
    const selectedAgents =
      Array.isArray(agents) && agents.length
        ? AGENTS.filter((agent) => agents.includes(agent.name))
        : AGENTS;
    const unknownAgents = Array.isArray(agents)
      ? agents.filter((name) => !AGENTS.some((agent) => agent.name === name))
      : [];

    // Step 1: Speculation
    let speculationResult;
    try {
      speculationResult = await generate(
        CONFIG.FAST_MODEL,
        buildSpeculationPrompt(prompt),
        {
          temperature: 0.2,
          maxTokens: 600
        }
      );
    } catch (e) {
      if (logger)
        logger.error('Swarm speculation failed', { error: e.message });
      speculationResult = { response: 'Speculation failed: ' + e.message };
    }

    // Step 2: Planning
    let planResult;
    try {
      planResult = await generate(
        CONFIG.DEFAULT_MODEL,
        buildPlanPrompt(prompt, speculationResult.response),
        {
          temperature: 0.2,
          maxTokens: 900
        }
      );
    } catch (e) {
      if (logger) logger.error('Swarm planning failed', { error: e.message });
      planResult = { response: 'Planning failed: ' + e.message };
    }

    // Step 3: Agents (Parallel)
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

    const successfulAgents = agentResults.filter((r) => !r.failed && !r.error);
    if (successfulAgents.length === 0) {
      throw new Error('All swarm agents failed to generate responses.');
    }

    if (logger && agentResults.length > successfulAgents.length) {
      logger.warn('Some swarm agents failed', {
        total: agentResults.length,
        successful: successfulAgents.length
      });
    }

    // Step 4: Synthesis
    let synthesisResult;
    try {
      synthesisResult = await generate(
        CONFIG.DEFAULT_MODEL,
        buildSynthesisPrompt(
          prompt,
          speculationResult.response,
          planResult.response,
          successfulAgents
        ),
        { temperature: 0.25, maxTokens: 1800 }
      );
    } catch (e) {
      if (logger) logger.error('Swarm synthesis failed', { error: e.message });
      // Fallback: just concatenate agent outputs
      synthesisResult = {
        response:
          'Synthesis failed. Raw outputs:\n\n' +
          successfulAgents
            .map((a) => `### ${a.name}\n${a.response}`)
            .join('\n\n')
      };
    }

    // Step 5: Logging (Summary)
    let logResult = { response: 'Log generation skipped due to errors.' };
    try {
      logResult = await generate(
        CONFIG.FAST_MODEL,
        buildLogPrompt(prompt, synthesisResult.response),
        { temperature: 0.2, maxTokens: 400 }
      );
    } catch (e) {
      if (logger)
        logger.warn('Swarm log generation failed', { error: e.message });
    }

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
          agents: agentResults, // Save full results including errors
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
        name: agent?.name || 'Unknown',
        model: agent?.model || 'Unknown',
        fallbackUsed: agent?.fallbackUsed || false,
        preview: agent?.response
          ? truncate(agent.response, 180)
          : agent.error || 'Failed'
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
  } catch (fatalError) {
    if (logger) {
      logger.error('Swarm execution fatal error', {
        error: fatalError.message
      });
    }
    return {
      mode: 'swarm',
      error: fatalError.message,
      isError: true
    };
  }
};
