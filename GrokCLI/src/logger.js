/**
 * GrokCLI Logger
 * Structured logging with JSON output for production
 */

const LEVELS = ['debug', 'info', 'warn', 'error'];

const getLevelIndex = (level) => {
  const index = LEVELS.indexOf(level);
  return index === -1 ? LEVELS.indexOf('info') : index;
};

const resolveLogLevel = () => process.env.LOG_LEVEL || 'info';

const formatJson = (level, message, meta, module) => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...meta
  });
};

const getColorCode = (level) => {
  switch (level) {
    case 'debug':
      return '\x1b[36m'; // Cyan
    case 'info':
      return '\x1b[32m'; // Green
    case 'warn':
      return '\x1b[33m'; // Yellow
    case 'error':
      return '\x1b[31m'; // Red
    default:
      return '\x1b[0m'; // Reset
  }
};

const resetCode = '\x1b[0m';

/**
 * Create a logger instance for a specific module
 * @param {string} module - Module name for log identification
 * @returns {Object} Logger instance with debug, info, warn, error methods
 */
export const createLogger = (module) => {
  const logLevel = resolveLogLevel();
  const minLevel = getLevelIndex(logLevel);
  const useJson = process.env.NODE_ENV === 'production';
  const useColors = process.env.NO_COLOR !== '1' && !useJson;

  const log = (level, message, meta = {}) => {
    if (getLevelIndex(level) < minLevel) return;

    if (useJson) {
      const payload = formatJson(level, message, meta, module);
      switch (level) {
        case 'error':
          console.error(payload);
          break;
        case 'warn':
          console.warn(payload);
          break;
        default:
          console.log(payload);
      }
      return;
    }

    // Human-readable format
    const timestamp = new Date().toISOString().slice(11, 23);
    const levelStr = level.toUpperCase().padEnd(5);
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';

    let output;
    if (useColors) {
      const color = getColorCode(level);
      output = `${color}[${timestamp}] [${levelStr}]${resetCode} [${module}] ${message}${metaStr}`;
    } else {
      output = `[${timestamp}] [${levelStr}] [${module}] ${message}${metaStr}`;
    }

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  };

  return {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta)
  };
};

export default createLogger;
