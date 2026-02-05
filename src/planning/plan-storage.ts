/**
 * Plan Storage
 *
 * Handles persistence of plans to the filesystem.
 *
 * @module src/planning/plan-storage
 */

import fs from 'fs/promises';
import path from 'path';
import { PhaseName, PhaseStatus, createInitialPhaseStatuses } from './phases.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_STORAGE_DIR = '.hydra/plans';

// ============================================================================
// Plan Storage Class
// ============================================================================

/**
 * Plan Storage
 *
 * Manages plan persistence with file-based storage.
 */
export class PlanStorage {
  /**
   * @param {Object} options - Storage options
   * @param {string} [options.storageDir] - Directory for plan files
   */
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.cwd(), DEFAULT_STORAGE_DIR);
  }

  /**
   * Ensure storage directory exists
   *
   * @returns {Promise<void>}
   */
  async ensureStorageDir() {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  /**
   * Generate a unique plan ID
   *
   * @returns {string}
   */
  generatePlanId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `plan-${timestamp}-${random}`;
  }

  /**
   * Get plan file path
   *
   * @param {string} planId - Plan identifier
   * @returns {string}
   */
  getPlanPath(planId) {
    return path.join(this.storageDir, `${planId}.json`);
  }

  /**
   * Create a new plan
   *
   * @param {string} query - User query
   * @param {Object} [metadata] - Additional metadata
   * @returns {Promise<Object>}
   */
  async create(query, metadata = {}) {
    await this.ensureStorageDir();

    const planId = this.generatePlanId();
    const now = new Date().toISOString();

    const plan = {
      id: planId,
      version: '1.0.0',
      status: 'active',
      query,
      createdAt: now,
      updatedAt: now,
      phases: this.createInitialPhases(),
      tasks: [],
      outputs: {},
      metadata: {
        ...metadata,
        estimatedTokens: 0,
        actualTokens: 0
      }
    };

    await this.save(plan);

    return plan;
  }

  /**
   * Create initial phase objects
   *
   * @returns {Object}
   */
  createInitialPhases() {
    const phases = {};

    for (const phaseName of Object.values(PhaseName)) {
      phases[phaseName] = {
        status: PhaseStatus.PENDING,
        agent: null,
        startedAt: null,
        completedAt: null,
        output: null,
        error: null
      };
    }

    return phases;
  }

  /**
   * Save plan to file
   *
   * @param {Object} plan - Plan object
   * @returns {Promise<void>}
   */
  async save(plan) {
    await this.ensureStorageDir();

    plan.updatedAt = new Date().toISOString();

    const planPath = this.getPlanPath(plan.id);
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
  }

  /**
   * Load plan from file
   *
   * @param {string} planId - Plan identifier
   * @returns {Promise<Object | null>}
   */
  async load(planId) {
    try {
      const planPath = this.getPlanPath(planId);
      const content = await fs.readFile(planPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a plan
   *
   * @param {string} planId - Plan identifier
   * @returns {Promise<boolean>}
   */
  async delete(planId) {
    try {
      const planPath = this.getPlanPath(planId);
      await fs.unlink(planPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all plans
   *
   * @param {Object} [options] - List options
   * @param {string} [options.status] - Filter by status
   * @param {number} [options.limit] - Maximum number of plans
   * @returns {Promise<Object[]>}
   */
  async list(options = {}) {
    await this.ensureStorageDir();

    try {
      const files = await fs.readdir(this.storageDir);
      const planFiles = files.filter((f) => f.endsWith('.json'));

      const plans = [];

      for (const file of planFiles) {
        try {
          const content = await fs.readFile(path.join(this.storageDir, file), 'utf-8');
          const plan = JSON.parse(content);

          if (!options.status || plan.status === options.status) {
            plans.push(plan);
          }
        } catch {
          // Skip invalid files
        }
      }

      // Sort by creation date (newest first)
      plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (options.limit) {
        return plans.slice(0, options.limit);
      }

      return plans;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Update phase status
   *
   * @param {string} planId - Plan identifier
   * @param {string} phaseName - Phase name
   * @param {Object} updates - Phase updates
   * @returns {Promise<Object>}
   */
  async updatePhase(planId, phaseName, updates) {
    const plan = await this.load(planId);

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (!plan.phases[phaseName]) {
      throw new Error(`Invalid phase: ${phaseName}`);
    }

    plan.phases[phaseName] = {
      ...plan.phases[phaseName],
      ...updates
    };

    await this.save(plan);

    return plan;
  }

  /**
   * Update plan status
   *
   * @param {string} planId - Plan identifier
   * @param {string} status - New status
   * @returns {Promise<Object>}
   */
  async updateStatus(planId, status) {
    const plan = await this.load(planId);

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.status = status;

    await this.save(plan);

    return plan;
  }

  /**
   * Add task to plan
   *
   * @param {string} planId - Plan identifier
   * @param {Object} task - Task object
   * @returns {Promise<Object>}
   */
  async addTask(planId, task) {
    const plan = await this.load(planId);

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Generate task ID if not provided
    if (!task.id) {
      task.id = `task-${plan.tasks.length + 1}`;
    }

    task.createdAt = new Date().toISOString();
    task.status = task.status || 'pending';

    plan.tasks.push(task);

    await this.save(plan);

    return plan;
  }

  /**
   * Update task in plan
   *
   * @param {string} planId - Plan identifier
   * @param {string} taskId - Task identifier
   * @param {Object} updates - Task updates
   * @returns {Promise<Object>}
   */
  async updateTask(planId, taskId, updates) {
    const plan = await this.load(planId);

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const taskIndex = plan.tasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    plan.tasks[taskIndex] = {
      ...plan.tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.save(plan);

    return plan;
  }

  /**
   * Add output to plan
   *
   * @param {string} planId - Plan identifier
   * @param {string} key - Output key
   * @param {any} value - Output value
   * @returns {Promise<Object>}
   */
  async addOutput(planId, key, value) {
    const plan = await this.load(planId);

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.outputs[key] = value;

    await this.save(plan);

    return plan;
  }

  /**
   * Archive a plan (move to archive subdirectory)
   *
   * @param {string} planId - Plan identifier
   * @returns {Promise<string>} - Archive path
   */
  async archive(planId) {
    const plan = await this.load(planId);

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const archiveDir = path.join(this.storageDir, 'archive');
    await fs.mkdir(archiveDir, { recursive: true });

    plan.status = 'archived';
    plan.archivedAt = new Date().toISOString();

    const archivePath = path.join(archiveDir, `${planId}.json`);
    await fs.writeFile(archivePath, JSON.stringify(plan, null, 2), 'utf-8');

    // Delete original
    await this.delete(planId);

    return archivePath;
  }

  /**
   * Get active plan (most recent active plan)
   *
   * @returns {Promise<Object | null>}
   */
  async getActivePlan() {
    const plans = await this.list({ status: 'active', limit: 1 });
    return plans[0] || null;
  }

  /**
   * Clean up old completed plans
   *
   * @param {number} [maxAge=7] - Maximum age in days
   * @returns {Promise<number>} - Number of plans cleaned
   */
  async cleanup(maxAge = 7) {
    const plans = await this.list({ status: 'completed' });
    const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const plan of plans) {
      if (new Date(plan.updatedAt).getTime() < cutoff) {
        await this.archive(plan.id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create plan storage instance
 *
 * @param {Object} [options] - Storage options
 * @returns {PlanStorage}
 */
export function getPlanStorage(options = {}) {
  if (!_instance) {
    _instance = new PlanStorage(options);
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetPlanStorage() {
  _instance = null;
}

export default PlanStorage;
