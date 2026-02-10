/**
 * @fileoverview Log rotation utility class
 * Provides configurable log rotation with size-based and time-based policies.
 * @module logger/rotation
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {Object} LogRotationOptions
 * @property {string} logDir - Directory containing log files
 * @property {string} [logFilePattern='*.log'] - Glob pattern for log files
 * @property {number} [maxSize=10485760] - Max file size before rotation (bytes, default 10MB)
 * @property {number} [maxFiles=10] - Maximum number of rotated files to keep
 * @property {number} [maxAge=604800000] - Max age of log files in ms (default 7 days)
 * @property {boolean} [compress=false] - Compress rotated files with gzip
 * @property {string} [dateFormat='YYYY-MM-DD'] - Date format for rotated file names
 * @property {boolean} [createDir=true] - Create log directory if it doesn't exist
 */

/**
 * @typedef {Object} LogFileInfo
 * @property {string} name - File name
 * @property {string} path - Full file path
 * @property {number} size - File size in bytes
 * @property {Date} created - Creation date
 * @property {Date} modified - Last modification date
 * @property {boolean} isRotated - Whether this is a rotated file
 * @property {boolean} isCompressed - Whether file is compressed
 */

/**
 * @typedef {Object} RotationResult
 * @property {boolean} success - Whether rotation succeeded
 * @property {string} [originalFile] - Original file path
 * @property {string} [rotatedFile] - New rotated file path
 * @property {string} [error] - Error message if failed
 */

// ============================================================================
// LogRotation Class
// ============================================================================

/**
 * Log rotation manager with support for size-based and time-based rotation
 * @extends EventEmitter
 */
export class LogRotation extends EventEmitter {
  /**
   * Creates a new LogRotation instance
   * @param {LogRotationOptions} options - Configuration options
   */
  constructor(options = {}) {
    super();

    const {
      logDir = process.cwd(),
      logFilePattern = '*.log',
      maxSize = 10 * 1024 * 1024, // 10MB
      maxFiles = 10,
      maxAge = 7 * 24 * 60 * 60 * 1000, // 7 days
      compress = false,
      dateFormat = 'YYYY-MM-DD',
      createDir = true,
    } = options;

    /** @type {string} */
    this.logDir = path.resolve(logDir);

    /** @type {string} */
    this.logFilePattern = logFilePattern;

    /** @type {number} */
    this.maxSize = maxSize;

    /** @type {number} */
    this.maxFiles = maxFiles;

    /** @type {number} */
    this.maxAge = maxAge;

    /** @type {boolean} */
    this.compress = compress;

    /** @type {string} */
    this.dateFormat = dateFormat;

    /** @type {boolean} */
    this.createDir = createDir;

    /** @type {boolean} */
    this._initialized = false;

    /** @type {Map<string, number>} */
    this._fileSizeCache = new Map();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initializes the rotation manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    if (this.createDir) {
      await fsPromises.mkdir(this.logDir, { recursive: true });
    }

    this._initialized = true;
    this.emit('initialized', { logDir: this.logDir });
  }

  /**
   * Synchronous initialization
   */
  initializeSync() {
    if (this._initialized) return;

    if (this.createDir && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this._initialized = true;
  }

  // ==========================================================================
  // Core Rotation Methods
  // ==========================================================================

  /**
   * Rotates a log file
   * @param {string} filePath - Path to the log file to rotate
   * @returns {Promise<RotationResult>} Rotation result
   */
  async rotate(filePath) {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      try {
        await fsPromises.access(absolutePath);
      } catch {
        return {
          success: false,
          originalFile: absolutePath,
          error: 'File does not exist',
        };
      }

      // Generate rotated file name
      const rotatedPath = this._generateRotatedFileName(absolutePath);

      // Rename the original file
      await fsPromises.rename(absolutePath, rotatedPath);

      // Compress if enabled
      let finalPath = rotatedPath;
      if (this.compress) {
        finalPath = await this._compressFile(rotatedPath);
      }

      this.emit('rotated', {
        originalFile: absolutePath,
        rotatedFile: finalPath,
      });

      return {
        success: true,
        originalFile: absolutePath,
        rotatedFile: finalPath,
      };
    } catch (error) {
      this.emit('error', error);
      return {
        success: false,
        originalFile: filePath,
        error: error.message,
      };
    }
  }

  /**
   * Rotates a file synchronously
   * @param {string} filePath - Path to the log file to rotate
   * @returns {RotationResult} Rotation result
   */
  rotateSync(filePath) {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        return {
          success: false,
          originalFile: absolutePath,
          error: 'File does not exist',
        };
      }

      // Generate rotated file name
      const rotatedPath = this._generateRotatedFileName(absolutePath);

      // Rename the original file
      fs.renameSync(absolutePath, rotatedPath);

      this.emit('rotated', {
        originalFile: absolutePath,
        rotatedFile: rotatedPath,
      });

      return {
        success: true,
        originalFile: absolutePath,
        rotatedFile: rotatedPath,
      };
    } catch (error) {
      this.emit('error', error);
      return {
        success: false,
        originalFile: filePath,
        error: error.message,
      };
    }
  }

  /**
   * Checks if a file needs rotation based on size
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>} True if rotation is needed
   */
  async needsRotation(filePath) {
    try {
      const stats = await fsPromises.stat(filePath);
      return stats.size >= this.maxSize;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a file needs rotation synchronously
   * @param {string} filePath - Path to check
   * @returns {boolean} True if rotation is needed
   */
  needsRotationSync(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size >= this.maxSize;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Cleanup Methods
  // ==========================================================================

  /**
   * Cleans up old log files based on maxFiles and maxAge
   * @returns {Promise<{deleted: string[], kept: string[]}>} Cleanup results
   */
  async cleanup() {
    const deleted = [];
    const kept = [];

    try {
      const files = await this.getLogFiles();
      const now = Date.now();

      // Sort by modification date (oldest first)
      files.sort((a, b) => a.modified.getTime() - b.modified.getTime());

      // Separate current and rotated files
      const currentFiles = files.filter((f) => !f.isRotated);
      const rotatedFiles = files.filter((f) => f.isRotated);

      // Delete files exceeding maxFiles
      while (rotatedFiles.length > this.maxFiles) {
        const oldestFile = rotatedFiles.shift();
        if (oldestFile) {
          await fsPromises.unlink(oldestFile.path);
          deleted.push(oldestFile.path);
          this.emit('deleted', { file: oldestFile.path, reason: 'maxFiles' });
        }
      }

      // Delete files exceeding maxAge
      for (const file of rotatedFiles) {
        const age = now - file.modified.getTime();
        if (age > this.maxAge) {
          await fsPromises.unlink(file.path);
          deleted.push(file.path);
          this.emit('deleted', { file: file.path, reason: 'maxAge' });
        } else {
          kept.push(file.path);
        }
      }

      // Keep current files
      for (const file of currentFiles) {
        kept.push(file.path);
      }
    } catch (error) {
      this.emit('error', error);
    }

    return { deleted, kept };
  }

  /**
   * Cleans up old log files synchronously
   * @returns {{deleted: string[], kept: string[]}} Cleanup results
   */
  cleanupSync() {
    const deleted = [];
    const kept = [];

    try {
      const files = this.getLogFilesSync();
      const now = Date.now();

      // Sort by modification date (oldest first)
      files.sort((a, b) => a.modified.getTime() - b.modified.getTime());

      // Separate current and rotated files
      const rotatedFiles = files.filter((f) => f.isRotated);

      // Delete files exceeding maxFiles
      while (rotatedFiles.length > this.maxFiles) {
        const oldestFile = rotatedFiles.shift();
        if (oldestFile) {
          fs.unlinkSync(oldestFile.path);
          deleted.push(oldestFile.path);
        }
      }

      // Delete files exceeding maxAge
      for (const file of rotatedFiles) {
        const age = now - file.modified.getTime();
        if (age > this.maxAge) {
          fs.unlinkSync(file.path);
          deleted.push(file.path);
        } else {
          kept.push(file.path);
        }
      }
    } catch (error) {
      this.emit('error', error);
    }

    return { deleted, kept };
  }

  // ==========================================================================
  // File Information Methods
  // ==========================================================================

  /**
   * Gets information about all log files in the directory
   * @returns {Promise<LogFileInfo[]>} Array of log file information
   */
  async getLogFiles() {
    const files = [];

    try {
      await this.initialize();

      const entries = await fsPromises.readdir(this.logDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        // Match log file pattern
        if (!this._matchesPattern(entry.name)) continue;

        const filePath = path.join(this.logDir, entry.name);
        const stats = await fsPromises.stat(filePath);

        files.push({
          name: entry.name,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          isRotated: this._isRotatedFile(entry.name),
          isCompressed: entry.name.endsWith('.gz'),
        });
      }
    } catch (error) {
      this.emit('error', error);
    }

    return files;
  }

  /**
   * Gets log files synchronously
   * @returns {LogFileInfo[]} Array of log file information
   */
  getLogFilesSync() {
    const files = [];

    try {
      this.initializeSync();

      const entries = fs.readdirSync(this.logDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        // Match log file pattern
        if (!this._matchesPattern(entry.name)) continue;

        const filePath = path.join(this.logDir, entry.name);
        const stats = fs.statSync(filePath);

        files.push({
          name: entry.name,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          isRotated: this._isRotatedFile(entry.name),
          isCompressed: entry.name.endsWith('.gz'),
        });
      }
    } catch (error) {
      this.emit('error', error);
    }

    return files;
  }

  /**
   * Gets total size of all log files
   * @returns {Promise<number>} Total size in bytes
   */
  async getTotalSize() {
    const files = await this.getLogFiles();
    return files.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Gets statistics about log files
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    const files = await this.getLogFiles();
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const rotatedCount = files.filter((f) => f.isRotated).length;
    const compressedCount = files.filter((f) => f.isCompressed).length;

    return {
      totalFiles: files.length,
      totalSize,
      totalSizeFormatted: this._formatBytes(totalSize),
      rotatedFiles: rotatedCount,
      compressedFiles: compressedCount,
      currentFiles: files.length - rotatedCount,
      oldestFile:
        files.length > 0
          ? files.reduce((oldest, f) => (f.modified < oldest.modified ? f : oldest))
          : null,
      newestFile:
        files.length > 0
          ? files.reduce((newest, f) => (f.modified > newest.modified ? f : newest))
          : null,
    };
  }

  // ==========================================================================
  // Configuration Methods
  // ==========================================================================

  /**
   * Updates rotation configuration
   * @param {Partial<LogRotationOptions>} options - New options
   */
  configure(options) {
    if (typeof options.logDir === 'string') {
      this.logDir = path.resolve(options.logDir);
      this._initialized = false; // Re-initialize with new dir
    }
    if (typeof options.logFilePattern === 'string') {
      this.logFilePattern = options.logFilePattern;
    }
    if (typeof options.maxSize === 'number') {
      this.maxSize = options.maxSize;
    }
    if (typeof options.maxFiles === 'number') {
      this.maxFiles = options.maxFiles;
    }
    if (typeof options.maxAge === 'number') {
      this.maxAge = options.maxAge;
    }
    if (typeof options.compress === 'boolean') {
      this.compress = options.compress;
    }
    if (typeof options.dateFormat === 'string') {
      this.dateFormat = options.dateFormat;
    }
  }

  /**
   * Gets current configuration
   * @returns {LogRotationOptions} Current configuration
   */
  getConfig() {
    return {
      logDir: this.logDir,
      logFilePattern: this.logFilePattern,
      maxSize: this.maxSize,
      maxFiles: this.maxFiles,
      maxAge: this.maxAge,
      compress: this.compress,
      dateFormat: this.dateFormat,
      createDir: this.createDir,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Generates a rotated file name
   * @private
   * @param {string} originalPath - Original file path
   * @returns {string} Rotated file path
   */
  _generateRotatedFileName(originalPath) {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const baseName = path.basename(originalPath, ext);

    const timestamp = this._formatDate(new Date());
    const counter = this._getRotationCounter(dir, baseName, timestamp);

    const rotatedName =
      counter > 0 ? `${baseName}.${timestamp}.${counter}${ext}` : `${baseName}.${timestamp}${ext}`;

    return path.join(dir, rotatedName);
  }

  /**
   * Gets the rotation counter for duplicate timestamps
   * @private
   * @param {string} dir - Directory path
   * @param {string} baseName - Base file name
   * @param {string} timestamp - Timestamp string
   * @returns {number} Counter value
   */
  _getRotationCounter(dir, baseName, timestamp) {
    try {
      const files = fs.readdirSync(dir);
      const pattern = new RegExp(`^${baseName}\\.${timestamp}(\\.\\d+)?\\.`);
      const matches = files.filter((f) => pattern.test(f));

      if (matches.length === 0) return 0;

      const counters = matches.map((f) => {
        const match = f.match(/\.(\d+)\.[^.]+$/);
        return match ? parseInt(match[1], 10) : 0;
      });

      return Math.max(...counters) + 1;
    } catch {
      return 0;
    }
  }

  /**
   * Formats a date according to dateFormat
   * @private
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  _formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return this.dateFormat
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * Compresses a file with gzip
   * @private
   * @param {string} filePath - File to compress
   * @returns {Promise<string>} Compressed file path
   */
  async _compressFile(filePath) {
    const compressedPath = `${filePath}.gz`;

    const source = fs.createReadStream(filePath);
    const destination = fs.createWriteStream(compressedPath);
    const gzip = createGzip();

    await pipeline(source, gzip, destination);

    // Remove original file after compression
    await fsPromises.unlink(filePath);

    return compressedPath;
  }

  /**
   * Checks if a file name matches the log file pattern
   * @private
   * @param {string} fileName - File name to check
   * @returns {boolean} True if matches
   */
  _matchesPattern(fileName) {
    // Convert glob pattern to regex
    const pattern = this.logFilePattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${pattern}(\\.\\d{4}-\\d{2}-\\d{2}.*)?(\\.gz)?$`);
    return regex.test(fileName);
  }

  /**
   * Checks if a file is a rotated file
   * @private
   * @param {string} fileName - File name to check
   * @returns {boolean} True if rotated
   */
  _isRotatedFile(fileName) {
    // Rotated files have date/timestamp in name
    return /\.\d{4}-\d{2}-\d{2}/.test(fileName);
  }

  /**
   * Formats bytes to human-readable string
   * @private
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / k ** i).toFixed(2))} ${units[i]}`;
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/** @type {LogRotation|null} */
let defaultInstance = null;

/**
 * Gets the default LogRotation instance (singleton)
 * @param {LogRotationOptions} [options] - Options for first instantiation
 * @returns {LogRotation} Default instance
 */
export function getLogRotation(options) {
  if (!defaultInstance) {
    defaultInstance = new LogRotation(options);
  }
  return defaultInstance;
}

/**
 * Resets the default instance (useful for testing)
 */
export function resetLogRotation() {
  defaultInstance = null;
}

// ============================================================================
// Default Export
// ============================================================================

export default LogRotation;
