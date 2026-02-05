/**
 * String Utilities
 * @module utils/string
 */

/**
 * Generate a unique ID
 * @param {string} [prefix='id'] - ID prefix
 * @returns {string} Unique ID
 */
export function generateId(prefix = 'id') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a short unique ID
 * @param {number} [length=8] - ID length
 * @returns {string} Short ID
 */
export function shortId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Normalize text by trimming and collapsing whitespace
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalize(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

/**
 * Sanitize text for safe display
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitize(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n');
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} [suffix='...'] - Suffix to add when truncated
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Convert to title case
 * @param {string} text - Text to convert
 * @returns {string} Title-cased text
 */
export function toTitleCase(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/(?:^|\s|[-_])\w/g, match => match.toUpperCase());
}

/**
 * Convert to camelCase
 * @param {string} text - Text to convert
 * @returns {string} camelCased text
 */
export function toCamelCase(text) {
  if (!text) return '';
  return text
    .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
    .replace(/^./, c => c.toLowerCase());
}

/**
 * Convert to snake_case
 * @param {string} text - Text to convert
 * @returns {string} snake_cased text
 */
export function toSnakeCase(text) {
  if (!text) return '';
  return text
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Convert to kebab-case
 * @param {string} text - Text to convert
 * @returns {string} kebab-cased text
 */
export function toKebabCase(text) {
  if (!text) return '';
  return text
    .replace(/([A-Z])/g, '-$1')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Pad string to specified length
 * @param {string} text - Text to pad
 * @param {number} length - Target length
 * @param {string} [char=' '] - Padding character
 * @param {string} [side='right'] - Padding side ('left', 'right', 'both')
 * @returns {string} Padded string
 */
export function pad(text, length, char = ' ', side = 'right') {
  const str = String(text);
  const padLen = Math.max(0, length - str.length);
  const padding = char.repeat(Math.ceil(padLen / char.length)).slice(0, padLen);

  switch (side) {
    case 'left':
      return padding + str;
    case 'both': {
      const left = Math.floor(padLen / 2);
      const right = padLen - left;
      return char.repeat(left) + str + char.repeat(right);
    }
    default:
      return str + padding;
  }
}

/**
 * Strip ANSI escape codes from string
 * @param {string} text - Text with ANSI codes
 * @returns {string} Clean text
 */
export function stripAnsi(text) {
  if (!text) return '';
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Count words in text
 * @param {string} text - Text to count
 * @returns {number} Word count
 */
export function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Escape special regex characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML entities
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, char => entities[char]);
}

/**
 * Check if string is empty or whitespace only
 * @param {string} text - Text to check
 * @returns {boolean} True if empty or whitespace
 */
export function isBlank(text) {
  return !text || /^\s*$/.test(text);
}

/**
 * Generate a slug from text
 * @param {string} text - Text to slugify
 * @returns {string} Slug
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default {
  generateId,
  shortId,
  normalize,
  sanitize,
  truncate,
  toTitleCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  pad,
  stripAnsi,
  wordCount,
  escapeRegex,
  escapeHtml,
  isBlank,
  slugify
};
