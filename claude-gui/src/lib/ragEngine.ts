/**
 * RAG Engine - Block 1: Embeddings & Chunking
 *
 * Dostarczono przez Jaskiera, barda AI:
 * "Ach, embeddingi! Jak piosenka - trzeba je podzielić na zwrotki,
 * żeby słuchacz (czyli LLM) mógł je zrozumieć!"
 *
 * Features:
 * 1. Hybrid embedding models with fallback chain
 * 2. Semantic chunking on sentence boundaries
 * 3. Overlapping chunks (20% overlap)
 * 4. Code-aware chunking (preserves code blocks)
 * 5. Embedding cache by content hash
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// TYPES
// ============================================================================

/** Embedding model configuration */
export interface EmbeddingModel {
  name: string;
  dimensions: number;
  provider: 'ollama' | 'openai' | 'local';
  maxTokens: number;
}

/** Chunk with metadata */
export interface TextChunk {
  id: string;
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
  type: 'text' | 'code' | 'heading' | 'list';
  language?: string;
  metadata?: Record<string, unknown>;
}

/** Embedding result */
export interface EmbeddingResult {
  vector: number[];
  model: string;
  dimensions: number;
  cached: boolean;
  contentHash: string;
}

/** Chunking options */
export interface ChunkingOptions {
  maxChunkSize: number;
  minChunkSize: number;
  overlapPercent: number;
  preserveCodeBlocks: boolean;
  preserveHeadings: boolean;
}

/** Cache entry */
interface CacheEntry {
  vector: number[];
  model: string;
  timestamp: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Available embedding models with fallback priority */
export const EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    name: 'mxbai-embed-large',
    dimensions: 1024,
    provider: 'ollama',
    maxTokens: 512,
  },
  {
    name: 'nomic-embed-text',
    dimensions: 768,
    provider: 'ollama',
    maxTokens: 8192,
  },
  {
    name: 'all-minilm',
    dimensions: 384,
    provider: 'ollama',
    maxTokens: 256,
  },
];

/** Default chunking options */
const DEFAULT_CHUNK_OPTIONS: ChunkingOptions = {
  maxChunkSize: 512,
  minChunkSize: 100,
  overlapPercent: 20,
  preserveCodeBlocks: true,
  preserveHeadings: true,
};

/** Sentence boundary patterns */
const SENTENCE_BOUNDARIES = /(?<=[.!?])\s+(?=[A-Z])|(?<=\n\n)/g;

/** Code block pattern (markdown fenced blocks) */
const CODE_BLOCK_PATTERN = /```(\w+)?\n([\s\S]*?)```/g;

/** Function/class patterns for code splitting */
const CODE_SPLIT_PATTERNS = {
  javascript: /(?=(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+\w+)/g,
  typescript:
    /(?=(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+\w+)/g,
  python: /(?=(?:def|class|async def)\s+\w+)/g,
  rust: /(?=(?:pub\s+)?(?:fn|struct|enum|impl|trait|mod)\s+)/g,
  go: /(?=(?:func|type|var|const)\s+)/g,
};

// ============================================================================
// EMBEDDING CACHE (in-memory + IndexedDB)
// ============================================================================

/** In-memory cache for fast access */
const memoryCache = new Map<string, CacheEntry>();

/** Cache TTL in milliseconds (1 hour) */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Generate SHA-256 hash of content for cache key
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get cached embedding if exists and not expired
 */
async function getCachedEmbedding(contentHash: string, model: string): Promise<number[] | null> {
  const cacheKey = `${model}:${contentHash}`;

  // Check memory cache first
  const memEntry = memoryCache.get(cacheKey);
  if (memEntry && Date.now() - memEntry.timestamp < CACHE_TTL) {
    return memEntry.vector;
  }

  // Check IndexedDB via Tauri backend
  try {
    const cached = await invoke<{ vector: number[]; timestamp: number } | null>(
      'get_embedding_cache',
      {
        key: cacheKey,
      },
    );

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Populate memory cache
      memoryCache.set(cacheKey, {
        vector: cached.vector,
        model,
        timestamp: cached.timestamp,
      });
      return cached.vector;
    }
  } catch {
    // Cache miss or backend not available
  }

  return null;
}

/**
 * Store embedding in cache
 */
async function cacheEmbedding(contentHash: string, model: string, vector: number[]): Promise<void> {
  const cacheKey = `${model}:${contentHash}`;
  const timestamp = Date.now();

  // Store in memory cache
  memoryCache.set(cacheKey, { vector, model, timestamp });

  // Store in IndexedDB via Tauri backend
  try {
    await invoke('set_embedding_cache', {
      key: cacheKey,
      value: { vector, timestamp },
    });
  } catch {
    // Cache write failed, but memory cache still works
  }
}

/**
 * Clear expired entries from memory cache
 */
export function clearExpiredCache(): number {
  const now = Date.now();
  let cleared = 0;

  // Convert to array to avoid iterator issues with older TypeScript targets
  const entries = Array.from(memoryCache.entries());
  for (const [key, entry] of entries) {
    if (now - entry.timestamp >= CACHE_TTL) {
      memoryCache.delete(key);
      cleared++;
    }
  }

  return cleared;
}

// ============================================================================
// SEMANTIC CHUNKING
// ============================================================================

/**
 * Split text on semantic boundaries (sentences, paragraphs)
 *
 * @param text - Input text to chunk
 * @param options - Chunking configuration
 * @returns Array of text chunks with metadata
 */
export function semanticChunk(text: string, options: Partial<ChunkingOptions> = {}): TextChunk[] {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const chunks: TextChunk[] = [];

  // Split on sentence boundaries
  const sentences = text.split(SENTENCE_BOUNDARIES).filter((s) => s.trim().length > 0);

  let currentChunk = '';
  let currentStart = 0;
  let chunkIndex = 0;
  let textOffset = 0;

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();

    // Check if adding this sentence would exceed max size
    if (
      currentChunk.length + trimmedSentence.length > opts.maxChunkSize &&
      currentChunk.length >= opts.minChunkSize
    ) {
      // Save current chunk
      chunks.push({
        id: `chunk_${chunkIndex}`,
        content: currentChunk.trim(),
        index: chunkIndex,
        startOffset: currentStart,
        endOffset: textOffset,
        type: 'text',
      });

      // Calculate overlap
      const overlapSize = Math.floor(currentChunk.length * (opts.overlapPercent / 100));
      const overlapText = currentChunk.slice(-overlapSize);

      // Start new chunk with overlap
      currentChunk = `${overlapText} ${trimmedSentence}`;
      currentStart = textOffset - overlapSize;
      chunkIndex++;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }

    textOffset += sentence.length;
  }

  // Add final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `chunk_${chunkIndex}`,
      content: currentChunk.trim(),
      index: chunkIndex,
      startOffset: currentStart,
      endOffset: textOffset,
      type: 'text',
    });
  }

  return chunks;
}

// ============================================================================
// CODE-AWARE CHUNKING
// ============================================================================

/**
 * Detect programming language from code content
 */
function detectLanguage(code: string): string {
  // Simple heuristics
  if (code.includes('fn ') && code.includes('->')) return 'rust';
  if (code.includes('def ') && code.includes(':')) return 'python';
  if (code.includes('func ') && code.includes('package')) return 'go';
  if (code.includes('interface ') || code.includes(': string') || code.includes(': number'))
    return 'typescript';
  if (code.includes('function ') || code.includes('=>') || code.includes('const '))
    return 'javascript';
  return 'unknown';
}

/**
 * Split code into logical blocks (functions, classes)
 */
function splitCodeBlocks(code: string, language: string): string[] {
  const pattern = CODE_SPLIT_PATTERNS[language as keyof typeof CODE_SPLIT_PATTERNS];

  if (!pattern) {
    // Fallback: split on double newlines
    return code.split(/\n\n+/).filter((b) => b.trim().length > 0);
  }

  const blocks = code.split(pattern).filter((b) => b.trim().length > 0);
  return blocks.length > 0 ? blocks : [code];
}

/**
 * Code-aware chunking that preserves code blocks and splits by function/class
 *
 * @param text - Input text (may contain markdown code blocks)
 * @param options - Chunking configuration
 * @returns Array of chunks with code blocks intact
 */
export function codeAwareChunk(text: string, options: Partial<ChunkingOptions> = {}): TextChunk[] {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  // Find all code blocks
  const codeBlocks: { start: number; end: number; language: string; content: string }[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  CODE_BLOCK_PATTERN.lastIndex = 0;

  while ((match = CODE_BLOCK_PATTERN.exec(text)) !== null) {
    codeBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      language: match[1] || detectLanguage(match[2]),
      content: match[2],
    });
  }

  // Process text and code blocks in order
  let lastEnd = 0;

  for (const block of codeBlocks) {
    // Process text before this code block
    if (block.start > lastEnd) {
      const textPart = text.slice(lastEnd, block.start);
      const textChunks = semanticChunk(textPart, opts);

      for (const tc of textChunks) {
        chunks.push({
          ...tc,
          id: `chunk_${chunkIndex}`,
          index: chunkIndex,
          startOffset: lastEnd + tc.startOffset,
          endOffset: lastEnd + tc.endOffset,
        });
        chunkIndex++;
      }
    }

    // Process code block
    if (opts.preserveCodeBlocks) {
      // Split code by functions/classes if too large
      if (block.content.length > opts.maxChunkSize) {
        const codeChunks = splitCodeBlocks(block.content, block.language);

        let codeOffset = 0;
        for (const codeChunk of codeChunks) {
          chunks.push({
            id: `chunk_${chunkIndex}`,
            content: codeChunk.trim(),
            index: chunkIndex,
            startOffset: block.start + codeOffset,
            endOffset: block.start + codeOffset + codeChunk.length,
            type: 'code',
            language: block.language,
          });
          codeOffset += codeChunk.length;
          chunkIndex++;
        }
      } else {
        // Keep code block intact
        chunks.push({
          id: `chunk_${chunkIndex}`,
          content: block.content.trim(),
          index: chunkIndex,
          startOffset: block.start,
          endOffset: block.end,
          type: 'code',
          language: block.language,
        });
        chunkIndex++;
      }
    }

    lastEnd = block.end;
  }

  // Process remaining text after last code block
  if (lastEnd < text.length) {
    const textPart = text.slice(lastEnd);
    const textChunks = semanticChunk(textPart, opts);

    for (const tc of textChunks) {
      chunks.push({
        ...tc,
        id: `chunk_${chunkIndex}`,
        index: chunkIndex,
        startOffset: lastEnd + tc.startOffset,
        endOffset: lastEnd + tc.endOffset,
      });
      chunkIndex++;
    }
  }

  // If no code blocks found, fall back to semantic chunking
  if (chunks.length === 0) {
    return semanticChunk(text, opts);
  }

  return chunks;
}

// ============================================================================
// EMBEDDING FUNCTIONS
// ============================================================================

/**
 * Check if Tauri backend is available
 */
const isTauri = (): boolean =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

/**
 * Get embedding from a specific model
 *
 * @param text - Text to embed
 * @param model - Embedding model to use
 * @returns Embedding result with vector and metadata
 */
export async function getEmbedding(
  text: string,
  model: EmbeddingModel = EMBEDDING_MODELS[0],
): Promise<EmbeddingResult> {
  // Generate content hash for caching
  const contentHash = await hashContent(text);

  // Check cache first
  const cached = await getCachedEmbedding(contentHash, model.name);
  if (cached) {
    return {
      vector: cached,
      model: model.name,
      dimensions: model.dimensions,
      cached: true,
      contentHash,
    };
  }

  // Generate embedding via Ollama
  let vector: number[];

  if (isTauri()) {
    try {
      vector = await invoke<number[]>('ollama_embed', {
        model: model.name,
        prompt: text,
      });
    } catch (error) {
      throw new Error(
        `Embedding failed with ${model.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } else {
    // Browser fallback: call Ollama API directly
    try {
      const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.name,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      vector = data.embedding;
    } catch (error) {
      throw new Error(
        `Embedding failed with ${model.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Validate vector dimensions
  if (vector.length !== model.dimensions) {
    console.warn(`Expected ${model.dimensions} dimensions but got ${vector.length}`);
  }

  // Cache the result
  await cacheEmbedding(contentHash, model.name, vector);

  return {
    vector,
    model: model.name,
    dimensions: vector.length,
    cached: false,
    contentHash,
  };
}

/**
 * Get embedding with automatic fallback through model chain
 *
 * @param text - Text to embed
 * @param preferredModels - Optional custom model order
 * @returns Embedding result from first successful model
 */
export async function embeddingWithFallback(
  text: string,
  preferredModels: EmbeddingModel[] = EMBEDDING_MODELS,
): Promise<EmbeddingResult> {
  const errors: string[] = [];

  for (const model of preferredModels) {
    try {
      const result = await getEmbedding(text, model);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${model.name}: ${errorMsg}`);
      console.warn(`Embedding fallback: ${model.name} failed, trying next...`);
    }
  }

  throw new Error(`All embedding models failed:\n${errors.join('\n')}`);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Embed multiple chunks in parallel with rate limiting
 *
 * @param chunks - Array of text chunks to embed
 * @param concurrency - Max parallel requests (default: 5)
 * @returns Array of embedding results
 */
export async function batchEmbed(
  chunks: TextChunk[],
  concurrency: number = 5,
): Promise<(EmbeddingResult & { chunkId: string })[]> {
  const results: (EmbeddingResult & { chunkId: string })[] = [];

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        const result = await embeddingWithFallback(chunk.content);
        return { ...result, chunkId: chunk.id };
      }),
    );

    results.push(...batchResults);
  }

  return results;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Find most similar chunks to a query
 *
 * @param queryEmbedding - Query vector
 * @param chunkEmbeddings - Array of chunk embeddings with IDs
 * @param topK - Number of results to return
 * @returns Sorted array of chunk IDs with similarity scores
 */
export function findSimilarChunks(
  queryEmbedding: number[],
  chunkEmbeddings: { chunkId: string; vector: number[] }[],
  topK: number = 5,
): { chunkId: string; similarity: number }[] {
  const similarities = chunkEmbeddings.map(({ chunkId, vector }) => ({
    chunkId,
    similarity: cosineSimilarity(queryEmbedding, vector),
  }));

  return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ~= 4 characters for English
  return Math.ceil(text.length / 4);
}

/**
 * Get embedding model by name
 */
export function getModelByName(name: string): EmbeddingModel | undefined {
  return EMBEDDING_MODELS.find((m) => m.name === name);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core chunking
  semanticChunk,
  codeAwareChunk,

  // Embeddings
  getEmbedding,
  embeddingWithFallback,
  batchEmbed,

  // Similarity
  cosineSimilarity,
  findSimilarChunks,

  // Cache management
  clearExpiredCache,

  // Utilities
  estimateTokens,
  getModelByName,

  // Constants
  EMBEDDING_MODELS,
};
