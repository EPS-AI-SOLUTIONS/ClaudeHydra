/**
 * LlamaCpp Bridge Tests
 * @module test/unit/hydra/providers/llamacpp-bridge.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LlamaCppBridge,
  getLlamaCppBridge,
  resetLlamaCppBridge,
  MCP_TOOLS
} from '../../../../src/hydra/providers/llamacpp-bridge.js';

describe('LlamaCppBridge', () => {
  let bridge;
  let mockInvoker;

  beforeEach(() => {
    resetLlamaCppBridge();
    mockInvoker = vi.fn();
    bridge = new LlamaCppBridge();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLlamaCppBridge();
  });

  describe('Constructor', () => {
    it('should create instance with default config', () => {
      const b = new LlamaCppBridge();

      expect(b.mcpInvoker).toBeNull();
      expect(b.defaultTimeout).toBe(120000);
    });

    it('should accept custom config', () => {
      const customInvoker = vi.fn();
      const b = new LlamaCppBridge({
        mcpInvoker: customInvoker,
        defaultTimeout: 60000
      });

      expect(b.mcpInvoker).toBe(customInvoker);
      expect(b.defaultTimeout).toBe(60000);
    });
  });

  describe('setMcpInvoker', () => {
    it('should set the MCP invoker', () => {
      bridge.setMcpInvoker(mockInvoker);

      expect(bridge.mcpInvoker).toBe(mockInvoker);
    });
  });

  describe('getFullToolName', () => {
    it('should return full name for known short names', () => {
      expect(bridge.getFullToolName('llama_generate')).toBe(MCP_TOOLS.GENERATE);
      expect(bridge.getFullToolName('llama_chat')).toBe(MCP_TOOLS.CHAT);
      expect(bridge.getFullToolName('llama_code')).toBe(MCP_TOOLS.CODE);
    });

    it('should return input unchanged for unknown names', () => {
      expect(bridge.getFullToolName('unknown_tool')).toBe('unknown_tool');
      expect(bridge.getFullToolName(MCP_TOOLS.GENERATE)).toBe(MCP_TOOLS.GENERATE);
    });
  });

  describe('callTool', () => {
    it('should throw error when invoker not set', async () => {
      await expect(bridge.callTool('llama_generate', {}))
        .rejects.toThrow('MCP invoker not set. Call setMcpInvoker() first.');
    });

    it('should call invoker with full tool name', async () => {
      mockInvoker.mockResolvedValue({ content: 'test response' });
      bridge.setMcpInvoker(mockInvoker);

      await bridge.callTool('llama_generate', { prompt: 'test' });

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        { prompt: 'test' }
      );
    });

    it('should return result with duration', async () => {
      mockInvoker.mockResolvedValue({ content: 'test response' });
      bridge.setMcpInvoker(mockInvoker);

      const result = await bridge.callTool('llama_generate', {});

      expect(result.content).toBe('test response');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.tool).toBe(MCP_TOOLS.GENERATE);
    });

    it('should handle errors and add metadata', async () => {
      const error = new Error('Tool failed');
      mockInvoker.mockRejectedValue(error);
      bridge.setMcpInvoker(mockInvoker);

      await expect(bridge.callTool('llama_generate', {})).rejects.toThrow('Tool failed');
    });
  });

  describe('generate', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({
        content: 'Generated text',
        tokens: 100
      });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call generate with default options', async () => {
      await bridge.generate('Test prompt');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          prompt: 'Test prompt',
          max_tokens: 2048,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
          stop: []
        })
      );
    });

    it('should accept custom options', async () => {
      await bridge.generate('Test prompt', {
        maxTokens: 1024,
        temperature: 0.5,
        stop: ['END']
      });

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          max_tokens: 1024,
          temperature: 0.5,
          stop: ['END']
        })
      );
    });

    it('should return normalized result', async () => {
      const result = await bridge.generate('Test prompt');

      expect(result.content).toBe('Generated text');
      expect(result.success).toBe(true);
      expect(result.operation).toBe('generate');
    });
  });

  describe('generateFast', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ content: 'Fast response' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call generateFast with default options', async () => {
      await bridge.generateFast('Test prompt');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE_FAST,
        expect.objectContaining({
          prompt: 'Test prompt',
          max_tokens: 512,
          temperature: 0.3
        })
      );
    });

    it('should return normalized result', async () => {
      const result = await bridge.generateFast('Test prompt');

      expect(result.operation).toBe('generate_fast');
      expect(result.success).toBe(true);
    });
  });

  describe('chat', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ content: 'Chat response' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call chat with messages', async () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      await bridge.chat(messages);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.CHAT,
        expect.objectContaining({
          messages,
          max_tokens: 2048,
          temperature: 0.7
        })
      );
    });
  });

  describe('code', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ content: 'function test() {}' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call code with task and params', async () => {
      await bridge.code('generate', {
        description: 'Create a test function',
        language: 'javascript'
      });

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.CODE,
        expect.objectContaining({
          task: 'generate',
          description: 'Create a test function',
          language: 'javascript'
        })
      );
    });

    it('should return normalized code result', async () => {
      const result = await bridge.code('explain', { code: 'const x = 1;' });

      expect(result.operation).toBe('code');
      expect(result.success).toBe(true);
    });
  });

  describe('json', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ content: '{"key": "value"}' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call json with schema', async () => {
      const schema = { type: 'object', properties: { key: { type: 'string' } } };

      await bridge.json('Generate JSON', schema);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.JSON,
        expect.objectContaining({
          prompt: 'Generate JSON',
          schema,
          max_tokens: 2048
        })
      );
    });
  });

  describe('analyze', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ content: 'Analysis result' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call analyze with text and task', async () => {
      await bridge.analyze('Some text to analyze', 'sentiment');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.ANALYZE,
        expect.objectContaining({
          text: 'Some text to analyze',
          task: 'sentiment',
          categories: [],
          target_language: 'en'
        })
      );
    });

    it('should accept custom options', async () => {
      await bridge.analyze('Text', 'translate', {
        targetLanguage: 'pl',
        categories: ['positive', 'negative']
      });

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.ANALYZE,
        expect.objectContaining({
          target_language: 'pl',
          categories: ['positive', 'negative']
        })
      );
    });
  });

  describe('embed', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ result: [0.1, 0.2, 0.3] });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call embed with single text', async () => {
      await bridge.embed('Text to embed');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.EMBED,
        { text: 'Text to embed' }
      );
    });

    it('should call embed with multiple texts', async () => {
      await bridge.embed(['Text 1', 'Text 2']);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.EMBED,
        { texts: ['Text 1', 'Text 2'] }
      );
    });
  });

  describe('vision', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ content: 'Image description' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call vision with image and prompt', async () => {
      await bridge.vision('/path/to/image.jpg', 'What is in this image?');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.VISION,
        expect.objectContaining({
          image: '/path/to/image.jpg',
          prompt: 'What is in this image?',
          max_tokens: 1024
        })
      );
    });
  });

  describe('functionCall', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({
        content: JSON.stringify({ name: 'test_function', arguments: {} })
      });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call functionCall with messages and tools', async () => {
      const messages = [{ role: 'user', content: 'Call a function' }];
      const tools = [{ name: 'test_function', description: 'A test function' }];

      await bridge.functionCall(messages, tools);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.FUNCTION_CALL,
        expect.objectContaining({
          messages,
          tools,
          max_tokens: 2048,
          tool_choice: 'auto'
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return cached result if available', async () => {
      mockInvoker.mockResolvedValue({ models: ['main', 'draft'] });
      bridge.setMcpInvoker(mockInvoker);

      // First call
      await bridge.healthCheck();
      // Second call should use cache
      const result = await bridge.healthCheck();

      expect(result.available).toBe(true);
      expect(mockInvoker).toHaveBeenCalledTimes(1);
    });

    it('should force refresh when requested', async () => {
      mockInvoker.mockResolvedValue({ models: ['main'] });
      bridge.setMcpInvoker(mockInvoker);

      await bridge.healthCheck();
      await bridge.healthCheck(true);

      expect(mockInvoker).toHaveBeenCalledTimes(2);
    });

    it('should return unavailable when error occurs', async () => {
      mockInvoker.mockRejectedValue(new Error('Connection failed'));
      bridge.setMcpInvoker(mockInvoker);

      const result = await bridge.healthCheck(true);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      bridge.setMcpInvoker(mockInvoker);
    });

    it('similarity should calculate semantic similarity', async () => {
      mockInvoker.mockResolvedValue({ similarity: 0.85 });

      await bridge.similarity('text1', 'text2');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.SIMILARITY,
        { text1: 'text1', text2: 'text2' }
      );
    });

    it('tokenize should tokenize text', async () => {
      mockInvoker.mockResolvedValue({ tokens: [1, 2, 3] });

      await bridge.tokenize('Hello world', true);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.TOKENIZE,
        { text: 'Hello world', return_tokens: true }
      );
    });

    it('countTokens should count tokens', async () => {
      mockInvoker.mockResolvedValue({ count: 10 });

      await bridge.countTokens('Some text');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.COUNT_TOKENS,
        { text: 'Some text' }
      );
    });

    it('getInfo should return model info', async () => {
      mockInvoker.mockResolvedValue({ models: ['main', 'draft'] });

      const result = await bridge.getInfo();

      expect(mockInvoker).toHaveBeenCalledWith(MCP_TOOLS.INFO, {});
      expect(result.operation).toBe('info');
    });

    it('reset should reset model state', async () => {
      mockInvoker.mockResolvedValue({ success: true });

      await bridge.reset();

      expect(mockInvoker).toHaveBeenCalledWith(MCP_TOOLS.RESET, {});
    });
  });

  describe('Singleton', () => {
    it('getLlamaCppBridge should return singleton', () => {
      resetLlamaCppBridge();

      const bridge1 = getLlamaCppBridge();
      const bridge2 = getLlamaCppBridge();

      expect(bridge1).toBe(bridge2);
    });

    it('resetLlamaCppBridge should clear singleton', () => {
      const bridge1 = getLlamaCppBridge();
      resetLlamaCppBridge();
      const bridge2 = getLlamaCppBridge();

      expect(bridge1).not.toBe(bridge2);
    });
  });

  describe('MCP_TOOLS', () => {
    it('should export all tool names', () => {
      expect(MCP_TOOLS.GENERATE).toBe('mcp__llama-cpp__llama_generate');
      expect(MCP_TOOLS.GENERATE_FAST).toBe('mcp__llama-cpp__llama_generate_fast');
      expect(MCP_TOOLS.CHAT).toBe('mcp__llama-cpp__llama_chat');
      expect(MCP_TOOLS.JSON).toBe('mcp__llama-cpp__llama_json');
      expect(MCP_TOOLS.CODE).toBe('mcp__llama-cpp__llama_code');
      expect(MCP_TOOLS.ANALYZE).toBe('mcp__llama-cpp__llama_analyze');
      expect(MCP_TOOLS.EMBED).toBe('mcp__llama-cpp__llama_embed');
      expect(MCP_TOOLS.VISION).toBe('mcp__llama-cpp__llama_vision');
      expect(MCP_TOOLS.FUNCTION_CALL).toBe('mcp__llama-cpp__llama_function_call');
      expect(MCP_TOOLS.INFO).toBe('mcp__llama-cpp__llama_info');
      expect(MCP_TOOLS.RESET).toBe('mcp__llama-cpp__llama_reset');
    });
  });
});
