/**
 * Jules Client - Google Async Coding Agent
 * 
 * Manages async task delegation, status tracking, and GitHub integration.
 * Tasks are stored in-memory with optional persistence.
 */

import { v4 as uuidv4 } from 'uuid';
import { Octokit } from '@octokit/rest';
import { CONFIG } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('jules-client');

// Task Status Enum
export const TaskStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// Task Priority
export const TaskPriority = {
  URGENT: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
  BACKGROUND: 5
};

// In-memory task store
const taskStore = new Map();

// GitHub client (lazy initialized)
let octokit = null;

/**
 * Initialize GitHub client
 */
const getOctokit = () => {
  if (!octokit && CONFIG.GITHUB_TOKEN) {
    octokit = new Octokit({ auth: CONFIG.GITHUB_TOKEN });
    logger.info('GitHub client initialized');
  }
  return octokit;
};

/**
 * Generate a new task ID
 */
const generateTaskId = () => {
  return `jules-${Date.now()}-${uuidv4().split('-')[0]}`;
};

/**
 * Create a new task object
 */
const createTask = (description, options = {}) => {
  const now = Date.now();
  return {
    id: generateTaskId(),

    description,
    status: TaskStatus.PENDING,
    priority: options.priority || TaskPriority.NORMAL,
    type: options.type || 'general',
    repo: options.repo || null,
    branch: options.branch || null,
    metadata: options.metadata || {},
    progress: 0,
    result: null,
    error: null,
    logs: [],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    estimatedDuration: options.estimatedDuration || null
  };
};

/**
 * Simulate task execution (since Jules API is not publicly available)
 */
const simulateTaskExecution = async (task) => {
  // Simulate processing time based on task type
  const durations = {
    'code-generation': 5000,
    'test-generation': 8000,
    'refactoring': 10000,
    'documentation': 4000,
    'bug-fix': 6000,
    'general': 3000
  };


  const duration = durations[task.type] || durations.general;
  const steps = 5;
  const stepDuration = duration / steps;

  // Update to running
  task.status = TaskStatus.RUNNING;
  task.startedAt = Date.now();
  task.logs.push({ time: Date.now(), message: 'Task started' });

  // Simulate progress
  for (let i = 1; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, stepDuration));
    task.progress = (i / steps) * 100;
    task.logs.push({ 
      time: Date.now(), 
      message: `Processing step ${i}/${steps}...` 
    });
  }

  // Generate simulated result
  task.status = TaskStatus.COMPLETED;
  task.completedAt = Date.now();
  task.progress = 100;
  task.result = {
    success: true,
    summary: `Task "${task.description}" completed successfully`,
    output: generateSimulatedOutput(task),
    duration: task.completedAt - task.startedAt
  };
  task.logs.push({ time: Date.now(), message: 'Task completed' });


  return task;
};

/**
 * Generate simulated output based on task type
 */
const generateSimulatedOutput = (task) => {
  const outputs = {
    'code-generation': {
      files: ['src/generated-module.js'],
      linesAdded: 150,
      linesRemoved: 0
    },
    'test-generation': {
      files: ['tests/generated.test.js'],
      testCount: 12,
      coverage: '85%'
    },
    'refactoring': {
      files: ['src/refactored.js'],
      linesAdded: 45,
      linesRemoved: 120,
      improvements: ['Extracted functions', 'Improved naming']
    },
    'documentation': {
      files: ['docs/README.md'],
      sections: ['Overview', 'API', 'Examples']
    },
    'bug-fix': {
      files: ['src/fixed-module.js'],
      issue: task.metadata.issue || 'Unknown',
      resolution: 'Applied fix'
    }
  };
  return outputs[task.type] || { message: 'Task completed' };
};


// ============================================
// PUBLIC API
// ============================================

/**
 * Delegate a new async task
 */
export const delegateTask = async (description, options = {}) => {
  const task = createTask(description, options);
  taskStore.set(task.id, task);
  
  logger.info('Task delegated', { 
    id: task.id, 
    type: task.type,
    priority: task.priority 
  });

  // Start async execution (non-blocking)
  if (CONFIG.SIMULATION_MODE) {
    // Fire and forget - task runs in background
    simulateTaskExecution(task).catch(err => {
      task.status = TaskStatus.FAILED;
      task.error = err.message;
      task.completedAt = Date.now();
      logger.error('Task execution failed', { id: task.id, error: err.message });
    });
  }

  return {
    id: task.id,
    status: task.status,
    message: `Task delegated successfully. Use jules_status to check progress.`
  };
};


/**
 * Get task status
 */
export const getTaskStatus = (taskId) => {
  const task = taskStore.get(taskId);
  if (!task) {
    return { error: `Task ${taskId} not found` };
  }

  return {
    id: task.id,
    description: task.description,
    status: task.status,
    progress: task.progress,
    type: task.type,
    priority: task.priority,
    result: task.result,
    error: task.error,
    logs: task.logs.slice(-5), // Last 5 logs
    createdAt: new Date(task.createdAt).toISOString(),
    startedAt: task.startedAt ? new Date(task.startedAt).toISOString() : null,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    duration: task.completedAt && task.startedAt 
      ? task.completedAt - task.startedAt 
      : null
  };
};

/**
 * List all tasks with optional filtering
 */
export const listTasks = (options = {}) => {
  const { status, type, limit = 20 } = options;
  
  let tasks = Array.from(taskStore.values());


  // Filter by status
  if (status) {
    tasks = tasks.filter(t => t.status === status);
  }

  // Filter by type
  if (type) {
    tasks = tasks.filter(t => t.type === type);
  }

  // Sort by creation time (newest first)
  tasks.sort((a, b) => b.createdAt - a.createdAt);

  // Limit results
  tasks = tasks.slice(0, limit);

  return {
    total: taskStore.size,
    filtered: tasks.length,
    tasks: tasks.map(t => ({
      id: t.id,
      description: t.description.substring(0, 50) + (t.description.length > 50 ? '...' : ''),
      status: t.status,
      progress: t.progress,
      type: t.type,
      createdAt: new Date(t.createdAt).toISOString()
    }))
  };
};

/**
 * Cancel a task
 */
export const cancelTask = (taskId) => {
  const task = taskStore.get(taskId);

  if (!task) {
    return { error: `Task ${taskId} not found` };
  }

  if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
    return { 
      error: `Cannot cancel task in ${task.status} status`,
      id: taskId 
    };
  }

  task.status = TaskStatus.CANCELLED;
  task.completedAt = Date.now();
  task.logs.push({ time: Date.now(), message: 'Task cancelled by user' });

  logger.info('Task cancelled', { id: taskId });

  return {
    id: taskId,
    status: task.status,
    message: 'Task cancelled successfully'
  };
};

/**
 * Clear completed/failed tasks
 */
export const clearTasks = (options = {}) => {
  const { olderThanHours = CONFIG.TASK_RETENTION_HOURS } = options;
  const cutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);
  let cleared = 0;


  for (const [id, task] of taskStore.entries()) {
    const isTerminal = [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status);
    if (isTerminal && task.completedAt < cutoff) {
      taskStore.delete(id);
      cleared++;
    }
  }

  logger.info('Tasks cleared', { cleared });
  return { cleared, remaining: taskStore.size };
};

// ============================================
// GITHUB INTEGRATION
// ============================================

/**
 * Create a GitHub issue
 */
export const createGitHubIssue = async (options) => {
  const { title, body, labels = [], owner, repo } = options;
  
  const gh = getOctokit();
  if (!gh) {
    return { 
      error: 'GitHub not configured. Set GITHUB_TOKEN environment variable.',
      simulated: true,
      issue: {
        number: Math.floor(Math.random() * 1000),
        title,
        url: `https://github.com/${owner || 'owner'}/${repo || 'repo'}/issues/0`
      }
    };
  }


  try {
    const targetOwner = owner || CONFIG.GITHUB_DEFAULT_OWNER;
    const targetRepo = repo || CONFIG.GITHUB_DEFAULT_REPO;

    if (!targetOwner || !targetRepo) {
      return { error: 'GitHub owner and repo are required' };
    }

    const response = await gh.issues.create({
      owner: targetOwner,
      repo: targetRepo,
      title,
      body,
      labels
    });

    logger.info('GitHub issue created', { 
      number: response.data.number,
      url: response.data.html_url 
    });

    return {
      success: true,
      issue: {
        number: response.data.number,
        title: response.data.title,
        url: response.data.html_url,
        state: response.data.state
      }
    };
  } catch (err) {
    logger.error('Failed to create GitHub issue', { error: err.message });
    return { error: err.message };
  }
};


/**
 * Create a GitHub Pull Request
 */
export const createGitHubPR = async (options) => {
  const { title, body, head, base = 'main', owner, repo, draft = false } = options;

  const gh = getOctokit();
  if (!gh) {
    return {
      error: 'GitHub not configured. Set GITHUB_TOKEN environment variable.',
      simulated: true,
      pr: {
        number: Math.floor(Math.random() * 1000),
        title,
        url: `https://github.com/${owner || 'owner'}/${repo || 'repo'}/pull/0`
      }
    };
  }

  try {
    const targetOwner = owner || CONFIG.GITHUB_DEFAULT_OWNER;
    const targetRepo = repo || CONFIG.GITHUB_DEFAULT_REPO;

    if (!targetOwner || !targetRepo) {
      return { error: 'GitHub owner and repo are required' };
    }

    if (!head) {
      return { error: 'Head branch is required for PR creation' };
    }


    const response = await gh.pulls.create({
      owner: targetOwner,
      repo: targetRepo,
      title,
      body,
      head,
      base,
      draft
    });

    logger.info('GitHub PR created', {
      number: response.data.number,
      url: response.data.html_url
    });

    return {
      success: true,
      pr: {
        number: response.data.number,
        title: response.data.title,
        url: response.data.html_url,
        state: response.data.state,
        head: response.data.head.ref,
        base: response.data.base.ref
      }
    };
  } catch (err) {
    logger.error('Failed to create GitHub PR', { error: err.message });
    return { error: err.message };
  }
};

// ============================================
// HEALTH & STATUS
// ============================================


/**
 * Check Jules service health
 */
export const checkHealth = async () => {
  const stats = getTaskStats();
  const githubConfigured = Boolean(CONFIG.GITHUB_TOKEN);

  return {
    status: 'ok',
    mode: CONFIG.SIMULATION_MODE ? 'simulation' : 'live',
    tasks: stats,
    github: {
      configured: githubConfigured,
      defaultOwner: CONFIG.GITHUB_DEFAULT_OWNER || null,
      defaultRepo: CONFIG.GITHUB_DEFAULT_REPO || null
    },
    config: {
      maxConcurrent: CONFIG.TASK_MAX_CONCURRENT,
      defaultTimeout: CONFIG.TASK_DEFAULT_TIMEOUT_MS,
      retentionHours: CONFIG.TASK_RETENTION_HOURS
    }
  };
};

/**
 * Get task statistics
 */
export const getTaskStats = () => {
  const tasks = Array.from(taskStore.values());
  
  const byStatus = {};
  const byType = {};


  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    byType[task.type] = (byType[task.type] || 0) + 1;
  }

  const completed = tasks.filter(t => t.status === TaskStatus.COMPLETED);
  const avgDuration = completed.length > 0
    ? completed.reduce((sum, t) => sum + (t.completedAt - t.startedAt), 0) / completed.length
    : 0;

  return {
    total: tasks.length,
    byStatus,
    byType,
    averageDurationMs: Math.round(avgDuration)
  };
};

/**
 * Get current configuration
 */
export const getConfig = () => {
  return {
    apiVersion: CONFIG.API_VERSION,
    simulationMode: CONFIG.SIMULATION_MODE,
    github: {
      enabled: CONFIG.GITHUB_ENABLED,
      configured: Boolean(CONFIG.GITHUB_TOKEN),
      defaultOwner: CONFIG.GITHUB_DEFAULT_OWNER || null,
      defaultRepo: CONFIG.GITHUB_DEFAULT_REPO || null
    },
    tasks: {
      maxConcurrent: CONFIG.TASK_MAX_CONCURRENT,
      defaultTimeoutMs: CONFIG.TASK_DEFAULT_TIMEOUT_MS,
      pollIntervalMs: CONFIG.TASK_POLL_INTERVAL_MS,
      maxRetries: CONFIG.TASK_MAX_RETRIES,
      retentionHours: CONFIG.TASK_RETENTION_HOURS
    }
  };
};
