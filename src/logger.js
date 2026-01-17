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

export const createLogger = (module) => {
  const logLevel = resolveLogLevel();
  const minLevel = getLevelIndex(logLevel);
  const useJson = process.env.NODE_ENV === 'production';

  const log = (level, message, meta = {}) => {
    if (getLevelIndex(level) < minLevel) return;
    const payload = useJson
      ? formatJson(level, message, meta, module)
      : `[${module}] ${message}`;
    const output = useJson
      ? payload
      : `${payload}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}`;
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
