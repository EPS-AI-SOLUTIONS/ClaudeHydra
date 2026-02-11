import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockInvoke } from '../test/setup';
import { claudeIpc, parallelIpc } from './ipc';

describe('claudeIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockInvoke.mockImplementation((cmd: string, _args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'start_claude_session':
          return Promise.resolve('session-uuid-12345');
        case 'stop_claude_session':
          return Promise.resolve(undefined);
        case 'get_session_status':
          return Promise.resolve({
            is_active: true,
            pending_approval: false,
            auto_approve_all: false,
            approved_count: 5,
            denied_count: 1,
            auto_approved_count: 10,
          });
        case 'send_input':
          return Promise.resolve(undefined);
        case 'approve_action':
          return Promise.resolve(undefined);
        case 'deny_action':
          return Promise.resolve(undefined);
        case 'toggle_auto_approve_all':
          return Promise.resolve(undefined);
        case 'get_approval_rules':
          return Promise.resolve([
            { id: '1', pattern: 'Bash', enabled: true },
            { id: '2', pattern: 'Read', enabled: true },
          ]);
        case 'update_approval_rules':
          return Promise.resolve(undefined);
        case 'get_approval_history':
          return Promise.resolve([]);
        case 'clear_approval_history':
          return Promise.resolve(undefined);
        default:
          return Promise.resolve();
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    mockInvoke.mockClear();
  });

  describe('Session Management', () => {
    describe('startSession', () => {
      it('calls invoke with correct command and parameters', async () => {
        await claudeIpc.startSession('/work/dir', '/path/to/cli', 'Hello');

        expect(mockInvoke).toHaveBeenCalledWith('start_claude_session', {
          workingDir: '/work/dir',
          cliPath: '/path/to/cli',
          initialPrompt: 'Hello',
        });
      });

      it('returns session ID on success', async () => {
        const sessionId = await claudeIpc.startSession('/dir', '/cli');
        expect(sessionId).toBe('session-uuid-12345');
      });

      it('handles optional initialPrompt', async () => {
        await claudeIpc.startSession('/dir', '/cli');

        expect(mockInvoke).toHaveBeenCalledWith('start_claude_session', {
          workingDir: '/dir',
          cliPath: '/cli',
          initialPrompt: undefined,
        });
      });

      it('propagates errors', async () => {
        mockInvoke.mockRejectedValueOnce(new Error('Failed to start'));

        await expect(claudeIpc.startSession('/dir', '/cli')).rejects.toThrow('Failed to start');
      });
    });

    describe('stopSession', () => {
      it('calls invoke with correct command', async () => {
        await claudeIpc.stopSession();
        expect(mockInvoke).toHaveBeenCalledWith('stop_claude_session', undefined);
      });
    });

    describe('getStatus', () => {
      it('returns session status', async () => {
        const status = await claudeIpc.getStatus();

        expect(status).toEqual({
          is_active: true,
          pending_approval: false,
          auto_approve_all: false,
          approved_count: 5,
          denied_count: 1,
          auto_approved_count: 10,
        });
      });

      it('returns default status when not in Tauri', async () => {
        // Temporarily remove Tauri
        const originalTauri = (window as any).__TAURI__;
        delete (window as any).__TAURI__;
        delete (window as any).__TAURI_INTERNALS__;

        const status = await claudeIpc.getStatus();

        expect(status).toEqual({
          is_active: false,
          pending_approval: false,
          auto_approve_all: false,
          approved_count: 0,
          denied_count: 0,
          auto_approved_count: 0,
        });

        // Restore
        (window as any).__TAURI__ = originalTauri;
      });
    });
  });

  describe('Input/Output', () => {
    describe('sendInput', () => {
      it('sends input to Claude CLI', async () => {
        await claudeIpc.sendInput('test command');

        expect(mockInvoke).toHaveBeenCalledWith('send_input', {
          input: 'test command',
        });
      });

      it('handles empty input', async () => {
        await claudeIpc.sendInput('');

        expect(mockInvoke).toHaveBeenCalledWith('send_input', {
          input: '',
        });
      });

      it('handles multi-line input', async () => {
        const multiLine = 'line1\nline2\nline3';
        await claudeIpc.sendInput(multiLine);

        expect(mockInvoke).toHaveBeenCalledWith('send_input', {
          input: multiLine,
        });
      });

      it('handles special characters', async () => {
        const special = 'echo "hello $USER" && cd /tmp';
        await claudeIpc.sendInput(special);

        expect(mockInvoke).toHaveBeenCalledWith('send_input', {
          input: special,
        });
      });
    });
  });

  describe('Approval Actions', () => {
    describe('approve', () => {
      it('calls approve_action command', async () => {
        await claudeIpc.approve();
        expect(mockInvoke).toHaveBeenCalledWith('approve_action', undefined);
      });
    });

    describe('deny', () => {
      it('calls deny_action command', async () => {
        await claudeIpc.deny();
        expect(mockInvoke).toHaveBeenCalledWith('deny_action', undefined);
      });
    });

    describe('toggleAutoApproveAll', () => {
      it('enables auto-approve', async () => {
        await claudeIpc.toggleAutoApproveAll(true);

        expect(mockInvoke).toHaveBeenCalledWith('toggle_auto_approve_all', {
          enabled: true,
        });
      });

      it('disables auto-approve', async () => {
        await claudeIpc.toggleAutoApproveAll(false);

        expect(mockInvoke).toHaveBeenCalledWith('toggle_auto_approve_all', {
          enabled: false,
        });
      });
    });
  });

  describe('Rules Management', () => {
    describe('getRules', () => {
      it('returns approval rules', async () => {
        const rules = await claudeIpc.getRules();

        expect(rules).toEqual([
          { id: '1', pattern: 'Bash', enabled: true },
          { id: '2', pattern: 'Read', enabled: true },
        ]);
      });

      it('returns empty array when not in Tauri', async () => {
        const originalTauri = (window as any).__TAURI__;
        delete (window as any).__TAURI__;
        delete (window as any).__TAURI_INTERNALS__;

        const rules = await claudeIpc.getRules();
        expect(rules).toEqual([]);

        (window as any).__TAURI__ = originalTauri;
      });
    });

    describe('updateRules', () => {
      it('sends updated rules', async () => {
        const newRules = [
          { id: '1', pattern: 'Bash', enabled: false },
          { id: '3', pattern: 'Write', enabled: true },
        ];

        await claudeIpc.updateRules(newRules as any);

        expect(mockInvoke).toHaveBeenCalledWith('update_approval_rules', {
          rules: newRules,
        });
      });
    });
  });

  describe('History', () => {
    describe('getHistory', () => {
      it('returns approval history', async () => {
        mockInvoke.mockResolvedValueOnce([
          { id: '1', action: 'approved', timestamp: '2024-01-01' },
        ]);

        const history = await claudeIpc.getHistory();
        expect(history).toHaveLength(1);
      });

      it('returns empty array when not in Tauri', async () => {
        const originalTauri = (window as any).__TAURI__;
        delete (window as any).__TAURI__;
        delete (window as any).__TAURI_INTERNALS__;

        const history = await claudeIpc.getHistory();
        expect(history).toEqual([]);

        (window as any).__TAURI__ = originalTauri;
      });
    });

    describe('clearHistory', () => {
      it('calls clear_approval_history command', async () => {
        await claudeIpc.clearHistory();
        expect(mockInvoke).toHaveBeenCalledWith('clear_approval_history', undefined);
      });
    });
  });
});

describe('parallelIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCpuInfo', () => {
    it('returns CPU info from Tauri', async () => {
      mockInvoke.mockResolvedValueOnce({
        logical_cores: 16,
        physical_cores: 8,
        rayon_threads: 16,
      });

      const cpuInfo = await parallelIpc.getCpuInfo();

      expect(cpuInfo).toEqual({
        logical_cores: 16,
        physical_cores: 8,
        rayon_threads: 16,
      });
    });

    it('returns browser info when not in Tauri', async () => {
      const originalTauri = (window as any).__TAURI__;
      delete (window as any).__TAURI__;
      delete (window as any).__TAURI_INTERNALS__;

      // Mock navigator.hardwareConcurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        value: 8,
        configurable: true,
      });

      const cpuInfo = await parallelIpc.getCpuInfo();

      expect(cpuInfo.logical_cores).toBe(8);
      expect(cpuInfo.physical_cores).toBe(4);
      expect(cpuInfo.rayon_threads).toBe(8);

      (window as any).__TAURI__ = originalTauri;
    });
  });

  describe('batchGenerate', () => {
    it('sends batch generation request', async () => {
      mockInvoke.mockResolvedValueOnce([
        { index: 0, prompt: 'Hello', response: 'Hi there!', error: null, duration_ms: 100 },
        { index: 1, prompt: 'Bye', response: 'Goodbye!', error: null, duration_ms: 80 },
      ]);

      const results = await parallelIpc.batchGenerate('llama3.2:3b', ['Hello', 'Bye'], {
        temperature: 0.7,
      });

      expect(mockInvoke).toHaveBeenCalledWith('ollama_batch_generate', {
        model: 'llama3.2:3b',
        prompts: ['Hello', 'Bye'],
        options: { temperature: 0.7 },
      });

      expect(results).toHaveLength(2);
      expect(results[0].response).toBe('Hi there!');
    });

    it('handles batch errors', async () => {
      mockInvoke.mockResolvedValueOnce([
        { index: 0, prompt: 'Hello', response: null, error: 'Model not found', duration_ms: 0 },
      ]);

      const results = await parallelIpc.batchGenerate('invalid-model', ['Hello']);

      expect(results[0].error).toBe('Model not found');
      expect(results[0].response).toBeNull();
    });
  });
});

describe('IPC - Prompting Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('handles very long prompts', async () => {
    const longPrompt = 'a'.repeat(10000);
    await claudeIpc.sendInput(longPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: longPrompt,
    });
  });

  it('handles JSON in prompts', async () => {
    const jsonPrompt = JSON.stringify({ action: 'test', data: [1, 2, 3] });
    await claudeIpc.sendInput(jsonPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: jsonPrompt,
    });
  });

  it('handles SQL queries in prompts', async () => {
    const sqlPrompt = `SELECT * FROM users WHERE name = 'O\\'Brien' AND age > 18;`;
    await claudeIpc.sendInput(sqlPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: sqlPrompt,
    });
  });

  it('handles regex patterns in prompts', async () => {
    const regexPrompt = 'Match this pattern: /^[a-z]+\\d{3}$/gi';
    await claudeIpc.sendInput(regexPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: regexPrompt,
    });
  });

  it('handles path separators in prompts', async () => {
    const pathPrompt = 'Check file at C:\\Users\\test\\file.txt and /home/user/file.txt';
    await claudeIpc.sendInput(pathPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: pathPrompt,
    });
  });

  it('handles emoji in prompts', async () => {
    const emojiPrompt = 'Great job! 🎉 Keep it up! 💪 #coding 🚀';
    await claudeIpc.sendInput(emojiPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: emojiPrompt,
    });
  });

  it('handles control characters in prompts', async () => {
    const controlPrompt = 'Tab:\tNewline:\nCarriage:\r';
    await claudeIpc.sendInput(controlPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: controlPrompt,
    });
  });

  it('handles markdown in prompts', async () => {
    const mdPrompt = `
# Title
## Subtitle

- Item 1
- Item 2

\`\`\`javascript
const x = 1;
\`\`\`

**Bold** and *italic*
`;
    await claudeIpc.sendInput(mdPrompt);

    expect(mockInvoke).toHaveBeenCalledWith('send_input', {
      input: mdPrompt,
    });
  });
});

describe('IPC - Session Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles complete session lifecycle', async () => {
    // 1. Start session
    mockInvoke.mockResolvedValueOnce('session-123');
    const sessionId = await claudeIpc.startSession('/project', '/cli', 'Hello');
    expect(sessionId).toBe('session-123');

    // 2. Enable auto-approve
    mockInvoke.mockResolvedValueOnce(undefined);
    await claudeIpc.toggleAutoApproveAll(true);

    // 3. Send multiple inputs
    mockInvoke.mockResolvedValue(undefined);
    await claudeIpc.sendInput('first command\n');
    await claudeIpc.sendInput('second command\n');
    await claudeIpc.sendInput('third command\n');

    // 4. Check status
    mockInvoke.mockResolvedValueOnce({
      is_active: true,
      pending_approval: false,
      auto_approve_all: true,
      approved_count: 3,
      denied_count: 0,
      auto_approved_count: 3,
    });
    const status = await claudeIpc.getStatus();
    expect(status.approved_count).toBe(3);

    // 5. Stop session
    mockInvoke.mockResolvedValueOnce(undefined);
    await claudeIpc.stopSession();

    expect(mockInvoke).toHaveBeenCalledTimes(7); // start + toggle + 3 inputs + status + stop
  });

  it('handles session restart', async () => {
    // Start first session
    mockInvoke.mockResolvedValueOnce('session-1');
    await claudeIpc.startSession('/proj1', '/cli');

    // Stop it
    mockInvoke.mockResolvedValueOnce(undefined);
    await claudeIpc.stopSession();

    // Start new session
    mockInvoke.mockResolvedValueOnce('session-2');
    const newSessionId = await claudeIpc.startSession('/proj2', '/cli', 'New session');

    expect(newSessionId).toBe('session-2');
  });
});
