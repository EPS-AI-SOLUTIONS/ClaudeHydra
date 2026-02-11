import { invoke } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  model?: string;
  tokens?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  model?: string;
  messages: ChatMessage[];
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  model?: string;
  preview: string;
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentSessionRef = useRef(currentSession);
  currentSessionRef.current = currentSession;

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ChatSessionSummary[]>('list_chat_sessions');
      setSessions(result);
    } catch (e) {
      setError(e as string);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ChatSession>('get_chat_session', { sessionId });
      setCurrentSession(result);
      return result;
    } catch (e) {
      setError(e as string);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback(
    async (title: string) => {
      setError(null);
      try {
        const result = await invoke<ChatSession>('create_chat_session', { title });
        setCurrentSession(result);
        await loadSessions();
        return result;
      } catch (e) {
        setError(e as string);
        return null;
      }
    },
    [loadSessions],
  );

  const addMessage = useCallback(
    async (sessionId: string, role: string, content: string, model?: string) => {
      setError(null);
      try {
        const result = await invoke<ChatMessage>('add_chat_message', {
          sessionId,
          role,
          content,
          model,
        });

        // Update current session if it matches
        if (currentSessionRef.current?.id === sessionId) {
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  messages: [...prev.messages, result],
                  message_count: prev.message_count + 1,
                }
              : null,
          );
        }

        return result;
      } catch (e) {
        setError(e as string);
        return null;
      }
    },
    [],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setError(null);
      try {
        await invoke('delete_chat_session', { sessionId });
        if (currentSessionRef.current?.id === sessionId) {
          setCurrentSession(null);
        }
        await loadSessions();
      } catch (e) {
        setError(e as string);
      }
    },
    [loadSessions],
  );

  const updateTitle = useCallback(
    async (sessionId: string, title: string) => {
      setError(null);
      try {
        const result = await invoke<ChatSession>('update_chat_title', { sessionId, title });
        if (currentSessionRef.current?.id === sessionId) {
          setCurrentSession(result);
        }
        await loadSessions();
        return result;
      } catch (e) {
        setError(e as string);
        return null;
      }
    },
    [loadSessions],
  );

  const clearAll = useCallback(async () => {
    setError(null);
    try {
      await invoke('clear_all_chats');
      setSessions([]);
      setCurrentSession(null);
    } catch (e) {
      setError(e as string);
    }
  }, []);

  return {
    sessions,
    currentSession,
    loading,
    error,
    loadSessions,
    loadSession,
    createSession,
    addMessage,
    deleteSession,
    updateTitle,
    clearAll,
    setCurrentSession,
  };
}
