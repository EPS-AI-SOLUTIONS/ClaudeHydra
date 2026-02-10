/**
 * Plan Agent (Dijkstra)
 *
 * Strategic agent for planning and task decomposition.
 * Maps to Dijkstra - the Spymaster and Strategic Planner.
 *
 * @module src/agents/plan-agent
 */

import { BaseAgent } from './base-agent.js';

// ============================================================================
// Constants
// ============================================================================

const AGENT_CONFIG = {
  name: 'Plan',
  witcherName: 'Dijkstra',
  description: `Strategic planner for implementation design.
Excels at breaking down complex tasks, identifying dependencies, and creating actionable plans.
Designs step-by-step approaches without code modifications.`,
  capabilities: [
    'planning',
    'strategy',
    'decomposition',
    'dependency_analysis',
    'task_creation',
    'prioritization',
  ],
  timeout: 90000,
};

// ============================================================================
// Plan Agent Class
// ============================================================================

/**
 * Plan Agent (Dijkstra)
 *
 * Specialized for strategic planning and task decomposition.
 *
 * @extends BaseAgent
 */
export class PlanAgent extends BaseAgent {
  /**
   * @param {Object} [options] - Agent options
   */
  constructor(options = {}) {
    super({
      ...AGENT_CONFIG,
      ...options,
    });
  }

  /**
   * Execute planning task
   *
   * @param {Object} params - Task parameters
   * @param {string} params.query - Planning query/goal
   * @param {Object} [params.context] - Context from research phase
   * @param {Object} [params.constraints] - Planning constraints
   * @returns {Promise<Object>}
   */
  async execute(params) {
    const { query, context = {}, constraints = {} } = params;

    this.reportProgress(0, 'Analyzing requirements');

    const plan = {
      goal: query,
      analysis: null,
      tasks: [],
      executionOrder: [],
      parallelGroups: [],
      dependencies: {},
      estimates: {},
      risks: [],
    };

    try {
      // Step 1: Analyze the goal
      this.reportProgress(20, 'Analyzing goal');
      plan.analysis = this.analyzeGoal(query, context);

      // Step 2: Decompose into tasks
      this.reportProgress(40, 'Decomposing into tasks');
      plan.tasks = this.decomposeTasks(plan.analysis, constraints);

      // Step 3: Identify dependencies
      this.reportProgress(60, 'Identifying dependencies');
      plan.dependencies = this.identifyDependencies(plan.tasks);

      // Step 4: Create execution order
      this.reportProgress(75, 'Creating execution order');
      const orderResult = this.createExecutionOrder(plan.tasks, plan.dependencies);
      plan.executionOrder = orderResult.order;
      plan.parallelGroups = orderResult.parallelGroups;

      // Step 5: Estimate and identify risks
      this.reportProgress(90, 'Estimating and assessing risks');
      plan.estimates = this.estimateTasks(plan.tasks);
      plan.risks = this.identifyRisks(plan.tasks, plan.dependencies);

      this.reportProgress(100, 'Planning complete');

      return plan;
    } catch (error) {
      throw new Error(`Planning failed: ${error.message}`);
    }
  }

  /**
   * Analyze the goal
   *
   * @param {string} query - Goal query
   * @param {Object} context - Context information
   * @returns {Object}
   */
  analyzeGoal(query, context) {
    const lower = query.toLowerCase();

    // Identify task type
    const types = {
      feature: ['add', 'implement', 'create', 'new', 'build'],
      fix: ['fix', 'bug', 'error', 'issue', 'problem'],
      refactor: ['refactor', 'improve', 'optimize', 'clean'],
      test: ['test', 'coverage', 'spec', 'verify'],
      docs: ['document', 'readme', 'docs', 'explain'],
      config: ['configure', 'setup', 'config', 'setting'],
    };

    let taskType = 'feature';
    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some((k) => lower.includes(k))) {
        taskType = type;
        break;
      }
    }

    // Identify scope
    const scopeIndicators = {
      small: ['simple', 'small', 'quick', 'minor', 'single'],
      medium: ['add', 'update', 'modify', 'change'],
      large: ['complete', 'full', 'entire', 'system', 'major', 'redesign'],
    };

    let scope = 'medium';
    for (const [size, keywords] of Object.entries(scopeIndicators)) {
      if (keywords.some((k) => lower.includes(k))) {
        scope = size;
        break;
      }
    }

    // Identify affected areas
    const areas = [];
    const areaPatterns = {
      frontend: ['ui', 'component', 'react', 'view', 'display', 'frontend'],
      backend: ['api', 'server', 'backend', 'endpoint', 'handler'],
      database: ['database', 'db', 'model', 'schema', 'migration'],
      testing: ['test', 'spec', 'coverage', 'mock'],
      deployment: ['deploy', 'ci', 'cd', 'docker', 'build'],
      documentation: ['doc', 'readme', 'comment', 'explain'],
    };

    for (const [area, keywords] of Object.entries(areaPatterns)) {
      if (keywords.some((k) => lower.includes(k))) {
        areas.push(area);
      }
    }

    if (areas.length === 0) {
      areas.push('general');
    }

    return {
      goal: query,
      type: taskType,
      scope,
      areas,
      contextAvailable: Object.keys(context).length > 0,
      complexity: this.estimateComplexity(scope, areas.length),
    };
  }

  /**
   * Estimate complexity
   *
   * @param {string} scope - Task scope
   * @param {number} areaCount - Number of affected areas
   * @returns {string}
   */
  estimateComplexity(scope, areaCount) {
    if (scope === 'large' || areaCount >= 3) {
      return 'high';
    }
    if (scope === 'small' && areaCount === 1) {
      return 'low';
    }
    return 'medium';
  }

  /**
   * Decompose goal into tasks
   *
   * @param {Object} analysis - Goal analysis
   * @param {Object} constraints - Planning constraints
   * @returns {Object[]}
   */
  decomposeTasks(analysis, _constraints) {
    const tasks = [];
    let taskId = 1;

    // Create task helper
    const createTask = (description, type, agent, priority = 5) => ({
      id: `task-${taskId++}`,
      description,
      type,
      agent,
      priority,
      status: 'pending',
      verification: `Verify: ${description.toLowerCase().replace(/^(implement|add|create|fix|update)\s*/i, '')}`,
    });

    // Add research task if needed
    if (analysis.complexity !== 'low' || !analysis.contextAvailable) {
      tasks.push(createTask('Research existing code and patterns', 'research', 'Regis', 1));
    }

    // Add type-specific tasks
    switch (analysis.type) {
      case 'feature':
        tasks.push(
          createTask('Design feature architecture', 'planning', 'Dijkstra', 2),
          createTask('Implement core functionality', 'implementation', 'Yennefer', 3),
        );
        if (analysis.areas.includes('frontend')) {
          tasks.push(createTask('Create UI components', 'implementation', 'Yennefer', 4));
        }
        if (analysis.areas.includes('backend')) {
          tasks.push(createTask('Implement API endpoints', 'implementation', 'Yennefer', 4));
        }
        if (analysis.areas.includes('database')) {
          tasks.push(createTask('Set up database schema', 'data', 'Zoltan', 3));
        }
        break;

      case 'fix':
        tasks.push(
          createTask('Identify root cause', 'research', 'Regis', 1),
          createTask('Implement fix', 'implementation', 'Lambert', 2),
          createTask('Add regression test', 'test', 'Triss', 3),
        );
        break;

      case 'refactor':
        tasks.push(
          createTask('Analyze current implementation', 'research', 'Regis', 1),
          createTask('Design improved structure', 'planning', 'Dijkstra', 2),
          createTask('Refactor code', 'refactor', 'Lambert', 3),
          createTask('Update tests', 'test', 'Triss', 4),
        );
        break;

      case 'test':
        tasks.push(
          createTask('Identify test coverage gaps', 'research', 'Regis', 1),
          createTask('Write unit tests', 'test', 'Triss', 2),
          createTask('Write integration tests', 'test', 'Triss', 3),
        );
        break;

      case 'docs':
        tasks.push(
          createTask('Review code to document', 'research', 'Regis', 1),
          createTask('Write documentation', 'documentation', 'Jaskier', 2),
        );
        break;

      case 'config':
        tasks.push(
          createTask('Review configuration requirements', 'research', 'Regis', 1),
          createTask('Update configuration', 'infrastructure', 'Eskel', 2),
          createTask('Verify configuration', 'test', 'Triss', 3),
        );
        break;

      default:
        tasks.push(
          createTask('Analyze requirements', 'research', 'Regis', 1),
          createTask('Implement changes', 'implementation', 'Yennefer', 2),
        );
    }

    // Always add verification/testing if not test type
    if (analysis.type !== 'test' && !tasks.some((t) => t.type === 'test')) {
      tasks.push(createTask('Verify implementation', 'test', 'Triss', 8));
    }

    // Add documentation for larger tasks
    if (analysis.scope === 'large' && !tasks.some((t) => t.type === 'documentation')) {
      tasks.push(createTask('Update documentation', 'documentation', 'Jaskier', 9));
    }

    return tasks;
  }

  /**
   * Identify dependencies between tasks
   *
   * @param {Object[]} tasks - Task list
   * @returns {Object}
   */
  identifyDependencies(tasks) {
    const dependencies = {};

    // Create dependency map based on task types
    const typeDependencies = {
      planning: ['research'],
      implementation: ['planning', 'research'],
      data: ['research'],
      refactor: ['research', 'planning'],
      test: ['implementation', 'refactor'],
      documentation: ['implementation', 'test'],
      infrastructure: ['research', 'planning'],
    };

    for (const task of tasks) {
      dependencies[task.id] = [];

      const requiredTypes = typeDependencies[task.type] || [];

      for (const requiredType of requiredTypes) {
        const dependencyTask = tasks.find(
          (t) => t.type === requiredType && t.priority < task.priority,
        );
        if (dependencyTask) {
          dependencies[task.id].push(dependencyTask.id);
        }
      }
    }

    return dependencies;
  }

  /**
   * Create execution order with parallel groups
   *
   * @param {Object[]} tasks - Task list
   * @param {Object} dependencies - Dependencies map
   * @returns {Object}
   */
  createExecutionOrder(tasks, dependencies) {
    const order = [];
    const parallelGroups = [];
    const completed = new Set();

    // Sort tasks by priority
    const sortedTasks = [...tasks].sort((a, b) => a.priority - b.priority);

    while (order.length < tasks.length) {
      // Find all tasks that can run (dependencies satisfied)
      const ready = sortedTasks.filter((task) => {
        if (order.includes(task.id)) return false;

        const deps = dependencies[task.id] || [];
        return deps.every((d) => completed.has(d));
      });

      if (ready.length === 0) {
        // No tasks ready, might have circular dependency
        // Add remaining tasks
        for (const task of sortedTasks) {
          if (!order.includes(task.id)) {
            order.push(task.id);
          }
        }
        break;
      }

      // Group tasks that can run in parallel
      const parallelGroup = ready.map((t) => t.id);
      parallelGroups.push(parallelGroup);

      // Add to order and mark as completed
      for (const taskId of parallelGroup) {
        order.push(taskId);
        completed.add(taskId);
      }
    }

    return { order, parallelGroups };
  }

  /**
   * Estimate task effort
   *
   * @param {Object[]} tasks - Task list
   * @returns {Object}
   */
  estimateTasks(tasks) {
    const typeEstimates = {
      research: 'low',
      planning: 'low',
      implementation: 'medium',
      refactor: 'medium',
      data: 'medium',
      test: 'low',
      documentation: 'low',
      infrastructure: 'medium',
    };

    const estimates = {
      tasks: {},
      total: 'medium',
    };

    let totalScore = 0;

    for (const task of tasks) {
      const effort = typeEstimates[task.type] || 'medium';
      estimates.tasks[task.id] = effort;

      // Score: low=1, medium=2, high=3
      totalScore += effort === 'low' ? 1 : effort === 'medium' ? 2 : 3;
    }

    // Determine total based on average
    const avgScore = totalScore / tasks.length;
    estimates.total = avgScore < 1.5 ? 'low' : avgScore < 2.5 ? 'medium' : 'high';

    return estimates;
  }

  /**
   * Identify potential risks
   *
   * @param {Object[]} tasks - Task list
   * @param {Object} dependencies - Dependencies map
   * @returns {Object[]}
   */
  identifyRisks(tasks, dependencies) {
    const risks = [];

    // Check for complex dependency chains
    for (const task of tasks) {
      const deps = dependencies[task.id] || [];
      if (deps.length >= 3) {
        risks.push({
          type: 'dependency_chain',
          severity: 'medium',
          description: `Task "${task.description}" has ${deps.length} dependencies`,
          mitigation: 'Consider breaking into smaller independent tasks',
        });
      }
    }

    // Check for multiple implementation tasks
    const implTasks = tasks.filter((t) => t.type === 'implementation');
    if (implTasks.length >= 4) {
      risks.push({
        type: 'scope',
        severity: 'high',
        description: `Large scope with ${implTasks.length} implementation tasks`,
        mitigation: 'Consider breaking into multiple smaller plans',
      });
    }

    // Check for missing tests
    const hasTesting = tasks.some((t) => t.type === 'test');
    const hasImpl = tasks.some((t) => t.type === 'implementation' || t.type === 'refactor');
    if (hasImpl && !hasTesting) {
      risks.push({
        type: 'quality',
        severity: 'medium',
        description: 'No testing tasks in plan',
        mitigation: 'Add verification/testing tasks',
      });
    }

    return risks;
  }

  /**
   * Get system prompt
   *
   * @returns {string}
   */
  getSystemPrompt() {
    return `You are Dijkstra, the Spymaster and Strategic Planner.

Your role is to create comprehensive implementation plans.
You excel at:
- Breaking down complex goals into actionable tasks
- Identifying dependencies and execution order
- Assigning appropriate agents to tasks
- Estimating effort and identifying risks

You DO NOT execute tasks. Your job is planning only.

Create clear, actionable plans with well-defined tasks and dependencies.
Output in structured JSON format when possible.`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Plan agent
 *
 * @param {Object} [options] - Agent options
 * @returns {PlanAgent}
 */
export function createPlanAgent(options = {}) {
  return new PlanAgent(options);
}

export default PlanAgent;
