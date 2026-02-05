/**
 * Knowledge Tools Tests
 * @module test/unit/tools/knowledge.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vector store
const mockVectorStore = {
  addDocument: vi.fn(),
  search: vi.fn(),
  exists: vi.fn(),
  deleteDocument: vi.fn(),
  delete: vi.fn(),
  getStats: vi.fn()
};

// Mock the vector-store module
vi.mock('../../../src/memory/vector-store.js', () => ({
  default: mockVectorStore,
  VectorStore: mockVectorStore
}));

// Mock audit logger
vi.mock('../../../src/security/audit-logger.js', () => ({
  default: {
    logCommand: vi.fn()
  }
}));

// Dynamic import after mocks are set up
const {
  tools,
  KnowledgeAddTool,
  KnowledgeSearchTool,
  KnowledgeDeleteTool,
  SearchResultFormatter
} = await import('../../../src/tools/knowledge.js');

describe('Knowledge Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset vector store mock responses
    mockVectorStore.addDocument.mockResolvedValue('doc-123');
    mockVectorStore.search.mockResolvedValue([]);
    mockVectorStore.exists.mockResolvedValue(true);
    mockVectorStore.deleteDocument.mockResolvedValue(undefined);
    mockVectorStore.delete.mockResolvedValue(undefined);
    mockVectorStore.getStats.mockResolvedValue({
      documentCount: 10,
      totalSize: 1024,
      lastUpdated: '2024-01-01T00:00:00Z',
      indexStatus: 'healthy'
    });

    // Clear search cache between tests
    tools.knowledgeSearch.clearCache();
  });

  // ===========================================================================
  // SearchResultFormatter Tests
  // ===========================================================================

  describe('SearchResultFormatter', () => {
    describe('format()', () => {
      it('should format search results with default options', () => {
        const results = [
          {
            id: 'doc-1',
            content: 'Test content 1',
            score: 0.95,
            metadata: { tags: ['test'], createdAt: '2024-01-01' }
          },
          {
            id: 'doc-2',
            content: 'Test content 2',
            score: 0.85,
            metadata: { tags: ['example'], createdAt: '2024-01-02' }
          }
        ];

        const formatted = SearchResultFormatter.format(results);

        expect(formatted).toHaveLength(2);
        expect(formatted[0].rank).toBe(1);
        expect(formatted[0].score).toBe(0.95);
        expect(formatted[0].content).toBe('Test content 1');
        expect(formatted[0].id).toBe('doc-1');
        expect(formatted[0].metadata.tags).toEqual(['test']);

        expect(formatted[1].rank).toBe(2);
        expect(formatted[1].score).toBe(0.85);
      });

      it('should truncate long content', () => {
        const longContent = 'a'.repeat(600);
        const results = [{
          id: 'doc-1',
          content: longContent,
          score: 0.9
        }];

        const formatted = SearchResultFormatter.format(results);

        expect(formatted[0].content.length).toBeLessThan(600);
        expect(formatted[0].content.endsWith('...')).toBe(true);
      });

      it('should respect custom truncation length', () => {
        const longContent = 'a'.repeat(200);
        const results = [{
          id: 'doc-1',
          content: longContent,
          score: 0.9
        }];

        const formatted = SearchResultFormatter.format(results, { truncateContent: 100 });

        expect(formatted[0].content.length).toBe(103); // 100 + '...'
      });

      it('should exclude metadata when option is false', () => {
        const results = [{
          id: 'doc-1',
          content: 'Test',
          score: 0.9,
          metadata: { tags: ['test'] }
        }];

        const formatted = SearchResultFormatter.format(results, { includeMetadata: false });

        expect(formatted[0].metadata).toBeUndefined();
      });

      it('should handle results without metadata', () => {
        const results = [{
          id: 'doc-1',
          content: 'Test',
          score: 0.9
        }];

        const formatted = SearchResultFormatter.format(results);

        expect(formatted[0].metadata).toBeUndefined();
      });

      it('should round scores to 3 decimal places', () => {
        const results = [{
          id: 'doc-1',
          content: 'Test',
          score: 0.123456789
        }];

        const formatted = SearchResultFormatter.format(results);

        expect(formatted[0].score).toBe(0.123);
      });
    });

    describe('toText()', () => {
      it('should format results as plain text', () => {
        const formatted = [
          { rank: 1, score: 0.95, content: 'First result', id: 'doc-1' },
          { rank: 2, score: 0.85, content: 'Second result', id: 'doc-2' }
        ];

        const text = SearchResultFormatter.toText(formatted);

        expect(text).toContain('[#1 Score: 0.950]');
        expect(text).toContain('First result');
        expect(text).toContain('[#2 Score: 0.850]');
        expect(text).toContain('Second result');
        expect(text).toContain('---'); // separator
      });
    });
  });

  // ===========================================================================
  // KnowledgeAddTool Tests
  // ===========================================================================

  describe('KnowledgeAddTool', () => {
    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tools.knowledgeAdd.name).toBe('knowledge_add');
        expect(tools.knowledgeAdd.description).toContain('semantic vector memory');
      });
    });

    describe('run()', () => {
      it('should add document to vector store', async () => {
        const content = 'This is test content that is long enough to pass validation';

        const result = await tools.knowledgeAdd.run({
          content,
          tags: ['test', 'example']
        });

        expect(result.id).toBe('doc-123');
        expect(result.stored).toBe(true);
        expect(result.contentLength).toBe(content.length);
        expect(result.tags).toEqual(['test', 'example']);
        expect(result.createdAt).toBeDefined();
      });

      it('should add document with metadata', async () => {
        const content = 'This is test content that is long enough to pass validation';

        await tools.knowledgeAdd.run({
          content,
          metadata: { source: 'unit-test', version: '1.0' }
        });

        expect(mockVectorStore.addDocument).toHaveBeenCalledWith(
          content,
          expect.objectContaining({
            source: 'unit-test',
            version: '1.0',
            contentLength: content.length
          })
        );
      });

      it('should calculate word count in metadata', async () => {
        const content = 'This is a test sentence with multiple words included here';

        await tools.knowledgeAdd.run({ content });

        expect(mockVectorStore.addDocument).toHaveBeenCalledWith(
          content,
          expect.objectContaining({
            wordCount: 10
          })
        );
      });

      it('should default tags to empty array', async () => {
        const content = 'This is test content that is long enough to pass validation';

        const result = await tools.knowledgeAdd.run({ content });

        expect(result.tags).toEqual([]);
      });
    });
  });

  // ===========================================================================
  // KnowledgeSearchTool Tests
  // ===========================================================================

  describe('KnowledgeSearchTool', () => {
    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tools.knowledgeSearch.name).toBe('knowledge_search');
        expect(tools.knowledgeSearch.description).toContain('Semantically search');
      });

      it('should initialize cache properties', () => {
        expect(tools.knowledgeSearch.cache).toBeDefined();
        expect(tools.knowledgeSearch.cacheMaxSize).toBe(100);
        expect(tools.knowledgeSearch.cacheTTL).toBe(5 * 60 * 1000);
      });
    });

    describe('run()', () => {
      it('should search vector store', async () => {
        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result 1', score: 0.95 },
          { id: 'doc-2', content: 'Result 2', score: 0.85 }
        ]);

        const result = await tools.knowledgeSearch.run({
          query: 'test query',
          limit: 10,
          threshold: 0.5
        });

        expect(result.query).toBe('test query');
        expect(result.resultCount).toBe(2);
        expect(result.results).toHaveLength(2);
        expect(result.searchParams).toEqual({ limit: 10, threshold: 0.5, tags: undefined });
      });

      it('should filter results by threshold', async () => {
        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result 1', score: 0.95 },
          { id: 'doc-2', content: 'Result 2', score: 0.3 }
        ]);

        const result = await tools.knowledgeSearch.run({
          query: 'test query',
          limit: 10,
          threshold: 0.5
        });

        expect(result.resultCount).toBe(1);
        expect(result.results[0].id).toBe('doc-1');
      });

      it('should filter results by tags', async () => {
        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result 1', score: 0.9, metadata: { tags: ['api'] } },
          { id: 'doc-2', content: 'Result 2', score: 0.85, metadata: { tags: ['docs'] } },
          { id: 'doc-3', content: 'Result 3', score: 0.8, metadata: { tags: ['api', 'v2'] } }
        ]);

        const result = await tools.knowledgeSearch.run({
          query: 'test query',
          limit: 10,
          threshold: 0.5,
          tags: ['api']
        });

        expect(result.resultCount).toBe(2);
        expect(result.results.map(r => r.id)).toContain('doc-1');
        expect(result.results.map(r => r.id)).toContain('doc-3');
      });

      it('should handle results without metadata tags', async () => {
        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result 1', score: 0.9 },
          { id: 'doc-2', content: 'Result 2', score: 0.85, metadata: {} }
        ]);

        const result = await tools.knowledgeSearch.run({
          query: 'test query',
          limit: 10,
          threshold: 0.5,
          tags: ['api']
        });

        // Neither result has matching tags
        expect(result.resultCount).toBe(0);
      });

      it('should return cached results when available', async () => {
        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result', score: 0.9 }
        ]);

        // First call - populates cache
        await tools.knowledgeSearch.run({
          query: 'cached query',
          limit: 10,
          threshold: 0.5
        });

        // Clear mock to verify it's not called again
        mockVectorStore.search.mockClear();

        // Second call - should use cache
        const result = await tools.knowledgeSearch.run({
          query: 'cached query',
          limit: 10,
          threshold: 0.5
        });

        expect(mockVectorStore.search).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);
      });

      it('should not use expired cache', async () => {
        vi.useFakeTimers();

        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result', score: 0.9 }
        ]);

        // First call
        await tools.knowledgeSearch.run({
          query: 'expiring query',
          limit: 10,
          threshold: 0.5
        });

        // Advance time past TTL (5 minutes + buffer)
        vi.advanceTimersByTime(6 * 60 * 1000);

        // Second call - should not use expired cache
        const result = await tools.knowledgeSearch.run({
          query: 'expiring query',
          limit: 10,
          threshold: 0.5
        });

        expect(mockVectorStore.search).toHaveBeenCalledTimes(2);
        expect(result.fromCache).toBeUndefined();

        vi.useRealTimers();
      });
    });

    describe('cache management', () => {
      it('should evict oldest entries when cache is full', async () => {
        // Set small max size for testing
        tools.knowledgeSearch.cacheMaxSize = 3;

        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result', score: 0.9 }
        ]);

        // Fill cache with 3 entries
        await tools.knowledgeSearch.run({ query: 'query 1', limit: 10, threshold: 0.5 });
        await tools.knowledgeSearch.run({ query: 'query 2', limit: 10, threshold: 0.5 });
        await tools.knowledgeSearch.run({ query: 'query 3', limit: 10, threshold: 0.5 });

        mockVectorStore.search.mockClear();

        // Add 4th entry - should evict first (query 1)
        await tools.knowledgeSearch.run({ query: 'query 4', limit: 10, threshold: 0.5 });

        // Query 1 should no longer be cached - it will trigger a search call
        await tools.knowledgeSearch.run({ query: 'query 1', limit: 10, threshold: 0.5 });
        expect(mockVectorStore.search).toHaveBeenCalledTimes(2); // query 4 and query 1

        // Query 3 should still be cached
        const result3 = await tools.knowledgeSearch.run({ query: 'query 3', limit: 10, threshold: 0.5 });
        expect(result3.fromCache).toBe(true);

        // Reset max size
        tools.knowledgeSearch.cacheMaxSize = 100;
      });

      it('should clear cache when clearCache() is called', async () => {
        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result', score: 0.9 }
        ]);

        // Populate cache
        await tools.knowledgeSearch.run({ query: 'clear test', limit: 10, threshold: 0.5 });

        // Clear cache
        tools.knowledgeSearch.clearCache();

        mockVectorStore.search.mockClear();

        // Should not use cache
        const result = await tools.knowledgeSearch.run({ query: 'clear test', limit: 10, threshold: 0.5 });
        expect(result.fromCache).toBeUndefined();
        expect(mockVectorStore.search).toHaveBeenCalled();
      });

      it('should generate case-insensitive cache keys', async () => {
        mockVectorStore.search.mockResolvedValue([
          { id: 'doc-1', content: 'Result', score: 0.9 }
        ]);

        // First call with uppercase
        await tools.knowledgeSearch.run({ query: 'TEST Query', limit: 10, threshold: 0.5 });

        mockVectorStore.search.mockClear();

        // Second call with lowercase - should use cache
        const result = await tools.knowledgeSearch.run({ query: 'test query', limit: 10, threshold: 0.5 });
        expect(result.fromCache).toBe(true);
      });
    });
  });

  // ===========================================================================
  // KnowledgeDeleteTool Tests
  // ===========================================================================

  describe('KnowledgeDeleteTool', () => {
    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tools.knowledgeDelete.name).toBe('knowledge_delete');
        expect(tools.knowledgeDelete.description).toContain('Delete a document');
      });
    });

    describe('run()', () => {
      it('should delete existing document', async () => {
        mockVectorStore.exists.mockResolvedValue(true);

        const result = await tools.knowledgeDelete.run({
          id: '123e4567-e89b-12d3-a456-426614174000'
        });

        expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(result.deleted).toBe(true);
        expect(result.deletedAt).toBeDefined();
        expect(mockVectorStore.deleteDocument).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      });

      it('should throw NotFoundError for non-existent document', async () => {
        mockVectorStore.exists.mockResolvedValue(false);

        await expect(tools.knowledgeDelete.run({
          id: '123e4567-e89b-12d3-a456-426614174000'
        })).rejects.toThrow('Document not found');
      });

      it('should use fallback delete method if deleteDocument not available', async () => {
        mockVectorStore.exists.mockResolvedValue(true);
        mockVectorStore.deleteDocument.mockResolvedValue(undefined);

        // Temporarily make deleteDocument return falsy to trigger fallback
        const originalDeleteDocument = mockVectorStore.deleteDocument;
        mockVectorStore.deleteDocument = vi.fn().mockResolvedValue(false);

        const result = await tools.knowledgeDelete.run({
          id: '123e4567-e89b-12d3-a456-426614174000'
        });

        expect(result.deleted).toBe(true);

        // Restore
        mockVectorStore.deleteDocument = originalDeleteDocument;
      });

      it('should handle when exists method is not available', async () => {
        // Remove exists method temporarily
        const originalExists = mockVectorStore.exists;
        mockVectorStore.exists = undefined;

        const result = await tools.knowledgeDelete.run({
          id: '123e4567-e89b-12d3-a456-426614174000'
        });

        // Should not throw, should proceed with delete
        expect(result.deleted).toBe(true);

        // Restore
        mockVectorStore.exists = originalExists;
      });
    });
  });

  // ===========================================================================
  // Tools Export Tests
  // ===========================================================================

  describe('tools export', () => {
    it('should export all tools', () => {
      expect(tools.knowledgeAdd).toBeDefined();
      expect(tools.knowledgeSearch).toBeDefined();
      expect(tools.knowledgeDelete).toBeDefined();
    });

    it('should have correct tool instances', () => {
      expect(tools.knowledgeAdd).toBeInstanceOf(KnowledgeAddTool);
      expect(tools.knowledgeSearch).toBeInstanceOf(KnowledgeSearchTool);
      expect(tools.knowledgeDelete).toBeInstanceOf(KnowledgeDeleteTool);
    });
  });
});
