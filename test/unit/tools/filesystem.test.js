/**
 * Filesystem Tools Tests
 * @module test/unit/tools/filesystem.test
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs module
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    rm: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock fs utils
vi.mock('../../../src/utils/fs.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
  ensureParentDir: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
  isDirectory: vi.fn().mockResolvedValue(false),
  isFile: vi.fn().mockResolvedValue(true),
}));

import { FileNotFoundError, ValidationError } from '../../../src/errors/AppError.js';
import {
  DeleteFileTool,
  ListDirectoryTool,
  PathResolver,
  ReadFileTool,
  tools,
  WriteFileTool,
} from '../../../src/tools/filesystem.js';
import { ensureDir, exists } from '../../../src/utils/fs.js';

describe('Filesystem Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // PathResolver Tests
  // ===========================================================================

  describe('PathResolver', () => {
    let resolver;

    beforeEach(() => {
      resolver = new PathResolver('/project');
    });

    describe('resolve()', () => {
      it('should resolve relative path within root', () => {
        const result = resolver.resolve('src/index.js');
        expect(result).toBe(path.resolve('/project', 'src/index.js'));
      });

      it('should resolve nested paths', () => {
        const result = resolver.resolve('src/components/Button.js');
        expect(result).toContain('src');
        expect(result).toContain('Button.js');
      });

      it('should throw ValidationError for path traversal attempt', () => {
        expect(() => resolver.resolve('../../../etc/passwd')).toThrow(ValidationError);
      });

      it('should throw ValidationError for absolute path outside root', () => {
        expect(() => resolver.resolve('/etc/passwd')).toThrow(ValidationError);
      });

      it('should allow resolving root path itself', () => {
        const result = resolver.resolve('.');
        // On Windows this will be C:\project, on Unix /project
        expect(result).toBe(path.resolve('/project'));
      });

      it('should normalize path with redundant segments', () => {
        const result = resolver.resolve('src/../src/index.js');
        expect(result).toContain('src');
        expect(result).toContain('index.js');
      });
    });

    describe('toRelative()', () => {
      it('should convert absolute path to relative', () => {
        const result = resolver.toRelative('/project/src/index.js');
        expect(result).toBe(path.join('src', 'index.js'));
      });

      it('should return empty string for root path', () => {
        const result = resolver.toRelative('/project');
        expect(result).toBe('');
      });
    });
  });

  // ===========================================================================
  // ListDirectoryTool Tests
  // ===========================================================================

  describe('ListDirectoryTool', () => {
    let tool;

    beforeEach(() => {
      tool = new ListDirectoryTool();
    });

    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('list_directory');
        expect(tool.description).toContain('List contents');
      });
    });

    describe('run()', () => {
      it('should list directory contents', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => true });
        fs.readdir.mockResolvedValue([
          { name: 'file1.js', isDirectory: () => false },
          { name: 'folder', isDirectory: () => true },
        ]);
        fs.stat.mockImplementation((path) => {
          if (path.includes('file1')) {
            return Promise.resolve({
              isDirectory: () => false,
              size: 1024,
              mtime: new Date('2024-01-01'),
            });
          }
          return Promise.resolve({ isDirectory: () => true });
        });

        const result = await tool.run({
          path: '.',
          recursive: false,
          includeHidden: false,
          maxDepth: 3,
        });

        expect(result.path).toBe('.');
        expect(result.items).toBeInstanceOf(Array);
        expect(result.itemCount).toBeGreaterThanOrEqual(0);
      });

      it('should throw FileNotFoundError for non-existent directory', async () => {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        fs.stat.mockRejectedValue(error);

        await expect(
          tool.run({
            path: 'nonexistent',
            recursive: false,
            includeHidden: false,
            maxDepth: 3,
          }),
        ).rejects.toThrow(FileNotFoundError);
      });

      it('should throw ValidationError for file path', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => false });

        await expect(
          tool.run({
            path: 'file.txt',
            recursive: false,
            includeHidden: false,
            maxDepth: 3,
          }),
        ).rejects.toThrow(ValidationError);
      });

      it('should skip hidden files when includeHidden is false', async () => {
        // First call checks if it's a directory, subsequent calls are for file stats
        let isFirstCall = true;
        fs.stat.mockImplementation(() => {
          if (isFirstCall) {
            isFirstCall = false;
            return Promise.resolve({ isDirectory: () => true });
          }
          return Promise.resolve({
            isDirectory: () => false,
            size: 100,
            mtime: new Date(),
          });
        });
        fs.readdir.mockResolvedValue([
          { name: '.hidden', isDirectory: () => false },
          { name: 'visible.js', isDirectory: () => false },
        ]);

        const result = await tool.run({
          path: '.',
          recursive: false,
          includeHidden: false,
          maxDepth: 3,
        });

        const names = result.items.map((i) => i.name);
        expect(names).not.toContain('.hidden');
        expect(names).toContain('visible.js');
      });

      it('should include hidden files when includeHidden is true', async () => {
        // First call checks if it's a directory, subsequent calls are for file stats
        let isFirstCall = true;
        fs.stat.mockImplementation(() => {
          if (isFirstCall) {
            isFirstCall = false;
            return Promise.resolve({ isDirectory: () => true });
          }
          return Promise.resolve({
            isDirectory: () => false,
            size: 100,
            mtime: new Date(),
          });
        });
        fs.readdir.mockResolvedValue([
          { name: '.hidden', isDirectory: () => false },
          { name: 'visible.js', isDirectory: () => false },
        ]);

        const result = await tool.run({
          path: '.',
          recursive: false,
          includeHidden: true,
          maxDepth: 3,
        });

        const names = result.items.map((i) => i.name);
        expect(names).toContain('.hidden');
        expect(names).toContain('visible.js');
      });

      it('should recurse into subdirectories when recursive is true', async () => {
        let readdirCallCount = 0;
        // First stat call checks if root is a directory
        let isFirstStatCall = true;
        fs.stat.mockImplementation(() => {
          if (isFirstStatCall) {
            isFirstStatCall = false;
            return Promise.resolve({ isDirectory: () => true });
          }
          return Promise.resolve({
            isDirectory: () => false,
            size: 100,
            mtime: new Date(),
          });
        });
        fs.readdir.mockImplementation(() => {
          readdirCallCount++;
          if (readdirCallCount === 1) {
            return Promise.resolve([{ name: 'subdir', isDirectory: () => true }]);
          }
          return Promise.resolve([{ name: 'nested.js', isDirectory: () => false }]);
        });

        const result = await tool.run({
          path: '.',
          recursive: true,
          includeHidden: false,
          maxDepth: 3,
        });

        expect(result.items.length).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================================================
  // ReadFileTool Tests
  // ===========================================================================

  describe('ReadFileTool', () => {
    let tool;

    beforeEach(() => {
      tool = new ReadFileTool();
    });

    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('read_file');
        expect(tool.description).toContain('Read file');
      });
    });

    describe('run()', () => {
      it('should read file content', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => false });
        fs.readFile.mockResolvedValue('file content');

        const result = await tool.run({
          path: 'test.txt',
          encoding: 'utf8',
          maxSize: 1000000,
        });

        expect(result.path).toBe('test.txt');
        expect(result.content).toBe('file content');
        expect(result.encoding).toBe('utf8');
        expect(result.truncated).toBe(false);
      });

      it('should throw FileNotFoundError for non-existent file', async () => {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        fs.stat.mockRejectedValue(error);

        await expect(
          tool.run({
            path: 'nonexistent.txt',
            encoding: 'utf8',
            maxSize: 1000000,
          }),
        ).rejects.toThrow(FileNotFoundError);
      });

      it('should throw ValidationError for directory path', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => true });

        await expect(
          tool.run({
            path: 'some-dir',
            encoding: 'utf8',
            maxSize: 1000000,
          }),
        ).rejects.toThrow(ValidationError);
      });

      it('should truncate content exceeding maxSize', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => false });
        fs.readFile.mockResolvedValue('a'.repeat(1000));

        const result = await tool.run({
          path: 'large.txt',
          encoding: 'utf8',
          maxSize: 100,
        });

        expect(result.truncated).toBe(true);
        expect(result.content.length).toBe(100);
      });

      it('should handle binary encoding as base64', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => false });
        fs.readFile.mockResolvedValue(Buffer.from([0x00, 0x01, 0x02]));

        const result = await tool.run({
          path: 'binary.bin',
          encoding: 'binary',
          maxSize: 1000000,
        });

        expect(result.encoding).toBe('binary');
        // Base64 of [0x00, 0x01, 0x02] is 'AAEC'
        expect(result.content).toBe('AAEC');
      });

      it('should rethrow non-ENOENT errors', async () => {
        const error = new Error('Permission denied');
        error.code = 'EPERM';
        fs.stat.mockRejectedValue(error);

        await expect(
          tool.run({
            path: 'forbidden.txt',
            encoding: 'utf8',
            maxSize: 1000000,
          }),
        ).rejects.toThrow('Permission denied');
      });
    });
  });

  // ===========================================================================
  // WriteFileTool Tests
  // ===========================================================================

  describe('WriteFileTool', () => {
    let tool;

    beforeEach(() => {
      tool = new WriteFileTool();
    });

    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('write_file');
        expect(tool.description).toContain('Write content');
      });
    });

    describe('run()', () => {
      it('should write file content', async () => {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        fs.access.mockRejectedValue(error);
        fs.writeFile.mockResolvedValue(undefined);
        fs.stat.mockResolvedValue({
          size: 12,
          mtime: new Date('2024-01-01'),
        });

        const result = await tool.run({
          path: 'new-file.txt',
          content: 'file content',
          createDirs: false,
          overwrite: false,
        });

        expect(result.path).toBe('new-file.txt');
        expect(result.size).toBe(12);
        expect(fs.writeFile).toHaveBeenCalled();
      });

      it('should throw ValidationError when file exists and overwrite is false', async () => {
        fs.access.mockResolvedValue(undefined);

        await expect(
          tool.run({
            path: 'existing.txt',
            content: 'new content',
            createDirs: false,
            overwrite: false,
          }),
        ).rejects.toThrow(ValidationError);
      });

      it('should overwrite file when overwrite is true', async () => {
        fs.access.mockResolvedValue(undefined);
        fs.writeFile.mockResolvedValue(undefined);
        fs.stat.mockResolvedValue({
          size: 11,
          mtime: new Date('2024-01-01'),
        });

        const result = await tool.run({
          path: 'existing.txt',
          content: 'new content',
          createDirs: false,
          overwrite: true,
        });

        expect(result.path).toBe('existing.txt');
        expect(fs.writeFile).toHaveBeenCalled();
      });

      it('should create directories when createDirs is true', async () => {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        fs.access.mockRejectedValue(error);
        fs.writeFile.mockResolvedValue(undefined);
        fs.stat.mockResolvedValue({
          size: 7,
          mtime: new Date('2024-01-01'),
        });

        await tool.run({
          path: 'new/dir/file.txt',
          content: 'content',
          createDirs: true,
          overwrite: false,
        });

        expect(ensureDir).toHaveBeenCalled();
      });

      it('should throw ValidationError when directory does not exist and createDirs is false', async () => {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        fs.access.mockRejectedValue(error);
        exists.mockResolvedValue(false);

        await expect(
          tool.run({
            path: 'nonexistent/file.txt',
            content: 'content',
            createDirs: false,
            overwrite: false,
          }),
        ).rejects.toThrow(ValidationError);
      });

      it('should rethrow non-ENOENT errors from access check', async () => {
        const error = new Error('Permission denied');
        error.code = 'EPERM';
        fs.access.mockRejectedValue(error);

        await expect(
          tool.run({
            path: 'file.txt',
            content: 'content',
            createDirs: false,
            overwrite: false,
          }),
        ).rejects.toThrow('Permission denied');
      });
    });
  });

  // ===========================================================================
  // DeleteFileTool Tests
  // ===========================================================================

  describe('DeleteFileTool', () => {
    let tool;

    beforeEach(() => {
      tool = new DeleteFileTool();
    });

    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('delete_file');
        expect(tool.description).toContain('Delete');
      });
    });

    describe('run()', () => {
      it('should delete a file', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => false });
        fs.unlink.mockResolvedValue(undefined);

        const result = await tool.run({
          path: 'file.txt',
          recursive: false,
        });

        expect(result.path).toBe('file.txt');
        expect(result.type).toBe('file');
        expect(result.deleted).toBe(true);
        expect(fs.unlink).toHaveBeenCalled();
      });

      it('should throw FileNotFoundError for non-existent path', async () => {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        fs.stat.mockRejectedValue(error);

        await expect(
          tool.run({
            path: 'nonexistent.txt',
            recursive: false,
          }),
        ).rejects.toThrow(FileNotFoundError);
      });

      it('should throw ValidationError for directory without recursive flag', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => true });

        await expect(
          tool.run({
            path: 'some-dir',
            recursive: false,
          }),
        ).rejects.toThrow(ValidationError);
      });

      it('should delete directory recursively when recursive is true', async () => {
        fs.stat.mockResolvedValue({ isDirectory: () => true });
        fs.rm.mockResolvedValue(undefined);

        const result = await tool.run({
          path: 'some-dir',
          recursive: true,
        });

        expect(result.path).toBe('some-dir');
        expect(result.type).toBe('directory');
        expect(result.deleted).toBe(true);
        expect(fs.rm).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
      });

      it('should rethrow non-ENOENT errors', async () => {
        const error = new Error('Permission denied');
        error.code = 'EPERM';
        fs.stat.mockRejectedValue(error);

        await expect(
          tool.run({
            path: 'forbidden.txt',
            recursive: false,
          }),
        ).rejects.toThrow('Permission denied');
      });
    });
  });

  // ===========================================================================
  // Tools Export Tests
  // ===========================================================================

  describe('tools export', () => {
    it('should export all tool instances', () => {
      expect(tools.listDirectory).toBeInstanceOf(ListDirectoryTool);
      expect(tools.readFile).toBeInstanceOf(ReadFileTool);
      expect(tools.writeFile).toBeInstanceOf(WriteFileTool);
      expect(tools.deleteFile).toBeInstanceOf(DeleteFileTool);
    });
  });
});
