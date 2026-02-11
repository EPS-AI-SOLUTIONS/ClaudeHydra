/**
 * Tasks Module Tests
 * @module test/unit/tasks/index.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Tasks Module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Exports', () => {
    it('should export TodoStorage class and utilities', async () => {
      const tasks = await import('../../../src/tasks/index.js');

      expect(tasks.TodoStorage).toBeDefined();
      expect(tasks.TodoStatus).toBeDefined();
      expect(tasks.getTodoStorage).toBeDefined();
      expect(tasks.resetTodoStorage).toBeDefined();
    });

    it('should export TodoManager class and utilities', async () => {
      const tasks = await import('../../../src/tasks/index.js');

      expect(tasks.TodoManager).toBeDefined();
      expect(tasks.getTodoManager).toBeDefined();
      expect(tasks.resetTodoManager).toBeDefined();
      expect(tasks.writeTodos).toBeDefined();
      expect(tasks.getTodos).toBeDefined();
      expect(tasks.getTodoStats).toBeDefined();
    });

    it('should export initTasks and shutdownTasks functions', async () => {
      const tasks = await import('../../../src/tasks/index.js');

      expect(tasks.initTasks).toBeDefined();
      expect(tasks.shutdownTasks).toBeDefined();
      expect(typeof tasks.initTasks).toBe('function');
      expect(typeof tasks.shutdownTasks).toBe('function');
    });

    it('should have default export with all utilities', async () => {
      const tasks = await import('../../../src/tasks/index.js');

      expect(tasks.default).toBeDefined();
      expect(tasks.default.TodoStorage).toBeDefined();
      expect(tasks.default.TodoManager).toBeDefined();
      expect(tasks.default.initTasks).toBeDefined();
      expect(tasks.default.shutdownTasks).toBeDefined();
    });
  });

  describe('initTasks', () => {
    it('should initialize tasks system with default options', async () => {
      const { initTasks, resetTodoStorage, resetTodoManager } = await import(
        '../../../src/tasks/index.js'
      );

      const result = await initTasks();

      expect(result).toBeDefined();
      expect(result.storage).toBeDefined();
      expect(result.manager).toBeDefined();

      // Cleanup
      resetTodoManager();
      resetTodoStorage();
    });

    it('should accept custom storage directory option', async () => {
      const { initTasks, resetTodoStorage, resetTodoManager } = await import(
        '../../../src/tasks/index.js'
      );

      const result = await initTasks({ storageDir: '/tmp/test-todos' });

      expect(result).toBeDefined();
      expect(result.storage).toBeDefined();
      expect(result.manager).toBeDefined();

      // Cleanup
      resetTodoManager();
      resetTodoStorage();
    });

    it('should return storage and manager objects', async () => {
      const { initTasks, resetTodoStorage, resetTodoManager } = await import(
        '../../../src/tasks/index.js'
      );

      const { storage, manager } = await initTasks();

      expect(storage).toHaveProperty('add');
      expect(storage).toHaveProperty('getById');
      expect(storage).toHaveProperty('getAll');
      expect(storage).toHaveProperty('update');
      expect(manager).toHaveProperty('write'); // TodoManager.write() is the main method

      // Cleanup
      resetTodoManager();
      resetTodoStorage();
    });
  });

  describe('shutdownTasks', () => {
    it('should shutdown tasks system without errors', async () => {
      const { initTasks, shutdownTasks } = await import('../../../src/tasks/index.js');

      // Initialize first
      await initTasks();

      // Shutdown should not throw
      await expect(shutdownTasks()).resolves.not.toThrow();
    });

    it('should be safe to call multiple times', async () => {
      const { shutdownTasks } = await import('../../../src/tasks/index.js');

      // Multiple calls should not throw
      await expect(shutdownTasks()).resolves.not.toThrow();
      await expect(shutdownTasks()).resolves.not.toThrow();
    });
  });

  describe('TodoStatus', () => {
    it('should have correct status values', async () => {
      const { TodoStatus } = await import('../../../src/tasks/index.js');

      expect(TodoStatus.PENDING).toBe('pending');
      expect(TodoStatus.IN_PROGRESS).toBe('in_progress');
      expect(TodoStatus.COMPLETED).toBe('completed');
    });
  });
});
