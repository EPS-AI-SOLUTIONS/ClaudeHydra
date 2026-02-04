/**
 * Tasks Module
 *
 * Todo management system implementing Claude Code's TodoWrite semantics.
 *
 * @module src/tasks
 */

// Storage
export {
  TodoStorage,
  TodoStatus,
  getTodoStorage,
  resetTodoStorage
} from './todo-storage.js';

// Manager
export {
  TodoManager,
  getTodoManager,
  resetTodoManager,
  writeTodos,
  getTodos,
  getTodoStats
} from './todo-manager.js';

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize tasks system
 *
 * @param {Object} [options] - Options
 * @param {string} [options.storageDir] - Storage directory
 * @returns {Object} Tasks system instances
 */
export function initTasks(options = {}) {
  const { getTodoStorage } = require('./todo-storage.js');
  const { getTodoManager } = require('./todo-manager.js');

  const storage = getTodoStorage({ storageDir: options.storageDir });
  const manager = getTodoManager({ storage });

  return { storage, manager };
}

/**
 * Shutdown tasks system
 */
export function shutdownTasks() {
  const { resetTodoStorage } = require('./todo-storage.js');
  const { resetTodoManager } = require('./todo-manager.js');

  resetTodoManager();
  resetTodoStorage();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  TodoStorage,
  TodoStatus,
  getTodoStorage,
  resetTodoStorage,
  TodoManager,
  getTodoManager,
  resetTodoManager,
  writeTodos,
  getTodos,
  getTodoStats,
  initTasks,
  shutdownTasks
};
