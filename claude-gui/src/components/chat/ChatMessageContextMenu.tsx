/**
 * ClaudeGUI - ChatMessageContextMenu Component
 * @module components/chat/ChatMessageContextMenu
 *
 * Context menu for chat messages with copy, delete, regenerate actions.
 * Ported from GeminiHydra.
 */

import React, { useEffect, useRef } from 'react';
import { Copy, Trash2, RefreshCw, X } from 'lucide-react';

interface ChatMessageContextMenuProps {
  x: number;
  y: number;
  isUser: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
}

export const ChatMessageContextMenu: React.FC<ChatMessageContextMenuProps> = ({
  x,
  y,
  isUser,
  onClose,
  onCopy,
  onDelete,
  onRegenerate,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Adjust position to keep within viewport
  const style = {
    top: y,
    left: x,
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[#0a0f14] border border-[var(--matrix-border)] rounded shadow-lg shadow-[var(--matrix-color)]/20 min-w-[150px] py-1 text-sm text-[var(--matrix-text)]"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onCopy}
        className="w-full text-left px-4 py-2 hover:bg-[var(--matrix-color)]/20 flex items-center gap-2 transition-colors"
      >
        <Copy size={14} />
        <span>Kopiuj</span>
      </button>

      {onRegenerate && !isUser && (
        <button
          onClick={onRegenerate}
          className="w-full text-left px-4 py-2 hover:bg-[var(--matrix-color)]/20 flex items-center gap-2 transition-colors"
        >
          <RefreshCw size={14} />
          <span>Regeneruj</span>
        </button>
      )}

      {onDelete && (
        <>
          <div className="h-px bg-[var(--matrix-border)] my-1" />
          <button
            onClick={onDelete}
            className="w-full text-left px-4 py-2 hover:bg-red-900/30 text-red-400 flex items-center gap-2 transition-colors"
          >
            <Trash2 size={14} />
            <span>Usun</span>
          </button>
        </>
      )}

      <div className="h-px bg-[var(--matrix-border)] my-1" />
      <button
        onClick={onClose}
        className="w-full text-left px-4 py-2 hover:bg-[var(--matrix-color)]/20 flex items-center gap-2 transition-colors text-gray-500"
      >
        <X size={14} />
        <span>Anuluj</span>
      </button>
    </div>
  );
};

export default ChatMessageContextMenu;
