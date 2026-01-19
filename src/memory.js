/**
 * @fileoverview Optimized memory module for swarm task persistence
 * Provides efficient async file operations with batching, caching,
 * and proper error handling for memory/archive management.
 * @module memory
 */

import { appendFile, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Paths, SizeLimits, resolvePath } from './constants.js';
import { FileSystemError } from './errors/AppError.js';
import { generateId as utilsGenerateId, sanitize } from './utils/string.js';
import { formatDate as utilsFormatDate } from './utils/time.js';

// ============================================================================
// Configuration
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

/** @type {string} Default memory directory path */
const DEFAULT_MEMORY_DIR = resolvePath(Paths.MEMORY_DIR, REPO_ROOT);

/** @type {number} Maximum entries to keep in recent cache */
const CACHE_MAX_SIZE = 50;

/** @type {number} Cache TTL in milliseconds */
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats a date as YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => date.toISOString().slice(0, 10);

/**
 * Formats a date as a file-safe timestamp
 * @param {Date} date - Date to format
 * @returns {string} Formatted timestamp (YYYY-MM-DDTHH-MM-SS-mmmZ)
 */
const formatStamp = (date) => date.toISOString().replace(/[:.]/g, '-');

/**
 * Normalizes text content (handles line endings, trims)
 * Uses the sanitize function from utils/string.js
 * @param {*} value - Value to normalize
 * @returns {string} Normalized string
 */
const normalizeText = (value) => {
  if (value == null) return '';
  return sanitize(String(value)).trim();
};

/**
 * Generates a safe title from input
 * @param {string} [title] - Explicit title
 * @param {string} [prompt] - Fallback prompt
 * @param {number} [maxLength=80] - Maximum title length
 * @returns {string} Safe title string
 */
const generateTitle = (title, prompt, maxLength = 80) => {
  const base = normalizeText(title) || normalizeText(prompt).split('\n')[0];
  if (!base) return 'Swarm Task';

  // Remove special characters and truncate
  const clean = base.replace(/[#*`\[\]]/g, '').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
};

/**
 * Generates a unique ID
 * Uses the generateId function from utils/string.js
 * @returns {string} Unique identifier
 */
const generateId = () => utilsGenerateId('mem');

// ============================================================================
// Memory Cache
// ============================================================================

/**
 * Simple LRU cache for recent memory entries
 */
class MemoryCache {
  /**
   * @param {number} maxSize - Maximum cache entries
   * @param {number} ttl - Time-to-live in milliseconds
   */
  constructor(maxSize = CACHE_MAX_SIZE, ttl = CACHE_TTL) {
    /** @type {Map<string, { data: any, timestamp: number }>} */
    this._cache = new Map();
    this._maxSize = maxSize;
    this._ttl = ttl;
  }

  /**
   * Gets a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this._cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this._ttl) {
      this._cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this._cache.delete(key);
    this._cache.set(key, entry);
    return entry.data;
  }

  /**
   * Sets a value in cache
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   */
  set(key, data) {
    // Evict oldest if at capacity
    if (this._cache.size >= this._maxSize) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }

    this._cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Invalidates a cache entry
   * @param {string} key - Cache key
   */
  invalidate(key) {
    this._cache.delete(key);
  }

  /**
   * Clears all cache entries
   */
  clear() {
    this._cache.clear();
  }

  /**
   * Gets cache statistics
   * @returns {{ size: number, maxSize: number }}
   */
  stats() {
    return {
      size: this._cache.size,
      maxSize: this._maxSize
    };
  }
}

// Global cache instance
const memoryCache = new MemoryCache();

// ============================================================================
// File Operations
// ============================================================================

/**
 * Ensures directory exists
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw FileSystemError.fromNodeError(error, dirPath);
    }
  }
}

/**
 * Safely reads a file with error handling
 * @param {string} filePath - File path
 * @param {string} [encoding='utf8'] - File encoding
 * @returns {Promise<string|null>} File contents or null if not found
 */
async function safeReadFile(filePath, encoding = 'utf8') {
  try {
    return await readFile(filePath, encoding);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw FileSystemError.fromNodeError(error, filePath);
  }
}

/**
 * Safely writes a file with atomic operation
 * @param {string} filePath - File path
 * @param {string} content - Content to write
 * @returns {Promise<void>}
 */
async function safeWriteFile(filePath, content) {
  await ensureDir(dirname(filePath));

  // Write to temp file first for atomic operation
  const tempPath = `${filePath}.tmp.${generateId()}`;
  try {
    await writeFile(tempPath, content, 'utf8');
    // Rename is atomic on most systems
    const { rename } = await import('node:fs/promises');
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw FileSystemError.fromNodeError(error, filePath);
  }
}

/**
 * Safely appends to a file
 * @param {string} filePath - File path
 * @param {string} content - Content to append
 * @returns {Promise<void>}
 */
async function safeAppendFile(filePath, content) {
  await ensureDir(dirname(filePath));
  try {
    await appendFile(filePath, content, 'utf8');
  } catch (error) {
    throw FileSystemError.fromNodeError(error, filePath);
  }
}

// ============================================================================
// Log Header Management
// ============================================================================

/**
 * Ensures a log file has a proper header
 * @param {string} logPath - Path to log file
 * @param {string} dateLabel - Date label for header
 * @returns {Promise<boolean>} True if header was created
 */
async function ensureLogHeader(logPath, dateLabel) {
  const existing = await safeReadFile(logPath);
  if (existing !== null) return false;

  const header = [
    `# Task Log - ${dateLabel}`,
    `**Date**: ${dateLabel}`,
    '**Type**: Multi-task Day',
    '',
    '---',
    ''
  ].join('\n');

  await safeWriteFile(logPath, header);
  return true;
}

/**
 * Compacts a log file by removing excessive whitespace
 * @param {string} logPath - Path to log file
 * @returns {Promise<boolean>} True if file was compacted
 */
async function compactLog(logPath) {
  const content = await safeReadFile(logPath);
  if (!content) return false;

  const compacted = content
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+$/gm, '')
    .trimEnd() + '\n';

  if (compacted !== content) {
    await safeWriteFile(logPath, compacted);
    return true;
  }
  return false;
}

// ============================================================================
// Main Memory Functions
// ============================================================================

/**
 * @typedef {Object} SwarmMemoryInput
 * @property {string} [title] - Task title
 * @property {string} prompt - Original prompt
 * @property {Object} [steps] - Execution steps
 * @property {string} [steps.speculation] - Speculation phase output
 * @property {string} [steps.plan] - Planning phase output
 * @property {Array<{name: string, model: string, response: string}>} [agents] - Agent responses
 * @property {string} [summary] - Task summary
 * @property {string} [finalAnswer] - Final synthesized answer
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} SwarmMemoryResult
 * @property {string} archivePath - Path to archive file
 * @property {string} logPath - Path to log file
 * @property {string} id - Unique memory ID
 * @property {boolean} rebased - Whether log was compacted
 */

/**
 * Writes swarm execution results to memory
 * @param {SwarmMemoryInput} input - Memory input data
 * @param {Object} [options] - Write options
 * @param {string} [options.memoryDir] - Custom memory directory
 * @returns {Promise<SwarmMemoryResult>} Result with file paths
 */
export async function writeSwarmMemory(input, options = {}) {
  const {
    title,
    prompt,
    steps = {},
    agents = [],
    summary,
    finalAnswer,
    metadata = {}
  } = input;

  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;
  await ensureDir(memoryDir);

  const now = new Date();
  const dateLabel = formatDate(now);
  const stamp = formatStamp(now);
  const id = generateId();
  const safeTitle = generateTitle(title, prompt);

  // File paths
  const archiveFile = `swarm-archive-${stamp}.md`;
  const archivePath = join(memoryDir, archiveFile);
  const logPath = join(memoryDir, `task-log-${dateLabel}.md`);

  // Format agent responses
  const agentBlocks = agents
    .filter(agent => agent && agent.name)
    .map(agent => [
      `### ${agent.name}`,
      `**Model**: ${agent.model || 'unknown'}`,
      '',
      normalizeText(agent.response) || '_No response_'
    ].join('\n'))
    .join('\n\n');

  // Build archive content
  const archiveContent = [
    `# Swarm Archive - ${stamp}`,
    '',
    '## Metadata',
    `- **ID**: ${id}`,
    `- **Date**: ${dateLabel}`,
    `- **Title**: ${safeTitle}`,
    `- **Agents**: ${agents.length}`,
    metadata.duration ? `- **Duration**: ${metadata.duration}ms` : null,
    '',
    '## Prompt',
    '',
    normalizeText(prompt) || '_No prompt provided_',
    '',
    '## Speculation',
    '',
    normalizeText(steps.speculation) || '_No speculation phase_',
    '',
    '## Plan',
    '',
    normalizeText(steps.plan) || '_No plan generated_',
    '',
    '## Agent Responses',
    '',
    agentBlocks || '_No agent output_',
    '',
    '## Synthesis',
    '',
    normalizeText(finalAnswer) || '_No final answer_',
    '',
    '## Summary',
    '',
    normalizeText(summary) || '_No summary available_',
    ''
  ].filter(line => line !== null).join('\n');

  // Write archive
  await safeWriteFile(archivePath, archiveContent);

  // Ensure log header exists
  await ensureLogHeader(logPath, dateLabel);

  // Build log entry
  const logEntry = [
    '',
    `## ${safeTitle}`,
    '',
    `**Time**: ${now.toISOString()}`,
    '**Status**: Completed',
    '**Agent**: AgentSwarm',
    '',
    '### Outcome',
    '',
    normalizeText(summary) || '_Summary unavailable_',
    '',
    '### Details',
    '',
    `- Archive: \`${archiveFile}\``,
    `- Agents: ${agents.map(a => a.name).filter(Boolean).join(', ') || 'None'}`,
    `- ID: ${id}`,
    ''
  ].join('\n');

  // Append to log
  await safeAppendFile(logPath, logEntry);

  // Occasionally compact log (10% chance)
  let rebased = false;
  if (Math.random() < 0.1) {
    rebased = await compactLog(logPath);
  }

  // Update cache
  memoryCache.set(`archive:${id}`, { archivePath, title: safeTitle, date: dateLabel });

  return {
    archivePath,
    logPath,
    id,
    rebased
  };
}

/**
 * Reads a memory archive by ID or path
 * @param {string} identifier - Memory ID or file path
 * @param {Object} [options] - Read options
 * @param {string} [options.memoryDir] - Custom memory directory
 * @returns {Promise<{content: string, metadata: Object} | null>} Archive content or null
 */
export async function readSwarmMemory(identifier, options = {}) {
  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;

  // Check cache first
  const cached = memoryCache.get(`archive:${identifier}`);
  if (cached?.archivePath) {
    const content = await safeReadFile(cached.archivePath);
    if (content) {
      return { content, metadata: cached };
    }
  }

  // Try as direct path
  let archivePath = identifier;
  if (!identifier.includes('/') && !identifier.includes('\\')) {
    // Assume it's a filename or ID
    archivePath = join(memoryDir, identifier.endsWith('.md') ? identifier : `swarm-archive-${identifier}.md`);
  }

  const content = await safeReadFile(archivePath);
  if (!content) return null;

  // Parse basic metadata from content
  const titleMatch = content.match(/^# .+ - (.+)$/m);
  const dateMatch = content.match(/\*\*Date\*\*: (.+)$/m);

  return {
    content,
    metadata: {
      archivePath,
      title: titleMatch?.[1] || 'Unknown',
      date: dateMatch?.[1] || 'Unknown'
    }
  };
}

/**
 * Lists available memory archives
 * @param {Object} [options] - List options
 * @param {string} [options.memoryDir] - Custom memory directory
 * @param {number} [options.limit=50] - Maximum entries to return
 * @param {string} [options.dateFilter] - Filter by date (YYYY-MM-DD)
 * @returns {Promise<Array<{file: string, date: string, size: number}>>} List of archives
 */
export async function listSwarmMemories(options = {}) {
  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;
  const limit = options.limit || 50;
  const dateFilter = options.dateFilter;

  try {
    const files = await readdir(memoryDir);

    const archives = await Promise.all(
      files
        .filter(f => f.startsWith('swarm-archive-') && f.endsWith('.md'))
        .map(async (file) => {
          try {
            const filePath = join(memoryDir, file);
            const stats = await stat(filePath);
            const dateMatch = file.match(/swarm-archive-(\d{4}-\d{2}-\d{2})/);
            const date = dateMatch?.[1] || 'unknown';

            // Apply date filter
            if (dateFilter && date !== dateFilter) return null;

            return {
              file,
              path: filePath,
              date,
              size: stats.size,
              mtime: stats.mtime
            };
          } catch {
            return null;
          }
        })
    );

    return archives
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map(({ file, path, date, size }) => ({ file, path, date, size }));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw FileSystemError.fromNodeError(error, memoryDir);
  }
}

/**
 * Gets the task log for a specific date
 * @param {string} [date] - Date in YYYY-MM-DD format (defaults to today)
 * @param {Object} [options] - Options
 * @param {string} [options.memoryDir] - Custom memory directory
 * @returns {Promise<string | null>} Log content or null
 */
export async function getTaskLog(date, options = {}) {
  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;
  const targetDate = date || formatDate(new Date());
  const logPath = join(memoryDir, `task-log-${targetDate}.md`);

  return safeReadFile(logPath);
}

/**
 * Searches memory archives for content
 * @param {string} query - Search query
 * @param {Object} [options] - Search options
 * @param {string} [options.memoryDir] - Custom memory directory
 * @param {number} [options.limit=10] - Maximum results
 * @returns {Promise<Array<{file: string, matches: string[]}>>} Search results
 */
export async function searchMemories(query, options = {}) {
  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;
  const limit = options.limit || 10;

  const archives = await listSwarmMemories({ memoryDir, limit: 100 });
  const results = [];

  const queryLower = query.toLowerCase();

  for (const archive of archives) {
    const content = await safeReadFile(archive.path);
    if (!content) continue;

    const contentLower = content.toLowerCase();
    if (!contentLower.includes(queryLower)) continue;

    // Extract matching lines
    const lines = content.split('\n');
    const matches = lines
      .filter(line => line.toLowerCase().includes(queryLower))
      .slice(0, 3)
      .map(line => line.slice(0, 200));

    results.push({
      file: archive.file,
      date: archive.date,
      matches
    });

    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Clears the memory cache
 */
export function clearMemoryCache() {
  memoryCache.clear();
}

/**
 * Gets memory statistics
 * @param {Object} [options] - Options
 * @param {string} [options.memoryDir] - Custom memory directory
 * @returns {Promise<{totalArchives: number, totalSize: number, cacheStats: Object}>}
 */
export async function getMemoryStats(options = {}) {
  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;
  const archives = await listSwarmMemories({ memoryDir, limit: 1000 });

  const totalSize = archives.reduce((sum, a) => sum + a.size, 0);

  return {
    totalArchives: archives.length,
    totalSize,
    totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
    memoryDir,
    cacheStats: memoryCache.stats()
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  writeSwarmMemory,
  readSwarmMemory,
  listSwarmMemories,
  getTaskLog,
  searchMemories,
  clearMemoryCache,
  getMemoryStats
};
