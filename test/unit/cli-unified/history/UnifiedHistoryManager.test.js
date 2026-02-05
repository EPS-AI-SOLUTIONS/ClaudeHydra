/**
 * UnifiedHistoryManager Tests
 * @module test/unit/cli-unified/history/UnifiedHistoryManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn(() => [])
}));

// Mock path module
vi.mock('path', () => ({
  dirname: vi.fn(p => p.split('/').slice(0, -1).join('/')),
  join: vi.fn((...args) => args.join('/'))
}));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/test')
}));

// Mock EventBus
vi.mock('../../../../src/cli-unified/core/EventBus.js', () => ({
  eventBus: {
    emit: vi.fn()
  },
  EVENT_TYPES: {
    HISTORY_LOAD: 'history:load',
    HISTORY_ADD: 'history:add',
    HISTORY_CLEAR: 'history:clear'
  }
}));

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  DATA_DIR: '.claude-hydra',
  MAX_HISTORY_SIZE: 1000
}));

// Mock FuzzySearchEngine as a real class
vi.mock('../../../../src/cli-unified/history/FuzzySearchEngine.js', () => {
  class MockFuzzySearchEngine {
    constructor() {
      this.addDocument = vi.fn();
      this.removeDocument = vi.fn();
      this.search = vi.fn(() => []);
      this.fuzzySearch = vi.fn(() => []);
      this.prefixSearch = vi.fn(() => []);
      this.clear = vi.fn();
    }
  }

  return {
    FuzzySearchEngine: MockFuzzySearchEngine,
    createFuzzySearchEngine: vi.fn(() => new MockFuzzySearchEngine())
  };
});

import {
  UnifiedHistoryManager,
  createHistoryManager
} from '../../../../src/cli-unified/history/UnifiedHistoryManager.js';

describe('UnifiedHistoryManager Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with defaults', () => {
      const manager = new UnifiedHistoryManager();
      expect(manager.entries).toEqual([]);
      expect(manager.position).toBe(-1);
      expect(manager.bookmarks).toBeInstanceOf(Map);
    });

    it('should accept custom options', () => {
      const manager = new UnifiedHistoryManager({
        maxSize: 500,
        historyDir: '/custom/path'
      });
      expect(manager.maxSize).toBe(500);
      expect(manager.historyDir).toBe('/custom/path');
    });

    it('should extend EventEmitter', () => {
      const manager = new UnifiedHistoryManager();
      expect(manager).toBeInstanceOf(EventEmitter);
    });

    it('should generate session ID', () => {
      const manager = new UnifiedHistoryManager();
      expect(manager.sessionId).toBeDefined();
      expect(typeof manager.sessionId).toBe('string');
    });

    it('should accept custom session ID', () => {
      const manager = new UnifiedHistoryManager({ sessionId: 'custom-session' });
      expect(manager.sessionId).toBe('custom-session');
    });
  });

  // ===========================================================================
  // Add Entry Tests
  // ===========================================================================

  describe('add()', () => {
    it('should add entry to history', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test query');

      expect(manager.entries.length).toBe(1);
      expect(manager.entries[0].text).toBe('test query');
    });

    it('should add entry with options', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test query', { agent: 'Geralt', metadata: { model: 'gpt-4' } });

      expect(manager.entries[0].agent).toBe('Geralt');
      expect(manager.entries[0].metadata.model).toBe('gpt-4');
    });

    it('should add timestamp to entry', () => {
      const manager = new UnifiedHistoryManager();
      const before = Date.now();
      manager.add('test');
      const after = Date.now();

      expect(manager.entries[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(manager.entries[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should generate unique ID for entry', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test 1');
      manager.add('test 2');

      expect(manager.entries[0].id).toBeDefined();
      expect(manager.entries[1].id).toBeDefined();
      expect(manager.entries[0].id).not.toBe(manager.entries[1].id);
    });

    it('should emit add event', () => {
      const manager = new UnifiedHistoryManager();
      const spy = vi.fn();
      manager.on('add', spy);

      manager.add('test');

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ text: 'test' }));
    });

    it('should return entry object', () => {
      const manager = new UnifiedHistoryManager();
      const entry = manager.add('test');

      expect(entry).toBeDefined();
      expect(entry.text).toBe('test');
      expect(entry.id).toBeDefined();
    });

    it('should not add empty strings', () => {
      const manager = new UnifiedHistoryManager();
      const result1 = manager.add('');
      const result2 = manager.add('   ');

      expect(manager.entries.length).toBe(0);
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should trim text', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('  test  ');

      expect(manager.entries[0].text).toBe('test');
    });

    it('should include session ID', () => {
      const manager = new UnifiedHistoryManager({ sessionId: 'test-session' });
      manager.add('test');

      expect(manager.entries[0].sessionId).toBe('test-session');
    });
  });

  // ===========================================================================
  // Navigation Tests
  // ===========================================================================

  describe('navigation', () => {
    describe('previous()', () => {
      it('should return previous entry', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('first');
        manager.add('second');
        manager.add('third');
        manager.resetPosition();

        const entry = manager.previous();
        expect(entry.text).toBe('third');
      });

      it('should navigate through history', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('first');
        manager.add('second');
        manager.add('third');
        manager.resetPosition();

        expect(manager.previous().text).toBe('third');
        expect(manager.previous().text).toBe('second');
        expect(manager.previous().text).toBe('first');
      });

      it('should stay at first entry', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('first');
        manager.resetPosition();

        manager.previous();
        const result = manager.previous();

        expect(result.text).toBe('first');
      });

      it('should return null for empty history', () => {
        const manager = new UnifiedHistoryManager();
        expect(manager.previous()).toBeNull();
      });
    });

    describe('next()', () => {
      it('should return next entry', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('first');
        manager.add('second');
        manager.resetPosition();

        manager.previous();
        manager.previous();
        const entry = manager.next();

        expect(entry.text).toBe('second');
      });

      it('should return null at end of history', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('first');
        manager.resetPosition();

        expect(manager.next()).toBeNull();
      });
    });

    describe('resetPosition()', () => {
      it('should reset navigation position', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('first');
        manager.add('second');

        manager.previous();
        manager.resetPosition();

        expect(manager.previous().text).toBe('second');
      });
    });
  });

  // ===========================================================================
  // Search Tests
  // ===========================================================================

  describe('search()', () => {
    it('should delegate to search engine', () => {
      const manager = new UnifiedHistoryManager();
      manager.search('test');

      expect(manager.searchEngine.search).toHaveBeenCalledWith('test', {});
    });

    it('should pass options to search engine', () => {
      const manager = new UnifiedHistoryManager();
      manager.search('test', { limit: 5 });

      expect(manager.searchEngine.search).toHaveBeenCalledWith('test', { limit: 5 });
    });
  });

  describe('fuzzySearch()', () => {
    it('should delegate to search engine', () => {
      const manager = new UnifiedHistoryManager();
      manager.fuzzySearch('test');

      expect(manager.searchEngine.fuzzySearch).toHaveBeenCalledWith('test', {});
    });
  });

  describe('searchPrefix()', () => {
    it('should find entries starting with prefix', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('hello world');
      manager.add('help me');
      manager.add('goodbye');

      const results = manager.searchPrefix('hel');

      expect(results.length).toBe(2);
      expect(results).toContain('hello world');
      expect(results).toContain('help me');
    });

    it('should be case insensitive', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('Hello World');

      const results = manager.searchPrefix('hello');

      expect(results.length).toBe(1);
    });
  });

  // ===========================================================================
  // Bookmark Tests
  // ===========================================================================

  describe('bookmarks', () => {
    describe('addBookmark()', () => {
      it('should add bookmark to entry', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test');
        const entry = manager.entries[0];

        const result = manager.addBookmark(entry.id, 'my-bookmark');

        expect(result).toBe(true);
        expect(manager.bookmarks.has('my-bookmark')).toBe(true);
      });

      it('should return false for non-existent entry', () => {
        const manager = new UnifiedHistoryManager();
        const result = manager.addBookmark('nonexistent', 'bookmark');

        expect(result).toBe(false);
      });

      it('should emit bookmarkAdded event', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test');
        const entry = manager.entries[0];
        const spy = vi.fn();
        manager.on('bookmarkAdded', spy);

        manager.addBookmark(entry.id, 'test-bookmark');

        expect(spy).toHaveBeenCalledWith('test-bookmark', entry);
      });

      it('should store bookmark data', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test entry');
        const entry = manager.entries[0];
        manager.addBookmark(entry.id, 'saved');

        const bookmark = manager.bookmarks.get('saved');
        expect(bookmark.entryId).toBe(entry.id);
        expect(bookmark.text).toBe('test entry');
        expect(bookmark.bookmarkedAt).toBeDefined();
      });
    });

    describe('getBookmark()', () => {
      it('should retrieve bookmark data', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test entry');
        const entry = manager.entries[0];
        manager.addBookmark(entry.id, 'saved');

        const retrieved = manager.getBookmark('saved');

        expect(retrieved.text).toBe('test entry');
        expect(retrieved.entryId).toBe(entry.id);
      });

      it('should return null for non-existent bookmark', () => {
        const manager = new UnifiedHistoryManager();
        expect(manager.getBookmark('nonexistent')).toBeNull();
      });
    });

    describe('removeBookmark()', () => {
      it('should remove bookmark', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test');
        const entry = manager.entries[0];
        manager.addBookmark(entry.id, 'to-remove');

        const result = manager.removeBookmark('to-remove');

        expect(result).toBe(true);
        expect(manager.bookmarks.has('to-remove')).toBe(false);
      });

      it('should return false for non-existent bookmark', () => {
        const manager = new UnifiedHistoryManager();
        const result = manager.removeBookmark('nonexistent');

        expect(result).toBe(false);
      });

      it('should emit bookmarkRemoved event', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test');
        manager.addBookmark(manager.entries[0].id, 'bm');
        const spy = vi.fn();
        manager.on('bookmarkRemoved', spy);

        manager.removeBookmark('bm');

        expect(spy).toHaveBeenCalledWith('bm');
      });
    });

    describe('listBookmarks()', () => {
      it('should list all bookmarks', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test 1');
        manager.add('test 2');
        manager.addBookmark(manager.entries[0].id, 'bookmark1');
        manager.addBookmark(manager.entries[1].id, 'bookmark2');

        const bookmarks = manager.listBookmarks();

        expect(bookmarks.length).toBe(2);
        expect(bookmarks.some(b => b.name === 'bookmark1')).toBe(true);
        expect(bookmarks.some(b => b.name === 'bookmark2')).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Tag Tests
  // ===========================================================================

  describe('tags', () => {
    describe('auto-tagging', () => {
      it('should auto-tag debug entries', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('fix this bug please');

        expect(manager.entries[0].tags).toContain('debug');
      });

      it('should auto-tag testing entries', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('write a unit test');

        expect(manager.entries[0].tags).toContain('testing');
      });

      it('should auto-tag feature entries', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('implement new feature');

        expect(manager.entries[0].tags).toContain('feature');
      });

      it('should auto-tag security entries', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('check auth permission');

        expect(manager.entries[0].tags).toContain('security');
      });
    });

    describe('getByTag()', () => {
      it('should find entries by tag', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('fix this bug');
        manager.add('something else');
        manager.add('another error to fix');

        const results = manager.getByTag('debug');

        expect(results.length).toBe(2);
      });

      it('should return empty array for non-existent tag', () => {
        const manager = new UnifiedHistoryManager();
        const results = manager.getByTag('nonexistent');

        expect(results).toEqual([]);
      });
    });

    describe('getAllTags()', () => {
      it('should return all unique tags', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('fix bug');
        manager.add('write test');
        manager.add('add feature');

        const tags = manager.getAllTags();

        expect(tags).toContain('debug');
        expect(tags).toContain('testing');
        expect(tags).toContain('feature');
      });
    });

    it('should accept custom tags', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test', { tags: ['custom', 'tags'] });

      expect(manager.entries[0].tags).toContain('custom');
      expect(manager.entries[0].tags).toContain('tags');
    });
  });

  // ===========================================================================
  // Export Tests
  // ===========================================================================

  describe('export()', () => {
    it('should export as JSON by default', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test entry');

      const exported = manager.export();
      const parsed = JSON.parse(exported);

      expect(parsed.length).toBe(1);
      expect(parsed[0].text).toBe('test entry');
    });

    it('should export as JSON explicitly', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test entry');

      const exported = manager.export('json');
      const parsed = JSON.parse(exported);

      expect(parsed.length).toBe(1);
    });

    it('should export as Markdown', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test entry');

      const exported = manager.export('md');

      expect(exported).toContain('test entry');
      expect(exported).toContain('##');
    });

    it('should export as HTML', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test entry');

      const exported = manager.export('html');

      expect(exported).toContain('<!DOCTYPE html>');
      expect(exported).toContain('test entry');
    });
  });

  // ===========================================================================
  // Retrieval Tests
  // ===========================================================================

  describe('retrieval methods', () => {
    describe('getRecent()', () => {
      it('should return recent entries', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('one');
        manager.add('two');
        manager.add('three');

        const recent = manager.getRecent(2);

        expect(recent.length).toBe(2);
        expect(recent[0].text).toBe('two');
        expect(recent[1].text).toBe('three');
      });

      it('should default to 10 entries', () => {
        const manager = new UnifiedHistoryManager();
        for (let i = 0; i < 15; i++) {
          manager.add(`entry ${i}`);
        }

        const recent = manager.getRecent();

        expect(recent.length).toBe(10);
      });
    });

    describe('getBySession()', () => {
      it('should find entries by session ID', () => {
        const manager = new UnifiedHistoryManager({ sessionId: 'session-1' });
        manager.add('test');

        const results = manager.getBySession('session-1');

        expect(results.length).toBe(1);
      });
    });

    describe('getCurrentSession()', () => {
      it('should return current session entries', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test 1');
        manager.add('test 2');

        const results = manager.getCurrentSession();

        expect(results.length).toBe(2);
      });
    });

    describe('getAll()', () => {
      it('should return all entries', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('one');
        manager.add('two');

        const all = manager.getAll();

        expect(all.length).toBe(2);
      });

      it('should return a copy', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('test');

        const all = manager.getAll();
        all.push({ text: 'fake' });

        expect(manager.entries.length).toBe(1);
      });
    });

    describe('count', () => {
      it('should return entry count', () => {
        const manager = new UnifiedHistoryManager();
        manager.add('one');
        manager.add('two');

        expect(manager.count).toBe(2);
      });
    });
  });

  // ===========================================================================
  // Clear Tests
  // ===========================================================================

  describe('clear()', () => {
    it('should clear all entries', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('one');
      manager.add('two');
      manager.clear();

      expect(manager.entries.length).toBe(0);
    });

    it('should reset position', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test');
      manager.previous();
      manager.clear();

      expect(manager.position).toBe(-1);
    });

    it('should clear search engine', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test');
      manager.clear();

      expect(manager.searchEngine.clear).toHaveBeenCalled();
    });

    it('should clear tags', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('fix bug');
      manager.clear();

      expect(manager.tags.size).toBe(0);
    });

    it('should emit clear event', () => {
      const manager = new UnifiedHistoryManager();
      const spy = vi.fn();
      manager.on('clear', spy);

      manager.clear();

      expect(spy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Statistics Tests
  // ===========================================================================

  describe('getStats()', () => {
    it('should return statistics', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('one');
      manager.add('two');

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.today).toBe(2);
      expect(stats.thisWeek).toBe(2);
    });

    it('should count entries by agent', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('one', { agent: 'Geralt' });
      manager.add('two', { agent: 'Geralt' });
      manager.add('three', { agent: 'Yennefer' });

      const stats = manager.getStats();

      expect(stats.byAgent.Geralt).toBe(2);
      expect(stats.byAgent.Yennefer).toBe(1);
    });

    it('should include bookmark count', () => {
      const manager = new UnifiedHistoryManager();
      manager.add('test');
      manager.addBookmark(manager.entries[0].id, 'bm');

      const stats = manager.getStats();

      expect(stats.bookmarks).toBe(1);
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createHistoryManager()', () => {
    it('should create UnifiedHistoryManager instance', () => {
      const manager = createHistoryManager();
      expect(manager).toBeInstanceOf(UnifiedHistoryManager);
    });

    it('should pass options to constructor', () => {
      const manager = createHistoryManager({ maxSize: 100 });
      expect(manager.maxSize).toBe(100);
    });
  });
});
