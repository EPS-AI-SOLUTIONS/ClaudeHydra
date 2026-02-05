/**
 * Validation Utilities Tests
 * @module test/unit/utils/validation.test
 */

import { describe, it, expect } from 'vitest';
import {
  isString,
  isNumber,
  isInteger,
  isPositive,
  isNonNegative,
  isObject,
  isArray,
  isEmpty,
  isFunction,
  isBoolean,
  isNil,
  isDefined,
  isEmail,
  isUrl,
  isUuid,
  isJson,
  isDate,
  matches,
  inRange,
  hasMinLength,
  hasMaxLength,
  assert,
  validate
} from '../../../src/utils/validation.js';

describe('Validation Utilities', () => {
  describe('isString()', () => {
    it('should return true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
      expect(isString('123')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
    });
  });

  describe('isNumber()', () => {
    it('should return true for numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(123)).toBe(true);
      expect(isNumber(-123)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
    });
  });

  describe('isInteger()', () => {
    it('should return true for integers', () => {
      expect(isInteger(0)).toBe(true);
      expect(isInteger(123)).toBe(true);
      expect(isInteger(-123)).toBe(true);
    });

    it('should return false for floats', () => {
      expect(isInteger(3.14)).toBe(false);
      expect(isInteger(0.1)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isInteger('123')).toBe(false);
      expect(isInteger(null)).toBe(false);
    });
  });

  describe('isPositive()', () => {
    it('should return true for positive numbers', () => {
      expect(isPositive(1)).toBe(true);
      expect(isPositive(0.001)).toBe(true);
      expect(isPositive(Infinity)).toBe(true);
    });

    it('should return false for zero', () => {
      expect(isPositive(0)).toBe(false);
    });

    it('should return false for negative numbers', () => {
      expect(isPositive(-1)).toBe(false);
      expect(isPositive(-0.001)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isPositive('5')).toBe(false);
    });
  });

  describe('isNonNegative()', () => {
    it('should return true for non-negative numbers', () => {
      expect(isNonNegative(0)).toBe(true);
      expect(isNonNegative(1)).toBe(true);
      expect(isNonNegative(100)).toBe(true);
    });

    it('should return false for negative numbers', () => {
      expect(isNonNegative(-1)).toBe(false);
      expect(isNonNegative(-0.001)).toBe(false);
    });
  });

  describe('isObject()', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
    });

    it('should return false for other types', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(new Date())).toBe(false);
    });
  });

  describe('isArray()', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe('isEmpty()', () => {
    it('should return true for null and undefined', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
    });

    it('should return true for empty strings', () => {
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('   ')).toBe(true);
    });

    it('should return true for empty arrays', () => {
      expect(isEmpty([])).toBe(true);
    });

    it('should return true for empty objects', () => {
      expect(isEmpty({})).toBe(true);
    });

    it('should return false for non-empty values', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ key: 'value' })).toBe(false);
      expect(isEmpty(0)).toBe(false);
    });
  });

  describe('isFunction()', () => {
    it('should return true for functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function() {})).toBe(true);
      expect(isFunction(async () => {})).toBe(true);
    });

    it('should return false for non-functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction('function')).toBe(false);
      expect(isFunction(null)).toBe(false);
    });
  });

  describe('isBoolean()', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });

  describe('isNil()', () => {
    it('should return true for null and undefined', () => {
      expect(isNil(null)).toBe(true);
      expect(isNil(undefined)).toBe(true);
    });

    it('should return false for other values', () => {
      expect(isNil(0)).toBe(false);
      expect(isNil('')).toBe(false);
      expect(isNil(false)).toBe(false);
    });
  });

  describe('isDefined()', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined({})).toBe(true);
    });

    it('should return false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('isEmail()', () => {
    it('should return true for valid emails', () => {
      expect(isEmail('user@example.com')).toBe(true);
      expect(isEmail('user.name@domain.org')).toBe(true);
      expect(isEmail('user+tag@sub.domain.com')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(isEmail('invalid')).toBe(false);
      expect(isEmail('invalid@')).toBe(false);
      expect(isEmail('@domain.com')).toBe(false);
      expect(isEmail('user@domain')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isEmail(null)).toBe(false);
      expect(isEmail(123)).toBe(false);
    });
  });

  describe('isUrl()', () => {
    it('should return true for valid URLs', () => {
      expect(isUrl('https://example.com')).toBe(true);
      expect(isUrl('http://localhost:3000')).toBe(true);
      expect(isUrl('ftp://files.example.com')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isUrl('not-a-url')).toBe(false);
      expect(isUrl('example.com')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isUrl(null)).toBe(false);
      expect(isUrl(123)).toBe(false);
    });
  });

  describe('isUuid()', () => {
    it('should return true for valid UUIDs', () => {
      expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isUuid('not-a-uuid')).toBe(false);
      expect(isUuid('123e4567-e89b-62d3-a456-426614174000')).toBe(false); // wrong version
      expect(isUuid('123e4567-e89b-12d3-c456-426614174000')).toBe(false); // wrong variant
    });

    it('should return false for non-strings', () => {
      expect(isUuid(null)).toBe(false);
      expect(isUuid(123)).toBe(false);
    });
  });

  describe('isJson()', () => {
    it('should return true for valid JSON strings', () => {
      expect(isJson('{}')).toBe(true);
      expect(isJson('[]')).toBe(true);
      expect(isJson('{"key": "value"}')).toBe(true);
      expect(isJson('"string"')).toBe(true);
      expect(isJson('123')).toBe(true);
      expect(isJson('true')).toBe(true);
      expect(isJson('null')).toBe(true);
    });

    it('should return false for invalid JSON strings', () => {
      expect(isJson('{')).toBe(false);
      expect(isJson('undefined')).toBe(false);
      expect(isJson("{'key': 'value'}")).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isJson(null)).toBe(false);
      expect(isJson(123)).toBe(false);
      expect(isJson({})).toBe(false);
    });
  });

  describe('isDate()', () => {
    it('should return true for valid Date objects', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('2023-01-01'))).toBe(true);
    });

    it('should return false for invalid Date objects', () => {
      expect(isDate(new Date('invalid'))).toBe(false);
    });

    it('should return false for non-Date values', () => {
      expect(isDate('2023-01-01')).toBe(false);
      expect(isDate(1672531200000)).toBe(false);
      expect(isDate(null)).toBe(false);
    });
  });

  describe('matches()', () => {
    it('should return true if value matches pattern', () => {
      expect(matches('hello', /^hello$/)).toBe(true);
      expect(matches('hello123', /^\w+$/)).toBe(true);
    });

    it('should return false if value does not match', () => {
      expect(matches('hello', /^world$/)).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(matches(null, /test/)).toBe(false);
      expect(matches(123, /\d+/)).toBe(false);
    });
  });

  describe('inRange()', () => {
    it('should return true if value is in range', () => {
      expect(inRange(5, 0, 10)).toBe(true);
      expect(inRange(0, 0, 10)).toBe(true);
      expect(inRange(10, 0, 10)).toBe(true);
    });

    it('should return false if value is out of range', () => {
      expect(inRange(-1, 0, 10)).toBe(false);
      expect(inRange(11, 0, 10)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(inRange('5', 0, 10)).toBe(false);
    });
  });

  describe('hasMinLength()', () => {
    it('should return true for strings with minimum length', () => {
      expect(hasMinLength('hello', 5)).toBe(true);
      expect(hasMinLength('hello', 3)).toBe(true);
    });

    it('should return false for strings below minimum', () => {
      expect(hasMinLength('hi', 5)).toBe(false);
    });

    it('should work with arrays', () => {
      expect(hasMinLength([1, 2, 3], 3)).toBe(true);
      expect(hasMinLength([1, 2], 3)).toBe(false);
    });

    it('should return false for non-strings/arrays', () => {
      expect(hasMinLength(null, 0)).toBe(false);
      expect(hasMinLength(123, 0)).toBe(false);
    });
  });

  describe('hasMaxLength()', () => {
    it('should return true for strings within maximum', () => {
      expect(hasMaxLength('hello', 5)).toBe(true);
      expect(hasMaxLength('hello', 10)).toBe(true);
    });

    it('should return false for strings exceeding maximum', () => {
      expect(hasMaxLength('hello world', 5)).toBe(false);
    });

    it('should work with arrays', () => {
      expect(hasMaxLength([1, 2, 3], 3)).toBe(true);
      expect(hasMaxLength([1, 2, 3, 4], 3)).toBe(false);
    });

    it('should return false for non-strings/arrays', () => {
      expect(hasMaxLength(null, 10)).toBe(false);
      expect(hasMaxLength(123, 10)).toBe(false);
    });
  });

  describe('assert()', () => {
    it('should not throw when condition is true', () => {
      expect(() => assert(true)).not.toThrow();
      expect(() => assert(1 === 1)).not.toThrow();
    });

    it('should throw when condition is false', () => {
      expect(() => assert(false)).toThrow('Assertion failed');
    });

    it('should throw with custom message', () => {
      expect(() => assert(false, 'Custom error')).toThrow('Custom error');
    });
  });

  describe('validate()', () => {
    it('should validate required fields', () => {
      const schema = {
        name: { required: true }
      };

      const valid = validate({ name: 'John' }, schema);
      expect(valid.valid).toBe(true);
      expect(valid.errors).toHaveLength(0);

      const invalid = validate({}, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('name is required');
    });

    it('should validate types', () => {
      const schema = {
        name: { type: 'string' },
        age: { type: 'number' },
        active: { type: 'boolean' }
      };

      const valid = validate({ name: 'John', age: 30, active: true }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validate({ name: 123, age: 'thirty', active: 'yes' }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('name must be a string');
      expect(invalid.errors).toContain('age must be a number');
      expect(invalid.errors).toContain('active must be a boolean');
    });

    it('should validate minLength', () => {
      const schema = {
        name: { minLength: 3 }
      };

      const valid = validate({ name: 'John' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validate({ name: 'Jo' }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('name must have at least 3 characters');
    });

    it('should validate maxLength', () => {
      const schema = {
        name: { maxLength: 5 }
      };

      const valid = validate({ name: 'John' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validate({ name: 'Jonathan' }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('name must have at most 5 characters');
    });

    it('should validate min and max for numbers', () => {
      const schema = {
        age: { min: 0, max: 120 }
      };

      const valid = validate({ age: 30 }, schema);
      expect(valid.valid).toBe(true);

      const tooLow = validate({ age: -1 }, schema);
      expect(tooLow.valid).toBe(false);
      expect(tooLow.errors).toContain('age must be at least 0');

      const tooHigh = validate({ age: 150 }, schema);
      expect(tooHigh.valid).toBe(false);
      expect(tooHigh.errors).toContain('age must be at most 120');
    });

    it('should validate pattern', () => {
      const schema = {
        code: { pattern: /^[A-Z]{3}$/ }
      };

      const valid = validate({ code: 'ABC' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validate({ code: 'abc' }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('code does not match required pattern');
    });

    it('should support custom validation', () => {
      const schema = {
        age: {
          custom: (value) => value >= 18 ? true : 'Must be 18 or older'
        }
      };

      const valid = validate({ age: 25 }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validate({ age: 16 }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('Must be 18 or older');
    });

    it('should skip validation for optional fields when not present', () => {
      const schema = {
        name: { required: true },
        nickname: { type: 'string' }
      };

      const result = validate({ name: 'John' }, schema);
      expect(result.valid).toBe(true);
    });
  });
});
