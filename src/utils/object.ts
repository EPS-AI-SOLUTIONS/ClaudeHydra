/**
 * Object Utilities
 * @module utils/object
 */

/**
 * Deep merge two or more objects
 * @param {Object} target - Target object
 * @param {...Object} sources - Source objects to merge
 * @returns {Object} Merged object
 */
export function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isPlainObject(target) && isPlainObject(source)) {
    for (const key in source) {
      if (Object.hasOwn(source, key)) {
        if (isPlainObject(source[key])) {
          if (!target[key]) {
            Object.assign(target, { [key]: {} });
          }
          deepMerge(target[key], source[key]);
        } else if (Array.isArray(source[key])) {
          target[key] = [...source[key]];
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Check if value is a plain object
 * @param {*} value - Value to check
 * @returns {boolean} True if plain object
 */
function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Pick specified keys from an object
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to pick
 * @returns {Object} New object with picked keys
 */
export function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return {};

  return keys.reduce((result, key) => {
    if (Object.hasOwn(obj, key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
}

/**
 * Omit specified keys from an object
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to omit
 * @returns {Object} New object without omitted keys
 */
export function omit(obj, keys) {
  if (!obj || typeof obj !== 'object') return {};

  const keysSet = new Set(keys);
  return Object.keys(obj).reduce((result, key) => {
    if (!keysSet.has(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
}

/**
 * Flatten a nested object into a single-level object with dot notation keys
 * @param {Object} obj - Object to flatten
 * @param {string} [prefix=''] - Key prefix
 * @param {string} [separator='.'] - Key separator
 * @returns {Object} Flattened object
 */
export function flatten(obj, prefix = '', separator = '.') {
  if (!obj || typeof obj !== 'object') return {};

  return Object.keys(obj).reduce((result, key) => {
    const newKey = prefix ? `${prefix}${separator}${key}` : key;

    if (isPlainObject(obj[key]) && Object.keys(obj[key]).length > 0) {
      Object.assign(result, flatten(obj[key], newKey, separator));
    } else if (Array.isArray(obj[key])) {
      obj[key].forEach((item, index) => {
        if (isPlainObject(item)) {
          Object.assign(result, flatten(item, `${newKey}[${index}]`, separator));
        } else {
          result[`${newKey}[${index}]`] = item;
        }
      });
    } else {
      result[newKey] = obj[key];
    }

    return result;
  }, {});
}

/**
 * Deep clone an object
 * @param {*} value - Value to clone
 * @returns {*} Cloned value
 */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  if (value instanceof Map) {
    const clonedMap = new Map();
    value.forEach((v, k) => {
      clonedMap.set(deepClone(k), deepClone(v));
    });
    return clonedMap;
  }

  if (value instanceof Set) {
    const clonedSet = new Set();
    value.forEach((v) => {
      clonedSet.add(deepClone(v));
    });
    return clonedSet;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }

  const clonedObj = {};
  for (const key in value) {
    if (Object.hasOwn(value, key)) {
      clonedObj[key] = deepClone(value[key]);
    }
  }

  return clonedObj;
}

/**
 * Check if two objects are deeply equal
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} True if deeply equal
 */
export function deepEqual(a, b) {
  if (a === b) return true;

  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual(a[key], b[key]));
}

/**
 * Get a nested value from an object using a path
 * @param {Object} obj - Source object
 * @param {string|string[]} path - Path to value (e.g., 'a.b.c' or ['a', 'b', 'c'])
 * @param {*} [defaultValue] - Default value if path doesn't exist
 * @returns {*} Value at path or default
 */
export function get(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== 'object') return defaultValue;

  const keys = Array.isArray(path) ? path : path.split('.');

  let result = obj;
  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = result[key];
  }

  return result === undefined ? defaultValue : result;
}

/**
 * Set a nested value in an object using a path
 * @param {Object} obj - Target object
 * @param {string|string[]} path - Path to value
 * @param {*} value - Value to set
 * @returns {Object} Modified object
 */
export function set(obj, path, value) {
  if (!obj || typeof obj !== 'object') return obj;

  const keys = Array.isArray(path) ? path : path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return obj;
}

export default {
  deepMerge,
  pick,
  omit,
  flatten,
  deepClone,
  deepEqual,
  get,
  set,
};
