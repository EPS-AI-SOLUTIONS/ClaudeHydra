/**
 * useChatMessages — Per-session message state management.
 *
 * Handles message caching across sessions, lazy loading from DB,
 * and session switching without losing state.
 *
 * Extracted from ClaudeChatView.tsx to reduce component complexity.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/shared/api/client';
import { useViewStore } from '@/stores/viewStore';
import type { ChatMessage } from '../components/MessageBubble';
import type { ToolInteraction } from '../components/ToolCallBlock';
import type { SessionDetail } from './useSessions';

export function useChatMessages() {
  // Per-session message cache & loading state
  const sessionMessagesRef = useRef<Record<string, ChatMessage[]>>({});
  const loadingSessionsRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Displayed state (derived from active session)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const activeSessionId = useViewStore((s) => s.activeSessionId);

  /** Update messages for a specific session. Only updates display if session is active. */
  const updateSessionMessages = useCallback((sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    const prev = sessionMessagesRef.current[sessionId] ?? [];
    let updated = updater(prev);
    
    // Auto-compaction: if messages exceed 25, keep the last 15 to save tokens
    if (updated.length > 25) {
      const compactedMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: '_[System] History automatically compacted to save tokens. Older messages archived._',
        timestamp: new Date()
      };
      updated = [compactedMessage, ...updated.slice(updated.length - 15)];
    }

    sessionMessagesRef.current[sessionId] = updated;

    if (sessionId === useViewStore.getState().activeSessionId) {
      setMessages(updated);
    }
  }, []);

  /** Set loading state for a specific session. Only updates display if session is active. */
  const setSessionLoading = useCallback((sessionId: string, loading: boolean) => {
    if (loading) {
      loadingSessionsRef.current.add(sessionId);
    } else {
      loadingSessionsRef.current.delete(sessionId);
    }

    if (sessionId === useViewStore.getState().activeSessionId) {
      setIsLoading(loading);
    }
  }, []);

  // ----- Session switch: save & restore messages ---------------------------

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const cached = sessionMessagesRef.current[activeSessionId] ?? [];
    if (cached.length > 0) {
      setMessages(cached);
      setIsLoading(loadingSessionsRef.current.has(activeSessionId));
      return;
    }

    // Lazy-load from DB when sessionMessagesRef is empty (e.g. after page refresh)
    let cancelled = false;
    setIsLoading(true);
    apiGet<SessionDetail>(`/api/sessions/${activeSessionId}`)
      .then((detail) => {
        if (cancelled) return;
        const mapped: ChatMessage[] = detail.messages.map((m) => ({
          id: m.id,
          role: m.role as ChatMessage['role'],
          content: m.content,
          model: m.model ?? undefined,
          timestamp: new Date(m.timestamp),
          toolInteractions: m.tool_interactions?.map(
            (ti): ToolInteraction => ({
              id: ti.tool_use_id,
              toolName: ti.tool_name,
              toolInput: ti.tool_input,
              result: ti.result,
              isError: ti.is_error,
              status: 'completed',
            }),
          ),
        }));
        sessionMessagesRef.current[activeSessionId] = mapped;
        setMessages(mapped);
      })
      .catch(() => {
        // Best-effort: session may not exist in DB yet (local-only)
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  /** Clear messages for the active session. */
  const clearChat = useCallback(() => {
    if (activeSessionId) {
      sessionMessagesRef.current[activeSessionId] = [];
      loadingSessionsRef.current.delete(activeSessionId);
      // Abort any in-progress stream for this session
      abortControllersRef.current[activeSessionId]?.abort();
      delete abortControllersRef.current[activeSessionId];
    }
    setMessages([]);
    setIsLoading(false);
  }, [activeSessionId]);

  return {
    messages,
    isLoading,
    sessionMessagesRef,
    loadingSessionsRef,
    abortControllersRef,
    updateSessionMessages,
    setSessionLoading,
    clearChat,
  };
}


