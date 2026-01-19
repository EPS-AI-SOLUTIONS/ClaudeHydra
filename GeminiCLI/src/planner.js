/**
 * Dijkstra Planner - Planning/Strategy Agent for HYDRA Swarm
 *
 * Provides task analysis, agent selection, execution planning,
 * resource estimation, and plan optimization capabilities.
 */

import { CONFIG } from './config.js';

// Agent registry with capabilities and resource profiles
const AGENT_REGISTRY = {
  Geralt: {
    name: 'Geralt',
    persona: 'White Wolf',
    specialization: 'Security/Ops',
    capabilities: ['security-audit', 'ops', 'threat-analysis', 'penetration-testing'],
    resourceCost: 3,
    parallelSafe: true,
    priority: 1
  },
  Yennefer: {
    name: 'Yennefer',
    persona: 'Sorceress',
    specialization: 'Architecture/Code',
    capabilities: ['architecture', 'code-design', 'refactoring', 'patterns'],
    resourceCost: 4,
    parallelSafe: true,
    priority: 2
  },
  Triss: {
    name: 'Triss',
    persona: 'Healer',
    specialization: 'QA/Testing',
    capabilities: ['testing', 'qa', 'validation', 'debugging'],
    resourceCost: 3,
    parallelSafe: true,
    priority: 3
  },
  Jaskier: {
    name: 'Jaskier',
    persona: 'Bard',
    specialization: 'Docs/Comms',
    capabilities: ['documentation', 'communication', 'writing', 'explanation'],
    resourceCost: 2,
    parallelSafe: true,
    priority: 5
  },
  Vesemir: {
    name: 'Vesemir',
    persona: 'Mentor',
    specialization: 'Review/Best Practices',
    capabilities: ['code-review', 'best-practices', 'mentoring', 'standards'],
    resourceCost: 3,
    parallelSafe: true,
    priority: 4
  },
  Ciri: {
    name: 'Ciri',
    persona: 'Prodigy',
    specialization: 'Speed/Quick',
    capabilities: ['quick-tasks', 'prototyping', 'fast-iteration', 'exploration'],
    resourceCost: 1,
    parallelSafe: true,
    priority: 6
  },
  Eskel: {
    name: 'Eskel',
    persona: 'Pragmatist',
    specialization: 'DevOps/Infra',
    capabilities: ['devops', 'infrastructure', 'deployment', 'ci-cd'],
    resourceCost: 4,
    parallelSafe: true,
    priority: 2
  },
  Lambert: {
    name: 'Lambert',
    persona: 'Skeptic',
    specialization: 'Debug/Perf',
    capabilities: ['debugging', 'performance', 'optimization', 'profiling'],
    resourceCost: 3,
    parallelSafe: true,
    priority: 3
  },
  Zoltan: {
    name: 'Zoltan',
    persona: 'Craftsman',
    specialization: 'Data/DB',
    capabilities: ['database', 'data-modeling', 'sql', 'migrations'],
    resourceCost: 3,
    parallelSafe: false,
    priority: 2
  },
  Regis: {
    name: 'Regis',
    persona: 'Sage',
    specialization: 'Research/Analysis',
    capabilities: ['research', 'analysis', 'investigation', 'deep-dive'],
    resourceCost: 4,
    parallelSafe: true,
    priority: 1
  },
  Dijkstra: {
    name: 'Dijkstra',
    persona: 'Spymaster',
    specialization: 'Planning/Strategy',
    capabilities: ['planning', 'strategy', 'coordination', 'orchestration'],
    resourceCost: 3,
    parallelSafe: true,
    priority: 1
  },
  Philippa: {
    name: 'Philippa',
    persona: 'Strategist',
    specialization: 'Integrations/API',
    capabilities: ['integrations', 'api-design', 'external-services', 'webhooks'],
    resourceCost: 4,
    parallelSafe: true,
    priority: 2
  }
};

// Task complexity keywords and patterns
const COMPLEXITY_PATTERNS = {
  high: {
    keywords: [
      'refactor',
      'migrate',
      'architecture',
      'redesign',
      'overhaul',
      'security-audit',
      'performance-optimization',
      'multi-service',
      'distributed'
    ],
    patterns: [
      /\b(entire|whole|all|complete)\s+(system|codebase|application)/i,
      /\b(major|significant|breaking)\s+(change|update|modification)/i,
      /\b(cross-cutting|system-wide|platform)/i
    ],
    weight: 3
  },
  medium: {
    keywords: [
      'implement',
      'create',
      'build',
      'add',
      'feature',
      'endpoint',
      'component',
      'module',
      'service'
    ],
    patterns: [
      /\b(new|add|create)\s+(feature|endpoint|api|component)/i,
      /\b(update|modify|change)\s+(multiple|several)/i,
      /\b(integration|connect|sync)/i
    ],
    weight: 2
  },
  low: {
    keywords: ['fix', 'bug', 'typo', 'update', 'tweak', 'adjust', 'minor', 'small', 'quick'],
    patterns: [/\b(simple|quick|minor|small)\s+(fix|change|update)/i, /\b(typo|spelling|formatting)/i],
    weight: 1
  }
};

// Capability to task type mapping
const TASK_CAPABILITY_MAP = {
  security: ['security-audit', 'threat-analysis', 'penetration-testing'],
  architecture: ['architecture', 'code-design', 'patterns', 'refactoring'],
  testing: ['testing', 'qa', 'validation', 'debugging'],
  documentation: ['documentation', 'communication', 'writing', 'explanation'],
  review: ['code-review', 'best-practices', 'standards'],
  performance: ['debugging', 'performance', 'optimization', 'profiling'],
  data: ['database', 'data-modeling', 'sql', 'migrations'],
  research: ['research', 'analysis', 'investigation', 'deep-dive'],
  devops: ['devops', 'infrastructure', 'deployment', 'ci-cd'],
  api: ['integrations', 'api-design', 'external-services', 'webhooks'],
  quick: ['quick-tasks', 'prototyping', 'fast-iteration', 'exploration'],
  planning: ['planning', 'strategy', 'coordination', 'orchestration']
};

/**
 * Analyzes a task to determine its complexity, type, and requirements
 *
 * @param {string} task - The task description to analyze
 * @returns {Object} Analysis result with complexity, type, keywords, and metrics
 */
export const analyzeTask = (task) => {
  if (!task || typeof task !== 'string') {
    return {
      complexity: 'unknown',
      complexityScore: 0,
      type: 'general',
      detectedKeywords: [],
      estimatedTokens: 0,
      requiresSequential: false,
      hasDataDependencies: false,
      riskLevel: 'low',
      confidence: 0
    };
  }

  const normalizedTask = task.toLowerCase().trim();
  const words = normalizedTask.split(/\s+/);
  const lineCount = task.split('\n').length;
  const charCount = task.length;

  // Detect complexity level
  let complexityScore = 0;
  const detectedKeywords = [];

  for (const [level, config] of Object.entries(COMPLEXITY_PATTERNS)) {
    for (const keyword of config.keywords) {
      if (normalizedTask.includes(keyword)) {
        complexityScore += config.weight;
        detectedKeywords.push({ keyword, level });
      }
    }
    for (const pattern of config.patterns) {
      if (pattern.test(normalizedTask)) {
        complexityScore += config.weight;
      }
    }
  }

  // Adjust for task length
  if (charCount > 500) complexityScore += 1;
  if (charCount > 1000) complexityScore += 1;
  if (lineCount > 5) complexityScore += 1;
  if (lineCount > 10) complexityScore += 1;

  // Determine complexity level
  let complexity;
  if (complexityScore >= 6) {
    complexity = 'high';
  } else if (complexityScore >= 3) {
    complexity = 'medium';
  } else {
    complexity = 'low';
  }

  // Detect task type
  const taskTypes = [];
  for (const [type, capabilities] of Object.entries(TASK_CAPABILITY_MAP)) {
    for (const cap of capabilities) {
      if (normalizedTask.includes(cap.replace('-', ' ')) || normalizedTask.includes(cap)) {
        taskTypes.push(type);
        break;
      }
    }
  }

  // Check for data dependencies (database, migrations, etc.)
  const hasDataDependencies =
    /\b(database|db|migration|schema|data|sql|transaction)\b/i.test(normalizedTask);

  // Check if sequential execution is required
  const requiresSequential =
    hasDataDependencies ||
    /\b(step by step|sequential|order|first.*then|before.*after)\b/i.test(normalizedTask);

  // Assess risk level
  let riskLevel = 'low';
  if (
    /\b(production|prod|live|delete|drop|remove|destroy|critical)\b/i.test(normalizedTask)
  ) {
    riskLevel = 'high';
  } else if (/\b(staging|test|modify|update|change)\b/i.test(normalizedTask)) {
    riskLevel = 'medium';
  }

  // Estimate tokens (rough approximation)
  const estimatedTokens = Math.ceil(words.length * 1.3);

  // Calculate confidence based on detected patterns
  const confidence = Math.min(1, 0.3 + detectedKeywords.length * 0.1 + taskTypes.length * 0.15);

  return {
    complexity,
    complexityScore,
    type: taskTypes.length > 0 ? taskTypes[0] : 'general',
    allTypes: taskTypes,
    detectedKeywords,
    estimatedTokens,
    requiresSequential,
    hasDataDependencies,
    riskLevel,
    confidence: Math.round(confidence * 100) / 100,
    metrics: {
      wordCount: words.length,
      lineCount,
      charCount
    }
  };
};

/**
 * Selects appropriate agents for a given task based on analysis
 *
 * @param {string} task - The task description
 * @param {Object} options - Selection options
 * @param {number} options.maxAgents - Maximum number of agents to select
 * @param {boolean} options.includeReviewer - Always include a reviewer agent
 * @param {boolean} options.includeResearcher - Always include a researcher agent
 * @returns {Object} Selected agents with roles and rationale
 */
export const selectAgents = (task, options = {}) => {
  const { maxAgents = 5, includeReviewer = true, includeResearcher = true } = options;

  const analysis = analyzeTask(task);
  const selectedAgents = [];
  const agentScores = [];

  // Score each agent based on task requirements
  for (const [name, agent] of Object.entries(AGENT_REGISTRY)) {
    let score = 0;
    const reasons = [];

    // Check capability match
    for (const type of analysis.allTypes) {
      const requiredCapabilities = TASK_CAPABILITY_MAP[type] || [];
      const matchingCapabilities = agent.capabilities.filter((cap) =>
        requiredCapabilities.includes(cap)
      );
      if (matchingCapabilities.length > 0) {
        score += matchingCapabilities.length * 2;
        reasons.push(`Matches ${type} capabilities: ${matchingCapabilities.join(', ')}`);
      }
    }

    // Boost for complexity-appropriate agents
    if (analysis.complexity === 'high' && agent.resourceCost >= 3) {
      score += 1;
      reasons.push('Suitable for high complexity');
    }
    if (analysis.complexity === 'low' && agent.resourceCost <= 2) {
      score += 1;
      reasons.push('Efficient for low complexity');
    }

    // Boost for risk-appropriate agents
    if (analysis.riskLevel === 'high' && agent.specialization.includes('Security')) {
      score += 2;
      reasons.push('Security expertise for high-risk task');
    }

    // Check data dependency handling
    if (analysis.hasDataDependencies && agent.capabilities.includes('database')) {
      score += 2;
      reasons.push('Has database capabilities');
    }

    agentScores.push({
      name,
      agent,
      score,
      reasons
    });
  }

  // Sort by score (descending), then by priority (ascending)
  agentScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.agent.priority - b.agent.priority;
  });

  // Select top agents
  const topAgents = agentScores.slice(0, maxAgents);

  // Ensure reviewer is included if requested
  if (includeReviewer) {
    const hasReviewer = topAgents.some(
      (a) =>
        a.agent.capabilities.includes('code-review') ||
        a.agent.capabilities.includes('best-practices')
    );
    if (!hasReviewer && agentScores.length > maxAgents) {
      const reviewer = agentScores.find(
        (a) =>
          a.agent.capabilities.includes('code-review') &&
          !topAgents.includes(a)
      );
      if (reviewer) {
        topAgents.pop();
        topAgents.push(reviewer);
      }
    }
  }

  // Ensure researcher is included if requested
  if (includeResearcher) {
    const hasResearcher = topAgents.some((a) =>
      a.agent.capabilities.includes('research')
    );
    if (!hasResearcher && agentScores.length > maxAgents) {
      const researcher = agentScores.find(
        (a) =>
          a.agent.capabilities.includes('research') && !topAgents.includes(a)
      );
      if (researcher) {
        topAgents.pop();
        topAgents.push(researcher);
      }
    }
  }

  return {
    agents: topAgents.map((a) => ({
      name: a.name,
      specialization: a.agent.specialization,
      capabilities: a.agent.capabilities,
      score: a.score,
      reasons: a.reasons,
      resourceCost: a.agent.resourceCost,
      parallelSafe: a.agent.parallelSafe
    })),
    taskAnalysis: analysis,
    selectionCriteria: {
      maxAgents,
      includeReviewer,
      includeResearcher
    },
    totalAgents: topAgents.length
  };
};

/**
 * Creates a detailed execution plan for a task with selected agents
 *
 * @param {string} task - The task description
 * @param {Array} agents - Array of selected agents (from selectAgents)
 * @returns {Object} Execution plan with phases, steps, and dependencies
 */
export const createExecutionPlan = (task, agents) => {
  const analysis = analyzeTask(task);
  const agentList = Array.isArray(agents) ? agents : agents?.agents || [];

  // Define execution phases
  const phases = [];

  // Phase 1: Research & Analysis
  const researchAgents = agentList.filter(
    (a) =>
      a.capabilities?.includes('research') ||
      a.capabilities?.includes('analysis') ||
      a.specialization?.includes('Research')
  );
  if (researchAgents.length > 0 || analysis.complexity !== 'low') {
    phases.push({
      id: 'research',
      name: 'Research & Analysis',
      order: 1,
      agents: researchAgents.length > 0 ? researchAgents.map((a) => a.name) : ['Regis'],
      parallel: true,
      description: 'Gather context, investigate requirements, and identify unknowns',
      estimatedDuration: analysis.complexity === 'high' ? 30 : 15,
      outputs: ['context', 'requirements', 'risks']
    });
  }

  // Phase 2: Planning
  phases.push({
    id: 'planning',
    name: 'Planning & Strategy',
    order: 2,
    agents: ['Dijkstra'],
    parallel: false,
    description: 'Create detailed plan, define dependencies, allocate resources',
    estimatedDuration: analysis.complexity === 'high' ? 20 : 10,
    outputs: ['plan', 'dependencies', 'timeline'],
    dependsOn: phases.length > 0 ? ['research'] : []
  });

  // Phase 3: Implementation
  const implementationAgents = agentList.filter(
    (a) =>
      a.capabilities?.includes('architecture') ||
      a.capabilities?.includes('code-design') ||
      a.capabilities?.includes('database') ||
      a.capabilities?.includes('devops') ||
      a.capabilities?.includes('api-design')
  );
  if (implementationAgents.length > 0) {
    const canParallel =
      !analysis.requiresSequential &&
      implementationAgents.every((a) => a.parallelSafe !== false);

    phases.push({
      id: 'implementation',
      name: 'Implementation',
      order: 3,
      agents: implementationAgents.map((a) => a.name),
      parallel: canParallel,
      description: 'Execute the core work based on plan',
      estimatedDuration: analysis.complexity === 'high' ? 60 : 30,
      outputs: ['code', 'artifacts', 'documentation'],
      dependsOn: ['planning']
    });
  }

  // Phase 4: Testing & Validation
  const testingAgents = agentList.filter(
    (a) =>
      a.capabilities?.includes('testing') ||
      a.capabilities?.includes('qa') ||
      a.capabilities?.includes('debugging')
  );
  if (testingAgents.length > 0) {
    phases.push({
      id: 'testing',
      name: 'Testing & Validation',
      order: 4,
      agents: testingAgents.map((a) => a.name),
      parallel: true,
      description: 'Verify implementation, run tests, validate output',
      estimatedDuration: analysis.complexity === 'high' ? 30 : 15,
      outputs: ['test-results', 'validation-report'],
      dependsOn: ['implementation']
    });
  }

  // Phase 5: Review
  const reviewAgents = agentList.filter(
    (a) =>
      a.capabilities?.includes('code-review') ||
      a.capabilities?.includes('best-practices') ||
      a.capabilities?.includes('security-audit')
  );
  if (reviewAgents.length > 0) {
    phases.push({
      id: 'review',
      name: 'Review & Security',
      order: 5,
      agents: reviewAgents.map((a) => a.name),
      parallel: true,
      description: 'Code review, security audit, best practices check',
      estimatedDuration: 20,
      outputs: ['review-feedback', 'security-report'],
      dependsOn: ['implementation']
    });
  }

  // Phase 6: Documentation
  const docAgents = agentList.filter(
    (a) =>
      a.capabilities?.includes('documentation') ||
      a.capabilities?.includes('writing')
  );
  if (docAgents.length > 0) {
    phases.push({
      id: 'documentation',
      name: 'Documentation',
      order: 6,
      agents: docAgents.map((a) => a.name),
      parallel: true,
      description: 'Update documentation, create changelogs',
      estimatedDuration: 15,
      outputs: ['documentation', 'changelog'],
      dependsOn: ['review', 'testing'].filter((d) => phases.some((p) => p.id === d))
    });
  }

  // Phase 7: Synthesis
  phases.push({
    id: 'synthesis',
    name: 'Synthesis & Report',
    order: 7,
    agents: ['Dijkstra'],
    parallel: false,
    description: 'Combine all outputs, resolve conflicts, create final report',
    estimatedDuration: 15,
    outputs: ['final-report', 'recommendations'],
    dependsOn: phases.filter((p) => p.id !== 'synthesis').map((p) => p.id)
  });

  // Calculate total duration
  const totalDuration = phases.reduce((sum, p) => sum + p.estimatedDuration, 0);

  // Build dependency graph
  const dependencyGraph = {};
  for (const phase of phases) {
    dependencyGraph[phase.id] = phase.dependsOn || [];
  }

  return {
    task,
    taskAnalysis: analysis,
    phases,
    totalPhases: phases.length,
    estimatedTotalDuration: totalDuration,
    dependencyGraph,
    executionOrder: phases.map((p) => p.id),
    parallelPhases: phases.filter((p) => p.parallel).map((p) => p.id),
    sequentialPhases: phases.filter((p) => !p.parallel).map((p) => p.id),
    allAgentsInvolved: [...new Set(phases.flatMap((p) => p.agents))],
    createdAt: new Date().toISOString()
  };
};

/**
 * Estimates resources required to execute a plan
 *
 * @param {Object} plan - Execution plan from createExecutionPlan
 * @returns {Object} Resource estimation with tokens, cost, and constraints
 */
export const estimateResources = (plan) => {
  if (!plan || !plan.phases) {
    return {
      error: 'Invalid plan provided',
      totalTokens: 0,
      estimatedCost: 0,
      memoryRequired: 0,
      concurrencyRequired: 1
    };
  }

  const analysis = plan.taskAnalysis || { complexity: 'medium' };

  // Base token estimates per complexity
  const tokenMultipliers = {
    low: 500,
    medium: 1200,
    high: 2500
  };

  const baseTokens = tokenMultipliers[analysis.complexity] || 1200;

  // Calculate tokens per phase
  const phaseResources = plan.phases.map((phase) => {
    const agentCount = phase.agents?.length || 1;
    const parallelMultiplier = phase.parallel ? 1 : 1.2;
    const phaseTokens = Math.ceil(
      baseTokens * agentCount * parallelMultiplier * (phase.estimatedDuration / 15)
    );

    return {
      phaseId: phase.id,
      phaseName: phase.name,
      agentCount,
      estimatedTokens: phaseTokens,
      estimatedDuration: phase.estimatedDuration,
      parallel: phase.parallel
    };
  });

  // Total tokens
  const totalTokens = phaseResources.reduce((sum, p) => sum + p.estimatedTokens, 0);

  // Calculate concurrency requirements
  const maxConcurrency = Math.max(
    ...plan.phases.filter((p) => p.parallel).map((p) => p.agents?.length || 1),
    1
  );

  // Memory estimation (rough: 100KB per agent, 500KB base)
  const uniqueAgents = plan.allAgentsInvolved?.length || 1;
  const memoryRequired = 500 + uniqueAgents * 100;

  // Cost estimation (using local Ollama - essentially free, but track for comparison)
  const localCost = 0;
  const apiCostEstimate = (totalTokens / 1000) * 0.002; // Rough API cost if not local

  // Resource constraints
  const constraints = [];
  if (maxConcurrency > (CONFIG.QUEUE_MAX_CONCURRENT || 5)) {
    constraints.push({
      type: 'concurrency',
      message: `Plan requires ${maxConcurrency} concurrent agents, but limit is ${CONFIG.QUEUE_MAX_CONCURRENT || 5}`,
      severity: 'warning'
    });
  }
  if (totalTokens > 50000) {
    constraints.push({
      type: 'tokens',
      message: `High token usage estimated: ${totalTokens}`,
      severity: 'info'
    });
  }
  if (plan.estimatedTotalDuration > 120) {
    constraints.push({
      type: 'duration',
      message: `Long execution time: ${plan.estimatedTotalDuration} minutes`,
      severity: 'warning'
    });
  }

  return {
    phaseResources,
    totalTokens,
    estimatedCost: {
      local: localCost,
      apiEstimate: Math.round(apiCostEstimate * 1000) / 1000
    },
    memoryRequired,
    concurrencyRequired: maxConcurrency,
    uniqueAgents,
    totalDuration: plan.estimatedTotalDuration,
    constraints,
    recommendation:
      constraints.length === 0
        ? 'Plan is within resource limits'
        : `${constraints.length} constraint(s) detected - review before execution`
  };
};

/**
 * Optimizes an execution plan for better parallelism and efficiency
 *
 * @param {Object} plan - Execution plan from createExecutionPlan
 * @param {Object} options - Optimization options
 * @param {boolean} options.maximizeParallelism - Prioritize parallel execution
 * @param {boolean} options.minimizeDuration - Prioritize faster completion
 * @param {boolean} options.minimizeCost - Prioritize lower resource usage
 * @returns {Object} Optimized plan with improvements and metrics
 */
export const optimizePlan = (plan, options = {}) => {
  if (!plan || !plan.phases) {
    return {
      error: 'Invalid plan provided',
      optimized: false
    };
  }

  const {
    maximizeParallelism = true,
    minimizeDuration = true,
    minimizeCost = false
  } = options;

  const originalResources = estimateResources(plan);
  const optimizedPhases = JSON.parse(JSON.stringify(plan.phases));
  const optimizations = [];

  // Optimization 1: Merge parallel-safe phases at the same dependency level
  if (maximizeParallelism) {
    const phasesByDependency = {};
    for (const phase of optimizedPhases) {
      const depKey = (phase.dependsOn || []).sort().join(',') || 'root';
      if (!phasesByDependency[depKey]) {
        phasesByDependency[depKey] = [];
      }
      phasesByDependency[depKey].push(phase);
    }

    for (const [depKey, phases] of Object.entries(phasesByDependency)) {
      const parallelSafePhases = phases.filter((p) => p.parallel);
      if (parallelSafePhases.length > 1) {
        optimizations.push({
          type: 'parallel-merge',
          description: `Phases ${parallelSafePhases.map((p) => p.id).join(', ')} can run in parallel`,
          impact: 'duration-reduction'
        });
      }
    }
  }

  // Optimization 2: Reduce sequential bottlenecks
  if (minimizeDuration) {
    const sequentialPhases = optimizedPhases.filter((p) => !p.parallel);
    for (const phase of sequentialPhases) {
      // Check if phase can be made parallel
      const agents = phase.agents || [];
      const allParallelSafe = agents.every((agentName) => {
        const agent = AGENT_REGISTRY[agentName];
        return agent?.parallelSafe !== false;
      });

      if (allParallelSafe && agents.length > 1) {
        phase.parallel = true;
        optimizations.push({
          type: 'sequential-to-parallel',
          description: `Phase ${phase.id} converted to parallel execution`,
          impact: 'duration-reduction'
        });
      }
    }
  }

  // Optimization 3: Remove redundant agents in cost-sensitive mode
  if (minimizeCost) {
    for (const phase of optimizedPhases) {
      if (phase.agents && phase.agents.length > 2) {
        const sortedAgents = phase.agents
          .map((name) => ({ name, cost: AGENT_REGISTRY[name]?.resourceCost || 3 }))
          .sort((a, b) => a.cost - b.cost);

        const originalCount = phase.agents.length;
        phase.agents = sortedAgents.slice(0, 2).map((a) => a.name);

        if (phase.agents.length < originalCount) {
          optimizations.push({
            type: 'agent-reduction',
            description: `Phase ${phase.id} reduced from ${originalCount} to ${phase.agents.length} agents`,
            impact: 'cost-reduction'
          });
        }
      }
    }
  }

  // Optimization 4: Reorder phases for better dependency resolution
  const reorderedPhases = topologicalSort(optimizedPhases);

  // Calculate optimized metrics
  const optimizedPlan = {
    ...plan,
    phases: reorderedPhases,
    optimized: true
  };

  const optimizedResources = estimateResources(optimizedPlan);

  // Calculate improvements
  const durationImprovement =
    originalResources.totalDuration > 0
      ? Math.round(
          ((originalResources.totalDuration - optimizedResources.totalDuration) /
            originalResources.totalDuration) *
            100
        )
      : 0;

  const tokenImprovement =
    originalResources.totalTokens > 0
      ? Math.round(
          ((originalResources.totalTokens - optimizedResources.totalTokens) /
            originalResources.totalTokens) *
            100
        )
      : 0;

  return {
    originalPlan: plan,
    optimizedPlan,
    optimizations,
    metrics: {
      original: {
        duration: originalResources.totalDuration,
        tokens: originalResources.totalTokens,
        concurrency: originalResources.concurrencyRequired
      },
      optimized: {
        duration: optimizedResources.totalDuration,
        tokens: optimizedResources.totalTokens,
        concurrency: optimizedResources.concurrencyRequired
      },
      improvements: {
        durationPercent: durationImprovement,
        tokenPercent: tokenImprovement
      }
    },
    options,
    appliedOptimizations: optimizations.length,
    recommendation:
      optimizations.length > 0
        ? `Applied ${optimizations.length} optimization(s) for ${durationImprovement}% duration improvement`
        : 'Plan is already optimal for given constraints'
  };
};

/**
 * Topological sort for phase ordering based on dependencies
 *
 * @param {Array} phases - Array of phases with dependsOn arrays
 * @returns {Array} Sorted phases in execution order
 */
const topologicalSort = (phases) => {
  const sorted = [];
  const visited = new Set();
  const temp = new Set();

  const visit = (phase) => {
    if (temp.has(phase.id)) {
      // Circular dependency detected, skip
      return;
    }
    if (visited.has(phase.id)) {
      return;
    }

    temp.add(phase.id);

    for (const depId of phase.dependsOn || []) {
      const depPhase = phases.find((p) => p.id === depId);
      if (depPhase) {
        visit(depPhase);
      }
    }

    temp.delete(phase.id);
    visited.add(phase.id);
    sorted.push(phase);
  };

  for (const phase of phases) {
    if (!visited.has(phase.id)) {
      visit(phase);
    }
  }

  return sorted;
};

// Export agent registry for external use
export { AGENT_REGISTRY, TASK_CAPABILITY_MAP };
