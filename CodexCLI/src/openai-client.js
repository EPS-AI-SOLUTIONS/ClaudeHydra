/**
 * CodexCLI OpenAI Client
 * API wrapper for OpenAI with streaming, retries, and self-correction support
 */

import OpenAI from 'openai';
import { CONFIG } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('openai-client');

let openaiClient = null;

/**
 * Get or create the OpenAI client instance
 */
function getClient() {
  if (!openaiClient) {
    if (!CONFIG.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const clientConfig = {
      apiKey: CONFIG.OPENAI_API_KEY,
      timeout: CONFIG.REQUEST_TIMEOUT_MS,
      maxRetries: CONFIG.MAX_RETRIES
    };

    if (CONFIG.OPENAI_BASE_URL && CONFIG.OPENAI_BASE_URL !== 'https://api.openai.com/v1') {
      clientConfig.baseURL = CONFIG.OPENAI_BASE_URL;
    }

    if (CONFIG.OPENAI_ORG_ID) {
      clientConfig.organization = CONFIG.OPENAI_ORG_ID;
    }

    openaiClient = new OpenAI(clientConfig);
  }
  return openaiClient;
}

/**
 * Generate text completion using OpenAI API
 * @param {string} prompt - The prompt to generate from
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation result
 */
export async function generate(prompt, options = {}) {
  const startTime = Date.now();
  const client = getClient();

  const model = options.model || CONFIG.DEFAULT_MODEL;
  const temperature = options.temperature ?? CONFIG.DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? CONFIG.DEFAULT_MAX_TOKENS;
  const systemPrompt = options.systemPrompt || 'You are a helpful AI assistant.';

  let attempt = 0;
  const maxRetries = options.retries ?? CONFIG.MAX_RETRIES;
  let lastError;

  while (attempt <= maxRetries) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];

      // Add conversation history if provided
      if (options.history && Array.isArray(options.history)) {
        messages.splice(1, 0, ...options.history);
      }

      const requestParams = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: options.topP ?? CONFIG.DEFAULT_TOP_P,
        frequency_penalty: options.frequencyPenalty ?? CONFIG.DEFAULT_FREQUENCY_PENALTY,
        presence_penalty: options.presencePenalty ?? CONFIG.DEFAULT_PRESENCE_PENALTY
      };

      // Add optional parameters
      if (options.stop) {
        requestParams.stop = options.stop;
      }

      if (options.responseFormat) {
        requestParams.response_format = options.responseFormat;
      }

      const response = await client.chat.completions.create(requestParams);

      const result = {
        response: response.choices[0]?.message?.content || '',
        model: response.model,
        finishReason: response.choices[0]?.finish_reason,
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens
        },
        durationMs: Date.now() - startTime
      };

      logger.debug('Generation completed', {
        model,
        tokens: result.usage.totalTokens,
        durationMs: result.durationMs
      });

      return result;
    } catch (error) {
      lastError = error;

      // Handle rate limiting
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'] || Math.pow(2, attempt + 1);
        logger.warn('Rate limited, retrying', { attempt, retryAfter });
        await sleep(retryAfter * 1000);
        attempt++;
        continue;
      }

      // Handle transient errors
      if (error.status >= 500 || error.code === 'ECONNRESET') {
        if (attempt < maxRetries) {
          const delay = Math.min(CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt), 30000);
          logger.warn('Transient error, retrying', { attempt, delay, error: error.message });
          await sleep(delay);
          attempt++;
          continue;
        }
      }

      // Non-retryable error
      throw error;
    }
  }

  throw lastError || new Error('OpenAI generation failed after retries');
}

/**
 * Generate text with streaming support
 * @param {string} prompt - The prompt to generate from
 * @param {Object} options - Generation options
 * @param {Function} onChunk - Callback for each chunk
 * @returns {Promise<Object>} Complete generation result
 */
export async function generateStream(prompt, options = {}, onChunk = () => {}) {
  const startTime = Date.now();
  const client = getClient();

  const model = options.model || CONFIG.DEFAULT_MODEL;
  const temperature = options.temperature ?? CONFIG.DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? CONFIG.DEFAULT_MAX_TOKENS;
  const systemPrompt = options.systemPrompt || 'You are a helpful AI assistant.';

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];

  if (options.history && Array.isArray(options.history)) {
    messages.splice(1, 0, ...options.history);
  }

  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: options.topP ?? CONFIG.DEFAULT_TOP_P,
    stream: true
  });

  let fullResponse = '';
  let finishReason = null;

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullResponse += content;
    finishReason = chunk.choices[0]?.finish_reason || finishReason;

    if (content) {
      onChunk(content);
    }
  }

  return {
    response: fullResponse,
    model,
    finishReason,
    durationMs: Date.now() - startTime
  };
}

/**
 * Generate code with self-correction capability
 * @param {string} prompt - Code generation prompt
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated code with validation info
 */
export async function generateCode(prompt, options = {}) {
  const model = options.model || CONFIG.CODER_MODEL;
  const language = options.language || 'javascript';
  const maxAttempts = options.maxAttempts || CONFIG.SELF_CORRECT_MAX_ATTEMPTS;

  const systemPrompt = `You are an expert ${language} programmer. Generate clean, well-documented, production-ready code.
Always provide complete, working code without placeholders or TODOs unless explicitly asked.
Include error handling and follow best practices for ${language}.`;

  let attempts = [];
  let currentCode = null;
  let validated = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let currentPrompt = prompt;

    // If we have previous code, ask for corrections
    if (currentCode && attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      currentPrompt = `The following ${language} code has issues:

\`\`\`${language}
${currentCode}
\`\`\`

Issues found:
${lastAttempt.issues.map(i => `- ${i}`).join('\n')}

Please fix these issues and provide the corrected code.`;
    }

    const result = await generate(currentPrompt, {
      model,
      systemPrompt,
      temperature: 0.2, // Lower temperature for code
      maxTokens: options.maxTokens || 4096
    });

    // Extract code from response
    currentCode = extractCode(result.response, language);

    // Validate the code
    const validation = validateCode(currentCode, language);

    attempts.push({
      attempt,
      code: currentCode,
      issues: validation.issues,
      valid: validation.valid,
      model: result.model,
      durationMs: result.durationMs
    });

    if (validation.valid) {
      validated = true;
      break;
    }

    logger.debug('Code validation failed, attempting correction', {
      attempt,
      issues: validation.issues.length
    });
  }

  return {
    code: currentCode,
    language,
    validated,
    attempts: attempts.length,
    history: attempts,
    finalAttempt: attempts[attempts.length - 1]
  };
}

/**
 * Perform code review using OpenAI
 * @param {string} code - Code to review
 * @param {Object} options - Review options
 * @returns {Promise<Object>} Review results
 */
export async function reviewCode(code, options = {}) {
  const language = options.language || detectLanguage(code);
  const focusAreas = options.focusAreas || ['security', 'performance', 'maintainability', 'bugs'];

  const systemPrompt = `You are an expert code reviewer specializing in ${language}.
Provide thorough, constructive code reviews focusing on: ${focusAreas.join(', ')}.
Format your response as JSON with the following structure:
{
  "summary": "brief overall assessment",
  "score": 1-10,
  "issues": [{"severity": "high|medium|low", "line": number|null, "description": "issue description", "suggestion": "how to fix"}],
  "positives": ["list of good practices found"],
  "recommendations": ["list of improvement suggestions"]
}`;

  const result = await generate(
    `Review the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``,
    {
      model: options.model || CONFIG.DEFAULT_MODEL,
      systemPrompt,
      temperature: 0.3,
      responseFormat: { type: 'json_object' }
    }
  );

  try {
    const review = JSON.parse(result.response);
    return {
      success: true,
      language,
      review,
      model: result.model,
      durationMs: result.durationMs
    };
  } catch (parseError) {
    // If JSON parsing fails, return raw response
    return {
      success: false,
      language,
      rawResponse: result.response,
      error: 'Failed to parse review as JSON',
      model: result.model,
      durationMs: result.durationMs
    };
  }
}

/**
 * Check OpenAI API health and availability
 * @returns {Promise<Object>} Health status
 */
export async function checkHealth() {
  const startTime = Date.now();

  try {
    const client = getClient();
    const models = await client.models.list();

    const availableModels = models.data
      .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1'))
      .map(m => m.id)
      .slice(0, 20); // Limit to 20 models

    return {
      available: true,
      models: availableModels,
      latencyMs: Date.now() - startTime,
      baseUrl: CONFIG.OPENAI_BASE_URL
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      code: error.code || error.status,
      latencyMs: Date.now() - startTime,
      baseUrl: CONFIG.OPENAI_BASE_URL
    };
  }
}

/**
 * List available models
 * @returns {Promise<Array>} List of available models
 */
export async function listModels() {
  try {
    const client = getClient();
    const response = await client.models.list();

    return response.data
      .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('chatgpt'))
      .map(m => ({
        id: m.id,
        created: m.created,
        ownedBy: m.owned_by
      }))
      .sort((a, b) => b.created - a.created);
  } catch (error) {
    logger.error('Failed to list models', { error: error.message });
    return [];
  }
}

/**
 * Get details for a specific model
 * @param {string} modelId - Model ID
 * @returns {Promise<Object>} Model details
 */
export async function getModelDetails(modelId) {
  try {
    const client = getClient();
    const model = await client.models.retrieve(modelId);

    return {
      success: true,
      model: {
        id: model.id,
        created: model.created,
        ownedBy: model.owned_by,
        object: model.object
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// === Helper Functions ===

/**
 * Extract code block from response
 */
function extractCode(response, language) {
  // Try to extract from markdown code block
  const codeBlockRegex = new RegExp(`\`\`\`(?:${language})?\\s*\\n([\\s\\S]*?)\`\`\``, 'i');
  const match = response.match(codeBlockRegex);

  if (match) {
    return match[1].trim();
  }

  // Try generic code block
  const genericMatch = response.match(/```\s*\n([\s\S]*?)```/);
  if (genericMatch) {
    return genericMatch[1].trim();
  }

  // Return cleaned response if no code block found
  return response.trim();
}

/**
 * Basic code validation (syntax checking)
 */
function validateCode(code, language) {
  const issues = [];

  if (!code || code.trim().length === 0) {
    return { valid: false, issues: ['Empty code'] };
  }

  // Language-specific basic validation
  switch (language.toLowerCase()) {
    case 'javascript':
    case 'typescript':
    case 'js':
    case 'ts':
      // Check for balanced braces
      if (!isBalanced(code, '{', '}')) {
        issues.push('Unbalanced curly braces');
      }
      if (!isBalanced(code, '(', ')')) {
        issues.push('Unbalanced parentheses');
      }
      if (!isBalanced(code, '[', ']')) {
        issues.push('Unbalanced square brackets');
      }
      // Check for common syntax errors
      if (/^\s*\}\s*else\s*$/m.test(code)) {
        issues.push('Incomplete else statement');
      }
      break;

    case 'python':
    case 'py':
      // Check for consistent indentation
      const lines = code.split('\n');
      let prevIndent = 0;
      for (const line of lines) {
        if (line.trim() && !line.trim().startsWith('#')) {
          const indent = line.match(/^(\s*)/)[1].length;
          if (indent % 4 !== 0 && indent % 2 !== 0) {
            issues.push('Inconsistent indentation detected');
            break;
          }
        }
      }
      // Check for missing colons after def/class/if/etc
      if (/\b(def|class|if|elif|else|for|while|try|except|finally|with)\s+[^:]*$/m.test(code)) {
        issues.push('Missing colon after statement');
      }
      break;

    case 'json':
      try {
        JSON.parse(code);
      } catch (e) {
        issues.push(`Invalid JSON: ${e.message}`);
      }
      break;

    default:
      // Generic validation for other languages
      if (!isBalanced(code, '{', '}')) {
        issues.push('Unbalanced curly braces');
      }
      if (!isBalanced(code, '(', ')')) {
        issues.push('Unbalanced parentheses');
      }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Check if brackets are balanced
 */
function isBalanced(code, open, close) {
  let count = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    // Handle string detection
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Only count brackets outside strings
    if (!inString) {
      if (char === open) count++;
      if (char === close) count--;
      if (count < 0) return false;
    }
  }

  return count === 0;
}

/**
 * Detect programming language from code
 */
function detectLanguage(code) {
  // Simple heuristic-based detection
  if (/^\s*(import|from)\s+\w+/.test(code) && /:\s*$/m.test(code)) {
    return 'python';
  }
  if (/^\s*(const|let|var|function|class|import|export)\s+/.test(code)) {
    return 'javascript';
  }
  if (/^\s*package\s+\w+/.test(code)) {
    return 'java';
  }
  if (/^\s*(fn|let|use|impl|struct|enum)\s+/.test(code)) {
    return 'rust';
  }
  if (/^\s*(func|package|import)\s+/.test(code)) {
    return 'go';
  }
  if (/^\s*#include\s*</.test(code)) {
    return 'c';
  }

  return 'text';
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
