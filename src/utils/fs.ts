/**
 * Filesystem Utilities
 * @module utils/fs
 */

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Ensure directory exists, creating it if necessary
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Ensure parent directory of a file exists
 * @param {string} filePath - File path
 * @returns {Promise<void>}
 */
export async function ensureParentDir(filePath) {
  const dir = dirname(filePath);
  await ensureDir(dir);
}

/**
 * Safely read a file, returning null if it doesn't exist
 * @param {string} filePath - File path
 * @param {string} [encoding='utf-8'] - File encoding
 * @returns {Promise<string|null>} File content or null
 */
export async function safeRead(filePath, encoding = 'utf-8') {
  try {
    return await fs.readFile(filePath, encoding);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Safely read and parse JSON file
 * @param {string} filePath - File path
 * @param {*} [defaultValue=null] - Default value if file doesn't exist
 * @returns {Promise<*>} Parsed JSON or default value
 */
export async function safeReadJson(filePath, defaultValue = null) {
  const content = await safeRead(filePath);
  if (content === null) {
    return defaultValue;
  }
  try {
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

/**
 * Safely write file, creating parent directories if needed
 * @param {string} filePath - File path
 * @param {string} content - File content
 * @param {string} [encoding='utf-8'] - File encoding
 * @returns {Promise<void>}
 */
export async function safeWrite(filePath, content, encoding = 'utf-8') {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, content, encoding);
}

/**
 * Safely write JSON file
 * @param {string} filePath - File path
 * @param {*} data - Data to write
 * @param {number} [indent=2] - JSON indentation
 * @returns {Promise<void>}
 */
export async function safeWriteJson(filePath, data, indent = 2) {
  const content = JSON.stringify(data, null, indent);
  await safeWrite(filePath, `${content}\n`);
}

/**
 * Check if file exists
 * @param {string} filePath - File path
 * @returns {Promise<boolean>} True if exists
 */
export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 * @param {string} path - Path to check
 * @returns {Promise<boolean>} True if directory
 */
export async function isDirectory(path) {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 * @param {string} path - Path to check
 * @returns {Promise<boolean>} True if file
 */
export async function isFile(path) {
  try {
    const stat = await fs.stat(path);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes
 * @param {string} filePath - File path
 * @returns {Promise<number|null>} File size or null
 */
export async function getFileSize(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return null;
  }
}

/**
 * List files in directory
 * @param {string} dirPath - Directory path
 * @param {Object} [options] - Options
 * @param {boolean} [options.recursive=false] - Recursive listing
 * @param {RegExp} [options.filter] - Filter pattern
 * @returns {Promise<string[]>} List of file paths
 */
export async function listFiles(dirPath, options = {}) {
  const { recursive = false, filter } = options;
  const results = [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      const subFiles = await listFiles(fullPath, options);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      if (!filter || filter.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Safely delete file
 * @param {string} filePath - File path
 * @returns {Promise<boolean>} True if deleted
 */
export async function safeDelete(filePath) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Safely delete directory recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<boolean>} True if deleted
 */
export async function safeDeleteDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Copy file
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @returns {Promise<void>}
 */
export async function copyFile(src, dest) {
  await ensureParentDir(dest);
  await fs.copyFile(src, dest);
}

/**
 * Move/rename file
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @returns {Promise<void>}
 */
export async function moveFile(src, dest) {
  await ensureParentDir(dest);
  await fs.rename(src, dest);
}

/**
 * Get absolute path
 * @param {string} path - Path to resolve
 * @param {string} [basePath] - Base path
 * @returns {string} Absolute path
 */
export function getAbsolutePath(path, basePath = process.cwd()) {
  return resolve(basePath, path);
}

export default {
  ensureDir,
  ensureParentDir,
  safeRead,
  safeReadJson,
  safeWrite,
  safeWriteJson,
  exists,
  isDirectory,
  isFile,
  getFileSize,
  listFiles,
  safeDelete,
  safeDeleteDir,
  copyFile,
  moveFile,
  getAbsolutePath,
};
