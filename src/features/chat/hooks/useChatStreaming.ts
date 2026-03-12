/**
 * useChatStreaming â€” NDJSON streaming hook for Claude chat.
 *
 * Handles sending messages, streaming responses, and dispatching tool events.
 * Extracted from ClaudeChatView.tsx to reduce component complexity.
 */

import { useOnlineStatus } from '@jaskier/core';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useViewStore } from '@/stores/viewStore';
import { claudeStreamChat } from '../api/claudeStream';
import type { Attachment } from '../components/ChatInput';
import type { ChatMessage, ToolInteraction } from '../components/MessageBubble';

import type { useChatMessages } from './useChatMessages';

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

interface UseChatStreamingOptions {
  selectedModel: string;
  toolsEnabled: boolean;
  messageState: ReturnType<typeof useChatMessages>;
  addMessageWithSync: (sessionId: string, role: string, content: string, model?: string) => void;
  renameSessionWithSync: (id: string, newTitle: string) => void;
  generateTitleWithSync: (id: string) => Promise<void>;
  addPrompt: (content: string) => void;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatStreaming({
  selectedModel,
  toolsEnabled,
  messageState,
  addMessageWithSync,
  renameSessionWithSync,
  generateTitleWithSync,
  addPrompt,
  onComplete,
}: UseChatStreamingOptions) {
  const isOnline = useOnlineStatus();

  const { sessionMessagesRef, loadingSessionsRef, abortControllersRef, updateSessionMessages, setSessionLoading } =
    messageState;

  const handleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      // Block submission when offline
      if (!isOnline) {
        toast.error('You are offline. Cannot send messages.');
        return;
      }
      // Capture sessionId at send time â€” all updates target this session
      const sessionId = useViewStore.getState().activeSessionId;
      if (!selectedModel || !sessionId) return;
      if (loadingSessionsRef.current.has(sessionId)) return;

      // Build content with file attachments
      let content = text;
      for (const att of attachments) {
        if (att.type === 'file') {
          content += `\n\n--- File: ${att.name} ---\n${att.content}`;
        }
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        attachments: attachments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          content: a.content,
          mimeType: a.mimeType,
        })),
        timestamp: Date.now(),
      };

      // Capture messages BEFORE adding new ones â€” used to build API context
      const previousMessages = [...(sessionMessagesRef.current[sessionId] ?? [])];

      // Auto-name session on first user message
      if (previousMessages.length === 0) {
        const autoTitle = text.trim().substring(0, 30) + (text.trim().length > 30 ? '...' : '');
        renameSessionWithSync(sessionId, autoTitle || 'New Chat');
      }

      updateSessionMessages(sessionId, (prev) => [...prev, userMessage]);
      addPrompt(text);
      setSessionLoading(sessionId, true);

      // Persist user message to DB immediately (crash-safe)
      addMessageWithSync(sessionId, 'user', content, selectedModel);

      // Create placeholder assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolInteractions: [],
        timestamp: Date.now(),
        model: selectedModel,
        streaming: true,
      };
      updateSessionMessages(sessionId, (prev) => [...prev, assistantMessage]);

      // AbortController for this stream
      const controller = new AbortController();
      abortControllersRef.current[sessionId] = controller;

      let responseBuffer = '';

      try {
        // Build history for context (no frontend system prompt â€” backend handles it)
        const HISTORY_LIMIT = 20;
        const COMPRESS_KEEP_FULL = 6;
        const chatHistory: Array<{ role: string; content: string }> = [];
        const windowedMessages = previousMessages.slice(-HISTORY_LIMIT);
        for (let i = 0; i < windowedMessages.length; i++) {
          const m = windowedMessages[i];
          if (!m) continue;
          const isOld = i < windowedMessages.length - COMPRESS_KEEP_FULL;
          const msgContent =
            isOld && m.content.length > 500
              ? `${m.content.slice(0, 500)}... [truncated for context efficiency]`
              : m.content;
          chatHistory.push({ role: m.role, content: msgContent });
        }
        chatHistory.push({ role: 'user', content });

        for await (const event of claudeStreamChat(
          selectedModel,
          chatHistory,
          toolsEnabled,
          sessionId,
          controller.signal,
        )) {
          // Dispatch based on event type
          if (event.type === 'tool_call') {
            const ti: ToolInteraction = {
              id: event.tool_use_id ?? crypto.randomUUID(),
              toolName: event.tool_name ?? 'unknown',
              toolInput: event.tool_input ?? {},
              status: 'running',
            };

            updateSessionMessages(sessionId, (prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.streaming) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMsg,
                    toolInteractions: [...(lastMsg.toolInteractions ?? []), ti],
                  },
                ];
              }
              return prev;
            });
          } else if (event.type === 'tool_result') {
            const toolUseId = event.tool_use_id;
            updateSessionMessages(sessionId, (prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.streaming && lastMsg.toolInteractions) {
                const updatedInteractions = lastMsg.toolInteractions.map((ti) =>
                  ti.id === toolUseId
                    ? {
                        ...ti,
                        ...(event.result !== undefined && { result: event.result }),
                        ...(event.is_error !== undefined && { isError: event.is_error }),
                        status: (event.is_error ? 'error' : 'completed') as ToolInteraction['status'],
                      }
                    : ti,
                );
                return [...prev.slice(0, -1), { ...lastMsg, toolInteractions: updatedInteractions }];
              }
              return prev;
            });
          } else {
            // Text token (backward-compatible)
            const token = event.token ?? '';
            if (token) {
              responseBuffer += token;
            }

            updateSessionMessages(sessionId, (prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.streaming) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMsg,
                    content: lastMsg.content + token,
                    streaming: !event.done,
                  },
                ];
              }
              return prev;
            });

            if (event.done) {
              setSessionLoading(sessionId, false);
              delete abortControllersRef.current[sessionId];
              onComplete?.();
              // Persist assistant response to DB
              if (responseBuffer) {
                addMessageWithSync(sessionId, 'assistant', responseBuffer, event.model ?? selectedModel);
              }
              // Background title generation with 2s delay
              if (previousMessages.length === 0) {
                setTimeout(() => {
                  generateTitleWithSync(sessionId).catch(() => {
                    /* best-effort: substring title already set as placeholder */
                  });
                }, 2000);
              }
            }
          }
        }
      } catch (err) {
        // Ignore abort errors (user switched/cleared session)
        if (err instanceof DOMException && err.name === 'AbortError') {
          setSessionLoading(sessionId, false);
          delete abortControllersRef.current[sessionId];
          return;
        }
        console.error('Chat error:', err);
        toast.error('Failed to get response');
        updateSessionMessages(sessionId, (prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                streaming: false,
              },
            ];
          }
          return prev;
        });
        setSessionLoading(sessionId, false);
        delete abortControllersRef.current[sessionId];
      }
    },
    [
      selectedModel,
      toolsEnabled,
      isOnline,
      addMessageWithSync,
      renameSessionWithSync,
      generateTitleWithSync,
      updateSessionMessages,
      setSessionLoading,
      addPrompt,
      onComplete,
      sessionMessagesRef,
      loadingSessionsRef,
      abortControllersRef,
    ],
  );

  return { handleSend };
}
