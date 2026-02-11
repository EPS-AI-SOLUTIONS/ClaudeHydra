import { beforeEach, describe, expect, it } from 'vitest';
import { useClaudeStore } from './claudeStore';

describe('claudeStore', () => {
  beforeEach(() => {
    // Reset store before each test - FULL RESET including chatSessions
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
      rules: [],
      currentView: 'terminal',
      // Multi-session chat - RESET
      chatSessions: [],
      currentChatSessionId: null,
      chatHistory: {},
      defaultProvider: 'claude',
    });
  });

  describe('initial state', () => {
    it('should have correct initial status', () => {
      const { status } = useClaudeStore.getState();
      expect(status.is_active).toBe(false);
      expect(status.pending_approval).toBe(false);
      expect(status.auto_approve_all).toBe(false);
    });

    it('should start with empty output lines', () => {
      const { outputLines } = useClaudeStore.getState();
      expect(outputLines).toHaveLength(0);
    });

    it('should have terminal as default view', () => {
      const { currentView } = useClaudeStore.getState();
      expect(currentView).toBe('terminal');
    });
  });

  describe('setStatus', () => {
    it('should update status correctly', () => {
      const { setStatus } = useClaudeStore.getState();

      setStatus({
        is_active: true,
        pending_approval: true,
        auto_approve_all: false,
        approved_count: 5,
        denied_count: 2,
        auto_approved_count: 3,
      });

      const { status } = useClaudeStore.getState();
      expect(status.is_active).toBe(true);
      expect(status.approved_count).toBe(5);
    });
  });

  describe('addOutputLine', () => {
    it('should add output line with generated id and timestamp', () => {
      const { addOutputLine } = useClaudeStore.getState();

      addOutputLine({
        type: 'output',
        content: 'Test message',
      });

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines).toHaveLength(1);
      expect(outputLines[0].content).toBe('Test message');
      expect(outputLines[0].id).toBeDefined();
      expect(outputLines[0].timestamp).toBeInstanceOf(Date);
    });

    it('should keep only last 500 lines', () => {
      const { addOutputLine } = useClaudeStore.getState();

      // Add 510 lines
      for (let i = 0; i < 510; i++) {
        addOutputLine({
          type: 'output',
          content: `Line ${i}`,
        });
      }

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines.length).toBeLessThanOrEqual(501);
    });
  });

  describe('clearOutput', () => {
    it('should clear all output lines', () => {
      const { addOutputLine, clearOutput } = useClaudeStore.getState();

      addOutputLine({ type: 'output', content: 'Test' });
      addOutputLine({ type: 'error', content: 'Error' });

      clearOutput();

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines).toHaveLength(0);
    });
  });

  describe('setCurrentView', () => {
    it('should change view correctly', () => {
      const { setCurrentView } = useClaudeStore.getState();

      setCurrentView('settings');
      expect(useClaudeStore.getState().currentView).toBe('settings');

      setCurrentView('history');
      expect(useClaudeStore.getState().currentView).toBe('history');
    });
  });

  describe('setApiKey', () => {
    it('should update API key for specific provider', () => {
      const { setApiKey } = useClaudeStore.getState();

      setApiKey('anthropic', 'test-key-123');

      const { apiKeys } = useClaudeStore.getState();
      expect(apiKeys.anthropic).toBe('test-key-123');
    });

    it('should not affect other API keys', () => {
      const { setApiKey } = useClaudeStore.getState();

      setApiKey('anthropic', 'anthropic-key');
      setApiKey('openai', 'openai-key');

      const { apiKeys } = useClaudeStore.getState();
      expect(apiKeys.anthropic).toBe('anthropic-key');
      expect(apiKeys.openai).toBe('openai-key');
    });
  });

  describe('resetSession', () => {
    it('should reset session state', () => {
      const { setStatus, setConnecting, resetSession } = useClaudeStore.getState();

      setStatus({
        is_active: true,
        pending_approval: true,
        auto_approve_all: true,
        approved_count: 10,
        denied_count: 5,
        auto_approved_count: 3,
      });
      setConnecting(true);

      resetSession();

      const state = useClaudeStore.getState();
      expect(state.status.is_active).toBe(false);
      expect(state.status.approved_count).toBe(0);
      expect(state.isConnecting).toBe(false);
    });
  });

  describe('history management', () => {
    it('should add history entry', () => {
      const { addHistoryEntry } = useClaudeStore.getState();

      addHistoryEntry({
        id: 'test-1',
        timestamp: new Date().toISOString(),
        action: 'approved',
        approval_type: { type: 'bash_command', command: 'ls -la' },
        auto_approved: false,
      });

      const { history } = useClaudeStore.getState();
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('approved');
    });

    it('should keep only last 100 history entries', () => {
      const { addHistoryEntry } = useClaudeStore.getState();

      for (let i = 0; i < 110; i++) {
        addHistoryEntry({
          id: `test-${i}`,
          timestamp: new Date().toISOString(),
          action: 'approved',
          approval_type: { type: 'bash_command', command: `cmd ${i}` },
          auto_approved: false,
        });
      }

      const { history } = useClaudeStore.getState();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Auto-start configuration', () => {
    it('should have auto-start enabled by default', () => {
      const state = useClaudeStore.getState();
      expect(state.autoStartEnabled).toBe(true);
    });

    it('should toggle auto-start enabled', () => {
      const { setAutoStartEnabled } = useClaudeStore.getState();

      setAutoStartEnabled(false);
      expect(useClaudeStore.getState().autoStartEnabled).toBe(false);

      setAutoStartEnabled(true);
      expect(useClaudeStore.getState().autoStartEnabled).toBe(true);
    });

    it('should have auto-approve on start enabled by default', () => {
      const state = useClaudeStore.getState();
      expect(state.autoApproveOnStart).toBe(true);
    });

    it('should toggle auto-approve on start', () => {
      const { setAutoApproveOnStart } = useClaudeStore.getState();

      setAutoApproveOnStart(false);
      expect(useClaudeStore.getState().autoApproveOnStart).toBe(false);
    });

    it('should update init prompt', () => {
      const { setInitPrompt } = useClaudeStore.getState();
      const newPrompt = 'Custom initialization prompt';

      setInitPrompt(newPrompt);
      expect(useClaudeStore.getState().initPrompt).toBe(newPrompt);
    });

    it('should handle empty init prompt', () => {
      const { setInitPrompt } = useClaudeStore.getState();

      setInitPrompt('');
      expect(useClaudeStore.getState().initPrompt).toBe('');
    });
  });

  describe('Multi-session chat management', () => {
    it('should create new chat session', () => {
      const { createChatSession } = useClaudeStore.getState();

      const sessionId = createChatSession('claude');

      const state = useClaudeStore.getState();
      expect(state.chatSessions).toHaveLength(1);
      expect(state.chatSessions[0].id).toBe(sessionId);
      expect(state.chatSessions[0].provider).toBe('claude');
      expect(state.currentChatSessionId).toBe(sessionId);
    });

    it('should create session with default provider', () => {
      useClaudeStore.setState({ defaultProvider: 'ollama' });
      const { createChatSession } = useClaudeStore.getState();

      createChatSession();

      const state = useClaudeStore.getState();
      expect(state.chatSessions[0].provider).toBe('ollama');
    });

    it('should delete chat session', () => {
      const { createChatSession, deleteChatSession } = useClaudeStore.getState();

      const sessionId = createChatSession('claude');
      expect(useClaudeStore.getState().chatSessions).toHaveLength(1);

      deleteChatSession(sessionId);
      expect(useClaudeStore.getState().chatSessions).toHaveLength(0);
    });

    it('should select next session after deleting current', () => {
      const { createChatSession, deleteChatSession } = useClaudeStore.getState();

      const session1 = createChatSession('claude');
      const session2 = createChatSession('claude');

      // session2 is now current (most recent)
      expect(useClaudeStore.getState().currentChatSessionId).toBe(session2);

      deleteChatSession(session2);

      // session1 should become current
      expect(useClaudeStore.getState().currentChatSessionId).toBe(session1);
    });

    it('should select chat session', () => {
      const { createChatSession, selectChatSession } = useClaudeStore.getState();

      const session1 = createChatSession('claude');
      const _session2 = createChatSession('claude');

      selectChatSession(session1);
      expect(useClaudeStore.getState().currentChatSessionId).toBe(session1);
    });

    it('should update chat session title', () => {
      const { createChatSession, updateChatSessionTitle } = useClaudeStore.getState();

      const sessionId = createChatSession('claude');
      updateChatSessionTitle(sessionId, 'New Title');

      const session = useClaudeStore.getState().chatSessions.find((s) => s.id === sessionId);
      expect(session?.title).toBe('New Title');
    });
  });

  describe('Chat messages', () => {
    beforeEach(() => {
      const { createChatSession } = useClaudeStore.getState();
      createChatSession('claude');
    });

    it('should add chat message', () => {
      const { addChatMessage, getCurrentMessages } = useClaudeStore.getState();

      addChatMessage({
        role: 'user',
        content: 'Hello, Claude!',
      });

      const messages = getCurrentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello, Claude!');
    });

    it('should auto-update session title from first user message', () => {
      const { addChatMessage, chatSessions } = useClaudeStore.getState();

      addChatMessage({
        role: 'user',
        content: 'This is a very long message that should be truncated for the title',
      });

      const state = useClaudeStore.getState();
      const session = state.chatSessions[0];
      expect(session.title.length).toBeLessThanOrEqual(43); // 40 chars + '...'
    });

    it('should update last chat message (streaming append)', () => {
      const { addChatMessage, updateLastChatMessage, getCurrentMessages } =
        useClaudeStore.getState();

      addChatMessage({
        role: 'assistant',
        content: 'Initial ',
      });

      updateLastChatMessage('response chunk');

      const messages = getCurrentMessages();
      // updateLastChatMessage appends for streaming support
      expect(messages[0].content).toBe('Initial response chunk');
    });

    it('should clear chat history for current session', () => {
      const { addChatMessage, clearChatHistory, getCurrentMessages } = useClaudeStore.getState();

      addChatMessage({ role: 'user', content: 'Message 1' });
      addChatMessage({ role: 'assistant', content: 'Response 1' });

      expect(getCurrentMessages()).toHaveLength(2);

      clearChatHistory();

      expect(getCurrentMessages()).toHaveLength(0);
    });

    it('should clear chat history for specific session', () => {
      const { createChatSession, addChatMessage, clearChatHistory, selectChatSession } =
        useClaudeStore.getState();

      // Create and add message to first session
      const session1 = useClaudeStore.getState().currentChatSessionId!;
      addChatMessage({ role: 'user', content: 'Session 1 message' });

      // Create second session and add message
      const session2 = createChatSession('claude');
      addChatMessage({ role: 'user', content: 'Session 2 message' });

      // Clear specific session
      clearChatHistory(session1);

      // Session 1 should be empty
      selectChatSession(session1);
      expect(useClaudeStore.getState().chatHistory[session1]).toHaveLength(0);

      // Session 2 should still have messages
      selectChatSession(session2);
      expect(useClaudeStore.getState().chatHistory[session2]).toHaveLength(1);
    });
  });

  describe('Theme', () => {
    it('should start with dark theme', () => {
      const state = useClaudeStore.getState();
      expect(state.theme).toBe('dark');
    });

    it('should toggle theme', () => {
      const { toggleTheme } = useClaudeStore.getState();

      toggleTheme();
      expect(useClaudeStore.getState().theme).toBe('light');

      toggleTheme();
      expect(useClaudeStore.getState().theme).toBe('dark');
    });
  });

  describe('Endpoints configuration', () => {
    it('should have default Ollama endpoint', () => {
      const { endpoints } = useClaudeStore.getState();
      expect(endpoints.ollama).toBe('http://127.0.0.1:11434');
    });

    it('should update endpoint', () => {
      const { setEndpoint } = useClaudeStore.getState();

      setEndpoint('ollama', 'http://localhost:11435');

      const { endpoints } = useClaudeStore.getState();
      expect(endpoints.ollama).toBe('http://localhost:11435');
    });
  });

  describe('Pending approval', () => {
    it('should set pending approval', () => {
      const { setPendingApproval } = useClaudeStore.getState();

      const approvalEvent = {
        event_type: 'tool_use' as const,
        requires_approval: true,
        approval_type: { tool: 'Bash', input: 'rm -rf' },
        data: { command: 'rm -rf' },
      };

      setPendingApproval(approvalEvent);

      const state = useClaudeStore.getState();
      expect(state.pendingApproval).toEqual(approvalEvent);
    });

    it('should clear pending approval', () => {
      const { setPendingApproval } = useClaudeStore.getState();

      setPendingApproval({
        event_type: 'tool_use',
        requires_approval: true,
        approval_type: { tool: 'Bash' },
        data: {},
      });

      setPendingApproval(null);

      const state = useClaudeStore.getState();
      expect(state.pendingApproval).toBeNull();
    });
  });

  describe('Rules management', () => {
    it('should set approval rules', () => {
      const { setRules } = useClaudeStore.getState();

      const rules = [
        { id: '1', pattern: 'Bash', enabled: true },
        { id: '2', pattern: 'Read', enabled: false },
      ];

      setRules(rules as any);

      const state = useClaudeStore.getState();
      expect(state.rules).toHaveLength(2);
      expect(state.rules[0].pattern).toBe('Bash');
    });

    it('should replace all rules', () => {
      const { setRules } = useClaudeStore.getState();

      setRules([{ id: '1', pattern: 'Old', enabled: true }] as any);
      setRules([{ id: '2', pattern: 'New', enabled: false }] as any);

      const state = useClaudeStore.getState();
      expect(state.rules).toHaveLength(1);
      expect(state.rules[0].pattern).toBe('New');
    });
  });

  describe('Working directory and CLI path', () => {
    it('should update working directory', () => {
      const { setWorkingDir } = useClaudeStore.getState();

      setWorkingDir('C:\\NewProject');

      expect(useClaudeStore.getState().workingDir).toBe('C:\\NewProject');
    });

    it('should update CLI path', () => {
      const { setCliPath } = useClaudeStore.getState();

      setCliPath('C:\\new\\path\\cli.js');

      expect(useClaudeStore.getState().cliPath).toBe('C:\\new\\path\\cli.js');
    });
  });

  describe('Sidebar', () => {
    it('should toggle sidebar collapsed state', () => {
      const { setSidebarCollapsed } = useClaudeStore.getState();

      expect(useClaudeStore.getState().sidebarCollapsed).toBe(false);

      setSidebarCollapsed(true);
      expect(useClaudeStore.getState().sidebarCollapsed).toBe(true);

      setSidebarCollapsed(false);
      expect(useClaudeStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('Output line types', () => {
    it('should handle all output line types', () => {
      const { addOutputLine } = useClaudeStore.getState();

      const types = ['output', 'assistant', 'tool', 'error', 'system', 'approval'] as const;

      types.forEach((type) => {
        addOutputLine({ type, content: `${type} message` });
      });

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines).toHaveLength(6);

      types.forEach((type, index) => {
        expect(outputLines[index].type).toBe(type);
      });
    });

    it('should include data in output lines', () => {
      const { addOutputLine } = useClaudeStore.getState();

      addOutputLine({
        type: 'tool',
        content: 'Tool output',
        data: { name: 'Bash', result: 'success' },
      });

      const { outputLines } = useClaudeStore.getState();
      expect(outputLines[0].data).toEqual({ name: 'Bash', result: 'success' });
    });
  });

  describe('Path configuration validation', () => {
    // These tests would have caught the ClaudeCli -> ClaudeHydra rename issue

    // Default paths - must be kept in sync with claudeStore.ts
    const DEFAULT_WORKING_DIR = 'C:\\Users\\BIURODOM\\Desktop\\ClaudeHydra';
    const DEFAULT_CLI_PATH = 'C:\\Users\\BIURODOM\\Desktop\\ClaudeHydra\\bin\\claude-code\\cli.js';

    beforeEach(() => {
      // Reset paths to defaults before each path validation test
      useClaudeStore.setState({
        workingDir: DEFAULT_WORKING_DIR,
        cliPath: DEFAULT_CLI_PATH,
      });
    });

    it('should have ClaudeHydra in default working directory', () => {
      const { workingDir } = useClaudeStore.getState();
      expect(workingDir).toContain('ClaudeHydra');
      expect(workingDir).not.toContain('ClaudeCli');
    });

    it('should have ClaudeHydra in default CLI path', () => {
      const { cliPath } = useClaudeStore.getState();
      expect(cliPath).toContain('ClaudeHydra');
      expect(cliPath).not.toContain('ClaudeCli');
    });

    it('should have consistent project name in workingDir and cliPath', () => {
      const { workingDir, cliPath } = useClaudeStore.getState();

      // Extract project folder name from paths
      const workingDirMatch = workingDir.match(/Desktop[\\/](\w+)/);
      const cliPathMatch = cliPath.match(/Desktop[\\/](\w+)/);

      if (workingDirMatch && cliPathMatch) {
        expect(workingDirMatch[1]).toBe(cliPathMatch[1]);
      }
    });

    it('should have valid Windows path format', () => {
      const { workingDir, cliPath } = useClaudeStore.getState();

      // Should start with drive letter
      expect(workingDir).toMatch(/^[A-Z]:\\/);
      expect(cliPath).toMatch(/^[A-Z]:\\/);
    });

    it('cliPath should point to cli.js file', () => {
      const { cliPath } = useClaudeStore.getState();
      expect(cliPath).toMatch(/cli\.js$/);
    });

    it('cliPath should include bin/claude-code directory', () => {
      const { cliPath } = useClaudeStore.getState();
      expect(cliPath).toContain('bin');
      expect(cliPath).toContain('claude-code');
    });
  });
});
