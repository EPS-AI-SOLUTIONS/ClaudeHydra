/**
 * VirtualMessageList — Virtualized message rendering with @tanstack/react-virtual.
 * Use this for very long conversations (100+ messages) where DOM node count matters.
 *
 * #34 Virtual scroll for long message lists
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { ChatMessage } from './MessageBubble';
import { MessageBubble } from './MessageBubble';

interface VirtualMessageListProps {
  messages: ChatMessage[];
  highlightId?: string | null;
}

export function VirtualMessageList({ messages, highlightId }: VirtualMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120, // estimated row height
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto scrollbar-thin" role="log" aria-live="polite">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index];
          if (!msg) return null;
          return (
            <div
              key={msg.id}
              data-message-id={msg.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className={`py-2 ${highlightId === msg.id ? 'ring-2 ring-yellow-400/60 rounded-xl' : ''}`}
            >
              <MessageBubble
                message={msg}
                isLast={virtualRow.index === messages.length - 1}
                isStreaming={!!(msg as any).streaming}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
