/**
 * ClaudeHydra - Claude API Client
 * Provider for Anthropic Claude (Opus/Sonnet) models
 *
 * @module hydra/providers/claude-client
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude model configurations
 */
export const CLAUDE_MODELS = {
  // Commander tier - highest capability
  'claude-opus': {
    id: 'claude-sonnet-4-20250514',  // Latest Opus
    displayName: 'Claude Opus',
    tier: 'commander',
    maxTokens: 8192,
    costPerToken: 0.00003  // $30 per 1M tokens
  },
  // Coordinator tier - balanced
  'claude-sonnet': {
    id: 'claude-sonnet-4-20250514',  // Latest Sonnet
    displayName: 'Claude Sonnet',
    tier: 'coordinator',
    maxTokens: 8192,
    costPerToken: 0.000015  // $15 per 1M tokens
  }
};

/**
 * Default model aliases
 */
export const MODEL_ALIASES = {
  opus: 'claude-opus',
  sonnet: 'claude-sonnet',
  commander: 'claude-opus',
  coordinator: 'claude-sonnet'
};

// Singleton client instance
let anthropicClient = null;

/**
 * Initialize the Anthropic client
 * @returns {Anthropic} Anthropic client instance
 */
function getClient() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Resolve model name to actual model ID
 * @param {string} model - Model name or alias
 * @returns {string} Actual model ID
 */
export function resolveModel(model) {
  // Check aliases first
  if (MODEL_ALIASES[model]) {
    model = MODEL_ALIASES[model];
  }

  // Check if it's a known model
  if (CLAUDE_MODELS[model]) {
    return CLAUDE_MODELS[model].id;
  }

  // Return as-is (might be a direct model ID)
  return model;
}

/**
 * Get model configuration
 * @param {string} model - Model name
 * @returns {Object|null} Model config or null
 */
export function getModelConfig(model) {
  if (MODEL_ALIASES[model]) {
    model = MODEL_ALIASES[model];
  }
  return CLAUDE_MODELS[model] || null;
}

/**
 * Generate completion using Claude API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @param {string} [options.model='claude-sonnet'] - Model to use
 * @param {string} [options.system] - System prompt
 * @param {number} [options.maxTokens=4096] - Max tokens to generate
 * @param {number} [options.temperature=0.7] - Sampling temperature
 * @param {number} [options.timeout=60000] - Timeout in ms
 * @returns {Promise<Object>} Generation result
 */
export async function generate(prompt, options = {}) {
  const {
    model = 'claude-sonnet',
    system,
    maxTokens = 4096,
    temperature = 0.7,
    timeout = 60000
  } = options;

  const startTime = Date.now();
  const modelId = resolveModel(model);
  const modelConfig = getModelConfig(model);

  try {
    const client = getClient();

    const requestParams = {
      model: modelId,
      max_tokens: Math.min(maxTokens, modelConfig?.maxTokens || 8192),
      temperature,
      messages: [
        { role: 'user', content: prompt }
      ]
    };

    // Add system prompt if provided
    if (system) {
      requestParams.system = system;
    }

    // Create message with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await client.messages.create(requestParams, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      success: true,
      content,
      model: modelId,
      duration_ms: duration,
      tokens: response.usage?.output_tokens || 0,
      inputTokens: response.usage?.input_tokens || 0,
      stopReason: response.stop_reason
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Handle specific error types
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout',
        model: modelId,
        duration_ms: duration
      };
    }

    if (error.status === 401) {
      return {
        success: false,
        error: 'Invalid API key',
        model: modelId,
        duration_ms: duration
      };
    }

    if (error.status === 429) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        model: modelId,
        duration_ms: duration
      };
    }

    return {
      success: false,
      error: error.message || 'Unknown error',
      model: modelId,
      duration_ms: duration
    };
  }
}

/**
 * Stream completion using Claude API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @yields {string} Content chunks
 */
export async function* streamGenerate(prompt, options = {}) {
  const {
    model = 'claude-sonnet',
    system,
    maxTokens = 4096,
    temperature = 0.7
  } = options;

  const modelId = resolveModel(model);
  const modelConfig = getModelConfig(model);

  try {
    const client = getClient();

    const requestParams = {
      model: modelId,
      max_tokens: Math.min(maxTokens, modelConfig?.maxTokens || 8192),
      temperature,
      messages: [
        { role: 'user', content: prompt }
      ],
      stream: true
    };

    if (system) {
      requestParams.system = system;
    }

    const stream = await client.messages.stream(requestParams);

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        yield event.delta.text;
      }
    }
  } catch (error) {
    throw new Error(`Stream error: ${error.message}`);
  }
}

/**
 * Perform health check on Claude API
 * @returns {Promise<Object>} Health check result
 */
export async function healthCheck() {
  const startTime = Date.now();

  try {
    // Check if API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        available: false,
        error: 'ANTHROPIC_API_KEY not configured'
      };
    }

    // Try a minimal API call
    const client = getClient();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }]
    });

    const latency = Date.now() - startTime;

    return {
      available: true,
      provider: 'claude',
      models: Object.keys(CLAUDE_MODELS),
      latency_ms: latency,
      checkedAt: new Date()
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      latency_ms: Date.now() - startTime
    };
  }
}

/**
 * Get available Claude models
 * @returns {string[]} List of model names
 */
export function getAvailableModels() {
  return Object.keys(CLAUDE_MODELS);
}

/**
 * Select best model for tier
 * @param {string} tier - Model tier (commander|coordinator|executor)
 * @returns {string} Model name
 */
export function selectModel(tier) {
  switch (tier) {
    case 'commander':
      return 'claude-opus';
    case 'coordinator':
      return 'claude-sonnet';
    default:
      return 'claude-sonnet';
  }
}

// Default export
export default {
  CLAUDE_MODELS,
  MODEL_ALIASES,
  resolveModel,
  getModelConfig,
  generate,
  streamGenerate,
  healthCheck,
  getAvailableModels,
  selectModel
};
