import 'dotenv/config';

const parseNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return value === 'true';
};

const yoloMode = parseBoolean(process.env.HYDRA_YOLO, false);
const defaultQueueMaxConcurrent = yoloMode ? 10 : 5;
const defaultQueueMaxRetries = yoloMode ? 1 : 3;
const defaultQueueTimeoutMs = yoloMode ? 15000 : 60000;

export const CONFIG = {
  API_VERSION: process.env.API_VERSION || 'v1',
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'llama3.2:3b',
  FAST_MODEL: process.env.FAST_MODEL || 'llama3.2:1b',
  CODER_MODEL: process.env.CODER_MODEL || 'qwen2.5-coder:1.5b',
  CACHE_DIR: process.env.CACHE_DIR || './cache',
  CACHE_TTL_MS: parseNumber(process.env.CACHE_TTL, 3600) * 1000,
  CACHE_ENABLED: parseBoolean(process.env.CACHE_ENABLED, true),
  CACHE_ENCRYPTION_KEY: process.env.CACHE_ENCRYPTION_KEY || '',
  QUEUE_MAX_CONCURRENT: parseNumber(
    process.env.QUEUE_MAX_CONCURRENT,
    defaultQueueMaxConcurrent
  ),
  QUEUE_MAX_RETRIES: parseNumber(
    process.env.QUEUE_MAX_RETRIES,
    defaultQueueMaxRetries
  ),
  QUEUE_RETRY_DELAY_BASE: parseNumber(process.env.QUEUE_RETRY_DELAY_BASE, 1000),
  QUEUE_TIMEOUT_MS: parseNumber(
    process.env.QUEUE_TIMEOUT_MS,
    defaultQueueTimeoutMs
  ),
  QUEUE_RATE_LIMIT_TOKENS: parseNumber(process.env.QUEUE_RATE_LIMIT_TOKENS, 10),
  QUEUE_RATE_LIMIT_REFILL: parseNumber(process.env.QUEUE_RATE_LIMIT_REFILL, 2),
  MODEL_CACHE_TTL_MS: parseNumber(process.env.MODEL_CACHE_TTL_MS, 300000),
  HEALTH_CHECK_TIMEOUT_MS: parseNumber(
    process.env.HEALTH_CHECK_TIMEOUT_MS,
    5000
  ),
  YOLO_MODE: yoloMode,
  RISK_BLOCKING: parseBoolean(process.env.HYDRA_RISK_BLOCKING, !yoloMode)
};
