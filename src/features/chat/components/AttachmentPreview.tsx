/**
 * AttachmentPreview — Displays file/image attachment chips with remove button.
 *
 * Extracted from ChatInput.tsx for reusability and cleaner component boundaries.
 */

import { FileText, X } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useCallback } from 'react';
import type { Attachment } from './ChatInput';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttachmentPreviewProps {
  /** List of attachments to display. */
  attachments: Attachment[];
  /** Called when the user removes an attachment. */
  onRemove: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Single chip
// ---------------------------------------------------------------------------

const AttachmentChip = memo(function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: (id: string) => void;
}) {
  const handleRemove = useCallback(() => onRemove(attachment.id), [onRemove, attachment.id]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 px-3 py-2 bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-accent)]/30 rounded-lg"
    >
      {attachment.type === 'image' ? (
        <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
          <img src={attachment.content} alt={attachment.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <FileText size={16} className="text-blue-400 flex-shrink-0" />
      )}
      <span className="text-sm truncate max-w-[150px] text-[var(--matrix-text-primary)]">{attachment.name}</span>
      <button
        type="button"
        onClick={handleRemove}
        className="text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-error)] transition-colors"
        aria-label={`Remove ${attachment.name}`}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
});

AttachmentChip.displayName = 'AttachmentChip';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AttachmentPreview = memo(function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((att) => (
        <AttachmentChip key={att.id} attachment={att} onRemove={onRemove} />
      ))}
    </div>
  );
});

AttachmentPreview.displayName = 'AttachmentPreview';
