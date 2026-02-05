/**
 * Filesystem Utilities Tests
 * @module test/unit/utils/fs.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn(),
    rm: vi.fn(),
    copyFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn(),
    rm: vi.fn(),
    copyFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('Filesystem Utilities', () => {
  let fsUtils;
  let fsMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Import fresh modules
    fsMock = await import('fs');
    fsUtils = await import('../../../src/utils/fs.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureDir()', () => {
    it('should create directory with recursive option', async () => {
      await fsUtils.ensureDir('/test/path');
      expect(fsMock.promises.mkdir).toHaveBeenCalledWith('/test/path', { recursive: true });
    });

    it('should not throw if directory already exists (EEXIST)', async () => {
      const error = new Error('Directory exists');
      error.code = 'EEXIST';
      fsMock.promises.mkdir.mockRejectedValueOnce(error);

      await expect(fsUtils.ensureDir('/existing')).resolves.not.toThrow();
    });

    it('should throw on other errors', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fsMock.promises.mkdir.mockRejectedValueOnce(error);

      await expect(fsUtils.ensureDir('/no-access')).rejects.toThrow('Permission denied');
    });
  });

  describe('ensureParentDir()', () => {
    it('should create parent directory of file', async () => {
      await fsUtils.ensureParentDir('/test/path/file.txt');
      expect(fsMock.promises.mkdir).toHaveBeenCalledWith('/test/path', { recursive: true });
    });
  });

  describe('safeRead()', () => {
    it('should read file content with default encoding', async () => {
      fsMock.promises.readFile.mockResolvedValueOnce('file content');

      const result = await fsUtils.safeRead('/test/file.txt');

      expect(result).toBe('file content');
      expect(fsMock.promises.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
    });

    it('should read file with custom encoding', async () => {
      fsMock.promises.readFile.mockResolvedValueOnce('content');

      await fsUtils.safeRead('/test/file.txt', 'ascii');

      expect(fsMock.promises.readFile).toHaveBeenCalledWith('/test/file.txt', 'ascii');
    });

    it('should return null if file does not exist', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fsMock.promises.readFile.mockRejectedValueOnce(error);

      const result = await fsUtils.safeRead('/nonexistent');

      expect(result).toBeNull();
    });

    it('should throw on other read errors', async () => {
      const error = new Error('Read error');
      error.code = 'EACCES';
      fsMock.promises.readFile.mockRejectedValueOnce(error);

      await expect(fsUtils.safeRead('/protected')).rejects.toThrow('Read error');
    });
  });

  describe('safeReadJson()', () => {
    it('should read and parse JSON file', async () => {
      fsMock.promises.readFile.mockResolvedValueOnce('{"key": "value"}');

      const result = await fsUtils.safeReadJson('/test/data.json');

      expect(result).toEqual({ key: 'value' });
    });

    it('should return default value if file does not exist', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fsMock.promises.readFile.mockRejectedValueOnce(error);

      const result = await fsUtils.safeReadJson('/nonexistent.json', { default: true });

      expect(result).toEqual({ default: true });
    });

    it('should return default value for invalid JSON', async () => {
      fsMock.promises.readFile.mockResolvedValueOnce('invalid json {');

      const result = await fsUtils.safeReadJson('/invalid.json', []);

      expect(result).toEqual([]);
    });

    it('should return null as default value if not specified', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fsMock.promises.readFile.mockRejectedValueOnce(error);

      const result = await fsUtils.safeReadJson('/nonexistent.json');

      expect(result).toBeNull();
    });
  });

  describe('safeWrite()', () => {
    it('should write file with default encoding', async () => {
      await fsUtils.safeWrite('/test/file.txt', 'content');

      expect(fsMock.promises.mkdir).toHaveBeenCalled();
      expect(fsMock.promises.writeFile).toHaveBeenCalledWith('/test/file.txt', 'content', 'utf-8');
    });

    it('should write file with custom encoding', async () => {
      await fsUtils.safeWrite('/test/file.txt', 'content', 'ascii');

      expect(fsMock.promises.writeFile).toHaveBeenCalledWith('/test/file.txt', 'content', 'ascii');
    });
  });

  describe('safeWriteJson()', () => {
    it('should write JSON with default indentation', async () => {
      await fsUtils.safeWriteJson('/test/data.json', { key: 'value' });

      expect(fsMock.promises.writeFile).toHaveBeenCalledWith(
        '/test/data.json',
        '{\n  "key": "value"\n}\n',
        'utf-8'
      );
    });

    it('should write JSON with custom indentation', async () => {
      await fsUtils.safeWriteJson('/test/data.json', { a: 1 }, 4);

      expect(fsMock.promises.writeFile).toHaveBeenCalledWith(
        '/test/data.json',
        '{\n    "a": 1\n}\n',
        'utf-8'
      );
    });
  });

  describe('exists()', () => {
    it('should return true if file exists', async () => {
      fsMock.promises.access.mockResolvedValueOnce(undefined);

      const result = await fsUtils.exists('/existing/file');

      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      fsMock.promises.access.mockRejectedValueOnce(new Error('Not found'));

      const result = await fsUtils.exists('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('isDirectory()', () => {
    it('should return true for directories', async () => {
      fsMock.promises.stat.mockResolvedValueOnce({
        isDirectory: () => true
      });

      const result = await fsUtils.isDirectory('/test/dir');

      expect(result).toBe(true);
    });

    it('should return false for files', async () => {
      fsMock.promises.stat.mockResolvedValueOnce({
        isDirectory: () => false
      });

      const result = await fsUtils.isDirectory('/test/file.txt');

      expect(result).toBe(false);
    });

    it('should return false if path does not exist', async () => {
      fsMock.promises.stat.mockRejectedValueOnce(new Error('Not found'));

      const result = await fsUtils.isDirectory('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('isFile()', () => {
    it('should return true for files', async () => {
      fsMock.promises.stat.mockResolvedValueOnce({
        isFile: () => true
      });

      const result = await fsUtils.isFile('/test/file.txt');

      expect(result).toBe(true);
    });

    it('should return false for directories', async () => {
      fsMock.promises.stat.mockResolvedValueOnce({
        isFile: () => false
      });

      const result = await fsUtils.isFile('/test/dir');

      expect(result).toBe(false);
    });

    it('should return false if path does not exist', async () => {
      fsMock.promises.stat.mockRejectedValueOnce(new Error('Not found'));

      const result = await fsUtils.isFile('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getFileSize()', () => {
    it('should return file size', async () => {
      fsMock.promises.stat.mockResolvedValueOnce({ size: 1024 });

      const result = await fsUtils.getFileSize('/test/file.txt');

      expect(result).toBe(1024);
    });

    it('should return null if file does not exist', async () => {
      fsMock.promises.stat.mockRejectedValueOnce(new Error('Not found'));

      const result = await fsUtils.getFileSize('/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listFiles()', () => {
    it('should list files in directory', async () => {
      fsMock.promises.readdir.mockResolvedValueOnce([
        { name: 'file1.txt', isDirectory: () => false, isFile: () => true },
        { name: 'file2.txt', isDirectory: () => false, isFile: () => true }
      ]);

      const result = await fsUtils.listFiles('/test/dir');

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('file1.txt');
      expect(result[1]).toContain('file2.txt');
    });

    it('should recursively list files', async () => {
      fsMock.promises.readdir
        .mockResolvedValueOnce([
          { name: 'file1.txt', isDirectory: () => false, isFile: () => true },
          { name: 'subdir', isDirectory: () => true, isFile: () => false }
        ])
        .mockResolvedValueOnce([
          { name: 'file2.txt', isDirectory: () => false, isFile: () => true }
        ]);

      const result = await fsUtils.listFiles('/test/dir', { recursive: true });

      expect(result).toHaveLength(2);
    });

    it('should filter files by pattern', async () => {
      fsMock.promises.readdir.mockResolvedValueOnce([
        { name: 'file1.txt', isDirectory: () => false, isFile: () => true },
        { name: 'file2.js', isDirectory: () => false, isFile: () => true }
      ]);

      const result = await fsUtils.listFiles('/test/dir', { filter: /\.txt$/ });

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('file1.txt');
    });
  });

  describe('safeDelete()', () => {
    it('should delete file and return true', async () => {
      fsMock.promises.unlink.mockResolvedValueOnce(undefined);

      const result = await fsUtils.safeDelete('/test/file.txt');

      expect(result).toBe(true);
      expect(fsMock.promises.unlink).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should return false if file does not exist', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fsMock.promises.unlink.mockRejectedValueOnce(error);

      const result = await fsUtils.safeDelete('/nonexistent');

      expect(result).toBe(false);
    });

    it('should throw on other delete errors', async () => {
      const error = new Error('Delete error');
      error.code = 'EACCES';
      fsMock.promises.unlink.mockRejectedValueOnce(error);

      await expect(fsUtils.safeDelete('/protected')).rejects.toThrow('Delete error');
    });
  });

  describe('safeDeleteDir()', () => {
    it('should delete directory recursively and return true', async () => {
      fsMock.promises.rm.mockResolvedValueOnce(undefined);

      const result = await fsUtils.safeDeleteDir('/test/dir');

      expect(result).toBe(true);
      expect(fsMock.promises.rm).toHaveBeenCalledWith('/test/dir', { recursive: true, force: true });
    });

    it('should return false if directory does not exist', async () => {
      const error = new Error('Dir not found');
      error.code = 'ENOENT';
      fsMock.promises.rm.mockRejectedValueOnce(error);

      const result = await fsUtils.safeDeleteDir('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('copyFile()', () => {
    it('should copy file to destination', async () => {
      await fsUtils.copyFile('/src/file.txt', '/dest/file.txt');

      expect(fsMock.promises.mkdir).toHaveBeenCalled();
      expect(fsMock.promises.copyFile).toHaveBeenCalledWith('/src/file.txt', '/dest/file.txt');
    });
  });

  describe('moveFile()', () => {
    it('should move file to destination', async () => {
      await fsUtils.moveFile('/src/file.txt', '/dest/file.txt');

      expect(fsMock.promises.mkdir).toHaveBeenCalled();
      expect(fsMock.promises.rename).toHaveBeenCalledWith('/src/file.txt', '/dest/file.txt');
    });
  });

  describe('getAbsolutePath()', () => {
    it('should resolve relative path to absolute', () => {
      const result = fsUtils.getAbsolutePath('test/file.txt', '/base');
      expect(result).toMatch(/test[\\/]file\.txt$/);
    });

    it('should return absolute path as-is', () => {
      const result = fsUtils.getAbsolutePath('/absolute/path');
      expect(result).toMatch(/absolute[\\/]path$/);
    });
  });
});
