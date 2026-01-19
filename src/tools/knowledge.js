/**
 * Knowledge Tools - Refactored with BaseTool architecture
 * Provides semantic vector memory operations with caching and optimization
 * @module tools/knowledge
 */

import { z } from 'zod';
import { BaseTool, ToolResult } from './base-tool.js';
import { knowledgeAddSchema, knowledgeSearchSchema, knowledgeDeleteSchema } from '../schemas/tools.js';
import { ValidationError, NotFoundError } from '../errors/AppError.js';

/**
 * @typedef {Object} VectorStoreInterface
 * @property {function(string, Object): Promise<string>} addDocument - Add document to store
 * @property {function(string, number): Promise<SearchResult[]>} search - Search documents
 * @property {function(string): Promise<boolean>} [exists] - Check if document exists
 * @property {function(string): Promise<void>} [deleteDocument] - Delete document
 * @property {function(string): Promise<void>} [delete] - Delete document (alias)
 * @property {function(): Promise<StoreStats>} [getStats] - Get store statistics
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} id - Document ID
 * @property {string} content - Document content
 * @property {number} score - Similarity score (0-1)
 * @property {Object} [metadata] - Document metadata
 * @property {string[]} [metadata.tags] - Document tags
 * @property {string} [metadata.createdAt] - Creation timestamp
 */

/**
 * @typedef {Object} StoreStats
 * @property {number} [documentCount] - Number of documents
 * @property {number} [totalSize] - Total storage size
 * @property {string} [lastUpdated] - Last update timestamp
 * @property {string} [indexStatus] - Index health status
 */

/**
 * @typedef {Object} FormattedResult
 * @property {number} rank - Result rank (1-based)
 * @property {number} score - Similarity score
 * @property {string} content - Document content (possibly truncated)
 * @property {string} id - Document ID
 * @property {Object} [metadata] - Document metadata
 */

/** @type {VectorStoreInterface|null} */
let VectorStore = null;

/**
 * Lazy load VectorStore to avoid circular dependencies
 * @returns {Promise<VectorStoreInterface>} Vector store instance
 * @throws {Error} If vector store is not available
 */
async function getVectorStore() {
  if (!VectorStore) {
    try {
      const module = await import('../memory/vector-store.js');
      VectorStore = module.default || module.VectorStore;
    } catch (error) {
      throw new Error(`Vector store not available: ${error.message}`);
    }
  }
  return VectorStore;
}

/**
 * Search result formatter for consistent output
 * @class SearchResultFormatter
 */
class SearchResultFormatter {
  /**
   * Format search results for display
   * @param {SearchResult[]} results - Raw search results from vector store
   * @param {Object} [options] - Formatting options
   * @param {boolean} [options.includeMetadata=true] - Include metadata in output
   * @param {number} [options.truncateContent=500] - Max content length before truncation
   * @returns {FormattedResult[]} Formatted results array
   */
  static format(results, options = {}) {
    const { includeMetadata = true, truncateContent = 500 } = options;

    return results.map((result, index) => {
      const formatted = {
        rank: index + 1,
        score: Math.round(result.score * 1000) / 1000,
        content: result.content.length > truncateContent
          ? result.content.substring(0, truncateContent) + '...'
          : result.content,
        id: result.id
      };

      if (includeMetadata && result.metadata) {
        formatted.metadata = {
          tags: result.metadata.tags,
          createdAt: result.metadata.createdAt,
          ...result.metadata
        };
      }

      return formatted;
    });
  }

  /**
   * Format results as plain text for display
   * @param {FormattedResult[]} results - Formatted search results
   * @returns {string} Plain text representation
   */
  static toText(results) {
    return results.map(r =>
      `[#${r.rank} Score: ${r.score.toFixed(3)}]\n${r.content}`
    ).join('\n\n---\n\n');
  }
}

/**
 * Knowledge Add Tool - Store documents in vector memory
 * @class KnowledgeAddTool
 * @extends BaseTool
 */
class KnowledgeAddTool extends BaseTool {
  constructor() {
    super({
      name: 'knowledge_add',
      description: 'Add a text document to the semantic vector memory for later retrieval',
      inputSchema: knowledgeAddSchema,
      timeoutMs: 30000
    });
  }

  /**
   * Execute the knowledge add operation
   * @param {Object} input - Validated input
   * @param {string} input.content - Text content to store
   * @param {string[]} [input.tags] - Tags for categorization
   * @param {Object} [input.metadata] - Additional metadata
   * @returns {Promise<{id: string, stored: boolean, contentLength: number, tags: string[], createdAt: string}>}
   */
  async run({ content, tags, metadata = {} }) {
    const store = await getVectorStore();

    // Prepare metadata
    const docMetadata = {
      tags: tags || [],
      createdAt: new Date().toISOString(),
      contentLength: content.length,
      wordCount: content.split(/\s+/).length,
      ...metadata
    };

    // Add to vector store
    const id = await store.addDocument(content, docMetadata);

    return {
      id,
      stored: true,
      contentLength: content.length,
      tags: docMetadata.tags,
      createdAt: docMetadata.createdAt
    };
  }
}

/**
 * Knowledge Search Tool - Semantic search in vector memory
 * @class KnowledgeSearchTool
 * @extends BaseTool
 */
class KnowledgeSearchTool extends BaseTool {
  constructor() {
    super({
      name: 'knowledge_search',
      description: 'Semantically search the vector memory using natural language queries',
      inputSchema: knowledgeSearchSchema,
      timeoutMs: 30000
    });

    // Simple in-memory cache for recent searches
    this.cache = new Map();
    this.cacheMaxSize = 100;
    /** @type {number} Cache time-to-live in milliseconds */
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Execute the knowledge search operation
   * @param {Object} input - Validated input
   * @param {string} input.query - Search query text
   * @param {number} input.limit - Maximum results to return
   * @param {number} input.threshold - Minimum similarity threshold (0-1)
   * @param {string[]} [input.tags] - Filter results by tags
   * @returns {Promise<{query: string, resultCount: number, results: FormattedResult[], searchParams: Object, fromCache?: boolean}>}
   */
  async run({ query, limit, threshold, tags }) {
    const store = await getVectorStore();

    // Generate cache key
    const cacheKey = this.getCacheKey(query, limit, threshold, tags);

    // Check cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug('Returning cached search results', { query });
      return {
        ...cached,
        fromCache: true
      };
    }

    // Perform search
    const rawResults = await store.search(query, limit);

    // Filter by threshold
    let filteredResults = rawResults.filter(r => r.score >= threshold);

    // Filter by tags if provided
    if (tags && tags.length > 0) {
      filteredResults = filteredResults.filter(r => {
        const docTags = r.metadata?.tags || [];
        return tags.some(tag => docTags.includes(tag));
      });
    }

    // Format results
    const formattedResults = SearchResultFormatter.format(filteredResults);

    const response = {
      query,
      resultCount: formattedResults.length,
      results: formattedResults,
      searchParams: { limit, threshold, tags }
    };

    // Cache results
    this.addToCache(cacheKey, response);

    return response;
  }

  /**
   * Generate cache key from search parameters
   * @param {string} query - Search query
   * @param {number} limit - Result limit
   * @param {number} threshold - Similarity threshold
   * @param {string[]} [tags] - Filter tags
   * @returns {string} Cache key
   * @private
   */
  getCacheKey(query, limit, threshold, tags) {
    return JSON.stringify({ query: query.toLowerCase().trim(), limit, threshold, tags });
  }

  /**
   * Get cached result if valid
   * @param {string} key - Cache key
   * @returns {Object|null} Cached data or null
   * @private
   */
  getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Add result to cache with LRU eviction
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   * @private
   */
  addToCache(key, data) {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear the search cache
   * @public
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * Knowledge Delete Tool - Remove documents from vector memory
 * @class KnowledgeDeleteTool
 * @extends BaseTool
 */
class KnowledgeDeleteTool extends BaseTool {
  constructor() {
    super({
      name: 'knowledge_delete',
      description: 'Delete a document from vector memory by ID',
      inputSchema: knowledgeDeleteSchema,
      timeoutMs: 10000
    });
  }

  /**
   * Execute the knowledge delete operation
   * @param {Object} input - Validated input
   * @param {string} input.id - Document ID to delete
   * @returns {Promise<{id: string, deleted: boolean, deletedAt: string}>}
   * @throws {NotFoundError} If document not found
   */
  async run({ id }) {
    const store = await getVectorStore();

    // Check if document exists
    const exists = await store.exists?.(id);
    if (exists === false) {
      throw new NotFoundError(`Document not found: ${id}`);
    }

    // Delete document
    await store.deleteDocument?.(id) || await store.delete?.(id);

    return {
      id,
      deleted: true,
      deletedAt: new Date().toISOString()
    };
  }
}

/**
 * Knowledge Stats Tool - Get memory statistics
 * @class KnowledgeStatsTool
 * @extends BaseTool
 */
class KnowledgeStatsTool extends BaseTool {
  constructor() {
    super({
      name: 'knowledge_stats',
      description: 'Get statistics about the vector memory store',
      inputSchema: z.object({}), // No input needed
      timeoutMs: 10000
    });
  }

  /**
   * Execute the knowledge stats operation
   * @returns {Promise<StoreStats>} Store statistics
   */
  async run() {
    const store = await getVectorStore();

    // Get stats if available
    const stats = await store.getStats?.() || {};

    return {
      documentCount: stats.documentCount || 'unknown',
      totalSize: stats.totalSize || 'unknown',
      lastUpdated: stats.lastUpdated || 'unknown',
      indexStatus: stats.indexStatus || 'unknown'
    };
  }
}

// Create tool instances
const knowledgeAddTool = new KnowledgeAddTool();
const knowledgeSearchTool = new KnowledgeSearchTool();
const knowledgeDeleteTool = new KnowledgeDeleteTool();

/**
 * Export tools in legacy format for backward compatibility
 */
export const tools = {
  knowledgeAdd: knowledgeAddTool,
  knowledgeSearch: knowledgeSearchTool,
  knowledgeDelete: knowledgeDeleteTool
};

// Legacy export format for existing tool registry
export default [
  {
    name: knowledgeAddTool.name,
    description: knowledgeAddTool.description,
    inputSchema: knowledgeAddTool.getJsonSchema(),
    execute: (input) => knowledgeAddTool.execute(input)
  },
  {
    name: knowledgeSearchTool.name,
    description: knowledgeSearchTool.description,
    inputSchema: knowledgeSearchTool.getJsonSchema(),
    execute: (input) => knowledgeSearchTool.execute(input)
  }
];

// Named exports
export {
  KnowledgeAddTool,
  KnowledgeSearchTool,
  KnowledgeDeleteTool,
  SearchResultFormatter
};
