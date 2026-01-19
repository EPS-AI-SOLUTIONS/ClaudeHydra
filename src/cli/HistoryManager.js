/**
 * CLI History Manager
 * Persistent command history with search
 * @module cli/HistoryManager
 */

import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { HISTORY_FILE, MAX_HISTORY_SIZE } from './constants.js';

/**
 * @typedef {Object} HistoryOptions
 * @property {string} [file] - History file path
 * @property {number} [maxSize] - Maximum history entries
 */

/**
 * Manages command history with file persistence
 */
export class HistoryManager {
  /** @type {string[]} */
  #entries = [];

  /** @type {number} */
  #position = -1;

  /** @type {string} */
  #file;

  /** @type {number} */
  #maxSize;

  /** @type {string} */
  #currentInput = '';

  /** @type {boolean} */
  #dirty = false;

  /**
   * Create a new HistoryManager
   * @param {HistoryOptions} [options] - History options
   */
  constructor(options = {}) {
    this.#file = options.file || join(homedir(), HISTORY_FILE);
    this.#maxSize = options.maxSize || MAX_HISTORY_SIZE;
  }

  /**
   * Load history from file
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const content = await fs.readFile(this.#file, 'utf-8');
      this.#entries = content
        .split('\n')
        .filter(line => line.trim())
        .slice(-this.#maxSize);
      this.#position = this.#entries.length;
    } catch (error) {
      // File doesn't exist or can't be read - start with empty history
      if (error.code !== 'ENOENT') {
        console.error('Warning: Could not load history:', error.message);
      }
      this.#entries = [];
      this.#position = 0;
    }
  }

  /**
   * Save history to file
   * @returns {Promise<void>}
   */
  async save() {
    if (!this.#dirty) return;

    try {
      await fs.writeFile(this.#file, this.#entries.join('\n') + '\n', 'utf-8');
      this.#dirty = false;
    } catch (error) {
      console.error('Warning: Could not save history:', error.message);
    }
  }

  /**
   * Add an entry to history
   * @param {string} entry - Command to add
   */
  add(entry) {
    const trimmed = entry.trim();
    if (!trimmed) return;

    // Don't add duplicates of the last entry
    if (this.#entries.length > 0 && this.#entries[this.#entries.length - 1] === trimmed) {
      this.#position = this.#entries.length;
      return;
    }

    // Add entry
    this.#entries.push(trimmed);

    // Trim if over max size
    if (this.#entries.length > this.#maxSize) {
      this.#entries = this.#entries.slice(-this.#maxSize);
    }

    // Reset position to end
    this.#position = this.#entries.length;
    this.#currentInput = '';
    this.#dirty = true;
  }

  /**
   * Move to previous entry (older)
   * @param {string} [currentInput] - Current input to preserve
   * @returns {string|null} Previous entry or null
   */
  prev(currentInput) {
    if (this.#entries.length === 0) return null;

    // Save current input when first pressing up
    if (this.#position === this.#entries.length && currentInput !== undefined) {
      this.#currentInput = currentInput;
    }

    if (this.#position > 0) {
      this.#position--;
      return this.#entries[this.#position];
    }

    return this.#entries[0] || null;
  }

  /**
   * Move to next entry (newer)
   * @returns {string|null} Next entry, saved input, or null
   */
  next() {
    if (this.#entries.length === 0) return this.#currentInput || null;

    if (this.#position < this.#entries.length - 1) {
      this.#position++;
      return this.#entries[this.#position];
    }

    // At the end, return to current input
    if (this.#position === this.#entries.length - 1) {
      this.#position = this.#entries.length;
      return this.#currentInput || '';
    }

    return this.#currentInput || '';
  }

  /**
   * Search history for matching entries
   * @param {string} query - Search query
   * @returns {string[]} Matching entries (newest first)
   */
  search(query) {
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    return this.#entries
      .filter(entry => entry.toLowerCase().includes(lowerQuery))
      .reverse();
  }

  /**
   * Search history with prefix matching
   * @param {string} prefix - Prefix to match
   * @returns {string[]} Matching entries (newest first)
   */
  searchPrefix(prefix) {
    if (!prefix) return [];

    const lowerPrefix = prefix.toLowerCase();
    return this.#entries
      .filter(entry => entry.toLowerCase().startsWith(lowerPrefix))
      .reverse();
  }

  /**
   * Get entry at specific index
   * @param {number} index - Index (0 = oldest)
   * @returns {string|undefined} Entry at index
   */
  get(index) {
    return this.#entries[index];
  }

  /**
   * Clear all history
   */
  clear() {
    this.#entries = [];
    this.#position = 0;
    this.#currentInput = '';
    this.#dirty = true;
  }

  /**
   * Reset position to end (call after submitting input)
   */
  resetPosition() {
    this.#position = this.#entries.length;
    this.#currentInput = '';
  }

  /**
   * Get all entries
   * @returns {string[]} All history entries
   */
  getAll() {
    return [...this.#entries];
  }

  /**
   * Get recent entries
   * @param {number} [count=10] - Number of entries
   * @returns {string[]} Recent entries (newest first)
   */
  getRecent(count = 10) {
    return this.#entries.slice(-count).reverse();
  }

  /**
   * Get total entry count
   * @returns {number} Entry count
   */
  get size() {
    return this.#entries.length;
  }

  /**
   * Get current position in history
   * @returns {number} Current position
   */
  get position() {
    return this.#position;
  }

  /**
   * Check if at the end (current input)
   * @returns {boolean} True if at end
   */
  get atEnd() {
    return this.#position >= this.#entries.length;
  }

  /**
   * Check if at the beginning (oldest entry)
   * @returns {boolean} True if at beginning
   */
  get atStart() {
    return this.#position <= 0;
  }

  /**
   * Get history file path
   * @returns {string} File path
   */
  get filePath() {
    return this.#file;
  }
}

/**
 * Create a new history manager
 * @param {HistoryOptions} [options] - History options
 * @returns {HistoryManager} New history manager
 */
export function createHistoryManager(options) {
  return new HistoryManager(options);
}

export default HistoryManager;
