/**
 * @fileoverview Analytics module for GeminiCLI / Hydra
 *
 * Tracks API usage, calculates costs, and provides usage statistics.
 * Supports Gemini (paid) and Ollama (free/local) providers.
 *
 * @example
 * import { trackRequest, getUsageStats, getCostEstimate } from './analytics.js';
 *
 * trackRequest({
 *   provider: 'gemini',
 *   model: 'gemini-2.5-pro',
 *   inputTokens: 1000,
 *   outputTokens: 500,
 *   duration: 2500
 * });
 *
 * const stats = getUsageStats('day');
 * const costs = getCostEstimate('month');
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { Paths, resolvePath } from './constants.js';

// ============================================================================
// Constants & Configuration
// ============================================================================

/**
 * Analytics data file path
 */
const ANALYTICS_FILE = '.hydra-analytics.json';

/**
 * Supported providers
 * @readonly
 * @enum {string}
 */
export const Providers = Object.freeze({
  GEMINI: 'gemini',
  OLLAMA: 'ollama'
});

/**
 * Pricing per 1 million tokens (USD)
 * Ollama is free (local inference)
 * @readonly
 */
export const ModelPricing = Object.freeze({
  // Gemini models (per 1M tokens)
  'gemini-2.5-pro': { input: 1.25, output: 5.0 },
  'gemini-2.5-pro-preview-05-06': { input: 1.25, output: 5.0 },
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash-thinking-exp': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-pro-latest': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-latest': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },

  // Ollama models (free - local inference)
  'ollama': { input: 0, output: 0 }
});

/**
 * Time period definitions in milliseconds
 * @readonly
 */
const TimePeriods = Object.freeze({
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  all: Infinity
});

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} RequestRecord
 * @property {string} id - Unique request ID
 * @property {number} timestamp - Unix timestamp
 * @property {string} provider - Provider name (gemini/ollama)
 * @property {string} model - Model name
 * @property {number} inputTokens - Number of input tokens
 * @property {number} outputTokens - Number of output tokens
 * @property {number} duration - Request duration in ms
 * @property {boolean} success - Whether request succeeded
 * @property {string} [error] - Error message if failed
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} AnalyticsData
 * @property {string} version - Schema version
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {RequestRecord[]} requests - All recorded requests
 */

/**
 * @typedef {Object} UsageStats
 * @property {string} period - Time period name
 * @property {number} periodStart - Period start timestamp
 * @property {number} periodEnd - Period end timestamp
 * @property {number} totalRequests - Total number of requests
 * @property {number} successfulRequests - Number of successful requests
 * @property {number} failedRequests - Number of failed requests
 * @property {number} totalInputTokens - Total input tokens
 * @property {number} totalOutputTokens - Total output tokens
 * @property {number} totalTokens - Combined tokens
 * @property {number} averageDuration - Average request duration (ms)
 * @property {number} totalDuration - Total time spent (ms)
 * @property {Object.<string, number>} requestsByProvider - Requests by provider
 * @property {Object.<string, number>} requestsByModel - Requests by model
 * @property {Object.<string, number>} tokensByProvider - Tokens by provider
 * @property {Object.<string, number>} tokensByModel - Tokens by model
 */

/**
 * @typedef {Object} CostEstimate
 * @property {string} period - Time period
 * @property {number} totalCost - Total cost in USD
 * @property {Object.<string, CostBreakdown>} byModel - Cost breakdown by model
 * @property {Object.<string, number>} byProvider - Cost by provider
 * @property {string} currency - Currency code
 */

/**
 * @typedef {Object} CostBreakdown
 * @property {number} inputCost - Cost for input tokens
 * @property {number} outputCost - Cost for output tokens
 * @property {number} totalCost - Total cost
 * @property {number} inputTokens - Input tokens used
 * @property {number} outputTokens - Output tokens used
 */

/**
 * @typedef {Object} ModelComparison
 * @property {string} model - Model name
 * @property {string} provider - Provider name
 * @property {number} requestCount - Number of requests
 * @property {number} avgInputTokens - Average input tokens
 * @property {number} avgOutputTokens - Average output tokens
 * @property {number} avgDuration - Average duration (ms)
 * @property {number} successRate - Success rate (0-1)
 * @property {number} estimatedCostPer1kRequests - Estimated cost per 1000 requests
 * @property {number} tokensPerSecond - Average tokens per second
 */

// ============================================================================
// Internal State
// ============================================================================

/** @type {AnalyticsData|null} */
let analyticsCache = null;

/** @type {boolean} */
let isDirty = false;

/** @type {NodeJS.Timeout|null} */
let saveTimer = null;

/** @type {string} */
let analyticsFilePath = '';

// ============================================================================
// File Operations
// ============================================================================

/**
 * Gets the analytics file path
 * @returns {string} Absolute path to analytics file
 */
function getAnalyticsFilePath() {
  if (!analyticsFilePath) {
    analyticsFilePath = path.join(process.cwd(), ANALYTICS_FILE);
  }
  return analyticsFilePath;
}

/**
 * Creates initial analytics data structure
 * @returns {AnalyticsData}
 */
function createInitialData() {
  const now = Date.now();
  return {
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
    requests: []
  };
}

/**
 * Loads analytics data from file
 * @returns {Promise<AnalyticsData>}
 */
async function loadAnalytics() {
  if (analyticsCache) {
    return analyticsCache;
  }

  const filePath = getAnalyticsFilePath();

  try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    analyticsCache = JSON.parse(content);

    // Validate and migrate if needed
    if (!analyticsCache.version || !Array.isArray(analyticsCache.requests)) {
      analyticsCache = createInitialData();
    }

    return analyticsCache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create new
      analyticsCache = createInitialData();
      return analyticsCache;
    }
    throw error;
  }
}

/**
 * Loads analytics data synchronously
 * @returns {AnalyticsData}
 */
function loadAnalyticsSync() {
  if (analyticsCache) {
    return analyticsCache;
  }

  const filePath = getAnalyticsFilePath();

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    analyticsCache = JSON.parse(content);

    if (!analyticsCache.version || !Array.isArray(analyticsCache.requests)) {
      analyticsCache = createInitialData();
    }

    return analyticsCache;
  } catch {
    analyticsCache = createInitialData();
    return analyticsCache;
  }
}

/**
 * Saves analytics data to file
 * @returns {Promise<void>}
 */
async function saveAnalytics() {
  if (!analyticsCache || !isDirty) {
    return;
  }

  const filePath = getAnalyticsFilePath();
  analyticsCache.updatedAt = Date.now();

  try {
    const content = JSON.stringify(analyticsCache, null, 2);
    await fsPromises.writeFile(filePath, content, 'utf8');
    isDirty = false;
  } catch (error) {
    console.error('Failed to save analytics:', error.message);
  }
}

/**
 * Saves analytics data synchronously
 */
function saveAnalyticsSync() {
  if (!analyticsCache || !isDirty) {
    return;
  }

  const filePath = getAnalyticsFilePath();
  analyticsCache.updatedAt = Date.now();

  try {
    const content = JSON.stringify(analyticsCache, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    isDirty = false;
  } catch (error) {
    console.error('Failed to save analytics sync:', error.message);
  }
}

/**
 * Schedules a debounced save operation
 */
function scheduleSave() {
  if (saveTimer) {
    return;
  }

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await saveAnalytics();
  }, 5000); // Save after 5 seconds of inactivity

  // Don't keep process alive for saving
  if (saveTimer.unref) {
    saveTimer.unref();
  }
}

// ============================================================================
// Core Analytics Functions
// ============================================================================

/**
 * Generates a unique request ID
 * @returns {string}
 */
function generateRequestId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req-${timestamp}-${random}`;
}

/**
 * Normalizes provider name
 * @param {string} provider - Provider name
 * @returns {string}
 */
function normalizeProvider(provider) {
  const normalized = provider?.toLowerCase()?.trim() || '';

  if (normalized.includes('gemini') || normalized.includes('google')) {
    return Providers.GEMINI;
  }

  if (normalized.includes('ollama') || normalized.includes('local')) {
    return Providers.OLLAMA;
  }

  return normalized || 'unknown';
}

/**
 * Gets pricing for a model
 * @param {string} model - Model name
 * @param {string} provider - Provider name
 * @returns {{ input: number, output: number }}
 */
function getModelPricing(model, provider) {
  // Normalize model name
  const normalizedModel = model?.toLowerCase()?.trim() || '';
  const normalizedProvider = normalizeProvider(provider);

  // Ollama is always free
  if (normalizedProvider === Providers.OLLAMA) {
    return { input: 0, output: 0 };
  }

  // Check for exact match
  if (ModelPricing[normalizedModel]) {
    return ModelPricing[normalizedModel];
  }

  // Check for partial match
  for (const [key, pricing] of Object.entries(ModelPricing)) {
    if (normalizedModel.includes(key) || key.includes(normalizedModel)) {
      return pricing;
    }
  }

  // Default Gemini pricing for unknown models
  if (normalizedProvider === Providers.GEMINI) {
    return { input: 0.075, output: 0.3 }; // Flash pricing as default
  }

  return { input: 0, output: 0 };
}

/**
 * Tracks an API request
 *
 * @param {Object} params - Request parameters
 * @param {string} params.provider - Provider name (gemini/ollama)
 * @param {string} params.model - Model name
 * @param {number} [params.inputTokens=0] - Number of input tokens
 * @param {number} [params.outputTokens=0] - Number of output tokens
 * @param {number} [params.tokens] - Total tokens (if separate counts not available)
 * @param {number} [params.duration=0] - Request duration in ms
 * @param {boolean} [params.success=true] - Whether request succeeded
 * @param {string} [params.error] - Error message if failed
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {RequestRecord} The created record
 */
export function trackRequest({
  provider,
  model,
  inputTokens = 0,
  outputTokens = 0,
  tokens,
  duration = 0,
  success = true,
  error,
  metadata
}) {
  const data = loadAnalyticsSync();

  // Handle combined tokens parameter
  if (tokens && !inputTokens && !outputTokens) {
    // Estimate 30% input, 70% output split
    inputTokens = Math.round(tokens * 0.3);
    outputTokens = Math.round(tokens * 0.7);
  }

  const record = {
    id: generateRequestId(),
    timestamp: Date.now(),
    provider: normalizeProvider(provider),
    model: model?.toLowerCase()?.trim() || 'unknown',
    inputTokens: Math.max(0, Math.round(inputTokens || 0)),
    outputTokens: Math.max(0, Math.round(outputTokens || 0)),
    duration: Math.max(0, Math.round(duration || 0)),
    success: Boolean(success)
  };

  if (error) {
    record.error = String(error);
  }

  if (metadata && typeof metadata === 'object') {
    record.metadata = metadata;
  }

  data.requests.push(record);
  isDirty = true;
  scheduleSave();

  return record;
}

/**
 * Gets usage statistics for a time period
 *
 * @param {'day'|'week'|'month'|'all'} [period='all'] - Time period
 * @returns {UsageStats}
 */
export function getUsageStats(period = 'all') {
  const data = loadAnalyticsSync();
  const periodMs = TimePeriods[period] || TimePeriods.all;
  const now = Date.now();
  const periodStart = periodMs === Infinity ? 0 : now - periodMs;

  // Filter requests by period
  const requests = data.requests.filter(r => r.timestamp >= periodStart);

  // Calculate statistics
  const stats = {
    period,
    periodStart,
    periodEnd: now,
    totalRequests: requests.length,
    successfulRequests: 0,
    failedRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    averageDuration: 0,
    totalDuration: 0,
    requestsByProvider: {},
    requestsByModel: {},
    tokensByProvider: {},
    tokensByModel: {}
  };

  if (requests.length === 0) {
    return stats;
  }

  for (const req of requests) {
    // Success/failure counts
    if (req.success) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }

    // Token counts
    const totalTokens = (req.inputTokens || 0) + (req.outputTokens || 0);
    stats.totalInputTokens += req.inputTokens || 0;
    stats.totalOutputTokens += req.outputTokens || 0;
    stats.totalTokens += totalTokens;

    // Duration
    stats.totalDuration += req.duration || 0;

    // By provider
    const provider = req.provider || 'unknown';
    stats.requestsByProvider[provider] = (stats.requestsByProvider[provider] || 0) + 1;
    stats.tokensByProvider[provider] = (stats.tokensByProvider[provider] || 0) + totalTokens;

    // By model
    const model = req.model || 'unknown';
    stats.requestsByModel[model] = (stats.requestsByModel[model] || 0) + 1;
    stats.tokensByModel[model] = (stats.tokensByModel[model] || 0) + totalTokens;
  }

  // Calculate average duration
  stats.averageDuration = Math.round(stats.totalDuration / requests.length);

  return stats;
}

/**
 * Gets cost estimate for a time period
 *
 * @param {'day'|'week'|'month'|'all'} [period='all'] - Time period
 * @returns {CostEstimate}
 */
export function getCostEstimate(period = 'all') {
  const data = loadAnalyticsSync();
  const periodMs = TimePeriods[period] || TimePeriods.all;
  const now = Date.now();
  const periodStart = periodMs === Infinity ? 0 : now - periodMs;

  // Filter requests by period
  const requests = data.requests.filter(r => r.timestamp >= periodStart);

  const estimate = {
    period,
    totalCost: 0,
    byModel: {},
    byProvider: {
      [Providers.GEMINI]: 0,
      [Providers.OLLAMA]: 0
    },
    currency: 'USD'
  };

  for (const req of requests) {
    const pricing = getModelPricing(req.model, req.provider);
    const inputCost = ((req.inputTokens || 0) / 1_000_000) * pricing.input;
    const outputCost = ((req.outputTokens || 0) / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    estimate.totalCost += totalCost;

    // By provider
    const provider = normalizeProvider(req.provider);
    estimate.byProvider[provider] = (estimate.byProvider[provider] || 0) + totalCost;

    // By model
    const model = req.model || 'unknown';
    if (!estimate.byModel[model]) {
      estimate.byModel[model] = {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0
      };
    }

    estimate.byModel[model].inputCost += inputCost;
    estimate.byModel[model].outputCost += outputCost;
    estimate.byModel[model].totalCost += totalCost;
    estimate.byModel[model].inputTokens += req.inputTokens || 0;
    estimate.byModel[model].outputTokens += req.outputTokens || 0;
  }

  // Round costs
  estimate.totalCost = Math.round(estimate.totalCost * 10000) / 10000;

  for (const provider of Object.keys(estimate.byProvider)) {
    estimate.byProvider[provider] = Math.round(estimate.byProvider[provider] * 10000) / 10000;
  }

  for (const model of Object.keys(estimate.byModel)) {
    const m = estimate.byModel[model];
    m.inputCost = Math.round(m.inputCost * 10000) / 10000;
    m.outputCost = Math.round(m.outputCost * 10000) / 10000;
    m.totalCost = Math.round(m.totalCost * 10000) / 10000;
  }

  return estimate;
}

/**
 * Gets comparison statistics for different models
 *
 * @param {'day'|'week'|'month'|'all'} [period='all'] - Time period
 * @returns {ModelComparison[]}
 */
export function getModelComparison(period = 'all') {
  const data = loadAnalyticsSync();
  const periodMs = TimePeriods[period] || TimePeriods.all;
  const now = Date.now();
  const periodStart = periodMs === Infinity ? 0 : now - periodMs;

  // Filter requests by period
  const requests = data.requests.filter(r => r.timestamp >= periodStart);

  // Group by model
  const modelGroups = new Map();

  for (const req of requests) {
    const model = req.model || 'unknown';

    if (!modelGroups.has(model)) {
      modelGroups.set(model, {
        model,
        provider: normalizeProvider(req.provider),
        requests: []
      });
    }

    modelGroups.get(model).requests.push(req);
  }

  // Calculate comparison stats
  const comparisons = [];

  for (const [model, group] of modelGroups) {
    const reqs = group.requests;
    const successCount = reqs.filter(r => r.success).length;

    const totalInputTokens = reqs.reduce((sum, r) => sum + (r.inputTokens || 0), 0);
    const totalOutputTokens = reqs.reduce((sum, r) => sum + (r.outputTokens || 0), 0);
    const totalDuration = reqs.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalTokens = totalInputTokens + totalOutputTokens;

    // Calculate cost per 1000 requests
    const pricing = getModelPricing(model, group.provider);
    const avgInputTokens = totalInputTokens / reqs.length;
    const avgOutputTokens = totalOutputTokens / reqs.length;
    const costPerRequest = (avgInputTokens / 1_000_000) * pricing.input +
                          (avgOutputTokens / 1_000_000) * pricing.output;

    comparisons.push({
      model,
      provider: group.provider,
      requestCount: reqs.length,
      avgInputTokens: Math.round(avgInputTokens),
      avgOutputTokens: Math.round(avgOutputTokens),
      avgDuration: Math.round(totalDuration / reqs.length),
      successRate: Math.round((successCount / reqs.length) * 1000) / 1000,
      estimatedCostPer1kRequests: Math.round(costPerRequest * 1000 * 10000) / 10000,
      tokensPerSecond: totalDuration > 0
        ? Math.round((totalTokens / (totalDuration / 1000)) * 100) / 100
        : 0
    });
  }

  // Sort by request count descending
  comparisons.sort((a, b) => b.requestCount - a.requestCount);

  return comparisons;
}

/**
 * Exports analytics data
 *
 * @param {'json'|'csv'} [format='json'] - Export format
 * @param {'day'|'week'|'month'|'all'} [period='all'] - Time period to export
 * @returns {string} Exported data as string
 */
export function exportAnalytics(format = 'json', period = 'all') {
  const data = loadAnalyticsSync();
  const periodMs = TimePeriods[period] || TimePeriods.all;
  const now = Date.now();
  const periodStart = periodMs === Infinity ? 0 : now - periodMs;

  // Filter requests by period
  const requests = data.requests.filter(r => r.timestamp >= periodStart);

  if (format === 'csv') {
    return exportToCsv(requests);
  }

  // JSON export
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    period,
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: new Date(now).toISOString(),
    totalRequests: requests.length,
    stats: getUsageStats(period),
    costs: getCostEstimate(period),
    modelComparison: getModelComparison(period),
    requests
  }, null, 2);
}

/**
 * Converts requests to CSV format
 * @param {RequestRecord[]} requests
 * @returns {string}
 */
function exportToCsv(requests) {
  const headers = [
    'id',
    'timestamp',
    'datetime',
    'provider',
    'model',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'duration',
    'success',
    'error'
  ];

  const rows = [headers.join(',')];

  for (const req of requests) {
    const row = [
      req.id,
      req.timestamp,
      new Date(req.timestamp).toISOString(),
      req.provider,
      req.model,
      req.inputTokens || 0,
      req.outputTokens || 0,
      (req.inputTokens || 0) + (req.outputTokens || 0),
      req.duration || 0,
      req.success ? 'true' : 'false',
      req.error ? `"${req.error.replace(/"/g, '""')}"` : ''
    ];

    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Exports analytics to a file
 *
 * @param {string} filePath - Output file path
 * @param {'json'|'csv'} [format='json'] - Export format
 * @param {'day'|'week'|'month'|'all'} [period='all'] - Time period
 * @returns {Promise<void>}
 */
export async function exportAnalyticsToFile(filePath, format = 'json', period = 'all') {
  const content = exportAnalytics(format, period);
  await fsPromises.writeFile(filePath, content, 'utf8');
}

// ============================================================================
// Management Functions
// ============================================================================

/**
 * Clears analytics data for a time period
 *
 * @param {'day'|'week'|'month'|'all'} [period='all'] - Period to clear
 * @returns {number} Number of records cleared
 */
export function clearAnalytics(period = 'all') {
  const data = loadAnalyticsSync();
  const periodMs = TimePeriods[period] || TimePeriods.all;
  const now = Date.now();
  const periodStart = periodMs === Infinity ? 0 : now - periodMs;

  const originalCount = data.requests.length;

  if (period === 'all') {
    data.requests = [];
  } else {
    data.requests = data.requests.filter(r => r.timestamp < periodStart);
  }

  const clearedCount = originalCount - data.requests.length;

  if (clearedCount > 0) {
    isDirty = true;
    saveAnalyticsSync();
  }

  return clearedCount;
}

/**
 * Gets raw analytics data (for debugging)
 * @returns {AnalyticsData}
 */
export function getRawAnalytics() {
  return loadAnalyticsSync();
}

/**
 * Gets summary statistics
 * @returns {Object}
 */
export function getAnalyticsSummary() {
  const dayStats = getUsageStats('day');
  const weekStats = getUsageStats('week');
  const monthStats = getUsageStats('month');
  const allStats = getUsageStats('all');

  const dayCost = getCostEstimate('day');
  const weekCost = getCostEstimate('week');
  const monthCost = getCostEstimate('month');
  const allCost = getCostEstimate('all');

  return {
    day: {
      requests: dayStats.totalRequests,
      tokens: dayStats.totalTokens,
      cost: dayCost.totalCost,
      avgDuration: dayStats.averageDuration
    },
    week: {
      requests: weekStats.totalRequests,
      tokens: weekStats.totalTokens,
      cost: weekCost.totalCost,
      avgDuration: weekStats.averageDuration
    },
    month: {
      requests: monthStats.totalRequests,
      tokens: monthStats.totalTokens,
      cost: monthCost.totalCost,
      avgDuration: monthStats.averageDuration
    },
    all: {
      requests: allStats.totalRequests,
      tokens: allStats.totalTokens,
      cost: allCost.totalCost,
      avgDuration: allStats.averageDuration
    },
    topModels: getModelComparison('month').slice(0, 5)
  };
}

/**
 * Forces an immediate save of analytics data
 * @returns {Promise<void>}
 */
export async function flushAnalytics() {
  isDirty = true;
  await saveAnalytics();
}

/**
 * Forces an immediate synchronous save
 */
export function flushAnalyticsSync() {
  isDirty = true;
  saveAnalyticsSync();
}

// ============================================================================
// Process Exit Handlers
// ============================================================================

// Save on process exit
process.on('exit', () => {
  if (isDirty) {
    saveAnalyticsSync();
  }
});

process.on('SIGINT', () => {
  if (isDirty) {
    saveAnalyticsSync();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (isDirty) {
    saveAnalyticsSync();
  }
  process.exit(0);
});

// ============================================================================
// Default Export
// ============================================================================

export default {
  trackRequest,
  getUsageStats,
  getCostEstimate,
  getModelComparison,
  exportAnalytics,
  exportAnalyticsToFile,
  clearAnalytics,
  getRawAnalytics,
  getAnalyticsSummary,
  flushAnalytics,
  flushAnalyticsSync,
  Providers,
  ModelPricing
};
