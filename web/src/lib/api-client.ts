/**
 * API Client — replaces claude-gui/src/lib/ipc.ts
 * All Tauri invoke() calls become fetch() to Next.js API routes.
 */

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ── Chats ──────────────────────────────────────────────

export const chatsApi = {
  listSessions: () => request<ChatSession[]>('/api/chats'),

  getSession: (id: string) => request<ChatSession>(`/api/chats/${id}`),

  createSession: (data: Partial<ChatSession>) =>
    request<ChatSession>('/api/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteSession: (id: string) => request(`/api/chats/${id}`, { method: 'DELETE' }),

  getMessages: (sessionId: string) => request<ChatMessage[]>(`/api/chats/${sessionId}/messages`),

  addMessage: (sessionId: string, msg: Partial<ChatMessage>) =>
    request<ChatMessage>(`/api/chats/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(msg),
    }),
};

// ── Ollama (local management, NOT proxy) ───────────────

export const ollamaApi = {
  health: () => request<{ ok: boolean }>('/api/ollama-local/health'),

  models: () => request<OllamaModel[]>('/api/ollama-local/models'),

  generate: (prompt: string, model: string) =>
    request('/api/ollama-local/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, model }),
    }),

  /** Streaming chat — returns raw Response for ReadableStream */
  streamChat: async (
    model: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<Response> => {
    const res = await fetch('/api/ollama-local/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
    });
    if (!res.ok) throw new Error(`Ollama chat ${res.status}`);
    return res;
  },
};

// ── Claude / Bridge ────────────────────────────────────

export const claudeApi = {
  getState: () => request('/api/bridge/state'),
  approve: (id: string) =>
    request('/api/bridge/approve', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  reject: (id: string) =>
    request('/api/bridge/reject', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  clearQueue: () => request('/api/bridge/clear', { method: 'POST' }),

  // History
  getHistory: () => request<ApprovalHistoryEntry[]>('/api/claude/history'),
  clearHistory: () => request('/api/claude/history', { method: 'DELETE' }),
  addHistoryEntry: (data: {
    approval_type: unknown;
    action: string;
    auto_approved: boolean;
    matched_rule?: string;
  }) =>
    request('/api/claude/history', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Rules
  getRules: () => request<ApprovalRule[]>('/api/claude/rules'),
  addRule: (data: {
    name: string;
    pattern: string;
    tool?: string;
    description?: string;
    enabled?: boolean;
    auto_approve?: boolean;
  }) =>
    request('/api/claude/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ── Memory ─────────────────────────────────────────────

export const memoryApi = {
  getAgentMemories: (agent: string) => request(`/api/memory?agent=${agent}`),
  addMemory: (data: { agent: string; content: string; entry_type?: string }) =>
    request('/api/memory', { method: 'POST', body: JSON.stringify(data) }),
  getKnowledgeGraph: () => request('/api/memory/graph'),
};

// ── Learning ───────────────────────────────────────────

export const learningApi = {
  getStats: () => request('/api/learning/stats'),
  getPreferences: () => request('/api/learning/preferences'),
  setPreference: (key: string, value: string) =>
    request('/api/learning/preferences', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    }),
  getTrainingExamples: () => request('/api/learning/training'),
  addTrainingExample: (data: { prompt: string; response: string }) =>
    request('/api/learning/training', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getRagDocuments: () => request('/api/learning/rag'),
};

// ── Debug ──────────────────────────────────────────────

export const debugApi = {
  getStats: () => request('/api/debug/stats'),
  getLogs: () => request('/api/debug/logs'),
  getSnapshot: () => request('/api/debug/snapshot'),
};

// ── System ─────────────────────────────────────────────

export const systemApi = {
  getCpuInfo: () => request('/api/system/cpu'),
};

// ── Anthropic ──────────────────────────────────────────

export const anthropicApi = {
  listModels: () => request('/api/anthropic/models'),
};

// ── Types (re-export from @/types/claude for convenience) ──

import type { ApprovalHistoryEntry, ApprovalRule } from '@/types/claude';

export type { ApprovalHistoryEntry, ApprovalRule };

export interface ChatSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokens?: number;
  created_at: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}
