/**
 * Unified History Manager
 * Merges src/cli/HistoryManager.js, src/cli-enhanced/history.js
 * @module cli-unified/history/UnifiedHistoryManager
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';
import { DATA_DIR, MAX_HISTORY_SIZE } from '../core/constants.js';
import { FuzzySearchEngine } from './FuzzySearchEngine.js';

const HISTORY_DIR = join(homedir(), DATA_DIR, 'history');

/**
 * Unified History Manager
 */
export class UnifiedHistoryManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.historyDir = options.historyDir || HISTORY_DIR;
    this.maxSize = options.maxSize || MAX_HISTORY_SIZE;
    this.sessionId = options.sessionId || this.generateSessionId();

    // In-memory history
    this.entries = [];
    this.position = -1;

    // Search engine
    this.searchEngine = new FuzzySearchEngine();

    // Bookmarks
    this.bookmarks = new Map();

    // Tags
    this.tags = new Map();

    // Auto-tagging patterns
    this.tagPatterns = [
      { pattern: /\b(bug|fix|error|issue)\b/i, tag: 'debug' },
      { pattern: /\b(test|spec|unittest)\b/i, tag: 'testing' },
      { pattern: /\b(refactor|clean|optimize)\b/i, tag: 'refactor' },
      { pattern: /\b(feature|add|implement)\b/i, tag: 'feature' },
      { pattern: /\b(doc|readme|comment)\b/i, tag: 'docs' },
      { pattern: /\b(security|auth|permission)\b/i, tag: 'security' },
      { pattern: /\b(api|endpoint|rest|graphql)\b/i, tag: 'api' },
      { pattern: /\b(database|sql|query|mongo)\b/i, tag: 'database' }
    ];

    this._ensureDir();
    this._loadHistory();
    this._loadBookmarks();
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Ensure history directory exists
   */
  _ensureDir() {
    if (!existsSync(this.historyDir)) {
      mkdirSync(this.historyDir, { recursive: true });
    }
  }

  /**
   * Get today's history file path
   */
  _getTodayFile() {
    const date = new Date().toISOString().split('T')[0];
    return join(this.historyDir, `${date}.jsonl`);
  }

  /**
   * Load history from files
   */
  _loadHistory() {
    try {
      const files = readdirSync(this.historyDir)
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .slice(-7); // Load last 7 days

      for (const file of files) {
        const filePath = join(this.historyDir, file);
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            this._addToMemory(entry, false);
          } catch {
            // Skip malformed lines
          }
        }
      }

      // Trim to max size
      if (this.entries.length > this.maxSize) {
        this.entries = this.entries.slice(-this.maxSize);
      }

      eventBus.emit(EVENT_TYPES.HISTORY_LOAD, { count: this.entries.length });
    } catch {
      // No history to load
    }
  }

  /**
   * Load bookmarks
   */
  _loadBookmarks() {
    try {
      const bookmarksFile = join(this.historyDir, 'bookmarks.json');
      if (existsSync(bookmarksFile)) {
        const data = JSON.parse(readFileSync(bookmarksFile, 'utf-8'));
        this.bookmarks = new Map(Object.entries(data));
      }
    } catch {
      // No bookmarks
    }
  }

  /**
   * Save bookmarks
   */
  _saveBookmarks() {
    try {
      const bookmarksFile = join(this.historyDir, 'bookmarks.json');
      writeFileSync(bookmarksFile, JSON.stringify(Object.fromEntries(this.bookmarks), null, 2));
    } catch (error) {
      console.error('Failed to save bookmarks:', error.message);
    }
  }

  /**
   * Add entry to memory
   */
  _addToMemory(entry, index = true) {
    this.entries.push(entry);

    if (index) {
      this.searchEngine.addDocument(entry.id, entry.text, {
        timestamp: entry.timestamp,
        agent: entry.agent,
        tags: entry.tags
      });
    }

    // Build tag index
    if (entry.tags) {
      for (const tag of entry.tags) {
        if (!this.tags.has(tag)) {
          this.tags.set(tag, []);
        }
        this.tags.get(tag).push(entry.id);
      }
    }
  }

  /**
   * Auto-detect tags for text
   */
  _autoTag(text) {
    const tags = [];
    for (const { pattern, tag } of this.tagPatterns) {
      if (pattern.test(text)) {
        tags.push(tag);
      }
    }
    return tags;
  }

  /**
   * Add entry to history
   */
  add(text, options = {}) {
    if (!text || !text.trim()) return null;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: text.trim(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      agent: options.agent || null,
      tags: options.tags || this._autoTag(text),
      response: options.response || null,
      metadata: options.metadata || {}
    };

    this._addToMemory(entry);

    // Persist to file
    try {
      const filePath = this._getTodayFile();
      appendFileSync(filePath, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('Failed to save history:', error.message);
    }

    // Trim if needed
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }

    // Reset navigation position
    this.position = this.entries.length;

    eventBus.emit(EVENT_TYPES.HISTORY_ADD, { entry });
    this.emit('add', entry);

    return entry;
  }

  /**
   * Get previous entry (navigation)
   */
  previous() {
    if (this.entries.length === 0) return null;

    if (this.position > 0) {
      this.position--;
    }

    return this.entries[this.position];
  }

  /**
   * Get next entry (navigation)
   */
  next() {
    if (this.position < this.entries.length - 1) {
      this.position++;
      return this.entries[this.position];
    }

    this.position = this.entries.length;
    return null;
  }

  /**
   * Reset navigation position
   */
  resetPosition() {
    this.position = this.entries.length;
  }

  /**
   * Search history
   */
  search(query, options = {}) {
    return this.searchEngine.search(query, options);
  }

  /**
   * Fuzzy search
   */
  fuzzySearch(query, options = {}) {
    return this.searchEngine.fuzzySearch(query, options);
  }

  /**
   * Search by prefix
   */
  searchPrefix(prefix) {
    return this.entries
      .filter(e => e.text.toLowerCase().startsWith(prefix.toLowerCase()))
      .map(e => e.text)
      .slice(-10);
  }

  /**
   * Get entries by tag
   */
  getByTag(tag) {
    const ids = this.tags.get(tag) || [];
    return this.entries.filter(e => ids.includes(e.id));
  }

  /**
   * Get all tags
   */
  getAllTags() {
    return Array.from(this.tags.keys());
  }

  /**
   * Add bookmark
   */
  addBookmark(entryId, name) {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) return false;

    this.bookmarks.set(name, {
      entryId,
      text: entry.text,
      timestamp: entry.timestamp,
      bookmarkedAt: Date.now()
    });

    this._saveBookmarks();
    this.emit('bookmarkAdded', name, entry);
    return true;
  }

  /**
   * Remove bookmark
   */
  removeBookmark(name) {
    if (!this.bookmarks.has(name)) return false;

    this.bookmarks.delete(name);
    this._saveBookmarks();
    this.emit('bookmarkRemoved', name);
    return true;
  }

  /**
   * Get bookmark
   */
  getBookmark(name) {
    return this.bookmarks.get(name) || null;
  }

  /**
   * List bookmarks
   */
  listBookmarks() {
    return Array.from(this.bookmarks.entries()).map(([name, data]) => ({
      name,
      ...data
    }));
  }

  /**
   * Get recent entries
   */
  getRecent(count = 10) {
    return this.entries.slice(-count);
  }

  /**
   * Get entries by session
   */
  getBySession(sessionId) {
    return this.entries.filter(e => e.sessionId === sessionId);
  }

  /**
   * Get current session entries
   */
  getCurrentSession() {
    return this.getBySession(this.sessionId);
  }

  /**
   * Clear history
   */
  clear() {
    this.entries = [];
    this.position = -1;
    this.searchEngine.clear();
    this.tags.clear();
    eventBus.emit(EVENT_TYPES.HISTORY_CLEAR);
    this.emit('clear');
  }

  /**
   * Export history
   */
  export(format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(this.entries, null, 2);

      case 'md':
        return this.entries
          .map(e => {
            const date = new Date(e.timestamp).toLocaleString();
            const tags = e.tags?.length ? ` [${e.tags.join(', ')}]` : '';
            return `## ${date}${tags}\n\n${e.text}\n`;
          })
          .join('\n---\n\n');

      case 'html':
        return `<!DOCTYPE html>
<html>
<head><title>ClaudeHydra History</title></head>
<body>
<h1>ClaudeHydra History</h1>
${this.entries.map(e => {
  const date = new Date(e.timestamp).toLocaleString();
  const tags = e.tags?.length ? `<small>[${e.tags.join(', ')}]</small>` : '';
  return `<div class="entry">
    <h3>${date} ${tags}</h3>
    <pre>${e.text}</pre>
  </div>`;
}).join('\n')}
</body>
</html>`;

      default:
        return JSON.stringify(this.entries);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return {
      total: this.entries.length,
      today: this.entries.filter(e => now - e.timestamp < dayMs).length,
      thisWeek: this.entries.filter(e => now - e.timestamp < 7 * dayMs).length,
      byAgent: this.entries.reduce((acc, e) => {
        if (e.agent) {
          acc[e.agent] = (acc[e.agent] || 0) + 1;
        }
        return acc;
      }, {}),
      byTag: Object.fromEntries(
        Array.from(this.tags.entries()).map(([tag, ids]) => [tag, ids.length])
      ),
      bookmarks: this.bookmarks.size
    };
  }

  /**
   * Get entry count
   */
  get count() {
    return this.entries.length;
  }

  /**
   * Get all entries
   */
  getAll() {
    return [...this.entries];
  }
}

export function createHistoryManager(options) {
  return new UnifiedHistoryManager(options);
}

export default UnifiedHistoryManager;
