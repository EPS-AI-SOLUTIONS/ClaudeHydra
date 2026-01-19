#!/usr/bin/env node
/**
 * CodexCLI MCP Server
 * OpenAI integration for HYDRA via Model Context Protocol
 *
 * Features:
 * - GPT-4o and o1-series model support
 * - Self-correcting code generation
 * - Code review and explanation
 * - Streaming support
 * - Batch processing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  generate,
  generateStream,
  generateCode,
  reviewCode,
  checkHealth,
  listModels,
  getModelDetails
} from './openai-client.js';
import { TOOLS, validateToolArgs } from './tools.js';
import { CONFIG, getMaskedApiKey, validateConfig } from './config.js';
import { createLogger } from './logger.js';
import { CodexStreamHandler, createCodexHandler } from './codex-handler.js';

const logger = createLogger('server');
const SERVER_VERSION = '1.0.0';

// Codex Stream Handler instance
let streamHandler = null;

// Server instance
const server = new Server(
  {
    name: 'codex-hydra',
    version: SERVER_VERSION
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Tool lookup map
const toolByName = new Map(TOOLS.map((tool) => [tool.name, tool]));

/**
 * Create standardized error response
 */
const createErrorResponse = (code, message, tool) => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message, code, tool })
      }
    ],
    isError: true
  };
};

/**
 * Create success response
 */
const createSuccessResponse = (result) => {
  return {
    content: [
      {
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }
    ]
  };
};

/**
 * Detect potential prompt injection risks
 */
const detectPromptRisk = (prompt) => {
  if (!prompt) return [];
  const checks = [
    {
      pattern: /ignore (all|previous|earlier) instructions/i,
      message: 'Potential instruction bypass attempt detected.'
    },
    {
      pattern: /system prompt/i,
      message: 'Request for system prompt disclosure detected.'
    },
    {
      pattern: /exfiltrate|leak|steal/i,
      message: 'Potential data exfiltration attempt detected.'
    },
    {
      pattern: /pretend (you are|to be)/i,
      message: 'Role manipulation attempt detected.'
    }
  ];
  return checks
    .filter(({ pattern }) => pattern.test(prompt))
    .map(({ message }) => message);
};

/**
 * Evaluate prompt risk and determine if blocked
 */
const evaluatePromptRisk = (prompt) => {
  const warnings = detectPromptRisk(prompt);
  return {
    warnings,
    blocked: warnings.length > 0 && CONFIG.RISK_BLOCKING
  };
};

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params ?? {};
  const startedAt = Date.now();
  const safeArgs = args ?? {};
  const tool = toolByName.get(name);

  try {
    // Check if tool exists
    if (!tool) {
      return createErrorResponse('CODEX_TOOL_UNKNOWN', 'Unknown tool.', name);
    }

    // Validate arguments
    const validationErrors = validateToolArgs(tool, safeArgs);
    if (validationErrors.length > 0) {
      return createErrorResponse(
        'CODEX_TOOL_INVALID',
        validationErrors.join(' '),
        name
      );
    }

    let result;

    switch (name) {
      // === GENERATION TOOLS ===
      case 'codex_generate': {
        const risk = evaluatePromptRisk(safeArgs.prompt);
        if (risk.blocked) {
          return createErrorResponse(
            'CODEX_RISK_BLOCKED',
            risk.warnings.join(' '),
            name
          );
        }
        if (risk.warnings.length) {
          logger.warn('Potential prompt risk detected', { tool: name });
        }

        const responseFormat = safeArgs.responseFormat === 'json'
          ? { type: 'json_object' }
          : undefined;

        const response = await generate(safeArgs.prompt, {
          model: safeArgs.model,
          systemPrompt: safeArgs.systemPrompt,
          temperature: safeArgs.temperature,
          maxTokens: safeArgs.maxTokens,
          topP: safeArgs.topP,
          frequencyPenalty: safeArgs.frequencyPenalty,
          presencePenalty: safeArgs.presencePenalty,
          stop: safeArgs.stop,
          responseFormat
        });

        result = {
          response: response.response,
          model: response.model,
          usage: response.usage,
          finishReason: response.finishReason,
          durationMs: response.durationMs,
          securityWarnings: risk.warnings
        };
        break;
      }

      case 'codex_stream': {
        const risk = evaluatePromptRisk(safeArgs.prompt);
        if (risk.blocked) {
          return createErrorResponse(
            'CODEX_RISK_BLOCKED',
            risk.warnings.join(' '),
            name
          );
        }

        // Note: MCP doesn't support true streaming, so we collect all chunks
        const chunks = [];
        const response = await generateStream(
          safeArgs.prompt,
          {
            model: safeArgs.model,
            systemPrompt: safeArgs.systemPrompt,
            temperature: safeArgs.temperature,
            maxTokens: safeArgs.maxTokens
          },
          (chunk) => chunks.push(chunk)
        );

        result = {
          response: response.response,
          model: response.model,
          finishReason: response.finishReason,
          durationMs: response.durationMs,
          chunkCount: chunks.length,
          securityWarnings: risk.warnings
        };
        break;
      }

      // === CODE TOOLS ===
      case 'codex_code': {
        const risk = evaluatePromptRisk(safeArgs.prompt);
        if (risk.blocked) {
          return createErrorResponse(
            'CODEX_RISK_BLOCKED',
            risk.warnings.join(' '),
            name
          );
        }

        const codeResult = await generateCode(safeArgs.prompt, {
          language: safeArgs.language,
          model: safeArgs.model,
          maxAttempts: safeArgs.maxAttempts,
          maxTokens: safeArgs.maxTokens
        });

        result = {
          code: codeResult.code,
          language: codeResult.language,
          validated: codeResult.validated,
          attempts: codeResult.attempts,
          history: codeResult.history.map(h => ({
            attempt: h.attempt,
            valid: h.valid,
            issues: h.issues,
            durationMs: h.durationMs
          })),
          securityWarnings: risk.warnings
        };
        break;
      }

      case 'codex_review': {
        const reviewResult = await reviewCode(safeArgs.code, {
          language: safeArgs.language,
          focusAreas: safeArgs.focusAreas,
          model: safeArgs.model
        });

        result = reviewResult;
        break;
      }

      case 'codex_explain': {
        const detailPrompts = {
          brief: 'Provide a brief, 2-3 sentence explanation.',
          detailed: 'Provide a detailed explanation with sections for: Purpose, Logic Flow, Key Concepts.',
          expert: 'Provide an expert-level explanation covering: Architecture, Design Patterns, Performance Implications, Edge Cases.'
        };

        const language = safeArgs.language || 'the detected language';
        const systemPrompt = `You are an expert programmer explaining ${language} code.
${detailPrompts[safeArgs.detail || 'detailed']}`;

        const response = await generate(
          `Explain the following code:\n\n\`\`\`\n${safeArgs.code}\n\`\`\``,
          {
            model: safeArgs.model,
            systemPrompt,
            temperature: 0.3
          }
        );

        result = {
          explanation: response.response,
          language: safeArgs.language,
          detail: safeArgs.detail || 'detailed',
          model: response.model,
          durationMs: response.durationMs
        };
        break;
      }

      case 'codex_refactor': {
        const goals = safeArgs.goals || ['readability', 'maintainability'];
        const language = safeArgs.language || 'the detected language';

        const systemPrompt = `You are an expert ${language} programmer specializing in code refactoring.
Refactor the code to improve: ${goals.join(', ')}.
${safeArgs.preserveApi ? 'IMPORTANT: Preserve the public API/interface.' : ''}
Provide the refactored code with comments explaining major changes.`;

        const response = await generate(
          `Refactor the following code:\n\n\`\`\`\n${safeArgs.code}\n\`\`\``,
          {
            model: safeArgs.model || CONFIG.CODER_MODEL,
            systemPrompt,
            temperature: 0.2
          }
        );

        result = {
          refactoredCode: response.response,
          language: safeArgs.language,
          goals,
          preservedApi: safeArgs.preserveApi !== false,
          model: response.model,
          durationMs: response.durationMs
        };
        break;
      }

      case 'codex_test': {
        const language = safeArgs.language || 'javascript';
        const framework = safeArgs.framework || getDefaultTestFramework(language);
        const coverage = safeArgs.coverage || 'comprehensive';

        const coverageInstructions = {
          basic: 'Write basic happy-path tests.',
          comprehensive: 'Write comprehensive tests covering happy paths, error cases, and boundary conditions.',
          'edge-cases': 'Focus on edge cases, boundary conditions, error handling, and unusual inputs.'
        };

        const systemPrompt = `You are an expert ${language} programmer writing unit tests using ${framework}.
${coverageInstructions[coverage]}
Include test setup, assertions, and cleanup where appropriate.
Format your response as complete, runnable test code.`;

        const response = await generate(
          `Generate unit tests for the following code:\n\n\`\`\`${language}\n${safeArgs.code}\n\`\`\``,
          {
            model: safeArgs.model || CONFIG.CODER_MODEL,
            systemPrompt,
            temperature: 0.2,
            maxTokens: 4096
          }
        );

        result = {
          tests: response.response,
          language,
          framework,
          coverage,
          model: response.model,
          durationMs: response.durationMs
        };
        break;
      }

      case 'codex_debug': {
        const language = safeArgs.language || 'the detected language';
        const hasError = safeArgs.errorMessage ? `\n\nError message:\n${safeArgs.errorMessage}` : '';
        const hasContext = safeArgs.context ? `\n\nAdditional context:\n${safeArgs.context}` : '';

        const systemPrompt = `You are an expert ${language} debugger.
Analyze the code for bugs and issues.
Format your response as JSON with:
{
  "diagnosis": "what's wrong and why",
  "bugs": [{"line": number|null, "issue": "description", "severity": "critical|high|medium|low"}],
  "fixes": [{"description": "what to fix", "code": "corrected code snippet"}],
  "recommendations": ["preventive measures"]
}`;

        const response = await generate(
          `Debug the following code:${hasError}${hasContext}\n\n\`\`\`\n${safeArgs.code}\n\`\`\``,
          {
            model: safeArgs.model,
            systemPrompt,
            temperature: 0.3,
            responseFormat: { type: 'json_object' }
          }
        );

        try {
          const debugInfo = JSON.parse(response.response);
          result = {
            success: true,
            language: safeArgs.language,
            ...debugInfo,
            model: response.model,
            durationMs: response.durationMs
          };
        } catch {
          result = {
            success: false,
            rawResponse: response.response,
            model: response.model,
            durationMs: response.durationMs
          };
        }
        break;
      }

      // === UTILITY TOOLS ===
      case 'codex_status': {
        const health = await checkHealth();
        const models = health.available ? await listModels() : [];

        result = {
          openai: health,
          models: models.slice(0, 10).map(m => m.id),
          config: {
            defaultModel: CONFIG.DEFAULT_MODEL,
            coderModel: CONFIG.CODER_MODEL,
            fastModel: CONFIG.FAST_MODEL
          },
          features: {
            codeGeneration: true,
            selfCorrection: true,
            codeReview: true,
            streaming: CONFIG.STREAMING_ENABLED,
            riskBlocking: CONFIG.RISK_BLOCKING
          },
          apiVersion: CONFIG.API_VERSION,
          serverVersion: SERVER_VERSION
        };
        break;
      }

      case 'codex_models': {
        let models = await listModels();

        if (safeArgs.filter) {
          const filter = safeArgs.filter.toLowerCase();
          models = models.filter(m => m.id.toLowerCase().includes(filter));
        }

        result = {
          count: models.length,
          models: models.map(m => ({
            id: m.id,
            ownedBy: m.ownedBy
          }))
        };
        break;
      }

      case 'codex_model_details': {
        result = await getModelDetails(safeArgs.model);
        break;
      }

      // === ADVANCED TOOLS ===
      case 'codex_chain': {
        const steps = safeArgs.steps;
        const defaultModel = safeArgs.model || CONFIG.DEFAULT_MODEL;
        const chainResults = [];
        let previousOutput = '';

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const prompt = step.prompt.replace('{{previous}}', previousOutput);

          const risk = evaluatePromptRisk(prompt);
          if (risk.blocked) {
            chainResults.push({
              step: i + 1,
              error: risk.warnings.join(' '),
              blocked: true
            });
            break;
          }

          const response = await generate(prompt, {
            model: step.model || defaultModel,
            temperature: step.temperature ?? 0.3
          });

          chainResults.push({
            step: i + 1,
            response: response.response,
            model: response.model,
            durationMs: response.durationMs
          });

          previousOutput = response.response;
        }

        result = {
          totalSteps: steps.length,
          completedSteps: chainResults.filter(r => !r.error).length,
          steps: chainResults,
          finalOutput: chainResults[chainResults.length - 1]?.response
        };
        break;
      }

      case 'codex_compare': {
        const models = safeArgs.models || ['gpt-4o', 'gpt-4o-mini'];
        const risk = evaluatePromptRisk(safeArgs.prompt);

        if (risk.blocked) {
          return createErrorResponse(
            'CODEX_RISK_BLOCKED',
            risk.warnings.join(' '),
            name
          );
        }

        const comparisons = await Promise.all(
          models.map(async (model) => {
            try {
              const response = await generate(safeArgs.prompt, {
                model,
                temperature: safeArgs.temperature ?? 0.3
              });
              return {
                model,
                response: response.response,
                usage: response.usage,
                durationMs: response.durationMs
              };
            } catch (error) {
              return {
                model,
                error: error.message
              };
            }
          })
        );

        result = {
          prompt: safeArgs.prompt.substring(0, 100) + (safeArgs.prompt.length > 100 ? '...' : ''),
          comparisons,
          securityWarnings: risk.warnings
        };
        break;
      }

      case 'codex_batch': {
        const model = safeArgs.model || CONFIG.DEFAULT_MODEL;
        const maxConcurrent = safeArgs.maxConcurrent || 5;
        const prompts = safeArgs.prompts;

        // Check all prompts for risks
        const batchWarnings = prompts.flatMap(p => detectPromptRisk(p));
        const uniqueWarnings = [...new Set(batchWarnings)];

        if (uniqueWarnings.length && CONFIG.RISK_BLOCKING) {
          return createErrorResponse(
            'CODEX_RISK_BLOCKED',
            uniqueWarnings.join(' '),
            name
          );
        }

        // Process in batches
        const results = [];
        for (let i = 0; i < prompts.length; i += maxConcurrent) {
          const batch = prompts.slice(i, i + maxConcurrent);
          const batchResults = await Promise.all(
            batch.map(async (prompt, idx) => {
              try {
                const response = await generate(prompt, {
                  model,
                  temperature: safeArgs.temperature ?? 0.3
                });
                return {
                  index: i + idx,
                  response: response.response,
                  durationMs: response.durationMs
                };
              } catch (error) {
                return {
                  index: i + idx,
                  error: error.message
                };
              }
            })
          );
          results.push(...batchResults);
        }

        result = {
          total: prompts.length,
          successful: results.filter(r => !r.error).length,
          failed: results.filter(r => r.error).length,
          results,
          model,
          securityWarnings: uniqueWarnings
        };
        break;
      }

      // === HYDRA INTEGRATION ===
      case 'codex_health': {
        const health = await checkHealth();

        result = {
          status: health.available ? 'ok' : 'degraded',
          openai: health,
          version: SERVER_VERSION,
          apiVersion: CONFIG.API_VERSION,
          runtime: {
            yoloMode: CONFIG.YOLO_MODE,
            riskBlocking: CONFIG.RISK_BLOCKING
          },
          node: {
            version: process.versions.node
          }
        };
        break;
      }

      case 'codex_config': {
        result = {
          apiVersion: CONFIG.API_VERSION,
          apiKey: getMaskedApiKey(),
          baseUrl: CONFIG.OPENAI_BASE_URL,
          models: {
            default: CONFIG.DEFAULT_MODEL,
            coder: CONFIG.CODER_MODEL,
            fast: CONFIG.FAST_MODEL,
            reasoning: CONFIG.REASONING_MODEL
          },
          defaults: {
            temperature: CONFIG.DEFAULT_TEMPERATURE,
            maxTokens: CONFIG.DEFAULT_MAX_TOKENS
          },
          runtime: {
            yoloMode: CONFIG.YOLO_MODE,
            riskBlocking: CONFIG.RISK_BLOCKING,
            streaming: CONFIG.STREAMING_ENABLED
          },
          timeouts: {
            requestMs: CONFIG.REQUEST_TIMEOUT_MS,
            healthCheckMs: CONFIG.HEALTH_CHECK_TIMEOUT_MS
          }
        };
        break;
      }

      // === STREAM HANDLER TOOLS ===
      case 'codex_stream_advanced': {
        if (!streamHandler) {
          return createErrorResponse(
            'CODEX_HANDLER_NOT_READY',
            'CodexStreamHandler not initialized. Check OPENAI_API_KEY.',
            name
          );
        }

        const risk = evaluatePromptRisk(safeArgs.prompt);
        if (risk.blocked) {
          return createErrorResponse(
            'CODEX_RISK_BLOCKED',
            risk.warnings.join(' '),
            name
          );
        }

        try {
          const streamResult = await streamHandler.stream(
            safeArgs.prompt,
            {
              onStart: (meta) => {
                logger.debug('Stream started', meta);
              },
              onUsage: (usage) => {
                logger.debug('Stream usage', usage);
              }
            },
            {
              model: safeArgs.model,
              systemPrompt: safeArgs.systemPrompt,
              temperature: safeArgs.temperature,
              maxTokens: safeArgs.maxTokens,
              topP: safeArgs.topP,
              frequencyPenalty: safeArgs.frequencyPenalty,
              presencePenalty: safeArgs.presencePenalty,
              stop: safeArgs.stop,
              history: safeArgs.history
            }
          );

          result = {
            response: streamResult.response,
            model: streamResult.model,
            finishReason: streamResult.finishReason,
            usage: streamResult.usage,
            durationMs: streamResult.durationMs,
            aborted: streamResult.aborted || false,
            securityWarnings: risk.warnings
          };
        } catch (streamError) {
          return createErrorResponse(
            'CODEX_STREAM_ERROR',
            `Streaming failed: ${streamError.message}`,
            name
          );
        }
        break;
      }

      case 'codex_complete': {
        if (!streamHandler) {
          return createErrorResponse(
            'CODEX_HANDLER_NOT_READY',
            'CodexStreamHandler not initialized.',
            name
          );
        }

        const risk = evaluatePromptRisk(safeArgs.prompt);
        if (risk.blocked) {
          return createErrorResponse(
            'CODEX_RISK_BLOCKED',
            risk.warnings.join(' '),
            name
          );
        }

        try {
          const completeResult = await streamHandler.complete(safeArgs.prompt, {
            model: safeArgs.model,
            systemPrompt: safeArgs.systemPrompt,
            temperature: safeArgs.temperature,
            maxTokens: safeArgs.maxTokens,
            topP: safeArgs.topP,
            frequencyPenalty: safeArgs.frequencyPenalty,
            presencePenalty: safeArgs.presencePenalty,
            stop: safeArgs.stop,
            responseFormat: safeArgs.responseFormat === 'json'
              ? { type: 'json_object' }
              : undefined,
            history: safeArgs.history
          });

          result = {
            response: completeResult.response,
            model: completeResult.model,
            finishReason: completeResult.finishReason,
            usage: completeResult.usage,
            durationMs: completeResult.durationMs,
            securityWarnings: risk.warnings
          };
        } catch (completeError) {
          return createErrorResponse(
            'CODEX_COMPLETE_ERROR',
            `Completion failed: ${completeError.message}`,
            name
          );
        }
        break;
      }

      case 'codex_stream_abort': {
        if (!streamHandler) {
          result = {
            aborted: false,
            message: 'CodexStreamHandler not initialized'
          };
          break;
        }

        const aborted = streamHandler.abort();
        result = {
          aborted,
          message: aborted ? 'Stream aborted successfully' : 'No active stream to abort'
        };
        break;
      }

      case 'codex_rate_limit_status': {
        if (!streamHandler) {
          result = {
            initialized: false,
            message: 'CodexStreamHandler not initialized'
          };
          break;
        }

        result = {
          initialized: true,
          rateLimitState: streamHandler.getRateLimitState(),
          contextLimit: streamHandler.getContextLimit()
        };
        break;
      }

      default:
        return createErrorResponse('CODEX_TOOL_UNKNOWN', 'Unknown tool.', name);
    }

    logger.info('Tool executed', {
      tool: name,
      durationMs: Date.now() - startedAt
    });

    return createSuccessResponse(result);

  } catch (error) {
    logger.error('Tool execution failed', {
      tool: name,
      error: error.message
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Execution failed: ${error.message}`,
            tool: name,
            code: error.code || 'CODEX_ERROR'
          })
        }
      ],
      isError: true
    };
  }
});

/**
 * Get default test framework for a language
 */
function getDefaultTestFramework(language) {
  const frameworks = {
    javascript: 'jest',
    typescript: 'jest',
    python: 'pytest',
    java: 'junit',
    rust: 'cargo test',
    go: 'testing',
    ruby: 'rspec',
    php: 'phpunit',
    csharp: 'xunit'
  };
  return frameworks[language.toLowerCase()] || 'appropriate testing framework';
}

/**
 * Main entry point
 */
async function main() {
  // Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    logger.error('Configuration validation failed', {
      errors: configValidation.errors
    });
    console.error('CodexCLI configuration errors:', configValidation.errors.join(', '));
    console.error('Please set OPENAI_API_KEY environment variable.');
    process.exit(1);
  }

  const transport = new StdioServerTransport();

  // Check API health at startup
  const health = await checkHealth();
  if (health.available) {
    logger.info('OpenAI API connection verified', {
      latencyMs: health.latencyMs,
      modelsCount: health.models?.length || 0
    });
  } else {
    logger.warn('OpenAI API not available at startup', {
      error: health.error
    });
  }

  // Initialize CodexStreamHandler
  try {
    if (CONFIG.OPENAI_API_KEY) {
      streamHandler = createCodexHandler({
        apiKey: CONFIG.OPENAI_API_KEY,
        model: CONFIG.DEFAULT_MODEL,
        baseUrl: CONFIG.OPENAI_BASE_URL,
        organization: CONFIG.OPENAI_ORG_ID,
        timeout: CONFIG.REQUEST_TIMEOUT_MS,
        maxRetries: CONFIG.MAX_RETRIES
      });
      logger.info('CodexStreamHandler initialized', {
        model: CONFIG.DEFAULT_MODEL
      });
    } else {
      logger.warn('OPENAI_API_KEY not set - CodexStreamHandler disabled');
    }
  } catch (handlerError) {
    logger.error('Failed to initialize CodexStreamHandler', {
      error: handlerError.message
    });
  }

  await server.connect(transport);
  logger.info('CodexCLI MCP Server running on stdio', {
    version: SERVER_VERSION,
    defaultModel: CONFIG.DEFAULT_MODEL
  });
}

main().catch((error) => {
  logger.error('Server failed to start', { error: error.message });
  process.exit(1);
});
