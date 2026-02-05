/**
 * Array Utilities Tests
 * @module test/unit/utils/array.test
 */

import { describe, it, expect } from 'vitest';
import {
  chunk,
  unique,
  groupBy,
  shuffle,
  flatten,
  take,
  takeLast,
  compact,
  intersection,
  difference,
  union,
  partition,
  find,
  sum,
  average,
  sortBy
} from '../../../src/utils/array.js';

describe('Array Utilities', () => {
  describe('chunk()', () => {
    it('should split array into chunks of specified size', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle chunk size larger than array', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });

    it('should handle exact division', () => {
      expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    });

    it('should return empty array for non-array input', () => {
      expect(chunk(null, 2)).toEqual([]);
      expect(chunk('not array', 2)).toEqual([]);
    });

    it('should return empty array for invalid chunk size', () => {
      expect(chunk([1, 2, 3], 0)).toEqual([]);
      expect(chunk([1, 2, 3], -1)).toEqual([]);
    });
  });

  describe('unique()', () => {
    it('should return unique values', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('should work with strings', () => {
      expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('should support keyFn for objects', () => {
      const users = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
        { id: 1, name: 'Johnny' }
      ];
      expect(unique(users, u => u.id)).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ]);
    });

    it('should return empty array for non-array input', () => {
      expect(unique(null)).toEqual([]);
      expect(unique('not array')).toEqual([]);
    });
  });

  describe('groupBy()', () => {
    it('should group by property name', () => {
      const items = [
        { category: 'A', value: 1 },
        { category: 'B', value: 2 },
        { category: 'A', value: 3 }
      ];

      const grouped = groupBy(items, 'category');

      expect(grouped).toEqual({
        A: [{ category: 'A', value: 1 }, { category: 'A', value: 3 }],
        B: [{ category: 'B', value: 2 }]
      });
    });

    it('should group by function', () => {
      const numbers = [1, 2, 3, 4, 5, 6];
      const grouped = groupBy(numbers, n => n % 2 === 0 ? 'even' : 'odd');

      expect(grouped).toEqual({
        odd: [1, 3, 5],
        even: [2, 4, 6]
      });
    });

    it('should return empty object for non-array input', () => {
      expect(groupBy(null, 'key')).toEqual({});
    });
  });

  describe('shuffle()', () => {
    it('should return array with same elements', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffle(original);

      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.sort()).toEqual(original.sort());
    });

    it('should not modify original array', () => {
      const original = [1, 2, 3];
      const copy = [...original];
      shuffle(original);

      expect(original).toEqual(copy);
    });

    it('should return new array', () => {
      const original = [1, 2, 3];
      const shuffled = shuffle(original);

      expect(shuffled).not.toBe(original);
    });

    it('should return empty array for non-array input', () => {
      expect(shuffle(null)).toEqual([]);
    });
  });

  describe('flatten()', () => {
    it('should flatten one level by default', () => {
      expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it('should flatten to specified depth', () => {
      expect(flatten([[[1]], [[2]]], 2)).toEqual([1, 2]);
    });

    it('should completely flatten with Infinity', () => {
      expect(flatten([[[1, [2, [3]]]]], Infinity)).toEqual([1, 2, 3]);
    });

    it('should return empty array for non-array input', () => {
      expect(flatten(null)).toEqual([]);
    });
  });

  describe('take()', () => {
    it('should take first n elements', () => {
      expect(take([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
    });

    it('should take one element by default', () => {
      expect(take([1, 2, 3])).toEqual([1]);
    });

    it('should return whole array if n is larger', () => {
      expect(take([1, 2], 5)).toEqual([1, 2]);
    });

    it('should return empty array for non-array input', () => {
      expect(take(null, 2)).toEqual([]);
    });
  });

  describe('takeLast()', () => {
    it('should take last n elements', () => {
      expect(takeLast([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
    });

    it('should take one element by default', () => {
      expect(takeLast([1, 2, 3])).toEqual([3]);
    });

    it('should return whole array if n is larger', () => {
      expect(takeLast([1, 2], 5)).toEqual([1, 2]);
    });

    it('should return empty array for non-array input', () => {
      expect(takeLast(null, 2)).toEqual([]);
    });
  });

  describe('compact()', () => {
    it('should remove falsy values', () => {
      expect(compact([0, 1, false, 2, '', 3, null, undefined, NaN]))
        .toEqual([1, 2, 3]);
    });

    it('should keep truthy values', () => {
      expect(compact([1, 'hello', true, [], {}])).toEqual([1, 'hello', true, [], {}]);
    });

    it('should return empty array for non-array input', () => {
      expect(compact(null)).toEqual([]);
    });
  });

  describe('intersection()', () => {
    it('should return common elements', () => {
      expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    });

    it('should return empty array when no common elements', () => {
      expect(intersection([1, 2], [3, 4])).toEqual([]);
    });

    it('should return empty array for non-array inputs', () => {
      expect(intersection(null, [1, 2])).toEqual([]);
      expect(intersection([1, 2], null)).toEqual([]);
    });
  });

  describe('difference()', () => {
    it('should return elements in first but not second', () => {
      expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1]);
    });

    it('should return first array if second is non-array', () => {
      expect(difference([1, 2, 3], null)).toEqual([1, 2, 3]);
    });

    it('should return empty array if first is non-array', () => {
      expect(difference(null, [1, 2])).toEqual([]);
    });
  });

  describe('union()', () => {
    it('should return unique combined elements', () => {
      expect(union([1, 2], [2, 3])).toEqual([1, 2, 3]);
    });

    it('should handle non-array first argument', () => {
      expect(union(null, [1, 2])).toEqual([1, 2]);
    });

    it('should handle non-array second argument', () => {
      expect(union([1, 2], null)).toEqual([1, 2]);
    });

    it('should return empty array if both are non-arrays', () => {
      expect(union(null, null)).toEqual([]);
    });
  });

  describe('partition()', () => {
    it('should split array by predicate', () => {
      const [even, odd] = partition([1, 2, 3, 4, 5], n => n % 2 === 0);

      expect(even).toEqual([2, 4]);
      expect(odd).toEqual([1, 3, 5]);
    });

    it('should return empty arrays for non-array input', () => {
      expect(partition(null, () => true)).toEqual([[], []]);
    });
  });

  describe('find()', () => {
    it('should find first matching element', () => {
      expect(find([1, 2, 3], n => n > 1)).toBe(2);
    });

    it('should return default value when not found', () => {
      expect(find([1, 2, 3], n => n > 10, 'default')).toBe('default');
    });

    it('should return undefined as default when not found', () => {
      expect(find([1, 2, 3], n => n > 10)).toBeUndefined();
    });

    it('should return default for non-array input', () => {
      expect(find(null, () => true, 'default')).toBe('default');
    });
  });

  describe('sum()', () => {
    it('should sum numbers', () => {
      expect(sum([1, 2, 3, 4])).toBe(10);
    });

    it('should handle empty array', () => {
      expect(sum([])).toBe(0);
    });

    it('should ignore non-numeric values', () => {
      expect(sum([1, 'two', 3, null])).toBe(4);
    });

    it('should return 0 for non-array input', () => {
      expect(sum(null)).toBe(0);
    });
  });

  describe('average()', () => {
    it('should calculate average', () => {
      expect(average([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(average([])).toBe(0);
    });

    it('should return 0 for non-array input', () => {
      expect(average(null)).toBe(0);
    });
  });

  describe('sortBy()', () => {
    it('should sort by property name', () => {
      const items = [{ age: 30 }, { age: 20 }, { age: 25 }];
      expect(sortBy(items, 'age')).toEqual([{ age: 20 }, { age: 25 }, { age: 30 }]);
    });

    it('should sort in descending order', () => {
      const items = [{ age: 20 }, { age: 30 }, { age: 25 }];
      expect(sortBy(items, 'age', 'desc')).toEqual([{ age: 30 }, { age: 25 }, { age: 20 }]);
    });

    it('should sort by comparator function', () => {
      expect(sortBy([3, 1, 2], (a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it('should not modify original array', () => {
      const original = [3, 1, 2];
      const sorted = sortBy(original, (a, b) => a - b);

      expect(original).toEqual([3, 1, 2]);
      expect(sorted).not.toBe(original);
    });

    it('should return empty array for non-array input', () => {
      expect(sortBy(null, 'key')).toEqual([]);
    });
  });
});
