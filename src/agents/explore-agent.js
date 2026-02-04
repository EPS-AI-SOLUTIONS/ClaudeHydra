/**
 * Explore Agent (Regis)
 *
 * Fast agent for codebase exploration, research, and context gathering.
 * Maps to Regis - the Philosopher and Research Analyst.
 *
 * @module src/agents/explore-agent
 */

import { BaseAgent, AgentState } from './base-agent.js';

// ============================================================================
// Constants
// ============================================================================

const AGENT_CONFIG = {
  name: 'Explore',
  witcherName: 'Regis',
  description: `Research specialist for exploring codebases.
Excels at finding files, searching code, and answering questions about architecture.
Quick exploration without code modifications.`,
  capabilities: [
    'search',
    'explore',
    'research',
    'analysis',
    'find_files',
    'find_patterns',
    'understand_architecture'
  ],
  timeout: 60000
};

// ============================================================================
// Explore Agent Class
// ============================================================================

/**
 * Explore Agent (Regis)
 *
 * Specialized for codebase exploration and research.
 *
 * @extends BaseAgent
 */
export class ExploreAgent extends BaseAgent {
  /**
   * @param {Object} [options] - Agent options
   */
  constructor(options = {}) {
    super({
      ...AGENT_CONFIG,
      ...options
    });

    /** @type {Object[]} */
    this.searchResults = [];

    /** @type {string[]} */
    this.exploredPaths = [];
  }

  /**
   * Execute exploration task
   *
   * @param {Object} params - Task parameters
   * @param {string} params.query - Search/exploration query
   * @param {string} [params.thoroughness='medium'] - quick, medium, very thorough
   * @param {string[]} [params.paths] - Paths to focus on
   * @param {Object} [params.tools] - Available tools
   * @returns {Promise<Object>}
   */
  async execute(params) {
    const { query, thoroughness = 'medium', paths = [], tools = {} } = params;

    this.reportProgress(0, 'Starting exploration');

    const results = {
      query,
      thoroughness,
      findings: [],
      files: [],
      patterns: [],
      summary: ''
    };

    try {
      // Determine search strategy based on thoroughness
      const strategy = this.getSearchStrategy(thoroughness);

      // Step 1: File search
      this.reportProgress(20, 'Searching for relevant files');
      results.files = await this.searchFiles(query, paths, strategy, tools);

      // Step 2: Pattern search in code
      this.reportProgress(50, 'Searching for patterns');
      results.patterns = await this.searchPatterns(query, results.files, strategy, tools);

      // Step 3: Analyze findings
      this.reportProgress(80, 'Analyzing findings');
      results.findings = this.analyzeFindings(results.files, results.patterns);

      // Step 4: Generate summary
      this.reportProgress(95, 'Generating summary');
      results.summary = this.generateSummary(query, results);

      this.reportProgress(100, 'Exploration complete');

      return results;
    } catch (error) {
      throw new Error(`Exploration failed: ${error.message}`);
    }
  }

  /**
   * Get search strategy based on thoroughness
   *
   * @param {string} thoroughness - Thoroughness level
   * @returns {Object}
   */
  getSearchStrategy(thoroughness) {
    const strategies = {
      quick: {
        maxFiles: 10,
        maxPatterns: 5,
        depth: 2,
        timeout: 10000
      },
      medium: {
        maxFiles: 50,
        maxPatterns: 20,
        depth: 4,
        timeout: 30000
      },
      'very thorough': {
        maxFiles: 200,
        maxPatterns: 100,
        depth: 8,
        timeout: 60000
      }
    };

    return strategies[thoroughness] || strategies.medium;
  }

  /**
   * Search for relevant files
   *
   * @param {string} query - Search query
   * @param {string[]} paths - Paths to search
   * @param {Object} strategy - Search strategy
   * @param {Object} tools - Available tools
   * @returns {Promise<Object[]>}
   */
  async searchFiles(query, paths, strategy, tools) {
    const files = [];

    // Extract potential file patterns from query
    const patterns = this.extractFilePatterns(query);

    // If tools are available, use them
    if (tools.glob) {
      for (const pattern of patterns) {
        try {
          const result = await tools.glob(pattern);
          files.push(...(result.files || []).slice(0, strategy.maxFiles));
        } catch {
          // Continue with other patterns
        }
      }
    }

    // If no tools, return placeholder
    if (files.length === 0) {
      files.push({
        path: '.',
        type: 'placeholder',
        note: 'File search requires glob tool'
      });
    }

    this.exploredPaths.push(...files.map((f) => f.path || f));

    return files.slice(0, strategy.maxFiles);
  }

  /**
   * Extract file patterns from query
   *
   * @param {string} query - Search query
   * @returns {string[]}
   */
  extractFilePatterns(query) {
    const patterns = [];
    const lower = query.toLowerCase();

    // Common patterns based on keywords
    const keywordPatterns = {
      test: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}', '**/test/**'],
      config: ['**/*.config.{js,ts,json}', '**/config/**'],
      route: ['**/routes/**', '**/router/**', '**/*router*'],
      api: ['**/api/**', '**/endpoints/**', '**/handlers/**'],
      model: ['**/models/**', '**/entities/**', '**/schemas/**'],
      component: ['**/components/**', '**/*.{tsx,jsx}'],
      hook: ['**/hooks/**', '**/use*.{ts,js}'],
      util: ['**/utils/**', '**/helpers/**', '**/lib/**'],
      service: ['**/services/**', '**/providers/**']
    };

    // Add patterns based on keywords found in query
    for (const [keyword, pats] of Object.entries(keywordPatterns)) {
      if (lower.includes(keyword)) {
        patterns.push(...pats);
      }
    }

    // Add generic patterns
    patterns.push('**/*.{js,ts,jsx,tsx}');

    return [...new Set(patterns)];
  }

  /**
   * Search for patterns in code
   *
   * @param {string} query - Search query
   * @param {Object[]} files - Files to search
   * @param {Object} strategy - Search strategy
   * @param {Object} tools - Available tools
   * @returns {Promise<Object[]>}
   */
  async searchPatterns(query, files, strategy, tools) {
    const patterns = [];

    // Extract search terms
    const terms = this.extractSearchTerms(query);

    // If tools are available, use grep
    if (tools.grep) {
      for (const term of terms.slice(0, strategy.maxPatterns)) {
        try {
          const result = await tools.grep(term);
          patterns.push({
            term,
            matches: result.matches || []
          });
        } catch {
          // Continue with other terms
        }
      }
    }

    // If no tools, return placeholder
    if (patterns.length === 0) {
      patterns.push({
        term: query,
        type: 'placeholder',
        note: 'Pattern search requires grep tool'
      });
    }

    this.searchResults.push(...patterns);

    return patterns;
  }

  /**
   * Extract search terms from query
   *
   * @param {string} query - Search query
   * @returns {string[]}
   */
  extractSearchTerms(query) {
    // Remove common words and split
    const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'is', 'are', 'how', 'what', 'where', 'when', 'why', 'find', 'show', 'me'];

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.includes(w));

    // Also include camelCase and snake_case variations
    const terms = [...words];

    for (const word of words) {
      // camelCase
      terms.push(word.charAt(0).toUpperCase() + word.slice(1));
      // snake_case
      terms.push(word.replace(/([A-Z])/g, '_$1').toLowerCase());
    }

    return [...new Set(terms)];
  }

  /**
   * Analyze findings
   *
   * @param {Object[]} files - Found files
   * @param {Object[]} patterns - Found patterns
   * @returns {Object[]}
   */
  analyzeFindings(files, patterns) {
    const findings = [];

    // Group files by directory
    const filesByDir = {};
    for (const file of files) {
      const path = file.path || file;
      const dir = path.split('/').slice(0, -1).join('/') || '.';

      if (!filesByDir[dir]) {
        filesByDir[dir] = [];
      }
      filesByDir[dir].push(path);
    }

    // Create findings from file groups
    for (const [dir, dirFiles] of Object.entries(filesByDir)) {
      findings.push({
        type: 'file_group',
        location: dir,
        count: dirFiles.length,
        files: dirFiles.slice(0, 5)
      });
    }

    // Create findings from pattern matches
    for (const pattern of patterns) {
      if (pattern.matches?.length > 0) {
        findings.push({
          type: 'pattern_match',
          term: pattern.term,
          count: pattern.matches.length,
          samples: pattern.matches.slice(0, 3)
        });
      }
    }

    return findings;
  }

  /**
   * Generate summary
   *
   * @param {string} query - Original query
   * @param {Object} results - Search results
   * @returns {string}
   */
  generateSummary(query, results) {
    const parts = [];

    parts.push(`## Exploration Results for: "${query}"`);
    parts.push('');

    // Files summary
    parts.push(`### Files Found: ${results.files.length}`);
    if (results.files.length > 0) {
      const sample = results.files.slice(0, 5);
      for (const file of sample) {
        parts.push(`- ${file.path || file}`);
      }
      if (results.files.length > 5) {
        parts.push(`- ... and ${results.files.length - 5} more`);
      }
    }
    parts.push('');

    // Patterns summary
    const patternMatches = results.patterns.reduce((sum, p) => sum + (p.matches?.length || 0), 0);
    parts.push(`### Pattern Matches: ${patternMatches}`);
    for (const pattern of results.patterns.slice(0, 5)) {
      if (pattern.matches?.length > 0) {
        parts.push(`- "${pattern.term}": ${pattern.matches.length} matches`);
      }
    }
    parts.push('');

    // Findings summary
    parts.push(`### Key Findings: ${results.findings.length}`);
    for (const finding of results.findings.slice(0, 5)) {
      if (finding.type === 'file_group') {
        parts.push(`- Directory \`${finding.location}\`: ${finding.count} files`);
      } else if (finding.type === 'pattern_match') {
        parts.push(`- Pattern "${finding.term}": ${finding.count} occurrences`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Get system prompt
   *
   * @returns {string}
   */
  getSystemPrompt() {
    return `You are Regis, the Philosopher and Research Analyst.

Your role is to explore codebases, gather context, and provide insights.
You excel at:
- Finding relevant files and patterns
- Understanding code architecture
- Answering questions about the codebase
- Identifying relationships between components

You DO NOT modify code. Your job is research and analysis only.

Be thorough but efficient. Focus on what's most relevant to the query.`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an Explore agent
 *
 * @param {Object} [options] - Agent options
 * @returns {ExploreAgent}
 */
export function createExploreAgent(options = {}) {
  return new ExploreAgent(options);
}

export default ExploreAgent;
