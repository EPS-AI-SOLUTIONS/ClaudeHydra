/**
 * ClaudeHydra 6-Step Protocol
 * School of the Wolf - Swarm Execution Protocol
 *
 * Steps:
 * 1. SPECULATE - Gather research context (Regis)
 * 2. PLAN - Create JSON task plan (Dijkstra)
 * 3. EXECUTE - Run agents in parallel
 * 4. SYNTHESIZE - Merge results (Yennefer)
 * 5. LOG - Create session summary (Jaskier)
 * 6. ARCHIVE - Save Markdown transcript
 *
 * @module swarm/protocol
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { ConnectionPool } from '../hydra/core/pool.js';
import { healthCheck } from '../hydra/providers/ollama-client.js';
import {
  invokeAgent,
  classifyPrompt,
  analyzeComplexity,
  AGENT_SPECS,
  AGENT_NAMES
} from './agents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

/**
 * Swarm version
 */
export const SWARM_VERSION = '3.0.0';

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
  bold: '\x1b[1m'
};

/**
 * Write status message
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
  const agentStr = agent ? ` [${agent}]` : '';

  console.log(`${colors.gray}[${timestamp}]${colors.reset}${agentStr} ${color}${prefix} ${step} - ${message}${colors.reset}`);
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
 * Main Swarm Protocol - 6 Steps
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
    console.log('');
  }

  // Check Ollama
  const health = await healthCheck();
  if (!health.available) {
    writeStatus('Init', 'Ollama not available', '', 'Error');
    return { success: false, error: 'Ollama not available' };
  }
  writeStatus('Init', 'Ollama connected', '', 'Success');

  const transcript = {
    sessionId,
    query,
    mode: modeStr,
    startTime: new Date(startTime).toISOString(),
    steps: {}
  };

  // =========================================================================
  // STEP 1: SPECULATE (Regis - Research/Analysis)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 1: SPECULATE (Regis - The Sage) ---${colors.reset}`);
  }

  let step1Result = null;
  if (!skipResearch) {
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
  } else {
    writeStatus('Speculate', 'Skipped (skipResearch flag)', '', 'Info');
  }
  transcript.steps.speculate = step1Result;

  // =========================================================================
  // STEP 2: PLAN (Dijkstra - Planning/Strategy)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 2: PLAN (Dijkstra - The Spymaster) ---${colors.reset}`);
  }

  const context = step1Result?.success ? step1Result.response : '';

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

Available agents: ${Object.entries(AGENT_SPECS).map(([name, spec]) => `${name} (${spec.focus})`).join(', ')}`;

  writeStatus('Plan', 'Creating execution plan...', 'Dijkstra', 'Progress');
  const step2Result = await invokeAgent('Dijkstra', planPrompt, { timeout: settings.timeoutSeconds * 1000 });

  let plan = null;
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
  // STEP 3: EXECUTE (Parallel via Connection Pool)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 3: EXECUTE (Parallel Agents) ---${colors.reset}`);
  }

  const executionTasks = plan.tasks.map(task => ({
    id: task.id,
    agent: task.agent,
    prompt: task.task,
    context: ''
  }));

  writeStatus('Execute', `Launching ${executionTasks.length} agents in parallel...`, '', 'Progress');

  const step3Results = await executeParallel(executionTasks, settings);

  const successCount = step3Results.filter(r => r.success).length;
  writeStatus('Execute', `${successCount}/${executionTasks.length} tasks completed`, '', 'Success');

  // Log individual results
  for (const result of step3Results) {
    const status = result.success ? 'Success' : 'Error';
    writeStatus('Task', `Completed in ${((result.duration || 0) / 1000).toFixed(2)}s`, result.agent, status);
  }

  transcript.steps.execute = step3Results;

  // =========================================================================
  // STEP 4: SYNTHESIZE (Yennefer - Merge Results)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 4: SYNTHESIZE (Yennefer - The Sorceress) ---${colors.reset}`);
  }

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
  const step4Result = await invokeAgent('Yennefer', synthesizePrompt, { timeout: settings.timeoutSeconds * 1000 });

  if (step4Result.success) {
    writeStatus('Synthesize', `Synthesis complete (${(step4Result.duration / 1000).toFixed(2)}s)`, 'Yennefer', 'Success');
  }
  transcript.steps.synthesize = step4Result;

  // =========================================================================
  // STEP 5: LOG (Jaskier - Session Summary)
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.yellow}--- STEP 5: LOG (Jaskier - The Bard) ---${colors.reset}`);
  }

  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000;

  const logPrompt = `Create a session summary for this Swarm execution:

Session ID: ${sessionId}
Query: ${query}
Duration: ${totalDuration.toFixed(2)} seconds
Agents Used: ${step3Results.map(r => r.agent).join(', ')}
Success Rate: ${successCount}/${executionTasks.length} tasks

Final Answer Preview:
${(step4Result.response || '').substring(0, 500)}...

Create a brief, poetic summary in the style of a bard chronicling an adventure.`;

  writeStatus('Log', 'Creating session summary...', 'Jaskier', 'Progress');
  const step5Result = await invokeAgent('Jaskier', logPrompt, { timeout: settings.timeoutSeconds * 1000 });

  if (step5Result.success) {
    writeStatus('Log', `Summary created (${(step5Result.duration / 1000).toFixed(2)}s)`, 'Jaskier', 'Success');
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

## Step 1: Speculate (Regis)
${step1Result?.success ? step1Result.response : '_Skipped or failed_'}

---

## Step 2: Plan (Dijkstra)
${step2Result?.success ? step2Result.response : '_Planning failed_'}

---

## Step 3: Execute (Parallel)
${step3Results.map(r => {
  const content = r.response || r.error || 'No response';
  return `### Agent: ${r.agent}\n${content}\n`;
}).join('\n')}

---

## Step 4: Synthesize (Yennefer)
${step4Result?.success ? step4Result.response : '_Synthesis failed_'}

---

## Step 5: Log (Jaskier)
${step5Result?.success ? step5Result.response : '_Logging failed_'}

---

## Performance Summary
- Total Duration: ${totalDuration.toFixed(2)}s
- Tasks Executed: ${executionTasks.length}
- Success Rate: ${successCount}/${executionTasks.length}
- Agents Used: ${step3Results.map(r => r.agent).join(', ')}

---
*Generated by GeminiHydra v${SWARM_VERSION} - School of the Wolf*
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
    archiveFile
  });

  // =========================================================================
  // THE END
  // =========================================================================
  if (verbose) {
    console.log('');
    console.log(`${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.green}  THE END - School of the Wolf - GeminiHydra v${SWARM_VERSION}${colors.reset}`);
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
