/**
 * Filesystem Tools - Refactored with BaseTool architecture
 * Provides secure file operations with path traversal protection
 * @module tools/filesystem
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { FileNotFoundError, ValidationError } from '../errors/AppError.js';
import {
  deleteFileSchema,
  listDirectorySchema,
  readFileSchema,
  writeFileSchema,
} from '../schemas/tools.js';
import { ensureDir, exists } from '../utils/fs.js';
import { BaseTool } from './base-tool.js';

/**
 * Security utility - resolves and validates paths
 */
class PathResolver {
  constructor(rootDir = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * Resolve a relative path safely within the root directory
   * @param {string} relativePath - Path to resolve
   * @returns {string} Resolved absolute path
   * @throws {ValidationError} If path escapes root
   */
  resolve(relativePath) {
    // Normalize and resolve
    const normalizedPath = path.normalize(relativePath);
    const resolvedPath = path.resolve(this.rootDir, normalizedPath);

    // Verify path is within root
    if (!resolvedPath.startsWith(this.rootDir + path.sep) && resolvedPath !== this.rootDir) {
      throw new ValidationError(
        `Access denied: Path '${relativePath}' resolves outside project root`,
      );
    }

    return resolvedPath;
  }

  /**
   * Get relative path from absolute
   */
  toRelative(absolutePath) {
    return path.relative(this.rootDir, absolutePath);
  }
}

// Shared path resolver instance
const pathResolver = new PathResolver();

/**
 * List Directory Tool
 */
class ListDirectoryTool extends BaseTool {
  constructor() {
    super({
      name: 'list_directory',
      description: 'List contents of a directory with optional recursive listing',
      inputSchema: listDirectorySchema,
      timeoutMs: 30000,
    });
  }

  async run({ path: dirPath, recursive, includeHidden, maxDepth }) {
    const safePath = pathResolver.resolve(dirPath);

    // Check existence
    try {
      const stats = await fs.stat(safePath);
      if (!stats.isDirectory()) {
        throw new ValidationError(`Path '${dirPath}' is not a directory`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(`Directory not found: ${dirPath}`);
      }
      throw error;
    }

    // List contents
    const items = await this.listDir(safePath, {
      recursive,
      includeHidden,
      maxDepth,
      currentDepth: 0,
      basePath: safePath,
    });

    return {
      path: dirPath,
      itemCount: items.length,
      items,
    };
  }

  async listDir(dirPath, options) {
    const { recursive, includeHidden, maxDepth, currentDepth, basePath } = options;
    const items = [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files unless requested
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      const isDir = entry.isDirectory();

      const item = {
        name: entry.name,
        path: relativePath,
        type: isDir ? 'directory' : 'file',
      };

      // Add file stats if it's a file
      if (!isDir) {
        try {
          const stats = await fs.stat(fullPath);
          item.size = stats.size;
          item.modified = stats.mtime.toISOString();
        } catch {
          // Ignore stat errors for individual files
        }
      }

      items.push(item);

      // Recurse into directories if requested
      if (recursive && isDir && currentDepth < maxDepth - 1) {
        try {
          const subItems = await this.listDir(fullPath, {
            ...options,
            currentDepth: currentDepth + 1,
          });
          items.push(...subItems);
        } catch {
          // Skip inaccessible directories
        }
      }
    }

    return items;
  }
}

/**
 * Read File Tool
 */
class ReadFileTool extends BaseTool {
  constructor() {
    super({
      name: 'read_file',
      description: 'Read file content with encoding support and size limits',
      inputSchema: readFileSchema,
      timeoutMs: 30000,
    });
  }

  async run({ path: filePath, encoding, maxSize }) {
    const safePath = pathResolver.resolve(filePath);

    // Check existence and type
    try {
      const stats = await fs.stat(safePath);
      if (stats.isDirectory()) {
        throw new ValidationError(`Path '${filePath}' is a directory, not a file`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(`File not found: ${filePath}`);
      }
      throw error;
    }

    // Read file
    let content = await fs.readFile(safePath, encoding === 'binary' ? null : encoding);

    // Handle binary as base64
    if (encoding === 'binary') {
      content = content.toString('base64');
    }

    // Truncate if necessary
    const truncated = content.length > maxSize;
    if (truncated) {
      content = content.substring(0, maxSize);
    }

    return {
      path: filePath,
      content,
      encoding,
      truncated,
      ...(truncated && { originalLength: content.length + (truncated ? '...' : '').length }),
    };
  }
}

/**
 * Write File Tool
 */
class WriteFileTool extends BaseTool {
  constructor() {
    super({
      name: 'write_file',
      description: 'Write content to a file with optional directory creation',
      inputSchema: writeFileSchema,
      timeoutMs: 30000,
    });
  }

  async run({ path: filePath, content, createDirs, overwrite }) {
    const safePath = pathResolver.resolve(filePath);
    const dir = path.dirname(safePath);

    // Check if file exists when overwrite is false
    if (!overwrite) {
      try {
        await fs.access(safePath);
        throw new ValidationError(`File '${filePath}' already exists and overwrite is disabled`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, we can proceed
      }
    }

    // Create directories if needed
    if (createDirs) {
      await ensureDir(dir);
    } else {
      // Verify directory exists
      const dirExists = await exists(dir);
      if (!dirExists) {
        throw new ValidationError(`Directory '${path.dirname(filePath)}' does not exist`);
      }
    }

    // Write file
    await fs.writeFile(safePath, content, 'utf8');

    // Get file stats
    const stats = await fs.stat(safePath);

    return {
      path: filePath,
      size: stats.size,
      created: !overwrite,
      modified: stats.mtime.toISOString(),
    };
  }
}

/**
 * Delete File Tool
 */
class DeleteFileTool extends BaseTool {
  constructor() {
    super({
      name: 'delete_file',
      description: 'Delete a file or directory (with optional recursive deletion)',
      inputSchema: deleteFileSchema,
      timeoutMs: 30000,
    });
  }

  async run({ path: targetPath, recursive }) {
    const safePath = pathResolver.resolve(targetPath);

    // Check existence
    let stats;
    try {
      stats = await fs.stat(safePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(`Path not found: ${targetPath}`);
      }
      throw error;
    }

    const isDir = stats.isDirectory();

    // Require recursive flag for directories
    if (isDir && !recursive) {
      throw new ValidationError(
        `'${targetPath}' is a directory. Set recursive=true to delete directories.`,
      );
    }

    // Perform deletion
    if (isDir) {
      await fs.rm(safePath, { recursive: true, force: true });
    } else {
      await fs.unlink(safePath);
    }

    return {
      path: targetPath,
      type: isDir ? 'directory' : 'file',
      deleted: true,
    };
  }
}

// Create tool instances
const listDirectoryTool = new ListDirectoryTool();
const readFileTool = new ReadFileTool();
const writeFileTool = new WriteFileTool();
const deleteFileTool = new DeleteFileTool();

/**
 * Export tools in legacy format for backward compatibility
 * while also providing the new class-based exports
 */
export const tools = {
  listDirectory: listDirectoryTool,
  readFile: readFileTool,
  writeFile: writeFileTool,
  deleteFile: deleteFileTool,
};

// Legacy export format for existing tool registry
export default [
  {
    name: listDirectoryTool.name,
    description: listDirectoryTool.description,
    inputSchema: listDirectoryTool.getJsonSchema(),
    execute: (input) => listDirectoryTool.execute(input),
  },
  {
    name: readFileTool.name,
    description: readFileTool.description,
    inputSchema: readFileTool.getJsonSchema(),
    execute: (input) => readFileTool.execute(input),
  },
  {
    name: writeFileTool.name,
    description: writeFileTool.description,
    inputSchema: writeFileTool.getJsonSchema(),
    execute: (input) => writeFileTool.execute(input),
  },
  {
    name: deleteFileTool.name,
    description: deleteFileTool.description,
    inputSchema: deleteFileTool.getJsonSchema(),
    execute: (input) => deleteFileTool.execute(input),
  },
];

// Named exports for direct access
export { ListDirectoryTool, ReadFileTool, WriteFileTool, DeleteFileTool, PathResolver };
