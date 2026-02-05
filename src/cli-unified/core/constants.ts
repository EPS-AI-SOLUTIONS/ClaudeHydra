/**
 * Unified CLI Constants
 * Consolidated from src/cli/constants.js, src/cli-enhanced/*, src/swarm/cli/*
 * @module cli-unified/core/constants
 */

// ============================================================================
// FILE & PATH CONSTANTS
// ============================================================================

/** Default history file location */
export const HISTORY_FILE = '.hydra-history';

/** Maximum history entries */
export const MAX_HISTORY_SIZE = 1000;

/** Unified data directory */
export const DATA_DIR = '.claudehydra';

/** Data subdirectories */
export const DATA_PATHS = {
  CONFIG: 'config/config.json',
  HISTORY: 'history',
  CACHE: 'cache',
  SESSIONS: 'sessions',
  PLUGINS: 'plugins',
  THEMES: 'themes',
  MACROS: 'macros'
};

// ============================================================================
// PROMPT CONSTANTS
// ============================================================================

/** Default prompt string */
export const DEFAULT_PROMPT = 'HYDRA> ';

/** Multiline prompt continuation */
export const MULTILINE_PROMPT = '... ';

/** Command prefix */
export const COMMAND_PREFIX = '/';

/** Default terminal width */
export const DEFAULT_TERMINAL_WIDTH = 80;

// ============================================================================
// KEY CODES
// ============================================================================

/** Key codes for input handling */
export const KEYS = {
  // Arrow keys
  UP: '\x1b[A',
  DOWN: '\x1b[B',
  RIGHT: '\x1b[C',
  LEFT: '\x1b[D',

  // Basic keys
  ENTER: '\r',
  TAB: '\t',
  BACKSPACE: '\x7f',
  DELETE: '\x1b[3~',
  SPACE: ' ',

  // Control keys
  CTRL_A: '\x01',
  CTRL_B: '\x02',
  CTRL_C: '\x03',
  CTRL_D: '\x04',
  CTRL_E: '\x05',
  CTRL_F: '\x06',
  CTRL_G: '\x07',
  CTRL_H: '\x08',
  CTRL_I: '\x09', // Tab
  CTRL_J: '\x0a', // Newline
  CTRL_K: '\x0b',
  CTRL_L: '\x0c',
  CTRL_M: '\x0d', // Enter
  CTRL_N: '\x0e',
  CTRL_O: '\x0f',
  CTRL_P: '\x10',
  CTRL_Q: '\x11',
  CTRL_R: '\x12',
  CTRL_S: '\x13',
  CTRL_T: '\x14',
  CTRL_U: '\x15',
  CTRL_V: '\x16',
  CTRL_W: '\x17',
  CTRL_X: '\x18',
  CTRL_Y: '\x19',
  CTRL_Z: '\x1a',

  // Navigation
  ESCAPE: '\x1b',
  HOME: '\x1b[H',
  END: '\x1b[F',
  PAGE_UP: '\x1b[5~',
  PAGE_DOWN: '\x1b[6~',
  INSERT: '\x1b[2~',

  // Function keys
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~',

  // Alt combinations (for Vim mode)
  ALT_B: '\x1bb',
  ALT_F: '\x1bf',
  ALT_D: '\x1bd'
};

// ============================================================================
// ANSI ESCAPE SEQUENCES
// ============================================================================

/** ANSI escape sequences */
export const ANSI = {
  // Reset
  RESET: '\x1b[0m',

  // Cursor control
  CLEAR_LINE: '\x1b[2K',
  CLEAR_LINE_RIGHT: '\x1b[0K',
  CLEAR_LINE_LEFT: '\x1b[1K',
  CLEAR_SCREEN: '\x1b[2J',
  CLEAR_SCREEN_DOWN: '\x1b[J',
  CURSOR_HOME: '\x1b[H',
  CURSOR_SAVE: '\x1b[s',
  CURSOR_RESTORE: '\x1b[u',
  CURSOR_HIDE: '\x1b[?25l',
  CURSOR_SHOW: '\x1b[?25h',
  CURSOR_BLINK_ON: '\x1b[?12h',
  CURSOR_BLINK_OFF: '\x1b[?12l',

  // Cursor movement functions
  MOVE_UP: (n = 1) => `\x1b[${n}A`,
  MOVE_DOWN: (n = 1) => `\x1b[${n}B`,
  MOVE_RIGHT: (n = 1) => `\x1b[${n}C`,
  MOVE_LEFT: (n = 1) => `\x1b[${n}D`,
  MOVE_TO: (row, col) => `\x1b[${row};${col}H`,
  MOVE_TO_COL: (col) => `\x1b[${col}G`,

  // Screen modes
  ALT_SCREEN_ON: '\x1b[?1049h',
  ALT_SCREEN_OFF: '\x1b[?1049l',
  MOUSE_ON: '\x1b[?1000h',
  MOUSE_OFF: '\x1b[?1000l',

  // Text formatting
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  ITALIC: '\x1b[3m',
  UNDERLINE: '\x1b[4m',
  BLINK: '\x1b[5m',
  REVERSE: '\x1b[7m',
  HIDDEN: '\x1b[8m',
  STRIKETHROUGH: '\x1b[9m',

  // Reset formatting
  BOLD_OFF: '\x1b[22m',
  ITALIC_OFF: '\x1b[23m',
  UNDERLINE_OFF: '\x1b[24m',
  BLINK_OFF: '\x1b[25m',
  REVERSE_OFF: '\x1b[27m',
  HIDDEN_OFF: '\x1b[28m',

  // 16 basic colors (foreground)
  FG_BLACK: '\x1b[30m',
  FG_RED: '\x1b[31m',
  FG_GREEN: '\x1b[32m',
  FG_YELLOW: '\x1b[33m',
  FG_BLUE: '\x1b[34m',
  FG_MAGENTA: '\x1b[35m',
  FG_CYAN: '\x1b[36m',
  FG_WHITE: '\x1b[37m',
  FG_DEFAULT: '\x1b[39m',

  // Bright colors (foreground)
  FG_BRIGHT_BLACK: '\x1b[90m',
  FG_BRIGHT_RED: '\x1b[91m',
  FG_BRIGHT_GREEN: '\x1b[92m',
  FG_BRIGHT_YELLOW: '\x1b[93m',
  FG_BRIGHT_BLUE: '\x1b[94m',
  FG_BRIGHT_MAGENTA: '\x1b[95m',
  FG_BRIGHT_CYAN: '\x1b[96m',
  FG_BRIGHT_WHITE: '\x1b[97m',

  // 16 basic colors (background)
  BG_BLACK: '\x1b[40m',
  BG_RED: '\x1b[41m',
  BG_GREEN: '\x1b[42m',
  BG_YELLOW: '\x1b[43m',
  BG_BLUE: '\x1b[44m',
  BG_MAGENTA: '\x1b[45m',
  BG_CYAN: '\x1b[46m',
  BG_WHITE: '\x1b[47m',
  BG_DEFAULT: '\x1b[49m',

  // 256 color functions
  FG_256: (n) => `\x1b[38;5;${n}m`,
  BG_256: (n) => `\x1b[48;5;${n}m`,

  // True color (24-bit) functions
  FG_RGB: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
  BG_RGB: (r, g, b) => `\x1b[48;2;${r};${g};${b}m`
};

// ============================================================================
// STATE CONSTANTS
// ============================================================================

/** Prompt states */
export const PROMPT_STATES = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  ERROR: 'error',
  SUCCESS: 'success',
  WAITING: 'waiting'
};

/** Execution modes */
export const EXECUTION_MODES = {
  NORMAL: 'normal',
  YOLO: 'yolo',
  QUICK: 'quick'
};

/** CLI modes */
export const CLI_MODES = {
  BASIC: 'basic',
  ENHANCED: 'enhanced',
  SWARM: 'swarm',
  AUTO: 'auto'
};

/** Response time thresholds (ms) */
export const RESPONSE_TIME_THRESHOLDS = {
  FAST: 1000,      // < 1s = green
  MEDIUM: 5000,    // 1-5s = yellow
  SLOW: 10000      // > 5s = red
};

/** Spinner frame rate (ms) */
export const SPINNER_INTERVAL = 80;

// ============================================================================
// BOX DRAWING CHARACTERS
// ============================================================================

/** Box drawing - Single line (Unicode) */
export const BOX_SINGLE = {
  topLeft: '\u250c',      // ┌
  topRight: '\u2510',     // ┐
  bottomLeft: '\u2514',   // └
  bottomRight: '\u2518',  // ┘
  horizontal: '\u2500',   // ─
  vertical: '\u2502',     // │
  teeRight: '\u251c',     // ├
  teeLeft: '\u2524',      // ┤
  teeDown: '\u252c',      // ┬
  teeUp: '\u2534',        // ┴
  cross: '\u253c'         // ┼
};

/** Box drawing - Double line */
export const BOX_DOUBLE = {
  topLeft: '\u2554',      // ╔
  topRight: '\u2557',     // ╗
  bottomLeft: '\u255a',   // ╚
  bottomRight: '\u255d',  // ╝
  horizontal: '\u2550',   // ═
  vertical: '\u2551',     // ║
  teeRight: '\u2560',     // ╠
  teeLeft: '\u2563',      // ╣
  teeDown: '\u2566',      // ╦
  teeUp: '\u2569',        // ╩
  cross: '\u256c'         // ╬
};

/** Box drawing - Rounded corners */
export const BOX_ROUNDED = {
  topLeft: '\u256d',      // ╭
  topRight: '\u256e',     // ╮
  bottomLeft: '\u2570',   // ╰
  bottomRight: '\u256f',  // ╯
  horizontal: '\u2500',   // ─
  vertical: '\u2502',     // │
  teeRight: '\u251c',     // ├
  teeLeft: '\u2524',      // ┤
  teeDown: '\u252c',      // ┬
  teeUp: '\u2534',        // ┴
  cross: '\u253c'         // ┼
};

/** Box drawing - Bold (heavy) lines */
export const BOX_BOLD = {
  topLeft: '\u250f',      // ┏
  topRight: '\u2513',     // ┓
  bottomLeft: '\u2517',   // ┗
  bottomRight: '\u251b',  // ┛
  horizontal: '\u2501',   // ━
  vertical: '\u2503',     // ┃
  teeRight: '\u2523',     // ┣
  teeLeft: '\u252b',      // ┫
  teeDown: '\u2533',      // ┳
  teeUp: '\u253b',        // ┻
  cross: '\u254b'         // ╋
};

/** Box drawing - Dashed lines */
export const BOX_DASHED = {
  topLeft: '\u250c',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2504',   // ┄
  vertical: '\u2506',     // ┆
  teeRight: '\u251c',
  teeLeft: '\u2524',
  teeDown: '\u252c',
  teeUp: '\u2534',
  cross: '\u253c'
};

/** Box drawing - Dotted lines */
export const BOX_DOTTED = {
  topLeft: '\u250c',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2508',   // ┈
  vertical: '\u250a',     // ┊
  teeRight: '\u251c',
  teeLeft: '\u2524',
  teeDown: '\u252c',
  teeUp: '\u2534',
  cross: '\u253c'
};

/** Box drawing - ASCII fallback */
export const BOX_ASCII = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  teeRight: '+',
  teeLeft: '+',
  teeDown: '+',
  teeUp: '+',
  cross: '+',
  doubleHorizontal: '=',
  doubleVertical: '|'
};

/** All border styles mapping */
export const BORDER_STYLES = {
  single: BOX_SINGLE,
  double: BOX_DOUBLE,
  rounded: BOX_ROUNDED,
  bold: BOX_BOLD,
  dashed: BOX_DASHED,
  dotted: BOX_DOTTED,
  ascii: BOX_ASCII
};

// Backward compatibility aliases
export const BOX_UNICODE = BOX_SINGLE;

// ============================================================================
// PROGRESS CHARACTERS
// ============================================================================

/** Progress bar characters */
export const PROGRESS_CHARS = {
  // Block style
  BLOCK_FULL: '\u2588',      // █
  BLOCK_7_8: '\u2587',       // ▇
  BLOCK_3_4: '\u2586',       // ▆
  BLOCK_5_8: '\u2585',       // ▅
  BLOCK_1_2: '\u2584',       // ▄
  BLOCK_3_8: '\u2583',       // ▃
  BLOCK_1_4: '\u2582',       // ▂
  BLOCK_1_8: '\u2581',       // ▁
  BLOCK_EMPTY: ' ',

  // Shade style
  SHADE_FULL: '\u2588',      // █
  SHADE_DARK: '\u2593',      // ▓
  SHADE_MEDIUM: '\u2592',    // ▒
  SHADE_LIGHT: '\u2591',     // ░

  // Braille patterns
  BRAILLE_EMPTY: '\u2800',   // ⠀
  BRAILLE_FULL: '\u28FF',    // ⣿

  // Simple
  FILLED: '\u25a0',          // ■
  EMPTY: '\u25a1',           // □

  // ASCII fallback
  ASCII_FILLED: '#',
  ASCII_EMPTY: '-'
};

// ============================================================================
// EVENT TYPES
// ============================================================================

/** Event types for EventBus */
export const EVENT_TYPES = {
  // Input events
  INPUT_SUBMIT: 'input:submit',
  INPUT_CHANGE: 'input:change',
  INPUT_CANCEL: 'input:cancel',
  INPUT_COMPLETE: 'input:complete',

  // Command events
  COMMAND_EXECUTE: 'command:execute',
  COMMAND_COMPLETE: 'command:complete',
  COMMAND_ERROR: 'command:error',

  // State events
  STATE_CHANGE: 'state:change',
  MODE_CHANGE: 'mode:change',
  THEME_CHANGE: 'theme:change',

  // History events
  HISTORY_ADD: 'history:add',
  HISTORY_LOAD: 'history:load',
  HISTORY_CLEAR: 'history:clear',

  // Agent events
  AGENT_SELECT: 'agent:select',
  AGENT_EXECUTE: 'agent:execute',
  AGENT_COMPLETE: 'agent:complete',
  AGENT_ERROR: 'agent:error',

  // Cache events
  CACHE_HIT: 'cache:hit',
  CACHE_MISS: 'cache:miss',
  CACHE_CLEAR: 'cache:clear',

  // Context events
  CONTEXT_ADD: 'context:add',
  CONTEXT_REMOVE: 'context:remove',
  CONTEXT_CLEAR: 'context:clear',

  // UI events
  SPINNER_START: 'spinner:start',
  SPINNER_STOP: 'spinner:stop',
  RENDER_OUTPUT: 'render:output',
  RENDER_ERROR: 'render:error',

  // Lifecycle events
  CLI_INIT: 'cli:init',
  CLI_READY: 'cli:ready',
  CLI_EXIT: 'cli:exit'
};

// ============================================================================
// AGENT CONSTANTS
// ============================================================================

/** Witcher Swarm agent names */
export const AGENT_NAMES = [
  'Geralt',    // Security & validation
  'Yennefer',  // Architecture & synthesis
  'Triss',     // Data & integration
  'Jaskier',   // Documentation & logging
  'Vesemir',   // Code review & mentoring
  'Ciri',      // Fast execution & portals
  'Eskel',     // Testing & stability
  'Lambert',   // Refactoring & cleanup
  'Zoltan',    // Infrastructure & DevOps
  'Regis',     // Research & speculation
  'Dijkstra',  // Planning & strategy
  'Philippa'   // UI/UX & frontend
];

/** Agent emoji avatars */
export const AGENT_AVATARS = {
  Geralt: '\u2694\ufe0f',     // Crossed swords ⚔️
  Yennefer: '\u2728',         // Sparkles ✨
  Triss: '\ud83d\udd25',      // Fire 🔥
  Jaskier: '\ud83c\udfb5',    // Musical note 🎵
  Vesemir: '\ud83d\udcda',    // Books 📚
  Ciri: '\u26a1',             // Lightning ⚡
  Eskel: '\ud83d\udee1\ufe0f',// Shield 🛡️
  Lambert: '\ud83d\udd27',    // Wrench 🔧
  Zoltan: '\ud83c\udfed',     // Factory 🏭
  Regis: '\ud83e\udddb',      // Vampire 🧛
  Dijkstra: '\ud83c\udfaf',   // Target 🎯
  Philippa: '\ud83e\udd89'    // Owl 🦉
};

// ============================================================================
// VERSION INFO
// ============================================================================

export const VERSION = '3.0.0';
export const CODENAME = 'Unified';
