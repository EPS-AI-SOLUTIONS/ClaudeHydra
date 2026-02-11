/**
 * Object Utilities Tests
 * @module test/unit/utils/object.test
 */

import { describe, expect, it } from 'vitest';
import {
  deepClone,
  deepEqual,
  deepMerge,
  flatten,
  get,
  omit,
  pick,
  set,
} from '../../../src/utils/object.js';

describe('Object Utilities', () => {
  describe('deepMerge()', () => {
    it('should merge shallow objects', () => {
      const target = { a: 1, b: 2 };
      const source = { c: 3 };

      expect(deepMerge(target, source)).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should deeply merge nested objects', () => {
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };

      expect(deepMerge(target, source)).toEqual({ a: { b: 1, c: 2 } });
    });

    it('should override primitives', () => {
      const target = { a: 1 };
      const source = { a: 2 };

      expect(deepMerge(target, source)).toEqual({ a: 2 });
    });

    it('should clone arrays instead of merging', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4] };

      expect(deepMerge(target, source)).toEqual({ arr: [3, 4] });
    });

    it('should merge multiple sources', () => {
      const target = { a: 1 };
      const source1 = { b: 2 };
      const source2 = { c: 3 };

      expect(deepMerge(target, source1, source2)).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should return target if no sources', () => {
      const target = { a: 1 };
      expect(deepMerge(target)).toBe(target);
    });
  });

  describe('pick()', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should ignore non-existent keys', () => {
      const obj = { a: 1 };
      expect(pick(obj, ['a', 'b'])).toEqual({ a: 1 });
    });

    it('should return empty object for non-object input', () => {
      expect(pick(null, ['a'])).toEqual({});
      expect(pick('string', ['a'])).toEqual({});
    });
  });

  describe('omit()', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });

    it('should return all keys if omit list is empty', () => {
      const obj = { a: 1, b: 2 };
      expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
    });

    it('should return empty object for non-object input', () => {
      expect(omit(null, ['a'])).toEqual({});
      expect(omit('string', ['a'])).toEqual({});
    });
  });

  describe('flatten()', () => {
    it('should flatten nested object with dot notation', () => {
      const obj = { a: { b: { c: 1 } } };
      expect(flatten(obj)).toEqual({ 'a.b.c': 1 });
    });

    it('should handle arrays with index notation', () => {
      const obj = { items: [1, 2, 3] };
      expect(flatten(obj)).toEqual({
        'items[0]': 1,
        'items[1]': 2,
        'items[2]': 3,
      });
    });

    it('should flatten array of objects', () => {
      const obj = { users: [{ name: 'John' }] };
      expect(flatten(obj)).toEqual({ 'users[0].name': 'John' });
    });

    it('should support custom separator', () => {
      const obj = { a: { b: 1 } };
      expect(flatten(obj, '', '/')).toEqual({ 'a/b': 1 });
    });

    it('should return empty object for non-object input', () => {
      expect(flatten(null)).toEqual({});
      expect(flatten('string')).toEqual({});
    });
  });

  describe('deepClone()', () => {
    it('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(null)).toBeNull();
    });

    it('should clone objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('should clone arrays', () => {
      const original = [1, [2, 3], { a: 4 }];
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[1]).not.toBe(original[1]);
      expect(cloned[2]).not.toBe(original[2]);
    });

    it('should clone Date objects', () => {
      const original = new Date('2023-01-01');
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
    });

    it('should clone RegExp objects', () => {
      const original = /test/gi;
      const cloned = deepClone(original);

      expect(cloned.source).toBe(original.source);
      expect(cloned.flags).toBe(original.flags);
      expect(cloned).not.toBe(original);
    });

    it('should clone Map objects', () => {
      const original = new Map([['key', 'value']]);
      const cloned = deepClone(original);

      expect(cloned.get('key')).toBe('value');
      expect(cloned).not.toBe(original);
    });

    it('should clone Set objects', () => {
      const original = new Set([1, 2, 3]);
      const cloned = deepClone(original);

      expect([...cloned]).toEqual([1, 2, 3]);
      expect(cloned).not.toBe(original);
    });
  });

  describe('deepEqual()', () => {
    it('should return true for identical primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('hello', 'hello')).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
    });

    it('should return false for different primitives', () => {
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('a', 'b')).toBe(false);
      expect(deepEqual(1, '1')).toBe(false);
    });

    it('should compare objects deeply', () => {
      expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(deepEqual({ a: { b: 2 } }, { a: { b: 2 } })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should compare arrays deeply', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([1, [2]], [1, [2]])).toBe(true);
      expect(deepEqual([1, 2], [1, 3])).toBe(false);
      expect(deepEqual([1, 2], [1])).toBe(false);
    });

    it('should return false for null comparisons', () => {
      expect(deepEqual(null, {})).toBe(false);
      expect(deepEqual({}, null)).toBe(false);
    });

    it('should distinguish arrays from objects', () => {
      expect(deepEqual([], {})).toBe(false);
    });
  });

  describe('get()', () => {
    it('should get nested value by string path', () => {
      const obj = { a: { b: { c: 42 } } };
      expect(get(obj, 'a.b.c')).toBe(42);
    });

    it('should get nested value by array path', () => {
      const obj = { a: { b: { c: 42 } } };
      expect(get(obj, ['a', 'b', 'c'])).toBe(42);
    });

    it('should return default value for non-existent path', () => {
      const obj = { a: 1 };
      expect(get(obj, 'a.b.c', 'default')).toBe('default');
    });

    it('should return undefined as default', () => {
      const obj = { a: 1 };
      expect(get(obj, 'x.y.z')).toBeUndefined();
    });

    it('should return default for non-object input', () => {
      expect(get(null, 'a', 'default')).toBe('default');
      expect(get('string', 'length', 0)).toBe(0);
    });

    it('should handle null in path', () => {
      const obj = { a: null };
      expect(get(obj, 'a.b', 'default')).toBe('default');
    });
  });

  describe('set()', () => {
    it('should set nested value by string path', () => {
      const obj = {};
      set(obj, 'a.b.c', 42);
      expect(obj).toEqual({ a: { b: { c: 42 } } });
    });

    it('should set nested value by array path', () => {
      const obj = {};
      set(obj, ['a', 'b'], 42);
      expect(obj).toEqual({ a: { b: 42 } });
    });

    it('should override existing values', () => {
      const obj = { a: { b: 1 } };
      set(obj, 'a.b', 2);
      expect(obj).toEqual({ a: { b: 2 } });
    });

    it('should create intermediate objects', () => {
      const obj = { a: 'not an object' };
      set(obj, 'a.b.c', 42);
      expect(obj).toEqual({ a: { b: { c: 42 } } });
    });

    it('should return the modified object', () => {
      const obj = {};
      const result = set(obj, 'a', 1);
      expect(result).toBe(obj);
    });

    it('should return input for non-object', () => {
      expect(set(null, 'a', 1)).toBeNull();
      expect(set('string', 'a', 1)).toBe('string');
    });
  });
});
