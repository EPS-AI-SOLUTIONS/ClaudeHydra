/**
 * @fileoverview RAG Engine - Retrieval Augmented Generation
 * Vector-based semantic search using Ollama embeddings
 *
 * @description
 * Provides semantic memory retrieval for context injection.
 * Uses Ollama's embedding model (mxbai-embed-large) for vectorization.
 * Stores vectors in local JSON-based vector store (no Python required).
 *
 * @module learning/rag-engine
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

/** @type {string} Vector store directory */
const VECTOR_DIR = join(REPO_ROOT, 'data', 'vectors');

/** @type {string} Ollama embedding model */
const EMBEDDING_MODEL = 'mxbai-embed-large';

/** @type {string} Ollama base URL */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/** @type {number} Embedding dimension for mxbai-embed-large */
const EMBEDDING_DIM = 1024;

/** @type {number} Maximum documents to return */
const DEFAULT_TOP_K = 5;

/**
 * @typedef {Object} Document
 * @property {string} id - Unique document ID
 * @property {string} content - Document text content
 * @property {number[]} [embedding] - Vector embedding
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} id - Document ID
 * @property {string} content - Document content
 * @property {number} score - Similarity score (0-1)
 * @property {Object} metadata - Document metadata
 */

/**
 * In-memory vector store
 * @type {Map<string, Document>}
 */
const vectorStore = new Map();

/**
 * Cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Generates embedding for text using Ollama
 *
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 * @throws {Error} If Ollama is unavailable or model not found
 */
export async function getEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8192) // Max context for embedding
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      // Try alternative endpoint (older Ollama versions)
      const altResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          prompt: text.slice(0, 8192)
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!altResponse.ok) {
        throw new Error(`Embedding failed: ${response.status}`);
      }

      const altData = await altResponse.json();
      return altData.embedding;
    }

    const data = await response.json();
    return data.embeddings?.[0] || data.embedding;
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('Embedding timeout - is Ollama running?');
    }
    throw error;
  }
}

/**
 * Checks if embedding model is available
 *
 * @returns {Promise<{available: boolean, model: string}>}
 */
export async function checkEmbeddingModel() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return { available: false, model: EMBEDDING_MODEL };
    }

    const data = await response.json();
    const models = data.models?.map(m => m.name) || [];
    const hasModel = models.some(m => m.includes('mxbai-embed') || m.includes('nomic-embed'));

    return {
      available: hasModel,
      model: EMBEDDING_MODEL,
      installedModels: models.filter(m => m.includes('embed'))
    };
  } catch {
    return { available: false, model: EMBEDDING_MODEL };
  }
}

/**
 * Adds a document to the vector store
 *
 * @param {string} id - Unique document ID
 * @param {string} content - Document content
 * @param {Object} [metadata={}] - Additional metadata
 * @returns {Promise<{success: boolean, id: string}>}
 *
 * @example
 * await addDocument('doc-001', 'React hooks are functions...', {
 *   topic: 'react',
 *   source: 'conversation'
 * });
 */
export async function addDocument(id, content, metadata = {}) {
  try {
    const embedding = await getEmbedding(content);

    const doc = {
      id,
      content,
      embedding,
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
        content_length: content.length
      }
    };

    vectorStore.set(id, doc);

    return { success: true, id };
  } catch (error) {
    return { success: false, id, error: error.message };
  }
}

/**
 * Adds multiple documents in batch
 *
 * @param {Array<{id: string, content: string, metadata?: Object}>} documents
 * @returns {Promise<{success: number, failed: number}>}
 */
export async function addDocuments(documents) {
  let success = 0;
  let failed = 0;

  for (const doc of documents) {
    const result = await addDocument(doc.id, doc.content, doc.metadata);
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Searches for similar documents
 *
 * @param {string} query - Search query
 * @param {Object} [options={}] - Search options
 * @param {number} [options.topK=5] - Number of results
 * @param {number} [options.minScore=0.5] - Minimum similarity score
 * @param {Object} [options.filter] - Metadata filter
 * @returns {Promise<SearchResult[]>}
 *
 * @example
 * const results = await search('How do I use React hooks?', {
 *   topK: 3,
 *   minScore: 0.7
 * });
 */
export async function search(query, options = {}) {
  const { topK = DEFAULT_TOP_K, minScore = 0.5, filter } = options;

  if (vectorStore.size === 0) {
    return [];
  }

  const queryEmbedding = await getEmbedding(query);

  const results = [];

  for (const [id, doc] of vectorStore) {
    // Apply metadata filter
    if (filter) {
      let matches = true;
      for (const [key, value] of Object.entries(filter)) {
        if (doc.metadata[key] !== value) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
    }

    const score = cosineSimilarity(queryEmbedding, doc.embedding);

    if (score >= minScore) {
      results.push({
        id,
        content: doc.content,
        score,
        metadata: doc.metadata
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, topK);
}

/**
 * Retrieves context for a query (RAG-style)
 * Returns formatted context string for prompt injection
 *
 * @param {string} query - User query
 * @param {Object} [options={}] - Retrieval options
 * @returns {Promise<{context: string, sources: SearchResult[]}>}
 *
 * @example
 * const { context, sources } = await retrieveContext('Explain closures');
 * const prompt = `Context:\n${context}\n\nQuestion: Explain closures`;
 */
export async function retrieveContext(query, options = {}) {
  const results = await search(query, options);

  if (results.length === 0) {
    return { context: '', sources: [] };
  }

  const contextParts = results.map((r, i) =>
    `[Source ${i + 1}] (score: ${r.score.toFixed(2)})\n${r.content}`
  );

  return {
    context: contextParts.join('\n\n---\n\n'),
    sources: results
  };
}

/**
 * Saves vector store to disk
 *
 * @param {string} [name='default'] - Store name
 * @returns {Promise<{path: string, documents: number}>}
 */
export async function saveStore(name = 'default') {
  await mkdir(VECTOR_DIR, { recursive: true });

  const filePath = join(VECTOR_DIR, `${name}.json`);

  const data = {
    version: 1,
    model: EMBEDDING_MODEL,
    dimension: EMBEDDING_DIM,
    documents: Array.from(vectorStore.entries()).map(([id, doc]) => ({
      id,
      content: doc.content,
      embedding: doc.embedding,
      metadata: doc.metadata
    })),
    saved_at: new Date().toISOString()
  };

  await writeFile(filePath, JSON.stringify(data), 'utf8');

  return { path: filePath, documents: vectorStore.size };
}

/**
 * Loads vector store from disk
 *
 * @param {string} [name='default'] - Store name
 * @returns {Promise<{loaded: number, path: string}>}
 */
export async function loadStore(name = 'default') {
  const filePath = join(VECTOR_DIR, `${name}.json`);

  try {
    const content = await readFile(filePath, 'utf8');
    const data = JSON.parse(content);

    vectorStore.clear();

    for (const doc of data.documents) {
      vectorStore.set(doc.id, {
        id: doc.id,
        content: doc.content,
        embedding: doc.embedding,
        metadata: doc.metadata
      });
    }

    return { loaded: vectorStore.size, path: filePath };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { loaded: 0, path: filePath };
    }
    throw error;
  }
}

/**
 * Gets vector store statistics
 *
 * @returns {{documents: number, model: string, memoryMB: number}}
 */
export function getStats() {
  let memoryBytes = 0;

  for (const doc of vectorStore.values()) {
    memoryBytes += doc.content.length * 2; // UTF-16
    memoryBytes += doc.embedding.length * 8; // Float64
  }

  return {
    documents: vectorStore.size,
    model: EMBEDDING_MODEL,
    memoryMB: (memoryBytes / 1024 / 1024).toFixed(2)
  };
}

/**
 * Clears the vector store
 */
export function clearStore() {
  vectorStore.clear();
}

/**
 * Deletes a document by ID
 *
 * @param {string} id - Document ID
 * @returns {boolean} True if deleted
 */
export function deleteDocument(id) {
  return vectorStore.delete(id);
}

export default {
  getEmbedding,
  checkEmbeddingModel,
  addDocument,
  addDocuments,
  search,
  retrieveContext,
  saveStore,
  loadStore,
  getStats,
  clearStore,
  deleteDocument,
  EMBEDDING_MODEL,
  VECTOR_DIR
};
