/**
 * Theme Registry - Unified theme system
 * Based on src/cli/Theme.js with extensions
 * @module cli-unified/core/ThemeRegistry
 */

import chalk from 'chalk';
import { BOX_ASCII, BOX_BOLD, BOX_DOUBLE, BOX_ROUNDED, BOX_SINGLE } from './constants.js';

// ============================================================================
// THEME DEFINITIONS
// ============================================================================

/** HYDRA Dark Theme - Default */
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
    llamacpp: chalk.hex('#8b5cf6'),
    gemini: chalk.hex('#22d3ee'),
    code: chalk.hex('#e6db74'),
    keyword: chalk.hex('#f92672'),
    string: chalk.hex('#a6e22e'),
    number: chalk.hex('#ae81ff'),
    stateIdle: chalk.cyan,
    stateProcessing: chalk.yellow,
    stateError: chalk.red,
    stateSuccess: chalk.green,
    modeYolo: chalk.magenta.bold,
    modeQuick: chalk.yellow,
    modeNormal: chalk.gray,
  },
  symbols: {
    prompt: '\u276f',
    check: '\u2714',
    cross: '\u2718',
    warning: '\u26a0',
    info: '\u2139',
    arrow: '\u279c',
    ellipsis: '\u2026',
    bullet: '\u2022',
    hydra: '\ud83d\udc09',
    llamacpp: '\ud83e\udd99',
    gemini: '\u2652',
    star: '\u2605',
    heart: '\u2665',
    lightning: '\u26a1',
    fire: '\ud83d\udd25',
    rocket: '\ud83d\ude80',
    gear: '\u2699',
    lock: '\ud83d\udd12',
    key: '\ud83d\udd11',
    folder: '\ud83d\udcc1',
    file: '\ud83d\udcc4',
    code: '\ud83d\udcbb',
    bug: '\ud83d\udc1b',
    wrench: '\ud83d\udd27',
    search: '\ud83d\udd0d',
    clock: '\ud83d\udd50',
    package: '\ud83d\udce6',
    link: '\ud83d\udd17',
    shield: '\ud83d\udee1',
    tools: '\ud83d\udee0',
    sparkles: '\u2728',
    h1: '\u2726',
    h2: '\u25C6',
    h3: '\u25B6',
    h4: '\u25AA',
    h5: '\u2022',
    h6: '\u00B7',
    taskDone: '\u2714',
    taskPending: '\u25CB',
    quoteBar: '\u2503',
    linkIcon: '\u2197',
  },
  box: BOX_ROUNDED,
  spinner: ['\u28fb', '\u28fd', '\u28fe', '\u28f7', '\u28ef', '\u28df', '\u287f', '\u28bf'],
  spinnerType: 'dots',
};

/** Minimal ASCII Theme */
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
    llamacpp: chalk.magenta,
    gemini: chalk.cyan,
    code: chalk.yellow,
    keyword: chalk.red,
    string: chalk.green,
    number: chalk.magenta,
    stateIdle: chalk.cyan,
    stateProcessing: chalk.yellow,
    stateError: chalk.red,
    stateSuccess: chalk.green,
    modeYolo: chalk.magenta,
    modeQuick: chalk.yellow,
    modeNormal: chalk.gray,
  },
  symbols: {
    prompt: '>',
    check: '[OK]',
    cross: '[X]',
    warning: '[!]',
    info: '[i]',
    arrow: '->',
    ellipsis: '...',
    bullet: '*',
    hydra: 'HYDRA',
    llamacpp: 'LLAMACPP',
    gemini: 'GEMINI',
    star: '*',
    heart: '<3',
    lightning: '/!\\',
    fire: '(*)',
    rocket: '^',
    gear: '[#]',
    lock: '[=]',
    key: '-o-',
    folder: '[D]',
    file: '[F]',
    code: '</>',
    bug: '[BUG]',
    wrench: '/~\\',
    search: '[?]',
    clock: '(@)',
    package: '[P]',
    link: '[~]',
    shield: '[O]',
    tools: '[T]',
    sparkles: '*',
    h1: '#',
    h2: '##',
    h3: '###',
    h4: '-',
    h5: '*',
    h6: '.',
    taskDone: '[x]',
    taskPending: '[ ]',
    quoteBar: '|',
    linkIcon: '>',
  },
  box: BOX_ASCII,
  spinner: ['|', '/', '-', '\\'],
  spinnerType: 'classic',
};

/** Neon Theme */
export const NeonTheme = {
  name: 'neon',
  colors: {
    primary: chalk.hex('#00ffff'),
    secondary: chalk.hex('#ff00ff'),
    success: chalk.hex('#00ff00'),
    error: chalk.hex('#ff0000'),
    warning: chalk.hex('#ffff00'),
    info: chalk.hex('#0080ff'),
    dim: chalk.hex('#808080'),
    highlight: chalk.bold.hex('#ffffff'),
    prompt: chalk.bold.hex('#00ffff'),
    border: chalk.hex('#404040'),
    llamacpp: chalk.hex('#bf5fff'),
    gemini: chalk.hex('#00e5ff'),
    code: chalk.hex('#ffff00'),
    keyword: chalk.hex('#ff0080'),
    string: chalk.hex('#80ff00'),
    number: chalk.hex('#ff8000'),
    stateIdle: chalk.hex('#00ffff'),
    stateProcessing: chalk.hex('#ffff00'),
    stateError: chalk.hex('#ff0000'),
    stateSuccess: chalk.hex('#00ff00'),
    modeYolo: chalk.hex('#ff00ff').bold,
    modeQuick: chalk.hex('#ffff00'),
    modeNormal: chalk.hex('#808080'),
  },
  symbols: { ...HydraTheme.symbols, prompt: '\u25b6' },
  box: BOX_BOLD,
  spinner: ['\u25b0\u25b1\u25b1', '\u25b0\u25b0\u25b1', '\u25b0\u25b0\u25b0'],
  spinnerType: 'aesthetic',
};

/** Monokai Theme */
export const MonokaiTheme = {
  name: 'monokai',
  colors: {
    primary: chalk.hex('#66d9ef'),
    secondary: chalk.hex('#ae81ff'),
    success: chalk.hex('#a6e22e'),
    error: chalk.hex('#f92672'),
    warning: chalk.hex('#fd971f'),
    info: chalk.hex('#66d9ef'),
    dim: chalk.hex('#75715e'),
    highlight: chalk.bold.hex('#f8f8f2'),
    prompt: chalk.bold.hex('#f92672'),
    border: chalk.hex('#49483e'),
    llamacpp: chalk.hex('#ae81ff'),
    gemini: chalk.hex('#66d9ef'),
    code: chalk.hex('#e6db74'),
    keyword: chalk.hex('#f92672'),
    string: chalk.hex('#e6db74'),
    number: chalk.hex('#ae81ff'),
    stateIdle: chalk.hex('#66d9ef'),
    stateProcessing: chalk.hex('#fd971f'),
    stateError: chalk.hex('#f92672'),
    stateSuccess: chalk.hex('#a6e22e'),
    modeYolo: chalk.hex('#ae81ff').bold,
    modeQuick: chalk.hex('#fd971f'),
    modeNormal: chalk.hex('#75715e'),
  },
  symbols: { ...HydraTheme.symbols },
  box: BOX_SINGLE,
  spinner: ['\u25dc', '\u25dd', '\u25de', '\u25df'],
  spinnerType: 'circle',
};

/** Dracula Theme */
export const DraculaTheme = {
  name: 'dracula',
  colors: {
    primary: chalk.hex('#8be9fd'),
    secondary: chalk.hex('#ff79c6'),
    success: chalk.hex('#50fa7b'),
    error: chalk.hex('#ff5555'),
    warning: chalk.hex('#ffb86c'),
    info: chalk.hex('#8be9fd'),
    dim: chalk.hex('#6272a4'),
    highlight: chalk.bold.hex('#f8f8f2'),
    prompt: chalk.bold.hex('#bd93f9'),
    border: chalk.hex('#44475a'),
    llamacpp: chalk.hex('#bd93f9'),
    gemini: chalk.hex('#8be9fd'),
    code: chalk.hex('#f1fa8c'),
    keyword: chalk.hex('#ff79c6'),
    string: chalk.hex('#f1fa8c'),
    number: chalk.hex('#bd93f9'),
    stateIdle: chalk.hex('#8be9fd'),
    stateProcessing: chalk.hex('#ffb86c'),
    stateError: chalk.hex('#ff5555'),
    stateSuccess: chalk.hex('#50fa7b'),
    modeYolo: chalk.hex('#ff79c6').bold,
    modeQuick: chalk.hex('#ffb86c'),
    modeNormal: chalk.hex('#6272a4'),
  },
  symbols: { ...HydraTheme.symbols, hydra: '\ud83e\uddd9' },
  box: BOX_DOUBLE,
  spinner: ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'],
  spinnerType: 'wave',
};

/** Witcher Theme (for Swarm) */
export const WitcherTheme = {
  name: 'witcher',
  colors: {
    primary: chalk.hex('#c9a227'), // Gold
    secondary: chalk.hex('#8b0000'), // Dark red
    success: chalk.hex('#228b22'),
    error: chalk.hex('#dc143c'),
    warning: chalk.hex('#ffd700'),
    info: chalk.hex('#4682b4'),
    dim: chalk.hex('#696969'),
    highlight: chalk.bold.hex('#f5f5dc'),
    prompt: chalk.bold.hex('#c9a227'),
    border: chalk.hex('#3c3c3c'),
    llamacpp: chalk.hex('#8b4513'),
    gemini: chalk.hex('#4169e1'),
    code: chalk.hex('#daa520'),
    keyword: chalk.hex('#dc143c'),
    string: chalk.hex('#32cd32'),
    number: chalk.hex('#9370db'),
    stateIdle: chalk.hex('#c9a227'),
    stateProcessing: chalk.hex('#ffd700'),
    stateError: chalk.hex('#dc143c'),
    stateSuccess: chalk.hex('#228b22'),
    modeYolo: chalk.hex('#8b0000').bold,
    modeQuick: chalk.hex('#ffd700'),
    modeNormal: chalk.hex('#696969'),
  },
  symbols: {
    ...HydraTheme.symbols,
    prompt: '\u2694', // Crossed swords
    hydra: '\ud83d\udc3a', // Wolf
  },
  box: BOX_BOLD,
  spinner: ['\u2694', '\ud83d\udee1', '\u2728', '\ud83d\udd25'],
  spinnerType: 'witcher',
};

/** Cyberpunk Theme */
export const CyberpunkTheme = {
  name: 'cyberpunk',
  colors: {
    primary: chalk.hex('#00fff9'),
    secondary: chalk.hex('#ff00a0'),
    success: chalk.hex('#39ff14'),
    error: chalk.hex('#ff073a'),
    warning: chalk.hex('#ffe400'),
    info: chalk.hex('#00d4ff'),
    dim: chalk.hex('#555555'),
    highlight: chalk.bold.hex('#ffffff'),
    prompt: chalk.bold.hex('#ff00a0'),
    border: chalk.hex('#333333'),
    llamacpp: chalk.hex('#9d00ff'),
    gemini: chalk.hex('#00fff9'),
    code: chalk.hex('#ffe400'),
    keyword: chalk.hex('#ff00a0'),
    string: chalk.hex('#39ff14'),
    number: chalk.hex('#00d4ff'),
    stateIdle: chalk.hex('#00fff9'),
    stateProcessing: chalk.hex('#ffe400'),
    stateError: chalk.hex('#ff073a'),
    stateSuccess: chalk.hex('#39ff14'),
    modeYolo: chalk.hex('#ff00a0').bold,
    modeQuick: chalk.hex('#ffe400'),
    modeNormal: chalk.hex('#555555'),
  },
  symbols: { ...HydraTheme.symbols, prompt: '\u25b8' },
  box: BOX_BOLD,
  spinner: ['\u2588\u2591\u2591', '\u2591\u2588\u2591', '\u2591\u2591\u2588'],
  spinnerType: 'cyber',
};

// ============================================================================
// THEME REGISTRY
// ============================================================================

const themes = new Map([
  ['hydra', HydraTheme],
  ['minimal', MinimalTheme],
  ['neon', NeonTheme],
  ['monokai', MonokaiTheme],
  ['dracula', DraculaTheme],
  ['witcher', WitcherTheme],
  ['cyberpunk', CyberpunkTheme],
]);

/**
 * Theme Registry class
 */
export class ThemeRegistry {
  constructor() {
    this.current = HydraTheme;
    this.custom = new Map();
  }

  /**
   * Get theme by name
   * @param {string} name - Theme name
   * @returns {Object} Theme object
   */
  get(name) {
    return this.custom.get(name) || themes.get(name) || HydraTheme;
  }

  /**
   * Set current theme
   * @param {string} name - Theme name
   */
  set(name) {
    this.current = this.get(name);
    return this.current;
  }

  /**
   * Register custom theme
   * @param {string} name - Theme name
   * @param {Object} theme - Theme definition
   */
  register(name, theme) {
    const base = themes.get(theme.extends) || HydraTheme;
    const merged = {
      ...base,
      ...theme,
      colors: { ...base.colors, ...theme.colors },
      symbols: { ...base.symbols, ...theme.symbols },
    };
    this.custom.set(name, merged);
  }

  /**
   * Get all available theme names
   * @returns {string[]} Theme names
   */
  list() {
    return [...themes.keys(), ...this.custom.keys()];
  }

  /**
   * Get current theme
   * @returns {Object} Current theme
   */
  getCurrent() {
    return this.current;
  }
}

// Utility functions
export function getTheme(name) {
  return themes.get(name) || HydraTheme;
}

export function getAvailableThemes() {
  return [...themes.keys()];
}

export function supportsUnicode() {
  const term = process.env.TERM || '';
  const lang = process.env.LANG || '';
  if (process.env.WT_SESSION) return true;
  if (lang.includes('UTF-8')) return true;
  if (term.includes('xterm') || term.includes('256color')) return true;
  return process.platform !== 'win32' || process.env.ConEmuANSI === 'ON';
}

export function getAutoTheme() {
  return supportsUnicode() ? HydraTheme : MinimalTheme;
}

// Singleton
export const themeRegistry = new ThemeRegistry();

export default themeRegistry;
