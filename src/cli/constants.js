/**
 * CLI Constants
 * @module cli/constants
 */

/** Default history file location */
export const HISTORY_FILE = '.hydra-history';

/** Maximum history entries */
export const MAX_HISTORY_SIZE = 1000;

/** Default prompt string */
export const DEFAULT_PROMPT = 'HYDRA> ';

/** Multiline prompt continuation */
export const MULTILINE_PROMPT = '... ';

/** Command prefix */
export const COMMAND_PREFIX = '/';

/** Key codes for input handling */
export const KEYS = {
  UP: '\x1b[A',
  DOWN: '\x1b[B',
  RIGHT: '\x1b[C',
  LEFT: '\x1b[D',
  ENTER: '\r',
  TAB: '\t',
  BACKSPACE: '\x7f',
  DELETE: '\x1b[3~',
  CTRL_C: '\x03',
  CTRL_D: '\x04',
  CTRL_L: '\x0c',
  CTRL_U: '\x15',
  CTRL_W: '\x17',
  ESCAPE: '\x1b',
  HOME: '\x1b[H',
  END: '\x1b[F'
};

/** ANSI escape sequences */
export const ANSI = {
  CLEAR_LINE: '\x1b[2K',
  CLEAR_SCREEN: '\x1b[2J',
  CURSOR_HOME: '\x1b[H',
  CURSOR_SAVE: '\x1b[s',
  CURSOR_RESTORE: '\x1b[u',
  CURSOR_HIDE: '\x1b[?25l',
  CURSOR_SHOW: '\x1b[?25h',
  MOVE_UP: (n = 1) => `\x1b[${n}A`,
  MOVE_DOWN: (n = 1) => `\x1b[${n}B`,
  MOVE_RIGHT: (n = 1) => `\x1b[${n}C`,
  MOVE_LEFT: (n = 1) => `\x1b[${n}D`,
  MOVE_TO: (row, col) => `\x1b[${row};${col}H`
};

/** Default terminal width */
export const DEFAULT_TERMINAL_WIDTH = 80;

/** Spinner frame rate (ms) */
export const SPINNER_INTERVAL = 80;

/** Box drawing characters (Unicode) */
export const BOX_UNICODE = {
  topLeft: '\u250c',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2500',
  vertical: '\u2502',
  teeRight: '\u251c',
  teeLeft: '\u2524',
  cross: '\u253c',
  doubleTopLeft: '\u2554',
  doubleTopRight: '\u2557',
  doubleBottomLeft: '\u255a',
  doubleBottomRight: '\u255d',
  doubleHorizontal: '\u2550',
  doubleVertical: '\u2551'
};

/** Box drawing characters (ASCII fallback) */
export const BOX_ASCII = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  teeRight: '+',
  teeLeft: '+',
  cross: '+',
  doubleTopLeft: '+',
  doubleTopRight: '+',
  doubleBottomLeft: '+',
  doubleBottomRight: '+',
  doubleHorizontal: '=',
  doubleVertical: '|'
};
