/**
 * HYDRA Cache System - LRU-based response caching with async I/O
 *
 * Features:
 * - LRU (Least Recently Used) eviction for memory efficiency
 * - Automatic cleanup of expired entries
 * - Async/await patterns for non-blocking I/O
 * - Cache warming strategies
 * - Comprehensive statistics and monitoring
 * - Memory usage limits
 * - Class-based API with singleton instance
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'crypto';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG } from './config.js';
import { createLogger } from './logger.js';
import { EventEmitter } from 'events';
import { hash as cryptoHash } from './utils/crypto.js';

const logger = createLogger('cache');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * LRU Node for doubly-linked list
 */
class LRUNode {
  constructor(key, value, size = 0) {
    this.key = key;
    this.value = value;
    this.size = size;
    this.prev = null;
    this.next = null;
    this.timestamp = Date.now();
    this.accessCount = 0;
  }
}

/**
 * LRU Cache implementation with memory limits
 */
class LRUCache {
  constructor(maxSize = 100, maxMemoryMB = 50) {
    this.maxSize = maxSize;
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
    this.map = new Map();
    this.head = null;
    this.tail = null;
    this.currentMemory = 0;
  }

  /**
   * Move node to front (most recently used)
   */
  moveToFront(node) {
    if (node === this.head) return;

    // Remove from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.tail) this.tail = node.prev;

    // Move to front
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  /**
   * Add node to front
   */
  addToFront(node) {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  /**
   * Remove least recently used node
   */
  removeLRU() {
    if (!this.tail) return null;

    const removed = this.tail;
    this.map.delete(removed.key);
    this.currentMemory -= removed.size;

    if (this.tail.prev) {
      this.tail = this.tail.prev;
      this.tail.next = null;
    } else {
      this.head = null;
      this.tail = null;
    }

    return removed;
  }

  /**
   * Get item from cache
   */
  get(key) {
    const node = this.map.get(key);
    if (!node) return null;

    node.accessCount++;
    this.moveToFront(node);
    return node.value;
  }

  /**
   * Set item in cache
   */
  set(key, value, size = 0) {
    const existingNode = this.map.get(key);

    if (existingNode) {
      this.currentMemory -= existingNode.size;
      existingNode.value = value;
      existingNode.size = size;
      existingNode.timestamp = Date.now();
      this.currentMemory += size;
      this.moveToFront(existingNode);
      return;
    }

    // Evict if needed
    while (
      (this.map.size >= this.maxSize || this.currentMemory + size > this.maxMemoryBytes) &&
      this.tail
    ) {
      this.removeLRU();
    }

    const node = new LRUNode(key, value, size);
    this.map.set(key, node);
    this.currentMemory += size;
    this.addToFront(node);
  }

  /**
   * Delete item from cache
   */
  delete(key) {
    const node = this.map.get(key);
    if (!node) return false;

    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.head) this.head = node.next;
    if (node === this.tail) this.tail = node.prev;

    this.map.delete(key);
    this.currentMemory -= node.size;
    return true;
  }

  /**
   * Check if key exists
   */
  has(key) {
    return this.map.has(key);
  }

  /**
   * Get cache size
   */
  get size() {
    return this.map.size;
  }

  /**
   * Clear the cache
   */
  clear() {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.currentMemory = 0;
  }

  /**
   * Get all keys in LRU order (most recent first)
   */
  keys() {
    const keys = [];
    let current = this.head;
    while (current) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }

  /**
   * Get memory usage stats
   */
  getMemoryStats() {
    return {
      entries: this.map.size,
      maxEntries: this.maxSize,
      memoryUsedBytes: this.currentMemory,
      maxMemoryBytes: this.maxMemoryBytes,
      memoryUsedMB: Math.round(this.currentMemory / 1024 / 1024 * 100) / 100,
      maxMemoryMB: this.maxMemoryBytes / 1024 / 1024,
      utilizationPercent: Math.round((this.currentMemory / this.maxMemoryBytes) * 100)
    };
  }
}

/**
 * Cache Statistics Tracker
 */
class CacheStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.evictions = 0;
    this.expirations = 0;
    this.errors = 0;
    this.totalReadTimeMs = 0;
    this.totalWriteTimeMs = 0;
    this.readCount = 0;
    this.writeCount = 0;
    this.lastCleanup = null;
    this.startTime = Date.now();
  }

  recordHit(readTimeMs = 0) {
    this.hits++;
    this.readCount++;
    this.totalReadTimeMs += readTimeMs;
  }

  recordMiss(readTimeMs = 0) {
    this.misses++;
    this.readCount++;
    this.totalReadTimeMs += readTimeMs;
  }

  recordWrite(writeTimeMs = 0) {
    this.writes++;
    this.writeCount++;
    this.totalWriteTimeMs += writeTimeMs;
  }

  recordEviction() {
    this.evictions++;
  }

  recordExpiration() {
    this.expirations++;
  }

  recordError() {
    this.errors++;
  }

  recordCleanup() {
    this.lastCleanup = Date.now();
  }

  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;
    const avgReadTime = this.readCount > 0 ? this.totalReadTimeMs / this.readCount : 0;
    const avgWriteTime = this.writeCount > 0 ? this.totalWriteTimeMs / this.writeCount : 0;
    const uptime = Date.now() - this.startTime;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      writes: this.writes,
      evictions: this.evictions,
      expirations: this.expirations,
      errors: this.errors,
      avgReadTimeMs: Math.round(avgReadTime * 100) / 100,
      avgWriteTimeMs: Math.round(avgWriteTime * 100) / 100,
      lastCleanup: this.lastCleanup,
      uptimeMs: uptime,
      requestsPerSecond: Math.round((total / (uptime / 1000)) * 100) / 100
    };
  }
}

/**
 * Main Cache Manager Class
 */
class CacheManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      cacheDir: options.cacheDir || CONFIG.CACHE_DIR || join(process.cwd(), 'cache'),
      ttlMs: options.ttlMs || CONFIG.CACHE_TTL_MS || 3600000,
      enabled: options.enabled ?? CONFIG.CACHE_ENABLED ?? true,
      maxMemoryEntries: options.maxMemoryEntries || CONFIG.CACHE_MAX_MEMORY_ENTRIES || 1000,
      maxMemoryMB: options.maxMemoryMB || CONFIG.CACHE_MAX_MEMORY_MB || 100,
      cleanupIntervalMs: options.cleanupIntervalMs || CONFIG.CACHE_CLEANUP_INTERVAL_MS || 300000,
      persistToDisk: options.persistToDisk ?? CONFIG.CACHE_PERSIST_TO_DISK ?? true,
      encryptionKey: options.encryptionKey || CONFIG.CACHE_ENCRYPTION_KEY || null,
      minResponseLength: options.minResponseLength || CONFIG.CACHE_MIN_RESPONSE_LENGTH || 10,
      warmupPatterns: options.warmupPatterns || []
    };

    this.memoryCache = new LRUCache(
      this.options.maxMemoryEntries,
      this.options.maxMemoryMB
    );
    this.stats = new CacheStats();
    this.encryptionKey = this.resolveEncryptionKey();
    this.cleanupTimer = null;
    this.initialized = false;
    this.pendingWrites = new Map();
  }

  /**
   * Initialize the cache manager
   */
  async initialize() {
    if (this.initialized) return;

    // Ensure cache directory exists
    if (this.options.persistToDisk) {
      await this.ensureCacheDir();
    }

    // Start automatic cleanup
    this.startCleanupTimer();

    // Warm up cache if patterns provided
    if (this.options.warmupPatterns.length > 0) {
      await this.warmup(this.options.warmupPatterns);
    }

    this.initialized = true;
    this.emit('initialized');
    logger.info('Cache manager initialized', {
      cacheDir: this.options.cacheDir,
      maxMemoryMB: this.options.maxMemoryMB,
      ttlMs: this.options.ttlMs
    });
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir() {
    try {
      await fs.mkdir(this.options.cacheDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error('Failed to create cache directory', { error: error.message });
        throw error;
      }
    }
  }

  /**
   * Resolve and validate encryption key
   */
  resolveEncryptionKey() {
    const rawKey = this.options.encryptionKey;

    if (!rawKey) {
      logger.warn('CACHE_ENCRYPTION_KEY not set; cache entries will be stored in plain text');
      return null;
    }

    // Try hex format (64 chars = 32 bytes)
    if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      return Buffer.from(rawKey, 'hex');
    }

    // Try base64 format
    try {
      const decoded = Buffer.from(rawKey, 'base64');
      if (decoded.length === 32) {
        return decoded;
      }
    } catch (error) {
      logger.error('Failed to decode CACHE_ENCRYPTION_KEY', { error: error.message });
    }

    logger.warn('Invalid CACHE_ENCRYPTION_KEY length; expected 32 bytes');
    return null;
  }

  /**
   * Generate SHA256 hash for cache key
   * Uses createHash directly for backward compatibility
   * For general purpose hashing, use cryptoHash from utils/crypto.js
   */
  hashKey(prompt, model = '') {
    return cryptoHash(`${model}:${prompt}`);
  }

  /**
   * Encrypt payload
   */
  encryptPayload(payload) {
    if (!this.encryptionKey) {
      return { encrypted: false, payload };
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(payload, 'utf-8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return {
      encrypted: true,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    };
  }

  /**
   * Decrypt payload
   */
  decryptPayload(entry) {
    if (!entry.encrypted || !this.encryptionKey) {
      return entry.payload ?? null;
    }

    try {
      const iv = Buffer.from(entry.iv, 'base64');
      const tag = Buffer.from(entry.tag, 'base64');
      const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(entry.data, 'base64')),
        decipher.final()
      ]);
      return decrypted.toString('utf-8');
    } catch (error) {
      logger.error('Failed to decrypt cache payload', { error: error.message });
      return null;
    }
  }

  /**
   * Get cached response (async)
   */
  async get(prompt, model = '') {
    if (!this.options.enabled) return null;

    const startTime = Date.now();
    const hash = this.hashKey(prompt, model);

    // Check memory cache first (L1)
    const memoryEntry = this.memoryCache.get(hash);
    if (memoryEntry) {
      if (Date.now() - memoryEntry.timestamp <= this.options.ttlMs) {
        const readTime = Date.now() - startTime;
        this.stats.recordHit(readTime);
        this.emit('hit', { hash, source: 'memory', readTimeMs: readTime });

        return {
          response: memoryEntry.response,
          source: memoryEntry.source,
          model: memoryEntry.model,
          cached: true,
          cacheLevel: 'memory',
          age: Math.round((Date.now() - memoryEntry.timestamp) / 1000)
        };
      } else {
        // Expired in memory, remove it
        this.memoryCache.delete(hash);
        this.stats.recordExpiration();
      }
    }

    // Check disk cache (L2)
    if (this.options.persistToDisk) {
      try {
        const diskEntry = await this.readFromDisk(hash);
        if (diskEntry) {
          if (Date.now() - diskEntry.timestamp <= this.options.ttlMs) {
            // Promote to memory cache
            const size = JSON.stringify(diskEntry).length;
            this.memoryCache.set(hash, diskEntry, size);

            const readTime = Date.now() - startTime;
            this.stats.recordHit(readTime);
            this.emit('hit', { hash, source: 'disk', readTimeMs: readTime });

            return {
              response: diskEntry.response,
              source: diskEntry.source,
              model: diskEntry.model,
              cached: true,
              cacheLevel: 'disk',
              age: Math.round((Date.now() - diskEntry.timestamp) / 1000)
            };
          } else {
            // Expired on disk, schedule removal
            this.deleteFromDisk(hash).catch(() => {});
            this.stats.recordExpiration();
          }
        }
      } catch (error) {
        logger.debug('Disk cache read failed', { hash, error: error.message });
      }
    }

    const readTime = Date.now() - startTime;
    this.stats.recordMiss(readTime);
    this.emit('miss', { hash, readTimeMs: readTime });
    return null;
  }

  /**
   * Set cached response (async)
   */
  async set(prompt, response, model = '', source = 'ollama') {
    if (!this.options.enabled) return false;
    if (!response || response.length < this.options.minResponseLength) return false;

    const startTime = Date.now();
    const hash = this.hashKey(prompt, model);

    const entry = {
      prompt: prompt.substring(0, 100), // Truncate for reference
      response,
      source,
      model,
      timestamp: Date.now()
    };

    const size = JSON.stringify(entry).length;

    // Store in memory cache (L1)
    this.memoryCache.set(hash, entry, size);

    // Store to disk (L2) - non-blocking
    if (this.options.persistToDisk) {
      this.writeToDiskDebounced(hash, entry);
    }

    const writeTime = Date.now() - startTime;
    this.stats.recordWrite(writeTime);
    this.emit('write', { hash, size, writeTimeMs: writeTime });

    logger.debug('Cache entry stored', { hash, size, model });
    return true;
  }

  /**
   * Read entry from disk
   */
  async readFromDisk(hash) {
    const cachePath = join(this.options.cacheDir, `${hash}.json`);

    try {
      const content = await fs.readFile(cachePath, 'utf-8');
      const data = JSON.parse(content);

      const payload = data.encrypted
        ? this.decryptPayload(data)
        : JSON.stringify(data);

      if (!payload) return null;
      return data.encrypted ? JSON.parse(payload) : data;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.debug('Failed to read cache file', { hash, error: error.message });
      }
      return null;
    }
  }

  /**
   * Write entry to disk with debouncing
   */
  writeToDiskDebounced(hash, entry) {
    // Cancel any pending write for this hash
    if (this.pendingWrites.has(hash)) {
      clearTimeout(this.pendingWrites.get(hash));
    }

    // Debounce writes by 100ms
    const timer = setTimeout(async () => {
      this.pendingWrites.delete(hash);
      await this.writeToDisk(hash, entry);
    }, 100);

    this.pendingWrites.set(hash, timer);
  }

  /**
   * Write entry to disk
   */
  async writeToDisk(hash, entry) {
    const cachePath = join(this.options.cacheDir, `${hash}.json`);

    try {
      const payload = JSON.stringify(entry);
      const encrypted = this.encryptPayload(payload);
      const storedEntry = encrypted.encrypted
        ? encrypted
        : { ...entry, encrypted: false };

      await fs.writeFile(cachePath, JSON.stringify(storedEntry, null, 2), 'utf-8');
      logger.debug('Cache entry persisted to disk', { hash });
    } catch (error) {
      logger.error('Failed to write cache file', { hash, error: error.message });
      this.stats.recordError();
    }
  }

  /**
   * Delete entry from disk
   */
  async deleteFromDisk(hash) {
    const cachePath = join(this.options.cacheDir, `${hash}.json`);
    try {
      await fs.unlink(cachePath);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.debug('Failed to delete cache file', { hash, error: error.message });
      }
      return false;
    }
  }

  /**
   * Delete a cache entry
   */
  async delete(prompt, model = '') {
    const hash = this.hashKey(prompt, model);
    this.memoryCache.delete(hash);

    if (this.options.persistToDisk) {
      await this.deleteFromDisk(hash);
    }

    this.emit('delete', { hash });
    return true;
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    this.memoryCache.clear();

    if (this.options.persistToDisk) {
      try {
        const files = await fs.readdir(this.options.cacheDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        await Promise.all(
          jsonFiles.map(file =>
            fs.unlink(join(this.options.cacheDir, file)).catch(() => {})
          )
        );
      } catch (error) {
        logger.error('Failed to clear disk cache', { error: error.message });
      }
    }

    this.stats.reset();
    this.emit('clear');
    logger.info('Cache cleared');
  }

  /**
   * Start automatic cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.options.cleanupIntervalMs
    );

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop automatic cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup() {
    const startTime = Date.now();
    let memoryEvicted = 0;
    let diskEvicted = 0;

    // Cleanup memory cache
    const now = Date.now();
    for (const key of this.memoryCache.keys()) {
      const entry = this.memoryCache.map.get(key);
      if (entry && now - entry.value.timestamp > this.options.ttlMs) {
        this.memoryCache.delete(key);
        memoryEvicted++;
      }
    }

    // Cleanup disk cache
    if (this.options.persistToDisk) {
      try {
        const files = await fs.readdir(this.options.cacheDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        for (const file of jsonFiles) {
          const filePath = join(this.options.cacheDir, file);
          try {
            const stat = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);

            const payload = data.encrypted
              ? this.decryptPayload(data)
              : JSON.stringify(data);

            if (!payload) {
              await fs.unlink(filePath);
              diskEvicted++;
              continue;
            }

            const parsed = data.encrypted ? JSON.parse(payload) : data;
            if (now - parsed.timestamp > this.options.ttlMs) {
              await fs.unlink(filePath);
              diskEvicted++;
            }
          } catch (error) {
            // Corrupted file, remove it
            await fs.unlink(filePath).catch(() => {});
            diskEvicted++;
          }
        }
      } catch (error) {
        logger.error('Cleanup failed', { error: error.message });
      }
    }

    this.stats.recordCleanup();
    const duration = Date.now() - startTime;

    if (memoryEvicted > 0 || diskEvicted > 0) {
      logger.info('Cache cleanup completed', {
        memoryEvicted,
        diskEvicted,
        durationMs: duration
      });
    }

    this.emit('cleanup', { memoryEvicted, diskEvicted, durationMs: duration });
    return { memoryEvicted, diskEvicted };
  }

  /**
   * Warm up cache from disk or provided entries
   */
  async warmup(patterns = []) {
    if (!this.options.persistToDisk) return { loaded: 0 };

    const startTime = Date.now();
    let loaded = 0;

    try {
      const files = await fs.readdir(this.options.cacheDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // Load most recent files first (up to maxMemoryEntries)
      const fileStats = await Promise.all(
        jsonFiles.map(async file => {
          const filePath = join(this.options.cacheDir, file);
          const stat = await fs.stat(filePath);
          return { file, filePath, mtime: stat.mtime };
        })
      );

      fileStats.sort((a, b) => b.mtime - a.mtime);
      const filesToLoad = fileStats.slice(0, this.options.maxMemoryEntries);

      for (const { file, filePath } of filesToLoad) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);

          const payload = data.encrypted
            ? this.decryptPayload(data)
            : JSON.stringify(data);

          if (!payload) continue;

          const parsed = data.encrypted ? JSON.parse(payload) : data;

          // Skip expired entries
          if (Date.now() - parsed.timestamp > this.options.ttlMs) continue;

          // Check against warmup patterns if provided
          if (patterns.length > 0) {
            const matches = patterns.some(pattern => {
              if (typeof pattern === 'string') {
                return parsed.prompt?.includes(pattern) || parsed.model?.includes(pattern);
              }
              if (pattern instanceof RegExp) {
                return pattern.test(parsed.prompt) || pattern.test(parsed.model);
              }
              return false;
            });
            if (!matches) continue;
          }

          const hash = file.replace('.json', '');
          const size = content.length;
          this.memoryCache.set(hash, parsed, size);
          loaded++;
        } catch (error) {
          logger.debug('Failed to load cache entry for warmup', { file, error: error.message });
        }
      }
    } catch (error) {
      logger.error('Cache warmup failed', { error: error.message });
    }

    const duration = Date.now() - startTime;
    logger.info('Cache warmup completed', { loaded, durationMs: duration });
    this.emit('warmup', { loaded, durationMs: duration });

    return { loaded, durationMs: duration };
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats() {
    return {
      ...this.stats.getStats(),
      memory: this.memoryCache.getMemoryStats(),
      config: {
        enabled: this.options.enabled,
        ttlMs: this.options.ttlMs,
        maxMemoryMB: this.options.maxMemoryMB,
        maxMemoryEntries: this.options.maxMemoryEntries,
        persistToDisk: this.options.persistToDisk,
        encrypted: !!this.encryptionKey,
        cacheDir: this.options.cacheDir
      }
    };
  }

  /**
   * Get disk cache statistics (async)
   */
  async getDiskStats() {
    if (!this.options.persistToDisk) {
      return { totalEntries: 0, totalSizeKB: 0, validEntries: 0, expiredEntries: 0 };
    }

    try {
      const files = await fs.readdir(this.options.cacheDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      let totalSize = 0;
      let validCount = 0;
      let expiredCount = 0;

      for (const file of jsonFiles) {
        const filePath = join(this.options.cacheDir, file);
        try {
          const stat = await fs.stat(filePath);
          totalSize += stat.size;

          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          const payload = data.encrypted
            ? this.decryptPayload(data)
            : JSON.stringify(data);

          if (!payload) {
            expiredCount++;
            continue;
          }

          const parsed = data.encrypted ? JSON.parse(payload) : data;
          if (Date.now() - parsed.timestamp > this.options.ttlMs) {
            expiredCount++;
          } else {
            validCount++;
          }
        } catch {
          expiredCount++;
        }
      }

      return {
        totalEntries: jsonFiles.length,
        validEntries: validCount,
        expiredEntries: expiredCount,
        totalSizeKB: Math.round(totalSize / 1024),
        cacheDir: this.options.cacheDir
      };
    } catch {
      return {
        totalEntries: 0,
        validEntries: 0,
        expiredEntries: 0,
        totalSizeKB: 0,
        cacheDir: this.options.cacheDir
      };
    }
  }

  /**
   * Shutdown the cache manager
   */
  async shutdown() {
    this.stopCleanupTimer();

    // Wait for pending writes
    if (this.pendingWrites.size > 0) {
      const pending = Array.from(this.pendingWrites.values());
      pending.forEach(timer => clearTimeout(timer));
      this.pendingWrites.clear();
    }

    this.emit('shutdown');
    logger.info('Cache manager shutdown');
  }
}

// Singleton instance
let cacheInstance = null;

/**
 * Get or create the cache manager singleton
 */
export function getCacheManager(options = {}) {
  if (!cacheInstance) {
    cacheInstance = new CacheManager(options);
  }
  return cacheInstance;
}

/**
 * Initialize the cache manager (must be called before use)
 */
export async function initializeCache(options = {}) {
  const manager = getCacheManager(options);
  await manager.initialize();
  return manager;
}

// ============================================================
// Backwards-compatible function exports
// ============================================================

const defaultCacheDir = CONFIG.CACHE_DIR || join(process.cwd(), 'cache');

// Ensure cache directory exists synchronously for backwards compatibility
if (!existsSync(defaultCacheDir)) {
  mkdirSync(defaultCacheDir, { recursive: true });
}

/**
 * Generate SHA256 hash for cache key (backwards compatible)
 * Uses cryptoHash from utils/crypto.js
 */
export function hashKey(prompt, model = '') {
  return cryptoHash(`${model}:${prompt}`);
}

/**
 * Get cached response (backwards compatible - sync wrapper)
 * @deprecated Use getCacheManager().get() for async version
 */
export function getCache(prompt, model = '') {
  const manager = getCacheManager();

  // Check memory cache synchronously
  const hash = manager.hashKey(prompt, model);
  const entry = manager.memoryCache.get(hash);

  if (entry && Date.now() - entry.timestamp <= manager.options.ttlMs) {
    return {
      response: entry.response,
      source: entry.source,
      cached: true,
      age: Math.round((Date.now() - entry.timestamp) / 1000)
    };
  }

  return null;
}

/**
 * Get cached response (async version)
 */
export async function getCacheAsync(prompt, model = '') {
  const manager = getCacheManager();
  if (!manager.initialized) {
    await manager.initialize();
  }
  return manager.get(prompt, model);
}

/**
 * Save response to cache (backwards compatible - sync wrapper)
 * @deprecated Use getCacheManager().set() for async version
 */
export function setCache(prompt, response, model = '', source = 'ollama') {
  const manager = getCacheManager();

  if (!manager.options.enabled) return false;
  if (!response || response.length < manager.options.minResponseLength) return false;

  const hash = manager.hashKey(prompt, model);
  const entry = {
    prompt: prompt.substring(0, 100),
    response,
    source,
    model,
    timestamp: Date.now()
  };

  const size = JSON.stringify(entry).length;
  manager.memoryCache.set(hash, entry, size);

  // Queue async disk write
  if (manager.options.persistToDisk) {
    manager.writeToDiskDebounced(hash, entry);
  }

  return true;
}

/**
 * Save response to cache (async version)
 */
export async function setCacheAsync(prompt, response, model = '', source = 'ollama') {
  const manager = getCacheManager();
  if (!manager.initialized) {
    await manager.initialize();
  }
  return manager.set(prompt, response, model, source);
}

/**
 * Get cache statistics (backwards compatible)
 */
export function getCacheStats() {
  const manager = getCacheManager();
  const memStats = manager.memoryCache.getMemoryStats();

  return {
    totalEntries: memStats.entries,
    validEntries: memStats.entries,
    expiredEntries: 0,
    totalSizeKB: Math.round(memStats.memoryUsedBytes / 1024),
    cacheDir: manager.options.cacheDir,
    ...manager.stats.getStats()
  };
}

/**
 * Get comprehensive cache statistics (async)
 */
export async function getCacheStatsAsync() {
  const manager = getCacheManager();
  if (!manager.initialized) {
    await manager.initialize();
  }

  const stats = manager.getStats();
  const diskStats = await manager.getDiskStats();

  return {
    ...stats,
    disk: diskStats
  };
}

// Export classes for advanced usage
export { CacheManager, LRUCache, CacheStats };
