/**
 * ClaudeHydra 6-Step Protocol
 * School of the Wolf - Swarm Execution Protocol
 *
 * 3-Tier Model Hierarchy:
 * - COMMANDER (Claude Opus): Dijkstra - Planning/Strategy
 * - COORDINATOR (Claude Sonnet): Regis, Yennefer, Jaskier
 * - EXECUTOR (llama-cpp): Geralt, Triss, Vesemir, Ciri, Eskel, Lambert, Zoltan, Philippa
 *
 * Steps:
 * 1. SPECULATE - Gather research context (Regis → Claude Sonnet)
 * 2. PLAN - Create JSON task plan (Dijkstra → Claude Opus)
 * 3. EXECUTE - Run agents in parallel (Executors → llama-cpp via MCP)
 * 4. SYNTHESIZE - Merge results (Yennefer → Claude Sonnet)
 * 5. LOG - Create session summary (Jaskier → Claude Sonnet)
 * 6. ARCHIVE - Save Markdown transcript
 *
 * @module swarm/protocol
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { ConnectionPool } from '../hydra/core/pool.js';
import { getLlamaCppBridge } from '../hydra/providers/llamacpp-bridge.js';
import { healthCheck as claudeHealthCheck } from '../hydra/providers/claude-client.js';
import {
  invokeAgent,
  classifyPrompt,
  analyzeComplexity,
  checkProviders,
  AGENT_SPECS,
  AGENT_NAMES,
  MODEL_TIERS,
  AGENT_TIERS,
  getAgentTier
} from './agents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

/**
 * Swarm version
 */
export const SWARM_VERSION = '3.1.0';

/**
 * Memory path for sessions
 */
const MEMORY_PATH = join(ROOT_DIR, '.serena', 'memories');

/**
 * Standard mode settings
 */
export const STANDARD_MODE = {
  maxConcurrency: 5,
  safetyBlocking: true,
  retryAttempts: 3,
  timeoutSeconds: 60
};

/**
 * YOLO mode settings (fast & dangerous)
 */
export const YOLO_MODE = {
  maxConcurrency: 10,
  safetyBlocking: false,
  retryAttempts: 1,
  timeoutSeconds: 15
};

/**
 * ANSI color helpers
 */
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  blue: '\x1b[34m'
};

/**
 * Tier colors for display
 */
const TIER_COLORS = {
  commander: colors.magenta,
  coordinator: colors.blue,
  executor: colors.green
};

/**
 * Write status message with tier info
 * @param {string} step - Step name
 * @param {string} message - Message
 * @param {string} agent - Agent name
 * @param {string} type - Type (Info, Success, Warning, Error, Progress)
 */
function writeStatus(step, message, agent = '', type = 'Info') {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const typeColors = {
    Info: colors.cyan,
    Success: colors.green,
    Warning: colors.yellow,
    Error: colors.red,
    Progress: colors.magenta
  };
  const prefixes = {
    Info: '[i]',
    Success: '[+]',
    Warning: '[!]',
    Error: '[X]',
    Progress: '[>]'
  };

  const color = typeColors[type] || colors.cyan;
  const prefix = prefixes[type] || '[i]';

  let agentStr = '';
  if (agent) {
    const tier = getAgentTier(agent);
    const tierColor = TIER_COLORS[tier] || colors.cyan;
    const tierLabel = tier.toUpperCase().substring(0, 4);
    agentStr = ` [${tierColor}${tierLabel}${colors.reset}:${agent}]`;
  }

  console.log(`${colors.gray}[${timestamp}]${colors.reset}${agentStr} ${color}${prefix} ${step} - ${message}${colors.reset}`);
}

/**
 * Display tier hierarchy banner
 */
function displayTierBanner() {
  console.log('');
  console.log(`${colors.bold}  MODEL HIERARCHY:${colors.reset}`);
  console.log(`  ${TIER_COLORS.commander}● COMMANDER${colors.reset} (Claude Opus)    → Dijkstra`);
  console.log(`  ${TIER_COLORS.coordinator}● COORDINATOR${colors.reset} (Claude Sonnet) → Regis, Yennefer, Jaskier`);
  console.log(`  ${TIER_COLORS.executor}● EXECUTOR${colors.reset} (llama.cpp)       → Geralt, Triss, Vesemir, Ciri, Eskel, Lambert, Zoltan, Philippa`);
  console.log('');
}

/**
 * Execute tasks in parallel using connection pool
 * @param {Object[]} tasks - Array of tasks
 * @param {Object} settings - Execution settings
 * @returns {Promise<Object[]>} Results
 */
async function executeParallel(tasks, settings) {
  const pool = new ConnectionPool({
    maxConcurrent: settings.maxConcurrency,
    maxQueueSize: 100,
    acquireTimeout: settings.timeoutSeconds * 1000
  });

  const promises = tasks.map(task =>
    pool.execute(async () => {
      const result = await invokeAgent(task.agent, task.prompt, {
        context: task.context || '',
        timeout: settings.timeoutSeconds * 1000
      });
      return { ...result, taskId: task.id };
    })
  );

  const results = await Promise.allSettled(promises);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    return {
      success: false,
      taskId: tasks[i].id,
      agent: tasks[i].agent,
      tier: getAgentTier(tasks[i].agent),
      error: r.reason?.message || 'Unknown error'
    };
  });
}

/**
 * Save agent memory
 * @param {string} agent - Agent name
 * @param {Object} memory - Memory data
 */
function saveAgentMemory(agent, memory) {
  const memoryFile = join(MEMORY_PATH, `${agent}.json`);

  // Ensure directory exists
  if (!existsSync(dirname(memoryFile))) {
    mkdirSync(dirname(memoryFile), { recursive: true });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    agent,
    tier: getAgentTier(agent),
    data: memory
  };

  let existing = [];
  if (existsSync(memoryFile)) {
    try {
      const content = readFileSync(memoryFile, 'utf-8');
      existing = JSON.parse(content);
      if (!Array.isArray(existing)) existing = [existing];
    } catch {
      existing = [];
    }
  }

  existing.push(entry);

  // Keep only last 100 entries
  if (existing.length > 100) {
    existing = existing.slice(-100);
  }

  writeFileSync(memoryFile, JSON.stringify(existing, null, 2), 'utf-8');
}

/**
 * Main Swarm Protocol - 6 Steps with 3-Tier Model Hierarchy
 *
 * @param {string} query - The query to process
 * @param {Object} options - Options
 * @param {boolean} [options.yoloMode=false] - Enable YOLO mode
 * @param {boolean} [options.skipResearch=false] - Skip Step 1
 * @param {boolean} [options.verbose=true] - Verbose output
 * @returns {Promise<Object>} Swarm result
 */
export async function invokeSwarm(query, options = {}) {
  const { yoloMode = false, skipResearch = false, verbose = true } = options;

  const startTime = Date.now();
  const sessionId = randomUUID().substring(0, 8);
  const settings = yoloMode ? YOLO_MODE : STANDARD_MODE;
  const modeStr = yoloMode ? 'YOLO (Fast & Dangerous)' : 'Standard';

  // Banner
  if (verbose) {
    console.log('');
    console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.cyan}  AGENT SWARM v${SWARM_VERSION} - School of the Wolf${colors.reset}`);
    console.log(`${colors.cyan}  Session: ${sessionId} | Mode: ${modeStr}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    displayTierBanner();
  }

  // Check providers
  const providerStatus = await checkProviders();

  if (!providerStatus.partialReady) {
    writeStatus('Init', 'No providers available', '', 'Error');
    return { success: false, error: 'No providers available' };
  }

  if (providerStatus.allReady) {
    writeStatus('Init', 'All tiers ready (Claude + LlamaCpp)', '', 'Success');
  } else {
    if (providerStatus.tiers.commander) {
      writeStatus('Init', 'Commander tier ready (Claude Opus)', '', 'Success');
    } else {
      writeStatus('Init', 'Commander tier unavailable', '', 'Warning');
    }
    if (providerStatus.tiers.executor) {
      writeStatus('Init', 'Executor tier ready (LlamaCpp)', '', 'Success');
    } else {
      writeStatus('Init', 'Executor tier unavailable', '', 'Warning');
    }
  }

  const transcript = {
    sessionId,
    query,
    mode: modeStr,
    startTime: new Date(startTime).toISOString(),
    providerStatus,
    steps: {}
  };

  // =========================================================================
  // STEP 1: SPECULATE (Regis → Claude Sonnet - Research/Analysis)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 1: SPECULATE (Regis - The Sage) [${TIER_COLORS.coordinator}COORDINATOR${colors.reset}${colors.yellow}] ---${colors.reset}`);
  }

  let step1Result = null;
  if (!skipResearch && providerStatus.tiers.coordinator) {
    const researchPrompt = `Analyze this query and provide research context:
Query: ${query}

Provide:
1. Key concepts to understand
2. Potential approaches
3. Required knowledge domains
4. Complexity assessment (Simple/Moderate/Complex/Advanced)
5. Recommended agents from: ${AGENT_NAMES.join(', ')}`;

    writeStatus('Speculate', 'Gathering research context...', 'Regis', 'Progress');
    step1Result = await invokeAgent('Regis', researchPrompt, { timeout: settings.timeoutSeconds * 1000 });

    if (step1Result.success) {
      writeStatus('Speculate', `Research complete (${(step1Result.duration / 1000).toFixed(2)}s)`, 'Regis', 'Success');
    } else {
      writeStatus('Speculate', `Research failed: ${step1Result.error}`, 'Regis', 'Warning');
    }
  } else if (!providerStatus.tiers.coordinator) {
    writeStatus('Speculate', 'Skipped (Claude Sonnet unavailable)', '', 'Warning');
  } else {
    writeStatus('Speculate', 'Skipped (skipResearch flag)', '', 'Info');
  }
  transcript.steps.speculate = step1Result;

  // =========================================================================
  // STEP 2: PLAN (Dijkstra → Claude Opus - Planning/Strategy)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 2: PLAN (Dijkstra - The Spymaster) [${TIER_COLORS.commander}COMMANDER${colors.reset}${colors.yellow}] ---${colors.reset}`);
  }

  const context = step1Result?.success ? step1Result.response : '';

  let step2Result = null;
  let plan = null;

  if (providerStatus.tiers.commander) {
    const planPrompt = `Create a task execution plan for this query:
Query: ${query}

${context ? `Research Context: ${context}` : ''}

Create a JSON plan with this structure:
{
  "complexity": "Simple|Moderate|Complex|Advanced",
  "tasks": [
    {
      "id": 1,
      "agent": "AgentName",
      "task": "Task description",
      "depends_on": [],
      "priority": "high|medium|low"
    }
  ],
  "parallel_groups": [[1,2], [3]],
  "estimated_time": "Xs"
}

Available agents by tier:
- COMMANDER (Opus): Dijkstra (Planning/Strategy)
- COORDINATORS (Sonnet): Regis (Research), Yennefer (Synthesis), Jaskier (Communication)
- EXECUTORS (llama.cpp): Geralt (Security), Triss (Testing), Vesemir (Review), Ciri (Quick), Eskel (DevOps), Lambert (Debug), Zoltan (Data), Philippa (API)

Assign EXECUTORS for actual task work. Use COORDINATORS for synthesis and communication.`;

    writeStatus('Plan', 'Creating execution plan...', 'Dijkstra', 'Progress');
    step2Result = await invokeAgent('Dijkstra', planPrompt, { timeout: settings.timeoutSeconds * 1000 });

    if (step2Result.success) {
      writeStatus('Plan', `Plan created (${(step2Result.duration / 1000).toFixed(2)}s)`, 'Dijkstra', 'Success');

      // Try to parse JSON plan
      try {
        const jsonMatch = step2Result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          plan = JSON.parse(jsonMatch[0]);
        }
      } catch {
        writeStatus('Plan', 'Could not parse plan JSON, using fallback', '', 'Warning');
      }
    }
  } else {
    writeStatus('Plan', 'Claude Opus unavailable, using fallback planning', '', 'Warning');
  }

  transcript.steps.plan = { result: step2Result, parsedPlan: plan };

  // Fallback plan
  if (!plan) {
    const classification = classifyPrompt(query);
    plan = {
      complexity: 'Moderate',
      tasks: [
        { id: 1, agent: classification.agent, task: query, depends_on: [], priority: 'high' }
      ],
      parallel_groups: [[1]]
    };
  }

  // =========================================================================
  // STEP 3: EXECUTE (Executors → llama.cpp - Parallel via Connection Pool)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 3: EXECUTE (Parallel Agents) [${TIER_COLORS.executor}EXECUTORS${colors.reset}${colors.yellow}] ---${colors.reset}`);
  }

  const executionTasks = plan.tasks.map(task => ({
    id: task.id,
    agent: task.agent,
    prompt: task.task,
    context: ''
  }));

  // Group tasks by tier for display
  const tasksByTier = executionTasks.reduce((acc, task) => {
    const tier = getAgentTier(task.agent);
    if (!acc[tier]) acc[tier] = [];
    acc[tier].push(task.agent);
    return acc;
  }, {});

  for (const [tier, agents] of Object.entries(tasksByTier)) {
    const tierColor = TIER_COLORS[tier] || colors.cyan;
    writeStatus('Execute', `${tier.toUpperCase()}: ${agents.join(', ')}`, '', 'Info');
  }

  writeStatus('Execute', `Launching ${executionTasks.length} agents in parallel...`, '', 'Progress');

  const step3Results = await executeParallel(executionTasks, settings);

  const successCount = step3Results.filter(r => r.success).length;
  writeStatus('Execute', `${successCount}/${executionTasks.length} tasks completed`, '', 'Success');

  // Log individual results with tier info
  for (const result of step3Results) {
    const status = result.success ? 'Success' : 'Error';
    const tierInfo = result.tier ? ` [${result.tier}]` : '';
    writeStatus('Task', `Completed in ${((result.duration || 0) / 1000).toFixed(2)}s${tierInfo}`, result.agent, status);
  }

  transcript.steps.execute = step3Results;

  // =========================================================================
  // STEP 4: SYNTHESIZE (Yennefer → Claude Sonnet - Merge Results)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 4: SYNTHESIZE (Yennefer - The Sorceress) [${TIER_COLORS.coordinator}COORDINATOR${colors.reset}${colors.yellow}] ---${colors.reset}`);
  }

  let step4Result = null;

  if (providerStatus.tiers.coordinator) {
    const resultsText = step3Results.map(r =>
      r.success
        ? `[${r.agent}] ${r.response}`
        : `[${r.agent}] ERROR: ${r.error}`
    ).join('\n\n---\n\n');

    const synthesizePrompt = `Synthesize these agent results into a cohesive final answer:

Original Query: ${query}

Agent Results:
${resultsText}

Create a unified, well-structured response that:
1. Addresses the original query completely
2. Integrates insights from all agents
3. Highlights key findings
4. Provides actionable conclusions`;

    writeStatus('Synthesize', 'Merging results...', 'Yennefer', 'Progress');
    step4Result = await invokeAgent('Yennefer', synthesizePrompt, { timeout: settings.timeoutSeconds * 1000 });

    if (step4Result.success) {
      writeStatus('Synthesize', `Synthesis complete (${(step4Result.duration / 1000).toFixed(2)}s)`, 'Yennefer', 'Success');
    }
  } else {
    writeStatus('Synthesize', 'Claude Sonnet unavailable, using direct results', '', 'Warning');
    // Fallback: use first successful result
    const firstSuccess = step3Results.find(r => r.success);
    if (firstSuccess) {
      step4Result = { success: true, response: firstSuccess.response, agent: 'Fallback' };
    }
  }

  transcript.steps.synthesize = step4Result;

  // =========================================================================
  // STEP 5: LOG (Jaskier → Claude Sonnet - Session Summary)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 5: LOG (Jaskier - The Bard) [${TIER_COLORS.coordinator}COORDINATOR${colors.reset}${colors.yellow}] ---${colors.reset}`);
  }

  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000;

  let step5Result = null;

  if (providerStatus.tiers.coordinator) {
    const logPrompt = `Create a session summary for this Swarm execution:

Session ID: ${sessionId}
Query: ${query}
Duration: ${totalDuration.toFixed(2)} seconds
Model Hierarchy Used:
- Commander (Claude Opus): ${step2Result ? 'Dijkstra' : 'N/A'}
- Coordinators (Claude Sonnet): Regis, Yennefer, Jaskier
- Executors (llama.cpp): ${step3Results.map(r => r.agent).join(', ')}
Success Rate: ${successCount}/${executionTasks.length} tasks

Final Answer Preview:
${(step4Result?.response || '').substring(0, 500)}...

Create a brief, poetic summary in the style of a bard chronicling an adventure.`;

    writeStatus('Log', 'Creating session summary...', 'Jaskier', 'Progress');
    step5Result = await invokeAgent('Jaskier', logPrompt, { timeout: settings.timeoutSeconds * 1000 });

    if (step5Result.success) {
      writeStatus('Log', `Summary created (${(step5Result.duration / 1000).toFixed(2)}s)`, 'Jaskier', 'Success');
    }
  } else {
    writeStatus('Log', 'Claude Sonnet unavailable, skipping summary', '', 'Warning');
  }

  transcript.steps.log = step5Result;

  // =========================================================================
  // STEP 6: ARCHIVE (Save Markdown Transcript)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 6: ARCHIVE (Save Transcript) ---${colors.reset}`);
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const markdownContent = `# ClaudeHydra Session: ${sessionId}

**Date:** ${new Date().toISOString()}
**Mode:** ${modeStr}
**Duration:** ${totalDuration.toFixed(2)} seconds
**Query:** ${query}

---

## Model Hierarchy

| Tier | Model | Agents |
|------|-------|--------|
| COMMANDER | Claude Opus | Dijkstra |
| COORDINATOR | Claude Sonnet | Regis, Yennefer, Jaskier |
| EXECUTOR | llama.cpp | Geralt, Triss, Vesemir, Ciri, Eskel, Lambert, Zoltan, Philippa |

---

## Step 1: Speculate (Regis) [COORDINATOR]
${step1Result?.success ? step1Result.response : '_Skipped or failed_'}

---

## Step 2: Plan (Dijkstra) [COMMANDER]
${step2Result?.success ? step2Result.response : '_Planning failed or unavailable_'}

---

## Step 3: Execute (Parallel) [EXECUTORS]
${step3Results.map(r => {
  const content = r.response || r.error || 'No response';
  const tierLabel = r.tier ? ` [${r.tier.toUpperCase()}]` : '';
  return `### Agent: ${r.agent}${tierLabel}\n${content}\n`;
}).join('\n')}

---

## Step 4: Synthesize (Yennefer) [COORDINATOR]
${step4Result?.success ? step4Result.response : '_Synthesis failed or unavailable_'}

---

## Step 5: Log (Jaskier) [COORDINATOR]
${step5Result?.success ? step5Result.response : '_Logging failed or unavailable_'}

---

## Performance Summary
- Total Duration: ${totalDuration.toFixed(2)}s
- Tasks Executed: ${executionTasks.length}
- Success Rate: ${successCount}/${executionTasks.length}
- Commander (Claude Opus): ${providerStatus.tiers.commander ? 'Available' : 'Unavailable'}
- Coordinator (Claude Sonnet): ${providerStatus.tiers.coordinator ? 'Available' : 'Unavailable'}
- Executor (LlamaCpp): ${providerStatus.tiers.executor ? 'Available' : 'Unavailable'}

---
*Generated by ClaudeHydra v${SWARM_VERSION} - School of the Wolf*
`;

  const archivePath = join(MEMORY_PATH, 'sessions');
  if (!existsSync(archivePath)) {
    mkdirSync(archivePath, { recursive: true });
  }

  const archiveFile = join(archivePath, `session_${sessionId}_${dateStr}.md`);
  writeFileSync(archiveFile, markdownContent, 'utf-8');

  writeStatus('Archive', `Transcript saved to ${archiveFile}`, '', 'Success');

  // Save to Swarm memory
  saveAgentMemory('Swarm', {
    sessionId,
    query,
    duration: totalDuration,
    taskCount: executionTasks.length,
    successRate: `${successCount}/${executionTasks.length}`,
    tiers: providerStatus.tiers,
    archiveFile
  });

  // =========================================================================
  // THE END
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.green}  THE END - School of the Wolf - ClaudeHydra v${SWARM_VERSION}${colors.reset}`);
    console.log(`${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log('');
    console.log(`${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.green}  FINAL ANSWER${colors.reset}`);
    console.log(`${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log('');
    console.log(step4Result?.response || 'No response generated');
    console.log('');
  }

  return {
    success: true,
    sessionId,
    query,
    finalAnswer: step4Result?.response || '',
    summary: step5Result?.response || '',
    duration: totalDuration,
    archiveFile,
    tiers: providerStatus.tiers,
    transcript
  };
}

/**
 * Quick swarm execution (skip research)
 * @param {string} query - The query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
export async function quickSwarm(query, options = {}) {
  return invokeSwarm(query, { ...options, skipResearch: true });
}

/**
 * YOLO swarm execution (fast mode)
 * @param {string} query - The query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
export async function yoloSwarm(query, options = {}) {
  return invokeSwarm(query, { ...options, yoloMode: true });
}

// Default export
export default {
  SWARM_VERSION,
  invokeSwarm,
  quickSwarm,
  yoloSwarm,
  STANDARD_MODE,
  YOLO_MODE
};
