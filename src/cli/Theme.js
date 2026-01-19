/**
 * CLI Theme System
 * @module cli/Theme
 */

import chalk from 'chalk';
import { BOX_UNICODE, BOX_ASCII } from './constants.js';

/**
 * @typedef {Object} ThemeColors
 * @property {Function} primary - Primary accent color
 * @property {Function} secondary - Secondary accent color
 * @property {Function} success - Success messages
 * @property {Function} error - Error messages
 * @property {Function} warning - Warning messages
 * @property {Function} info - Info messages
 * @property {Function} dim - Dimmed text
 * @property {Function} highlight - Highlighted text
 * @property {Function} prompt - Prompt color
 * @property {Function} border - Border color
 * @property {Function} ollama - Ollama provider color
 * @property {Function} gemini - Gemini provider color
 */

/**
 * @typedef {Object} ThemeSymbols
 * @property {string} prompt - Main prompt symbol
 * @property {string} multilinePrompt - Continuation prompt
 * @property {string} bullet - List bullet
 * @property {string} check - Success checkmark
 * @property {string} cross - Error cross
 * @property {string} warning - Warning symbol
 * @property {string} info - Info symbol
 * @property {string} arrow - Arrow pointer
 * @property {string} ellipsis - Ellipsis
 * @property {string} hydra - Hydra icon
 * @property {string} ollama - Ollama icon
 * @property {string} gemini - Gemini icon
 */

/**
 * @typedef {Object} Theme
 * @property {string} name - Theme name
 * @property {ThemeColors} colors - Color functions
 * @property {ThemeSymbols} symbols - Symbol characters
 * @property {Object} box - Box drawing characters
 * @property {string[]} spinner - Spinner animation frames
 */

/**
 * HYDRA Dark Theme - Default theme with purple/cyan accents
 * @type {Theme}
 */
export const HydraTheme = {
  name: 'hydra',
  colors: {
    primary: chalk.cyan,
    secondary: chalk.magenta,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    dim: chalk.gray,
    highlight: chalk.bold.white,
    prompt: chalk.cyan.bold,
    border: chalk.gray,
    ollama: chalk.hex('#8b5cf6'), // Purple
    gemini: chalk.hex('#22d3ee'), // Cyan
    code: chalk.hex('#e6db74'), // Yellow for code
    keyword: chalk.hex('#f92672'), // Pink for keywords
    string: chalk.hex('#a6e22e'), // Green for strings
    number: chalk.hex('#ae81ff') // Purple for numbers
  },
  symbols: {
    prompt: '>',
    multilinePrompt: '...',
    bullet: '*',
    check: 'v',
    cross: 'x',
    warning: '!',
    info: 'i',
    arrow: '->',
    ellipsis: '...',
    hydra: '[H]',
    ollama: '[O]',
    gemini: '[G]'
  },
  box: BOX_UNICODE,
  spinner: ['|', '/', '-', '\\']
};

/**
 * Minimal ASCII Theme - For terminals with limited Unicode support
 * @type {Theme}
 */
export const MinimalTheme = {
  name: 'minimal',
  colors: {
    primary: chalk.cyan,
    secondary: chalk.magenta,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    dim: chalk.gray,
    highlight: chalk.bold,
    prompt: chalk.cyan,
    border: chalk.gray,
    ollama: chalk.magenta,
    gemini: chalk.cyan,
    code: chalk.yellow,
    keyword: chalk.red,
    string: chalk.green,
    number: chalk.magenta
  },
  symbols: {
    prompt: '>',
    multilinePrompt: '...',
    bullet: '*',
    check: '[OK]',
    cross: '[X]',
    warning: '[!]',
    info: '[i]',
    arrow: '->',
    ellipsis: '...',
    hydra: 'HYDRA',
    ollama: 'OLLAMA',
    gemini: 'GEMINI'
  },
  box: BOX_ASCII,
  spinner: ['|', '/', '-', '\\']
};

/**
 * Neon Theme - High contrast neon colors
 * @type {Theme}
 */
export const NeonTheme = {
  name: 'neon',
  colors: {
    primary: chalk.hex('#00ffff'), // Bright cyan
    secondary: chalk.hex('#ff00ff'), // Bright magenta
    success: chalk.hex('#00ff00'), // Bright green
    error: chalk.hex('#ff0000'), // Bright red
    warning: chalk.hex('#ffff00'), // Bright yellow
    info: chalk.hex('#0080ff'), // Bright blue
    dim: chalk.hex('#808080'),
    highlight: chalk.bold.hex('#ffffff'),
    prompt: chalk.bold.hex('#00ffff'),
    border: chalk.hex('#404040'),
    ollama: chalk.hex('#bf5fff'), // Bright purple
    gemini: chalk.hex('#00e5ff'), // Bright cyan
    code: chalk.hex('#ffff00'),
    keyword: chalk.hex('#ff0080'),
    string: chalk.hex('#80ff00'),
    number: chalk.hex('#ff8000')
  },
  symbols: {
    prompt: '>>',
    multilinePrompt: '::',
    bullet: '*',
    check: '+',
    cross: 'X',
    warning: '!',
    info: '?',
    arrow: '=>',
    ellipsis: '...',
    hydra: '<<HYDRA>>',
    ollama: '<<OLLAMA>>',
    gemini: '<<GEMINI>>'
  },
  box: BOX_UNICODE,
  spinner: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]', '[ ===]', '[  ==]', '[   =]']
};

/**
 * Monokai Theme - Classic Monokai color scheme
 * @type {Theme}
 */
export const MonokaiTheme = {
  name: 'monokai',
  colors: {
    primary: chalk.hex('#66d9ef'), // Blue
    secondary: chalk.hex('#ae81ff'), // Purple
    success: chalk.hex('#a6e22e'), // Green
    error: chalk.hex('#f92672'), // Pink/Red
    warning: chalk.hex('#fd971f'), // Orange
    info: chalk.hex('#66d9ef'), // Blue
    dim: chalk.hex('#75715e'), // Comment gray
    highlight: chalk.bold.hex('#f8f8f2'), // Foreground
    prompt: chalk.bold.hex('#f92672'), // Pink
    border: chalk.hex('#49483e'), // Background lighter
    ollama: chalk.hex('#ae81ff'), // Purple
    gemini: chalk.hex('#66d9ef'), // Blue
    code: chalk.hex('#e6db74'), // Yellow
    keyword: chalk.hex('#f92672'), // Pink
    string: chalk.hex('#e6db74'), // Yellow
    number: chalk.hex('#ae81ff') // Purple
  },
  symbols: {
    prompt: '>',
    multilinePrompt: '...',
    bullet: '*',
    check: 'v',
    cross: 'x',
    warning: '!',
    info: 'i',
    arrow: '->',
    ellipsis: '...',
    hydra: '[H]',
    ollama: '[O]',
    gemini: '[G]'
  },
  box: BOX_UNICODE,
  spinner: ['|', '/', '-', '\\']
};

/**
 * Dracula Theme - Popular Dracula color scheme
 * @type {Theme}
 */
export const DraculaTheme = {
  name: 'dracula',
  colors: {
    primary: chalk.hex('#8be9fd'), // Cyan
    secondary: chalk.hex('#ff79c6'), // Pink
    success: chalk.hex('#50fa7b'), // Green
    error: chalk.hex('#ff5555'), // Red
    warning: chalk.hex('#ffb86c'), // Orange
    info: chalk.hex('#8be9fd'), // Cyan
    dim: chalk.hex('#6272a4'), // Comment
    highlight: chalk.bold.hex('#f8f8f2'), // Foreground
    prompt: chalk.bold.hex('#bd93f9'), // Purple
    border: chalk.hex('#44475a'), // Current line
    ollama: chalk.hex('#bd93f9'), // Purple
    gemini: chalk.hex('#8be9fd'), // Cyan
    code: chalk.hex('#f1fa8c'), // Yellow
    keyword: chalk.hex('#ff79c6'), // Pink
    string: chalk.hex('#f1fa8c'), // Yellow
    number: chalk.hex('#bd93f9') // Purple
  },
  symbols: {
    prompt: '>',
    multilinePrompt: '...',
    bullet: '*',
    check: 'v',
    cross: 'x',
    warning: '!',
    info: 'i',
    arrow: '->',
    ellipsis: '...',
    hydra: '[H]',
    ollama: '[O]',
    gemini: '[G]'
  },
  box: BOX_UNICODE,
  spinner: ['|', '/', '-', '\\']
};

/**
 * Get theme by name
 * @param {string} name - Theme name
 * @returns {Theme} Theme object
 */
export function getTheme(name) {
  const themes = {
    hydra: HydraTheme,
    minimal: MinimalTheme,
    neon: NeonTheme,
    monokai: MonokaiTheme,
    dracula: DraculaTheme
  };
  return themes[name] || HydraTheme;
}

/**
 * Get all available theme names
 * @returns {string[]} Theme names
 */
export function getAvailableThemes() {
  return ['hydra', 'minimal', 'neon', 'monokai', 'dracula'];
}

/**
 * Detect if terminal supports Unicode
 * @returns {boolean} True if Unicode is supported
 */
export function supportsUnicode() {
  // Check common indicators for Unicode support
  const term = process.env.TERM || '';
  const lang = process.env.LANG || '';
  const lcAll = process.env.LC_ALL || '';

  // Windows Terminal and modern terminals support Unicode
  if (process.env.WT_SESSION) return true;

  // Check for UTF-8 in locale settings
  if (lang.includes('UTF-8') || lcAll.includes('UTF-8')) return true;

  // xterm and similar terminals usually support Unicode
  if (term.includes('xterm') || term.includes('256color')) return true;

  // Default to ASCII on Windows CMD, Unicode elsewhere
  return process.platform !== 'win32' || process.env.ConEmuANSI === 'ON';
}

/**
 * Get appropriate theme based on terminal capabilities
 * @returns {Theme} Best theme for current terminal
 */
export function getAutoTheme() {
  return supportsUnicode() ? HydraTheme : MinimalTheme;
}

/** Default export is HydraTheme */
export default HydraTheme;
