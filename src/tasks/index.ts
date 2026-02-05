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
export async function initTasks(options = {}) {
  const { getTodoStorage } = await import('./todo-storage.js');
  const { getTodoManager } = await import('./todo-manager.js');

  const storage = getTodoStorage({ storageDir: options.storageDir });
  const manager = getTodoManager({ storage });

  return { storage, manager };
}

/**
 * Shutdown tasks system
 */
export async function shutdownTasks() {
  const { resetTodoStorage } = await import('./todo-storage.js');
  const { resetTodoManager } = await import('./todo-manager.js');

  resetTodoManager();
  resetTodoStorage();
}

// ============================================================================
// Default Export
// ============================================================================

import {
  TodoStorage as _TodoStorage,
  TodoStatus as _TodoStatus,
  getTodoStorage as _getTodoStorage,
  resetTodoStorage as _resetTodoStorage
} from './todo-storage.js';

import {
  TodoManager as _TodoManager,
  getTodoManager as _getTodoManager,
  resetTodoManager as _resetTodoManager,
  writeTodos as _writeTodos,
  getTodos as _getTodos,
  getTodoStats as _getTodoStats
} from './todo-manager.js';

export default {
  TodoStorage: _TodoStorage,
  TodoStatus: _TodoStatus,
  getTodoStorage: _getTodoStorage,
  resetTodoStorage: _resetTodoStorage,
  TodoManager: _TodoManager,
  getTodoManager: _getTodoManager,
  resetTodoManager: _resetTodoManager,
  writeTodos: _writeTodos,
  getTodos: _getTodos,
  getTodoStats: _getTodoStats,
  initTasks,
  shutdownTasks
};
