/**
 * Unified Autocomplete Engine
 * Based on src/cli/Autocomplete.js with pluggable providers
 * @module cli-unified/input/AutocompleteEngine
 */

import { promises as fs } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { AGENT_NAMES } from '../core/constants.js';

/**
 * Autocomplete manager with pluggable providers
 */
export class AutocompleteEngine {
  #providers = [];

  /**
   * Add a completion provider
   */
  addProvider(provider) {
    if (!provider.name || !provider.complete) {
      throw new Error('Provider must have name and complete function');
    }

    this.#providers.push({
      ...provider,
      priority: provider.priority || 0,
    });

    this.#providers.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /**
   * Remove a provider by name
   */
  removeProvider(name) {
    const index = this.#providers.findIndex((p) => p.name === name);
    if (index !== -1) {
      this.#providers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get completions for input
   */
  async complete(input, cursorPos) {
    const pos = cursorPos ?? input.length;

    for (const provider of this.#providers) {
      try {
        const result = await provider.complete(input, pos);
        if (result && result.suggestions.length > 0) {
          return result;
        }
      } catch (_error) {
        // Provider failed, try next
      }
    }

    return {
      suggestions: [],
      startIndex: pos,
      endIndex: pos,
      prefix: '',
    };
  }

  /**
   * Get common prefix of suggestions
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
      cursorPos: before.length + suggestion.length,
    };
  }

  // ============ Built-in Providers ============

  /**
   * Command completion provider
   */
  static CommandProvider(parser) {
    return {
      name: 'commands',
      priority: 100,
      complete: async (input, cursorPos) => {
        if (!input.startsWith('/')) return null;

        const partial = input.slice(0, cursorPos);
        const suggestions = parser.getCompletions(partial);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex: 0,
          endIndex: cursorPos,
          prefix: AutocompleteEngine.getCommonPrefix(suggestions),
        };
      },
    };
  }

  /**
   * History completion provider
   */
  static HistoryProvider(history) {
    return {
      name: 'history',
      priority: 50,
      complete: async (input, cursorPos) => {
        if (!input || input.startsWith('/')) return null;

        const partial = input.slice(0, cursorPos);
        const matches = history.searchPrefix ? history.searchPrefix(partial) : [];

        if (matches.length === 0) return null;

        return {
          suggestions: matches.slice(0, 10),
          startIndex: 0,
          endIndex: cursorPos,
          prefix: AutocompleteEngine.getCommonPrefix(matches),
        };
      },
    };
  }

  /**
   * File path completion provider
   */
  static FilePathProvider() {
    return {
      name: 'filepath',
      priority: 30,
      complete: async (input, cursorPos) => {
        const beforeCursor = input.slice(0, cursorPos);
        const match = beforeCursor.match(/(?:^|\s)((?:\.{1,2}\/|\/|~\/|[a-zA-Z]:\\)[^\s]*)$/);

        if (!match) return null;

        const pathPart = match[1];
        const startIndex = cursorPos - pathPart.length;

        try {
          const expandedPath = pathPart.replace(
            /^~/,
            process.env.HOME || process.env.USERPROFILE || '',
          );

          const dir = dirname(expandedPath);
          const partial = basename(expandedPath);
          const resolvedDir = resolve(dir);

          const entries = await fs.readdir(resolvedDir, { withFileTypes: true });

          const suggestions = entries
            .filter((entry) => entry.name.startsWith(partial) || !partial)
            .map((entry) => {
              const suffix = entry.isDirectory() ? '/' : '';
              return join(dir, entry.name) + suffix;
            })
            .slice(0, 20);

          if (suggestions.length === 0) return null;

          return {
            suggestions,
            startIndex,
            endIndex: cursorPos,
            prefix: AutocompleteEngine.getCommonPrefix(suggestions),
          };
        } catch {
          return null;
        }
      },
    };
  }

  /**
   * Agent completion provider
   */
  static AgentProvider() {
    return {
      name: 'agents',
      priority: 60,
      complete: async (input, cursorPos) => {
        const beforeCursor = input.slice(0, cursorPos);
        const match = beforeCursor.match(/(?:@|\/agent\s+)([a-zA-Z]*)$/i);

        if (!match) return null;

        const partial = match[1].toLowerCase();
        const startIndex = cursorPos - partial.length;

        const suggestions = AGENT_NAMES.filter((name) =>
          name.toLowerCase().startsWith(partial),
        ).slice(0, 10);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex,
          endIndex: cursorPos,
          prefix: AutocompleteEngine.getCommonPrefix(suggestions),
        };
      },
    };
  }

  /**
   * Dynamic model provider (fetches from LlamaCpp)
   */
  static DynamicModelProvider(options = {}) {
    const baseUrl = options.baseUrl || 'http://localhost:11434';
    const cacheTimeout = options.cacheTimeout || 60000;

    let cachedModels = [];
    let lastFetch = 0;

    async function fetchModels() {
      const now = Date.now();
      if (cachedModels.length > 0 && now - lastFetch < cacheTimeout) {
        return cachedModels;
      }

      try {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) return cachedModels;
        const data = await response.json();

        if (data.models && Array.isArray(data.models)) {
          cachedModels = data.models.map((m) => m.name);
          lastFetch = now;
        }

        return cachedModels;
      } catch {
        return cachedModels;
      }
    }

    return {
      name: 'dynamic-models',
      priority: 45,
      complete: async (input, cursorPos) => {
        const beforeCursor = input.slice(0, cursorPos);
        const match = beforeCursor.match(/(?:--model=?|-m\s+|\/models?\s+)([^\s]*)$/i);

        if (!match) return null;

        const partial = match[1].toLowerCase();
        const startIndex = cursorPos - partial.length;

        const models = await fetchModels();
        if (models.length === 0) return null;

        const suggestions = models
          .filter((model) => model.toLowerCase().startsWith(partial))
          .slice(0, 10);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex,
          endIndex: cursorPos,
          prefix: AutocompleteEngine.getCommonPrefix(suggestions),
        };
      },
      refreshCache: async () => {
        lastFetch = 0;
        return await fetchModels();
      },
      getCachedModels: () => [...cachedModels],
    };
  }

  /**
   * Template completion provider
   */
  static TemplateProvider(templates) {
    return {
      name: 'templates',
      priority: 55,
      complete: async (input, cursorPos) => {
        const beforeCursor = input.slice(0, cursorPos);
        const match = beforeCursor.match(/(?:\/t(?:emplate)?\s+)([^\s]*)$/i);

        if (!match) return null;

        const partial = match[1].toLowerCase();
        const startIndex = cursorPos - partial.length;

        const templateNames = Object.keys(templates);
        const suggestions = templateNames
          .filter((name) => name.toLowerCase().startsWith(partial))
          .slice(0, 10);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex,
          endIndex: cursorPos,
          prefix: AutocompleteEngine.getCommonPrefix(suggestions),
        };
      },
    };
  }

  /**
   * Static list provider
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
            .filter((item) => item.toLowerCase().startsWith(partial.toLowerCase()))
            .slice(0, 10);

          if (suggestions.length === 0) return null;

          return {
            suggestions,
            startIndex,
            endIndex: cursorPos,
            prefix: AutocompleteEngine.getCommonPrefix(suggestions),
          };
        }

        const wordMatch = beforeCursor.match(/(\S*)$/);
        const partial = wordMatch ? wordMatch[1].toLowerCase() : '';
        const startIndex = cursorPos - partial.length;

        const suggestions = items
          .filter((item) => item.toLowerCase().startsWith(partial))
          .slice(0, 10);

        if (suggestions.length === 0) return null;

        return {
          suggestions,
          startIndex,
          endIndex: cursorPos,
          prefix: AutocompleteEngine.getCommonPrefix(suggestions),
        };
      },
    };
  }
}

export function createAutocomplete() {
  return new AutocompleteEngine();
}

export default AutocompleteEngine;
