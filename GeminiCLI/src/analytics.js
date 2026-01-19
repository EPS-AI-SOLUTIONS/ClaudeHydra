/**
 * HYDRA Analytics Module
 *
 * Provides comprehensive analytics tracking for AI model usage:
 * - Request tracking with provider, model, tokens, and duration
 * - Usage statistics by time period (day/week/month)
 * - Cost estimation for various providers
 * - Model performance comparison
 * - Export capabilities (JSON/CSV)
 *
 * Data stored in .hydra-analytics.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYTICS_FILE = join(__dirname, '..', '.hydra-analytics.json');

// Pricing per 1M tokens (USD) - updated for 2025/2026
const PROVIDER_PRICING = {
  anthropic: {
    'claude-opus-4': { input: 15.0, output: 75.0 },
    'claude-opus-4-5': { input: 15.0, output: 75.0 },
    'claude-sonnet-4': { input: 3.0, output: 15.0 },
    'claude-haiku-3.5': { input: 0.8, output: 4.0 },
    default: { input: 3.0, output: 15.0 }
  },
  google: {
    'gemini-2.5-pro': { input: 1.25, output: 5.0 },
    'gemini-2.0-flash': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5.0 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    default: { input: 0.5, output: 1.5 }
  },
  openai: {
    'gpt-5-codex': { input: 10.0, output: 30.0 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    default: { input: 2.5, output: 10.0 }
  },
  deepseek: {
    'deepseek-r1': { input: 0.55, output: 2.19 },
    'deepseek-v3': { input: 0.27, output: 1.1 },
    'deepseek-coder': { input: 0.14, output: 0.28 },
    default: { input: 0.27, output: 1.1 }
  },
  xai: {
    'grok-3': { input: 5.0, output: 15.0 },
    'grok-2': { input: 2.0, output: 10.0 },
    default: { input: 5.0, output: 15.0 }
  },
  ollama: {
    default: { input: 0, output: 0 } // Local models - free
  }
};

/**
 * Initialize analytics data structure
 */
function initializeAnalytics() {
  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    requests: [],
    summary: {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalDurationMs: 0,
      byProvider: {},
      byModel: {}
    }
  };
}

/**
 * Load analytics data from file
 */
function loadAnalytics() {
  try {
    if (!existsSync(ANALYTICS_FILE)) {
      const initial = initializeAnalytics();
      saveAnalytics(initial);
      return initial;
    }

    const data = JSON.parse(readFileSync(ANALYTICS_FILE, 'utf-8'));
    return data;
  } catch (error) {
    console.error('[Analytics] Error loading analytics:', error.message);
    return initializeAnalytics();
  }
}

/**
 * Save analytics data to file
 */
function saveAnalytics(data) {
  try {
    const dir = dirname(ANALYTICS_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('[Analytics] Error saving analytics:', error.message);
    return false;
  }
}

/**
 * Track a request
 * @param {string} provider - Provider name (anthropic, google, openai, deepseek, xai, ollama)
 * @param {string} model - Model identifier
 * @param {number} tokens - Total tokens used (input + output) or object with {input, output}
 * @param {number} duration - Request duration in milliseconds
 * @returns {object} Tracking result
 */
export function trackRequest(provider, model, tokens, duration) {
  const analytics = loadAnalytics();
  const timestamp = new Date().toISOString();

  // Parse tokens
  let inputTokens = 0;
  let outputTokens = 0;

  if (typeof tokens === 'object' && tokens !== null) {
    inputTokens = tokens.input || tokens.inputTokens || 0;
    outputTokens = tokens.output || tokens.outputTokens || 0;
  } else {
    // If single number provided, estimate split (70% input, 30% output typical)
    inputTokens = Math.round(tokens * 0.7);
    outputTokens = Math.round(tokens * 0.3);
  }

  const totalTokens = inputTokens + outputTokens;

  // Calculate estimated cost
  const cost = getCostEstimate(provider, inputTokens, outputTokens);

  // Create request record
  const request = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp,
    provider: provider.toLowerCase(),
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs: duration,
    estimatedCostUsd: cost.totalCost
  };

  // Add to requests array (keep last 10000 entries)
  analytics.requests.push(request);
  if (analytics.requests.length > 10000) {
    analytics.requests = analytics.requests.slice(-10000);
  }

  // Update summary
  analytics.summary.totalRequests++;
  analytics.summary.totalInputTokens += inputTokens;
  analytics.summary.totalOutputTokens += outputTokens;
  analytics.summary.totalDurationMs += duration;

  // Update by provider
  const providerKey = provider.toLowerCase();
  if (!analytics.summary.byProvider[providerKey]) {
    analytics.summary.byProvider[providerKey] = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalDurationMs: 0,
      estimatedCostUsd: 0
    };
  }
  analytics.summary.byProvider[providerKey].requests++;
  analytics.summary.byProvider[providerKey].inputTokens += inputTokens;
  analytics.summary.byProvider[providerKey].outputTokens += outputTokens;
  analytics.summary.byProvider[providerKey].totalDurationMs += duration;
  analytics.summary.byProvider[providerKey].estimatedCostUsd += cost.totalCost;

  // Update by model
  if (!analytics.summary.byModel[model]) {
    analytics.summary.byModel[model] = {
      provider: providerKey,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      estimatedCostUsd: 0
    };
  }
  analytics.summary.byModel[model].requests++;
  analytics.summary.byModel[model].inputTokens += inputTokens;
  analytics.summary.byModel[model].outputTokens += outputTokens;
  analytics.summary.byModel[model].totalDurationMs += duration;
  analytics.summary.byModel[model].avgDurationMs = Math.round(
    analytics.summary.byModel[model].totalDurationMs / analytics.summary.byModel[model].requests
  );
  analytics.summary.byModel[model].estimatedCostUsd += cost.totalCost;

  // Save updated analytics
  saveAnalytics(analytics);

  return {
    success: true,
    requestId: request.id,
    tracked: {
      provider: providerKey,
      model,
      tokens: totalTokens,
      durationMs: duration,
      estimatedCostUsd: cost.totalCost
    }
  };
}

/**
 * Get usage statistics for a time period
 * @param {string} period - Time period: 'day', 'week', 'month', 'all'
 * @returns {object} Usage statistics
 */
export function getUsageStats(period = 'day') {
  const analytics = loadAnalytics();
  const now = new Date();

  // Calculate cutoff time
  let cutoff;
  switch (period.toLowerCase()) {
    case 'day':
      cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
    default:
      cutoff = new Date(0);
  }

  // Filter requests by time period
  const filteredRequests = analytics.requests.filter(
    req => new Date(req.timestamp) >= cutoff
  );

  // Calculate statistics
  const stats = {
    period,
    periodStart: cutoff.toISOString(),
    periodEnd: now.toISOString(),
    totalRequests: filteredRequests.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    estimatedCostUsd: 0,
    byProvider: {},
    byModel: {},
    byHour: {},
    peakHour: null
  };

  // Process each request
  for (const req of filteredRequests) {
    stats.totalInputTokens += req.inputTokens || 0;
    stats.totalOutputTokens += req.outputTokens || 0;
    stats.totalTokens += req.totalTokens || 0;
    stats.totalDurationMs += req.durationMs || 0;
    stats.estimatedCostUsd += req.estimatedCostUsd || 0;

    // By provider
    if (!stats.byProvider[req.provider]) {
      stats.byProvider[req.provider] = {
        requests: 0,
        tokens: 0,
        costUsd: 0
      };
    }
    stats.byProvider[req.provider].requests++;
    stats.byProvider[req.provider].tokens += req.totalTokens || 0;
    stats.byProvider[req.provider].costUsd += req.estimatedCostUsd || 0;

    // By model
    if (!stats.byModel[req.model]) {
      stats.byModel[req.model] = {
        requests: 0,
        tokens: 0,
        avgDurationMs: 0,
        costUsd: 0
      };
    }
    stats.byModel[req.model].requests++;
    stats.byModel[req.model].tokens += req.totalTokens || 0;
    stats.byModel[req.model].costUsd += req.estimatedCostUsd || 0;

    // By hour (for pattern analysis)
    const hour = new Date(req.timestamp).getHours();
    stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
  }

  // Calculate averages
  if (stats.totalRequests > 0) {
    stats.avgDurationMs = Math.round(stats.totalDurationMs / stats.totalRequests);

    // Calculate avg duration per model
    for (const model of Object.keys(stats.byModel)) {
      const modelData = filteredRequests.filter(r => r.model === model);
      const totalDuration = modelData.reduce((sum, r) => sum + (r.durationMs || 0), 0);
      stats.byModel[model].avgDurationMs = Math.round(totalDuration / modelData.length);
    }
  }

  // Find peak hour
  let maxRequests = 0;
  for (const [hour, count] of Object.entries(stats.byHour)) {
    if (count > maxRequests) {
      maxRequests = count;
      stats.peakHour = { hour: parseInt(hour), requests: count };
    }
  }

  // Round costs
  stats.estimatedCostUsd = Math.round(stats.estimatedCostUsd * 10000) / 10000;
  for (const provider of Object.keys(stats.byProvider)) {
    stats.byProvider[provider].costUsd =
      Math.round(stats.byProvider[provider].costUsd * 10000) / 10000;
  }
  for (const model of Object.keys(stats.byModel)) {
    stats.byModel[model].costUsd =
      Math.round(stats.byModel[model].costUsd * 10000) / 10000;
  }

  return stats;
}

/**
 * Estimate cost for a request
 * @param {string} provider - Provider name
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {object} Cost estimate
 */
export function getCostEstimate(provider, inputTokens, outputTokens) {
  const providerKey = provider.toLowerCase();
  const pricing = PROVIDER_PRICING[providerKey] || PROVIDER_PRICING.ollama;

  // Try to find specific model pricing or use default
  const modelPricing = pricing.default;

  // Calculate costs (pricing is per 1M tokens)
  const inputCost = (inputTokens / 1000000) * modelPricing.input;
  const outputCost = (outputTokens / 1000000) * modelPricing.output;
  const totalCost = inputCost + outputCost;

  return {
    provider: providerKey,
    inputTokens,
    outputTokens,
    pricing: {
      inputPer1M: modelPricing.input,
      outputPer1M: modelPricing.output
    },
    inputCostUsd: Math.round(inputCost * 1000000) / 1000000,
    outputCostUsd: Math.round(outputCost * 1000000) / 1000000,
    totalCost: Math.round(totalCost * 1000000) / 1000000
  };
}

/**
 * Get cost estimate for a specific model
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {object} Cost estimate
 */
export function getCostEstimateForModel(provider, model, inputTokens, outputTokens) {
  const providerKey = provider.toLowerCase();
  const providerPricing = PROVIDER_PRICING[providerKey];

  if (!providerPricing) {
    return getCostEstimate(provider, inputTokens, outputTokens);
  }

  // Find matching model pricing
  let modelPricing = providerPricing.default;
  for (const [modelKey, pricing] of Object.entries(providerPricing)) {
    if (modelKey !== 'default' && model.toLowerCase().includes(modelKey.toLowerCase())) {
      modelPricing = pricing;
      break;
    }
  }

  const inputCost = (inputTokens / 1000000) * modelPricing.input;
  const outputCost = (outputTokens / 1000000) * modelPricing.output;
  const totalCost = inputCost + outputCost;

  return {
    provider: providerKey,
    model,
    inputTokens,
    outputTokens,
    pricing: {
      inputPer1M: modelPricing.input,
      outputPer1M: modelPricing.output
    },
    inputCostUsd: Math.round(inputCost * 1000000) / 1000000,
    outputCostUsd: Math.round(outputCost * 1000000) / 1000000,
    totalCost: Math.round(totalCost * 1000000) / 1000000
  };
}

/**
 * Compare model performance
 * @param {string[]} models - Array of model names to compare (optional, compares all if empty)
 * @returns {object} Model comparison data
 */
export function getModelComparison(models = []) {
  const analytics = loadAnalytics();
  const modelData = analytics.summary.byModel;

  // Filter models if specified
  let modelsToCompare = Object.keys(modelData);
  if (models && models.length > 0) {
    modelsToCompare = modelsToCompare.filter(m =>
      models.some(target => m.toLowerCase().includes(target.toLowerCase()))
    );
  }

  if (modelsToCompare.length === 0) {
    return {
      success: false,
      error: 'No matching models found in analytics data',
      availableModels: Object.keys(modelData)
    };
  }

  // Build comparison data
  const comparison = {
    models: [],
    rankings: {
      bySpeed: [],
      byCost: [],
      byUsage: [],
      byEfficiency: []
    },
    recommendations: {}
  };

  for (const model of modelsToCompare) {
    const data = modelData[model];
    const totalTokens = data.inputTokens + data.outputTokens;
    const tokensPerSecond = data.totalDurationMs > 0
      ? Math.round((totalTokens / (data.totalDurationMs / 1000)) * 100) / 100
      : 0;
    const costPer1KTokens = totalTokens > 0
      ? Math.round((data.estimatedCostUsd / (totalTokens / 1000)) * 10000) / 10000
      : 0;

    comparison.models.push({
      name: model,
      provider: data.provider,
      requests: data.requests,
      totalTokens,
      avgDurationMs: data.avgDurationMs,
      tokensPerSecond,
      totalCostUsd: Math.round(data.estimatedCostUsd * 10000) / 10000,
      costPer1KTokens,
      efficiency: tokensPerSecond > 0 ? Math.round((tokensPerSecond / (costPer1KTokens + 0.001)) * 100) / 100 : 0
    });
  }

  // Sort for rankings
  comparison.rankings.bySpeed = [...comparison.models]
    .sort((a, b) => b.tokensPerSecond - a.tokensPerSecond)
    .map(m => ({ model: m.name, tokensPerSecond: m.tokensPerSecond }));

  comparison.rankings.byCost = [...comparison.models]
    .sort((a, b) => a.costPer1KTokens - b.costPer1KTokens)
    .map(m => ({ model: m.name, costPer1KTokens: m.costPer1KTokens }));

  comparison.rankings.byUsage = [...comparison.models]
    .sort((a, b) => b.requests - a.requests)
    .map(m => ({ model: m.name, requests: m.requests }));

  comparison.rankings.byEfficiency = [...comparison.models]
    .sort((a, b) => b.efficiency - a.efficiency)
    .map(m => ({ model: m.name, efficiency: m.efficiency }));

  // Generate recommendations
  if (comparison.models.length > 0) {
    comparison.recommendations = {
      fastest: comparison.rankings.bySpeed[0]?.model || null,
      cheapest: comparison.rankings.byCost[0]?.model || null,
      mostUsed: comparison.rankings.byUsage[0]?.model || null,
      mostEfficient: comparison.rankings.byEfficiency[0]?.model || null
    };
  }

  return {
    success: true,
    comparedModels: modelsToCompare.length,
    comparison
  };
}

/**
 * Export analytics data
 * @param {string} format - Export format: 'json' or 'csv'
 * @returns {object} Export result with data string
 */
export function exportAnalytics(format = 'json') {
  const analytics = loadAnalytics();

  if (format.toLowerCase() === 'csv') {
    // Export as CSV
    const headers = [
      'id',
      'timestamp',
      'provider',
      'model',
      'inputTokens',
      'outputTokens',
      'totalTokens',
      'durationMs',
      'estimatedCostUsd'
    ];

    const rows = analytics.requests.map(req => [
      req.id,
      req.timestamp,
      req.provider,
      req.model,
      req.inputTokens,
      req.outputTokens,
      req.totalTokens,
      req.durationMs,
      req.estimatedCostUsd
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape commas and quotes in strings
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(','))
    ].join('\n');

    return {
      success: true,
      format: 'csv',
      filename: `hydra-analytics-${new Date().toISOString().split('T')[0]}.csv`,
      data: csv,
      records: analytics.requests.length
    };
  }

  // Default: Export as JSON
  const exportData = {
    exportedAt: new Date().toISOString(),
    version: analytics.version,
    summary: analytics.summary,
    requests: analytics.requests
  };

  return {
    success: true,
    format: 'json',
    filename: `hydra-analytics-${new Date().toISOString().split('T')[0]}.json`,
    data: JSON.stringify(exportData, null, 2),
    records: analytics.requests.length
  };
}

/**
 * Get raw analytics data
 * @returns {object} Raw analytics data
 */
export function getRawAnalytics() {
  return loadAnalytics();
}

/**
 * Clear all analytics data
 * @returns {object} Result
 */
export function clearAnalytics() {
  const initial = initializeAnalytics();
  const success = saveAnalytics(initial);

  return {
    success,
    message: success ? 'Analytics data cleared' : 'Failed to clear analytics data'
  };
}

/**
 * Get provider pricing information
 * @param {string} provider - Optional provider name
 * @returns {object} Pricing information
 */
export function getPricing(provider = null) {
  if (provider) {
    const providerKey = provider.toLowerCase();
    const pricing = PROVIDER_PRICING[providerKey];

    if (!pricing) {
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
        availableProviders: Object.keys(PROVIDER_PRICING)
      };
    }

    return {
      success: true,
      provider: providerKey,
      pricing
    };
  }

  return {
    success: true,
    pricing: PROVIDER_PRICING
  };
}

// Export default object for convenience
export default {
  trackRequest,
  getUsageStats,
  getCostEstimate,
  getCostEstimateForModel,
  getModelComparison,
  exportAnalytics,
  getRawAnalytics,
  clearAnalytics,
  getPricing
};
