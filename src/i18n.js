/**
 * @fileoverview Enhanced internationalization (i18n) module
 * Provides lazy-loading translations, proper namespace support,
 * interpolation, pluralization, and language detection.
 * @module i18n
 */

import i18next from 'i18next';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// Configuration
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'locales');

/** @type {string[]} Supported languages */
const SUPPORTED_LANGUAGES = ['en', 'pl', 'de', 'es', 'fr', 'ja', 'zh'];

/** @type {string} Default fallback language */
const DEFAULT_LANGUAGE = 'en';

/** @type {Map<string, Object>} Cache for loaded translations */
const translationCache = new Map();

/** @type {boolean} Whether i18next has been initialized */
let isInitialized = false;

/** @type {Promise<void>|null} Initialization promise */
let initPromise = null;

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Detects the user's preferred language from environment
 * @returns {string} Detected language code
 */
function detectLanguage() {
  // Check explicit environment variable first
  const envLang = process.env.HYDRA_LANG || process.env.LANG || process.env.LC_ALL;

  if (envLang) {
    // Extract language code (e.g., 'en_US.UTF-8' -> 'en')
    const match = envLang.match(/^([a-z]{2})(_[A-Z]{2})?/i);
    if (match && SUPPORTED_LANGUAGES.includes(match[1].toLowerCase())) {
      return match[1].toLowerCase();
    }
  }

  // Windows-specific detection
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const locale = execSync('powershell -Command "[System.Globalization.CultureInfo]::CurrentCulture.TwoLetterISOLanguageName"', {
        encoding: 'utf8',
        timeout: 1000
      }).trim();
      if (SUPPORTED_LANGUAGES.includes(locale)) {
        return locale;
      }
    } catch {
      // Ignore errors in detection
    }
  }

  return DEFAULT_LANGUAGE;
}

// ============================================================================
// Translation Loading
// ============================================================================

/**
 * Loads translation file for a language
 * @param {string} lang - Language code
 * @param {string} [namespace='translation'] - Namespace
 * @returns {Promise<Object>} Translation object
 */
async function loadTranslation(lang, namespace = 'translation') {
  const cacheKey = `${lang}:${namespace}`;

  // Check cache first
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const filePath = join(LOCALES_DIR, lang, `${namespace}.json`);

  try {
    const content = await readFile(filePath, 'utf8');
    const translations = JSON.parse(content);
    translationCache.set(cacheKey, translations);
    return translations;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Try fallback to default language
      if (lang !== DEFAULT_LANGUAGE) {
        return loadTranslation(DEFAULT_LANGUAGE, namespace);
      }
      return {};
    }
    console.error(`Failed to load translations for ${lang}/${namespace}:`, error.message);
    return {};
  }
}

/**
 * Loads translation file synchronously (for initial load)
 * @param {string} lang - Language code
 * @param {string} [namespace='translation'] - Namespace
 * @returns {Object} Translation object
 */
function loadTranslationSync(lang, namespace = 'translation') {
  const cacheKey = `${lang}:${namespace}`;

  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const filePath = join(LOCALES_DIR, lang, `${namespace}.json`);

  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8');
      const translations = JSON.parse(content);
      translationCache.set(cacheKey, translations);
      return translations;
    }
  } catch (error) {
    console.error(`Failed to load translations for ${lang}/${namespace}:`, error.message);
  }

  // Fallback
  if (lang !== DEFAULT_LANGUAGE) {
    return loadTranslationSync(DEFAULT_LANGUAGE, namespace);
  }

  return {};
}

// ============================================================================
// i18next Backend
// ============================================================================

/**
 * Custom backend for lazy loading translations
 */
const LazyBackend = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    loadTranslation(language, namespace)
      .then(translations => callback(null, translations))
      .catch(error => callback(error, null));
  }
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the i18n system
 * @param {Object} [options] - Configuration options
 * @param {string} [options.language] - Initial language (auto-detected if not provided)
 * @param {string[]} [options.namespaces=['translation']] - Namespaces to load
 * @param {boolean} [options.debug=false] - Enable debug mode
 * @returns {Promise<typeof i18next>} Initialized i18next instance
 */
export async function initializeI18n(options = {}) {
  if (isInitialized) {
    return i18next;
  }

  if (initPromise) {
    await initPromise;
    return i18next;
  }

  const {
    language = detectLanguage(),
    namespaces = ['translation'],
    debug = false
  } = options;

  initPromise = i18next
    .use(LazyBackend)
    .init({
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      ns: namespaces,
      defaultNS: 'translation',

      debug,

      interpolation: {
        escapeValue: false, // Not needed for CLI
        formatSeparator: ',',
        format: (value, format, lng) => {
          if (format === 'uppercase') return String(value).toUpperCase();
          if (format === 'lowercase') return String(value).toLowerCase();
          if (format === 'capitalize') return String(value).charAt(0).toUpperCase() + String(value).slice(1);
          if (format === 'number') return new Intl.NumberFormat(lng).format(value);
          if (format === 'currency') return new Intl.NumberFormat(lng, { style: 'currency', currency: 'USD' }).format(value);
          if (format === 'date') return new Intl.DateTimeFormat(lng).format(new Date(value));
          if (format === 'time') return new Intl.DateTimeFormat(lng, { timeStyle: 'medium' }).format(new Date(value));
          if (format === 'relative') return formatRelativeTime(value, lng);
          return value;
        }
      },

      // Pluralization
      pluralSeparator: '_',
      contextSeparator: '_',

      // Missing key handling
      saveMissing: debug,
      missingKeyHandler: (lngs, ns, key, fallbackValue) => {
        if (debug) {
          console.warn(`Missing translation: ${lngs.join(',')}/${ns}/${key}`);
        }
      }
    });

  await initPromise;
  isInitialized = true;

  return i18next;
}

/**
 * Synchronous initialization for immediate use
 * Uses pre-loaded translations
 */
function initializeSync() {
  if (isInitialized) return;

  const language = detectLanguage();
  const translations = loadTranslationSync(language);
  const fallbackTranslations = language !== DEFAULT_LANGUAGE
    ? loadTranslationSync(DEFAULT_LANGUAGE)
    : {};

  i18next.init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    resources: {
      [language]: { translation: translations },
      [DEFAULT_LANGUAGE]: { translation: fallbackTranslations }
    },
    interpolation: {
      escapeValue: false
    }
  });

  isInitialized = true;
}

// Initialize synchronously on import
initializeSync();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats relative time (e.g., "2 hours ago")
 * @param {Date|number|string} date - Date to format
 * @param {string} [locale] - Locale code
 * @returns {string} Formatted relative time
 */
function formatRelativeTime(date, locale = DEFAULT_LANGUAGE) {
  const now = Date.now();
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (days > 0) return rtf.format(-days, 'day');
  if (hours > 0) return rtf.format(-hours, 'hour');
  if (minutes > 0) return rtf.format(-minutes, 'minute');
  return rtf.format(-seconds, 'second');
}

/**
 * Translates a key with optional interpolation
 * @param {string} key - Translation key
 * @param {Object} [options] - Interpolation options
 * @returns {string} Translated string
 */
export function t(key, options) {
  return i18next.t(key, options);
}

/**
 * Changes the current language
 * @param {string} language - Language code
 * @returns {Promise<void>}
 */
export async function changeLanguage(language) {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  // Pre-load translations
  await loadTranslation(language);

  return i18next.changeLanguage(language);
}

/**
 * Gets the current language
 * @returns {string} Current language code
 */
export function getCurrentLanguage() {
  return i18next.language || DEFAULT_LANGUAGE;
}

/**
 * Gets all supported languages
 * @returns {string[]} Array of supported language codes
 */
export function getSupportedLanguages() {
  return [...SUPPORTED_LANGUAGES];
}

/**
 * Checks if a language is supported
 * @param {string} language - Language code to check
 * @returns {boolean} True if supported
 */
export function isLanguageSupported(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

/**
 * Checks if a translation key exists
 * @param {string} key - Translation key
 * @param {Object} [options] - Options
 * @returns {boolean} True if key exists
 */
export function exists(key, options) {
  return i18next.exists(key, options);
}

/**
 * Loads additional namespace
 * @param {string|string[]} namespaces - Namespace(s) to load
 * @returns {Promise<void>}
 */
export async function loadNamespaces(namespaces) {
  const ns = Array.isArray(namespaces) ? namespaces : [namespaces];
  await Promise.all(ns.map(n => loadTranslation(getCurrentLanguage(), n)));
  return i18next.loadNamespaces(ns);
}

// ============================================================================
// Lazy Loading Support
// ============================================================================

/**
 * @typedef {Object} NamespaceLoadResult
 * @property {boolean} success - Whether loading succeeded
 * @property {string} namespace - Namespace that was loaded
 * @property {string} language - Language loaded for
 * @property {number} keyCount - Number of translation keys loaded
 * @property {number} loadTime - Time taken to load in ms
 * @property {string} [error] - Error message if failed
 */

/** @type {Set<string>} Track loaded namespaces */
const loadedNamespaces = new Set(['translation']);

/** @type {Map<string, Promise<NamespaceLoadResult>>} Pending namespace loads */
const pendingLoads = new Map();

/**
 * Lazily loads a translation namespace on demand.
 * Uses caching to avoid reloading already loaded namespaces.
 *
 * @param {string} namespace - Namespace to load (e.g., 'errors', 'commands', 'help')
 * @param {Object} [options={}] - Load options
 * @param {boolean} [options.force=false] - Force reload even if already loaded
 * @param {string} [options.language] - Specific language to load (default: current)
 * @returns {Promise<NamespaceLoadResult>} Load result with statistics
 *
 * @example
 * // Load the 'errors' namespace lazily
 * const result = await loadNamespace('errors');
 * if (result.success) {
 *   console.log(`Loaded ${result.keyCount} keys in ${result.loadTime}ms`);
 * }
 *
 * // Force reload
 * await loadNamespace('errors', { force: true });
 *
 * // Load for specific language
 * await loadNamespace('errors', { language: 'de' });
 */
export async function loadNamespace(namespace, options = {}) {
  const { force = false, language = getCurrentLanguage() } = options;
  const cacheKey = `${language}:${namespace}`;
  const startTime = Date.now();

  // Check if already loaded (unless force reload)
  if (!force && loadedNamespaces.has(cacheKey)) {
    return {
      success: true,
      namespace,
      language,
      keyCount: 0,
      loadTime: 0,
      cached: true
    };
  }

  // Check for pending load
  if (pendingLoads.has(cacheKey)) {
    return pendingLoads.get(cacheKey);
  }

  // Create loading promise
  const loadPromise = (async () => {
    try {
      // Load translation file
      const translations = await loadTranslation(language, namespace);

      // Count keys
      const keyCount = translations ? Object.keys(translations).length : 0;

      // Add to i18next if translations found
      if (keyCount > 0) {
        i18next.addResourceBundle(language, namespace, translations, true, true);
      }

      // Also load fallback language if different
      if (language !== DEFAULT_LANGUAGE) {
        const fallbackTranslations = await loadTranslation(DEFAULT_LANGUAGE, namespace);
        if (fallbackTranslations && Object.keys(fallbackTranslations).length > 0) {
          i18next.addResourceBundle(DEFAULT_LANGUAGE, namespace, fallbackTranslations, true, true);
        }
      }

      // Mark as loaded
      loadedNamespaces.add(cacheKey);

      const loadTime = Date.now() - startTime;

      return {
        success: true,
        namespace,
        language,
        keyCount,
        loadTime
      };
    } catch (error) {
      return {
        success: false,
        namespace,
        language,
        keyCount: 0,
        loadTime: Date.now() - startTime,
        error: error.message
      };
    } finally {
      // Clean up pending load
      pendingLoads.delete(cacheKey);
    }
  })();

  // Store pending load
  pendingLoads.set(cacheKey, loadPromise);

  return loadPromise;
}

/**
 * Preloads multiple namespaces in parallel.
 * Useful for preloading namespaces that will be needed soon.
 *
 * @param {string[]} namespaces - Namespaces to preload
 * @param {Object} [options={}] - Load options
 * @returns {Promise<Map<string, NamespaceLoadResult>>} Results keyed by namespace
 *
 * @example
 * // Preload multiple namespaces
 * const results = await preloadNamespaces(['errors', 'commands', 'help']);
 * results.forEach((result, ns) => {
 *   console.log(`${ns}: ${result.success ? 'loaded' : 'failed'}`);
 * });
 */
export async function preloadNamespaces(namespaces, options = {}) {
  const results = new Map();

  await Promise.all(
    namespaces.map(async (ns) => {
      const result = await loadNamespace(ns, options);
      results.set(ns, result);
    })
  );

  return results;
}

/**
 * Gets a translation from a lazily loaded namespace.
 * Automatically loads the namespace if not already loaded.
 *
 * @param {string} key - Translation key (can include namespace: 'errors:notFound')
 * @param {Object} [options={}] - Translation options
 * @returns {Promise<string>} Translated string
 *
 * @example
 * // Get translation with auto-loading
 * const msg = await tLazy('errors:fileNotFound', { file: 'config.json' });
 */
export async function tLazy(key, options = {}) {
  // Check if key includes namespace
  if (key.includes(':')) {
    const [namespace] = key.split(':');
    await loadNamespace(namespace);
  }

  return i18next.t(key, options);
}

/**
 * Creates a namespace-scoped translator with lazy loading.
 *
 * @param {string} namespace - Namespace for the translator
 * @returns {Object} Namespace-scoped translation functions
 *
 * @example
 * const errorT = await createNamespaceTranslator('errors');
 * const msg = errorT.t('fileNotFound', { file: 'config.json' });
 */
export async function createNamespaceTranslator(namespace) {
  await loadNamespace(namespace);

  return {
    /**
     * Translates a key within the namespace
     * @param {string} key - Translation key
     * @param {Object} [options] - Translation options
     * @returns {string} Translated string
     */
    t: (key, options = {}) => i18next.t(`${namespace}:${key}`, options),

    /**
     * Checks if a key exists in the namespace
     * @param {string} key - Translation key
     * @returns {boolean} True if exists
     */
    exists: (key) => i18next.exists(`${namespace}:${key}`),

    /**
     * Gets the namespace name
     * @returns {string} Namespace name
     */
    getNamespace: () => namespace
  };
}

/**
 * Gets list of currently loaded namespaces
 * @returns {string[]} Array of loaded namespace identifiers (language:namespace)
 */
export function getLoadedNamespaces() {
  return Array.from(loadedNamespaces);
}

/**
 * Checks if a namespace is loaded
 * @param {string} namespace - Namespace to check
 * @param {string} [language] - Language to check (default: current)
 * @returns {boolean} True if loaded
 */
export function isNamespaceLoaded(namespace, language = getCurrentLanguage()) {
  return loadedNamespaces.has(`${language}:${namespace}`);
}

/**
 * Unloads a namespace from memory (for memory management)
 * @param {string} namespace - Namespace to unload
 * @param {string} [language] - Language to unload (default: current)
 */
export function unloadNamespace(namespace, language = getCurrentLanguage()) {
  const cacheKey = `${language}:${namespace}`;

  // Remove from loaded set
  loadedNamespaces.delete(cacheKey);

  // Remove from translation cache
  translationCache.delete(cacheKey);

  // Remove from i18next (if supported)
  if (typeof i18next.removeResourceBundle === 'function') {
    i18next.removeResourceBundle(language, namespace);
  }
}

/**
 * Clears the translation cache
 */
export function clearCache() {
  translationCache.clear();
}

/**
 * Gets translation statistics
 * @returns {Object} Statistics object
 */
export function getStats() {
  return {
    currentLanguage: getCurrentLanguage(),
    supportedLanguages: SUPPORTED_LANGUAGES,
    isInitialized,
    cacheSize: translationCache.size,
    loadedLanguages: i18next.languages || []
  };
}

// ============================================================================
// Message Templates
// ============================================================================

/**
 * Pre-defined message templates for common CLI messages
 */
export const messages = {
  /**
   * Formats an error message
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   * @returns {string} Formatted error message
   */
  error: (message, code) => {
    const prefix = t('error.prefix', { defaultValue: 'Error' });
    return code ? `${prefix} [${code}]: ${message}` : `${prefix}: ${message}`;
  },

  /**
   * Formats a success message
   * @param {string} message - Success message
   * @returns {string} Formatted success message
   */
  success: (message) => {
    const prefix = t('success.prefix', { defaultValue: 'Success' });
    return `${prefix}: ${message}`;
  },

  /**
   * Formats a warning message
   * @param {string} message - Warning message
   * @returns {string} Formatted warning message
   */
  warning: (message) => {
    const prefix = t('warning.prefix', { defaultValue: 'Warning' });
    return `${prefix}: ${message}`;
  },

  /**
   * Formats an info message
   * @param {string} message - Info message
   * @returns {string} Formatted info message
   */
  info: (message) => {
    const prefix = t('info.prefix', { defaultValue: 'Info' });
    return `${prefix}: ${message}`;
  }
};

// ============================================================================
// Default Export
// ============================================================================

export default i18next;

export {
  i18next,
  initializeI18n,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  formatRelativeTime,
  // Lazy loading exports
  loadNamespace,
  preloadNamespaces,
  tLazy,
  createNamespaceTranslator,
  getLoadedNamespaces,
  isNamespaceLoaded,
  unloadNamespace
};
