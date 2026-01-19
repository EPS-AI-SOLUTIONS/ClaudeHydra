/**
 * HYDRA Cache System - SHA256-based response caching
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync
} from 'fs';
import { join } from 'path';
import { CONFIG } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('cache');
const CACHE_DIR = CONFIG.CACHE_DIR || join(process.cwd(), 'cache');
const CACHE_TTL = CONFIG.CACHE_TTL_MS;
const CACHE_ENABLED = CONFIG.CACHE_ENABLED;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

const resolveEncryptionKey = () => {
  if (!CONFIG.CACHE_ENCRYPTION_KEY) {
    logger.warn(
      'CACHE_ENCRYPTION_KEY not set; cache entries will be stored in plain text'
    );
    return null;
  }

  const rawKey = CONFIG.CACHE_ENCRYPTION_KEY;
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  try {
    const decoded = Buffer.from(rawKey, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch (error) {
    logger.error('Failed to decode CACHE_ENCRYPTION_KEY', {
      error: error.message
    });
  }

  logger.warn('Invalid CACHE_ENCRYPTION_KEY length; expected 32 bytes');
  return null;
};

const ENCRYPTION_KEY = resolveEncryptionKey();

const encryptPayload = (payload) => {
  if (!ENCRYPTION_KEY) {
    return { encrypted: false, payload };
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(payload, 'utf-8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  logger.info('Encrypted cache payload');
  return {
    encrypted: true,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };
};

const decryptPayload = (entry) => {
  if (!entry.encrypted || !ENCRYPTION_KEY) {
    return entry.payload ?? null;
  }

  try {
    const iv = Buffer.from(entry.iv, 'base64');
    const tag = Buffer.from(entry.tag, 'base64');
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(entry.data, 'base64')),
      decipher.final()
    ]);
    logger.info('Decrypted cache payload');
    return decrypted.toString('utf-8');
  } catch (error) {
    logger.error('Failed to decrypt cache payload', { error: error.message });
    return null;
  }
};

/**
 * Generate SHA256 hash for cache key
 */
export function hashKey(prompt, model = '') {
  return createHash('sha256').update(`${model}:${prompt}`).digest('hex');
}

/**
 * Get cached response
 */
export function getCache(prompt, model = '') {
  if (!CACHE_ENABLED) return null;

  const hash = hashKey(prompt, model);
  const cachePath = join(CACHE_DIR, `${hash}.json`);

  if (!existsSync(cachePath)) return null;

  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
    const payload = data.encrypted
      ? decryptPayload(data)
      : JSON.stringify(data);
    if (!payload) return null;
    const parsed = data.encrypted ? JSON.parse(payload) : data;

    // Check TTL
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      return null; // Expired
    }

    return {
      response: parsed.response,
      source: parsed.source,
      cached: true,
      age: Math.round((Date.now() - parsed.timestamp) / 1000)
    };
  } catch {
    return null;
  }
}

/**
 * Save response to cache
 */
export function setCache(prompt, response, model = '', source = 'ollama') {
  if (!CACHE_ENABLED) return false;
  if (!response || response.length < 10) return false;

  const hash = hashKey(prompt, model);
  const cachePath = join(CACHE_DIR, `${hash}.json`);

  try {
    const payload = JSON.stringify({
      prompt: prompt.substring(0, 100), // Truncate for reference
      response,
      source,
      model,
      timestamp: Date.now()
    });

    const entry = encryptPayload(payload);
    const storedEntry = entry.encrypted
      ? entry
      : { ...JSON.parse(payload), encrypted: false };
    writeFileSync(cachePath, JSON.stringify(storedEntry, null, 2), 'utf-8');
    logger.info('Cache entry stored', { hash, encrypted: entry.encrypted });
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
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    let totalSize = 0;
    let validCount = 0;
    let expiredCount = 0;

    for (const file of files) {
      const stat = statSync(join(CACHE_DIR, file));
      totalSize += stat.size;

      try {
        const data = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf-8'));
        const payload = data.encrypted
          ? decryptPayload(data)
          : JSON.stringify(data);
        if (!payload) {
          expiredCount++;
          continue;
        }
        const parsed = data.encrypted ? JSON.parse(payload) : data;
        if (Date.now() - parsed.timestamp > CACHE_TTL) {
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
    return {
      totalEntries: 0,
      validEntries: 0,
      expiredEntries: 0,
      totalSizeKB: 0,
      cacheDir: CACHE_DIR
    };
  }
}
