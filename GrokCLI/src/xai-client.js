/**
 * xAI Grok API Client
 *
 * Client for interacting with xAI's Grok API
 * Supports: generate, chat, listModels, checkHealth
 *
 * API Endpoint: https://api.x.ai/v1
 * Documentation: https://docs.x.ai
 */

import { CONFIG } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('xai-client');

/**
 * Make a request to the xAI API
 * @param {string} endpoint - API endpoint (e.g., '/chat/completions')
 * @param {Object} options - Request options
 * @returns {Promise<Object>} API response
 */
async function makeRequest(endpoint, options = {}) {
  const { method = 'POST', body, timeout = CONFIG.REQUEST_TIMEOUT_MS } = options;

  if (!CONFIG.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const url = `${CONFIG.API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.XAI_API_KEY}`,
        'User-Agent': `${CONFIG.SERVER_NAME}/${CONFIG.SERVER_VERSION}`
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      throw new Error(
        `xAI API error: ${response.status} ${response.statusText} - ${errorData.message || errorData.error?.message || errorText}`
      );
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Make a request with retries and exponential backoff
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<Object>} API response
 */
async function makeRequestWithRetry(endpoint, options = {}) {
  let lastError;
  const maxRetries = options.retries ?? CONFIG.MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await makeRequest(endpoint, options);
    } catch (error) {
      lastError = error;

      // Don't retry on authentication or validation errors
      if (error.message.includes('401') || error.message.includes('400')) {
        throw error;
      }

      // Don't retry on timeout if specifically requested
      if (error.message.includes('timeout') && options.noRetryOnTimeout) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(
          CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt),
          10000
        );
        logger.warn('Request failed, retrying', {
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: error.message
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Generate text using Grok (non-chat completion)
 * Uses chat completions endpoint with a single user message
 *
 * @param {string} prompt - The prompt to generate from
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation result
 */
export async function generate(prompt, options = {}) {
  const {
    model = CONFIG.DEFAULT_MODEL,
    temperature = CONFIG.DEFAULT_TEMPERATURE,
    maxTokens = CONFIG.DEFAULT_MAX_TOKENS,
    topP = 1,
    frequencyPenalty = 0,
    presencePenalty = 0,
    stop = null,
    systemPrompt = null
  } = options;

  const messages = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: prompt });

  const startTime = Date.now();

  const response = await makeRequestWithRetry('/chat/completions', {
    body: {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stop,
      stream: false
    }
  });

  const duration = Date.now() - startTime;
  const choice = response.choices?.[0];

  logger.info('Generation completed', {
    model,
    duration,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens
  });

  return {
    response: choice?.message?.content || '',
    model: response.model,
    finishReason: choice?.finish_reason,
    usage: response.usage,
    duration
  };
}

/**
 * Chat with Grok - multi-turn conversation
 *
 * @param {Array} messages - Array of message objects [{role, content}]
 * @param {Object} options - Chat options
 * @returns {Promise<Object>} Chat result
 */
export async function chat(messages, options = {}) {
  const {
    model = CONFIG.DEFAULT_MODEL,
    temperature = CONFIG.DEFAULT_TEMPERATURE,
    maxTokens = CONFIG.DEFAULT_MAX_TOKENS,
    topP = 1,
    frequencyPenalty = 0,
    presencePenalty = 0,
    stop = null,
    stream = false
  } = options;

  // Validate messages format
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages must be a non-empty array');
  }

  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      throw new Error('Each message must have role and content properties');
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      throw new Error(`Invalid role: ${msg.role}. Must be system, user, or assistant`);
    }
  }

  const startTime = Date.now();

  if (stream) {
    return chatStream(messages, options);
  }

  const response = await makeRequestWithRetry('/chat/completions', {
    body: {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stop,
      stream: false
    }
  });

  const duration = Date.now() - startTime;
  const choice = response.choices?.[0];

  logger.info('Chat completed', {
    model,
    duration,
    messageCount: messages.length,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens
  });

  return {
    response: choice?.message?.content || '',
    role: choice?.message?.role || 'assistant',
    model: response.model,
    finishReason: choice?.finish_reason,
    usage: response.usage,
    duration
  };
}

/**
 * Streaming chat with Grok
 * Returns an async generator for streaming responses
 *
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Chat options
 * @returns {AsyncGenerator} Yields chunks of the response
 */
export async function* chatStream(messages, options = {}) {
  const {
    model = CONFIG.DEFAULT_MODEL,
    temperature = CONFIG.DEFAULT_TEMPERATURE,
    maxTokens = CONFIG.DEFAULT_MAX_TOKENS,
    topP = 1,
    frequencyPenalty = 0,
    presencePenalty = 0,
    stop = null
  } = options;

  if (!CONFIG.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not configured');
  }

  const url = `${CONFIG.API_BASE_URL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.XAI_API_KEY}`,
      'User-Agent': `${CONFIG.SERVER_NAME}/${CONFIG.SERVER_VERSION}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stop,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`xAI API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield {
                content,
                model: data.model,
                finishReason: data.choices?.[0]?.finish_reason
              };
            }
          } catch (e) {
            logger.debug('Failed to parse stream chunk', { line: trimmed });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Check xAI API health and connectivity
 *
 * @returns {Promise<Object>} Health status
 */
export async function checkHealth() {
  const startTime = Date.now();

  try {
    if (!CONFIG.XAI_API_KEY) {
      return {
        available: false,
        error: 'XAI_API_KEY not configured',
        host: CONFIG.API_BASE_URL
      };
    }

    // Try to list models as a health check
    const response = await makeRequest('/models', {
      method: 'GET',
      timeout: 10000
    });

    const duration = Date.now() - startTime;

    return {
      available: true,
      latency: duration,
      host: CONFIG.API_BASE_URL,
      modelCount: response.data?.length || 0
    };
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    return {
      available: false,
      error: error.message,
      host: CONFIG.API_BASE_URL
    };
  }
}

/**
 * List available Grok models
 *
 * @returns {Promise<Array>} List of available models
 */
export async function listModels() {
  try {
    const response = await makeRequest('/models', {
      method: 'GET',
      timeout: 10000
    });

    const models = response.data || [];

    return models.map((model) => ({
      id: model.id,
      name: model.id,
      object: model.object,
      created: model.created,
      ownedBy: model.owned_by
    }));
  } catch (error) {
    logger.error('Failed to list models', { error: error.message });
    return [];
  }
}

/**
 * Get model details
 *
 * @param {string} modelId - Model ID to get details for
 * @returns {Promise<Object|null>} Model details or null
 */
export async function getModelDetails(modelId) {
  try {
    const response = await makeRequest(`/models/${modelId}`, {
      method: 'GET',
      timeout: 10000
    });

    return {
      id: response.id,
      name: response.id,
      object: response.object,
      created: response.created,
      ownedBy: response.owned_by
    };
  } catch (error) {
    logger.error('Failed to get model details', { modelId, error: error.message });
    return null;
  }
}

/**
 * Get real-time information using Grok's real-time capabilities
 * Note: This uses the standard chat endpoint with a system prompt
 * requesting real-time/current information
 *
 * @param {string} query - Query for real-time information
 * @param {Object} options - Options
 * @returns {Promise<Object>} Real-time information result
 */
export async function getRealtime(query, options = {}) {
  const {
    model = CONFIG.DEFAULT_MODEL,
    temperature = 0.3, // Lower temperature for factual queries
    maxTokens = CONFIG.DEFAULT_MAX_TOKENS
  } = options;

  const systemPrompt = `You are Grok, an AI assistant with access to real-time information from X (formerly Twitter) and the web.
Provide accurate, up-to-date information. If you're not sure about something or if the information might be outdated, say so.
Be concise and factual in your responses.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query }
  ];

  const startTime = Date.now();

  const response = await makeRequestWithRetry('/chat/completions', {
    body: {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    }
  });

  const duration = Date.now() - startTime;
  const choice = response.choices?.[0];

  logger.info('Realtime query completed', {
    model,
    duration,
    queryLength: query.length
  });

  return {
    response: choice?.message?.content || '',
    model: response.model,
    finishReason: choice?.finish_reason,
    usage: response.usage,
    duration,
    isRealtime: true
  };
}

/**
 * Analyze code using Grok
 *
 * @param {string} code - Code to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 */
export async function analyzeCode(code, options = {}) {
  const {
    model = CONFIG.DEFAULT_MODEL,
    language = 'auto',
    analysisType = 'review' // review, security, performance, refactor
  } = options;

  const analysisPrompts = {
    review: `Please review the following ${language !== 'auto' ? language : ''} code and provide:
1. Code quality assessment
2. Potential bugs or issues
3. Suggestions for improvement
4. Best practices that could be applied`,
    security: `Please perform a security analysis of the following code and identify:
1. Potential security vulnerabilities
2. Injection risks
3. Authentication/authorization issues
4. Data exposure risks
5. Recommended security improvements`,
    performance: `Please analyze the following code for performance and identify:
1. Performance bottlenecks
2. Memory usage concerns
3. Algorithmic complexity issues
4. Optimization opportunities`,
    refactor: `Please suggest refactoring opportunities for the following code:
1. Code structure improvements
2. Design pattern applications
3. Readability enhancements
4. Maintainability improvements`
  };

  const systemPrompt = `You are an expert code reviewer with deep knowledge of software development best practices, security, and performance optimization.`;

  const prompt = `${analysisPrompts[analysisType] || analysisPrompts.review}

\`\`\`${language !== 'auto' ? language : ''}
${code}
\`\`\``;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];

  const response = await makeRequestWithRetry('/chat/completions', {
    body: {
      model,
      messages,
      temperature: 0.3,
      max_tokens: CONFIG.DEFAULT_MAX_TOKENS,
      stream: false
    }
  });

  const choice = response.choices?.[0];

  return {
    analysis: choice?.message?.content || '',
    analysisType,
    language,
    model: response.model,
    usage: response.usage
  };
}

export default {
  generate,
  chat,
  chatStream,
  checkHealth,
  listModels,
  getModelDetails,
  getRealtime,
  analyzeCode
};
