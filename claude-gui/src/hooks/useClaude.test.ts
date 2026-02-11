import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClaudeStore } from '../stores/claudeStore';
import { useClaude } from './useClaude';

// Mock claudeIpc
vi.mock('../lib/ipc', () => ({
  claudeIpc: {
    startSession: vi.fn().mockResolvedValue('test-session-id'),
    stopSession: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({
      is_active: true,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    }),
    sendInput: vi.fn().mockResolvedValue(undefined),
    approve: vi.fn().mockResolvedValue(undefined),
    deny: vi.fn().mockResolvedValue(undefined),
    toggleAutoApproveAll: vi.fn().mockResolvedValue(undefined),
    getRules: vi.fn().mockResolvedValue([]),
    updateRules: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockResolvedValue([]),
    clearHistory: vi.fn().mockResolvedValue(undefined),
  },
}));

import { claudeIpc } from '../lib/ipc';

describe('useClaude hook', () => {
  beforeEach(() => {
    // Use fake timers to control setInterval in the hook
    vi.useFakeTimers();

    // Reset store
    useClaudeStore.setState({
      status: {
        is_active: false,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
      isConnecting: false,
      outputLines: [],
      pendingApproval: null,
      history: [],
      workingDir: 'C:\\test\\dir',
      cliPath: 'C:\\test\\cli.js',
    });

    // Clear mock call history but keep implementations
    vi.mocked(claudeIpc.startSession).mockClear();
    vi.mocked(claudeIpc.stopSession).mockClear();
    vi.mocked(claudeIpc.getStatus).mockClear();
    vi.mocked(claudeIpc.sendInput).mockClear();
    vi.mocked(claudeIpc.approve).mockClear();
    vi.mocked(claudeIpc.deny).mockClear();
    vi.mocked(claudeIpc.toggleAutoApproveAll).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial state', () => {
    it('returns initial status from store', () => {
      const { result } = renderHook(() => useClaude());

      expect(result.current.status.is_active).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.pendingApproval).toBeNull();
    });
  });

  describe('startSession', () => {
    it('calls IPC startSession with correct parameters', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.startSession('Test prompt');
      });

      expect(claudeIpc.startSession).toHaveBeenCalledWith(
        'C:\\test\\dir',
        'C:\\test\\cli.js',
        'Test prompt',
      );
    });

    it('sets connecting state during session start', async () => {
      const { result } = renderHook(() => useClaude());

      const startPromise = act(async () => {
        await result.current.startSession();
      });

      // Check connecting state is set
      expect(useClaudeStore.getState().isConnecting).toBe(true);

      await startPromise;
    });

    it('updates status after successful session start', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.startSession();
      });

      expect(claudeIpc.getStatus).toHaveBeenCalled();
    });

    it('adds system output line on successful start', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.startSession();
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.length).toBeGreaterThan(0);
      expect(outputLines[0].type).toBe('system');
      expect(outputLines[0].content).toContain('Session started');
    });

    it('adds error output on failed start', async () => {
      vi.mocked(claudeIpc.startSession).mockRejectedValueOnce(new Error('Connection failed'));

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.startSession();
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.some((line) => line.type === 'error')).toBe(true);
    });

    it('resets connecting state after error', async () => {
      vi.mocked(claudeIpc.startSession).mockRejectedValueOnce(new Error('Failed'));

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.startSession();
      });

      expect(useClaudeStore.getState().isConnecting).toBe(false);
    });
  });

  describe('stopSession', () => {
    it('calls IPC stopSession', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.stopSession();
      });

      expect(claudeIpc.stopSession).toHaveBeenCalled();
    });

    it('resets session state after stop', async () => {
      useClaudeStore.setState({
        status: { ...useClaudeStore.getState().status, is_active: true },
      });

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.stopSession();
      });

      expect(useClaudeStore.getState().status.is_active).toBe(false);
    });

    it('adds system output on stop', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.stopSession();
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.some((line) => line.content === 'Session stopped')).toBe(true);
    });
  });

  describe('sendInput', () => {
    it('calls IPC sendInput with input and newline', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.sendInput('test command');
      });

      expect(claudeIpc.sendInput).toHaveBeenCalledWith('test command\n');
    });

    it('adds output line showing sent input', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.sendInput('hello world');
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.some((line) => line.content === '> hello world')).toBe(true);
    });

    it('handles send error gracefully', async () => {
      vi.mocked(claudeIpc.sendInput).mockRejectedValueOnce(new Error('Send failed'));

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.sendInput('test');
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.some((line) => line.type === 'error')).toBe(true);
    });
  });

  describe('approve', () => {
    it('calls IPC approve', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.approve();
      });

      expect(claudeIpc.approve).toHaveBeenCalled();
    });

    it('clears pending approval after approve', async () => {
      useClaudeStore.setState({
        pendingApproval: {
          event_type: 'tool_use',
          requires_approval: true,
          approval_type: { tool: 'Bash', input: 'rm -rf' },
          data: {},
        },
      });

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.approve();
      });

      expect(useClaudeStore.getState().pendingApproval).toBeNull();
    });

    it('adds history entry on approve', async () => {
      useClaudeStore.setState({
        pendingApproval: {
          event_type: 'tool_use',
          requires_approval: true,
          approval_type: { tool: 'Bash', input: 'ls' },
          data: {},
        },
      });

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.approve();
      });

      const history = useClaudeStore.getState().history;
      expect(history.length).toBe(1);
      expect(history[0].action).toBe('approved');
    });

    it('adds system output showing approval', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.approve();
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.some((line) => line.content === '[APPROVED]')).toBe(true);
    });
  });

  describe('deny', () => {
    it('calls IPC deny', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.deny();
      });

      expect(claudeIpc.deny).toHaveBeenCalled();
    });

    it('clears pending approval after deny', async () => {
      useClaudeStore.setState({
        pendingApproval: {
          event_type: 'tool_use',
          requires_approval: true,
          approval_type: { tool: 'Bash', input: 'dangerous' },
          data: {},
        },
      });

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.deny();
      });

      expect(useClaudeStore.getState().pendingApproval).toBeNull();
    });

    it('adds history entry with denied action', async () => {
      useClaudeStore.setState({
        pendingApproval: {
          event_type: 'tool_use',
          requires_approval: true,
          approval_type: { tool: 'Bash', input: 'rm' },
          data: {},
        },
      });

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.deny();
      });

      const history = useClaudeStore.getState().history;
      expect(history.length).toBe(1);
      expect(history[0].action).toBe('denied');
    });

    it('adds system output showing denial', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.deny();
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.some((line) => line.content === '[DENIED]')).toBe(true);
    });
  });

  describe('toggleAutoApproveAll', () => {
    it('calls IPC toggleAutoApproveAll with enabled flag', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.toggleAutoApproveAll(true);
      });

      expect(claudeIpc.toggleAutoApproveAll).toHaveBeenCalledWith(true);
    });

    it('refreshes status after toggle', async () => {
      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.toggleAutoApproveAll(true);
      });

      expect(claudeIpc.getStatus).toHaveBeenCalled();
    });

    it('handles toggle error gracefully', async () => {
      vi.mocked(claudeIpc.toggleAutoApproveAll).mockRejectedValueOnce(new Error('Toggle failed'));

      const { result } = renderHook(() => useClaude());

      await act(async () => {
        await result.current.toggleAutoApproveAll(true);
      });

      const outputLines = useClaudeStore.getState().outputLines;
      expect(outputLines.some((line) => line.type === 'error')).toBe(true);
    });
  });

  describe('Status refresh', () => {
    it('periodically refreshes status', async () => {
      vi.useFakeTimers();

      renderHook(() => useClaude());

      // Initial call
      expect(claudeIpc.getStatus).toHaveBeenCalledTimes(1);

      // Advance timer by 2 seconds (refresh interval)
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(claudeIpc.getStatus).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });
});

describe('useClaude - Prompting scenarios', () => {
  beforeEach(() => {
    useClaudeStore.setState({
      status: {
        is_active: true,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
      isConnecting: false,
      outputLines: [],
      pendingApproval: null,
      history: [],
      workingDir: 'C:\\project',
      cliPath: 'C:\\cli\\claude.js',
    });
    vi.clearAllMocks();
  });

  it('handles multi-line prompts', async () => {
    const { result } = renderHook(() => useClaude());

    const multiLinePrompt = `Write a function that:
1. Takes a number as input
2. Returns its factorial
3. Handles edge cases`;

    await act(async () => {
      await result.current.sendInput(multiLinePrompt);
    });

    expect(claudeIpc.sendInput).toHaveBeenCalledWith(`${multiLinePrompt}\n`);
  });

  it('handles special characters in prompts', async () => {
    const { result } = renderHook(() => useClaude());

    const specialPrompt = 'Fix this regex: /^[a-z]+$/i and escape \\ backslashes';

    await act(async () => {
      await result.current.sendInput(specialPrompt);
    });

    expect(claudeIpc.sendInput).toHaveBeenCalledWith(`${specialPrompt}\n`);
  });

  it('handles unicode in prompts', async () => {
    const { result } = renderHook(() => useClaude());

    const unicodePrompt = 'Translate to Polish: Hello → Cześć 🇵🇱';

    await act(async () => {
      await result.current.sendInput(unicodePrompt);
    });

    expect(claudeIpc.sendInput).toHaveBeenCalledWith(`${unicodePrompt}\n`);
  });

  it('handles code block prompts', async () => {
    const { result } = renderHook(() => useClaude());

    const codePrompt = `Fix this code:
\`\`\`typescript
function add(a: number, b: number) {
  return a + b
}
\`\`\``;

    await act(async () => {
      await result.current.sendInput(codePrompt);
    });

    expect(claudeIpc.sendInput).toHaveBeenCalledWith(`${codePrompt}\n`);
  });

  it('handles rapid sequential prompts', async () => {
    const { result } = renderHook(() => useClaude());

    await act(async () => {
      await Promise.all([
        result.current.sendInput('First prompt'),
        result.current.sendInput('Second prompt'),
        result.current.sendInput('Third prompt'),
      ]);
    });

    expect(claudeIpc.sendInput).toHaveBeenCalledTimes(3);
  });

  it('maintains prompt order', async () => {
    const { result } = renderHook(() => useClaude());
    const callOrder: string[] = [];

    vi.mocked(claudeIpc.sendInput).mockImplementation(async (input) => {
      callOrder.push(input);
    });

    await act(async () => {
      await result.current.sendInput('first');
      await result.current.sendInput('second');
      await result.current.sendInput('third');
    });

    expect(callOrder).toEqual(['first\n', 'second\n', 'third\n']);
  });
});

describe('useClaude - Error handling', () => {
  beforeEach(() => {
    useClaudeStore.setState({
      status: {
        is_active: true,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
      outputLines: [],
    });
    vi.clearAllMocks();
  });

  it('handles network timeout', async () => {
    vi.mocked(claudeIpc.sendInput).mockRejectedValueOnce(new Error('Network timeout'));

    const { result } = renderHook(() => useClaude());

    await act(async () => {
      await result.current.sendInput('test');
    });

    const outputLines = useClaudeStore.getState().outputLines;
    expect(
      outputLines.some((line) => line.type === 'error' && line.content.includes('timeout')),
    ).toBe(true);
  });

  it('handles session disconnect', async () => {
    vi.mocked(claudeIpc.sendInput).mockRejectedValueOnce(new Error('Session disconnected'));

    const { result } = renderHook(() => useClaude());

    await act(async () => {
      await result.current.sendInput('test');
    });

    const outputLines = useClaudeStore.getState().outputLines;
    expect(outputLines.some((line) => line.type === 'error')).toBe(true);
  });

  it('recovers from temporary errors', async () => {
    // First call fails, second succeeds
    vi.mocked(claudeIpc.sendInput)
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useClaude());

    // First attempt - fails
    await act(async () => {
      await result.current.sendInput('test1');
    });

    // Second attempt - succeeds
    await act(async () => {
      await result.current.sendInput('test2');
    });

    const outputLines = useClaudeStore.getState().outputLines;
    expect(outputLines.some((line) => line.type === 'error')).toBe(true);
    expect(outputLines.some((line) => line.content === '> test2')).toBe(true);
  });
});
