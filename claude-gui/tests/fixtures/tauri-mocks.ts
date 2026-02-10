/**
 * Tauri API mocking for Playwright E2E tests.
 *
 * Pre-seeds window.__TAURI_MOCK__ before the app bundle loads,
 * intercepting invoke() calls and event listeners.
 */

import type { Page } from '@playwright/test';

// ── Default Mock Responses ─────────────────────────────────────────────────────

export const DEFAULT_MOCK_RESPONSES: Record<string, unknown> = {
  // Claude session
  get_session_status: {
    running: false,
    session_id: null,
    is_active: false,
    pending_approval: false,
    auto_approve_all: false,
    approved_count: 0,
    denied_count: 0,
    auto_approved_count: 0,
  },
  start_claude_session: 'session-test-123',
  stop_claude_session: null,
  send_input: null,
  approve_action: null,
  deny_action: null,
  get_approval_rules: [],
  update_approval_rules: null,
  toggle_auto_approve_all: null,
  get_approval_history: [],
  clear_approval_history: null,

  // Anthropic
  anthropic_list_models: [
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ],

  // Ollama
  ollama_list_models: [
    { name: 'llama3.2:3b', size: 2147483648, modified_at: '2024-01-01' },
    { name: 'qwen2.5-coder:1.5b', size: 1073741824, modified_at: '2024-01-01' },
  ],
  ollama_health_check: true,
  ollama_generate: null,
  ollama_generate_sync: '',
  ollama_chat: null,
  ollama_batch_generate: [],
  get_cpu_info: { cores: 8, model: 'Test CPU', usage: 25.0 },

  // Chat history
  list_chat_sessions: [],
  get_chat_session: null,
  create_chat_session: { id: 'session-001', title: 'Test Chat', message_count: 0 },
  add_chat_message: null,
  delete_chat_session: null,
  update_chat_title: null,
  clear_all_chats: null,

  // Agentic
  execute_command: { success: true, output: 'Command executed' },

  // Bridge
  get_bridge_state: { requests: [], auto_approve: false },
  set_bridge_auto_approve: null,
  approve_bridge_request: null,
  reject_bridge_request: null,
  clear_bridge_requests: null,

  // Memory
  get_agent_memories: [],
  add_agent_memory: null,
  clear_agent_memories: null,
  get_knowledge_graph: { nodes: [], edges: [] },
  update_knowledge_graph: null,

  // Learning
  learning_get_stats: {
    total_samples: 0,
    sessions_analyzed: 0,
    models_trained: 0,
    active_model: null,
  },
  learning_get_preferences: {},
  learning_save_preferences: null,
  learning_rag_search: [],
  learning_rag_add: null,
  learning_rag_clear: null,
  learning_collect_training: null,
  learning_get_training_examples: [],
  learning_export_for_finetune: '',
  learning_pull_embedding_model: null,
  write_training_dataset: null,
  start_model_training: null,
  cancel_model_training: null,
  get_alzur_models: [],

  // Debug
  debug_get_stats: {
    uptime_secs: 120,
    total_requests: 42,
    active_connections: 1,
    memory_mb: 128.5,
  },
  debug_get_logs: [],
  debug_get_ipc_history: [],
  debug_get_snapshot: { stats: {}, logs: [], ipc: [] },
  debug_clear_logs: null,
  debug_add_log: null,
  debug_start_streaming: null,
  debug_stop_streaming: null,
};

// ── Mock Script Generator ──────────────────────────────────────────────────────

function createTauriMockScript(overrides: Record<string, unknown> = {}): string {
  const responses = { ...DEFAULT_MOCK_RESPONSES, ...overrides };

  return `
    // Pre-seed Tauri mock state BEFORE app loads
    window.__TAURI_MOCK__ = {
      invokeHistory: [],
      eventListeners: new Map(),
      mockResponses: ${JSON.stringify(responses)},
    };

    // Mock __TAURI_INTERNALS__
    window.__TAURI_INTERNALS__ = {
      invoke: async function(cmd, args) {
        const entry = { cmd, args, timestamp: Date.now() };
        window.__TAURI_MOCK__.invokeHistory.push(entry);

        const result = window.__TAURI_MOCK__.mockResponses[cmd];
        if (result === undefined) {
          console.warn('[TauriMock] Unknown command:', cmd);
          return null;
        }

        // Return a deep clone to prevent mutation
        return JSON.parse(JSON.stringify(result));
      },
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
      },
      convertFileSrc: function(path) {
        return 'https://asset.localhost/' + path;
      },
    };

    // Mock __TAURI__
    window.__TAURI__ = {
      invoke: window.__TAURI_INTERNALS__.invoke,
    };

    // Patch @tauri-apps/api/core invoke
    const originalImport = window.__TAURI_INTERNALS__.invoke;

    // Mock @tauri-apps/api/event
    window.__TAURI_EVENT__ = {
      listen: function(event, handler) {
        if (!window.__TAURI_MOCK__.eventListeners.has(event)) {
          window.__TAURI_MOCK__.eventListeners.set(event, []);
        }
        window.__TAURI_MOCK__.eventListeners.get(event).push(handler);

        // Return unlisten function
        return Promise.resolve(function() {
          const listeners = window.__TAURI_MOCK__.eventListeners.get(event);
          if (listeners) {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
          }
        });
      },
      emit: function(event, payload) {
        const listeners = window.__TAURI_MOCK__.eventListeners.get(event) || [];
        listeners.forEach(function(handler) {
          handler({ event: event, payload: payload, id: Date.now() });
        });
        return Promise.resolve();
      },
    };
  `;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Inject Tauri mocks into a Playwright page BEFORE navigation.
 * Must be called before page.goto().
 */
export async function injectTauriMocks(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  await page.addInitScript(createTauriMockScript(overrides));
}

/**
 * Emit a Tauri event on the page (triggers registered listeners).
 */
export async function emitTauriEvent(
  page: Page,
  eventName: string,
  payload: unknown
): Promise<void> {
  await page.evaluate(
    ({ event, data }) => {
      const listeners = (window as any).__TAURI_MOCK__?.eventListeners?.get(event) || [];
      listeners.forEach((handler: any) => {
        handler({ event, payload: data, id: Date.now() });
      });
    },
    { event: eventName, data: payload }
  );
}

/**
 * Override a mock invoke result at runtime.
 */
export async function setMockInvokeResult(
  page: Page,
  command: string,
  result: unknown
): Promise<void> {
  await page.evaluate(
    ({ cmd, res }) => {
      (window as any).__TAURI_MOCK__.mockResponses[cmd] = res;
    },
    { cmd: command, res: result }
  );
}

/**
 * Get the invoke history (all IPC calls made by the app).
 */
export async function getInvokeHistory(
  page: Page
): Promise<Array<{ cmd: string; args: unknown; timestamp: number }>> {
  return page.evaluate(() => {
    return (window as any).__TAURI_MOCK__?.invokeHistory || [];
  });
}

/**
 * Clear the invoke history.
 */
export async function clearInvokeHistory(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__TAURI_MOCK__.invokeHistory = [];
  });
}

// ── Stream Helpers ─────────────────────────────────────────────────────────────

/**
 * Emit a streaming chunk via the ollama-stream-chunk event.
 */
export async function emitStreamChunk(
  page: Page,
  token: string,
  done: boolean,
  eventType = 'ollama-stream-chunk'
): Promise<void> {
  await emitTauriEvent(page, eventType, {
    id: `chunk-${Date.now()}`,
    token,
    done,
    model: 'test-model',
  });
}

/**
 * Emit a stream error event.
 */
export async function emitStreamError(
  page: Page,
  error: string,
  eventType = 'ollama-stream-error'
): Promise<void> {
  await emitTauriEvent(page, eventType, { error });
}

// ── Mock Data Generators ───────────────────────────────────────────────────────

export function createMockMemories(agent: string, count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `mem-${i}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    agent,
    type: ['fact', 'context', 'decision'][i % 3],
    content: `${agent} memory entry ${i + 1}: Sample knowledge data`,
    tags: `test,${agent.toLowerCase()},entry-${i}`,
  }));
}

export function createMockKnowledgeGraph() {
  return {
    nodes: [
      { id: 'ClaudeHydra', type: 'project', label: 'ClaudeHydra' },
      { id: 'React', type: 'framework', label: 'React' },
      { id: 'Tauri', type: 'framework', label: 'Tauri' },
      { id: 'TypeScript', type: 'language', label: 'TypeScript' },
    ],
    edges: [
      { source: 'ClaudeHydra', target: 'React', label: 'uses' },
      { source: 'ClaudeHydra', target: 'Tauri', label: 'uses' },
      { source: 'ClaudeHydra', target: 'TypeScript', label: 'written_in' },
    ],
  };
}
