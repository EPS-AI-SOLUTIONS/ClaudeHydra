/**
 * ToolResultRenderer — Collapsible tool result display.
 *
 * Renders parsed tool segments as `<details>` elements with tool name headers
 * and scrollable code output. Extracted from MessageBubble.tsx for reuse and
 * readability.
 */

import type { ToolSegment } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { Terminal } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolResultRendererProps {
  /** Parsed tool output segments to render. */
  segments: ToolSegment[];
  /** Whether the current theme is light mode. */
  isLight: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ToolResultRenderer = memo<ToolResultRendererProps>(({ segments, isLight }) => {
  const { t } = useTranslation();

  if (segments.length === 0) return null;

  const detailsClasses = isLight ? 'border-black/10 bg-black/5' : 'border-white/10 bg-black/20';

  const summaryClasses = isLight ? 'text-black/60 hover:text-black/80' : 'text-white/60 hover:text-white/80';

  const preClasses = isLight ? 'text-black/70 border-black/5' : 'text-white/70 border-white/5';

  return (
    <div className="mb-3">
      {segments.map((segment) => (
        <details
          key={`tool-${segment.name}-${segment.content.slice(0, 20)}`}
          className={cn('my-2 rounded-lg border', detailsClasses)}
        >
          <summary
            aria-expanded="false"
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
              summaryClasses,
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{t('chat.toolLabel', { name: segment.name })}</span>
            <span className="ml-auto text-[10px]">
              {t('chat.linesCount', { count: segment.content.split('\n').length })}
            </span>
          </summary>
          <pre className={cn('overflow-x-auto px-3 py-2 text-xs border-t max-h-60 overflow-y-auto', preClasses)}>
            <code>{segment.content}</code>
          </pre>
        </details>
      ))}
    </div>
  );
});

ToolResultRenderer.displayName = 'ToolResultRenderer';
