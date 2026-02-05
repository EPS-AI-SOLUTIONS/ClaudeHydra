/**
 * Environment Utilities Tests
 * @module test/unit/utils/env.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEnv,
  requireEnv,
  parseEnvBool,
  parseEnvNumber,
  parseEnvInt,
  parseEnvJson,
  parseEnvList,
  isProduction,
  isDevelopment,
  isTest,
  getEnvironment,
  setEnv,
  deleteEnv,
  hasEnv,
  getEnvMultiple,
  parseEnvCustom
} from '../../../src/utils/env.js';

describe('Environment Utilities', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getEnv()', () => {
    it('should return environment variable value', () => {
      process.env.TEST_VAR = 'test_value';
      expect(getEnv('TEST_VAR')).toBe('test_value');
    });

    it('should return default value if not set', () => {
      delete process.env.MISSING_VAR;
      expect(getEnv('MISSING_VAR', 'default')).toBe('default');
    });

    it('should return undefined if not set and no default', () => {
      delete process.env.MISSING_VAR;
      expect(getEnv('MISSING_VAR')).toBeUndefined();
    });
  });

  describe('requireEnv()', () => {
    it('should return environment variable value', () => {
      process.env.REQUIRED_VAR = 'value';
      expect(requireEnv('REQUIRED_VAR')).toBe('value');
    });

    it('should throw if variable is not set', () => {
      delete process.env.MISSING_VAR;
      expect(() => requireEnv('MISSING_VAR'))
        .toThrow("Required environment variable 'MISSING_VAR' is not set");
    });

    it('should throw if variable is empty string', () => {
      process.env.EMPTY_VAR = '';
      expect(() => requireEnv('EMPTY_VAR'))
        .toThrow("Required environment variable 'EMPTY_VAR' is not set");
    });

    it('should throw with custom error message', () => {
      delete process.env.MISSING_VAR;
      expect(() => requireEnv('MISSING_VAR', 'Custom error'))
        .toThrow('Custom error');
    });
  });

  describe('parseEnvBool()', () => {
    it('should parse true values', () => {
      const trueValues = ['true', '1', 'yes', 'on', 'enabled', 'TRUE', 'YES'];

      for (const value of trueValues) {
        process.env.BOOL_VAR = value;
        expect(parseEnvBool('BOOL_VAR')).toBe(true);
      }
    });

    it('should parse false values', () => {
      const falseValues = ['false', '0', 'no', 'off', 'disabled', '', 'FALSE', 'NO'];

      for (const value of falseValues) {
        process.env.BOOL_VAR = value;
        expect(parseEnvBool('BOOL_VAR')).toBe(false);
      }
    });

    it('should return default for missing variable', () => {
      delete process.env.MISSING_VAR;
      expect(parseEnvBool('MISSING_VAR')).toBe(false);
      expect(parseEnvBool('MISSING_VAR', true)).toBe(true);
    });

    it('should return default for unrecognized values', () => {
      process.env.BOOL_VAR = 'maybe';
      expect(parseEnvBool('BOOL_VAR')).toBe(false);
      expect(parseEnvBool('BOOL_VAR', true)).toBe(true);
    });
  });

  describe('parseEnvNumber()', () => {
    it('should parse integers', () => {
      process.env.NUM_VAR = '42';
      expect(parseEnvNumber('NUM_VAR')).toBe(42);
    });

    it('should parse floats', () => {
      process.env.NUM_VAR = '3.14';
      expect(parseEnvNumber('NUM_VAR')).toBeCloseTo(3.14);
    });

    it('should parse negative numbers', () => {
      process.env.NUM_VAR = '-10';
      expect(parseEnvNumber('NUM_VAR')).toBe(-10);
    });

    it('should return default for missing variable', () => {
      delete process.env.MISSING_VAR;
      expect(parseEnvNumber('MISSING_VAR')).toBe(0);
      expect(parseEnvNumber('MISSING_VAR', 100)).toBe(100);
    });

    it('should return default for invalid number', () => {
      process.env.NUM_VAR = 'not a number';
      expect(parseEnvNumber('NUM_VAR')).toBe(0);
      expect(parseEnvNumber('NUM_VAR', 42)).toBe(42);
    });
  });

  describe('parseEnvInt()', () => {
    it('should parse integers', () => {
      process.env.INT_VAR = '42';
      expect(parseEnvInt('INT_VAR')).toBe(42);
    });

    it('should truncate floats', () => {
      process.env.INT_VAR = '3.99';
      expect(parseEnvInt('INT_VAR')).toBe(3);
    });

    it('should return default for invalid value', () => {
      process.env.INT_VAR = 'invalid';
      expect(parseEnvInt('INT_VAR', 10)).toBe(10);
    });

    it('should return default for empty value', () => {
      process.env.INT_VAR = '';
      expect(parseEnvInt('INT_VAR', 5)).toBe(5);
    });
  });

  describe('parseEnvJson()', () => {
    it('should parse JSON objects', () => {
      process.env.JSON_VAR = '{"key": "value"}';
      expect(parseEnvJson('JSON_VAR')).toEqual({ key: 'value' });
    });

    it('should parse JSON arrays', () => {
      process.env.JSON_VAR = '[1, 2, 3]';
      expect(parseEnvJson('JSON_VAR')).toEqual([1, 2, 3]);
    });

    it('should return default for missing variable', () => {
      delete process.env.MISSING_VAR;
      expect(parseEnvJson('MISSING_VAR')).toBeNull();
      expect(parseEnvJson('MISSING_VAR', [])).toEqual([]);
    });

    it('should return default for invalid JSON', () => {
      process.env.JSON_VAR = 'invalid json {';
      expect(parseEnvJson('JSON_VAR', 'default')).toBe('default');
    });
  });

  describe('parseEnvList()', () => {
    it('should parse comma-separated list', () => {
      process.env.LIST_VAR = 'a,b,c';
      expect(parseEnvList('LIST_VAR')).toEqual(['a', 'b', 'c']);
    });

    it('should trim whitespace', () => {
      process.env.LIST_VAR = ' a , b , c ';
      expect(parseEnvList('LIST_VAR')).toEqual(['a', 'b', 'c']);
    });

    it('should filter empty values', () => {
      process.env.LIST_VAR = 'a,,b';
      expect(parseEnvList('LIST_VAR')).toEqual(['a', 'b']);
    });

    it('should support custom separator', () => {
      process.env.LIST_VAR = 'a;b;c';
      expect(parseEnvList('LIST_VAR', [], ';')).toEqual(['a', 'b', 'c']);
    });

    it('should return default for missing variable', () => {
      delete process.env.MISSING_VAR;
      expect(parseEnvList('MISSING_VAR')).toEqual([]);
      expect(parseEnvList('MISSING_VAR', ['default'])).toEqual(['default']);
    });
  });

  describe('isProduction()', () => {
    it('should return true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);
    });

    it('should return false otherwise', () => {
      process.env.NODE_ENV = 'development';
      expect(isProduction()).toBe(false);
    });
  });

  describe('isDevelopment()', () => {
    it('should return true when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      expect(isDevelopment()).toBe(true);
    });

    it('should return true when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      expect(isDevelopment()).toBe(true);
    });

    it('should return false otherwise', () => {
      process.env.NODE_ENV = 'production';
      expect(isDevelopment()).toBe(false);
    });
  });

  describe('isTest()', () => {
    it('should return true when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      expect(isTest()).toBe(true);
    });

    it('should return false otherwise', () => {
      process.env.NODE_ENV = 'production';
      expect(isTest()).toBe(false);
    });
  });

  describe('getEnvironment()', () => {
    it('should return NODE_ENV value', () => {
      process.env.NODE_ENV = 'staging';
      expect(getEnvironment()).toBe('staging');
    });

    it('should return development as default', () => {
      delete process.env.NODE_ENV;
      expect(getEnvironment()).toBe('development');
    });
  });

  describe('setEnv()', () => {
    it('should set environment variable', () => {
      setEnv('NEW_VAR', 'value');
      expect(process.env.NEW_VAR).toBe('value');
    });

    it('should convert numbers to strings', () => {
      setEnv('NUM_VAR', 42);
      expect(process.env.NUM_VAR).toBe('42');
    });

    it('should convert booleans to strings', () => {
      setEnv('BOOL_VAR', true);
      expect(process.env.BOOL_VAR).toBe('true');
    });
  });

  describe('deleteEnv()', () => {
    it('should delete environment variable', () => {
      process.env.TO_DELETE = 'value';
      deleteEnv('TO_DELETE');
      expect(process.env.TO_DELETE).toBeUndefined();
    });

    it('should not throw for non-existent variable', () => {
      expect(() => deleteEnv('NON_EXISTENT')).not.toThrow();
    });
  });

  describe('hasEnv()', () => {
    it('should return true for existing variable', () => {
      process.env.EXISTS = 'value';
      expect(hasEnv('EXISTS')).toBe(true);
    });

    it('should return true for empty string variable', () => {
      process.env.EMPTY = '';
      expect(hasEnv('EMPTY')).toBe(true);
    });

    it('should return false for non-existent variable', () => {
      delete process.env.MISSING;
      expect(hasEnv('MISSING')).toBe(false);
    });
  });

  describe('getEnvMultiple()', () => {
    it('should get multiple variables at once', () => {
      process.env.VAR_A = 'a';
      process.env.VAR_B = 'b';

      const result = getEnvMultiple(['VAR_A', 'VAR_B']);
      expect(result).toEqual({ VAR_A: 'a', VAR_B: 'b' });
    });

    it('should use defaults for missing variables', () => {
      process.env.VAR_A = 'a';
      delete process.env.VAR_B;

      const result = getEnvMultiple(['VAR_A', 'VAR_B'], { VAR_B: 'default' });
      expect(result).toEqual({ VAR_A: 'a', VAR_B: 'default' });
    });
  });

  describe('parseEnvCustom()', () => {
    it('should parse with custom parser', () => {
      process.env.CUSTOM_VAR = 'hello';
      const result = parseEnvCustom('CUSTOM_VAR', v => v.toUpperCase());
      expect(result).toBe('HELLO');
    });

    it('should return default if parser throws', () => {
      process.env.CUSTOM_VAR = 'invalid';
      const result = parseEnvCustom('CUSTOM_VAR', () => {
        throw new Error('Parse error');
      }, 'default');
      expect(result).toBe('default');
    });

    it('should return default for missing variable', () => {
      delete process.env.MISSING_VAR;
      const result = parseEnvCustom('MISSING_VAR', v => v, 'default');
      expect(result).toBe('default');
    });
  });
});
