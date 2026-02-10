/**
 * Plan Mode Phases
 *
 * Defines the phases for Plan Mode execution with Witcher agent mapping.
 *
 * @module src/planning/phases
 */

// ============================================================================
// Phase Definitions
// ============================================================================

/**
 * Phase names enum
 * @enum {string}
 */
export const PhaseName = {
  SPECULATE: 'speculate',
  PLAN: 'plan',
  EXECUTE: 'execute',
  SYNTHESIZE: 'synthesize',
  LOG: 'log',
  ARCHIVE: 'archive',
};

/**
 * Phase status enum
 * @enum {string}
 */
export const PhaseStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/**
 * Phase configuration
 * @typedef {Object} PhaseConfig
 * @property {string} name - Phase name
 * @property {string} description - Phase description
 * @property {string} agent - Witcher agent responsible
 * @property {number} timeout - Phase timeout in ms
 * @property {boolean} required - Whether phase is required
 * @property {boolean} parallel - Can run in parallel
 * @property {string[]} dependencies - Required phases to complete first
 */

/**
 * Phase configurations mapped to Witcher agents
 * @type {Object<string, PhaseConfig>}
 */
export const PHASE_CONFIGS = {
  [PhaseName.SPECULATE]: {
    name: PhaseName.SPECULATE,
    description: 'Research and analyze the task context',
    agent: 'Regis',
    timeout: 30000,
    required: true,
    parallel: false,
    dependencies: [],
    systemPrompt: `You are Regis, the Philosopher and Research Analyst.
Your task is to deeply analyze the request and gather context.

Analyze:
1. What is being requested?
2. What existing code/patterns are relevant?
3. What are the potential approaches?
4. What are the risks and considerations?
5. What information is missing?

Output a structured analysis with:
- concepts: Key concepts involved
- approaches: Possible implementation approaches
- complexity: Simple/Medium/Complex
- unknowns: Information gaps that need clarification`,
  },

  [PhaseName.PLAN]: {
    name: PhaseName.PLAN,
    description: 'Create detailed execution plan with task decomposition',
    agent: 'Dijkstra',
    timeout: 45000,
    required: true,
    parallel: false,
    dependencies: [PhaseName.SPECULATE],
    systemPrompt: `You are Dijkstra, the Spymaster and Strategic Planner.
Based on the research analysis, create a detailed execution plan.

Create a plan with:
1. Tasks: Specific, actionable items
2. Dependencies: Which tasks depend on others
3. Agents: Which Witcher agent is best for each task
4. Priority: Order of execution
5. Verification: How to verify each task is complete

Output a structured plan with tasks in JSON format:
{
  "tasks": [
    {
      "id": "task-1",
      "description": "Task description",
      "agent": "AgentName",
      "priority": 1,
      "dependencies": [],
      "verification": "How to verify completion"
    }
  ],
  "executionOrder": ["task-1", "task-2"],
  "parallelGroups": [["task-1"], ["task-2", "task-3"]]
}`,
  },

  [PhaseName.EXECUTE]: {
    name: PhaseName.EXECUTE,
    description: 'Execute planned tasks using appropriate agents',
    agent: null, // Dynamic - depends on task
    timeout: 120000,
    required: true,
    parallel: true,
    dependencies: [PhaseName.PLAN],
    systemPrompt: null, // Uses task-specific prompts
  },

  [PhaseName.SYNTHESIZE]: {
    name: PhaseName.SYNTHESIZE,
    description: 'Combine and synthesize results from execution',
    agent: 'Yennefer',
    timeout: 30000,
    required: true,
    parallel: false,
    dependencies: [PhaseName.EXECUTE],
    systemPrompt: `You are Yennefer, the Sorceress and System Architect.
Synthesize the execution results into a cohesive response.

Your task:
1. Review all task outputs
2. Identify successes and failures
3. Combine related outputs
4. Create a unified summary
5. Highlight any issues that need attention

Output a structured synthesis with:
- summary: Overall result summary
- outputs: Combined task outputs
- issues: Any problems encountered
- recommendations: Next steps if applicable`,
  },

  [PhaseName.LOG]: {
    name: PhaseName.LOG,
    description: 'Document the execution for future reference',
    agent: 'Jaskier',
    timeout: 15000,
    required: false,
    parallel: false,
    dependencies: [PhaseName.SYNTHESIZE],
    systemPrompt: `You are Jaskier, the Bard and Documentalist.
Create a concise log of this execution.

Document:
1. What was requested
2. What approach was taken
3. What was accomplished
4. Any lessons learned

Keep it brief but informative for future reference.`,
  },

  [PhaseName.ARCHIVE]: {
    name: PhaseName.ARCHIVE,
    description: 'Archive the plan for future reference',
    agent: null, // System operation
    timeout: 5000,
    required: false,
    parallel: false,
    dependencies: [PhaseName.LOG],
    systemPrompt: null,
  },
};

// ============================================================================
// Agent Mapping
// ============================================================================

/**
 * Task type to agent mapping
 * Used during EXECUTE phase for dynamic agent selection
 *
 * @type {Object<string, string>}
 */
export const TASK_AGENT_MAPPING = {
  // Code tasks
  code: 'Yennefer',
  implementation: 'Yennefer',
  refactor: 'Lambert',
  architecture: 'Yennefer',

  // Testing tasks
  test: 'Triss',
  qa: 'Triss',
  validation: 'Triss',

  // Security tasks
  security: 'Geralt',
  audit: 'Geralt',
  review: 'Vesemir',

  // DevOps tasks
  deploy: 'Eskel',
  ci_cd: 'Eskel',
  infrastructure: 'Eskel',
  shell: 'Eskel',

  // Data tasks
  data: 'Zoltan',
  database: 'Zoltan',
  migration: 'Zoltan',

  // Documentation tasks
  documentation: 'Jaskier',
  readme: 'Jaskier',
  changelog: 'Jaskier',

  // Research tasks
  research: 'Regis',
  analysis: 'Regis',

  // Performance tasks
  performance: 'Ciri',
  optimization: 'Ciri',

  // API tasks
  api: 'Philippa',
  integration: 'Philippa',

  // Planning tasks
  planning: 'Dijkstra',
  strategy: 'Dijkstra',

  // Default
  default: 'Yennefer',
};

/**
 * Get agent for a task type
 *
 * @param {string} taskType - Task type
 * @returns {string} Agent name
 */
export function getAgentForTaskType(taskType) {
  const normalizedType = taskType?.toLowerCase() || 'default';
  return TASK_AGENT_MAPPING[normalizedType] || TASK_AGENT_MAPPING.default;
}

/**
 * Get agent for a task based on keywords in description
 *
 * @param {string} description - Task description
 * @returns {string} Agent name
 */
export function inferAgentFromDescription(description) {
  const lower = description.toLowerCase();

  for (const [type, agent] of Object.entries(TASK_AGENT_MAPPING)) {
    if (type !== 'default' && lower.includes(type)) {
      return agent;
    }
  }

  // Additional keyword matching
  if (lower.includes('write') || lower.includes('implement') || lower.includes('create')) {
    return 'Yennefer';
  }
  if (lower.includes('fix') || lower.includes('debug') || lower.includes('error')) {
    return 'Lambert';
  }
  if (lower.includes('explain') || lower.includes('understand') || lower.includes('why')) {
    return 'Regis';
  }

  return TASK_AGENT_MAPPING.default;
}

// ============================================================================
// Phase Utilities
// ============================================================================

/**
 * Get ordered list of phases
 *
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeOptional=true] - Include optional phases
 * @returns {PhaseConfig[]}
 */
export function getOrderedPhases(options = { includeOptional: true }) {
  const order = [
    PhaseName.SPECULATE,
    PhaseName.PLAN,
    PhaseName.EXECUTE,
    PhaseName.SYNTHESIZE,
    PhaseName.LOG,
    PhaseName.ARCHIVE,
  ];

  return order
    .map((name) => PHASE_CONFIGS[name])
    .filter((phase) => options.includeOptional || phase.required);
}

/**
 * Check if phase can start based on dependencies
 *
 * @param {string} phaseName - Phase to check
 * @param {Object<string, PhaseStatus>} phaseStatuses - Current phase statuses
 * @returns {boolean}
 */
export function canPhaseStart(phaseName, phaseStatuses) {
  const config = PHASE_CONFIGS[phaseName];

  if (!config) {
    return false;
  }

  // Check all dependencies are completed
  for (const dep of config.dependencies) {
    if (phaseStatuses[dep] !== PhaseStatus.COMPLETED) {
      return false;
    }
  }

  return true;
}

/**
 * Get phase configuration
 *
 * @param {string} phaseName - Phase name
 * @returns {PhaseConfig | null}
 */
export function getPhaseConfig(phaseName) {
  return PHASE_CONFIGS[phaseName] || null;
}

/**
 * Create initial phase status map
 *
 * @returns {Object<string, PhaseStatus>}
 */
export function createInitialPhaseStatuses() {
  const statuses = {};

  for (const phaseName of Object.values(PhaseName)) {
    statuses[phaseName] = PhaseStatus.PENDING;
  }

  return statuses;
}

export default {
  PhaseName,
  PhaseStatus,
  PHASE_CONFIGS,
  TASK_AGENT_MAPPING,
  getAgentForTaskType,
  inferAgentFromDescription,
  getOrderedPhases,
  canPhaseStart,
  getPhaseConfig,
  createInitialPhaseStatuses,
};
