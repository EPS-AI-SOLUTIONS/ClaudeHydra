/**
 * Tasks Module
 *
 * Todo management system implementing Claude Code's TodoWrite semantics.
 *
 * @module src/tasks
 */

// Manager
export {
  getTodoManager,
  getTodoStats,
  getTodos,
  resetTodoManager,
  TodoManager,
  writeTodos,
} from './todo-manager.js';
// Storage
export {
  getTodoStorage,
  resetTodoStorage,
  TodoStatus,
  TodoStorage,
} from './todo-storage.js';

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
  getTodoManager as _getTodoManager,
  getTodoStats as _getTodoStats,
  getTodos as _getTodos,
  resetTodoManager as _resetTodoManager,
  TodoManager as _TodoManager,
  writeTodos as _writeTodos,
} from './todo-manager.js';
import {
  getTodoStorage as _getTodoStorage,
  resetTodoStorage as _resetTodoStorage,
  TodoStatus as _TodoStatus,
  TodoStorage as _TodoStorage,
} from './todo-storage.js';

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
  shutdownTasks,
};
