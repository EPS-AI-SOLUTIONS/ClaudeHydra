'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ApprovalHistoryEntry,
  ApprovalRule,
  ClaudeEvent,
  SessionStatus,
} from '@/types/claude';

export interface OutputLine {
  id: string;
  timestamp: Date;
  type: 'output' | 'assistant' | 'tool' | 'error' | 'system' | 'approval';
  content: string;
  model?: string;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  provider: 'claude' | 'ollama';
}

interface ApiKeys {
  anthropic: string;
  openai: string;
  google: string;
  mistral: string;
  groq: string;
  brave: string;
  github: string;
  greptile: string;
}

interface Endpoints {
  ollama: string;
  claudeApi: string;
  openaiApi: string;
}

interface ClaudeState {
  // Session state
  status: SessionStatus;
  isConnecting: boolean;

  // Terminal output
  outputLines: OutputLine[];

  // Pending approval
  pendingApproval: ClaudeEvent | null;

  // History & Rules
  history: ApprovalHistoryEntry[];
  rules: ApprovalRule[];

  // Settings
  sidebarCollapsed: boolean;

  // Auto-start config
  autoStartEnabled: boolean;
  autoApproveOnStart: boolean;
  initPrompt: string;

  // API Configuration
  apiKeys: ApiKeys;
  endpoints: Endpoints;

  // Session Manager
  activeSessionId: string | null;

  // Multi-Session Chat
  chatSessions: ChatSession[];
  currentChatSessionId: string | null;
  chatHistory: Record<string, ChatMessage[]>;
  openTabs: string[];
  theme: 'dark' | 'light';
  defaultProvider: 'claude' | 'ollama';

  // Actions
  setStatus: (status: SessionStatus) => void;
  setConnecting: (connecting: boolean) => void;
  addOutputLine: (line: Omit<OutputLine, 'id' | 'timestamp'>) => void;
  clearOutput: () => void;
  setPendingApproval: (event: ClaudeEvent | null) => void;
  setHistory: (history: ApprovalHistoryEntry[]) => void;
  addHistoryEntry: (entry: ApprovalHistoryEntry) => void;
  setRules: (rules: ApprovalRule[]) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  setEndpoint: (name: keyof Endpoints, url: string) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  resetSession: () => void;

  // Multi-Session Actions
  createChatSession: (provider?: 'claude' | 'ollama') => string;
  deleteChatSession: (id: string) => void;
  selectChatSession: (id: string) => void;
  updateChatSessionTitle: (id: string, title: string) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateLastChatMessage: (content: string) => void;
  clearChatHistory: (sessionId?: string) => void;
  toggleTheme: () => void;
  setDefaultProvider: (provider: 'claude' | 'ollama') => void;
  getCurrentMessages: () => ChatMessage[];

  // Tab Actions
  openTab: (sessionId: string) => void;
  closeTab: (sessionId: string) => void;
  switchTab: (sessionId: string) => void;

  // Auto-start Actions
  setAutoStartEnabled: (enabled: boolean) => void;
  setAutoApproveOnStart: (enabled: boolean) => void;
  setInitPrompt: (prompt: string) => void;
}

export const useClaudeStore = create<ClaudeState>()(
  persist(
    (set, get) => ({
      // Initial state
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
      sidebarCollapsed: false,

      // API Configuration
      apiKeys: {
        anthropic: '',
        openai: '',
        google: '',
        mistral: '',
        groq: '',
        brave: '',
        github: '',
        greptile: '',
      },
      endpoints: {
        ollama: 'http://127.0.0.1:11434',
        claudeApi: 'https://api.anthropic.com',
        openaiApi: 'https://api.openai.com/v1',
      },

      activeSessionId: null,

      // Multi-Session Chat
      chatSessions: [],
      currentChatSessionId: null,
      chatHistory: {},
      openTabs: [],
      theme: 'dark',
      defaultProvider: 'claude',

      // Auto-start config
      autoStartEnabled: true,
      autoApproveOnStart: true,
      initPrompt: 'Jestem gotowy do pracy. Sprawdź status projektu i czekaj na polecenia.',

      // Actions
      setStatus: (status) => set({ status }),
      setConnecting: (isConnecting) => set({ isConnecting }),

      addOutputLine: (line) =>
        set((state) => ({
          outputLines: [
            ...state.outputLines.slice(-500),
            {
              ...line,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
          ],
        })),

      clearOutput: () => set({ outputLines: [] }),
      setPendingApproval: (pendingApproval) => set({ pendingApproval }),
      setHistory: (history) => set({ history }),

      addHistoryEntry: (entry) =>
        set((state) => ({
          history: [...state.history.slice(-99), entry],
        })),

      setRules: (rules) => set({ rules }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),

      setEndpoint: (name, url) =>
        set((state) => ({
          endpoints: { ...state.endpoints, [name]: url },
        })),

      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),

      resetSession: () =>
        set({
          status: {
            is_active: false,
            pending_approval: false,
            auto_approve_all: false,
            approved_count: 0,
            denied_count: 0,
            auto_approved_count: 0,
          },
          isConnecting: false,
          pendingApproval: null,
        }),

      // Multi-Session Actions
      createChatSession: (provider) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((state) => ({
          chatSessions: [
            {
              id,
              title: 'New Chat',
              createdAt: now,
              updatedAt: now,
              provider: provider || state.defaultProvider,
            },
            ...state.chatSessions,
          ],
          currentChatSessionId: id,
          chatHistory: { ...state.chatHistory, [id]: [] },
          openTabs: state.openTabs.includes(id) ? state.openTabs : [...state.openTabs, id],
        }));
        return id;
      },

      deleteChatSession: (id) =>
        set((state) => {
          const newSessions = state.chatSessions.filter((s) => s.id !== id);
          const { [id]: _deleted, ...newHistory } = state.chatHistory;
          const newTabs = state.openTabs.filter((t) => t !== id);
          let newCurrentId = state.currentChatSessionId;

          if (state.currentChatSessionId === id) {
            const closedIdx = state.openTabs.indexOf(id);
            if (newTabs.length > 0) {
              newCurrentId = newTabs[Math.min(closedIdx, newTabs.length - 1)];
            } else {
              newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
            }
          }

          return {
            chatSessions: newSessions,
            chatHistory: newHistory,
            currentChatSessionId: newCurrentId,
            openTabs: newTabs,
          };
        }),

      selectChatSession: (id) => set({ currentChatSessionId: id }),

      updateChatSessionTitle: (id, title) =>
        set((state) => ({
          chatSessions: state.chatSessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
          ),
        })),

      addChatMessage: (message) =>
        set((state) => {
          if (!state.currentChatSessionId) return state;

          const newMessage: ChatMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          };

          const currentMessages = state.chatHistory[state.currentChatSessionId] || [];
          const updatedMessages = [...currentMessages, newMessage];

          // Auto-update title from first user message
          let updatedSessions = state.chatSessions;
          if (message.role === 'user' && currentMessages.length === 0) {
            const truncatedTitle =
              message.content.substring(0, 40) + (message.content.length > 40 ? '...' : '');
            updatedSessions = state.chatSessions.map((s) =>
              s.id === state.currentChatSessionId
                ? { ...s, title: truncatedTitle, updatedAt: Date.now() }
                : s,
            );
          }

          return {
            chatHistory: {
              ...state.chatHistory,
              [state.currentChatSessionId]: updatedMessages,
            },
            chatSessions: updatedSessions,
          };
        }),

      updateLastChatMessage: (content) =>
        set((state) => {
          if (!state.currentChatSessionId) return state;
          const messages = state.chatHistory[state.currentChatSessionId] || [];
          if (messages.length === 0) return state;

          const newMessages = [...messages];
          const lastMsg = newMessages[newMessages.length - 1];
          newMessages[newMessages.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + content,
          };

          return {
            chatHistory: {
              ...state.chatHistory,
              [state.currentChatSessionId]: newMessages,
            },
          };
        }),

      clearChatHistory: (sessionId) =>
        set((state) => {
          const targetId = sessionId || state.currentChatSessionId;
          if (!targetId) return state;
          return {
            chatHistory: {
              ...state.chatHistory,
              [targetId]: [],
            },
          };
        }),

      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'dark' ? 'light' : 'dark',
        })),

      setDefaultProvider: (provider) => set({ defaultProvider: provider }),

      getCurrentMessages: (): ChatMessage[] => {
        const state = get();
        if (!state.currentChatSessionId) return [];
        return state.chatHistory[state.currentChatSessionId] || [];
      },

      // Tab Actions
      openTab: (sessionId) =>
        set((state) => ({
          openTabs: state.openTabs.includes(sessionId)
            ? state.openTabs
            : [...state.openTabs, sessionId],
          currentChatSessionId: sessionId,
        })),

      closeTab: (sessionId) =>
        set((state) => {
          const newTabs = state.openTabs.filter((t) => t !== sessionId);
          let newCurrentId = state.currentChatSessionId;

          if (state.currentChatSessionId === sessionId) {
            const closedIdx = state.openTabs.indexOf(sessionId);
            if (newTabs.length > 0) {
              newCurrentId = newTabs[Math.min(closedIdx, newTabs.length - 1)];
            } else {
              newCurrentId = null;
            }
          }

          return {
            openTabs: newTabs,
            currentChatSessionId: newCurrentId,
          };
        }),

      switchTab: (sessionId) =>
        set({
          currentChatSessionId: sessionId,
        }),

      // Auto-start Actions
      setAutoStartEnabled: (enabled) => set({ autoStartEnabled: enabled }),
      setAutoApproveOnStart: (enabled) => set({ autoApproveOnStart: enabled }),
      setInitPrompt: (prompt) => set({ initPrompt: prompt }),
    }),
    {
      name: 'claude-hydra-web-storage',
      version: 1,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        endpoints: state.endpoints,
        activeSessionId: state.activeSessionId,
        chatSessions: state.chatSessions,
        currentChatSessionId: state.currentChatSessionId,
        chatHistory: state.chatHistory,
        openTabs: state.openTabs,
        theme: state.theme,
        defaultProvider: state.defaultProvider,
        autoStartEnabled: state.autoStartEnabled,
        autoApproveOnStart: state.autoApproveOnStart,
        initPrompt: state.initPrompt,
      }),
    },
  ),
);
