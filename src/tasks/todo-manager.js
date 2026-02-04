/**
 * Todo Manager
 *
 * High-level todo management with validation and business logic.
 * Implements Claude Code's TodoWrite semantics.
 *
 * @module src/tasks/todo-manager
 */

import { EventEmitter } from 'events';
import { TodoStorage, TodoStatus, getTodoStorage } from './todo-storage.js';

// ============================================================================
// Validation Rules
// ============================================================================

/**
 * Maximum number of in-progress items allowed
 * @constant {number}
 */
const MAX_IN_PROGRESS = 1;

/**
 * Minimum content length
 * @constant {number}
 */
const MIN_CONTENT_LENGTH = 1;

// ============================================================================
// Todo Manager Class
// ============================================================================

/**
 * Todo Manager
 *
 * Manages todo items with validation and events.
 *
 * @extends EventEmitter
 * @fires TodoManager#todoAdded
 * @fires TodoManager#todoUpdated
 * @fires TodoManager#todoRemoved
 * @fires TodoManager#todosReplaced
 * @fires TodoManager#statusChanged
 */
export class TodoManager extends EventEmitter {
  /**
   * @param {Object} options - Manager options
   * @param {TodoStorage} [options.storage] - Storage instance
   */
  constructor(options = {}) {
    super();

    this.storage = options.storage || getTodoStorage();
  }

  /**
   * Validate todo item
   *
   * @param {Object} todo - Todo to validate
   * @throws {Error} If validation fails
   */
  validateTodo(todo) {
    if (!todo.content || todo.content.length < MIN_CONTENT_LENGTH) {
      throw new Error('Todo content is required');
    }

    if (!todo.activeForm || todo.activeForm.length < MIN_CONTENT_LENGTH) {
      throw new Error('Todo activeForm is required');
    }

    if (todo.status && !Object.values(TodoStatus).includes(todo.status)) {
      throw new Error(`Invalid status: ${todo.status}`);
    }
  }

  /**
   * Check if adding an in-progress item is allowed
   *
   * @param {Object[]} todos - Current todos
   * @param {string} [excludeId] - ID to exclude from count
   * @returns {boolean}
   */
  canAddInProgress(todos, excludeId = null) {
    const inProgressCount = todos.filter(
      (t) => t.status === TodoStatus.IN_PROGRESS && t.id !== excludeId
    ).length;

    return inProgressCount < MAX_IN_PROGRESS;
  }

  /**
   * Write todos (replaces entire todo list)
   *
   * This is the main method matching Claude Code's TodoWrite semantics.
   *
   * @param {Object[]} todos - New todo list
   * @returns {Promise<Object>}
   */
  async write(todos) {
    // Validate all todos
    for (const todo of todos) {
      this.validateTodo(todo);
    }

    // Check in-progress constraint
    const inProgressCount = todos.filter((t) => t.status === TodoStatus.IN_PROGRESS).length;
    if (inProgressCount > MAX_IN_PROGRESS) {
      throw new Error(`Only ${MAX_IN_PROGRESS} todo can be in_progress at a time`);
    }

    // Replace all todos
    const state = await this.storage.replaceAll(todos);

    this.emit('todosReplaced', { todos: state.todos });

    return state;
  }

  /**
   * Add a single todo
   *
   * @param {Object} todo - Todo to add
   * @returns {Promise<Object>}
   */
  async add(todo) {
    this.validateTodo(todo);

    // Check in-progress constraint
    if (todo.status === TodoStatus.IN_PROGRESS) {
      const todos = await this.storage.getAll();
      if (!this.canAddInProgress(todos)) {
        throw new Error(`Only ${MAX_IN_PROGRESS} todo can be in_progress at a time`);
      }
    }

    const newTodo = await this.storage.add(todo);

    this.emit('todoAdded', { todo: newTodo });

    return newTodo;
  }

  /**
   * Update todo status
   *
   * @param {string} todoId - Todo ID
   * @param {TodoStatus} status - New status
   * @returns {Promise<Object | null>}
   */
  async setStatus(todoId, status) {
    if (!Object.values(TodoStatus).includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // Check in-progress constraint
    if (status === TodoStatus.IN_PROGRESS) {
      const todos = await this.storage.getAll();
      if (!this.canAddInProgress(todos, todoId)) {
        throw new Error(`Only ${MAX_IN_PROGRESS} todo can be in_progress at a time`);
      }
    }

    const todo = await this.storage.update(todoId, { status });

    if (todo) {
      this.emit('statusChanged', { todo, status });
      this.emit('todoUpdated', { todo });
    }

    return todo;
  }

  /**
   * Mark todo as in-progress
   *
   * @param {string} todoId - Todo ID
   * @returns {Promise<Object | null>}
   */
  async markInProgress(todoId) {
    return this.setStatus(todoId, TodoStatus.IN_PROGRESS);
  }

  /**
   * Mark todo as completed
   *
   * @param {string} todoId - Todo ID
   * @returns {Promise<Object | null>}
   */
  async markCompleted(todoId) {
    return this.setStatus(todoId, TodoStatus.COMPLETED);
  }

  /**
   * Mark todo as pending
   *
   * @param {string} todoId - Todo ID
   * @returns {Promise<Object | null>}
   */
  async markPending(todoId) {
    return this.setStatus(todoId, TodoStatus.PENDING);
  }

  /**
   * Update todo content
   *
   * @param {string} todoId - Todo ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object | null>}
   */
  async update(todoId, updates) {
    if (updates.content && updates.content.length < MIN_CONTENT_LENGTH) {
      throw new Error('Todo content is required');
    }

    if (updates.activeForm && updates.activeForm.length < MIN_CONTENT_LENGTH) {
      throw new Error('Todo activeForm is required');
    }

    if (updates.status) {
      // Use setStatus for status changes to enforce constraints
      await this.setStatus(todoId, updates.status);
      delete updates.status;
    }

    if (Object.keys(updates).length === 0) {
      return this.storage.getById(todoId);
    }

    const todo = await this.storage.update(todoId, updates);

    if (todo) {
      this.emit('todoUpdated', { todo });
    }

    return todo;
  }

  /**
   * Remove a todo
   *
   * @param {string} todoId - Todo ID
   * @returns {Promise<boolean>}
   */
  async remove(todoId) {
    const removed = await this.storage.remove(todoId);

    if (removed) {
      this.emit('todoRemoved', { todoId });
    }

    return removed;
  }

  /**
   * Get all todos
   *
   * @param {Object} [options] - Filter options
   * @returns {Promise<Object[]>}
   */
  async getAll(options = {}) {
    return this.storage.getAll(options);
  }

  /**
   * Get todo by ID
   *
   * @param {string} todoId - Todo ID
   * @returns {Promise<Object | null>}
   */
  async getById(todoId) {
    return this.storage.getById(todoId);
  }

  /**
   * Get current in-progress todo
   *
   * @returns {Promise<Object | null>}
   */
  async getCurrentTask() {
    const inProgress = await this.storage.getAll({ status: TodoStatus.IN_PROGRESS });
    return inProgress[0] || null;
  }

  /**
   * Get next pending todo
   *
   * @returns {Promise<Object | null>}
   */
  async getNextTask() {
    const pending = await this.storage.getAll({ status: TodoStatus.PENDING });
    return pending[0] || null;
  }

  /**
   * Start next task (mark first pending as in-progress)
   *
   * @returns {Promise<Object | null>}
   */
  async startNextTask() {
    // Check if already have in-progress
    const current = await this.getCurrentTask();
    if (current) {
      throw new Error('Already have a task in progress. Complete it first.');
    }

    const next = await this.getNextTask();
    if (!next) {
      return null;
    }

    return this.markInProgress(next.id);
  }

  /**
   * Complete current task and start next
   *
   * @returns {Promise<Object | null>}
   */
  async completeAndStartNext() {
    const current = await this.getCurrentTask();
    if (current) {
      await this.markCompleted(current.id);
    }

    return this.startNextTask();
  }

  /**
   * Clear all todos
   *
   * @returns {Promise<void>}
   */
  async clear() {
    await this.storage.clear();
    this.emit('todosReplaced', { todos: [] });
  }

  /**
   * Archive completed todos
   *
   * @returns {Promise<number>}
   */
  async archiveCompleted() {
    return this.storage.archiveCompleted();
  }

  /**
   * Get statistics
   *
   * @returns {Promise<Object>}
   */
  async getStats() {
    return this.storage.getStats();
  }

  /**
   * Format todos for display
   *
   * @returns {Promise<string>}
   */
  async format() {
    const todos = await this.getAll();

    if (todos.length === 0) {
      return 'No todos.';
    }

    const lines = todos.map((todo, index) => {
      const statusIcon = this.getStatusIcon(todo.status);
      const display = todo.status === TodoStatus.IN_PROGRESS ? todo.activeForm : todo.content;
      return `${statusIcon} ${index + 1}. ${display}`;
    });

    return lines.join('\n');
  }

  /**
   * Get status icon
   *
   * @param {TodoStatus} status - Todo status
   * @returns {string}
   */
  getStatusIcon(status) {
    switch (status) {
      case TodoStatus.PENDING:
        return '○';
      case TodoStatus.IN_PROGRESS:
        return '◐';
      case TodoStatus.COMPLETED:
        return '●';
      default:
        return '?';
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create todo manager instance
 *
 * @param {Object} [options] - Manager options
 * @returns {TodoManager}
 */
export function getTodoManager(options = {}) {
  if (!_instance) {
    _instance = new TodoManager(options);
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetTodoManager() {
  _instance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Write todos (main API matching TodoWrite)
 *
 * @param {Object[]} todos - Todos to write
 * @returns {Promise<Object>}
 */
export async function writeTodos(todos) {
  const manager = getTodoManager();
  return manager.write(todos);
}

/**
 * Get current todos
 *
 * @returns {Promise<Object[]>}
 */
export async function getTodos() {
  const manager = getTodoManager();
  return manager.getAll();
}

/**
 * Get todo statistics
 *
 * @returns {Promise<Object>}
 */
export async function getTodoStats() {
  const manager = getTodoManager();
  return manager.getStats();
}

export { TodoStatus };

export default TodoManager;
