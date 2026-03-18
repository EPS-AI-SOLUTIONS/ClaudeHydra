// src/features/chat/components/ImagePreview.tsx
/**
 * ImagePreview — Animated image thumbnail with remove button
 * ===========================================================
 * Extracted from ChatInput.tsx for reusability.
 * Shows a small preview of an attached image with a hover-to-reveal close button.
 */

import { cn } from '@jaskier/ui';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';

interface ImagePreviewProps {
  src: string;
  onClear: () => void;
}

const ImagePreview = memo<ImagePreviewProps>(({ src, onClear }) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.8, y: 10 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.8, y: 10 }}
    className="relative inline-block w-fit mb-3 group"
  >
    <img
      src={src}
      alt="Preview"
      className={cn(
        'h-24 w-auto rounded-xl border shadow-lg',
        'border-[var(--matrix-accent)]/50',
        'shadow-[0_0_15px_rgba(255,255,255,0.1)]',
      )}
    />
    <button
      type="button"
      onClick={onClear}
      className={cn(
        'absolute -top-2 -right-2 p-1 rounded-full',
        'bg-red-500 text-white',
        'opacity-0 group-hover:opacity-100',
        'transition-all shadow-sm hover:scale-110',
      )}
    >
      <X size={14} strokeWidth={3} />
    </button>
  </motion.div>
));

ImagePreview.displayName = 'ImagePreview';

export default ImagePreview;
