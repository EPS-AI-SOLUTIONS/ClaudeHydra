/**
 * HYDRA Logger with Correlation ID Support
 * BLOK 8: Debugging - Lambert
 */

import { randomBytes } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

const LEVELS = ['debug', 'info', 'warn', 'error'];

// AsyncLocalStorage for request-scoped correlation IDs
const correlationStorage = new AsyncLocalStorage();

const getLevelIndex = (level) => {
  const index = LEVELS.indexOf(level);
  return index === -1 ? LEVELS.indexOf('info') : index;
};

const resolveLogLevel = () => process.env.LOG_LEVEL || 'info';

/**
 * Generate a new correlation ID
 */
export const generateCorrelationId = () => {
  return `hydra-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
};

/**
 * Get current correlation ID from context
 */
export const getCorrelationId = () => {
  return correlationStorage.getStore()?.correlationId || null;
};

/**
 * Run a function with a correlation ID context
 */
export const withCorrelationId = (correlationId, fn) => {
  return correlationStorage.run({ correlationId }, fn);
};

/**
 * Middleware for Express/Koa to inject correlation ID
 */
export const correlationMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
  res.setHeader('x-correlation-id', correlationId);
  correlationStorage.run({ correlationId }, () => next());
};

const formatJson = (level, message, meta, module, correlationId) => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    module,
    correlationId,
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
    const correlationId = getCorrelationId();

    const payload = useJson
      ? formatJson(level, message, meta, module, correlationId)
      : correlationId
        ? `[${module}] [${correlationId}] ${message}`
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
    error: (message, meta) => log('error', message, meta),
    // New method: log with explicit correlation ID
    withCorrelation: (correlationId, level, message, meta) => {
      withCorrelationId(correlationId, () => log(level, message, meta));
    }
  };
};
