/**
 * CompletionFeedback — Wrapper that applies the completion flash animation.
 *
 * When `flashActive` is true, adds the `completion-flash` CSS class to trigger
 * a brief visual pulse on task completion. The actual sound playback and toast
 * notifications are handled by the `useCompletionFeedback` hook in @jaskier/core.
 *
 * Extracted from ClaudeChatView.tsx for clarity.
 */

import { cn } from '@jaskier/ui';
import { memo, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompletionFeedbackProps {
  /** Whether the completion flash animation is currently active. */
  flashActive: boolean;
  /** Additional CSS class names for the container. */
  className?: string;
  /** Child elements to wrap. */
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CompletionFeedback = memo<CompletionFeedbackProps>(({ flashActive, className, children }) => {
  return (
    <div data-testid="chat-view" className={cn(className, flashActive && 'completion-flash rounded-xl')}>
      {children}
    </div>
  );
});

CompletionFeedback.displayName = 'CompletionFeedback';
