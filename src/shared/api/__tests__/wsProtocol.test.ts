import { describe, expect, it } from 'vitest';
import type { WsClientMessage, WsServerMessage } from '../schemas';
import { wsServerMessageSchema } from '../schemas';

describe('wsServerMessageSchema — WebSocket protocol validation', () => {
  describe('start messages', () => {
    it('should parse a minimal start message', () => {
      const msg = { type: 'start', id: 'msg-1', model: 'claude-sonnet-4-6' };
      const result = wsServerMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should default files_loaded to empty array', () => {
      const msg = { type: 'start', id: 'msg-1', model: 'claude-sonnet-4-6' };
      const result = wsServerMessageSchema.parse(msg);
      expect(result.type).toBe('start');
      if (result.type === 'start') {
        expect(result.files_loaded).toEqual([]);
      }
    });

    it('should accept files_loaded array', () => {
      const msg = { type: 'start', id: 'msg-1', model: 'claude-sonnet-4-6', files_loaded: ['a.ts'] };
      const result = wsServerMessageSchema.parse(msg);
      if (result.type === 'start') {
        expect(result.files_loaded).toEqual(['a.ts']);
      }
    });
  });

  describe('token messages', () => {
    it('should parse a token message', () => {
      const result = wsServerMessageSchema.parse({ type: 'token', content: 'Hello' });
      expect(result.type).toBe('token');
    });

    it('should parse empty content token', () => {
      const result = wsServerMessageSchema.safeParse({ type: 'token', content: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('tool lifecycle messages', () => {
    it('should parse tool_call', () => {
      const msg = { type: 'tool_call', name: 'read_file', args: { path: '/src/app.ts' }, iteration: 1 };
      const result = wsServerMessageSchema.parse(msg);
      if (result.type === 'tool_call') {
        expect(result.name).toBe('read_file');
        expect(result.args.path).toBe('/src/app.ts');
        expect(result.iteration).toBe(1);
      }
    });

    it('should parse tool_result success', () => {
      const msg = { type: 'tool_result', name: 'read_file', success: true, summary: 'Read 50 lines', iteration: 1 };
      const result = wsServerMessageSchema.parse(msg);
      if (result.type === 'tool_result') {
        expect(result.success).toBe(true);
        expect(result.summary).toBe('Read 50 lines');
      }
    });

    it('should parse tool_result failure', () => {
      const msg = {
        type: 'tool_result',
        name: 'write_file',
        success: false,
        summary: 'Permission denied',
        iteration: 2,
      };
      const result = wsServerMessageSchema.parse(msg);
      if (result.type === 'tool_result') {
        expect(result.success).toBe(false);
      }
    });

    it('should parse tool_progress', () => {
      const msg = { type: 'tool_progress', iteration: 3, tools_completed: 2, tools_total: 5 };
      const result = wsServerMessageSchema.parse(msg);
      if (result.type === 'tool_progress') {
        expect(result.tools_completed).toBe(2);
        expect(result.tools_total).toBe(5);
      }
    });
  });

  describe('control messages', () => {
    it('should parse complete message', () => {
      const result = wsServerMessageSchema.parse({ type: 'complete', duration_ms: 2500 });
      if (result.type === 'complete') {
        expect(result.duration_ms).toBe(2500);
      }
    });

    it('should parse error message', () => {
      const result = wsServerMessageSchema.parse({ type: 'error', message: 'Rate limit exceeded' });
      if (result.type === 'error') {
        expect(result.message).toBe('Rate limit exceeded');
        expect(result.code).toBeUndefined();
      }
    });

    it('should parse error message with code', () => {
      const result = wsServerMessageSchema.parse({ type: 'error', message: 'Rate limit', code: 'rate_limited' });
      if (result.type === 'error') {
        expect(result.code).toBe('rate_limited');
      }
    });

    it('should parse pong', () => {
      const result = wsServerMessageSchema.parse({ type: 'pong' });
      expect(result.type).toBe('pong');
    });

    it('should parse heartbeat', () => {
      const result = wsServerMessageSchema.parse({ type: 'heartbeat' });
      expect(result.type).toBe('heartbeat');
    });
  });

  describe('iteration messages', () => {
    it('should parse iteration with number and max', () => {
      const result = wsServerMessageSchema.parse({ type: 'iteration', number: 3, max: 10 });
      if (result.type === 'iteration') {
        expect(result.number).toBe(3);
        expect(result.max).toBe(10);
      }
    });
  });

  describe('fallback messages', () => {
    it('should parse fallback with from, to, and reason', () => {
      const result = wsServerMessageSchema.parse({
        type: 'fallback',
        from: 'claude-opus-4-6',
        to: 'claude-sonnet-4-6',
        reason: 'Rate limited',
      });
      if (result.type === 'fallback') {
        expect(result.from).toBe('claude-opus-4-6');
        expect(result.to).toBe('claude-sonnet-4-6');
        expect(result.reason).toBe('Rate limited');
      }
    });
  });

  describe('view_hint messages', () => {
    it('should parse view_hint with views array', () => {
      const result = wsServerMessageSchema.parse({ type: 'view_hint', views: ['settings', 'agents'] });
      if (result.type === 'view_hint') {
        expect(result.views).toEqual(['settings', 'agents']);
      }
    });

    it('should parse view_hint with empty views', () => {
      const result = wsServerMessageSchema.parse({ type: 'view_hint', views: [] });
      if (result.type === 'view_hint') {
        expect(result.views).toEqual([]);
      }
    });
  });

  describe('rejection of invalid messages', () => {
    it('should reject unknown type', () => {
      expect(wsServerMessageSchema.safeParse({ type: 'unknown' }).success).toBe(false);
    });

    it('should reject missing type', () => {
      expect(wsServerMessageSchema.safeParse({ content: 'hello' }).success).toBe(false);
    });

    it('should reject start without id', () => {
      expect(wsServerMessageSchema.safeParse({ type: 'start', model: 'm' }).success).toBe(false);
    });

    it('should reject tool_call without iteration', () => {
      expect(wsServerMessageSchema.safeParse({ type: 'tool_call', name: 'x', args: {} }).success).toBe(false);
    });
  });
});

describe('WsClientMessage type', () => {
  it('should accept execute message', () => {
    const msg: WsClientMessage = { type: 'execute', prompt: 'Hello' };
    expect(msg.type).toBe('execute');
  });

  it('should accept execute with optional fields', () => {
    const msg: WsClientMessage = {
      type: 'execute',
      prompt: 'Hello',
      model: 'claude-sonnet-4-6',
      tools_enabled: true,
      session_id: 'sess-1',
    };
    expect(msg.type).toBe('execute');
    expect(msg.model).toBe('claude-sonnet-4-6');
  });

  it('should accept cancel message', () => {
    const msg: WsClientMessage = { type: 'cancel' };
    expect(msg.type).toBe('cancel');
  });

  it('should accept ping message', () => {
    const msg: WsClientMessage = { type: 'ping' };
    expect(msg.type).toBe('ping');
  });
});
