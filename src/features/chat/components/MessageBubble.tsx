/**
 * MessageBubble — Chat message display with markdown rendering,
 * code highlighting, attachments, streaming indicator, and model badge.
 *
 * Ported from ClaudeHydra v3 `OllamaChatView.tsx` inline message rendering.
 * ClaudeHydra-v4: Extracted, typed, animated, uses CodeBlock molecule.
 */

import { Bot, Cpu, FileText, Image as ImageIcon, Loader2, User } from 'lucide-react';
import { motion } from 'motion/react';
import { isValidElement, memo, type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Skeleton } from '@/components/atoms/Skeleton';
import { CodeBlock } from '@/components/molecules/CodeBlock';
import { cn } from '@/shared/utils/cn';
import { chatLanguages } from '@/shared/utils/highlightLanguages';
import { getLocale } from '@/shared/utils/locale';
import { ToolCallBlock, type ToolInteraction } from './ToolCallBlock';

// ---------------------------------------------------------------------------
// Helper: extract plain text from React children (handles rehype-highlight spans)
// ---------------------------------------------------------------------------

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    return extractText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageAttachment {
  id: string;
  name: string;
  type: 'file' | 'image';
  content: string;
  mimeType: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  toolInteractions?: ToolInteraction[];
  timestamp: Date;
  model?: string;
  streaming?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
  className?: string;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const bubbleVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 },
  },
};

// ---------------------------------------------------------------------------
// InlineCode helper
// ---------------------------------------------------------------------------

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-[var(--matrix-bg-tertiary)] text-[var(--matrix-accent)] text-[0.85em] font-mono border border-[var(--glass-border)]">
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// #4 — LazyImage with skeleton placeholder
// ---------------------------------------------------------------------------

function LazyImage({ src, alt }: { src?: string; alt?: string }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => {
    setLoaded(true);
    setError(true);
  }, []);

  return (
    <span className="relative block my-2">
      {!loaded && <Skeleton shape="rectangle" width="100%" height="200px" className="rounded-lg" />}
      {!error && (
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'max-w-full h-auto rounded-lg transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0 absolute inset-0',
          )}
        />
      )}
      {error && (
        <span className="flex items-center gap-2 text-sm text-[var(--matrix-text-secondary)] italic">
          <ImageIcon size={16} />
          {t('chat.imageLoadFailed')}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Markdown components config
// ---------------------------------------------------------------------------

const markdownComponents = {
  code({
    className,
    children,
    node,
  }: {
    className?: string | undefined;
    children?: ReactNode | undefined;
    node?: { position?: { start: { line: number }; end: { line: number } } } | undefined;
  }) {
    const match = /language-(\w+)/.exec(className ?? '');
    const isInline = !node?.position || (node.position.start.line === node.position.end.line && !match);
    const codeContent = extractText(children).replace(/\n$/, '');

    if (isInline) {
      return <InlineCode>{children}</InlineCode>;
    }

    return (
      <CodeBlock
        code={codeContent}
        {...(match?.[1] != null && { language: match[1] })}
        {...(className != null && { className })}
      />
    );
  },
  pre({ children }: { children?: ReactNode | undefined }) {
    return <>{children}</>;
  },
  a({ href, children }: { href?: string | undefined; children?: ReactNode | undefined }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  /* #4 - Image lazy loading with skeleton placeholder */
  img({ src, alt }: React.ImgHTMLAttributes<HTMLImageElement>) {
    return <LazyImage src={src} alt={alt} />;
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MessageBubble = memo(function MessageBubble({ message, className }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';

  const formattedTime = useMemo(
    () =>
      message.timestamp.toLocaleTimeString(getLocale(), {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [message.timestamp],
  );

  const displayContent = message.content || (message.streaming ? '\u258C' : '');

  return (
    <motion.div
      data-testid="chat-message-bubble"
      variants={bubbleVariants}
      initial="hidden"
      animate="visible"
      layout
      className={cn('flex', isUser ? 'justify-end' : 'justify-start', className)}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-4 py-3.5 shadow-lg transition-colors',
          isUser
            ? 'bg-[var(--matrix-accent)]/10 border border-[var(--matrix-accent)]/25 backdrop-blur-sm'
            : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-sm',
        )}
      >
        {/* Header: role icon + label + model badge + time + streaming */}
        <div className="flex items-center gap-2 mb-2">
          {isUser ? (
            <User size={14} className="text-[var(--matrix-accent)]" />
          ) : (
            <Bot size={14} className="text-[var(--matrix-text-secondary)]" />
          )}
          <span
            className={cn(
              'text-xs font-semibold',
              isUser ? 'text-[var(--matrix-accent)]' : 'text-[var(--matrix-text-secondary)]',
            )}
          >
            {isUser ? t('chat.userLabel') : t('chat.assistantLabel')}
          </span>

          {/* Model badge (assistant only) */}
          {!isUser && message.model && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border text-[var(--matrix-accent)] bg-[var(--matrix-accent)]/15 border-[var(--matrix-accent)]/30">
              <Cpu size={9} />
              {message.model}
            </span>
          )}

          {/* Timestamp */}
          <span className="text-[10px] text-[var(--matrix-text-secondary)]">{formattedTime}</span>

          {/* Streaming indicator */}
          {message.streaming && <Loader2 size={12} className="animate-spin text-[var(--matrix-accent)]/60" />}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1 px-2 py-1 bg-[var(--matrix-bg-primary)]/50 rounded text-xs text-[var(--matrix-text-secondary)]"
              >
                {att.type === 'image' ? (
                  <ImageIcon size={12} className="text-purple-400" />
                ) : (
                  <FileText size={12} className="text-blue-400" />
                )}
                <span className="truncate max-w-[100px]">{att.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tool interactions (before text content) */}
        {message.toolInteractions && message.toolInteractions.length > 0 && (
          <div className="mb-2">
            {message.toolInteractions.map((ti) => (
              <ToolCallBlock key={ti.id} interaction={ti} />
            ))}
          </div>
        )}

        {/* Content — Markdown rendered */}
        <div className="chat-markdown max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { languages: chatLanguages }]]}
            components={markdownComponents}
          >
            {displayContent}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';
