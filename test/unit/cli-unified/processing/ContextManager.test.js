/**
 * Tests for ContextManager
 * @module test/unit/cli-unified/processing/ContextManager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  watch: vi.fn(),
}));

// Mock path module
vi.mock('path', () => ({
  basename: vi.fn((p) => p.split(/[\\/]/).pop()),
  extname: vi.fn((p) => {
    const match = p.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }),
  resolve: vi.fn((...args) => args.join('/').replace(/\\/g, '/')),
}));

// Mock EventBus
vi.mock('../../../../src/cli-unified/core/EventBus.js', () => ({
  eventBus: { emit: vi.fn() },
  EVENT_TYPES: {
    CONTEXT_ADD: 'context:add',
    CONTEXT_REMOVE: 'context:remove',
    CONTEXT_CLEAR: 'context:clear',
  },
}));

import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { eventBus } from '../../../../src/cli-unified/core/EventBus.js';
import {
  ContextManager,
  createContextManager,
} from '../../../../src/cli-unified/processing/ContextManager.js';

describe('ContextManager Module', () => {
  let manager;
  let mockWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ContextManager();

    mockWatcher = {
      close: vi.fn(),
    };
    watch.mockReturnValue(mockWatcher);
  });

  afterEach(() => {
    manager.clear();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      expect(manager.files).toBeInstanceOf(Map);
      expect(manager.urls).toBeInstanceOf(Map);
      expect(manager.watchers).toBeInstanceOf(Map);
      expect(manager.maxFileSize).toBe(100 * 1024);
      expect(manager.maxTotalSize).toBe(500 * 1024);
      expect(manager.currentSize).toBe(0);
    });

    it('should accept custom options', () => {
      const custom = new ContextManager({
        maxFileSize: 50 * 1024,
        maxTotalSize: 200 * 1024,
      });

      expect(custom.maxFileSize).toBe(50 * 1024);
      expect(custom.maxTotalSize).toBe(200 * 1024);
    });

    it('should extend EventEmitter', () => {
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
    });
  });

  describe('addFile()', () => {
    it('should add file to context', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('file content');

      const result = manager.addFile('/path/to/file.js');

      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('name', 'file.js');
      expect(result).toHaveProperty('content', 'file content');
      expect(result).toHaveProperty('language', 'javascript');
      expect(result).toHaveProperty('size', 100);
      expect(manager.fileCount).toBe(1);
    });

    it('should throw if file not found', () => {
      existsSync.mockReturnValue(false);

      expect(() => manager.addFile('/nonexistent.js')).toThrow('File not found');
    });

    it('should throw if not a file', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => false,
        size: 100,
      });

      expect(() => manager.addFile('/directory')).toThrow('Not a file');
    });

    it('should throw if file too large', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 200 * 1024, // Larger than default max
      });

      expect(() => manager.addFile('/large.js')).toThrow('File too large');
    });

    it('should throw if total context size exceeded', () => {
      // First file: 80KB (under maxFileSize of 100KB)
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 80 * 1024,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('x'.repeat(80 * 1024));

      manager.addFile('/file1.js');

      // Adjust maxTotalSize to be near limit
      manager.maxTotalSize = 100 * 1024;

      // Second file: 50KB - would exceed total of 100KB
      statSync.mockReturnValue({
        isFile: () => true,
        size: 50 * 1024,
        mtime: new Date(),
      });

      expect(() => manager.addFile('/file2.js')).toThrow('Total context size exceeded');
    });

    it('should detect language from extension', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      const js = manager.addFile('/test.js');
      expect(js.language).toBe('javascript');

      manager.clear();
      const py = manager.addFile('/test.py');
      expect(py.language).toBe('python');

      manager.clear();
      const ts = manager.addFile('/test.ts');
      expect(ts.language).toBe('typescript');
    });

    it('should watch file if requested', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js', { watch: true });

      expect(watch).toHaveBeenCalled();
      expect(manager.watchers.size).toBe(1);
    });

    it('should emit events', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      const fileAddedSpy = vi.fn();
      manager.on('fileAdded', fileAddedSpy);

      manager.addFile('/test.js');

      expect(eventBus.emit).toHaveBeenCalledWith('context:add', expect.any(Object));
      expect(fileAddedSpy).toHaveBeenCalled();
    });
  });

  describe('addUrl()', () => {
    it('should add URL content to context', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => 'text/html',
        },
        text: () => Promise.resolve('<html>content</html>'),
      });

      const result = await manager.addUrl('https://example.com');

      expect(result).toHaveProperty('url', 'https://example.com');
      expect(result).toHaveProperty('content', '<html>content</html>');
      expect(result).toHaveProperty('contentType', 'text/html');
      expect(manager.urlCount).toBe(1);
    });

    it('should handle JSON content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => 'application/json',
        },
        json: () => Promise.resolve({ key: 'value' }),
      });

      const result = await manager.addUrl('https://api.example.com/data');

      expect(result.content).toContain('"key"');
      expect(result.content).toContain('"value"');
    });

    it('should throw on HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(manager.addUrl('https://example.com/notfound')).rejects.toThrow(
        'Failed to fetch URL',
      );
    });

    it('should truncate large content', async () => {
      const largeContent = 'x'.repeat(200 * 1024);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => 'text/plain',
        },
        text: () => Promise.resolve(largeContent),
      });

      const result = await manager.addUrl('https://example.com/large');

      expect(result.content.length).toBe(manager.maxFileSize);
    });

    it('should emit events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('content'),
      });

      const urlAddedSpy = vi.fn();
      manager.on('urlAdded', urlAddedSpy);

      await manager.addUrl('https://example.com');

      expect(eventBus.emit).toHaveBeenCalledWith('context:add', expect.any(Object));
      expect(urlAddedSpy).toHaveBeenCalled();
    });
  });

  describe('watchFile()', () => {
    it('should start watching file', () => {
      manager.watchFile('/test.js');

      expect(watch).toHaveBeenCalledWith('/test.js', expect.any(Function));
      expect(manager.watchers.has('/test.js')).toBe(true);
    });

    it('should not duplicate watchers', () => {
      manager.watchFile('/test.js');
      manager.watchFile('/test.js');

      expect(watch).toHaveBeenCalledTimes(1);
    });

    it('should emit watchStarted event', () => {
      const spy = vi.fn();
      manager.on('watchStarted', spy);

      manager.watchFile('/test.js');

      expect(spy).toHaveBeenCalledWith('/test.js');
    });
  });

  describe('unwatchFile()', () => {
    it('should stop watching file', () => {
      manager.watchFile('/test.js');
      manager.unwatchFile('/test.js');

      expect(mockWatcher.close).toHaveBeenCalled();
      expect(manager.watchers.has('/test.js')).toBe(false);
    });

    it('should handle non-watched files', () => {
      // Should not throw
      manager.unwatchFile('/nonexistent.js');
    });

    it('should emit watchStopped event', () => {
      const spy = vi.fn();
      manager.on('watchStopped', spy);

      manager.watchFile('/test.js');
      manager.unwatchFile('/test.js');

      expect(spy).toHaveBeenCalledWith('/test.js');
    });
  });

  describe('refreshFile()', () => {
    it('should refresh file content', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('original content');

      manager.addFile('/test.js');

      readFileSync.mockReturnValue('updated content');
      statSync.mockReturnValue({
        isFile: () => true,
        size: 150,
        mtime: new Date(),
      });

      const result = manager.refreshFile('/test.js');

      expect(result.content).toBe('updated content');
      expect(result.size).toBe(150);
    });

    it('should return null for non-existent file', () => {
      const result = manager.refreshFile('/nonexistent.js');
      expect(result).toBeNull();
    });

    it('should emit fileRefreshed event', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js');

      const spy = vi.fn();
      manager.on('fileRefreshed', spy);

      manager.refreshFile('/test.js');

      expect(spy).toHaveBeenCalled();
    });

    it('should emit fileError on read failure', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js');

      readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const spy = vi.fn();
      manager.on('fileError', spy);

      const result = manager.refreshFile('/test.js');

      expect(result).toBeNull();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('removeFile()', () => {
    it('should remove file from context', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js');
      expect(manager.fileCount).toBe(1);

      const result = manager.removeFile('/test.js');

      expect(result).toBe(true);
      expect(manager.fileCount).toBe(0);
    });

    it('should return false for non-existent file', () => {
      const result = manager.removeFile('/nonexistent.js');
      expect(result).toBe(false);
    });

    it('should stop watching removed file', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js', { watch: true });
      manager.removeFile('/test.js');

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should emit events', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js');

      const spy = vi.fn();
      manager.on('fileRemoved', spy);

      manager.removeFile('/test.js');

      expect(eventBus.emit).toHaveBeenCalledWith('context:remove', expect.any(Object));
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('removeUrl()', () => {
    it('should remove URL from context', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('content'),
      });

      await manager.addUrl('https://example.com');
      expect(manager.urlCount).toBe(1);

      const result = manager.removeUrl('https://example.com');

      expect(result).toBe(true);
      expect(manager.urlCount).toBe(0);
    });

    it('should return false for non-existent URL', () => {
      const result = manager.removeUrl('https://nonexistent.com');
      expect(result).toBe(false);
    });

    it('should emit events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('content'),
      });

      await manager.addUrl('https://example.com');

      const spy = vi.fn();
      manager.on('urlRemoved', spy);

      manager.removeUrl('https://example.com');

      expect(eventBus.emit).toHaveBeenCalledWith('context:remove', expect.any(Object));
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('should clear all context', async () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('content'),
      });

      manager.addFile('/test.js', { watch: true });
      await manager.addUrl('https://example.com');

      manager.clear();

      expect(manager.fileCount).toBe(0);
      expect(manager.urlCount).toBe(0);
      expect(manager.watchers.size).toBe(0);
      expect(manager.currentSize).toBe(0);
    });

    it('should emit events', () => {
      const spy = vi.fn();
      manager.on('cleared', spy);

      manager.clear();

      expect(eventBus.emit).toHaveBeenCalledWith('context:clear');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getContextString()', () => {
    it('should format files and URLs', async () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('file content');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('url content'),
      });

      manager.addFile('/test.js');
      await manager.addUrl('https://example.com');

      const result = manager.getContextString();

      expect(result).toContain('FILE: test.js');
      expect(result).toContain('file content');
      expect(result).toContain('URL: https://example.com');
      expect(result).toContain('url content');
    });

    it('should return empty string for empty context', () => {
      const result = manager.getContextString();
      expect(result).toBe('');
    });
  });

  describe('getSummary()', () => {
    it('should return context summary', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js');

      const summary = manager.getSummary();

      expect(summary).toHaveProperty('files');
      expect(summary).toHaveProperty('urls');
      expect(summary).toHaveProperty('totalSize');
      expect(summary).toHaveProperty('maxSize');
      expect(summary.files).toHaveLength(1);
    });
  });

  describe('listFiles()', () => {
    it('should list all files', () => {
      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test1.js');
      manager.addFile('/test2.js');

      const files = manager.listFiles();

      expect(files).toHaveLength(2);
    });
  });

  describe('listUrls()', () => {
    it('should list all URLs', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('content'),
      });

      await manager.addUrl('https://example1.com');
      await manager.addUrl('https://example2.com');

      const urls = manager.listUrls();

      expect(urls).toHaveLength(2);
    });
  });

  describe('detectProjectType()', () => {
    it('should detect nodejs project', () => {
      existsSync.mockImplementation((path) => {
        return path.includes('package.json');
      });

      const types = manager.detectProjectType('/project');

      expect(types).toContain('nodejs');
    });

    it('should detect multiple project types', () => {
      existsSync.mockImplementation((path) => {
        return path.includes('package.json') || path.includes('.git');
      });

      const types = manager.detectProjectType('/project');

      expect(types).toContain('nodejs');
      expect(types).toContain('git');
    });

    it('should return empty for unknown project type', () => {
      existsSync.mockReturnValue(false);

      const types = manager.detectProjectType('/empty');

      expect(types).toEqual([]);
    });
  });

  describe('getters', () => {
    it('should return fileCount', () => {
      expect(manager.fileCount).toBe(0);
    });

    it('should return urlCount', () => {
      expect(manager.urlCount).toBe(0);
    });

    it('should return totalSize', () => {
      expect(manager.totalSize).toBe(0);
    });

    it('should return isEmpty', () => {
      expect(manager.isEmpty).toBe(true);

      existsSync.mockReturnValue(true);
      statSync.mockReturnValue({
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
      readFileSync.mockReturnValue('content');

      manager.addFile('/test.js');

      expect(manager.isEmpty).toBe(false);
    });
  });

  describe('createContextManager()', () => {
    it('should create ContextManager instance', () => {
      const cm = createContextManager();
      expect(cm).toBeInstanceOf(ContextManager);
    });

    it('should pass options', () => {
      const cm = createContextManager({ maxFileSize: 50 * 1024 });
      expect(cm.maxFileSize).toBe(50 * 1024);
    });
  });
});
