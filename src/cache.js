/**
 * HYDRA Cache System - SHA256-based response caching
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = process.env.CACHE_DIR || join(process.cwd(), 'cache');
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600') * 1000;

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate SHA256 hash for cache key
 */
export function hashKey(prompt, model = '') {
  return createHash('sha256')
    .update(`${model}:${prompt}`)
    .digest('hex');
}

/**
 * Get cached response
 */
export function getCache(prompt, model = '') {
  if (process.env.CACHE_ENABLED === 'false') return null;

  const hash = hashKey(prompt, model);
  const cachePath = join(CACHE_DIR, `${hash}.json`);

  if (!existsSync(cachePath)) return null;

  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8'));

    // Check TTL
    if (Date.now() - data.timestamp > CACHE_TTL) {
      return null; // Expired
    }

    return {
      response: data.response,
      source: data.source,
      cached: true,
      age: Math.round((Date.now() - data.timestamp) / 1000)
    };
  } catch {
    return null;
  }
}

/**
 * Save response to cache
 */
export function setCache(prompt, response, model = '', source = 'ollama') {
  if (process.env.CACHE_ENABLED === 'false') return false;
  if (!response || response.length < 10) return false;

  const hash = hashKey(prompt, model);
  const cachePath = join(CACHE_DIR, `${hash}.json`);

  try {
    writeFileSync(cachePath, JSON.stringify({
      prompt: prompt.substring(0, 100), // Truncate for reference
      response,
      source,
      model,
      timestamp: Date.now()
    }, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  try {
    const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    let totalSize = 0;
    let validCount = 0;
    let expiredCount = 0;

    for (const file of files) {
      const stat = statSync(join(CACHE_DIR, file));
      totalSize += stat.size;

      try {
        const data = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf-8'));
        if (Date.now() - data.timestamp > CACHE_TTL) {
          expiredCount++;
        } else {
          validCount++;
        }
      } catch {
        expiredCount++;
      }
    }

    return {
      totalEntries: files.length,
      validEntries: validCount,
      expiredEntries: expiredCount,
      totalSizeKB: Math.round(totalSize / 1024),
      cacheDir: CACHE_DIR
    };
  } catch {
    return { totalEntries: 0, validEntries: 0, expiredEntries: 0, totalSizeKB: 0, cacheDir: CACHE_DIR };
  }
}
