/**
 * String Utilities Tests
 * @module test/unit/utils/string.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateId,
  shortId,
  normalize,
  sanitize,
  truncate,
  toTitleCase,
  toCamelCase,
  toSnakeCase
} from '../../../src/utils/string.js';

describe('String Utilities', () => {
  describe('generateId()', () => {
    it('should generate unique ID with default prefix', () => {
      const id = generateId();
      expect(id).toMatch(/^id_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should generate unique ID with custom prefix', () => {
      const id = generateId('user');
      expect(id).toMatch(/^user_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should generate different IDs each time', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('shortId()', () => {
    it('should generate ID of default length 8', () => {
      const id = shortId();
      expect(id).toHaveLength(8);
    });

    it('should generate ID of custom length', () => {
      const id = shortId(12);
      expect(id).toHaveLength(12);
    });

    it('should only contain alphanumeric characters', () => {
      const id = shortId(100);
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate different IDs each time', () => {
      const id1 = shortId();
      const id2 = shortId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('normalize()', () => {
    it('should trim whitespace', () => {
      expect(normalize('  hello  ')).toBe('hello');
    });

    it('should collapse multiple spaces', () => {
      expect(normalize('hello   world')).toBe('hello world');
    });

    it('should handle tabs and newlines', () => {
      expect(normalize('hello\t\nworld')).toBe('hello world');
    });

    it('should return empty string for null/undefined', () => {
      expect(normalize(null)).toBe('');
      expect(normalize(undefined)).toBe('');
    });

    it('should convert non-strings', () => {
      expect(normalize(123)).toBe('123');
    });
  });

  describe('sanitize()', () => {
    it('should remove control characters', () => {
      const text = 'hello\x00\x07world';
      expect(sanitize(text)).toBe('helloworld');
    });

    it('should normalize line endings (CRLF to LF)', () => {
      expect(sanitize('hello\r\nworld')).toBe('hello\nworld');
    });

    it('should normalize line endings (CR to LF)', () => {
      expect(sanitize('hello\rworld')).toBe('hello\nworld');
    });

    it('should return empty string for null/undefined', () => {
      expect(sanitize(null)).toBe('');
      expect(sanitize(undefined)).toBe('');
    });
  });

  describe('truncate()', () => {
    it('should not truncate short text', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long text with default suffix', () => {
      expect(truncate('hello world test', 10)).toBe('hello w...');
    });

    it('should truncate with custom suffix', () => {
      expect(truncate('hello world', 8, '…')).toBe('hello w…');
    });

    it('should return null/undefined as-is', () => {
      expect(truncate(null, 10)).toBeNull();
      expect(truncate(undefined, 10)).toBeUndefined();
    });

    it('should handle exact length', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });

  describe('toTitleCase()', () => {
    it('should capitalize first letter of each word', () => {
      expect(toTitleCase('hello world')).toBe('Hello World');
    });

    it('should handle hyphenated words', () => {
      expect(toTitleCase('hello-world')).toBe('Hello-World');
    });

    it('should handle underscored words', () => {
      expect(toTitleCase('hello_world')).toBe('Hello_World');
    });

    it('should handle mixed case input', () => {
      expect(toTitleCase('hELLO wORLD')).toBe('Hello World');
    });

    it('should return empty string for null/undefined', () => {
      expect(toTitleCase(null)).toBe('');
      expect(toTitleCase(undefined)).toBe('');
    });
  });

  describe('toCamelCase()', () => {
    it('should convert space-separated words', () => {
      expect(toCamelCase('hello world')).toBe('helloWorld');
    });

    it('should convert hyphen-separated words', () => {
      expect(toCamelCase('hello-world')).toBe('helloWorld');
    });

    it('should convert underscore-separated words', () => {
      expect(toCamelCase('hello_world')).toBe('helloWorld');
    });

    it('should handle multiple separators', () => {
      expect(toCamelCase('hello-world_test')).toBe('helloWorldTest');
    });

    it('should return empty string for null/undefined', () => {
      expect(toCamelCase(null)).toBe('');
      expect(toCamelCase(undefined)).toBe('');
    });
  });

  describe('toSnakeCase()', () => {
    it('should convert camelCase', () => {
      expect(toSnakeCase('helloWorld')).toBe('hello_world');
    });

    it('should convert PascalCase', () => {
      expect(toSnakeCase('HelloWorld')).toBe('hello_world');
    });

    it('should convert space-separated', () => {
      expect(toSnakeCase('hello world')).toBe('hello_world');
    });

    it('should convert hyphen-separated', () => {
      expect(toSnakeCase('hello-world')).toBe('hello_world');
    });

    it('should return empty string for null/undefined', () => {
      expect(toSnakeCase(null)).toBe('');
      expect(toSnakeCase(undefined)).toBe('');
    });
  });
});
