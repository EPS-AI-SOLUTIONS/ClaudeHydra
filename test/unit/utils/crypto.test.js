/**
 * Crypto Utilities Tests
 * @module test/unit/utils/crypto.test
 */

import { describe, it, expect } from 'vitest';
import {
  hash,
  simpleHash,
  generateToken,
  generateUrlSafeToken,
  generateUuid,
  shortId,
  hashObject,
  combineHash,
  hashPassword,
  verifyPassword
} from '../../../src/utils/crypto.js';

describe('Crypto Utilities', () => {
  describe('hash()', () => {
    it('should generate SHA-256 hash in hex by default', () => {
      const result = hash('hello');
      expect(result).toHaveLength(64); // SHA-256 = 256 bits = 64 hex chars
      expect(result).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate consistent hash for same input', () => {
      const hash1 = hash('test');
      const hash2 = hash('test');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different input', () => {
      const hash1 = hash('test1');
      const hash2 = hash('test2');
      expect(hash1).not.toBe(hash2);
    });

    it('should support base64 encoding', () => {
      const result = hash('hello', 'base64');
      expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should support base64url encoding', () => {
      const result = hash('hello', 'base64url');
      expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('simpleHash()', () => {
    it('should generate MD5 hash in hex by default', () => {
      const result = simpleHash('hello');
      expect(result).toHaveLength(32); // MD5 = 128 bits = 32 hex chars
      expect(result).toMatch(/^[a-f0-9]+$/);
    });

    it('should be consistent', () => {
      const hash1 = simpleHash('test');
      const hash2 = simpleHash('test');
      expect(hash1).toBe(hash2);
    });
  });

  describe('generateToken()', () => {
    it('should generate token of default length in hex', () => {
      const token = generateToken();
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate token of custom length', () => {
      const token = generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should generate different tokens each time', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });

    it('should support base64 encoding', () => {
      const token = generateToken(32, 'base64');
      expect(token).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });

  describe('generateUrlSafeToken()', () => {
    it('should generate URL-safe token', () => {
      const token = generateUrlSafeToken();
      // Should not contain +, /, or =
      expect(token).not.toMatch(/[+/=]/);
      // Should only contain URL-safe base64 chars
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate different tokens each time', () => {
      const token1 = generateUrlSafeToken();
      const token2 = generateUrlSafeToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateUuid()', () => {
    it('should generate valid UUID v4 format', () => {
      const uuid = generateUuid();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate different UUIDs each time', () => {
      const uuid1 = generateUuid();
      const uuid2 = generateUuid();
      expect(uuid1).not.toBe(uuid2);
    });

    it('should have correct version digit (4)', () => {
      const uuid = generateUuid();
      expect(uuid.charAt(14)).toBe('4');
    });

    it('should have correct variant (8, 9, a, or b)', () => {
      const uuid = generateUuid();
      expect(['8', '9', 'a', 'b']).toContain(uuid.charAt(19).toLowerCase());
    });
  });

  describe('shortId()', () => {
    it('should generate ID of default length 12', () => {
      const id = shortId();
      expect(id).toHaveLength(12);
    });

    it('should generate ID of custom length', () => {
      const id = shortId(8);
      expect(id).toHaveLength(8);
    });

    it('should only contain alphanumeric characters', () => {
      const id = shortId(50);
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate different IDs each time', () => {
      const id1 = shortId();
      const id2 = shortId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('hashObject()', () => {
    it('should hash object consistently', () => {
      const obj = { a: 1, b: 2 };
      const hash1 = hashObject(obj);
      const hash2 = hashObject(obj);
      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of key order', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { b: 2, a: 1 };
      expect(hashObject(obj1)).toBe(hashObject(obj2));
    });

    it('should produce different hash for different objects', () => {
      const hash1 = hashObject({ a: 1 });
      const hash2 = hashObject({ a: 2 });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('combineHash()', () => {
    it('should combine multiple values into single hash', () => {
      const combined = combineHash('a', 'b', 'c');
      expect(combined).toHaveLength(64);
    });

    it('should produce consistent results', () => {
      const hash1 = combineHash('a', 'b');
      const hash2 = combineHash('a', 'b');
      expect(hash1).toBe(hash2);
    });

    it('should handle different types', () => {
      const combined = combineHash('string', 123, { key: 'value' }, null, undefined);
      expect(combined).toHaveLength(64);
    });

    it('should produce different hash for different order', () => {
      const hash1 = combineHash('a', 'b');
      const hash2 = combineHash('b', 'a');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashPassword()', () => {
    it('should hash password with generated salt', () => {
      const result = hashPassword('mypassword');
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.hash).toHaveLength(64);
      expect(result.salt).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should hash password with provided salt', () => {
      const salt = 'mysalt123456789012345678901234';
      const result = hashPassword('mypassword', salt);
      expect(result.salt).toBe(salt);
    });

    it('should produce consistent hash with same password and salt', () => {
      const salt = 'fixedsalt12345678901234567890';
      const hash1 = hashPassword('password', salt).hash;
      const hash2 = hashPassword('password', salt).hash;
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different passwords', () => {
      const salt = 'fixedsalt12345678901234567890';
      const hash1 = hashPassword('password1', salt).hash;
      const hash2 = hashPassword('password2', salt).hash;
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword()', () => {
    it('should return true for correct password', () => {
      const password = 'mypassword';
      const { hash: storedHash, salt } = hashPassword(password);
      expect(verifyPassword(password, storedHash, salt)).toBe(true);
    });

    it('should return false for incorrect password', () => {
      const { hash: storedHash, salt } = hashPassword('correct');
      expect(verifyPassword('incorrect', storedHash, salt)).toBe(false);
    });

    it('should return false for wrong salt', () => {
      const password = 'mypassword';
      const { hash: storedHash } = hashPassword(password);
      expect(verifyPassword(password, storedHash, 'wrongsalt')).toBe(false);
    });
  });
});
