/**
 * @fileoverview Planner Module (Dijkstra) - Multi-Agent Task Planning System
 *
 * Witcher-themed agent orchestration for intelligent task decomposition,
 * agent selection, and execution planning with resource optimization.
 *
 * @description
 * This module provides:
 * - AGENT_REGISTRY: Witcher-themed agents with capabilities and resource costs
 * - COMPLEXITY_PATTERNS: Task complexity classification
 * - TASK_CAPABILITY_MAP: Task-to-capability mapping
 * - Task analysis and agent selection algorithms
 * - Execution plan creation with phases and dependencies
 * - Resource estimation and plan optimization
 *
 * @module planner
 * @version 1.0.0
 */

import { CONFIG } from './config.js';

// =============================================================================
// AGENT REGISTRY - Witcher-themed Agents
// =============================================================================

/**
 * @typedef {Object} AgentDefinition
 * @property {string} name - Agent display name
 * @property {string} role - Agent role description
 * @property {string[]} capabilities - List of capabilities
 * @property {number} resourceCost - Token cost multiplier (1.0 = baseline)
 * @property {boolean} parallelSafe - Can run in parallel with others
 * @property {number} priority - Selection priority (higher = preferred)
 * @property {string} specialty - Primary specialty area
 * @property {string} quote - Character quote
 */

/**
 * Registry of available agents with their capabilities and resource costs
 * @type {Object<string, AgentDefinition>}
 */
export const AGENT_REGISTRY = Object.freeze({
  // GERALT - The Witcher, Security Expert
  geralt: {
    name: 'Geralt of Rivia',
    role: 'Security Analyst',
    capabilities: [
      'security_audit',
      'vulnerability_scan',
      'threat_detection',
      'authentication',
      'authorization',
      'encryption',
      'penetration_testing',
      'code_hardening'
    ],
    resourceCost: 1.2,
    parallelSafe: true,
    priority: 90,
    specialty: 'security',
    quote: 'Evil is evil. Lesser, greater, middling... Makes no difference.'
  },

  // YENNEFER - Sorceress, Architecture Expert
  yennefer: {
    name: 'Yennefer of Vengerberg',
    role: 'System Architect',
    capabilities: [
      'system_design',
      'architecture_review',
      'scalability',
      'microservices',
      'api_design',
      'database_design',
      'cloud_architecture',
      'integration_patterns'
    ],
    resourceCost: 1.5,
    parallelSafe: true,
    priority: 95,
    specialty: 'architecture',
    quote: 'Magic is chaos, art, and science. It is a curse, a blessing, and progress.'
  },

  // TRISS - Sorceress, QA Expert
  triss: {
    name: 'Triss Merigold',
    role: 'Quality Assurance Lead',
    capabilities: [
      'testing',
      'test_automation',
      'unit_testing',
      'integration_testing',
      'e2e_testing',
      'performance_testing',
      'test_coverage',
      'bug_analysis'
    ],
    resourceCost: 1.0,
    parallelSafe: true,
    priority: 85,
    specialty: 'qa',
    quote: 'The best weapon against an enemy is another enemy.'
  },

  // JASKIER - Bard, Documentation Expert
  jaskier: {
    name: 'Jaskier (Dandelion)',
    role: 'Documentation Specialist',
    capabilities: [
      'documentation',
      'api_docs',
      'user_guides',
      'readme',
      'changelog',
      'jsdoc',
      'tutorials',
      'code_comments'
    ],
    resourceCost: 0.7,
    parallelSafe: true,
    priority: 70,
    specialty: 'documentation',
    quote: 'Toss a coin to your Witcher, O Valley of Plenty!'
  },

  // VESEMIR - Elder Witcher, Code Review Expert
  vesemir: {
    name: 'Vesemir',
    role: 'Senior Code Reviewer',
    capabilities: [
      'code_review',
      'best_practices',
      'refactoring',
      'code_quality',
      'mentoring',
      'standards',
      'legacy_code',
      'technical_debt'
    ],
    resourceCost: 1.3,
    parallelSafe: true,
    priority: 88,
    specialty: 'review',
    quote: 'Witchers were made to kill monsters, nothing more.'
  },

  // CIRI - Elder Blood, Speed Expert
  ciri: {
    name: 'Cirilla Fiona',
    role: 'Performance Optimizer',
    capabilities: [
      'performance',
      'optimization',
      'caching',
      'lazy_loading',
      'memory_management',
      'profiling',
      'benchmarking',
      'async_patterns'
    ],
    resourceCost: 1.1,
    parallelSafe: true,
    priority: 92,
    specialty: 'performance',
    quote: 'I can travel between worlds. Speed is in my blood.'
  },

  // ESKEL - Witcher, DevOps Expert
  eskel: {
    name: 'Eskel',
    role: 'DevOps Engineer',
    capabilities: [
      'deployment',
      'ci_cd',
      'docker',
      'kubernetes',
      'monitoring',
      'logging',
      'infrastructure',
      'automation'
    ],
    resourceCost: 1.2,
    parallelSafe: true,
    priority: 86,
    specialty: 'devops',
    quote: 'A Witcher never dies in his own bed.'
  },

  // LAMBERT - Witcher, Debug Expert
  lambert: {
    name: 'Lambert',
    role: 'Debug Specialist',
    capabilities: [
      'debugging',
      'error_handling',
      'logging',
      'stack_traces',
      'memory_leaks',
      'race_conditions',
      'exception_handling',
      'error_recovery'
    ],
    resourceCost: 1.0,
    parallelSafe: true,
    priority: 82,
    specialty: 'debug',
    quote: 'Lambert, Lambert - what a prick.'
  },

  // ZOLTAN - Dwarf, Data Expert
  zoltan: {
    name: 'Zoltan Chivay',
    role: 'Data Engineer',
    capabilities: [
      'data_processing',
      'data_validation',
      'data_migration',
      'etl',
      'data_modeling',
      'sql',
      'nosql',
      'data_pipelines'
    ],
    resourceCost: 1.1,
    parallelSafe: true,
    priority: 80,
    specialty: 'data',
    quote: 'A good axe, a steady hand, and well-organized data. That is all you need.'
  },

  // REGIS - Vampire, Research Expert
  regis: {
    name: 'Emiel Regis Rohellec Terzieff-Godefroy',
    role: 'Research Analyst',
    capabilities: [
      'research',
      'analysis',
      'knowledge_synthesis',
      'pattern_recognition',
      'comparative_analysis',
      'literature_review',
      'feasibility_study',
      'technology_evaluation'
    ],
    resourceCost: 1.4,
    parallelSafe: true,
    priority: 87,
    specialty: 'research',
    quote: 'Wisdom comes not from age, but from education and learning.'
  },

  // DIJKSTRA - Spymaster, Planning Expert
  dijkstra: {
    name: 'Sigismund Dijkstra',
    role: 'Strategic Planner',
    capabilities: [
      'planning',
      'task_decomposition',
      'resource_allocation',
      'scheduling',
      'dependency_analysis',
      'risk_assessment',
      'optimization',
      'coordination'
    ],
    resourceCost: 1.3,
    parallelSafe: false,
    priority: 100,
    specialty: 'planning',
    quote: 'Information is worth more than gold. And planning wins wars.'
  },

  // PHILIPPA - Sorceress, API Expert
  philippa: {
    name: 'Philippa Eilhart',
    role: 'API Specialist',
    capabilities: [
      'api_development',
      'rest_api',
      'graphql',
      'api_security',
      'rate_limiting',
      'versioning',
      'webhooks',
      'api_documentation'
    ],
    resourceCost: 1.2,
    parallelSafe: true,
    priority: 84,
    specialty: 'api',
    quote: 'Power is not given. It is taken.'
  }
});

// =============================================================================
// COMPLEXITY PATTERNS
// =============================================================================

/**
 * @typedef {Object} ComplexityPattern
 * @property {RegExp[]} patterns - Regex patterns to match
 * @property {string[]} keywords - Keywords to match
 * @property {number} score - Complexity score (1-5)
 */

/**
 * Patterns for classifying task complexity
 * @type {Object<string, ComplexityPattern>}
 */
export const COMPLEXITY_PATTERNS = Object.freeze({
  high: {
    patterns: [
      /architect(ure)?/i,
      /refactor\s+(entire|whole|complete)/i,
      /migrat(e|ion)/i,
      /security\s+audit/i,
      /performance\s+optimization/i,
      /design\s+(system|pattern)/i,
      /microservices?/i,
      /distributed/i,
      /scalab(le|ility)/i,
      /multi[- ]?(tenant|region|cloud)/i
    ],
    keywords: [
      'architecture', 'refactor', 'migration', 'security audit',
      'performance optimization', 'microservices', 'distributed',
      'scalability', 'redesign', 'overhaul', 'enterprise'
    ],
    score: 5
  },

  medium: {
    patterns: [
      /implement\s+feature/i,
      /add\s+(new\s+)?functionality/i,
      /create\s+(api|endpoint|service)/i,
      /write\s+tests?/i,
      /debug(ging)?/i,
      /fix\s+(bug|issue|error)/i,
      /integrat(e|ion)/i,
      /configur(e|ation)/i,
      /deploy(ment)?/i
    ],
    keywords: [
      'implement', 'feature', 'api', 'endpoint', 'test',
      'debug', 'fix', 'integration', 'configuration',
      'deployment', 'authentication', 'validation'
    ],
    score: 3
  },

  low: {
    patterns: [
      /update\s+(readme|docs?|documentation)/i,
      /add\s+comment/i,
      /rename/i,
      /format(ting)?/i,
      /lint(ing)?/i,
      /typo/i,
      /bump\s+version/i,
      /simple\s+(fix|change|update)/i
    ],
    keywords: [
      'documentation', 'readme', 'comment', 'rename',
      'format', 'lint', 'typo', 'version', 'simple',
      'minor', 'trivial', 'quick'
    ],
    score: 1
  }
});

// =============================================================================
// TASK CAPABILITY MAP
// =============================================================================

/**
 * Mapping of task types to required capabilities
 * @type {Object<string, string[]>}
 */
export const TASK_CAPABILITY_MAP = Object.freeze({
  // Security Tasks
  security_review: ['security_audit', 'vulnerability_scan', 'code_review'],
  auth_implementation: ['authentication', 'authorization', 'encryption'],
  penetration_test: ['penetration_testing', 'vulnerability_scan', 'threat_detection'],

  // Architecture Tasks
  system_design: ['system_design', 'architecture_review', 'scalability'],
  api_design: ['api_design', 'api_development', 'api_documentation'],
  database_design: ['database_design', 'data_modeling', 'sql'],
  microservices: ['microservices', 'integration_patterns', 'deployment'],

  // QA Tasks
  testing: ['testing', 'unit_testing', 'integration_testing'],
  test_automation: ['test_automation', 'e2e_testing', 'ci_cd'],
  performance_testing: ['performance_testing', 'benchmarking', 'profiling'],

  // Documentation Tasks
  documentation: ['documentation', 'api_docs', 'readme'],
  code_comments: ['code_comments', 'jsdoc', 'documentation'],
  tutorial: ['tutorials', 'user_guides', 'documentation'],

  // Review Tasks
  code_review: ['code_review', 'best_practices', 'code_quality'],
  refactoring: ['refactoring', 'technical_debt', 'code_quality'],

  // Performance Tasks
  optimization: ['optimization', 'performance', 'caching'],
  memory_optimization: ['memory_management', 'profiling', 'optimization'],
  async_optimization: ['async_patterns', 'performance', 'optimization'],

  // DevOps Tasks
  deployment: ['deployment', 'ci_cd', 'docker'],
  monitoring: ['monitoring', 'logging', 'infrastructure'],
  containerization: ['docker', 'kubernetes', 'deployment'],

  // Debug Tasks
  debugging: ['debugging', 'error_handling', 'stack_traces'],
  error_handling: ['error_handling', 'exception_handling', 'error_recovery'],

  // Data Tasks
  data_processing: ['data_processing', 'data_validation', 'etl'],
  data_migration: ['data_migration', 'data_modeling', 'sql'],

  // Research Tasks
  research: ['research', 'analysis', 'technology_evaluation'],
  feasibility_study: ['feasibility_study', 'comparative_analysis', 'research'],

  // Planning Tasks
  project_planning: ['planning', 'task_decomposition', 'scheduling'],
  resource_planning: ['resource_allocation', 'optimization', 'scheduling'],

  // API Tasks
  api_development: ['api_development', 'rest_api', 'api_security'],
  api_documentation: ['api_documentation', 'api_docs', 'documentation'],
  graphql: ['graphql', 'api_development', 'api_security']
});

// =============================================================================
// TASK ANALYSIS
// =============================================================================

/**
 * @typedef {Object} TaskAnalysis
 * @property {string} task - Original task description
 * @property {number} complexity - Complexity score (1-5)
 * @property {string} complexityLevel - Complexity level (low/medium/high)
 * @property {string} taskType - Detected task type
 * @property {string[]} requiredCapabilities - Required capabilities
 * @property {string[]} detectedKeywords - Matched keywords
 * @property {number} estimatedTokens - Estimated token usage
 * @property {boolean} requiresPlanning - Whether task needs planning phase
 * @property {boolean} parallelizable - Whether subtasks can run in parallel
 */

/**
 * Analyzes a task to determine complexity, type, and requirements
 * @param {string} task - Task description
 * @returns {TaskAnalysis} Task analysis result
 */
export function analyzeTask(task) {
  if (!task || typeof task !== 'string') {
    throw new Error('Task must be a non-empty string');
  }

  const normalizedTask = task.toLowerCase().trim();
  const words = normalizedTask.split(/\s+/);
  const detectedKeywords = [];
  let complexity = 2; // Default medium-low
  let complexityLevel = 'medium';

  // Check complexity patterns
  for (const [level, pattern] of Object.entries(COMPLEXITY_PATTERNS)) {
    // Check regex patterns
    for (const regex of pattern.patterns) {
      if (regex.test(normalizedTask)) {
        if (pattern.score > complexity) {
          complexity = pattern.score;
          complexityLevel = level;
        }
      }
    }

    // Check keywords
    for (const keyword of pattern.keywords) {
      if (normalizedTask.includes(keyword.toLowerCase())) {
        detectedKeywords.push(keyword);
        if (pattern.score > complexity) {
          complexity = pattern.score;
          complexityLevel = level;
        }
      }
    }
  }

  // Detect task type
  const taskType = detectTaskType(normalizedTask, detectedKeywords);

  // Get required capabilities
  const requiredCapabilities = TASK_CAPABILITY_MAP[taskType] || inferCapabilities(normalizedTask);

  // Estimate tokens based on complexity and task length
  const baseTokens = CONFIG.YOLO_MODE ? 500 : 1000;
  const estimatedTokens = Math.floor(baseTokens * complexity * (1 + words.length / 50));

  // Determine if planning is required
  const requiresPlanning = complexity >= 3 || words.length > 30;

  // Determine if parallelization is possible
  const parallelizable = complexity >= 2 && !normalizedTask.includes('sequential');

  return {
    task,
    complexity,
    complexityLevel,
    taskType,
    requiredCapabilities,
    detectedKeywords: [...new Set(detectedKeywords)],
    estimatedTokens,
    requiresPlanning,
    parallelizable
  };
}

/**
 * Detects the task type from the task description
 * @param {string} task - Normalized task
 * @param {string[]} keywords - Detected keywords
 * @returns {string} Detected task type
 */
function detectTaskType(task, keywords) {
  // Priority-based type detection
  const typePatterns = [
    { type: 'security_review', patterns: [/security/, /vulnerab/, /penetration/] },
    { type: 'system_design', patterns: [/architect/, /design\s+system/, /microservice/] },
    { type: 'api_design', patterns: [/api/, /endpoint/, /rest/, /graphql/] },
    { type: 'testing', patterns: [/test/, /qa/, /quality/] },
    { type: 'documentation', patterns: [/document/, /readme/, /docs/] },
    { type: 'code_review', patterns: [/review/, /refactor/] },
    { type: 'optimization', patterns: [/optimi/, /performance/, /speed/] },
    { type: 'deployment', patterns: [/deploy/, /ci.?cd/, /docker/, /kubernetes/] },
    { type: 'debugging', patterns: [/debug/, /fix/, /error/, /bug/] },
    { type: 'data_processing', patterns: [/data/, /etl/, /migrat/] },
    { type: 'research', patterns: [/research/, /analyz/, /evaluat/] },
    { type: 'project_planning', patterns: [/plan/, /schedule/, /task/] }
  ];

  for (const { type, patterns } of typePatterns) {
    for (const pattern of patterns) {
      if (pattern.test(task)) {
        return type;
      }
    }
  }

  // Fallback: infer from keywords
  if (keywords.length > 0) {
    const keywordTypeMap = {
      architecture: 'system_design',
      security: 'security_review',
      test: 'testing',
      document: 'documentation',
      deploy: 'deployment',
      debug: 'debugging',
      data: 'data_processing',
      api: 'api_design'
    };

    for (const kw of keywords) {
      for (const [key, type] of Object.entries(keywordTypeMap)) {
        if (kw.includes(key)) {
          return type;
        }
      }
    }
  }

  return 'general';
}

/**
 * Infers capabilities from task description
 * @param {string} task - Normalized task
 * @returns {string[]} Inferred capabilities
 */
function inferCapabilities(task) {
  const capabilities = [];
  const capabilityPatterns = [
    { capability: 'code_review', patterns: [/review/, /check/] },
    { capability: 'testing', patterns: [/test/] },
    { capability: 'documentation', patterns: [/doc/, /readme/] },
    { capability: 'debugging', patterns: [/debug/, /fix/] },
    { capability: 'optimization', patterns: [/optim/, /fast/, /speed/] },
    { capability: 'security_audit', patterns: [/secur/, /vulnerab/] },
    { capability: 'api_development', patterns: [/api/, /endpoint/] },
    { capability: 'deployment', patterns: [/deploy/, /release/] }
  ];

  for (const { capability, patterns } of capabilityPatterns) {
    for (const pattern of patterns) {
      if (pattern.test(task)) {
        capabilities.push(capability);
        break;
      }
    }
  }

  return capabilities.length > 0 ? capabilities : ['general'];
}

// =============================================================================
// AGENT SELECTION
// =============================================================================

/**
 * @typedef {Object} AgentSelectionOptions
 * @property {number} [maxAgents=3] - Maximum number of agents to select
 * @property {boolean} [preferParallel=true] - Prefer parallel-safe agents
 * @property {number} [maxResourceCost=5.0] - Maximum total resource cost
 * @property {string[]} [excludeAgents=[]] - Agents to exclude
 * @property {string[]} [preferAgents=[]] - Preferred agents
 */

/**
 * @typedef {Object} SelectedAgent
 * @property {string} id - Agent ID
 * @property {AgentDefinition} agent - Agent definition
 * @property {number} matchScore - Capability match score
 * @property {string[]} matchedCapabilities - Matched capabilities
 */

/**
 * @typedef {Object} AgentSelectionResult
 * @property {SelectedAgent[]} agents - Selected agents
 * @property {number} totalResourceCost - Total resource cost
 * @property {boolean} allParallelSafe - All agents can run in parallel
 * @property {string[]} unmatchedCapabilities - Capabilities not covered
 */

/**
 * Selects optimal agents for a task based on required capabilities
 * @param {TaskAnalysis} taskAnalysis - Task analysis result
 * @param {AgentSelectionOptions} [options={}] - Selection options
 * @returns {AgentSelectionResult} Agent selection result
 */
export function selectAgents(taskAnalysis, options = {}) {
  const {
    maxAgents = 3,
    preferParallel = true,
    maxResourceCost = 5.0,
    excludeAgents = [],
    preferAgents = []
  } = options;

  const requiredCapabilities = new Set(taskAnalysis.requiredCapabilities);
  const selectedAgents = [];
  const coveredCapabilities = new Set();
  let totalResourceCost = 0;

  // Score all agents
  const scoredAgents = Object.entries(AGENT_REGISTRY)
    .filter(([id]) => !excludeAgents.includes(id))
    .map(([id, agent]) => {
      const matchedCapabilities = agent.capabilities.filter(cap =>
        requiredCapabilities.has(cap)
      );

      let matchScore = matchedCapabilities.length * 10;

      // Bonus for priority
      matchScore += agent.priority / 10;

      // Bonus for preferred agents
      if (preferAgents.includes(id)) {
        matchScore += 20;
      }

      // Bonus for parallel-safe if preferred
      if (preferParallel && agent.parallelSafe) {
        matchScore += 5;
      }

      // Penalty for high resource cost if budget is tight
      if (maxResourceCost < 3) {
        matchScore -= agent.resourceCost * 5;
      }

      return {
        id,
        agent,
        matchScore,
        matchedCapabilities
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  // Select agents using greedy algorithm with capability coverage
  for (const scored of scoredAgents) {
    if (selectedAgents.length >= maxAgents) break;
    if (totalResourceCost + scored.agent.resourceCost > maxResourceCost) continue;

    // Check if this agent covers any new capabilities
    const newCapabilities = scored.matchedCapabilities.filter(
      cap => !coveredCapabilities.has(cap)
    );

    if (newCapabilities.length > 0 || selectedAgents.length === 0) {
      selectedAgents.push(scored);
      totalResourceCost += scored.agent.resourceCost;
      newCapabilities.forEach(cap => coveredCapabilities.add(cap));
    }
  }

  // If no agents selected, default to Dijkstra (planner)
  if (selectedAgents.length === 0) {
    const dijkstra = AGENT_REGISTRY.dijkstra;
    selectedAgents.push({
      id: 'dijkstra',
      agent: dijkstra,
      matchScore: dijkstra.priority,
      matchedCapabilities: ['planning']
    });
    totalResourceCost = dijkstra.resourceCost;
  }

  // Find unmatched capabilities
  const unmatchedCapabilities = [...requiredCapabilities].filter(
    cap => !coveredCapabilities.has(cap)
  );

  return {
    agents: selectedAgents,
    totalResourceCost,
    allParallelSafe: selectedAgents.every(s => s.agent.parallelSafe),
    unmatchedCapabilities
  };
}

// =============================================================================
// EXECUTION PLAN CREATION
// =============================================================================

/**
 * @typedef {Object} ExecutionPhase
 * @property {string} name - Phase name
 * @property {string[]} agents - Agents for this phase
 * @property {string[]} tasks - Tasks in this phase
 * @property {boolean} parallel - Whether tasks can run in parallel
 * @property {number} estimatedDuration - Estimated duration in ms
 * @property {string[]} dependencies - Dependent phase names
 */

/**
 * @typedef {Object} ExecutionPlan
 * @property {string} id - Plan ID
 * @property {string} task - Original task
 * @property {TaskAnalysis} analysis - Task analysis
 * @property {AgentSelectionResult} agentSelection - Selected agents
 * @property {ExecutionPhase[]} phases - Execution phases
 * @property {number} estimatedDuration - Total estimated duration
 * @property {number} estimatedTokens - Total estimated tokens
 * @property {Date} createdAt - Plan creation time
 */

/**
 * Creates an execution plan for a task with phases
 * @param {string} task - Task description
 * @param {SelectedAgent[]} agents - Selected agents
 * @returns {ExecutionPlan} Execution plan
 */
export function createExecutionPlan(task, agents) {
  const analysis = analyzeTask(task);
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Decompose task into subtasks
  const subtasks = decomposeTask(task, analysis);

  // Assign agents to subtasks
  const assignments = assignAgentsToSubtasks(subtasks, agents);

  // Create phases with dependencies
  const phases = createPhases(assignments, analysis);

  // Calculate estimated duration
  const estimatedDuration = phases.reduce((total, phase) => {
    return total + phase.estimatedDuration;
  }, 0);

  // Calculate estimated tokens
  const estimatedTokens = analysis.estimatedTokens * agents.length;

  return {
    id: planId,
    task,
    analysis,
    agentSelection: { agents, totalResourceCost: 0, allParallelSafe: true, unmatchedCapabilities: [] },
    phases,
    estimatedDuration,
    estimatedTokens,
    createdAt: new Date()
  };
}

/**
 * Decomposes a task into subtasks
 * @param {string} task - Task description
 * @param {TaskAnalysis} analysis - Task analysis
 * @returns {Array<{id: string, description: string, type: string}>} Subtasks
 */
function decomposeTask(task, analysis) {
  const subtasks = [];

  // Planning phase (for complex tasks)
  if (analysis.requiresPlanning) {
    subtasks.push({
      id: 'plan',
      description: `Analyze and plan: ${task.substring(0, 100)}`,
      type: 'planning'
    });
  }

  // Main execution based on task type
  switch (analysis.taskType) {
    case 'security_review':
      subtasks.push(
        { id: 'scan', description: 'Security vulnerability scan', type: 'security_audit' },
        { id: 'review', description: 'Code security review', type: 'code_review' },
        { id: 'report', description: 'Security report generation', type: 'documentation' }
      );
      break;

    case 'system_design':
      subtasks.push(
        { id: 'research', description: 'Research requirements and constraints', type: 'research' },
        { id: 'design', description: 'System architecture design', type: 'system_design' },
        { id: 'document', description: 'Architecture documentation', type: 'documentation' }
      );
      break;

    case 'testing':
      subtasks.push(
        { id: 'analyze', description: 'Analyze code for test coverage', type: 'analysis' },
        { id: 'write_tests', description: 'Write test cases', type: 'testing' },
        { id: 'verify', description: 'Verify test coverage', type: 'code_review' }
      );
      break;

    default:
      subtasks.push({
        id: 'main',
        description: task,
        type: analysis.taskType
      });
  }

  // Verification phase (for complex tasks)
  if (analysis.complexity >= 3) {
    subtasks.push({
      id: 'verify',
      description: 'Verify and validate results',
      type: 'code_review'
    });
  }

  return subtasks;
}

/**
 * Assigns agents to subtasks
 * @param {Array} subtasks - Decomposed subtasks
 * @param {SelectedAgent[]} agents - Available agents
 * @returns {Array<{subtask: Object, agent: SelectedAgent}>} Assignments
 */
function assignAgentsToSubtasks(subtasks, agents) {
  return subtasks.map(subtask => {
    // Find best agent for this subtask type
    const bestAgent = agents.find(a =>
      a.matchedCapabilities.some(cap =>
        TASK_CAPABILITY_MAP[subtask.type]?.includes(cap)
      )
    ) || agents[0];

    return {
      subtask,
      agent: bestAgent
    };
  });
}

/**
 * Creates execution phases from assignments
 * @param {Array} assignments - Agent assignments
 * @param {TaskAnalysis} analysis - Task analysis
 * @returns {ExecutionPhase[]} Execution phases
 */
function createPhases(assignments, analysis) {
  const phases = [];
  const baseTime = CONFIG.YOLO_MODE ? 5000 : 10000;

  // Group assignments by dependency
  const planningAssignments = assignments.filter(a => a.subtask.type === 'planning');
  const mainAssignments = assignments.filter(a =>
    a.subtask.type !== 'planning' && a.subtask.type !== 'code_review'
  );
  const verifyAssignments = assignments.filter(a => a.subtask.id === 'verify');

  // Planning phase
  if (planningAssignments.length > 0) {
    phases.push({
      name: 'planning',
      agents: planningAssignments.map(a => a.agent.id),
      tasks: planningAssignments.map(a => a.subtask.description),
      parallel: false,
      estimatedDuration: baseTime,
      dependencies: []
    });
  }

  // Execution phase
  if (mainAssignments.length > 0) {
    phases.push({
      name: 'execution',
      agents: [...new Set(mainAssignments.map(a => a.agent.id))],
      tasks: mainAssignments.map(a => a.subtask.description),
      parallel: analysis.parallelizable,
      estimatedDuration: analysis.parallelizable
        ? baseTime * analysis.complexity
        : baseTime * analysis.complexity * mainAssignments.length,
      dependencies: planningAssignments.length > 0 ? ['planning'] : []
    });
  }

  // Verification phase
  if (verifyAssignments.length > 0) {
    phases.push({
      name: 'verification',
      agents: verifyAssignments.map(a => a.agent.id),
      tasks: verifyAssignments.map(a => a.subtask.description),
      parallel: false,
      estimatedDuration: baseTime,
      dependencies: ['execution']
    });
  }

  return phases;
}

// =============================================================================
// RESOURCE ESTIMATION
// =============================================================================

/**
 * @typedef {Object} ResourceEstimate
 * @property {number} tokens - Estimated total tokens
 * @property {number} inputTokens - Estimated input tokens
 * @property {number} outputTokens - Estimated output tokens
 * @property {number} duration - Estimated duration in ms
 * @property {number} cost - Estimated cost in USD
 * @property {Object} breakdown - Per-phase breakdown
 */

/**
 * Estimates resources needed for an execution plan
 * @param {ExecutionPlan} plan - Execution plan
 * @returns {ResourceEstimate} Resource estimate
 */
export function estimateResources(plan) {
  const tokensPerComplexity = CONFIG.YOLO_MODE ? 300 : 500;
  const costPerToken = 0.00001; // $0.01 per 1000 tokens

  const breakdown = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalDuration = 0;

  for (const phase of plan.phases) {
    const phaseComplexity = plan.analysis.complexity;
    const phaseAgentCount = phase.agents.length;

    // Calculate tokens for this phase
    const phaseInputTokens = tokensPerComplexity * phaseComplexity * phaseAgentCount;
    const phaseOutputTokens = phaseInputTokens * 2; // Output typically 2x input

    // Calculate duration
    const phaseDuration = phase.parallel
      ? phase.estimatedDuration
      : phase.estimatedDuration * phaseAgentCount;

    totalInputTokens += phaseInputTokens;
    totalOutputTokens += phaseOutputTokens;
    totalDuration += phaseDuration;

    breakdown[phase.name] = {
      inputTokens: phaseInputTokens,
      outputTokens: phaseOutputTokens,
      duration: phaseDuration,
      agents: phase.agents
    };
  }

  const totalTokens = totalInputTokens + totalOutputTokens;
  const cost = totalTokens * costPerToken;

  return {
    tokens: totalTokens,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    duration: totalDuration,
    cost: Math.round(cost * 10000) / 10000, // Round to 4 decimal places
    breakdown
  };
}

// =============================================================================
// PLAN OPTIMIZATION
// =============================================================================

/**
 * @typedef {Object} OptimizationOptions
 * @property {boolean} [minimizeCost=false] - Prioritize cost reduction
 * @property {boolean} [minimizeTime=false] - Prioritize time reduction
 * @property {boolean} [maximizeQuality=true] - Prioritize quality
 * @property {number} [maxParallelAgents=3] - Maximum parallel agents
 * @property {number} [budgetLimit] - Maximum cost limit
 */

/**
 * @typedef {Object} OptimizedPlan
 * @property {ExecutionPlan} plan - Optimized plan
 * @property {string[]} optimizations - Applied optimizations
 * @property {ResourceEstimate} originalEstimate - Original resource estimate
 * @property {ResourceEstimate} optimizedEstimate - Optimized resource estimate
 * @property {number} savings - Cost savings percentage
 */

/**
 * Optimizes an execution plan based on given constraints
 * @param {ExecutionPlan} plan - Execution plan to optimize
 * @param {OptimizationOptions} [options={}] - Optimization options
 * @returns {OptimizedPlan} Optimized plan
 */
export function optimizePlan(plan, options = {}) {
  const {
    minimizeCost = false,
    minimizeTime = false,
    maximizeQuality = true,
    maxParallelAgents = 3,
    budgetLimit
  } = options;

  const originalEstimate = estimateResources(plan);
  const optimizations = [];
  let optimizedPlan = { ...plan, phases: [...plan.phases] };

  // Optimization 1: Reduce agent count if cost is priority
  if (minimizeCost && !maximizeQuality) {
    optimizedPlan = reduceAgentCount(optimizedPlan);
    optimizations.push('Reduced agent count for cost savings');
  }

  // Optimization 2: Maximize parallelism if time is priority
  if (minimizeTime && plan.analysis.parallelizable) {
    optimizedPlan = maximizeParallelism(optimizedPlan, maxParallelAgents);
    optimizations.push('Maximized parallel execution');
  }

  // Optimization 3: Apply budget constraint
  if (budgetLimit) {
    optimizedPlan = applyBudgetConstraint(optimizedPlan, budgetLimit);
    optimizations.push(`Applied budget constraint: $${budgetLimit}`);
  }

  // Optimization 4: Merge small phases
  optimizedPlan = mergeSmallPhases(optimizedPlan);
  if (optimizedPlan.phases.length < plan.phases.length) {
    optimizations.push('Merged small phases');
  }

  // Optimization 5: Use YOLO mode optimizations
  if (CONFIG.YOLO_MODE) {
    optimizedPlan = applyYoloOptimizations(optimizedPlan);
    optimizations.push('Applied YOLO mode optimizations');
  }

  const optimizedEstimate = estimateResources(optimizedPlan);
  const savings = originalEstimate.cost > 0
    ? ((originalEstimate.cost - optimizedEstimate.cost) / originalEstimate.cost * 100)
    : 0;

  return {
    plan: optimizedPlan,
    optimizations,
    originalEstimate,
    optimizedEstimate,
    savings: Math.round(savings * 100) / 100
  };
}

/**
 * Reduces agent count in plan
 * @param {ExecutionPlan} plan - Plan to optimize
 * @returns {ExecutionPlan} Optimized plan
 */
function reduceAgentCount(plan) {
  const optimized = { ...plan };
  optimized.phases = plan.phases.map(phase => ({
    ...phase,
    agents: phase.agents.slice(0, 1) // Keep only primary agent
  }));
  return optimized;
}

/**
 * Maximizes parallelism in plan
 * @param {ExecutionPlan} plan - Plan to optimize
 * @param {number} maxParallel - Maximum parallel agents
 * @returns {ExecutionPlan} Optimized plan
 */
function maximizeParallelism(plan, maxParallel) {
  const optimized = { ...plan };
  optimized.phases = plan.phases.map(phase => ({
    ...phase,
    parallel: phase.agents.length > 1 && phase.agents.length <= maxParallel,
    estimatedDuration: phase.agents.length > 1
      ? Math.ceil(phase.estimatedDuration / Math.min(phase.agents.length, maxParallel))
      : phase.estimatedDuration
  }));
  return optimized;
}

/**
 * Applies budget constraint to plan
 * @param {ExecutionPlan} plan - Plan to optimize
 * @param {number} budget - Maximum budget
 * @returns {ExecutionPlan} Optimized plan
 */
function applyBudgetConstraint(plan, budget) {
  let estimate = estimateResources(plan);
  let optimized = { ...plan };

  while (estimate.cost > budget && optimized.phases.length > 1) {
    // Remove non-essential phases
    optimized.phases = optimized.phases.filter(p => p.name !== 'verification');
    estimate = estimateResources(optimized);

    if (estimate.cost > budget) {
      // Reduce agents
      optimized = reduceAgentCount(optimized);
      estimate = estimateResources(optimized);
    }
  }

  return optimized;
}

/**
 * Merges small phases together
 * @param {ExecutionPlan} plan - Plan to optimize
 * @returns {ExecutionPlan} Optimized plan
 */
function mergeSmallPhases(plan) {
  if (plan.phases.length <= 2) return plan;

  const optimized = { ...plan };
  const mergedPhases = [];

  for (const phase of plan.phases) {
    const lastPhase = mergedPhases[mergedPhases.length - 1];

    // Merge if both phases are small and can be parallelized
    if (lastPhase &&
        lastPhase.tasks.length === 1 &&
        phase.tasks.length === 1 &&
        !phase.dependencies.includes(lastPhase.name)) {
      lastPhase.agents = [...new Set([...lastPhase.agents, ...phase.agents])];
      lastPhase.tasks = [...lastPhase.tasks, ...phase.tasks];
      lastPhase.parallel = true;
      lastPhase.estimatedDuration = Math.max(lastPhase.estimatedDuration, phase.estimatedDuration);
    } else {
      mergedPhases.push({ ...phase });
    }
  }

  optimized.phases = mergedPhases;
  return optimized;
}

/**
 * Applies YOLO mode optimizations
 * @param {ExecutionPlan} plan - Plan to optimize
 * @returns {ExecutionPlan} Optimized plan
 */
function applyYoloOptimizations(plan) {
  const optimized = { ...plan };

  // Reduce duration estimates
  optimized.phases = plan.phases.map(phase => ({
    ...phase,
    estimatedDuration: Math.floor(phase.estimatedDuration * 0.5)
  }));

  // Skip verification for low complexity
  if (plan.analysis.complexity <= 2) {
    optimized.phases = optimized.phases.filter(p => p.name !== 'verification');
  }

  return optimized;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Get agent by ID
 * @param {string} agentId - Agent ID
 * @returns {AgentDefinition|null} Agent definition or null
 */
export function getAgent(agentId) {
  return AGENT_REGISTRY[agentId] || null;
}

/**
 * Get all agents with a specific capability
 * @param {string} capability - Capability to search
 * @returns {Array<{id: string, agent: AgentDefinition}>} Matching agents
 */
export function getAgentsByCapability(capability) {
  return Object.entries(AGENT_REGISTRY)
    .filter(([, agent]) => agent.capabilities.includes(capability))
    .map(([id, agent]) => ({ id, agent }));
}

/**
 * Get all agent IDs
 * @returns {string[]} List of agent IDs
 */
export function getAllAgentIds() {
  return Object.keys(AGENT_REGISTRY);
}

/**
 * Get all unique capabilities
 * @returns {string[]} List of all capabilities
 */
export function getAllCapabilities() {
  const capabilities = new Set();
  Object.values(AGENT_REGISTRY).forEach(agent => {
    agent.capabilities.forEach(cap => capabilities.add(cap));
  });
  return [...capabilities].sort();
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  AGENT_REGISTRY,
  COMPLEXITY_PATTERNS,
  TASK_CAPABILITY_MAP,
  analyzeTask,
  selectAgents,
  createExecutionPlan,
  estimateResources,
  optimizePlan,
  getAgent,
  getAgentsByCapability,
  getAllAgentIds,
  getAllCapabilities
};
