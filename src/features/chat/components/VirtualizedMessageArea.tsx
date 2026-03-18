/**
 * VirtualizedMessageArea — Scrollable chat message area with virtual rendering.
 *
 * Uses @tanstack/react-virtual for efficient rendering of long conversations.
 * Includes search overlay, new-messages indicator, compaction divider, and
 * empty/welcome states.
 *
 * Extracted from ClaudeChatView.tsx to reduce component size.
 */

import { cn, EmptyState } from '@jaskier/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, Code2, FileSearch, FileText, GitBranch, Globe, MessageSquare, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type PromptSuggestion, PromptSuggestions } from '@/components/molecules/PromptSuggestions';
import { COMPACTION_DIVIDER_ID } from '../hooks/useChatMessages';
import type { ChatMessage } from './MessageBubble';
import { MessageBubble } from './MessageBubble';
import { SearchOverlay } from './SearchOverlay';

// ---------------------------------------------------------------------------
// Prompt suggestions for empty state
// ---------------------------------------------------------------------------

const CH_SUGGESTIONS: PromptSuggestion[] = [
  { labelKey: 'chat.suggestions.analyzeCode', fallback: 'Analyze the code structure of my project', icon: Code2 },
  { labelKey: 'chat.suggestions.readFile', fallback: 'Read and explain a file from my codebase', icon: FileSearch },
  { labelKey: 'chat.suggestions.gitStatus', fallback: 'Show git status and recent commits', icon: GitBranch },
  { labelKey: 'chat.suggestions.scrapeWebpage', fallback: 'Fetch and summarize a webpage', icon: Globe },
  { labelKey: 'chat.suggestions.ocrDocument', fallback: 'Extract text from an image or PDF (OCR)', icon: FileText },
  { labelKey: 'chat.suggestions.searchFiles', fallback: 'Search for a pattern across project files', icon: Search },
];

// ---------------------------------------------------------------------------
// Empty chat state sub-component (uses shared EmptyState molecule)
// ---------------------------------------------------------------------------

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
// Types
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
  onRetry?: (message: ChatMessage) => void;
  onLoadFullHistory?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VirtualizedMessageArea = memo<VirtualizedMessageAreaProps>(function VirtualizedMessageArea({
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
  onRetry,
  onLoadFullHistory,
}) {
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
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, virtualizer]);

  // Also scroll when the last message is streaming (content changing)
  const lastMessage = messages[messages.length - 1];
  const isLastStreaming = lastMessage?.streaming;
  useEffect(() => {
    if (isLastStreaming && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [isLastStreaming, lastMessage?.content.length, messages.length, virtualizer]);

  // Shared container props
  const containerClasses = cn('flex-1 p-4 overflow-y-auto relative transition-all rounded-lg', 'scrollbar-thin');
  const containerProps = {
    'data-testid': 'chat-message-area',
    role: 'log' as const,
    'aria-live': 'polite' as const,
    'aria-label': t('chat.messageArea', 'Chat messages'),
    className: containerClasses,
  };

  // Empty state / welcome message
  if (messages.length === 0) {
    return (
      <div ref={setParentRef} {...containerProps}>
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
    <div ref={setParentRef} {...containerProps}>
      {/* Search overlay */}
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

          // Compaction divider — visual separator with "load full history" button
          if (msg.id === COMPACTION_DIVIDER_ID) {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex items-center gap-3 py-3 px-2">
                  <div className="flex-1 h-px bg-[var(--matrix-accent)]/30" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[var(--matrix-accent)]/70">
                      {t('chat.compaction.divider', 'Starsze wiadomości skompresowane')}
                    </span>
                    {onLoadFullHistory && (
                      <button
                        type="button"
                        onClick={onLoadFullHistory}
                        className="text-xs font-mono text-[var(--matrix-accent)] hover:text-[var(--matrix-accent)]/80 underline underline-offset-2 transition-colors"
                      >
                        {t('chat.compaction.loadFull', 'Załaduj pełną historię')}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-[var(--matrix-accent)]/30" />
                </div>
              </div>
            );
          }

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
                  onRetry={onRetry}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} />
      <div ref={messagesEndRef} />

      {/* New messages floating button */}
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
});

VirtualizedMessageArea.displayName = 'VirtualizedMessageArea';
