/**
 * Jules CLI Logger
 * Structured logging utility
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
  const levelColors = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m'  // red
  };
  const reset = '\x1b[0m';
  const color = levelColors[level] || '';
  const prefix = `${color}[${level.toUpperCase()}]${reset} [${module}]`;
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${prefix} ${message}${metaStr}`;
};

export const createLogger = (module) => {
  const logLevel = resolveLogLevel();
  const minLevel = getLevelIndex(logLevel);
  const useJson = process.env.NODE_ENV === 'production';

  const log = (level, message, meta = {}) => {
    if (getLevelIndex(level) < minLevel) return;

    const output = useJson
      ? formatJson(level, message, meta, module)
      : formatConsole(level, message, meta, module);

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
