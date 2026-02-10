/**
 * Centralized Utilities
 * @module utils
 */

export * from './array.js';
export * from './crypto.js';
export * from './env.js';
export * from './fs.js';
export * from './object.js';
// Export all named exports from each module
export * from './string.js';
export * from './time.js';
export * from './validation.js';

import arrayUtils from './array.js';
import cryptoUtils from './crypto.js';
import envUtils from './env.js';
import fsUtils from './fs.js';
import objectUtils from './object.js';
// Re-export default objects for convenience
import stringUtils from './string.js';
import timeUtils from './time.js';
import validationUtils from './validation.js';

export {
  stringUtils,
  fsUtils,
  timeUtils,
  objectUtils,
  arrayUtils,
  validationUtils,
  cryptoUtils,
  envUtils,
};

export default {
  ...stringUtils,
  ...fsUtils,
  ...timeUtils,
  ...objectUtils,
  ...arrayUtils,
  ...validationUtils,
  ...cryptoUtils,
  ...envUtils,
};

// Zod helpers
export {
  envBoolean,
  envNumber,
  envNumberInRange,
  envString,
  formatZodErrors,
  parseZodErrors,
} from './zod-helpers.js';
