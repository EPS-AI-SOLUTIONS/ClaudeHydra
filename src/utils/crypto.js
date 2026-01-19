/**
 * Crypto Utilities
 * @module utils/crypto
 */

import { createHash, randomBytes } from 'crypto';

/**
 * Generate a SHA-256 hash of a string
 * @param {string} data - Data to hash
 * @param {string} [encoding='hex'] - Output encoding ('hex', 'base64', 'base64url')
 * @returns {string} Hashed string
 */
export function hash(data, encoding = 'hex') {
  return createHash('sha256').update(data).digest(encoding);
}

/**
 * Generate a simple hash using a faster algorithm (MD5)
 * Note: Not cryptographically secure, use for caching/deduplication only
 * @param {string} data - Data to hash
 * @param {string} [encoding='hex'] - Output encoding
 * @returns {string} Hashed string
 */
export function simpleHash(data, encoding = 'hex') {
  return createHash('md5').update(data).digest(encoding);
}

/**
 * Generate a secure random token
 * @param {number} [length=32] - Token length in bytes
 * @param {string} [encoding='hex'] - Output encoding
 * @returns {string} Random token
 */
export function generateToken(length = 32, encoding = 'hex') {
  return randomBytes(length).toString(encoding);
}

/**
 * Generate a URL-safe random token
 * @param {number} [length=32] - Token length in bytes
 * @returns {string} URL-safe token
 */
export function generateUrlSafeToken(length = 32) {
  return randomBytes(length)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
export function generateUuid() {
  const bytes = randomBytes(16);

  // Set version (4) and variant (RFC4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');

  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

/**
 * Generate a short unique ID
 * @param {number} [length=12] - ID length
 * @returns {string} Short ID
 */
export function shortId(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

/**
 * Create a hash of an object for comparison/caching
 * @param {Object} obj - Object to hash
 * @returns {string} Object hash
 */
export function hashObject(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return hash(str);
}

/**
 * Generate a deterministic hash from multiple values
 * @param {...any} values - Values to combine and hash
 * @returns {string} Combined hash
 */
export function combineHash(...values) {
  const combined = values.map(v => {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'object') return JSON.stringify(v, Object.keys(v).sort());
    return String(v);
  }).join(':');

  return hash(combined);
}

/**
 * Hash a password with salt (for non-critical uses)
 * For production authentication, use bcrypt or argon2
 * @param {string} password - Password to hash
 * @param {string} [salt] - Optional salt (generated if not provided)
 * @returns {{ hash: string, salt: string }} Hashed password and salt
 */
export function hashPassword(password, salt) {
  const useSalt = salt || randomBytes(16).toString('hex');
  const hashed = createHash('sha256')
    .update(password + useSalt)
    .digest('hex');

  return { hash: hashed, salt: useSalt };
}

/**
 * Verify a password against a hash
 * @param {string} password - Password to verify
 * @param {string} storedHash - Stored hash
 * @param {string} salt - Salt used for hashing
 * @returns {boolean} True if password matches
 */
export function verifyPassword(password, storedHash, salt) {
  const { hash: computedHash } = hashPassword(password, salt);
  return computedHash === storedHash;
}

/**
 * Create a HMAC signature
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @param {string} [algorithm='sha256'] - Hash algorithm
 * @param {string} [encoding='hex'] - Output encoding
 * @returns {string} HMAC signature
 */
export function hmac(data, secret, algorithm = 'sha256', encoding = 'hex') {
  const { createHmac } = require('crypto');
  return createHmac(algorithm, secret).update(data).digest(encoding);
}

export default {
  hash,
  simpleHash,
  generateToken,
  generateUrlSafeToken,
  generateUuid,
  shortId,
  hashObject,
  combineHash,
  hashPassword,
  verifyPassword,
  hmac
};
