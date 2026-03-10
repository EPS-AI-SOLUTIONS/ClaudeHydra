import { AgentAvatar, BaseMessageBubble } from '@jaskier/ui';
import { Terminal } from 'lucide-react';
import { type MouseEvent, memo, useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { useCurrentSessionId } from '@/stores/viewStore';
import { ErrorBoundary } from './ErrorBoundary';
import { MessageRating } from './MessageRating';
import { splitToolOutput, stripParallelHeader } from './messageParser';

export interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  timestamp?: number;
  error?: boolean;
  model?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>, message: ChatMessage) => void;
}

export const MessageBubble = memo<MessageBubbleProps>(({ message, isLast, isStreaming, onContextMenu }) => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const currentSessionId = useCurrentSessionId();

  const deferredContent = useDeferredValue(message.content);
  const cleanedContent = useMemo(() => stripParallelHeader(deferredContent), [deferredContent]);
  const segments = useMemo(() => splitToolOutput(cleanedContent), [cleanedContent]);

  const textContent = useMemo(
    () =>
      segments
        .filter((s) => s.type === 'text')
        .map((s) => s.content)
        .join('\n'),
    [segments],
  );
  const toolSegments = useMemo(() => segments.filter((s) => s.type === 'tool'), [segments]);

  const status = useMemo<'idle' | 'typing' | 'thinking' | 'error'>(() => {
    if (message.error) return 'error';
    if (isStreaming && isLast) return message.content ? 'typing' : 'thinking';
    return 'idle';
  }, [message.error, isStreaming, isLast, message.content]);

  const assistantBubbleClasses = theme.isLight
    ? 'bg-white/50 border border-white/30 text-black shadow-sm'
    : 'bg-black/40 border border-[var(--glass-border)] text-white shadow-lg backdrop-blur-sm';

  const userBubbleClasses = theme.isLight
    ? 'bg-emerald-500/15 border border-emerald-500/20 text-black'
    : 'bg-[var(--matrix-accent)]/15 border border-[var(--matrix-accent)]/20 text-white';

  const toolDetailsClasses = theme.isLight ? 'border-black/10 bg-black/5' : 'border-white/10 bg-black/20';

  const toolSummaryClasses = theme.isLight ? 'text-black/60 hover:text-black/80' : 'text-white/60 hover:text-white/80';

  const toolPreClasses = theme.isLight ? 'text-black/70 border-black/5' : 'text-white/70 border-white/5';

  return (
    <ErrorBoundary name="MessageBubble">
      <div onContextMenu={(e) => onContextMenu?.(e, message)}>
        <BaseMessageBubble
          message={{
            id: message.id || '',
            role: message.role as any,
            content: textContent,
            isStreaming: isStreaming && isLast,
            timestamp: message.timestamp,
          }}
          theme={{
            isLight: theme.isLight,
            bubbleAssistant: assistantBubbleClasses,
            bubbleUser: userBubbleClasses,
            accentText: theme.accentText,
            accentBg: theme.accentBg,
            textMuted: theme.textMuted,
          }}
          avatar={message.role === 'assistant' ? <AgentAvatar status={status} /> : undefined}
          copyText={t('chat.copyMessage', 'Copy message')}
          copiedText={t('common.copied', 'Copied')}
          modelBadge={message.model}
          toolInteractions={
            toolSegments.length > 0 ? (
              <div className="mb-3">
                {toolSegments.map((segment, i) => (
                  <details
                    key={`tool-${segment.name}-${i}`}
                    className={cn('my-2 rounded-lg border', toolDetailsClasses)}
                  >
                    <summary
                      aria-expanded="false"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.currentTarget.parentElement?.toggleAttribute('open');
                          e.currentTarget.setAttribute(
                            'aria-expanded',
                            e.currentTarget.parentElement?.hasAttribute('open') ? 'true' : 'false',
                          );
                        }
                      }}
                      className={cn(
                        'cursor-pointer px-3 py-2 text-xs flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--matrix-accent)] focus-visible:rounded',
                        toolSummaryClasses,
                      )}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{t('chat.toolLabel', { name: segment.name })}</span>
                      <span className="ml-auto text-[10px]">
                        {t('chat.linesCount', { count: segment.content.split('\n').length })}
                      </span>
                    </summary>
                    <pre
                      className={cn(
                        'overflow-x-auto px-3 py-2 text-xs border-t max-h-60 overflow-y-auto',
                        toolPreClasses,
                      )}
                    >
                      <code>{segment.content}</code>
                    </pre>
                  </details>
                ))}
              </div>
            ) : undefined
          }
        />
        {!isStreaming && message.role === 'assistant' && currentSessionId && message.id && (
          <div className="flex justify-start ml-14 mb-4">
            <MessageRating sessionId={currentSessionId} messageId={message.id} />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
});

MessageBubble.displayName = 'MessageBubble';
