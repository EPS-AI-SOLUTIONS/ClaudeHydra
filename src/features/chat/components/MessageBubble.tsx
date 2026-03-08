/**
 * MessageBubble — Chat message display with markdown rendering,
 * code highlighting, attachments, streaming indicator, and model badge.
 *
 * Ported from ClaudeHydra v3 `OllamaChatView.tsx` inline message rendering.
 * ClaudeHydra-v4: Extracted, typed, animated, uses CodeBlock molecule.
 */

import { Bot, Check, Copy, Cpu, FileText, Image as ImageIcon, Loader2, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { isValidElement, memo, type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Skeleton } from '@/components/atoms/Skeleton';
import { CodeBlock } from '@/components/molecules/CodeBlock';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
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
  const theme = useViewTheme();
  const [copied, setCopied] = useState(false);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const formattedTime = useMemo(
    () =>
      message.timestamp.toLocaleTimeString(getLocale(), {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [message.timestamp],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message.content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const displayContent = message.content || (message.streaming ? '\u258C' : '');

  const bubbleClass = cn(
    'relative max-w-[85%] rounded-2xl px-5 py-4',
    'leading-relaxed transition-colors',
    isUser && [
      theme.isLight
        ? 'bg-emerald-500/15 border border-emerald-500/20 text-black'
        : 'bg-[var(--matrix-accent)]/15 border border-[var(--matrix-accent)]/20 text-white',
    ],
    !isUser &&
      !isSystem && [
        theme.isLight
          ? 'bg-white/50 border border-white/30 text-black shadow-sm'
          : 'bg-black/40 border border-[var(--glass-border)] text-white shadow-lg backdrop-blur-sm',
      ],
    isSystem && [
      theme.isLight
        ? 'bg-amber-500/10 border border-amber-500/20 text-black'
        : 'bg-amber-500/10 border border-amber-500/20 text-white',
    ],
    className,
  );

  return (
    <motion.div
      data-testid="chat-message-bubble"
      variants={bubbleVariants}
      initial="hidden"
      animate="visible"
      layout
      className={cn('flex items-end gap-2 py-2 px-4 group relative', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* Assistant avatar */}
      {!isUser && !isSystem && (
        <div className={cn('flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mb-1', theme.accentBg)}>
          <Bot size={14} className={theme.accentText} />
        </div>
      )}

      <div className={bubbleClass}>
        {/* Copy button (top-right, revealed on hover) */}
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'absolute top-2 right-2 p-1.5 rounded-lg z-20',
            'bg-black/30 text-white/80 backdrop-blur-sm shadow-sm',
            'hover:bg-[var(--matrix-accent)] hover:text-black',
            'opacity-0 group-hover:opacity-100 transition-all duration-200',
            'transform hover:scale-110',
          )}
          title={t('chat.copyMessage', 'Copy message')}
          aria-label={t('chat.copyMessage', 'Copy message')}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <Check size={14} className="text-green-400" />
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <Copy size={14} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Model badge (assistant only) */}
        {!isUser && !isSystem && message.model && (
          <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-matrix-accent/10">
            <Cpu size={11} className={cn(theme.accentText, 'opacity-70')} />
            <span className={cn('text-xs font-mono tracking-wide opacity-70', theme.accentText)}>{message.model}</span>
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-black/20 rounded text-xs text-white/80 border border-white/5"
              >
                {att.type === 'image' ? (
                  <ImageIcon size={12} className="text-purple-400" />
                ) : (
                  <FileText size={12} className="text-blue-400" />
                )}
                <span className="truncate max-w-[150px]">{att.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tool interactions (before text content) */}
        {message.toolInteractions && message.toolInteractions.length > 0 && (
          <div className="mb-3">
            {message.toolInteractions.map((ti) => (
              <ToolCallBlock key={ti.id} interaction={ti} />
            ))}
          </div>
        )}

        {/* Content — Markdown rendered */}
        <div className="chat-markdown max-w-none break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { languages: chatLanguages }]]}
            components={markdownComponents}
          >
            {displayContent}
          </ReactMarkdown>
        </div>

        {/* Timestamp */}
        <div className={cn('text-[10px] mt-2 flex items-center gap-2', theme.textMuted)}>
          <span>{formattedTime}</span>
          {message.streaming && <Loader2 size={10} className="animate-spin text-[var(--matrix-accent)]/60" />}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div
          className={cn(
            'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mb-1',
            theme.isLight ? 'bg-emerald-500/15' : 'bg-matrix-accent/15',
          )}
        >
          <User size={14} className={theme.accentText} />
        </div>
      )}
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';
