/**
 * CodexCLI Logger
 * Structured logging utility for HYDRA CodexCLI
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

const formatConsole = (level, message, meta, module) => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${prefix} ${message}${metaStr}`;
};

/**
 * Create a logger instance for a specific module
 * @param {string} module - Module name for logging context
 * @returns {Object} Logger instance with debug, info, warn, error methods
 */
export const createLogger = (module) => {
  const logLevel = resolveLogLevel();
  const minLevel = getLevelIndex(logLevel);
  const useJson = process.env.NODE_ENV === 'production';

  const log = (level, message, meta = {}) => {
    if (getLevelIndex(level) < minLevel) return;

    const payload = useJson
      ? formatJson(level, message, meta, module)
      : formatConsole(level, message, meta, module);

    switch (level) {
      case 'error':
        console.error(payload);
        break;
      case 'warn':
        console.warn(payload);
        break;
      case 'debug':
        console.debug(payload);
        break;
      default:
        console.log(payload);
    }
  };

  return {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),

    /**
     * Log with timing information
     */
    timed: (message, startTime, meta = {}) => {
      const duration = Date.now() - startTime;
      log('info', message, { ...meta, durationMs: duration });
    },

    /**
     * Create a child logger with additional context
     */
    child: (childModule) => createLogger(`${module}:${childModule}`)
  };
};

/**
 * Default logger instance
 */
export const logger = createLogger('codex');
