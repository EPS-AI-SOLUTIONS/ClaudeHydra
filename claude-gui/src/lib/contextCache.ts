/**
 * Block 6: Context Enrichment & Caching
 *
 * Features:
 * 1. LRU Cache - Research results cache (max 100 items, 1h TTL)
 * 2. Context compression - Summarize long contexts to key points
 * 3. GitHub search - Interface for GitHub code search via MCP
 * 4. Documentation index - Structure for indexing scraped docs
 * 5. Conversation context - Extract relevant past exchanges
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

/** Cache entry with metadata for LRU tracking */
interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  hitCount: number;
}

/** GitHub search result structure */
interface GitHubSearchResult {
  repository: string;
  path: string;
  filename: string;
  content: string;
  url: string;
  score: number;
  language: string | null;
}

/** GitHub search options */
interface GitHubSearchOptions {
  query: string;
  language?: string;
  repo?: string;
  user?: string;
  org?: string;
  extension?: string;
  maxResults?: number;
}

/** Documentation index entry */
export interface DocIndex {
  library: string;
  version: string;
  content: string;
  url: string;
  lastUpdated: number;
  sections?: DocSection[];
}

/** Documentation section for granular indexing */
interface DocSection {
  title: string;
  content: string;
  anchor?: string;
}

/** Chat message for context extraction */
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/** Similarity result for conversation context */
interface SimilarityResult {
  message: ConversationMessage;
  similarity: number;
}

// =============================================================================
// 1. LRU Cache Implementation
// =============================================================================

const DEFAULT_MAX_SIZE = 100;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * LRU (Least Recently Used) Cache with TTL support
 * Tracks: key, value, timestamp, hitCount
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number = DEFAULT_MAX_SIZE, ttlMs: number = DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a value from cache
   * Returns undefined if key doesn't exist or entry has expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // TTL check
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    // Update hit count and move to end (most recently used)
    entry.hitCount += 1;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in cache
   * Evicts least recently used items if cache is full
   */
  set(key: string, value: T): void {
    // If key exists, remove it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict LRU items if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    // Add new entry
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      hitCount: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get entry metadata (for debugging/monitoring)
   */
  getMetadata(key: string): Omit<CacheEntry<T>, 'value'> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    return {
      key: entry.key,
      timestamp: entry.timestamp,
      hitCount: entry.hitCount,
    };
  }

  /**
   * Get all entries with metadata (for monitoring)
   */
  getStats(): Array<{ key: string; timestamp: number; hitCount: number; age: number }> {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      timestamp: entry.timestamp,
      hitCount: entry.hitCount,
      age: now - entry.timestamp,
    }));
  }

  /**
   * Remove all expired entries
   */
  prune(): number {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.ttlMs;
  }
}

// =============================================================================
// 2. Context Compression
// =============================================================================

const MAX_CONTEXT_LENGTH = 500;
const KEY_POINT_MARKERS = [
  'important',
  'key',
  'note',
  'summary',
  'conclusion',
  'result',
  'finding',
  'because',
  'therefore',
  'must',
  'should',
  'critical',
  'essential',
];

/**
 * Compress long context to key points
 * Returns original text if under threshold, otherwise extracts key sentences
 */
export function compressContext(text: string, maxLength: number = MAX_CONTEXT_LENGTH): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  // Split into sentences
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);

  if (sentences.length === 0) {
    return `${text.substring(0, maxLength)}...`;
  }

  // Score sentences by importance
  const scoredSentences = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: calculateSentenceScore(sentence, index, sentences.length),
  }));

  // Sort by score descending
  scoredSentences.sort((a, b) => b.score - a.score);

  // Build compressed context from highest-scored sentences
  const selectedSentences: Array<{ sentence: string; index: number }> = [];
  let currentLength = 0;

  for (const item of scoredSentences) {
    if (currentLength + item.sentence.length + 1 <= maxLength) {
      selectedSentences.push({ sentence: item.sentence, index: item.index });
      currentLength += item.sentence.length + 1;
    }
  }

  // Sort by original order for coherence
  selectedSentences.sort((a, b) => a.index - b.index);

  const compressed = selectedSentences.map((s) => s.sentence).join(' ');

  // Add ellipsis if significantly shorter
  if (compressed.length < text.length * 0.5) {
    return `${compressed} [...]`;
  }

  return compressed;
}

/**
 * Calculate importance score for a sentence
 */
function calculateSentenceScore(
  sentence: string,
  position: number,
  totalSentences: number,
): number {
  let score = 0;
  const lowerSentence = sentence.toLowerCase();

  // Bonus for key point markers
  for (const marker of KEY_POINT_MARKERS) {
    if (lowerSentence.includes(marker)) {
      score += 2;
    }
  }

  // First and last sentences often contain key info
  if (position === 0) score += 3;
  if (position === totalSentences - 1) score += 2;

  // Longer sentences tend to have more information
  if (sentence.length > 50 && sentence.length < 200) {
    score += 1;
  }

  // Contains numbers/data
  if (/\d+/.test(sentence)) {
    score += 1;
  }

  // Contains code-like content
  if (/[`'"][\w\s]+[`'"]|[\w]+\(|=>|->/.test(sentence)) {
    score += 2;
  }

  return score;
}

// =============================================================================
// 3. GitHub Search Interface
// =============================================================================

/**
 * Search GitHub code via MCP github.search_code
 * Requires GitHub MCP server to be connected
 */
export async function searchGitHub(options: GitHubSearchOptions): Promise<GitHubSearchResult[]> {
  const { query, language, repo, user, org, extension, maxResults = 10 } = options;

  // Build GitHub search query
  const queryParts: string[] = [query];

  if (language) queryParts.push(`language:${language}`);
  if (repo) queryParts.push(`repo:${repo}`);
  if (user) queryParts.push(`user:${user}`);
  if (org) queryParts.push(`org:${org}`);
  if (extension) queryParts.push(`extension:${extension}`);

  const fullQuery = queryParts.join(' ');

  try {
    // Check if Tauri is available
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      console.warn('[GitHub Search] Not running in Tauri, returning mock data');
      return createMockGitHubResults(query);
    }

    // Import Tauri invoke dynamically
    const { invoke } = await import('@tauri-apps/api/core');

    // Call MCP GitHub search via Tauri command
    const results = await invoke<GitHubSearchResult[]>('mcp_github_search_code', {
      query: fullQuery,
      maxResults,
    });

    return results;
  } catch (error) {
    console.error('[GitHub Search] Error:', error);

    // Return empty array on error instead of throwing
    // This allows graceful degradation when MCP is unavailable
    return [];
  }
}

/**
 * Create mock GitHub results for development/testing
 */
function createMockGitHubResults(query: string): GitHubSearchResult[] {
  return [
    {
      repository: 'example/repo',
      path: 'src/example.ts',
      filename: 'example.ts',
      content: `// Mock result for query: ${query}\nconst example = true;`,
      url: 'https://github.com/example/repo/blob/main/src/example.ts',
      score: 1.0,
      language: 'TypeScript',
    },
  ];
}

// =============================================================================
// 4. Documentation Index
// =============================================================================

/**
 * Create a new documentation index entry
 */
export function createDocIndex(
  library: string,
  version: string,
  content: string,
  url: string,
  sections?: DocSection[],
): DocIndex {
  return {
    library,
    version,
    content,
    url,
    lastUpdated: Date.now(),
    sections,
  };
}

/**
 * Search documentation index for relevant content
 */
export function searchDocIndex(
  indices: DocIndex[],
  query: string,
  options?: { library?: string; minScore?: number },
): Array<DocIndex & { relevanceScore: number }> {
  const { library, minScore = 0.1 } = options ?? {};
  const queryTerms = query.toLowerCase().split(/\s+/);

  const results = indices
    .filter((doc) => !library || doc.library.toLowerCase() === library.toLowerCase())
    .map((doc) => {
      const score = calculateDocRelevance(doc, queryTerms);
      return { ...doc, relevanceScore: score };
    })
    .filter((doc) => doc.relevanceScore >= minScore);

  // Sort by relevance descending
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return results;
}

/**
 * Calculate relevance score for a documentation entry
 */
function calculateDocRelevance(doc: DocIndex, queryTerms: string[]): number {
  let score = 0;
  const content = `${doc.library} ${doc.content}`.toLowerCase();

  for (const term of queryTerms) {
    // Exact match bonus
    if (content.includes(term)) {
      score += 1;
    }

    // Library name match bonus
    if (doc.library.toLowerCase().includes(term)) {
      score += 2;
    }

    // Section title matches
    if (doc.sections) {
      for (const section of doc.sections) {
        if (section.title.toLowerCase().includes(term)) {
          score += 1.5;
        }
        if (section.content.toLowerCase().includes(term)) {
          score += 0.5;
        }
      }
    }
  }

  // Normalize by query length
  return score / queryTerms.length;
}

// =============================================================================
// 5. Conversation Context Extraction
// =============================================================================

/**
 * Extract relevant past exchanges based on similarity to current query
 */
export function getRelevantHistory(
  messages: ConversationMessage[],
  currentQuery: string,
  options?: { maxResults?: number; minSimilarity?: number },
): ConversationMessage[] {
  const { maxResults = 5, minSimilarity = 0.1 } = options ?? {};

  if (!messages.length || !currentQuery.trim()) {
    return [];
  }

  // Calculate similarity for each message
  const scoredMessages: SimilarityResult[] = messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      message: msg,
      similarity: calculateTextSimilarity(currentQuery, msg.content),
    }))
    .filter((result) => result.similarity >= minSimilarity);

  // Sort by similarity descending
  scoredMessages.sort((a, b) => b.similarity - a.similarity);

  // Return top N messages
  return scoredMessages.slice(0, maxResults).map((r) => r.message);
}

/**
 * Calculate text similarity using TF-IDF inspired scoring
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.length === 0 || tokens2.length === 0) {
    return 0;
  }

  // Create term frequency maps
  const tf1 = createTermFrequency(tokens1);
  const tf2 = createTermFrequency(tokens2);

  // Calculate cosine similarity
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  const allTerms = new Set([...tf1.keys(), ...tf2.keys()]);

  for (const term of allTerms) {
    const freq1 = tf1.get(term) ?? 0;
    const freq2 = tf2.get(term) ?? 0;

    dotProduct += freq1 * freq2;
    magnitude1 += freq1 * freq1;
    magnitude2 += freq2 * freq2;
  }

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
}

/**
 * Tokenize text into normalized terms
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2) // Filter short tokens
    .filter((token) => !STOP_WORDS.has(token));
}

/**
 * Create term frequency map
 */
function createTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();

  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  // Normalize by total token count
  const total = tokens.length;
  for (const [term, count] of tf.entries()) {
    tf.set(term, count / total);
  }

  return tf;
}

/**
 * Common English stop words to filter out
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'been',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'they',
  'them',
  'their',
  'we',
  'us',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'i',
  'me',
  'my',
  'what',
  'which',
  'who',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'same',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'here',
  'there',
  'then',
]);

// =============================================================================
// Singleton Instances
// =============================================================================

/** Global research results cache */
export const researchCache = new LRUCache<unknown>(100, 60 * 60 * 1000);

/** Global documentation index cache */
export const docCache = new LRUCache<DocIndex[]>(50, 24 * 60 * 60 * 1000); // 24h TTL

/** Global GitHub search results cache */
export const githubCache = new LRUCache<GitHubSearchResult[]>(100, 30 * 60 * 1000); // 30min TTL
