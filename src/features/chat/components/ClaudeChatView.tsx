/**
 * ClaudeChatView — Full chat interface for Claude API with NDJSON streaming.
 *
 * Supports agentic tool_use loop: when tools are enabled, Claude can invoke
 * local file tools (read, list, write, search) and results are displayed
 * inline as collapsible ToolCallBlock panels.
 */

import {
  type AgentActivity,
  AgentActivityPanel,
  type Artifact,
  ArtifactPanel,
  EMPTY_ACTIVITY,
  usePromptHistory,
} from '@jaskier/chat-module';
import { useCompletionFeedback, useOnlineStatus } from '@jaskier/core';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { ModelOption } from '@/components/molecules/ModelSelector';
import { useAutoScroll } from '@/features/chat/hooks/useAutoScroll';
import { type ClaudeModel, FALLBACK_CLAUDE_MODELS, useClaudeModels } from '@/features/chat/hooks/useClaudeModels';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useWebSocketChat } from '@/shared/hooks/useWebSocketChat';
import { useViewStore } from '@/stores/viewStore';
import { claudeHealthCheck, DEFAULT_MODEL } from '../api/claudeStream';
import { useChatMessages } from '../hooks/useChatMessages';
import { type FallbackInfo, useChatStreaming } from '../hooks/useChatStreaming';
import { ChatHeader } from './ChatHeader';
import { type Attachment, ChatInput, type ChatInputHandle } from './ChatInput';
import { CompletionFeedback } from './CompletionFeedback';
import { FallbackBanner, type FallbackBannerData } from './FallbackBanner';
import type { ChatMessage } from './MessageBubble';
import { StreamingIndicator } from './StreamingIndicator';
import { VirtualizedMessageArea } from './VirtualizedMessageArea';

// ---------------------------------------------------------------------------
// Model option adapter
// ---------------------------------------------------------------------------

function toModelOption(m: ClaudeModel): ModelOption {
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    available: m.available,
    description: m.tier,
  };
}

// ---------------------------------------------------------------------------
// ClaudeChatView component
// ---------------------------------------------------------------------------

export function ClaudeChatView() {
  const { t } = useTranslation();

  // Dynamic model registry (falls back to hardcoded list)
  const { data: claudeModels } = useClaudeModels();
  const models = claudeModels ?? FALLBACK_CLAUDE_MODELS;

  // Model state
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [claudeConnected, setClaudeConnected] = useState(false);

  // Tools toggle
  const [toolsEnabled, setToolsEnabled] = useState(true);

  // Per-session message state (extracted hook)
  const messageState = useChatMessages();
  const { messages, isLoading, clearChat, loadFullHistory } = messageState;

  // DB sync
  const { addMessageWithSync, renameSessionWithSync, generateTitleWithSync } = useSessionSync();
  const currentSessionId = useViewStore(useShallow((s) => s.currentSessionId));
  const activeSession = useViewStore(useShallow((s) => s.sessions.find((cs) => cs.id === s.currentSessionId)));
  const setSessionWorkingDirectory = useViewStore(useShallow((s) => s.setSessionWorkingDirectory));
  const activeArtifact = useViewStore(useShallow((s) => s.activeArtifact)) as Artifact | null;
  const setActiveArtifact = useViewStore(useShallow((s) => s.setActiveArtifact));

  // Settings (for welcome message)
  const { data: settings } = useSettingsQuery();

  // #25 — Offline detection
  const isOnline = useOnlineStatus();

  // #19 — Message search (Ctrl+F)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatchId, setSearchMatchId] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  // #20 — Auto-scroll indicator
  const { containerRef: autoScrollRef, bottomRef, showNewMessages, scrollToBottom } = useAutoScroll(messages.length);

  // Merge container refs
  const setChatRef = useCallback(
    (el: HTMLDivElement | null) => {
      (chatContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      (autoScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [autoScrollRef],
  );

  // ----- Check Claude API connectivity on mount ----------------------------

  useEffect(() => {
    void claudeHealthCheck().then(setClaudeConnected);
  }, []);

  // ----- Ctrl+F search overlay (#19) ----------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearchMatchChange = useCallback((messageId: string | null) => {
    setSearchMatchId(messageId);
    if (messageId) {
      const el = document.querySelector(`[data-message-id="${messageId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // ----- Model selection adapter -------------------------------------------

  const modelOptions = useMemo(() => models.map(toModelOption), [models]);

  const handleModelSelect = useCallback((model: ModelOption) => {
    setSelectedModel(model.id);
  }, []);

  // ----- Tools toggle handler (stable ref for ChatHeader) ------------------

  const handleToolsToggle = useCallback(() => {
    setToolsEnabled((v) => !v);
  }, []);

  // ----- Per-session working directory -------------------------------------

  const handleWorkingDirectoryChange = useCallback(
    (wd: string) => {
      if (currentSessionId) {
        setSessionWorkingDirectory(currentSessionId, wd);
      }
    },
    [currentSessionId, setSessionWorkingDirectory],
  );

  // ----- Artifact panel close handler (shared ArtifactPanel takes props) ---

  const handleCloseArtifact = useCallback(() => {
    setActiveArtifact(null);
  }, [setActiveArtifact]);

  // ----- Prompt history for arrow-key navigation (global, SQL-backed) ------

  const { promptHistory, addPrompt } = usePromptHistory();

  // ----- Completion feedback (chime + toast + flash) -----------------------

  const { triggerCompletion, flashActive } = useCompletionFeedback();

  // ----- Load full history (after compaction) -----------------------------

  const handleLoadFullHistory = useCallback(() => {
    if (currentSessionId) {
      loadFullHistory(currentSessionId);
    }
  }, [currentSessionId, loadFullHistory]);

  // ----- WebSocket streaming (primary) + NDJSON (fallback) -----------------

  const [agentActivity, setAgentActivity] = useState<AgentActivity>(EMPTY_ACTIVITY);
  const [fallbackBanner, setFallbackBanner] = useState<FallbackBannerData | null>(null);
  const tokenBatchRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFallback = useCallback((info: FallbackInfo) => {
    setFallbackBanner({ from: info.from, to: info.to, reason: info.reason });
  }, []);

  const dismissFallbackBanner = useCallback(() => {
    setFallbackBanner(null);
  }, []);

  const flushTokenBatch = useCallback(() => {
    const batch = tokenBatchRef.current;
    if (!batch) return;
    tokenBatchRef.current = '';
    const sid = useViewStore.getState().currentSessionId;
    if (!sid) return;
    messageState.updateSessionMessages(sid, (prev) => {
      const last = prev[prev.length - 1];
      if (last?.streaming) {
        return [...prev.slice(0, -1), { ...last, content: last.content + batch }];
      }
      return prev;
    });
  }, [messageState]);

  const ws = useWebSocketChat({
    onStart: (msg) => {
      setAgentActivity({ agent: null, model: msg.model, confidence: null, planSteps: [], tools: [], isActive: true });
      // Confirm any pending user messages now that the stream has started
      const sid = useViewStore.getState().currentSessionId;
      if (sid) {
        messageState.updateSessionMessages(sid, (prev) =>
          prev.map((m) => (m.status === 'pending' ? { ...m, status: 'confirmed' as const } : m)),
        );
      }
    },
    onToken: (content) => {
      tokenBatchRef.current += content;
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          flushTokenBatch();
        }, 50);
      }
    },
    onToolCall: (msg) => {
      setAgentActivity((prev) => ({
        ...prev,
        tools: [
          ...prev.tools,
          {
            name: msg.name,
            args: msg.args,
            iteration: msg.iteration,
            status: 'running' as const,
            startedAt: Date.now(),
          },
        ],
      }));
      const sid = useViewStore.getState().currentSessionId;
      if (sid) {
        messageState.updateSessionMessages(sid, (prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                toolInteractions: [
                  ...(last.toolInteractions ?? []),
                  {
                    id: `ws-${msg.iteration}-${msg.name}`,
                    toolName: msg.name,
                    toolInput: msg.args,
                    status: 'running' as const,
                  },
                ],
              },
            ];
          }
          return prev;
        });
      }
    },
    onToolResult: (msg) => {
      // Auto-open tool results in Artifact Panel if they look like data (JSON/Tables) or are very long
      if (msg.success && msg.summary) {
        const text = msg.summary.trim();
        const isJson = text.startsWith('[') || text.startsWith('{');
        const isTable = text.includes('|---') || text.includes('| ---');
        const isSql = /^(SELECT|UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|WITH)\s+/i.test(text);

        if (isJson || isTable || isSql || text.length > 800) {
          useViewStore.getState().setActiveArtifact({
            id: 'tool-res-$($msg.iteration)-$($msg.name)',
            code: text,
            language: isJson ? 'json' : isTable ? 'markdown' : isSql ? 'sql' : 'text',
            title: 'Result: $($msg.name)',
          });
        }
      }

      setAgentActivity((prev) => ({
        ...prev,
        tools: prev.tools.map((t) =>
          t.name === msg.name && t.status === 'running'
            ? {
                ...t,
                status: msg.success ? ('success' as const) : ('error' as const),
                summary: msg.summary,
                completedAt: Date.now(),
              }
            : t,
        ),
      }));
      const sid = useViewStore.getState().currentSessionId;
      if (sid) {
        messageState.updateSessionMessages(sid, (prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming && last.toolInteractions) {
            const updated = last.toolInteractions.map((ti) =>
              ti.toolName === msg.name && ti.status === 'running'
                ? {
                    ...ti,
                    result: msg.summary,
                    isError: !msg.success,
                    status: msg.success ? ('completed' as const) : ('error' as const),
                  }
                : ti,
            );
            return [...prev.slice(0, -1), { ...last, toolInteractions: updated }];
          }
          return prev;
        });
      }
    },
    onToolProgress: () => {},
    onIteration: () => {},
    onComplete: () => {
      flushTokenBatch();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      setAgentActivity((prev) => ({ ...prev, isActive: false }));
      const sid = useViewStore.getState().currentSessionId;
      if (sid) {
        messageState.updateSessionMessages(sid, (prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }];
          return prev;
        });
        messageState.setSessionLoading(sid, false);
        const currentMsgs = messageState.sessionMessagesRef.current[sid];
        const lastMsg = currentMsgs?.[currentMsgs.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content) {
          addMessageWithSync(sid, 'assistant', lastMsg.content, selectedModel);
        }
        triggerCompletion();
      }
    },
    onError: (message) => {
      flushTokenBatch();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      setAgentActivity((prev) => ({ ...prev, isActive: false }));
      const sid = useViewStore.getState().currentSessionId;
      if (sid) {
        messageState.updateSessionMessages(sid, (prev) => {
          // Remove the empty streaming assistant message and mark the user message as error
          const withoutStreaming = prev.filter((m) => !(m.streaming && m.role === 'assistant' && !m.content));
          return withoutStreaming.map((m) => (m.status === 'pending' ? { ...m, status: 'error' as const } : m));
        });
        messageState.setSessionLoading(sid, false);
      }
      toast.error(message);
    },
    onFallback: (msg) => {
      handleFallback({ from: msg.from, to: msg.to, reason: msg.reason });
    },
  });

  const wsHandleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (!isOnline) {
        toast.error('You are offline. Cannot send messages.');
        return;
      }
      const sessionId = useViewStore.getState().currentSessionId;
      if (!selectedModel || !sessionId) return;
      if (messageState.loadingSessionsRef.current.has(sessionId)) return;

      let content = text;
      for (const att of attachments) {
        if (att.type === 'file') content += `\n\n--- File: ${att.name} ---\n${att.content}`;
      }

      const previousMessages = [...(messageState.sessionMessagesRef.current[sessionId] ?? [])];
      if (previousMessages.length === 0) {
        const autoTitle = text.trim().substring(0, 30) + (text.trim().length > 30 ? '...' : '');
        renameSessionWithSync(sessionId, autoTitle || 'New Chat');
      }

      const userMessageId = crypto.randomUUID();
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content,
        status: 'pending',
        attachments: attachments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          content: a.content,
          mimeType: a.mimeType,
        })),
        timestamp: Date.now(),
      };
      messageState.updateSessionMessages(sessionId, (prev) => [...prev, userMessage]);
      addPrompt(text);
      messageState.setSessionLoading(sessionId, true);
      addMessageWithSync(sessionId, 'user', content, selectedModel);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolInteractions: [],
        timestamp: Date.now(),
        model: selectedModel,
        streaming: true,
      };
      messageState.updateSessionMessages(sessionId, (prev) => {
        // Confirm the pending user message now that assistant streaming starts
        return prev
          .map((m) => (m.id === userMessageId ? { ...m, status: 'confirmed' as const } : m))
          .concat(assistantMessage);
      });

      setAgentActivity(EMPTY_ACTIVITY);
      ws.sendExecute(text, selectedModel, toolsEnabled, sessionId);

      if (previousMessages.length === 0) {
        setTimeout(() => {
          generateTitleWithSync(sessionId).catch(() => {});
        }, 2000);
      }
    },
    [
      ws,
      selectedModel,
      toolsEnabled,
      isOnline,
      messageState,
      addMessageWithSync,
      renameSessionWithSync,
      generateTitleWithSync,
      addPrompt,
    ],
  );

  // NDJSON fallback streaming
  const { handleSend: ndjsonHandleSend } = useChatStreaming({
    selectedModel,
    toolsEnabled,
    messageState,
    addMessageWithSync,
    renameSessionWithSync,
    generateTitleWithSync,
    addPrompt,
    onComplete: triggerCompletion,
    onFallback: handleFallback,
  });

  // Route: WS when connected, NDJSON fallback
  const handleSend = ws.status === 'connected' ? wsHandleSend : ndjsonHandleSend;
  const effectiveLoading = isLoading || ws.isStreaming;

  // ----- Retry handler for error messages -----------------------------------

  const handleRetry = useCallback(
    (msg: ChatMessage) => {
      const sessionId = useViewStore.getState().currentSessionId;
      if (!sessionId || !msg.content) return;
      // Remove the errored message from the session
      messageState.updateSessionMessages(sessionId, (prev) => prev.filter((m) => m.id !== msg.id));
      // Re-send the same content
      handleSend(msg.content, []);
    },
    [handleSend, messageState],
  );

  // ----- Render -------------------------------------------------------------

  return (
    <CompletionFeedback flashActive={flashActive} className="h-full flex flex-col p-4">
      {/* Header */}
      <ChatHeader
        claudeConnected={claudeConnected}
        modelCount={models.length}
        modelOptions={modelOptions}
        selectedModel={selectedModel || null}
        onModelSelect={handleModelSelect}
        toolsEnabled={toolsEnabled}
        onToolsToggle={handleToolsToggle}
        messages={messages}
        activeSessionTitle={activeSession?.title}
        activeSessionCreatedAt={activeSession?.createdAt}
        onClearChat={clearChat}
        wsConnectionStatus={ws.connectionStatus}
        wsConnectionGaveUp={ws.connectionGaveUp}
        onWsReconnect={ws.manualReconnect}
      />

      {/* Model fallback notification */}
      <FallbackBanner data={fallbackBanner} onDismiss={dismissFallbackBanner} />

      {/* #1 Virtualized message area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden gap-2">
        <VirtualizedMessageArea
          messages={messages}
          welcomeMessage={settings?.welcome_message}
          setChatRef={setChatRef}
          bottomRef={bottomRef}
          messagesEndRef={messagesEndRef}
          searchOpen={searchOpen}
          searchMatchId={searchMatchId}
          onSearchMatchChange={handleSearchMatchChange}
          onSearchClose={() => {
            setSearchOpen(false);
            setSearchMatchId(null);
          }}
          showNewMessages={showNewMessages}
          scrollToBottom={scrollToBottom}
          onSuggestionSelect={(text) => chatInputRef.current?.setValue(text)}
          onLoadFullHistory={handleLoadFullHistory}
          onRetry={handleRetry}
        />

        <ArtifactPanel activeArtifact={activeArtifact} onClose={handleCloseArtifact} />
      </div>

      {/* Streaming indicator bar */}
      <StreamingIndicator isStreaming={effectiveLoading} />

      {/* Agent Activity Panel — visible during WS streaming */}
      <AnimatePresence>
        {(agentActivity.isActive || agentActivity.tools.length > 0) && (
          <div className="mt-2">
            <AgentActivityPanel activity={agentActivity} />
          </div>
        )}
      </AnimatePresence>

      {/* Chat input — #25 disabled when offline */}
      <div className="mt-3">
        <ChatInput
          ref={chatInputRef}
          onSend={handleSend}
          disabled={!claudeConnected || !selectedModel || !isOnline}
          isLoading={effectiveLoading}
          placeholder={
            !isOnline
              ? t('chat.offlinePlaceholder', 'You are offline')
              : claudeConnected
                ? 'Type a message... (Shift+Enter = new line)'
                : 'Configure API key in Settings'
          }
          promptHistory={promptHistory}
          sessionId={currentSessionId ?? undefined}
          workingDirectory={activeSession?.workingDirectory}
          onWorkingDirectoryChange={handleWorkingDirectoryChange}
        />
      </div>
    </CompletionFeedback>
  );
}

export default ClaudeChatView;
