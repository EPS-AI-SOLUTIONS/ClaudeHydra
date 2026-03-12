/**
 * ClaudeChatView — Full chat interface for Claude API with NDJSON streaming.
 *
 * Supports agentic tool_use loop: when tools are enabled, Claude can invoke
 * local file tools (read, list, write, search) and results are displayed
 * inline as collapsible ToolCallBlock panels.
 */

import { useCompletionFeedback, useOnlineStatus } from '@jaskier/core';
import { cn, EmptyState } from '@jaskier/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, Code2, FileSearch, FileText, GitBranch, Globe, MessageSquare, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { ModelOption } from '@/components/molecules/ModelSelector';
import { type PromptSuggestion, PromptSuggestions } from '@/components/molecules/PromptSuggestions';
import { useAutoScroll } from '@/features/chat/hooks/useAutoScroll';
import { type ClaudeModel, FALLBACK_CLAUDE_MODELS, useClaudeModels } from '@/features/chat/hooks/useClaudeModels';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useWebSocketChat } from '@/shared/hooks/useWebSocketChat';
import { useViewStore } from '@/stores/viewStore';
import { claudeHealthCheck, DEFAULT_MODEL } from '../api/claudeStream';
import { useChatMessages } from '../hooks/useChatMessages';
import { useChatStreaming } from '../hooks/useChatStreaming';
import { usePromptHistory } from '../hooks/usePromptHistory';
import { type AgentActivity, AgentActivityPanel, EMPTY_ACTIVITY } from './AgentActivityPanel';
import { ArtifactPanel } from './ArtifactPanel';
import { ChatHeader } from './ChatHeader';
import { type Attachment, ChatInput, type ChatInputHandle } from './ChatInput';
import { type ChatMessage, MessageBubble } from './MessageBubble';
import { SearchOverlay } from './SearchOverlay';

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
// Empty state sub-component (uses shared EmptyState molecule)
// ---------------------------------------------------------------------------

const CH_SUGGESTIONS: PromptSuggestion[] = [
  { labelKey: 'chat.suggestions.analyzeCode', fallback: 'Analyze the code structure of my project', icon: Code2 },
  { labelKey: 'chat.suggestions.readFile', fallback: 'Read and explain a file from my codebase', icon: FileSearch },
  { labelKey: 'chat.suggestions.gitStatus', fallback: 'Show git status and recent commits', icon: GitBranch },
  { labelKey: 'chat.suggestions.scrapeWebpage', fallback: 'Fetch and summarize a webpage', icon: Globe },
  { labelKey: 'chat.suggestions.ocrDocument', fallback: 'Extract text from an image or PDF (OCR)', icon: FileText },
  { labelKey: 'chat.suggestions.searchFiles', fallback: 'Search for a pattern across project files', icon: Search },
];

function EmptyChatState({ onSuggestionSelect }: { onSuggestionSelect: (text: string) => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      data-testid="chat-empty-state"
      className="h-full flex flex-col items-center justify-center"
    >
      <EmptyState
        icon={<MessageSquare />}
        title={t('chat.startConversation', 'Start a new conversation')}
        description={t(
          'chat.selectModelAndType',
          'Select a model and type a message. Drag and drop files to add context.',
        )}
      />
      <PromptSuggestions suggestions={CH_SUGGESTIONS} onSelect={onSuggestionSelect} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// #1 — Virtualized message area sub-component
// Uses @tanstack/react-virtual for efficient rendering of long conversations.
// ---------------------------------------------------------------------------

interface VirtualizedMessageAreaProps {
  messages: ChatMessage[];
  welcomeMessage?: string;
  setChatRef: (el: HTMLDivElement | null) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  searchOpen: boolean;
  searchMatchId: string | null;
  onSearchMatchChange: (messageId: string | null) => void;
  onSearchClose: () => void;
  showNewMessages: boolean;
  scrollToBottom: () => void;
  onSuggestionSelect: (text: string) => void;
}

function VirtualizedMessageArea({
  messages,
  welcomeMessage,
  setChatRef,
  bottomRef,
  messagesEndRef,
  searchOpen,
  searchMatchId,
  onSearchMatchChange,
  onSearchClose,
  showNewMessages,
  scrollToBottom,
  onSuggestionSelect,
}: VirtualizedMessageAreaProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);

  // Merge parent ref with external setChatRef
  const setParentRef = useCallback(
    (el: HTMLDivElement | null) => {
      (parentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setChatRef(el);
    },
    [setChatRef],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevCountRef.current && messages.length > 0) {
      // Scroll to the last item
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, virtualizer]);

  // Also scroll when the last message is streaming (content changing)
  const lastMessage = messages[messages.length - 1];
  const isLastStreaming = lastMessage?.streaming;
  // biome-ignore lint/correctness/useExhaustiveDependencies: lastMessage?.content.length is intentional — triggers scroll on each streaming token
  useEffect(() => {
    if (isLastStreaming && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [isLastStreaming, lastMessage?.content.length, messages.length, virtualizer]);

  // Empty state / welcome message
  if (messages.length === 0) {
    return (
      <div
        ref={setParentRef}
        data-testid="chat-message-area"
        role="log"
        aria-live="polite"
        aria-label={t('chat.messageArea', 'Chat messages')}
        className={cn('flex-1 p-4 overflow-y-auto relative transition-all rounded-lg', 'scrollbar-thin')}
      >
        <AnimatePresence>
          {searchOpen && (
            <SearchOverlay
              messages={messages.filter((m): m is ChatMessage & { id: string } => !!m.id)}
              onMatchChange={onSearchMatchChange}
              onClose={onSearchClose}
            />
          )}
        </AnimatePresence>
        {welcomeMessage ? (
          <div className="space-y-4">
            <MessageBubble
              message={{
                id: 'welcome',
                role: 'assistant',
                content: welcomeMessage,
                timestamp: Date.now(),
              }}
              isLast={true}
              isStreaming={false}
            />
          </div>
        ) : (
          <EmptyChatState onSuggestionSelect={onSuggestionSelect} />
        )}
      </div>
    );
  }

  return (
    <div
      ref={setParentRef}
      data-testid="chat-message-area"
      role="log"
      aria-live="polite"
      aria-label={t('chat.messageArea', 'Chat messages')}
      className={cn('flex-1 p-4 overflow-y-auto relative transition-all rounded-lg', 'scrollbar-thin')}
    >
      {/* #19 — Search overlay */}
      <AnimatePresence>
        {searchOpen && (
          <SearchOverlay
            messages={messages.filter((m): m is ChatMessage & { id: string } => !!m.id)}
            onMatchChange={onSearchMatchChange}
            onClose={onSearchClose}
          />
        )}
      </AnimatePresence>

      {/* Virtualized message list */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index];
          if (!msg) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              data-message-id={msg.id}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className={`pb-4 ${searchMatchId === msg.id ? 'ring-2 ring-yellow-400/60 rounded-xl' : ''}`}>
                <MessageBubble
                  message={msg}
                  isLast={virtualRow.index === messages.length - 1}
                  isStreaming={!!msg.streaming}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} />
      <div ref={messagesEndRef} />

      {/* #20 — New messages floating button */}
      <AnimatePresence>
        {showNewMessages && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)] text-sm font-mono shadow-lg hover:shadow-xl transition-shadow"
            aria-label={t('chat.newMessages', 'New messages, scroll to bottom')}
          >
            <ArrowDown size={14} />
            {t('chat.newMessages', 'New messages')}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
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
  const { messages, isLoading, clearChat } = messageState;

  // DB sync
  const { addMessageWithSync, renameSessionWithSync, generateTitleWithSync } = useSessionSync();
  const activeSessionId = useViewStore(useShallow((s) => s.activeSessionId));
  const activeSession = useViewStore(useShallow((s) => s.chatSessions.find((cs) => cs.id === s.activeSessionId)));
  const setSessionWorkingDirectory = useViewStore(useShallow((s) => s.setSessionWorkingDirectory));

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
      if (activeSessionId) {
        setSessionWorkingDirectory(activeSessionId, wd);
      }
    },
    [activeSessionId, setSessionWorkingDirectory],
  );

  // ----- Prompt history for arrow-key navigation (global, SQL-backed) ------

  const { promptHistory, addPrompt } = usePromptHistory();

  // ----- Completion feedback (chime + toast + flash) -----------------------

  const { triggerCompletion, flashActive } = useCompletionFeedback();

  // ----- WebSocket streaming (primary) + NDJSON (fallback) -----------------

  const [agentActivity, setAgentActivity] = useState<AgentActivity>(EMPTY_ACTIVITY);
  const tokenBatchRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushTokenBatch = useCallback(() => {
    const batch = tokenBatchRef.current;
    if (!batch) return;
    tokenBatchRef.current = '';
    const sid = useViewStore.getState().activeSessionId;
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
      const sid = useViewStore.getState().activeSessionId;
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
      const sid = useViewStore.getState().activeSessionId;
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
      const sid = useViewStore.getState().activeSessionId;
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
      const sid = useViewStore.getState().activeSessionId;
      if (sid) {
        messageState.updateSessionMessages(sid, (prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming)
            return [...prev.slice(0, -1), { ...last, content: `Error: ${message}`, streaming: false }];
          return prev;
        });
        messageState.setSessionLoading(sid, false);
      }
      toast.error(message);
    },
  });

  const wsHandleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (!isOnline) {
        toast.error('You are offline. Cannot send messages.');
        return;
      }
      const sessionId = useViewStore.getState().activeSessionId;
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
      messageState.updateSessionMessages(sessionId, (prev) => [...prev, assistantMessage]);

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
  });

  // Route: WS when connected, NDJSON fallback
  const handleSend = ws.status === 'connected' ? wsHandleSend : ndjsonHandleSend;
  const effectiveLoading = isLoading || ws.isStreaming;

  // ----- Render -------------------------------------------------------------

  return (
    <div
      data-testid="chat-view"
      className={cn('h-full flex flex-col p-4', flashActive && 'completion-flash rounded-xl')}
    >
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
      />

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
        />

        <AnimatePresence>{useViewStore(useShallow((s) => s.activeArtifact)) && <ArtifactPanel />}</AnimatePresence>
      </div>

      {/* Streaming indicator bar */}
      {effectiveLoading && (
        <motion.div
          data-testid="chat-streaming-bar"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          className="h-0.5 bg-gradient-to-r from-transparent via-[var(--matrix-accent)] to-transparent origin-left mt-1 rounded-full"
        />
      )}

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
          sessionId={activeSessionId ?? undefined}
          workingDirectory={activeSession?.workingDirectory}
          onWorkingDirectoryChange={handleWorkingDirectoryChange}
        />
      </div>
    </div>
  );
}

export default ClaudeChatView;
