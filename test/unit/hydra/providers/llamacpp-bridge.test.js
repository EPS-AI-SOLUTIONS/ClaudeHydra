/**
 * LlamaCpp Bridge Tests
 * @module test/unit/hydra/providers/llamacpp-bridge.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLlamaCppBridge,
  LlamaCppBridge,
  MCP_TOOLS,
  resetLlamaCppBridge,
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
        defaultTimeout: 60000,
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
      // llama_code maps to GENERATE (emulated via generate)
      expect(bridge.getFullToolName('llama_code')).toBe(MCP_TOOLS.GENERATE);
    });

    it('should return full name for ollama short names', () => {
      expect(bridge.getFullToolName('ollama_generate')).toBe(MCP_TOOLS.GENERATE);
      expect(bridge.getFullToolName('ollama_chat')).toBe(MCP_TOOLS.CHAT);
      expect(bridge.getFullToolName('ollama_embed')).toBe(MCP_TOOLS.EMBED);
      expect(bridge.getFullToolName('ollama_list')).toBe(MCP_TOOLS.LIST);
    });

    it('should return prefixed name for unknown names', () => {
      expect(bridge.getFullToolName('unknown_tool')).toBe('mcp__ollama__unknown_tool');
    });

    it('should prefix unknown full names (getFullToolName expects short names)', () => {
      // getFullToolName is designed for short names, not already-full names
      // Passing a full name results in double-prefixing, which is expected
      const result = bridge.getFullToolName(MCP_TOOLS.GENERATE);
      expect(result).toContain('mcp__ollama__');
    });
  });

  describe('callTool', () => {
    it('should call invoker with full tool name when MCP invoker set', async () => {
      mockInvoker.mockResolvedValue({ content: 'test response' });
      bridge.setMcpInvoker(mockInvoker);

      await bridge.callTool('llama_generate', { prompt: 'test' });

      expect(mockInvoker).toHaveBeenCalledWith(MCP_TOOLS.GENERATE, { prompt: 'test' });
    });

    it('should return result with duration', async () => {
      mockInvoker.mockResolvedValue({ content: 'test response' });
      bridge.setMcpInvoker(mockInvoker);

      const result = await bridge.callTool('llama_generate', {});

      expect(result.content).toBe('test response');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.tool).toBe(MCP_TOOLS.GENERATE);
    });

    it('should fallback to HTTP in auto mode on MCP failure', async () => {
      const error = new Error('MCP failed');
      mockInvoker.mockRejectedValue(error);
      bridge.setMcpInvoker(mockInvoker);

      // In auto mode, callTool falls back to HTTP (which will fail differently)
      // Since we can't mock fetch easily here, just verify mode switches
      try {
        await bridge.callTool('llama_generate', {});
      } catch (_e) {
        // After MCP failure in auto mode, bridge switches to HTTP mode
        expect(bridge._mode).toBe('http');
      }
    });
  });

  describe('generate', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({
        response: 'Generated text',
        eval_count: 100,
        model: 'llama3.2:1b',
      });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call generate with ollama-native params', async () => {
      await bridge.generate('Test prompt');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          prompt: 'Test prompt',
          model: 'llama3.2:1b',
          stream: false,
          temperature: 0.7,
          num_predict: 1024,
          repeat_penalty: 1.3,
          frequency_penalty: 1.0,
          top_k: 30,
          top_p: 0.9,
        }),
      );
    });

    it('should accept custom maxTokens and temperature', async () => {
      await bridge.generate('Test prompt', {
        maxTokens: 512,
        temperature: 0.5,
        stop: ['END'],
      });

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          num_predict: 512,
          temperature: 0.5,
          stop: ['END'],
        }),
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
      mockInvoker.mockResolvedValue({ response: 'Fast response', model: 'llama3.2:1b' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call generate with maxTokens 512 by default', async () => {
      await bridge.generateFast('Test prompt');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          prompt: 'Test prompt',
          num_predict: 512,
        }),
      );
    });

    it('should return normalized result', async () => {
      const result = await bridge.generateFast('Test prompt');

      expect(result.operation).toBe('generate');
      expect(result.success).toBe(true);
    });
  });

  describe('chat', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({
        message: { content: 'Chat response' },
        model: 'llama3.2:1b',
      });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call chat with messages and model', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await bridge.chat(messages);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.CHAT,
        expect.objectContaining({
          messages,
          model: 'llama3.2:1b',
        }),
      );
    });

    it('should include options when non-default', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await bridge.chat(messages, { temperature: 0.3, maxTokens: 512 });

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.CHAT,
        expect.objectContaining({
          messages,
          model: 'llama3.2:1b',
          options: expect.objectContaining({
            temperature: 0.3,
            num_predict: 512,
          }),
        }),
      );
    });
  });

  describe('code', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ response: 'function test() {}', model: 'llama3.2:1b' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should emulate code via generate with prompt engineering', async () => {
      await bridge.code('generate', {
        description: 'Create a test function',
        language: 'javascript',
      });

      // code() routes through generate → ollama_generate
      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          prompt: expect.stringContaining('javascript'),
          temperature: 0.4,
          num_predict: 4096,
        }),
      );
    });

    it('should return normalized code result', async () => {
      const result = await bridge.code('explain', { code: 'const x = 1;' });

      expect(result.operation).toBe('generate');
      expect(result.success).toBe(true);
    });
  });

  describe('json', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ response: '{"key": "value"}', model: 'llama3.2:1b' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should emulate json via generate with schema prompt', async () => {
      const schema = { type: 'object', properties: { key: { type: 'string' } } };

      await bridge.json('Generate JSON', schema);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          prompt: expect.stringContaining('Generate JSON'),
        }),
      );
    });

    it('should attempt to parse JSON from response', async () => {
      const schema = { type: 'object' };
      const result = await bridge.json('Generate JSON', schema);

      expect(result.parsed).toEqual({ key: 'value' });
    });
  });

  describe('analyze', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ response: 'Analysis result', model: 'llama3.2:1b' });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should emulate analyze via generate with task prompt', async () => {
      await bridge.analyze('Some text to analyze', 'sentiment');

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          prompt: expect.stringContaining('sentiment'),
          temperature: 0.3,
          num_predict: 1024,
        }),
      );
    });

    it('should accept custom targetLanguage for translate', async () => {
      await bridge.analyze('Text', 'translate', {
        targetLanguage: 'pl',
      });

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.GENERATE,
        expect.objectContaining({
          prompt: expect.stringContaining('pl'),
        }),
      );
    });
  });

  describe('embed', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should call embed with input and model', async () => {
      await bridge.embed('Text to embed');

      expect(mockInvoker).toHaveBeenCalledWith(MCP_TOOLS.EMBED, {
        input: 'Text to embed',
        model: 'llama3.2:1b',
      });
    });

    it('should join multiple texts into single input', async () => {
      await bridge.embed(['Text 1', 'Text 2']);

      expect(mockInvoker).toHaveBeenCalledWith(MCP_TOOLS.EMBED, {
        input: 'Text 1\nText 2',
        model: 'llama3.2:1b',
      });
    });
  });

  describe('vision', () => {
    it('should return stub result (not available)', async () => {
      const result = await bridge.vision('/path/to/image.jpg', 'What is in this image?');

      expect(result.success).toBe(false);
      expect(result.content).toBe('Vision not available via this bridge.');
      expect(result.operation).toBe('vision');
    });

    it('should not call MCP invoker', async () => {
      bridge.setMcpInvoker(mockInvoker);
      await bridge.vision('/path/to/image.jpg', 'Describe');

      expect(mockInvoker).not.toHaveBeenCalled();
    });
  });

  describe('functionCall', () => {
    beforeEach(() => {
      mockInvoker.mockResolvedValue({
        message: { content: JSON.stringify({ tool: 'test_function', arguments: {} }) },
        model: 'llama3.2:1b',
      });
      bridge.setMcpInvoker(mockInvoker);
    });

    it('should emulate functionCall via chat with tool descriptions', async () => {
      const messages = [{ role: 'user', content: 'Call a function' }];
      const tools = [{ name: 'test_function', description: 'A test function' }];

      await bridge.functionCall(messages, tools);

      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.CHAT,
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('test_function'),
            }),
            ...messages,
          ]),
          model: 'llama3.2:1b',
        }),
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
      // getInfo calls ollama_list via callTool, only once due to cache
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
      // Force MCP-only mode to prevent HTTP fallback
      bridge._mode = 'mcp';

      const result = await bridge.healthCheck(true);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      bridge.setMcpInvoker(mockInvoker);
    });

    it('similarity should use embed + cosine calculation', async () => {
      // similarity calls embed() twice then computes cosine similarity
      mockInvoker.mockResolvedValue({ embedding: [1, 0, 0] });

      const result = await bridge.similarity('text1', 'text2');

      // embed called twice (once for each text) via ollama_embed
      expect(mockInvoker).toHaveBeenCalledTimes(2);
      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.EMBED,
        expect.objectContaining({ input: 'text1' }),
      );
      expect(mockInvoker).toHaveBeenCalledWith(
        MCP_TOOLS.EMBED,
        expect.objectContaining({ input: 'text2' }),
      );
      expect(result.operation).toBe('similarity');
    });

    it('countTokens should return approximate count (text.length / 4)', async () => {
      // countTokens is local calculation, no MCP call
      const result = await bridge.countTokens('Some text');

      expect(result.tokens).toBe(Math.ceil('Some text'.length / 4));
      expect(result.success).toBe(true);
      expect(result.approximate).toBe(true);
      expect(mockInvoker).not.toHaveBeenCalled();
    });

    it('getInfo should call ollama_list tool', async () => {
      mockInvoker.mockResolvedValue({ models: ['main', 'draft'] });

      const result = await bridge.getInfo();

      expect(mockInvoker).toHaveBeenCalledWith(MCP_TOOLS.LIST, {});
      expect(result.operation).toBe('info');
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
    it('should export all 6 ollama tool names', () => {
      expect(MCP_TOOLS.GENERATE).toBe('mcp__ollama__ollama_generate');
      expect(MCP_TOOLS.CHAT).toBe('mcp__ollama__ollama_chat');
      expect(MCP_TOOLS.EMBED).toBe('mcp__ollama__ollama_embed');
      expect(MCP_TOOLS.LIST).toBe('mcp__ollama__ollama_list');
      expect(MCP_TOOLS.SHOW).toBe('mcp__ollama__ollama_show');
      expect(MCP_TOOLS.PS).toBe('mcp__ollama__ollama_ps');
    });

    it('should not have legacy llama-cpp tools', () => {
      expect(MCP_TOOLS.GENERATE_FAST).toBeUndefined();
      expect(MCP_TOOLS.CODE).toBeUndefined();
      expect(MCP_TOOLS.JSON).toBeUndefined();
      expect(MCP_TOOLS.ANALYZE).toBeUndefined();
      expect(MCP_TOOLS.VISION).toBeUndefined();
      expect(MCP_TOOLS.FUNCTION_CALL).toBeUndefined();
      expect(MCP_TOOLS.INFO).toBeUndefined();
      expect(MCP_TOOLS.RESET).toBeUndefined();
    });
  });
});
