/**
 * Array Utilities
 * @module utils/array
 */

/**
 * Split an array into chunks of specified size
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array[]} Array of chunks
 */
export function chunk(array, size) {
  if (!Array.isArray(array) || size < 1) return [];

  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get unique values from an array
 * @param {Array} array - Array to filter
 * @param {Function} [keyFn] - Optional function to extract comparison key
 * @returns {Array} Array with unique values
 */
export function unique(array, keyFn) {
  if (!Array.isArray(array)) return [];

  if (keyFn) {
    const seen = new Set();
    return array.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return [...new Set(array)];
}

/**
 * Group array elements by a key
 * @param {Array} array - Array to group
 * @param {string|Function} keyOrFn - Property name or function to get group key
 * @returns {Object} Object with grouped arrays
 */
export function groupBy(array, keyOrFn) {
  if (!Array.isArray(array)) return {};

  const getKey = typeof keyOrFn === 'function'
    ? keyOrFn
    : (item) => item[keyOrFn];

  return array.reduce((groups, item) => {
    const key = getKey(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array (new array)
 */
export function shuffle(array) {
  if (!Array.isArray(array)) return [];

  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Flatten a nested array
 * @param {Array} array - Array to flatten
 * @param {number} [depth=1] - Depth to flatten (Infinity for complete flattening)
 * @returns {Array} Flattened array
 */
export function flatten(array, depth = 1) {
  if (!Array.isArray(array)) return [];

  if (depth === Infinity) {
    return array.flat(Infinity);
  }

  return array.flat(depth);
}

/**
 * Get the first n elements from an array
 * @param {Array} array - Source array
 * @param {number} [n=1] - Number of elements
 * @returns {Array} First n elements
 */
export function take(array, n = 1) {
  if (!Array.isArray(array)) return [];
  return array.slice(0, n);
}

/**
 * Get the last n elements from an array
 * @param {Array} array - Source array
 * @param {number} [n=1] - Number of elements
 * @returns {Array} Last n elements
 */
export function takeLast(array, n = 1) {
  if (!Array.isArray(array)) return [];
  return array.slice(-n);
}

/**
 * Remove falsy values from an array
 * @param {Array} array - Array to compact
 * @returns {Array} Array without falsy values
 */
export function compact(array) {
  if (!Array.isArray(array)) return [];
  return array.filter(Boolean);
}

/**
 * Get intersection of two arrays
 * @param {Array} a - First array
 * @param {Array} b - Second array
 * @returns {Array} Intersection
 */
export function intersection(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const setB = new Set(b);
  return a.filter(item => setB.has(item));
}

/**
 * Get difference of two arrays (elements in a but not in b)
 * @param {Array} a - First array
 * @param {Array} b - Second array
 * @returns {Array} Difference
 */
export function difference(a, b) {
  if (!Array.isArray(a)) return [];
  if (!Array.isArray(b)) return [...a];
  const setB = new Set(b);
  return a.filter(item => !setB.has(item));
}

/**
 * Get union of two arrays
 * @param {Array} a - First array
 * @param {Array} b - Second array
 * @returns {Array} Union
 */
export function union(a, b) {
  if (!Array.isArray(a) && !Array.isArray(b)) return [];
  if (!Array.isArray(a)) return unique(b);
  if (!Array.isArray(b)) return unique(a);
  return unique([...a, ...b]);
}

/**
 * Partition an array into two based on a predicate
 * @param {Array} array - Array to partition
 * @param {Function} predicate - Function to test elements
 * @returns {[Array, Array]} [passing, failing] arrays
 */
export function partition(array, predicate) {
  if (!Array.isArray(array)) return [[], []];

  const passing = [];
  const failing = [];

  for (const item of array) {
    if (predicate(item)) {
      passing.push(item);
    } else {
      failing.push(item);
    }
  }

  return [passing, failing];
}

/**
 * Find the first element that satisfies a predicate
 * @param {Array} array - Array to search
 * @param {Function} predicate - Test function
 * @param {*} [defaultValue] - Default if not found
 * @returns {*} Found element or default
 */
export function find(array, predicate, defaultValue = undefined) {
  if (!Array.isArray(array)) return defaultValue;
  const found = array.find(predicate);
  return found !== undefined ? found : defaultValue;
}

/**
 * Sum all numbers in an array
 * @param {number[]} array - Array of numbers
 * @returns {number} Sum
 */
export function sum(array) {
  if (!Array.isArray(array)) return 0;
  return array.reduce((acc, val) => acc + (Number(val) || 0), 0);
}

/**
 * Get average of numbers in an array
 * @param {number[]} array - Array of numbers
 * @returns {number} Average
 */
export function average(array) {
  if (!Array.isArray(array) || array.length === 0) return 0;
  return sum(array) / array.length;
}

/**
 * Sort array by a key or comparator
 * @param {Array} array - Array to sort
 * @param {string|Function} keyOrComparator - Sort key or comparator function
 * @param {string} [order='asc'] - Sort order ('asc' or 'desc')
 * @returns {Array} Sorted array (new array)
 */
export function sortBy(array, keyOrComparator, order = 'asc') {
  if (!Array.isArray(array)) return [];

  const result = [...array];
  const multiplier = order === 'desc' ? -1 : 1;

  if (typeof keyOrComparator === 'function') {
    return result.sort((a, b) => multiplier * keyOrComparator(a, b));
  }

  return result.sort((a, b) => {
    const valA = a[keyOrComparator];
    const valB = b[keyOrComparator];

    if (valA < valB) return -1 * multiplier;
    if (valA > valB) return 1 * multiplier;
    return 0;
  });
}

export default {
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
};
