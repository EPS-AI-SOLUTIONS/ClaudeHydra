/**
 * Validation Utilities
 * @module utils/validation
 */

/**
 * Check if value is a string
 * @param {*} value - Value to check
 * @returns {boolean} True if string
 */
export function isString(value) {
  return typeof value === 'string';
}

/**
 * Check if value is a number (excludes NaN)
 * @param {*} value - Value to check
 * @returns {boolean} True if number
 */
export function isNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Check if value is an integer
 * @param {*} value - Value to check
 * @returns {boolean} True if integer
 */
export function isInteger(value) {
  return Number.isInteger(value);
}

/**
 * Check if value is a positive number
 * @param {*} value - Value to check
 * @returns {boolean} True if positive number
 */
export function isPositive(value) {
  return isNumber(value) && value > 0;
}

/**
 * Check if value is a non-negative number
 * @param {*} value - Value to check
 * @returns {boolean} True if non-negative number
 */
export function isNonNegative(value) {
  return isNumber(value) && value >= 0;
}

/**
 * Check if value is a plain object
 * @param {*} value - Value to check
 * @returns {boolean} True if plain object
 */
export function isObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Check if value is an array
 * @param {*} value - Value to check
 * @returns {boolean} True if array
 */
export function isArray(value) {
  return Array.isArray(value);
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, or empty object)
 * @param {*} value - Value to check
 * @returns {boolean} True if empty
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Check if value is a function
 * @param {*} value - Value to check
 * @returns {boolean} True if function
 */
export function isFunction(value) {
  return typeof value === 'function';
}

/**
 * Check if value is a boolean
 * @param {*} value - Value to check
 * @returns {boolean} True if boolean
 */
export function isBoolean(value) {
  return typeof value === 'boolean';
}

/**
 * Check if value is null or undefined
 * @param {*} value - Value to check
 * @returns {boolean} True if null or undefined
 */
export function isNil(value) {
  return value === null || value === undefined;
}

/**
 * Check if value is defined (not null and not undefined)
 * @param {*} value - Value to check
 * @returns {boolean} True if defined
 */
export function isDefined(value) {
  return value !== null && value !== undefined;
}

/**
 * Check if value is a valid email address
 * @param {*} value - Value to check
 * @returns {boolean} True if valid email
 */
export function isEmail(value) {
  if (!isString(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Check if value is a valid URL
 * @param {*} value - Value to check
 * @returns {boolean} True if valid URL
 */
export function isUrl(value) {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if value is a valid UUID
 * @param {*} value - Value to check
 * @returns {boolean} True if valid UUID
 */
export function isUuid(value) {
  if (!isString(value)) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Check if value is a valid JSON string
 * @param {*} value - Value to check
 * @returns {boolean} True if valid JSON
 */
export function isJson(value) {
  if (!isString(value)) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if value is a Date object
 * @param {*} value - Value to check
 * @returns {boolean} True if Date
 */
export function isDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Check if value matches a pattern
 * @param {*} value - Value to check
 * @param {RegExp} pattern - Pattern to match
 * @returns {boolean} True if matches
 */
export function matches(value, pattern) {
  if (!isString(value)) return false;
  return pattern.test(value);
}

/**
 * Check if value is within a range
 * @param {number} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if within range
 */
export function inRange(value, min, max) {
  return isNumber(value) && value >= min && value <= max;
}

/**
 * Check if string has minimum length
 * @param {*} value - Value to check
 * @param {number} minLength - Minimum length
 * @returns {boolean} True if has minimum length
 */
export function hasMinLength(value, minLength) {
  if (!isString(value) && !isArray(value)) return false;
  return value.length >= minLength;
}

/**
 * Check if string has maximum length
 * @param {*} value - Value to check
 * @param {number} maxLength - Maximum length
 * @returns {boolean} True if within max length
 */
export function hasMaxLength(value, maxLength) {
  if (!isString(value) && !isArray(value)) return false;
  return value.length <= maxLength;
}

/**
 * Assert that a condition is true
 * @param {boolean} condition - Condition to assert
 * @param {string} [message='Assertion failed'] - Error message
 * @throws {Error} If condition is false
 */
export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Validate an object against a schema
 * @param {Object} obj - Object to validate
 * @param {Object} schema - Validation schema
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export function validate(obj, schema) {
  const errors = [];

  for (const [key, rules] of Object.entries(schema)) {
    const value = obj[key];

    if (rules.required && isNil(value)) {
      errors.push(`${key} is required`);
      continue;
    }

    if (isNil(value) && !rules.required) {
      continue;
    }

    if (rules.type) {
      const typeChecks = {
        string: isString,
        number: isNumber,
        boolean: isBoolean,
        array: isArray,
        object: isObject,
        function: isFunction,
      };

      if (typeChecks[rules.type] && !typeChecks[rules.type](value)) {
        errors.push(`${key} must be a ${rules.type}`);
      }
    }

    if (rules.minLength !== undefined && !hasMinLength(value, rules.minLength)) {
      errors.push(`${key} must have at least ${rules.minLength} characters`);
    }

    if (rules.maxLength !== undefined && !hasMaxLength(value, rules.maxLength)) {
      errors.push(`${key} must have at most ${rules.maxLength} characters`);
    }

    if (rules.min !== undefined && isNumber(value) && value < rules.min) {
      errors.push(`${key} must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && isNumber(value) && value > rules.max) {
      errors.push(`${key} must be at most ${rules.max}`);
    }

    if (rules.pattern && !matches(value, rules.pattern)) {
      errors.push(`${key} does not match required pattern`);
    }

    if (rules.custom && typeof rules.custom === 'function') {
      const customResult = rules.custom(value, obj);
      if (customResult !== true) {
        errors.push(customResult || `${key} failed custom validation`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
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
  validate,
};
