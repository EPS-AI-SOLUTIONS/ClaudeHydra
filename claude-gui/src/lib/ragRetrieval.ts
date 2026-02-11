/**
 * RAG Retrieval Optimization Module
 * Block 2: Advanced retrieval strategies for AI learning system
 *
 * Features:
 * 1. Hybrid search (BM25 + Vector) with RRF fusion
 * 2. Query expansion with synonyms and related terms
 * 3. Re-ranking based on multiple scoring factors
 * 4. Metadata filtering (type, date, tags, agent)
 * 5. MMR diversity to reduce redundancy
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

/** Document metadata for filtering and scoring */
export interface DocumentMetadata {
  id: string;
  type: 'code' | 'documentation' | 'conversation' | 'memory' | 'snippet';
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  agentSource?: string;
  language?: string;
  filePath?: string;
  tokenCount?: number;
}

/** Document with content and metadata */
export interface Document {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  embedding?: number[];
}

/** Search result with relevance scores */
export interface SearchResult {
  document: Document;
  score: number;
  bm25Score?: number;
  vectorScore?: number;
  rrfScore?: number;
  rerankScore?: number;
}

/** Query expansion result */
export interface ExpandedQuery {
  original: string;
  expanded: string[];
  synonyms: Map<string, string[]>;
  relatedTerms: string[];
}

/** Metadata filter options */
export interface MetadataFilter {
  types?: DocumentMetadata['type'][];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  tags?: string[];
  agentSources?: string[];
  languages?: string[];
  minTokenCount?: number;
  maxTokenCount?: number;
}

/** Hybrid search options */
export interface HybridSearchOptions {
  bm25Weight?: number;
  vectorWeight?: number;
  k?: number; // RRF constant (default 60)
  topK?: number;
  filter?: MetadataFilter;
  expandQuery?: boolean;
  rerank?: boolean;
  mmrDiversity?: number; // Lambda for MMR (0 = full diversity, 1 = full relevance)
}

/** Re-ranking options */
export interface RerankOptions {
  lengthWeight?: number;
  recencyWeight?: number;
  codePresenceWeight?: number;
  tagMatchWeight?: number;
  preferredLength?: number; // Ideal document length
}

// =============================================================================
// BM25 Implementation
// =============================================================================

/** BM25 parameters */
const BM25_K1 = 1.5; // Term frequency saturation
const BM25_B = 0.75; // Length normalization

/** Tokenize text for BM25 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/** Calculate term frequency in document */
function termFrequency(term: string, tokens: string[]): number {
  return tokens.filter((t) => t === term).length;
}

/** Calculate inverse document frequency */
function inverseDocumentFrequency(term: string, documents: Document[]): number {
  const docsWithTerm = documents.filter((doc) => tokenize(doc.content).includes(term)).length;

  if (docsWithTerm === 0) return 0;

  const N = documents.length;
  return Math.log((N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
}

/** Calculate BM25 score for a document given a query */
export function calculateBM25Score(
  query: string,
  document: Document,
  corpus: Document[],
  avgDocLength: number,
): number {
  const queryTerms = tokenize(query);
  const docTokens = tokenize(document.content);
  const docLength = docTokens.length;

  let score = 0;

  for (const term of queryTerms) {
    const tf = termFrequency(term, docTokens);
    const idf = inverseDocumentFrequency(term, corpus);

    // BM25 formula
    const numerator = tf * (BM25_K1 + 1);
    const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength));

    score += idf * (numerator / denominator);
  }

  return score;
}

/** Calculate BM25 scores for all documents */
function bm25Search(query: string, documents: Document[]): SearchResult[] {
  if (documents.length === 0) return [];

  const avgDocLength =
    documents.reduce((sum, doc) => sum + tokenize(doc.content).length, 0) / documents.length;

  return documents
    .map((document) => ({
      document,
      score: calculateBM25Score(query, document, documents, avgDocLength),
      bm25Score: calculateBM25Score(query, document, documents, avgDocLength),
    }))
    .sort((a, b) => b.score - a.score);
}

// =============================================================================
// Vector Similarity
// =============================================================================

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

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

/** Vector similarity search */
function vectorSearch(queryEmbedding: number[], documents: Document[]): SearchResult[] {
  return documents
    .filter((doc) => doc.embedding && doc.embedding.length > 0)
    .map((document) => {
      const similarity = cosineSimilarity(queryEmbedding, document.embedding as number[]);
      return {
        document,
        score: similarity,
        vectorScore: similarity,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// =============================================================================
// Feature 1: Hybrid Search with RRF
// =============================================================================

/**
 * Reciprocal Rank Fusion (RRF) to combine multiple ranked lists
 * Formula: score = sum(1 / (k + rank_i)) for each ranking system
 */
function reciprocalRankFusion(
  rankings: Map<string, number>[],
  k: number = 60,
): Map<string, number> {
  const fusedScores = new Map<string, number>();

  for (const ranking of rankings) {
    // Convert scores to ranks (1-indexed)
    const sortedEntries = Array.from(ranking.entries()).sort(([, a], [, b]) => b - a);

    sortedEntries.forEach(([docId], index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      fusedScores.set(docId, (fusedScores.get(docId) || 0) + rrfScore);
    });
  }

  return fusedScores;
}

/**
 * Hybrid search combining BM25 keyword search and vector similarity
 * using Reciprocal Rank Fusion (RRF)
 */
export async function hybridSearch(
  query: string,
  documents: Document[],
  queryEmbedding?: number[],
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const {
    bm25Weight = 0.5,
    vectorWeight = 0.5,
    k = 60,
    topK = 10,
    filter,
    expandQuery: shouldExpand = false,
    rerank: shouldRerank = false,
    mmrDiversity,
  } = options;

  // Apply metadata filtering first
  const filteredDocs = filter ? filterByMetadata(documents, filter) : documents;

  if (filteredDocs.length === 0) {
    return [];
  }

  // Expand query if requested
  let searchQuery = query;
  if (shouldExpand) {
    const expanded = expandQuery(query);
    searchQuery = [expanded.original, ...expanded.expanded].join(' ');
  }

  // BM25 search
  const bm25Results = bm25Search(searchQuery, filteredDocs);
  const bm25Scores = new Map<string, number>(
    bm25Results.map((r) => [r.document.id, r.bm25Score || 0]),
  );

  // Vector search (if embeddings available)
  let vectorScores = new Map<string, number>();
  if (queryEmbedding && queryEmbedding.length > 0) {
    const vectorResults = vectorSearch(queryEmbedding, filteredDocs);
    vectorScores = new Map(vectorResults.map((r) => [r.document.id, r.vectorScore || 0]));
  }

  // Apply RRF fusion
  const rankings: Map<string, number>[] = [];

  if (bm25Weight > 0) {
    // Weight BM25 scores
    const weightedBm25 = new Map<string, number>();
    bm25Scores.forEach((score, id) => {
      weightedBm25.set(id, score * bm25Weight);
    });
    rankings.push(weightedBm25);
  }

  if (vectorWeight > 0 && vectorScores.size > 0) {
    // Weight vector scores
    const weightedVector = new Map<string, number>();
    vectorScores.forEach((score, id) => {
      weightedVector.set(id, score * vectorWeight);
    });
    rankings.push(weightedVector);
  }

  const fusedScores = reciprocalRankFusion(rankings, k);

  // Create results with all scores
  let results: SearchResult[] = filteredDocs
    .map((document) => ({
      document,
      score: fusedScores.get(document.id) || 0,
      bm25Score: bm25Scores.get(document.id) || 0,
      vectorScore: vectorScores.get(document.id) || 0,
      rrfScore: fusedScores.get(document.id) || 0,
    }))
    .sort((a, b) => b.score - a.score);

  // Apply re-ranking if requested
  if (shouldRerank) {
    results = rerank(results, query);
  }

  // Apply MMR diversity if specified
  if (mmrDiversity !== undefined && mmrDiversity < 1) {
    results = mmrDiversify(results, mmrDiversity, topK);
  } else {
    results = results.slice(0, topK);
  }

  return results;
}

// =============================================================================
// Feature 2: Query Expansion
// =============================================================================

/** Common programming synonyms */
const PROGRAMMING_SYNONYMS: Record<string, string[]> = {
  function: ['method', 'procedure', 'routine', 'func', 'fn'],
  variable: ['var', 'const', 'let', 'parameter', 'argument'],
  array: ['list', 'collection', 'vector', 'sequence'],
  object: ['instance', 'entity', 'record', 'struct'],
  class: ['type', 'interface', 'prototype'],
  error: ['exception', 'bug', 'issue', 'problem', 'fault'],
  fix: ['repair', 'resolve', 'patch', 'correct', 'debug'],
  create: ['make', 'build', 'generate', 'construct', 'initialize'],
  delete: ['remove', 'destroy', 'drop', 'clear', 'erase'],
  update: ['modify', 'change', 'edit', 'alter', 'mutate'],
  search: ['find', 'query', 'lookup', 'filter', 'retrieve'],
  test: ['spec', 'check', 'verify', 'validate', 'assert'],
  import: ['require', 'include', 'load', 'use'],
  export: ['expose', 'provide', 'publish'],
  async: ['asynchronous', 'promise', 'await', 'concurrent'],
  loop: ['iterate', 'foreach', 'while', 'for', 'cycle'],
  condition: ['if', 'when', 'check', 'branch', 'switch'],
  string: ['text', 'str', 'char', 'varchar'],
  number: ['int', 'integer', 'float', 'numeric', 'digit'],
  boolean: ['bool', 'flag', 'true', 'false'],
  null: ['undefined', 'nil', 'none', 'empty', 'void'],
  api: ['endpoint', 'interface', 'service', 'rest', 'graphql'],
  database: ['db', 'storage', 'sql', 'nosql', 'datastore'],
  component: ['widget', 'element', 'module', 'part'],
  state: ['store', 'context', 'data', 'model'],
  render: ['display', 'draw', 'show', 'paint', 'view'],
  hook: ['lifecycle', 'effect', 'callback', 'listener'],
  typescript: ['ts', 'typed', 'strongly-typed'],
  javascript: ['js', 'ecmascript', 'node'],
  react: ['jsx', 'component', 'hooks'],
  memory: ['ram', 'heap', 'stack', 'cache', 'storage'],
  performance: ['speed', 'optimization', 'fast', 'efficient'],
};

/** Related terms for common concepts */
const RELATED_TERMS: Record<string, string[]> = {
  authentication: ['login', 'auth', 'oauth', 'jwt', 'session', 'token'],
  authorization: ['permission', 'role', 'access', 'rbac', 'acl'],
  validation: ['schema', 'zod', 'yup', 'joi', 'sanitize'],
  testing: ['jest', 'vitest', 'mocha', 'cypress', 'playwright'],
  styling: ['css', 'scss', 'tailwind', 'styled-components', 'emotion'],
  routing: ['router', 'navigation', 'path', 'route', 'link'],
  fetching: ['axios', 'fetch', 'query', 'swr', 'tanstack'],
  forms: ['input', 'field', 'submit', 'validation', 'formik'],
};

/**
 * Expand query with synonyms and related terms
 */
export function expandQuery(query: string): ExpandedQuery {
  const tokens = tokenize(query);
  const synonyms = new Map<string, string[]>();
  const relatedTerms: string[] = [];
  const expanded: string[] = [];

  for (const token of tokens) {
    // Find synonyms
    if (PROGRAMMING_SYNONYMS[token]) {
      synonyms.set(token, PROGRAMMING_SYNONYMS[token]);
      expanded.push(...PROGRAMMING_SYNONYMS[token].slice(0, 3)); // Limit to top 3
    }

    // Check reverse synonyms (if token is a synonym of something)
    for (const [key, values] of Object.entries(PROGRAMMING_SYNONYMS)) {
      if (values.includes(token) && !synonyms.has(token)) {
        synonyms.set(token, [key, ...values.filter((v) => v !== token)]);
        expanded.push(key);
      }
    }

    // Find related terms
    if (RELATED_TERMS[token]) {
      relatedTerms.push(...RELATED_TERMS[token]);
    }

    // Check if token relates to a category
    for (const [key, values] of Object.entries(RELATED_TERMS)) {
      if (values.includes(token) && !relatedTerms.includes(key)) {
        relatedTerms.push(key);
      }
    }
  }

  return {
    original: query,
    expanded: [...new Set(expanded)],
    synonyms,
    relatedTerms: [...new Set(relatedTerms)],
  };
}

// =============================================================================
// Feature 3: Re-ranking
// =============================================================================

/** Check if content contains code snippets */
function containsCode(content: string): boolean {
  const codePatterns = [
    /```[\s\S]*?```/, // Markdown code blocks
    /function\s+\w+\s*\(/, // Function declarations
    /const\s+\w+\s*=/, // Const declarations
    /let\s+\w+\s*=/, // Let declarations
    /import\s+.*from/, // Import statements
    /export\s+(default\s+)?/, // Export statements
    /class\s+\w+/, // Class declarations
    /=>\s*{/, // Arrow functions
    /\(\s*\)\s*=>/, // Arrow function expressions
    /<\w+[^>]*>/, // JSX/HTML tags
  ];

  return codePatterns.some((pattern) => pattern.test(content));
}

/** Calculate length score (Gaussian around preferred length) */
function lengthScore(length: number, preferredLength: number): number {
  const sigma = preferredLength * 0.5; // Standard deviation
  const diff = length - preferredLength;
  return Math.exp(-(diff * diff) / (2 * sigma * sigma));
}

/** Calculate recency score (exponential decay) */
function recencyScore(date: Date, halfLifeDays: number = 30): number {
  const now = new Date();
  const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return 0.5 ** (daysDiff / halfLifeDays);
}

/**
 * Re-rank search results based on multiple factors
 */
export function rerank(
  results: SearchResult[],
  query: string,
  options: RerankOptions = {},
): SearchResult[] {
  const {
    lengthWeight = 0.15,
    recencyWeight = 0.2,
    codePresenceWeight = 0.15,
    tagMatchWeight = 0.1,
    preferredLength = 500,
  } = options;

  const queryTokens = new Set(tokenize(query));
  const baseWeight = 1 - lengthWeight - recencyWeight - codePresenceWeight - tagMatchWeight;

  return results
    .map((result) => {
      const doc = result.document;
      const content = doc.content;

      // Base score (original search score)
      let finalScore = result.score * baseWeight;

      // Length factor
      const docLength = content.length;
      finalScore += lengthScore(docLength, preferredLength) * lengthWeight;

      // Recency factor
      const docDate = doc.metadata.updatedAt || doc.metadata.createdAt;
      finalScore += recencyScore(docDate) * recencyWeight;

      // Code presence factor (boost documents with code if query seems code-related)
      const queryHasCodeTerms = [...queryTokens].some(
        (token) =>
          PROGRAMMING_SYNONYMS[token] ||
          ['code', 'function', 'implement', 'bug', 'error'].includes(token),
      );
      if (queryHasCodeTerms && containsCode(content)) {
        finalScore += codePresenceWeight;
      }

      // Tag match factor
      const tags = doc.metadata.tags || [];
      const matchingTags = tags.filter((tag) => queryTokens.has(tag.toLowerCase()));
      const tagScore = Math.min(matchingTags.length / Math.max(queryTokens.size, 1), 1);
      finalScore += tagScore * tagMatchWeight;

      return {
        ...result,
        rerankScore: finalScore,
        score: finalScore,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// =============================================================================
// Feature 4: Metadata Filtering
// =============================================================================

/**
 * Filter documents by metadata criteria
 */
export function filterByMetadata(documents: Document[], filter: MetadataFilter): Document[] {
  return documents.filter((doc) => {
    const meta = doc.metadata;

    // Type filter
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(meta.type)) {
        return false;
      }
    }

    // Date range filter
    if (filter.dateRange) {
      const docDate = meta.updatedAt || meta.createdAt;
      if (filter.dateRange.start && docDate < filter.dateRange.start) {
        return false;
      }
      if (filter.dateRange.end && docDate > filter.dateRange.end) {
        return false;
      }
    }

    // Tags filter (document must have at least one matching tag)
    if (filter.tags && filter.tags.length > 0) {
      const docTags = meta.tags || [];
      const hasMatchingTag = filter.tags.some((tag) =>
        docTags.some((docTag) => docTag.toLowerCase() === tag.toLowerCase()),
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    // Agent source filter
    if (filter.agentSources && filter.agentSources.length > 0) {
      if (!meta.agentSource || !filter.agentSources.includes(meta.agentSource)) {
        return false;
      }
    }

    // Language filter
    if (filter.languages && filter.languages.length > 0) {
      if (!meta.language || !filter.languages.includes(meta.language)) {
        return false;
      }
    }

    // Token count filter
    if (filter.minTokenCount !== undefined) {
      const tokenCount = meta.tokenCount || tokenize(doc.content).length;
      if (tokenCount < filter.minTokenCount) {
        return false;
      }
    }

    if (filter.maxTokenCount !== undefined) {
      const tokenCount = meta.tokenCount || tokenize(doc.content).length;
      if (tokenCount > filter.maxTokenCount) {
        return false;
      }
    }

    return true;
  });
}

// =============================================================================
// Feature 5: MMR Diversity
// =============================================================================

/**
 * Calculate similarity between two documents based on their content
 */
function documentSimilarity(doc1: Document, doc2: Document): number {
  // If embeddings available, use cosine similarity
  if (doc1.embedding && doc2.embedding) {
    return cosineSimilarity(doc1.embedding, doc2.embedding);
  }

  // Fallback to Jaccard similarity on tokens
  const tokens1 = new Set(tokenize(doc1.content));
  const tokens2 = new Set(tokenize(doc2.content));

  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** Internal type for MMR calculation with normalized score */
interface NormalizedSearchResult extends SearchResult {
  normalizedScore: number;
}

/**
 * Maximal Marginal Relevance (MMR) for diversifying results
 *
 * MMR = lambda * Relevance(d) - (1-lambda) * max(Similarity(d, d_selected))
 *
 * @param results - Search results sorted by relevance
 * @param lambda - Balance between relevance (1) and diversity (0), default 0.7
 * @param topK - Number of results to return
 */
export function mmrDiversify(
  results: SearchResult[],
  lambda: number = 0.7,
  topK: number = 10,
): SearchResult[] {
  if (results.length === 0) return [];
  if (results.length <= topK && lambda >= 1) return results.slice(0, topK);

  // Normalize scores to [0, 1] range
  const maxScore = Math.max(...results.map((r) => r.score));
  const minScore = Math.min(...results.map((r) => r.score));
  const scoreRange = maxScore - minScore || 1;

  const normalizedResults: NormalizedSearchResult[] = results.map((r) => ({
    ...r,
    normalizedScore: (r.score - minScore) / scoreRange,
  }));

  const selected: NormalizedSearchResult[] = [];
  const remaining = [...normalizedResults];

  // Always select the most relevant document first
  const firstResult = remaining.shift();
  if (firstResult) {
    selected.push(firstResult);
  }

  // Iteratively select documents that maximize MMR
  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Calculate max similarity to already selected documents
      let maxSimilarity = 0;
      for (const selectedResult of selected) {
        const similarity = documentSimilarity(candidate.document, selectedResult.document);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }

      // MMR formula
      const mmrScore = lambda * candidate.normalizedScore - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const [selectedItem] = remaining.splice(bestIdx, 1);
      selected.push(selectedItem);
    } else {
      break;
    }
  }

  // Return results without the internal normalizedScore property
  return selected.map(
    (item): SearchResult => ({
      document: item.document,
      score: item.score,
      bm25Score: item.bm25Score,
      vectorScore: item.vectorScore,
      rrfScore: item.rrfScore,
      rerankScore: item.rerankScore,
    }),
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a simple document for testing
 */
export function createDocument(
  id: string,
  content: string,
  metadata: Partial<DocumentMetadata> = {},
): Document {
  return {
    id,
    content,
    metadata: {
      id,
      type: metadata.type || 'documentation',
      createdAt: metadata.createdAt || new Date(),
      updatedAt: metadata.updatedAt || new Date(),
      tags: metadata.tags || [],
      agentSource: metadata.agentSource,
      language: metadata.language,
      filePath: metadata.filePath,
      tokenCount: metadata.tokenCount,
    },
  };
}

/**
 * Calculate average document length for BM25 optimization
 */
export function calculateAvgDocLength(documents: Document[]): number {
  if (documents.length === 0) return 0;
  return documents.reduce((sum, doc) => sum + tokenize(doc.content).length, 0) / documents.length;
}

/**
 * Get term statistics for IDF caching
 */
export function getTermStatistics(documents: Document[]): Map<string, { df: number; idf: number }> {
  const stats = new Map<string, { df: number; idf: number }>();
  const N = documents.length;

  // Count document frequency for each term
  const dfMap = new Map<string, number>();
  for (const doc of documents) {
    const uniqueTerms = new Set(tokenize(doc.content));
    for (const term of uniqueTerms) {
      dfMap.set(term, (dfMap.get(term) || 0) + 1);
    }
  }

  // Calculate IDF for each term
  dfMap.forEach((df, term) => {
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    stats.set(term, { df, idf });
  });

  return stats;
}

// =============================================================================
// Export all features
// =============================================================================

export {
  bm25Search,
  vectorSearch,
  reciprocalRankFusion,
  tokenize,
  termFrequency,
  inverseDocumentFrequency,
  containsCode,
  lengthScore,
  recencyScore,
  documentSimilarity,
};
