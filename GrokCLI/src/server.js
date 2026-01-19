#!/usr/bin/env node
/**
 * HYDRA Grok MCP Server
 *
 * Provides xAI Grok integration for HYDRA Multi-CLI Dashboard with:
 * - Text generation with Grok-3 and Grok-2 models
 * - Multi-turn chat conversations
 * - Real-time information access
 * - Code analysis and review
 * - Creative writing assistance
 *
 * API: https://api.x.ai/v1
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  generate,
  chat,
  checkHealth,
  listModels,
  getModelDetails,
  getRealtime,
  analyzeCode
} from './xai-client.js';
import { CONFIG, validateConfig, getSanitizedConfig } from './config.js';
import { createLogger } from './logger.js';
import { TOOLS, getToolByName, validateToolArgs } from './tools.js';
import { GrokWebSocketHandler, createGrokWebSocketHandler, ConnectionState } from './grok-handler.js';

const logger = createLogger('server');

// WebSocket Handler instance for real-time communication
let wsHandler = null;

// Server instance
const server = new Server(
  {
    name: CONFIG.SERVER_NAME,
    version: CONFIG.SERVER_VERSION
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

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
 * Create successful response
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

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params ?? {};
  const startedAt = Date.now();
  const safeArgs = args ?? {};
  const tool = getToolByName(name);

  try {
    if (!tool) {
      return createErrorResponse('GROK_TOOL_UNKNOWN', 'Unknown tool', name);
    }

    const validationErrors = validateToolArgs(tool, safeArgs);
    if (validationErrors.length > 0) {
      return createErrorResponse(
        'GROK_TOOL_INVALID',
        validationErrors.join('; '),
        name
      );
    }

    let result;

    switch (name) {
      // === GENERATION TOOLS ===
      case 'grok_generate': {
        result = await generate(safeArgs.prompt, {
          model: safeArgs.model,
          temperature: safeArgs.temperature,
          maxTokens: safeArgs.maxTokens,
          systemPrompt: safeArgs.systemPrompt,
          topP: safeArgs.topP,
          frequencyPenalty: safeArgs.frequencyPenalty,
          presencePenalty: safeArgs.presencePenalty
        });
        break;
      }

      // === CHAT TOOLS ===
      case 'grok_chat': {
        result = await chat(safeArgs.messages, {
          model: safeArgs.model,
          temperature: safeArgs.temperature,
          maxTokens: safeArgs.maxTokens,
          stream: safeArgs.stream || false
        });
        break;
      }

      // === REALTIME TOOLS ===
      case 'grok_realtime': {
        result = await getRealtime(safeArgs.query, {
          model: safeArgs.model,
          maxTokens: safeArgs.maxTokens
        });
        break;
      }

      // === CODE ANALYSIS TOOLS ===
      case 'grok_code_analyze': {
        result = await analyzeCode(safeArgs.code, {
          model: safeArgs.model,
          language: safeArgs.language,
          analysisType: safeArgs.analysisType
        });
        break;
      }

      // === STATUS TOOLS ===
      case 'grok_status': {
        const health = await checkHealth();
        let models = [];
        if (safeArgs.includeModels !== false && health.available) {
          models = await listModels();
        }

        result = {
          api: health,
          models: models.length > 0 ? models : undefined,
          config: {
            defaultModel: CONFIG.DEFAULT_MODEL,
            fastModel: CONFIG.FAST_MODEL,
            visionModel: CONFIG.VISION_MODEL,
            apiVersion: CONFIG.API_VERSION
          },
          features: {
            realtime: CONFIG.REALTIME_ENABLED,
            deepsearch: CONFIG.DEEPSEARCH_ENABLED,
            streaming: CONFIG.STREAM_ENABLED
          },
          server: {
            name: CONFIG.SERVER_NAME,
            version: CONFIG.SERVER_VERSION
          }
        };
        break;
      }

      case 'grok_models': {
        const models = await listModels();
        result = {
          count: models.length,
          models
        };
        break;
      }

      case 'grok_model_details': {
        const modelDetails = await getModelDetails(safeArgs.model);
        if (!modelDetails) {
          return createErrorResponse(
            'GROK_MODEL_NOT_FOUND',
            `Model ${safeArgs.model} not found`,
            name
          );
        }
        result = modelDetails;
        break;
      }

      // === CREATIVE TOOLS ===
      case 'grok_creative': {
        const stylePrompts = {
          story:
            'Write a creative story based on the following prompt. Include vivid descriptions, engaging dialogue, and a compelling narrative arc.',
          poem: 'Write a poem based on the following prompt. Consider rhythm, imagery, and emotional resonance.',
          script:
            'Write a script/screenplay based on the following prompt. Include scene descriptions, character dialogue, and stage/screen directions.',
          song: 'Write song lyrics based on the following prompt. Consider verse structure, chorus, and emotional themes.',
          essay:
            'Write a thoughtful essay based on the following prompt. Present arguments clearly and engage the reader.',
          free: 'Create something creative and interesting based on the following prompt.'
        };

        const stylePrefix = stylePrompts[safeArgs.style] || stylePrompts.free;

        result = await generate(`${stylePrefix}\n\nPrompt: ${safeArgs.prompt}`, {
          model: safeArgs.model,
          temperature: 1.2, // Higher temperature for creativity
          maxTokens: safeArgs.maxTokens,
          presencePenalty: 0.6 // Encourage diverse vocabulary
        });
        result.style = safeArgs.style || 'free';
        break;
      }

      // === SUMMARIZE TOOLS ===
      case 'grok_summarize': {
        const summaryStyles = {
          brief: `Provide a brief summary (about ${safeArgs.maxLength || 200} words) of the following text. Focus on the key points.`,
          detailed: `Provide a detailed summary of the following text. Cover all important points while maintaining clarity.`,
          bullet: `Summarize the following text as a bullet-point list. Each point should be concise and capture a key idea.`,
          executive: `Provide an executive summary of the following text. Focus on key findings, implications, and recommendations.`
        };

        const summaryPrompt =
          summaryStyles[safeArgs.style] || summaryStyles.brief;

        result = await generate(`${summaryPrompt}\n\nText to summarize:\n\n${safeArgs.text}`, {
          model: safeArgs.model,
          temperature: 0.3, // Lower temperature for accuracy
          maxTokens: safeArgs.maxLength ? safeArgs.maxLength * 2 : 500
        });
        result.style = safeArgs.style || 'brief';
        break;
      }

      // === TRANSLATE TOOLS ===
      case 'grok_translate': {
        const sourceInfo =
          safeArgs.sourceLanguage && safeArgs.sourceLanguage !== 'auto'
            ? `from ${safeArgs.sourceLanguage} `
            : '';

        const translatePrompt = `Translate the following text ${sourceInfo}to ${safeArgs.targetLanguage}.
Maintain the original meaning, tone, and style. Only output the translation, no explanations.

Text to translate:
${safeArgs.text}`;

        result = await generate(translatePrompt, {
          model: safeArgs.model,
          temperature: 0.3, // Lower temperature for accuracy
          maxTokens: safeArgs.text.length * 3 // Allow room for longer translations
        });
        result.targetLanguage = safeArgs.targetLanguage;
        result.sourceLanguage = safeArgs.sourceLanguage || 'auto-detected';
        break;
      }

      // === HEALTH & CONFIG TOOLS ===
      case 'grok_health': {
        const health = await checkHealth();
        const configValidation = validateConfig();

        result = {
          status: health.available ? 'healthy' : 'degraded',
          api: health,
          configuration: {
            valid: configValidation.valid,
            errors: configValidation.errors
          },
          server: {
            name: CONFIG.SERVER_NAME,
            version: CONFIG.SERVER_VERSION,
            uptime: process.uptime()
          },
          features: {
            realtime: CONFIG.REALTIME_ENABLED,
            deepsearch: CONFIG.DEEPSEARCH_ENABLED,
            streaming: CONFIG.STREAM_ENABLED
          }
        };
        break;
      }

      case 'grok_config': {
        result = getSanitizedConfig();
        break;
      }

      // === WEBSOCKET HANDLER TOOLS ===
      case 'grok_ws_connect': {
        if (!wsHandler) {
          wsHandler = createGrokWebSocketHandler({
            apiKey: CONFIG.XAI_API_KEY,
            maxReconnectAttempts: safeArgs.maxReconnectAttempts || 5,
            heartbeatInterval: safeArgs.heartbeatInterval || 30000
          });
        }

        if (wsHandler.isConnected) {
          result = {
            success: true,
            message: 'Already connected',
            state: wsHandler.state
          };
          break;
        }

        try {
          await wsHandler.connect();
          result = {
            success: true,
            state: wsHandler.state,
            message: 'WebSocket connected successfully'
          };
        } catch (connectError) {
          result = {
            success: false,
            state: wsHandler.state,
            error: connectError.message
          };
        }
        break;
      }

      case 'grok_ws_disconnect': {
        if (!wsHandler) {
          result = {
            success: false,
            message: 'WebSocket handler not initialized'
          };
          break;
        }

        wsHandler.disconnect(safeArgs.code || 1000, safeArgs.reason || 'Client disconnect');
        result = {
          success: true,
          state: wsHandler.state,
          message: 'WebSocket disconnected'
        };
        break;
      }

      case 'grok_ws_send': {
        if (!wsHandler || !wsHandler.isConnected) {
          return createErrorResponse(
            'GROK_WS_NOT_CONNECTED',
            'WebSocket not connected. Use grok_ws_connect first.',
            name
          );
        }

        try {
          await wsHandler.send(safeArgs.message);
          result = {
            success: true,
            message: 'Message sent successfully'
          };
        } catch (sendError) {
          result = {
            success: false,
            error: sendError.message
          };
        }
        break;
      }

      case 'grok_ws_status': {
        if (!wsHandler) {
          result = {
            initialized: false,
            message: 'WebSocket handler not initialized'
          };
          break;
        }

        result = {
          initialized: true,
          ...wsHandler.getStats()
        };
        break;
      }

      case 'grok_stream': {
        // Use the existing generate function with streaming simulation
        // Note: True streaming is handled by grok_ws_* tools for WebSocket
        const response = await generate(safeArgs.prompt, {
          model: safeArgs.model,
          temperature: safeArgs.temperature,
          maxTokens: safeArgs.maxTokens,
          systemPrompt: safeArgs.systemPrompt,
          stream: true
        });

        result = {
          response: response.response,
          model: response.model,
          usage: response.usage,
          finishReason: response.finishReason,
          durationMs: response.durationMs,
          streamingNote: 'For real-time streaming, use grok_ws_connect and grok_ws_send'
        };
        break;
      }

      default:
        return createErrorResponse('GROK_TOOL_UNKNOWN', 'Unknown tool', name);
    }

    logger.info('Tool executed', {
      tool: name,
      durationMs: Date.now() - startedAt
    });

    return createSuccessResponse(result);
  } catch (error) {
    logger.error('Tool execution failed', { tool: name, error: error.message });

    // Handle specific error types
    if (error.message.includes('XAI_API_KEY')) {
      return createErrorResponse(
        'GROK_AUTH_ERROR',
        'xAI API key not configured. Set XAI_API_KEY environment variable.',
        name
      );
    }

    if (error.message.includes('401')) {
      return createErrorResponse(
        'GROK_AUTH_ERROR',
        'Invalid xAI API key. Please check your XAI_API_KEY.',
        name
      );
    }

    if (error.message.includes('429')) {
      return createErrorResponse(
        'GROK_RATE_LIMIT',
        'Rate limit exceeded. Please wait and try again.',
        name
      );
    }

    if (error.message.includes('timeout')) {
      return createErrorResponse(
        'GROK_TIMEOUT',
        'Request timed out. Try a shorter prompt or increase timeout.',
        name
      );
    }

    return createErrorResponse(
      'GROK_ERROR',
      `Error: ${error.message}`,
      name
    );
  }
});

// Start server
async function main() {
  // Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    logger.warn('Configuration issues detected', {
      errors: configValidation.errors
    });
  }

  // Check API connectivity
  const health = await checkHealth();
  if (health.available) {
    logger.info('xAI API connection verified', {
      latency: health.latency,
      modelCount: health.modelCount
    });
  } else {
    logger.warn('xAI API not available', {
      error: health.error,
      host: health.host
    });
  }

  // Start MCP transport
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('HYDRA Grok MCP Server running on stdio', {
    version: CONFIG.SERVER_VERSION,
    defaultModel: CONFIG.DEFAULT_MODEL
  });
}

main().catch((error) => {
  logger.error('Server failed to start', { error: error.message });
  process.exit(1);
});
