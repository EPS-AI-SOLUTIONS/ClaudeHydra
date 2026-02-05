/**
 * Centralized Utilities
 * @module utils
 */

// Export all named exports from each module
export * from './string.js';
export * from './fs.js';
export * from './time.js';
export * from './object.js';
export * from './array.js';
export * from './validation.js';
export * from './crypto.js';
export * from './env.js';

// Re-export default objects for convenience
import stringUtils from './string.js';
import fsUtils from './fs.js';
import timeUtils from './time.js';
import objectUtils from './object.js';
import arrayUtils from './array.js';
import validationUtils from './validation.js';
import cryptoUtils from './crypto.js';
import envUtils from './env.js';

export {
  stringUtils,
  fsUtils,
  timeUtils,
  objectUtils,
  arrayUtils,
  validationUtils,
  cryptoUtils,
  envUtils
};

export default {
  ...stringUtils,
  ...fsUtils,
  ...timeUtils,
  ...objectUtils,
  ...arrayUtils,
  ...validationUtils,
  ...cryptoUtils,
  ...envUtils
};
