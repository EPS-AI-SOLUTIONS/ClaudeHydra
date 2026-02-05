/**
 * Todo Storage
 *
 * Handles persistence of todo items to the filesystem.
 *
 * @module src/tasks/todo-storage
 */

import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_STORAGE_DIR = '.hydra/todos';
const TODO_FILE = 'current.json';
const ARCHIVE_FILE = 'archive.json';

/**
 * Todo status enum
 * @enum {string}
 */
export const TodoStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
};

// ============================================================================
// Todo Storage Class
// ============================================================================

/**
 * Todo Storage
 *
 * Manages todo item persistence with file-based storage.
 */
export class TodoStorage {
  /**
   * @param {Object} options - Storage options
   * @param {string} [options.storageDir] - Directory for todo files
   */
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.cwd(), DEFAULT_STORAGE_DIR);
    this.todoFile = path.join(this.storageDir, TODO_FILE);
    this.archiveFile = path.join(this.storageDir, ARCHIVE_FILE);
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
   * Generate a unique todo ID
   *
   * @returns {string}
   */
  generateTodoId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `todo-${timestamp}-${random}`;
  }

  /**
   * Load current todos
   *
   * @returns {Promise<Object>}
   */
  async load() {
    try {
      const content = await fs.readFile(this.todoFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return this.createEmptyState();
      }
      throw error;
    }
  }

  /**
   * Save todos to file
   *
   * @param {Object} state - Todo state
   * @returns {Promise<void>}
   */
  async save(state) {
    await this.ensureStorageDir();

    state.updatedAt = new Date().toISOString();
    await fs.writeFile(this.todoFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Create empty todo state
   *
   * @returns {Object}
   */
  createEmptyState() {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionId: this.generateSessionId(),
      todos: []
    };
  }

  /**
   * Generate session ID
   *
   * @returns {string}
   */
  generateSessionId() {
    return `session-${Date.now().toString(36)}`;
  }

  /**
   * Add a new todo
   *
   * @param {Object} todo - Todo item
   * @returns {Promise<Object>}
   */
  async add(todo) {
    const state = await this.load();

    const newTodo = {
      id: todo.id || this.generateTodoId(),
      content: todo.content,
      activeForm: todo.activeForm || todo.content,
      status: todo.status || TodoStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: todo.metadata || {}
    };

    state.todos.push(newTodo);
    await this.save(state);

    return newTodo;
  }

  /**
   * Update a todo
   *
   * @param {string} todoId - Todo ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object | null>}
   */
  async update(todoId, updates) {
    const state = await this.load();
    const index = state.todos.findIndex((t) => t.id === todoId);

    if (index === -1) {
      return null;
    }

    state.todos[index] = {
      ...state.todos[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.save(state);

    return state.todos[index];
  }

  /**
   * Remove a todo
   *
   * @param {string} todoId - Todo ID
   * @returns {Promise<boolean>}
   */
  async remove(todoId) {
    const state = await this.load();
    const initialLength = state.todos.length;

    state.todos = state.todos.filter((t) => t.id !== todoId);

    if (state.todos.length !== initialLength) {
      await this.save(state);
      return true;
    }

    return false;
  }

  /**
   * Get all todos
   *
   * @param {Object} [options] - Filter options
   * @param {TodoStatus} [options.status] - Filter by status
   * @returns {Promise<Object[]>}
   */
  async getAll(options = {}) {
    const state = await this.load();

    if (options.status) {
      return state.todos.filter((t) => t.status === options.status);
    }

    return state.todos;
  }

  /**
   * Get todo by ID
   *
   * @param {string} todoId - Todo ID
   * @returns {Promise<Object | null>}
   */
  async getById(todoId) {
    const state = await this.load();
    return state.todos.find((t) => t.id === todoId) || null;
  }

  /**
   * Replace all todos
   *
   * @param {Object[]} todos - New todo list
   * @returns {Promise<Object>}
   */
  async replaceAll(todos) {
    const state = await this.load();

    state.todos = todos.map((todo, index) => ({
      id: todo.id || this.generateTodoId(),
      content: todo.content,
      activeForm: todo.activeForm || todo.content,
      status: todo.status || TodoStatus.PENDING,
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: index,
      metadata: todo.metadata || {}
    }));

    await this.save(state);

    return state;
  }

  /**
   * Clear all todos
   *
   * @returns {Promise<void>}
   */
  async clear() {
    const state = this.createEmptyState();
    await this.save(state);
  }

  /**
   * Archive completed todos
   *
   * @returns {Promise<number>} Number of archived todos
   */
  async archiveCompleted() {
    const state = await this.load();
    const completed = state.todos.filter((t) => t.status === TodoStatus.COMPLETED);

    if (completed.length === 0) {
      return 0;
    }

    // Load or create archive
    let archive;
    try {
      const content = await fs.readFile(this.archiveFile, 'utf-8');
      archive = JSON.parse(content);
    } catch (error) {
      archive = {
        version: '1.0.0',
        sessions: []
      };
    }

    // Add archived session
    archive.sessions.push({
      sessionId: state.sessionId,
      archivedAt: new Date().toISOString(),
      todos: completed.map((t) => ({
        ...t,
        archivedAt: new Date().toISOString()
      }))
    });

    // Save archive
    await this.ensureStorageDir();
    await fs.writeFile(this.archiveFile, JSON.stringify(archive, null, 2), 'utf-8');

    // Remove completed from current
    state.todos = state.todos.filter((t) => t.status !== TodoStatus.COMPLETED);
    await this.save(state);

    return completed.length;
  }

  /**
   * Get archive
   *
   * @param {Object} [options] - Options
   * @param {number} [options.limit] - Limit sessions returned
   * @returns {Promise<Object>}
   */
  async getArchive(options = {}) {
    try {
      const content = await fs.readFile(this.archiveFile, 'utf-8');
      const archive = JSON.parse(content);

      if (options.limit) {
        archive.sessions = archive.sessions.slice(-options.limit);
      }

      return archive;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { version: '1.0.0', sessions: [] };
      }
      throw error;
    }
  }

  /**
   * Get statistics
   *
   * @returns {Promise<Object>}
   */
  async getStats() {
    const state = await this.load();

    const stats = {
      total: state.todos.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      sessionId: state.sessionId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt
    };

    for (const todo of state.todos) {
      switch (todo.status) {
        case TodoStatus.PENDING:
          stats.pending++;
          break;
        case TodoStatus.IN_PROGRESS:
          stats.inProgress++;
          break;
        case TodoStatus.COMPLETED:
          stats.completed++;
          break;
      }
    }

    return stats;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance = null;

/**
 * Get or create todo storage instance
 *
 * @param {Object} [options] - Storage options
 * @returns {TodoStorage}
 */
export function getTodoStorage(options = {}) {
  if (!_instance) {
    _instance = new TodoStorage(options);
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetTodoStorage() {
  _instance = null;
}

export default TodoStorage;
