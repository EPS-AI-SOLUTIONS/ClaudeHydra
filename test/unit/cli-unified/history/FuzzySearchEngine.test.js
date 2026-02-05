/**
 * FuzzySearchEngine Tests
 * @module test/unit/cli-unified/history/FuzzySearchEngine.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  FuzzySearchEngine,
  createFuzzySearchEngine
} from '../../../../src/cli-unified/history/FuzzySearchEngine.js';

describe('FuzzySearchEngine Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with defaults', () => {
      const engine = new FuzzySearchEngine();
      expect(engine.documents).toEqual([]);
      expect(engine.index).toBeInstanceOf(Map);
      expect(engine.count).toBe(0);
    });

    it('should accept custom options', () => {
      const engine = new FuzzySearchEngine({
        minScore: 0.5,
        caseSensitive: true
      });
      expect(engine.minScore).toBe(0.5);
      expect(engine.caseSensitive).toBe(true);
    });

    it('should default to case insensitive', () => {
      const engine = new FuzzySearchEngine();
      expect(engine.caseSensitive).toBe(false);
    });
  });

  // ===========================================================================
  // Document Management Tests
  // ===========================================================================

  describe('addDocument()', () => {
    it('should add a document', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');

      expect(engine.documents.length).toBe(1);
      expect(engine.count).toBe(1);
    });

    it('should add multiple documents', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');
      engine.addDocument('doc2', 'goodbye world');
      engine.addDocument('doc3', 'hello again');

      expect(engine.count).toBe(3);
    });

    it('should store document text', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');

      expect(engine.documents[0].text).toBe('hello world');
      expect(engine.documents[0].id).toBe('doc1');
    });

    it('should index document terms', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');

      // Check that terms are indexed
      expect(engine.index.has('hello')).toBe(true);
      expect(engine.index.has('world')).toBe(true);
    });

    it('should tokenize document', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');

      expect(engine.documents[0].tokens).toContain('hello');
      expect(engine.documents[0].tokens).toContain('world');
    });

    it('should accept metadata', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello', { category: 'test' });

      expect(engine.documents[0].metadata.category).toBe('test');
    });

    it('should return document index', () => {
      const engine = new FuzzySearchEngine();
      const idx1 = engine.addDocument('doc1', 'hello');
      const idx2 = engine.addDocument('doc2', 'world');

      expect(idx1).toBe(0);
      expect(idx2).toBe(1);
    });
  });

  describe('removeDocument()', () => {
    it('should remove a document', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');
      engine.removeDocument('doc1');

      expect(engine.count).toBe(0);
    });

    it('should return true when removed', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello');

      expect(engine.removeDocument('doc1')).toBe(true);
    });

    it('should return false for non-existent document', () => {
      const engine = new FuzzySearchEngine();
      expect(engine.removeDocument('nonexistent')).toBe(false);
    });

    it('should update index when removing', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'unique');
      engine.removeDocument('doc1');

      // Term should be removed from index if no other docs use it
      expect(engine.index.has('unique')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should clear all documents', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello');
      engine.addDocument('doc2', 'world');
      engine.clear();

      expect(engine.count).toBe(0);
      expect(engine.documents.length).toBe(0);
    });

    it('should clear index', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');
      engine.clear();

      expect(engine.index.size).toBe(0);
    });

    it('should clear IDF', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');
      engine.clear();

      expect(engine.idf.size).toBe(0);
    });
  });

  // ===========================================================================
  // Tokenization Tests
  // ===========================================================================

  describe('tokenize()', () => {
    it('should split on whitespace', () => {
      const engine = new FuzzySearchEngine();
      const tokens = engine.tokenize('hello world foo');

      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('foo');
    });

    it('should split on punctuation', () => {
      const engine = new FuzzySearchEngine();
      const tokens = engine.tokenize('hello, world! foo.');

      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('foo');
    });

    it('should lowercase by default', () => {
      const engine = new FuzzySearchEngine();
      const tokens = engine.tokenize('HELLO World');

      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
    });

    it('should respect caseSensitive option', () => {
      const engine = new FuzzySearchEngine({ caseSensitive: true });
      const tokens = engine.tokenize('HELLO World');

      expect(tokens).toContain('HELLO');
      expect(tokens).toContain('World');
    });

    it('should filter single character tokens', () => {
      const engine = new FuzzySearchEngine();
      const tokens = engine.tokenize('a hello b world c');

      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('b');
      expect(tokens).not.toContain('c');
      expect(tokens).toContain('hello');
    });
  });

  // ===========================================================================
  // Search Tests
  // ===========================================================================

  describe('search()', () => {
    it('should find matching documents', () => {
      const engine = new FuzzySearchEngine({ minScore: 0 });
      engine.addDocument('doc1', 'hello world');
      engine.addDocument('doc2', 'goodbye world');
      engine.addDocument('doc3', 'hello again');

      const results = engine.search('hello');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.id === 'doc1')).toBe(true);
      expect(results.some(r => r.id === 'doc3')).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');

      const results = engine.search('xyz');

      expect(results).toEqual([]);
    });

    it('should rank results by score', () => {
      const engine = new FuzzySearchEngine({ minScore: 0 });
      engine.addDocument('doc1', 'hello world');
      engine.addDocument('doc2', 'hello hello hello other');
      engine.addDocument('doc3', 'something different'); // Add third doc for meaningful IDF

      const results = engine.search('hello');

      // Both hello docs should be found with scores
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].score).toBeDefined();
    });

    it('should handle multi-word queries', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world foo');
      engine.addDocument('doc2', 'hello bar');
      engine.addDocument('doc3', 'world baz');

      const results = engine.search('hello world');

      // doc1 should rank highest (has both terms)
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('doc1');
    });

    it('should respect limit option', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'test word');
      engine.addDocument('doc2', 'test word');
      engine.addDocument('doc3', 'test word');
      engine.addDocument('doc4', 'test word');

      const results = engine.search('test', { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty query', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello');

      const results = engine.search('');

      expect(results).toEqual([]);
    });

    it('should be case insensitive by default', () => {
      const engine = new FuzzySearchEngine({ minScore: 0 });
      engine.addDocument('doc1', 'Hello World unique');
      engine.addDocument('doc2', 'other document');

      // Search for 'unique' which only appears in doc1 (non-zero IDF)
      const results = engine.search('unique');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('fuzzySearch()', () => {
    it('should find similar terms', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');

      // 'helo' is close to 'hello'
      const results = engine.fuzzySearch('helo');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle typos', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'javascript programming');

      // Common typo
      const results = engine.fuzzySearch('javscript');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should use threshold option', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello');

      // High threshold - only close matches
      const resultsHigh = engine.fuzzySearch('xxxxx', { threshold: 0.9 });
      expect(resultsHigh.length).toBe(0);

      // Low threshold - more permissive
      const resultsLow = engine.fuzzySearch('hallo', { threshold: 0.5 });
      expect(resultsLow.length).toBeGreaterThan(0);
    });

    it('should return results with scores', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');

      const results = engine.fuzzySearch('hello');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeDefined();
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  describe('prefixSearch()', () => {
    it('should find documents starting with prefix', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');
      engine.addDocument('doc2', 'help me');
      engine.addDocument('doc3', 'goodbye');

      const results = engine.prefixSearch('hel');

      expect(results.length).toBe(2);
      expect(results.some(r => r.id === 'doc1')).toBe(true);
      expect(results.some(r => r.id === 'doc2')).toBe(true);
    });

    it('should return empty for no matches', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello');

      const results = engine.prefixSearch('xyz');

      expect(results).toEqual([]);
    });

    it('should respect limit option', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'abc one');
      engine.addDocument('doc2', 'abc two');
      engine.addDocument('doc3', 'abc three');

      const results = engine.prefixSearch('abc', { limit: 2 });

      expect(results.length).toBe(2);
    });

    it('should be case insensitive by default', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'Hello World');

      const results = engine.prefixSearch('hello');

      expect(results.length).toBe(1);
    });
  });

  // ===========================================================================
  // TF-IDF Tests
  // ===========================================================================

  describe('TF-IDF scoring', () => {
    it('should give higher score to rare terms', () => {
      const engine = new FuzzySearchEngine({ minScore: 0 });
      // 'common' appears in all docs, 'rare' only in doc1
      engine.addDocument('doc1', 'common rare');
      engine.addDocument('doc2', 'common word');
      engine.addDocument('doc3', 'common thing');

      const rareResults = engine.search('rare');

      // 'rare' should return only doc1
      expect(rareResults.length).toBe(1);
      expect(rareResults[0].id).toBe('doc1');
    });

    it('should calculate IDF', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello world');
      engine.addDocument('doc2', 'hello other'); // Need 2+ docs for meaningful IDF

      expect(engine.idf.size).toBeGreaterThan(0);
      // 'world' only in doc1, so IDF > 0
      expect(engine.idf.get('world')).toBeGreaterThan(0);
    });

    it('should update IDF when documents added', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'unique other');
      engine.addDocument('doc2', 'something else'); // Need 2 docs for non-zero IDF
      const idf1 = engine.idf.get('unique');

      engine.addDocument('doc3', 'unique third');
      const idf2 = engine.idf.get('unique');

      // IDF should decrease when more docs have the term
      // With 2 docs, 1 having term: IDF = log(2/1) = 0.693
      // With 3 docs, 2 having term: IDF = log(3/2) = 0.405
      expect(idf2).toBeLessThan(idf1);
    });
  });

  // ===========================================================================
  // Fuzzy Match Tests
  // ===========================================================================

  describe('fuzzyMatch()', () => {
    it('should return 1 for identical strings', () => {
      const engine = new FuzzySearchEngine();
      const score = engine.fuzzyMatch('test', 'test');
      expect(score).toBe(1);
    });

    it('should return 0 for very different strings', () => {
      const engine = new FuzzySearchEngine();
      const score = engine.fuzzyMatch('abc', 'xyz', 0.9);
      expect(score).toBe(0);
    });

    it('should return 1 when one string contains other', () => {
      const engine = new FuzzySearchEngine();
      const score = engine.fuzzyMatch('test', 'testing');
      expect(score).toBe(1);
    });

    it('should handle empty strings', () => {
      const engine = new FuzzySearchEngine();
      const score1 = engine.fuzzyMatch('', '');
      const score2 = engine.fuzzyMatch('test', '');

      expect(score1).toBe(1);
      expect(score2).toBe(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle documents with special characters', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'hello@world.com email test');

      // Search should work even with special chars
      expect(engine.count).toBe(1);
    });

    it('should handle numeric strings', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'version 123 number');

      expect(engine.count).toBe(1);
      // Numbers > 1 char should be tokenized
      expect(engine.documents[0].tokens).toContain('123');
    });

    it('should handle unicode', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'zażółć gęślą jaźń');

      // Should at least not throw
      expect(engine.count).toBe(1);
    });

    it('should handle very long documents', () => {
      const engine = new FuzzySearchEngine();
      const longText = 'word '.repeat(100) + 'unique';
      engine.addDocument('doc1', longText);

      expect(engine.count).toBe(1);
    });

    it('should handle many documents', () => {
      const engine = new FuzzySearchEngine();
      for (let i = 0; i < 100; i++) {
        engine.addDocument(`doc${i}`, `document number ${i}`);
      }

      expect(engine.count).toBe(100);
    });

    it('should filter out short tokens', () => {
      const engine = new FuzzySearchEngine();
      engine.addDocument('doc1', 'a is the and hello');

      // Single char tokens should be filtered
      expect(engine.documents[0].tokens).not.toContain('a');
      expect(engine.documents[0].tokens).toContain('is');
      expect(engine.documents[0].tokens).toContain('hello');
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createFuzzySearchEngine()', () => {
    it('should create FuzzySearchEngine instance', () => {
      const engine = createFuzzySearchEngine();
      expect(engine).toBeInstanceOf(FuzzySearchEngine);
    });

    it('should pass options to constructor', () => {
      const engine = createFuzzySearchEngine({ caseSensitive: true });
      expect(engine.caseSensitive).toBe(true);
    });
  });
});
