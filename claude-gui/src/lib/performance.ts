/**
 * Performance & Batching Module - Block 8 of AI Learning System
 *
 * 5 key features for optimizing RAG and embedding operations:
 * 1. EmbeddingBatcher - Queue embeddings and batch up to 10 texts per API call
 * 2. AsyncQueue - Promise-based queue for non-blocking RAG writes
 * 3. SimpleANN - Approximate nearest neighbor using bucketing
 * 4. LazyEmbedding - Defer embedding until first retrieval
 * 5. QueryCache - Cache query results by hash with 5-minute TTL
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface LazyEmbedding {
  id: string;
  content: string;
  embedding: number[] | null;
  metadata?: Record<string, unknown>;
  createdAt: number;
  embeddedAt: number | null;
}

export interface BatchRequest {
  id: string;
  text: string;
  resolve: (embedding: number[]) => void;
  reject: (error: Error) => void;
}

export interface QueueTask<T = unknown> {
  id: string;
  execute: () => Promise<T>;
  priority: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

export interface CacheEntry<T> {
  value: T;
  hash: string;
  createdAt: number;
  expiresAt: number;
  hits: number;
}

export interface ANNBucket {
  centroid: number;
  items: Array<{ id: string; embedding: number[] }>;
}

export type EmbeddingFunction = (texts: string[]) => Promise<number[][]>;

// ============================================================================
// 1. EmbeddingBatcher - Batch up to 10 texts per API call
// ============================================================================

export class EmbeddingBatcher {
  private queue: BatchRequest[] = [];
  private batchSize: number;
  private flushTimeoutMs: number;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private embeddingFn: EmbeddingFunction;
  private processing = false;

  public onBatchReady?: (texts: string[], count: number) => void;

  constructor(
    embeddingFn: EmbeddingFunction,
    options?: { batchSize?: number; flushTimeoutMs?: number },
  ) {
    this.embeddingFn = embeddingFn;
    this.batchSize = options?.batchSize ?? 10;
    this.flushTimeoutMs = options?.flushTimeoutMs ?? 100;
  }

  /**
   * Add text to the batch queue. Returns promise that resolves with embedding.
   */
  add(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const request: BatchRequest = {
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        text,
        resolve,
        reject,
      };

      this.queue.push(request);

      // Auto-flush when batch is full
      if (this.queue.length >= this.batchSize) {
        this.flush();
      } else {
        // Schedule flush after timeout
        this.scheduleFlush();
      }
    });
  }

  /**
   * Immediately process all queued texts
   */
  async flush(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.clearFlushTimer();
    this.processing = true;

    // Take up to batchSize items
    const batch = this.queue.splice(0, this.batchSize);
    const texts = batch.map((r) => r.text);

    // Notify callback
    this.onBatchReady?.(texts, batch.length);

    try {
      const embeddings = await this.embeddingFn(texts);

      // Resolve each request with its embedding
      batch.forEach((request, index) => {
        if (embeddings[index]) {
          request.resolve(embeddings[index]);
        } else {
          request.reject(new Error(`No embedding returned for index ${index}`));
        }
      });
    } catch (error) {
      // Reject all requests in batch
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      batch.forEach((request) => {
        request.reject(new Error(`Batch embedding failed: ${errorMsg}`));
      });
    } finally {
      this.processing = false;

      // Process remaining items
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushTimeoutMs);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get current queue size
   */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if currently processing
   */
  get isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Clear all pending requests (rejects them)
   */
  clear(): void {
    this.clearFlushTimer();
    const pending = this.queue.splice(0);
    pending.forEach((request) => {
      request.reject(new Error('Batcher cleared'));
    });
  }
}

// ============================================================================
// 2. AsyncQueue - Promise-based queue for non-blocking RAG writes
// ============================================================================

export class AsyncQueue<T = unknown> {
  private queue: QueueTask<T>[] = [];
  private concurrency: number;
  private activeCount = 0;
  private paused = false;

  public onComplete?: (taskId: string, result: T) => void;
  public onError?: (taskId: string, error: Error) => void;
  public onDrain?: () => void;

  constructor(concurrency = 3) {
    this.concurrency = concurrency;
  }

  /**
   * Add task to queue. Returns promise that resolves when task completes.
   */
  enqueue(execute: () => Promise<T>, priority = 5): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: QueueTask<T> = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        execute,
        priority,
        resolve,
        reject,
        createdAt: Date.now(),
      };

      this.queue.push(task);
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }

  /**
   * Process next tasks from queue
   */
  async process(): Promise<void> {
    if (this.paused) return;

    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.activeCount++;

      // Execute task asynchronously
      task
        .execute()
        .then((result) => {
          task.resolve(result);
          this.onComplete?.(task.id, result);
        })
        .catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          task.reject(err);
          this.onError?.(task.id, err);
        })
        .finally(() => {
          this.activeCount--;
          this.process();

          // Check if queue is drained
          if (this.activeCount === 0 && this.queue.length === 0) {
            this.onDrain?.();
          }
        });
    }
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.paused = false;
    this.process();
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    pending: number;
    active: number;
    paused: boolean;
    concurrency: number;
  } {
    return {
      pending: this.queue.length,
      active: this.activeCount,
      paused: this.paused,
      concurrency: this.concurrency,
    };
  }

  /**
   * Clear all pending tasks
   */
  clear(): void {
    const pending = this.queue.splice(0);
    pending.forEach((task) => {
      task.reject(new Error('Queue cleared'));
    });
  }

  /**
   * Wait for all tasks to complete
   */
  async drain(): Promise<void> {
    if (this.activeCount === 0 && this.queue.length === 0) {
      return;
    }

    return new Promise((resolve) => {
      const originalOnDrain = this.onDrain;
      this.onDrain = () => {
        originalOnDrain?.();
        this.onDrain = originalOnDrain;
        resolve();
      };
    });
  }
}

// ============================================================================
// 3. SimpleANN - Approximate Nearest Neighbor using bucketing
// ============================================================================

export class SimpleANN {
  private buckets: Map<number, ANNBucket> = new Map();
  private bucketCount: number;
  private dimensionIndex: number;

  constructor(options?: { bucketCount?: number; dimensionIndex?: number }) {
    this.bucketCount = options?.bucketCount ?? 16;
    this.dimensionIndex = options?.dimensionIndex ?? 0;
  }

  /**
   * Add item to index
   */
  add(id: string, embedding: number[]): void {
    const bucketKey = this.getBucketKey(embedding);

    if (!this.buckets.has(bucketKey)) {
      this.buckets.set(bucketKey, {
        centroid: bucketKey,
        items: [],
      });
    }

    // biome-ignore lint/style/noNonNullAssertion: bucket is guaranteed by set() above
    const bucket = this.buckets.get(bucketKey)!;

    // Remove existing item with same id
    const existingIndex = bucket.items.findIndex((item) => item.id === id);
    if (existingIndex !== -1) {
      bucket.items.splice(existingIndex, 1);
    }

    bucket.items.push({ id, embedding });
  }

  /**
   * Remove item from index
   */
  remove(id: string): boolean {
    for (const bucket of this.buckets.values()) {
      const index = bucket.items.findIndex((item) => item.id === id);
      if (index !== -1) {
        bucket.items.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Search for k nearest neighbors
   */
  search(queryEmbedding: number[], k = 5, searchBuckets = 3): Array<{ id: string; score: number }> {
    const queryBucket = this.getBucketKey(queryEmbedding);

    // Get nearby buckets to search
    const bucketsToSearch = this.getNearbyBuckets(queryBucket, searchBuckets);

    // Collect candidates from buckets
    const candidates: Array<{ id: string; embedding: number[] }> = [];
    for (const bucketKey of bucketsToSearch) {
      const bucket = this.buckets.get(bucketKey);
      if (bucket) {
        candidates.push(...bucket.items);
      }
    }

    // Calculate similarity scores
    const scored = candidates.map((item) => ({
      id: item.id,
      score: this.cosineSimilarity(queryEmbedding, item.embedding),
    }));

    // Sort by score descending and take top k
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /**
   * Get bucket key for embedding
   */
  private getBucketKey(embedding: number[]): number {
    // Use first dimension value to determine bucket
    const value = embedding[this.dimensionIndex] ?? 0;
    // Normalize to 0-1 range (assuming embeddings are normalized)
    const normalized = (value + 1) / 2;
    return Math.floor(normalized * this.bucketCount);
  }

  /**
   * Get nearby bucket keys
   */
  private getNearbyBuckets(centerBucket: number, count: number): number[] {
    const buckets: number[] = [centerBucket];

    for (let i = 1; i <= Math.floor(count / 2) + 1 && buckets.length < count; i++) {
      if (centerBucket - i >= 0) {
        buckets.push(centerBucket - i);
      }
      if (centerBucket + i < this.bucketCount && buckets.length < count) {
        buckets.push(centerBucket + i);
      }
    }

    return buckets.slice(0, count);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
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
   * Get total item count
   */
  get size(): number {
    let count = 0;
    for (const bucket of this.buckets.values()) {
      count += bucket.items.length;
    }
    return count;
  }

  /**
   * Get bucket statistics
   */
  getStats(): {
    totalItems: number;
    bucketCount: number;
    avgItemsPerBucket: number;
    bucketSizes: Array<{ bucket: number; size: number }>;
  } {
    const bucketSizes = Array.from(this.buckets.entries()).map(([key, bucket]) => ({
      bucket: key,
      size: bucket.items.length,
    }));

    const totalItems = this.size;
    const activeBuckets = bucketSizes.filter((b) => b.size > 0).length;

    return {
      totalItems,
      bucketCount: this.bucketCount,
      avgItemsPerBucket: activeBuckets > 0 ? totalItems / activeBuckets : 0,
      bucketSizes,
    };
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.buckets.clear();
  }
}

// ============================================================================
// 4. Lazy Embedding Manager
// ============================================================================

export class LazyEmbeddingManager {
  private items: Map<string, LazyEmbedding> = new Map();
  private batcher: EmbeddingBatcher;
  private _embeddingDimension: number; // Reserved for future vector operations

  constructor(
    embeddingFn: EmbeddingFunction,
    options?: { batchSize?: number; embeddingDimension?: number },
  ) {
    this.batcher = new EmbeddingBatcher(embeddingFn, {
      batchSize: options?.batchSize ?? 10,
    });
    this._embeddingDimension = options?.embeddingDimension ?? 1536;
  }

  /**
   * Get embedding dimension for vector operations
   */
  getEmbeddingDimension(): number {
    return this._embeddingDimension;
  }

  /**
   * Store content without immediate embedding
   */
  store(id: string, content: string, metadata?: Record<string, unknown>): LazyEmbedding {
    const item: LazyEmbedding = {
      id,
      content,
      embedding: null,
      metadata,
      createdAt: Date.now(),
      embeddedAt: null,
    };

    this.items.set(id, item);
    return item;
  }

  /**
   * Get item, computing embedding if needed
   */
  async get(id: string): Promise<LazyEmbedding | null> {
    const item = this.items.get(id);
    if (!item) return null;

    // Compute embedding if not already done
    if (item.embedding === null) {
      item.embedding = await this.batcher.add(item.content);
      item.embeddedAt = Date.now();
    }

    return item;
  }

  /**
   * Get multiple items, batching embedding computation
   */
  async getMany(ids: string[]): Promise<LazyEmbedding[]> {
    const results: LazyEmbedding[] = [];
    const toEmbed: LazyEmbedding[] = [];

    // Separate items that need embedding
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) {
        results.push(item);
        if (item.embedding === null) {
          toEmbed.push(item);
        }
      }
    }

    // Batch embed all items that need it
    if (toEmbed.length > 0) {
      const embedPromises = toEmbed.map((item) => this.batcher.add(item.content));
      const embeddings = await Promise.all(embedPromises);

      toEmbed.forEach((item, index) => {
        item.embedding = embeddings[index];
        item.embeddedAt = Date.now();
      });
    }

    return results;
  }

  /**
   * Check if item has embedding
   */
  hasEmbedding(id: string): boolean {
    return this.items.get(id)?.embedding !== null;
  }

  /**
   * Force embed all un-embedded items
   */
  async embedAll(): Promise<number> {
    const unembedded = Array.from(this.items.values()).filter((item) => item.embedding === null);

    if (unembedded.length === 0) return 0;

    await this.getMany(unembedded.map((item) => item.id));
    return unembedded.length;
  }

  /**
   * Remove item
   */
  remove(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    embedded: number;
    pending: number;
    batcherQueueSize: number;
  } {
    const items = Array.from(this.items.values());
    const embedded = items.filter((item) => item.embedding !== null).length;

    return {
      total: items.length,
      embedded,
      pending: items.length - embedded,
      batcherQueueSize: this.batcher.queueSize,
    };
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items.clear();
    this.batcher.clear();
  }
}

// ============================================================================
// 5. QueryCache - Cache query results with 5-minute TTL
// ============================================================================

export class QueryCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;
  private maxSize: number;
  private cleanupIntervalMs: number = 60000; // Default: 1 minute
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { ttlMs?: number; maxSize?: number; autoCleanup?: boolean }) {
    this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options?.maxSize ?? 1000;

    if (options?.autoCleanup !== false) {
      this.startCleanup();
    }
  }

  /**
   * Get cached value or compute if missing/expired
   */
  async getOrCompute(key: string, compute: () => Promise<T>, customTtl?: number): Promise<T> {
    const hash = this.hashKey(key);
    const cached = this.cache.get(hash);

    // Return cached value if valid
    if (cached && cached.expiresAt > Date.now()) {
      cached.hits++;
      return cached.value;
    }

    // Compute new value
    const value = await compute();
    this.set(key, value, customTtl);
    return value;
  }

  /**
   * Get cached value (sync)
   */
  get(key: string): T | undefined {
    const hash = this.hashKey(key);
    const cached = this.cache.get(hash);

    if (!cached || cached.expiresAt <= Date.now()) {
      this.cache.delete(hash);
      return undefined;
    }

    cached.hits++;
    return cached.value;
  }

  /**
   * Set cached value
   */
  set(key: string, value: T, customTtl?: number): void {
    const hash = this.hashKey(key);
    const ttl = customTtl ?? this.ttlMs;

    // Evict oldest entries if at max size
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(hash, {
      value,
      hash,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      hits: 0,
    });
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const hash = this.hashKey(key);
    const cached = this.cache.get(hash);
    return cached !== undefined && cached.expiresAt > Date.now();
  }

  /**
   * Invalidate specific key
   */
  invalidate(key: string): boolean {
    const hash = this.hashKey(key);
    return this.cache.delete(hash);
  }

  /**
   * Invalidate keys matching pattern (prefix match)
   */
  invalidatePattern(pattern: string): number {
    let count = 0;
    const patternHash = this.hashKey(pattern);

    for (const [hash] of this.cache) {
      // Simple prefix matching on original key would require storing keys
      // For now, delete entries whose hash starts with pattern hash prefix
      if (hash.startsWith(patternHash.slice(0, 8))) {
        this.cache.delete(hash);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
    hitRate: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let totalHits = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      if (oldestEntry === null || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
      if (newestEntry === null || entry.createdAt > newestEntry) {
        newestEntry = entry.createdAt;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [hash, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(hash);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Start automatic cleanup
   */
  private startCleanup(): void {
    // Cleanup every minute
    this.cleanupIntervalMs = 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Destroy the cache - stop cleanup and clear all entries
   */
  destroy(): void {
    this.stopCleanup();
    this.clear();
  }

  /**
   * Evict oldest entries to make room
   */
  private evictOldest(count = 1): void {
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );

    for (let i = 0; i < count && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Hash key for storage (simple djb2 hash)
   */
  private hashKey(key: string): string {
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 33) ^ key.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a hash for query parameters
 */
export function hashQuery(query: string, options?: Record<string, unknown>): string {
  const input = JSON.stringify({ query, options });
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Measure execution time of async function
 */
export async function measureTime<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Debounce function for rate limiting
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Throttle function for rate limiting
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limitMs: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= limitMs) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
        timeoutId = null;
      }, limitMs - timeSinceLastCall);
    }
  };
}
