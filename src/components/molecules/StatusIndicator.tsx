// src/components/molecules/StatusIndicator.tsx
/**
 * StatusIndicator Molecule
 * ========================
 * Animated dot with optional label text.
 * States: online (green), offline (red/gray), pending (yellow), error (red).
 * Size variants: sm, md.
 *
 * ClaudeHydra-v4: Uses CSS variable-based colors (matching GeminiHydra-v15 pattern).
 */

import { motion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusState = 'online' | 'offline' | 'pending' | 'error';
export type StatusSize = 'sm' | 'md';

interface StatusIndicatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current status state. */
  status?: StatusState;
  /** Size variant. */
  size?: StatusSize;
  /** Optional label text displayed next to the dot. */
  label?: string;
  /** Whether the dot should pulse. Defaults to `true` for online/pending. */
  pulse?: boolean;
}

// ---------------------------------------------------------------------------
// Status color mapping (CSS variable-based)
// ---------------------------------------------------------------------------

const dotColorMap: Record<StatusState, string> = {
  online: 'bg-[var(--matrix-success)]',
  offline: 'bg-gray-500',
  pending: 'bg-[var(--matrix-warning)]',
  error: 'bg-[var(--matrix-error)]',
};

const glowMap: Record<StatusState, string> = {
  online: 'shadow-[0_0_6px_var(--matrix-success)]',
  offline: '',
  pending: 'shadow-[0_0_6px_var(--matrix-warning)]',
  error: 'shadow-[0_0_6px_var(--matrix-error)]',
};

const textColorMap: Record<StatusState, string> = {
  online: 'text-[var(--matrix-success)]',
  offline: 'text-matrix-text-dim',
  pending: 'text-[var(--matrix-warning)]',
  error: 'text-[var(--matrix-error)]',
};

const sizeMap: Record<StatusSize, { dot: string; text: string }> = {
  sm: { dot: 'h-1.5 w-1.5', text: 'text-xs' },
  md: { dot: 'h-2 w-2', text: 'text-sm' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusIndicator({
  status = 'offline',
  size = 'md',
  label,
  pulse,
  className,
  ...props
}: StatusIndicatorProps) {
  const shouldPulse = pulse ?? (status === 'online' || status === 'pending');

  const { dot: dotSize, text: textSize } = sizeMap[size];

  return (
    // biome-ignore lint/a11y/useSemanticElements: StatusIndicator uses div with role="status" for compatibility with HTMLDivElement props
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="status"
      aria-label={label ?? status}
      {...props}
    >
      {/* Dot wrapper */}
      <span className="relative flex items-center justify-center">
        {/* Solid dot with glow */}
        <span className={cn('rounded-full flex-shrink-0', dotSize, dotColorMap[status], glowMap[status])} />

        {/* Pulse ring */}
        {shouldPulse && (
          <motion.span
            className={cn('absolute rounded-full opacity-75', dotSize, dotColorMap[status])}
            animate={{
              scale: [1, 2.5],
              opacity: [0.75, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeOut',
            }}
          />
        )}
      </span>

      {/* Label */}
      {label != null && <span className={cn('font-mono leading-none', textSize, textColorMap[status])}>{label}</span>}
    </div>
  );
}
