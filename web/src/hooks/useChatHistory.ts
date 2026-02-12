'use client';

import { useCallback, useRef, useState } from 'react';
import { type ChatMessage, type ChatSession, chatsApi } from '@/lib/api-client';

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
  const [currentSession, setCurrentSession] = useState<
    (ChatSession & { messages: ChatMessage[] }) | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentSessionRef = useRef(currentSession);
  currentSessionRef.current = currentSession;

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await chatsApi.listSessions();
      // Map to summaries with preview
      const summaries: ChatSessionSummary[] = result.map((s) => ({
        id: s.id,
        title: s.title,
        created_at: s.created_at,
        updated_at: s.updated_at,
        message_count: s.message_count,
        model: s.model,
        preview: '',
      }));
      setSessions(summaries);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [session, messages] = await Promise.all([
        chatsApi.getSession(sessionId),
        chatsApi.getMessages(sessionId),
      ]);
      const full = { ...session, messages };
      setCurrentSession(full);
      return full;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback(
    async (title: string) => {
      setError(null);
      try {
        const result = await chatsApi.createSession({ title });
        const full = { ...result, messages: [] as ChatMessage[] };
        setCurrentSession(full);
        await loadSessions();
        return full;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [loadSessions],
  );

  const addMessage = useCallback(
    async (sessionId: string, role: string, content: string, model?: string) => {
      setError(null);
      try {
        const result = await chatsApi.addMessage(sessionId, {
          role: role as ChatMessage['role'],
          content,
          model,
        });

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
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setError(null);
      try {
        await chatsApi.deleteSession(sessionId);
        if (currentSessionRef.current?.id === sessionId) {
          setCurrentSession(null);
        }
        await loadSessions();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [loadSessions],
  );

  const updateTitle = useCallback(
    async (sessionId: string, title: string) => {
      setError(null);
      try {
        // PATCH the session title
        const res = await fetch(`/api/chats/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error(`Update failed: ${res.status}`);
        const result = await res.json();

        if (currentSessionRef.current?.id === sessionId) {
          setCurrentSession((prev) => (prev ? { ...prev, title: result.title } : null));
        }
        await loadSessions();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [loadSessions],
  );

  const clearAll = useCallback(async () => {
    setError(null);
    try {
      // Delete all sessions one by one (no bulk endpoint yet)
      for (const s of sessions) {
        await chatsApi.deleteSession(s.id);
      }
      setSessions([]);
      setCurrentSession(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessions]);

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
