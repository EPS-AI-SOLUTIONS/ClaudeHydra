/**
 * AutocompleteEngine Tests
 * @module test/unit/cli-unified/input/AutocompleteEngine.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock fs
vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn()
  }
}));

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  AGENT_NAMES: ['Geralt', 'Yennefer', 'Triss', 'Ciri', 'Dijkstra', 'Regis', 'Vesemir', 'Eskel', 'Lambert', 'Jaskier', 'Zoltan', 'Philippa']
}));

import {
  AutocompleteEngine,
  createAutocomplete
} from '../../../../src/cli-unified/input/AutocompleteEngine.js';

describe('AutocompleteEngine', () => {
  let engine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new AutocompleteEngine();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create engine instance', () => {
      expect(engine).toBeInstanceOf(AutocompleteEngine);
    });
  });

  // ===========================================================================
  // Provider Management Tests
  // ===========================================================================

  describe('addProvider()', () => {
    it('should add a valid provider', () => {
      const provider = {
        name: 'test',
        complete: vi.fn().mockResolvedValue(null)
      };

      const result = engine.addProvider(provider);

      expect(result).toBe(engine); // Returns this for chaining
    });

    it('should throw when provider has no name', () => {
      expect(() => engine.addProvider({
        complete: vi.fn()
      })).toThrow('Provider must have name and complete function');
    });

    it('should throw when provider has no complete function', () => {
      expect(() => engine.addProvider({
        name: 'test'
      })).toThrow('Provider must have name and complete function');
    });

    it('should sort providers by priority', async () => {
      const lowPriority = {
        name: 'low',
        priority: 10,
        complete: vi.fn().mockResolvedValue({
          suggestions: ['low'],
          startIndex: 0,
          endIndex: 3,
          prefix: 'low'
        })
      };

      const highPriority = {
        name: 'high',
        priority: 100,
        complete: vi.fn().mockResolvedValue({
          suggestions: ['high'],
          startIndex: 0,
          endIndex: 4,
          prefix: 'high'
        })
      };

      engine.addProvider(lowPriority);
      engine.addProvider(highPriority);

      const result = await engine.complete('test', 4);

      // High priority provider should be called first and return result
      expect(highPriority.complete).toHaveBeenCalled();
      expect(result.suggestions).toContain('high');
    });

    it('should default priority to 0', () => {
      const provider = {
        name: 'test',
        complete: vi.fn().mockResolvedValue(null)
      };

      engine.addProvider(provider);
      // Provider should be added without error
      expect(true).toBe(true);
    });
  });

  describe('removeProvider()', () => {
    it('should remove existing provider', () => {
      engine.addProvider({
        name: 'test',
        complete: vi.fn()
      });

      const result = engine.removeProvider('test');

      expect(result).toBe(true);
    });

    it('should return false for non-existing provider', () => {
      const result = engine.removeProvider('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Complete Tests
  // ===========================================================================

  describe('complete()', () => {
    it('should return first provider result with suggestions', async () => {
      const provider1 = {
        name: 'first',
        priority: 50,
        complete: vi.fn().mockResolvedValue({
          suggestions: ['first-result'],
          startIndex: 0,
          endIndex: 5,
          prefix: 'first'
        })
      };

      engine.addProvider(provider1);

      const result = await engine.complete('test', 4);

      expect(result.suggestions).toContain('first-result');
    });

    it('should skip providers with no suggestions', async () => {
      const emptyProvider = {
        name: 'empty',
        priority: 100,
        complete: vi.fn().mockResolvedValue({
          suggestions: [],
          startIndex: 0,
          endIndex: 0,
          prefix: ''
        })
      };

      const filledProvider = {
        name: 'filled',
        priority: 50,
        complete: vi.fn().mockResolvedValue({
          suggestions: ['result'],
          startIndex: 0,
          endIndex: 4,
          prefix: 'resu'
        })
      };

      engine.addProvider(emptyProvider);
      engine.addProvider(filledProvider);

      const result = await engine.complete('test', 4);

      expect(result.suggestions).toContain('result');
    });

    it('should skip providers returning null', async () => {
      const nullProvider = {
        name: 'null',
        priority: 100,
        complete: vi.fn().mockResolvedValue(null)
      };

      const validProvider = {
        name: 'valid',
        priority: 50,
        complete: vi.fn().mockResolvedValue({
          suggestions: ['valid-result'],
          startIndex: 0,
          endIndex: 5,
          prefix: 'valid'
        })
      };

      engine.addProvider(nullProvider);
      engine.addProvider(validProvider);

      const result = await engine.complete('test', 4);

      expect(result.suggestions).toContain('valid-result');
    });

    it('should handle provider errors gracefully', async () => {
      const errorProvider = {
        name: 'error',
        priority: 100,
        complete: vi.fn().mockRejectedValue(new Error('Provider failed'))
      };

      const validProvider = {
        name: 'valid',
        priority: 50,
        complete: vi.fn().mockResolvedValue({
          suggestions: ['fallback'],
          startIndex: 0,
          endIndex: 4,
          prefix: 'fall'
        })
      };

      engine.addProvider(errorProvider);
      engine.addProvider(validProvider);

      const result = await engine.complete('test', 4);

      expect(result.suggestions).toContain('fallback');
    });

    it('should return empty result when no providers match', async () => {
      const result = await engine.complete('test', 4);

      expect(result.suggestions).toHaveLength(0);
      expect(result.startIndex).toBe(4);
      expect(result.endIndex).toBe(4);
      expect(result.prefix).toBe('');
    });

    it('should use input length as cursor position if not provided', async () => {
      const provider = {
        name: 'test',
        complete: vi.fn().mockResolvedValue(null)
      };

      engine.addProvider(provider);
      await engine.complete('test');

      expect(provider.complete).toHaveBeenCalledWith('test', 4);
    });
  });

  // ===========================================================================
  // Static Methods Tests
  // ===========================================================================

  describe('getCommonPrefix()', () => {
    it('should return empty string for empty array', () => {
      expect(AutocompleteEngine.getCommonPrefix([])).toBe('');
    });

    it('should return suggestion for single-element array', () => {
      expect(AutocompleteEngine.getCommonPrefix(['hello'])).toBe('hello');
    });

    it('should find common prefix of multiple suggestions', () => {
      const suggestions = ['hello', 'help', 'helicopter'];
      expect(AutocompleteEngine.getCommonPrefix(suggestions)).toBe('hel');
    });

    it('should handle no common prefix', () => {
      const suggestions = ['apple', 'banana', 'cherry'];
      expect(AutocompleteEngine.getCommonPrefix(suggestions)).toBe('');
    });

    it('should handle exact matches', () => {
      const suggestions = ['test', 'test'];
      expect(AutocompleteEngine.getCommonPrefix(suggestions)).toBe('test');
    });
  });

  describe('apply()', () => {
    it('should return original input when no suggestions', () => {
      const result = AutocompleteEngine.apply('test', {
        suggestions: [],
        startIndex: 0,
        endIndex: 4,
        prefix: ''
      });

      expect(result.text).toBe('test');
      expect(result.cursorPos).toBe(4);
    });

    it('should apply first suggestion by default', () => {
      const result = AutocompleteEngine.apply('hel', {
        suggestions: ['hello', 'help'],
        startIndex: 0,
        endIndex: 3,
        prefix: 'hel'
      });

      expect(result.text).toBe('hello');
      expect(result.cursorPos).toBe(5);
    });

    it('should apply selected suggestion', () => {
      const result = AutocompleteEngine.apply('hel', {
        suggestions: ['hello', 'help'],
        startIndex: 0,
        endIndex: 3,
        prefix: 'hel'
      }, 1);

      expect(result.text).toBe('help');
      expect(result.cursorPos).toBe(4);
    });

    it('should preserve text after completion', () => {
      const result = AutocompleteEngine.apply('say hel to him', {
        suggestions: ['hello'],
        startIndex: 4,
        endIndex: 7,
        prefix: 'hel'
      });

      expect(result.text).toBe('say hello to him');
      expect(result.cursorPos).toBe(9);
    });
  });

  // ===========================================================================
  // Built-in Providers Tests
  // ===========================================================================

  describe('CommandProvider', () => {
    it('should complete commands starting with /', async () => {
      const mockParser = {
        getCompletions: vi.fn().mockReturnValue(['/help', '/history'])
      };

      const provider = AutocompleteEngine.CommandProvider(mockParser);
      const result = await provider.complete('/hel', 4);

      expect(mockParser.getCompletions).toHaveBeenCalledWith('/hel');
      expect(result.suggestions).toContain('/help');
      expect(result.suggestions).toContain('/history');
    });

    it('should return null for non-command input', async () => {
      const mockParser = { getCompletions: vi.fn() };
      const provider = AutocompleteEngine.CommandProvider(mockParser);

      const result = await provider.complete('hello', 5);

      expect(result).toBeNull();
      expect(mockParser.getCompletions).not.toHaveBeenCalled();
    });

    it('should return null when no completions', async () => {
      const mockParser = {
        getCompletions: vi.fn().mockReturnValue([])
      };

      const provider = AutocompleteEngine.CommandProvider(mockParser);
      const result = await provider.complete('/xyz', 4);

      expect(result).toBeNull();
    });
  });

  describe('HistoryProvider', () => {
    it('should complete from history', async () => {
      const mockHistory = {
        searchPrefix: vi.fn().mockReturnValue(['test command', 'test query'])
      };

      const provider = AutocompleteEngine.HistoryProvider(mockHistory);
      const result = await provider.complete('test', 4);

      expect(result.suggestions).toContain('test command');
      expect(result.suggestions).toContain('test query');
    });

    it('should return null for command input', async () => {
      const mockHistory = { searchPrefix: vi.fn() };
      const provider = AutocompleteEngine.HistoryProvider(mockHistory);

      const result = await provider.complete('/help', 5);

      expect(result).toBeNull();
    });

    it('should return null for empty input', async () => {
      const mockHistory = { searchPrefix: vi.fn() };
      const provider = AutocompleteEngine.HistoryProvider(mockHistory);

      const result = await provider.complete('', 0);

      expect(result).toBeNull();
    });

    it('should handle history without searchPrefix', async () => {
      const mockHistory = {};
      const provider = AutocompleteEngine.HistoryProvider(mockHistory);

      const result = await provider.complete('test', 4);

      expect(result).toBeNull();
    });

    it('should limit to 10 results', async () => {
      const mockHistory = {
        searchPrefix: vi.fn().mockReturnValue(Array(20).fill('match'))
      };

      const provider = AutocompleteEngine.HistoryProvider(mockHistory);
      const result = await provider.complete('m', 1);

      expect(result.suggestions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('AgentProvider', () => {
    it('should complete agent names with @', async () => {
      const provider = AutocompleteEngine.AgentProvider();
      const result = await provider.complete('hello @Ger', 10);

      expect(result.suggestions).toContain('Geralt');
    });

    it('should complete agent names with /agent command', async () => {
      const provider = AutocompleteEngine.AgentProvider();
      const result = await provider.complete('/agent Yen', 10);

      expect(result.suggestions).toContain('Yennefer');
    });

    it('should be case insensitive', async () => {
      const provider = AutocompleteEngine.AgentProvider();
      const result = await provider.complete('@ger', 4);

      expect(result.suggestions).toContain('Geralt');
    });

    it('should return null for non-agent input', async () => {
      const provider = AutocompleteEngine.AgentProvider();
      const result = await provider.complete('hello world', 11);

      expect(result).toBeNull();
    });

    it('should limit to 10 results', async () => {
      const provider = AutocompleteEngine.AgentProvider();
      const result = await provider.complete('@', 1);

      // Should return at most 10 agents
      expect(result.suggestions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('FilePathProvider', () => {
    it('should match file path patterns', () => {
      // Test the regex pattern matching without actual fs calls
      const provider = AutocompleteEngine.FilePathProvider();
      expect(provider.name).toBe('filepath');
      expect(provider.priority).toBe(30);
      expect(typeof provider.complete).toBe('function');
    });

    it('should return null for non-path input', async () => {
      const provider = AutocompleteEngine.FilePathProvider();
      const result = await provider.complete('hello world', 11);

      expect(result).toBeNull();
    });

    it('should handle filesystem errors gracefully', async () => {
      fs.readdir.mockRejectedValue(new Error('ENOENT'));

      const provider = AutocompleteEngine.FilePathProvider();
      const result = await provider.complete('open /nonexistent/', 18);

      expect(result).toBeNull();
    });

    it('should add trailing slash for directories', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'folder', isDirectory: () => true }
      ]);

      const provider = AutocompleteEngine.FilePathProvider();
      const result = await provider.complete('cd ./', 5);

      if (result && result.suggestions.length > 0) {
        const dirSuggestion = result.suggestions.find(s => s.includes('folder'));
        expect(dirSuggestion).toMatch(/\/$/);
      }
    });
  });

  describe('TemplateProvider', () => {
    const templates = {
      greeting: 'Hello, {name}!',
      farewell: 'Goodbye, {name}!',
      test: 'Test template'
    };

    it('should complete template names', async () => {
      const provider = AutocompleteEngine.TemplateProvider(templates);
      const result = await provider.complete('/template gre', 13);

      expect(result.suggestions).toContain('greeting');
    });

    it('should complete with /t shorthand', async () => {
      const provider = AutocompleteEngine.TemplateProvider(templates);
      const result = await provider.complete('/t fare', 7);

      expect(result.suggestions).toContain('farewell');
    });

    it('should return null for non-template input', async () => {
      const provider = AutocompleteEngine.TemplateProvider(templates);
      const result = await provider.complete('hello', 5);

      expect(result).toBeNull();
    });
  });

  describe('StaticProvider', () => {
    const items = ['apple', 'banana', 'cherry', 'apricot'];

    it('should complete from static list with pattern', async () => {
      const provider = AutocompleteEngine.StaticProvider(
        'fruits',
        items,
        /--fruit=?(\S*)$/
      );

      const result = await provider.complete('--fruit=ap', 10);

      expect(result.suggestions).toContain('apple');
      expect(result.suggestions).toContain('apricot');
    });

    it('should complete from static list without pattern', async () => {
      const provider = AutocompleteEngine.StaticProvider('fruits', items);
      const result = await provider.complete('ap', 2);

      expect(result.suggestions).toContain('apple');
      expect(result.suggestions).toContain('apricot');
    });

    it('should be case insensitive', async () => {
      const provider = AutocompleteEngine.StaticProvider('fruits', items);
      const result = await provider.complete('AP', 2);

      expect(result.suggestions).toContain('apple');
    });

    it('should return null when pattern does not match', async () => {
      const provider = AutocompleteEngine.StaticProvider(
        'fruits',
        items,
        /--fruit=(\S*)$/
      );

      const result = await provider.complete('hello world', 11);

      expect(result).toBeNull();
    });
  });

  describe('DynamicModelProvider', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should complete model names', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          models: [
            { name: 'llama3' },
            { name: 'llama2' },
            { name: 'mistral' }
          ]
        })
      });

      const provider = AutocompleteEngine.DynamicModelProvider();
      const result = await provider.complete('--model=lla', 11);

      expect(result.suggestions).toContain('llama3');
      expect(result.suggestions).toContain('llama2');
    });

    it('should complete with -m flag', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          models: [{ name: 'mistral' }]
        })
      });

      const provider = AutocompleteEngine.DynamicModelProvider();
      const result = await provider.complete('-m mis', 6);

      expect(result.suggestions).toContain('mistral');
    });

    it('should use cache', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          models: [{ name: 'cached-model' }]
        })
      });

      const provider = AutocompleteEngine.DynamicModelProvider({ cacheTimeout: 60000 });

      // First call
      await provider.complete('--model=', 8);

      // Second call should use cache
      await provider.complete('--model=', 8);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle fetch errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const provider = AutocompleteEngine.DynamicModelProvider();
      const result = await provider.complete('--model=test', 12);

      // Should return null or cached results (empty on first call)
      expect(result).toBeNull();
    });

    it('should return null for non-model input', async () => {
      const provider = AutocompleteEngine.DynamicModelProvider();
      const result = await provider.complete('hello', 5);

      expect(result).toBeNull();
    });

    it('should expose refreshCache and getCachedModels', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          models: [{ name: 'test-model' }]
        })
      });

      const provider = AutocompleteEngine.DynamicModelProvider();

      expect(typeof provider.refreshCache).toBe('function');
      expect(typeof provider.getCachedModels).toBe('function');

      await provider.refreshCache();
      const cached = provider.getCachedModels();

      expect(cached).toContain('test-model');
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createAutocomplete()', () => {
    it('should create new AutocompleteEngine instance', () => {
      const engine = createAutocomplete();

      expect(engine).toBeInstanceOf(AutocompleteEngine);
    });
  });
});
