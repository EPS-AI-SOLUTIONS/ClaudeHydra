/**
 * CLI Autocomplete System
 * Context-aware autocompletion with multiple providers
 * @module cli/Autocomplete
 */

import { promises as fs } from 'fs';
import { resolve, dirname, basename, join } from 'path';

/**
 * @typedef {Object} CompletionResult
 * @property {string[]} suggestions - Completion suggestions
 * @property {number} startIndex - Start index in input
 * @property {number} endIndex - End index in input
 * @property {string} prefix - Common prefix
 */

/**
 * @typedef {Object} CompletionProvider
 * @property {string} name - Provider name
 * @property {number} [priority=0] - Priority (higher = first)
 * @property {function(string, number): Promise<CompletionResult|null>} complete - Complete function
 */

/**
 * Autocomplete manager with pluggable providers
 */
export class Autocomplete {
  /** @type {CompletionProvider[]} */
  #providers = [];

  /**
   * Add a completion provider
   * @param {CompletionProvider} provider - Provider to add
   * @returns {Autocomplete} This autocomplete for chaining
   */
  addProvider(provider) {
    if (!provider.name || !provider.complete) {
      throw new Error('Provider must have name and complete function');
    }

    this.#providers.push({
      ...provider,
      priority: provider.priority || 0
    });

    // Sort by priority (descending)
    this.#providers.sort((a, b) => b.priority - a.priority);

    return this;
  }

  /**
   * Remove a provider by name
   * @param {string} name - Provider name
   * @returns {boolean} True if removed
   */
  removeProvider(name) {
    const index = this.#providers.findIndex(p => p.name === name);
    if (index !== -1) {
      this.#providers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get completions for input
   * @param {string} input - Current input string
   * @param {number} [cursorPos] - Cursor position (defaults to end)
   * @returns {Promise<CompletionResult>} Completion result
   */
  async complete(input, cursorPos) {
    const pos = cursorPos ?? input.length;

    // Try each provider in priority order
    for (const provider of this.#providers) {
      try {
        const result = await provider.complete(input, pos);
        if (result && result.suggestions.length > 0) {
          return result;
        }
      } catch (error) {
        // Provider failed, try next
        console.error(`Autocomplete provider ${provider.name} failed:`, error.message);
      }
    }

    // No completions found
    return {
      suggestions: [],
      startIndex: pos,
      endIndex: pos,
      prefix: ''
    };
  }

  /**
   * Get the common prefix of suggestions
   * @param {string[]} suggestions - List of suggestions
   * @returns {string} Common prefix
   */
  static getCommonPrefix(suggestions) {
    if (suggestions.length === 0) return '';
    if (suggestions.length === 1) return suggestions[0];

    let prefix = suggestions[0];
    for (let i = 1; i < suggestions.length; i++) {
      while (!suggestions[i].startsWith(prefix) && prefix.length > 0) {
        prefix = prefix.slice(0, -1);
      }
    }
    return prefix;
  }

  /**
   * Apply completion to input
   * @param {string} input - Current input
   * @param {CompletionResult} completion - Completion result
   * @param {number} selectedIndex - Selected suggestion index
   * @returns {{text: string, cursorPos: number}} New input and cursor position
   */
  static apply(input, completion, selectedIndex = 0) {
    if (completion.suggestions.length === 0) {
      return { text: input, cursorPos: input.length };
    }

    const suggestion = completion.suggestions[selectedIndex];
    const before = input.slice(0, completion.startIndex);
    const after = input.slice(completion.endIndex);
    const text = before + suggestion + after;

    return {
      text,
      cursorPos: before.length + suggestion.length
    };
  }

  // ============ Built-in Providers ============

  /**
   * Create a command completion provider
   * @param {import('./CommandParser.js').CommandParser} parser - Command parser
   * @returns {CompletionProvider} Command provider
   */
  static CommandProvider(parser) {
    return {
      name: 'commands',
      priority: 100,
      complete: async (input, cursorPos) => {
        // Only complete commands at start of input
        if (!input.startsWith('/')) return null;

        const partial = input.slice(0, cursorPos);
        const suggestions = parser.getCompletions(partial);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex: 0,
          endIndex: cursorPos,
          prefix: Autocomplete.getCommonPrefix(suggestions)
        };
      }
    };
  }

  /**
   * Create a history completion provider
   * @param {import('./HistoryManager.js').HistoryManager} history - History manager
   * @returns {CompletionProvider} History provider
   */
  static HistoryProvider(history) {
    return {
      name: 'history',
      priority: 50,
      complete: async (input, cursorPos) => {
        if (!input || input.startsWith('/')) return null;

        const partial = input.slice(0, cursorPos);
        const matches = history.searchPrefix(partial);

        if (matches.length === 0) return null;

        return {
          suggestions: matches.slice(0, 10), // Limit to 10
          startIndex: 0,
          endIndex: cursorPos,
          prefix: Autocomplete.getCommonPrefix(matches)
        };
      }
    };
  }

  /**
   * Create a file path completion provider
   * @returns {CompletionProvider} File path provider
   */
  static FilePathProvider() {
    return {
      name: 'filepath',
      priority: 30,
      complete: async (input, cursorPos) => {
        // Find path-like token at cursor
        const beforeCursor = input.slice(0, cursorPos);
        const match = beforeCursor.match(/(?:^|\s)((?:\.{1,2}\/|\/|~\/|[a-zA-Z]:\\)[^\s]*)$/);

        if (!match) return null;

        const pathPart = match[1];
        const startIndex = cursorPos - pathPart.length;

        try {
          // Expand ~ to home directory
          let expandedPath = pathPart.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '');

          // Get directory and partial filename
          const dir = dirname(expandedPath);
          const partial = basename(expandedPath);
          const resolvedDir = resolve(dir);

          // Read directory
          const entries = await fs.readdir(resolvedDir, { withFileTypes: true });

          // Filter matching entries
          const suggestions = entries
            .filter(entry => entry.name.startsWith(partial) || !partial)
            .map(entry => {
              const name = entry.name;
              const suffix = entry.isDirectory() ? '/' : '';
              return join(dir, name) + suffix;
            })
            .slice(0, 20); // Limit results

          if (suggestions.length === 0) return null;

          return {
            suggestions,
            startIndex,
            endIndex: cursorPos,
            prefix: Autocomplete.getCommonPrefix(suggestions)
          };
        } catch {
          return null;
        }
      }
    };
  }

  /**
   * Create a model completion provider
   * @param {string[]} models - Available model names
   * @returns {CompletionProvider} Model provider
   */
  static ModelProvider(models) {
    return {
      name: 'models',
      priority: 40,
      complete: async (input, cursorPos) => {
        // Look for --model= or -m flag
        const beforeCursor = input.slice(0, cursorPos);
        const match = beforeCursor.match(/(?:--model=?|-m\s+)([^\s]*)$/);

        if (!match) return null;

        const partial = match[1].toLowerCase();
        const startIndex = cursorPos - partial.length;

        const suggestions = models
          .filter(model => model.toLowerCase().startsWith(partial))
          .slice(0, 10);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex,
          endIndex: cursorPos,
          prefix: Autocomplete.getCommonPrefix(suggestions)
        };
      }
    };
  }

  /**
   * Create a static list completion provider
   * @param {string} name - Provider name
   * @param {string[]} items - Items to complete
   * @param {RegExp} [pattern] - Pattern to match for triggering
   * @returns {CompletionProvider} Static provider
   */
  static StaticProvider(name, items, pattern) {
    return {
      name,
      priority: 20,
      complete: async (input, cursorPos) => {
        const beforeCursor = input.slice(0, cursorPos);

        if (pattern) {
          const match = beforeCursor.match(pattern);
          if (!match) return null;

          const partial = match[1] || '';
          const startIndex = cursorPos - partial.length;

          const suggestions = items
            .filter(item => item.toLowerCase().startsWith(partial.toLowerCase()))
            .slice(0, 10);

          if (suggestions.length === 0) return null;

          return {
            suggestions,
            startIndex,
            endIndex: cursorPos,
            prefix: Autocomplete.getCommonPrefix(suggestions)
          };
        }

        // Match from word boundary
        const wordMatch = beforeCursor.match(/(\S*)$/);
        const partial = wordMatch ? wordMatch[1].toLowerCase() : '';
        const startIndex = cursorPos - partial.length;

        const suggestions = items
          .filter(item => item.toLowerCase().startsWith(partial))
          .slice(0, 10);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex,
          endIndex: cursorPos,
          prefix: Autocomplete.getCommonPrefix(suggestions)
        };
      }
    };
  }

  /**
   * Create a dynamic model completion provider that fetches models from Ollama API
   * @param {Object} [options] - Provider options
   * @param {string} [options.baseUrl='http://localhost:11434'] - Ollama API base URL
   * @param {number} [options.cacheTimeout=60000] - Cache timeout in ms (default: 1 minute)
   * @returns {CompletionProvider} Dynamic model provider
   */
  static DynamicModelProvider(options = {}) {
    const baseUrl = options.baseUrl || 'http://localhost:11434';
    const cacheTimeout = options.cacheTimeout || 60000;

    let cachedModels = [];
    let lastFetch = 0;

    /**
     * Fetch models from Ollama API
     * @returns {Promise<string[]>} List of model names
     */
    async function fetchModels() {
      const now = Date.now();

      // Return cached models if still valid
      if (cachedModels.length > 0 && (now - lastFetch) < cacheTimeout) {
        return cachedModels;
      }

      try {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) {
          return cachedModels; // Return old cache on error
        }
        const data = await response.json();

        if (data.models && Array.isArray(data.models)) {
          cachedModels = data.models.map(m => m.name);
          lastFetch = now;
        }

        return cachedModels;
      } catch {
        // Return old cache on network error
        return cachedModels;
      }
    }

    return {
      name: 'dynamic-models',
      priority: 45, // Higher than static ModelProvider
      complete: async (input, cursorPos) => {
        // Look for --model= or -m flag or after /model command
        const beforeCursor = input.slice(0, cursorPos);
        const match = beforeCursor.match(/(?:--model=?|-m\s+|\/models?\s+)([^\s]*)$/i);

        if (!match) return null;

        const partial = match[1].toLowerCase();
        const startIndex = cursorPos - partial.length;

        // Fetch models dynamically
        const models = await fetchModels();

        if (models.length === 0) return null;

        const suggestions = models
          .filter(model => model.toLowerCase().startsWith(partial))
          .slice(0, 10);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex,
          endIndex: cursorPos,
          prefix: Autocomplete.getCommonPrefix(suggestions)
        };
      },
      // Expose method to manually refresh cache
      refreshCache: async () => {
        lastFetch = 0;
        return await fetchModels();
      },
      // Expose method to get current cached models
      getCachedModels: () => [...cachedModels]
    };
  }
}

/**
 * Create a new autocomplete manager
 * @returns {Autocomplete} New autocomplete instance
 */
export function createAutocomplete() {
  return new Autocomplete();
}

export default Autocomplete;
