import { cn } from '@jaskier/ui';
import { Check, Edit2, Loader2, MessageSquare, Trash2, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatSession } from '@/stores/viewStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// SessionItem
// ---------------------------------------------------------------------------

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  isFocused?: boolean;
  collapsed: boolean;
  isDark: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

export function SessionItem({
  session,
  isActive,
  isFocused = false,
  collapsed,
  isDark,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  // Collapsed: just an icon button
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onSelect}
        data-testid="sidebar-session-item"
        className={cn(
          'w-full p-2 rounded flex items-center justify-center transition-colors',
          isActive
            ? isDark
              ? 'bg-white/15 text-[var(--matrix-accent)]'
              : 'bg-emerald-500/15 text-[var(--matrix-accent)]'
            : isDark
              ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
              : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
        )}
        title={session.title}
      >
        <MessageSquare size={16} />
      </button>
    );
  }

  // Editing mode
  if (isEditing) {
    return (
      <div className="flex items-center gap-1 p-1">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="flex-1 glass-input text-xs py-1 px-2"
          ref={(el) => el?.focus()}
        />
        <button
          type="button"
          onClick={handleSave}
          className={cn('p-1 rounded text-[var(--matrix-accent)]', isDark ? 'hover:bg-white/15' : 'hover:bg-black/5')}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className={cn(
            'p-1 rounded',
            isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-500/15 text-red-600',
          )}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Default: session row
  return (
    <div
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      data-testid="sidebar-session-item"
      className={cn(
        'group relative flex items-center gap-2 p-2 rounded cursor-pointer transition-colors w-full text-left',
        isActive
          ? isDark
            ? 'bg-white/15 text-[var(--matrix-accent)]'
            : 'bg-emerald-500/15 text-[var(--matrix-accent)]'
          : isDark
            ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
            : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
        isFocused && 'ring-2 ring-[var(--matrix-accent)]/50',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Select session: ${session.title}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* #16 - Show spinner for pending sessions */}
      {session._pending ? (
        <Loader2 size={14} className="flex-shrink-0 animate-spin text-[var(--matrix-accent)]/60" />
      ) : (
        <MessageSquare size={14} className="flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', session._pending && 'opacity-60 italic')}>{session.title}</p>
        <p className="text-xs text-[var(--matrix-text-secondary)] truncate">
          {session._pending
            ? t('sidebar.creating', 'Creating...')
            : `${session.messageCount} ${session.messageCount === 1 ? t('sidebar.message', 'message') : t('sidebar.messages', 'messages')}`}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className={cn('p-1 rounded', isDark ? 'hover:bg-white/15' : 'hover:bg-black/5')}
          title={t('sidebar.rename', 'Rename')}
        >
          <Edit2 size={12} />
        </button>
        <button
          type="button"
          onClick={handleDeleteClick}
          className={cn(
            'p-1 rounded transition-colors',
            confirmDelete
              ? isDark
                ? 'bg-red-500/30 text-red-300'
                : 'bg-red-500/20 text-red-600'
              : isDark
                ? 'hover:bg-red-500/20 text-red-400'
                : 'hover:bg-red-500/15 text-red-600',
          )}
          title={confirmDelete ? t('sidebar.confirmDelete', 'Click again to delete') : t('common.delete', 'Delete')}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Tooltip with preview */}
      {showTooltip && session.preview && (
        <div
          className={cn(
            'absolute left-full top-0 ml-2 z-50 w-56 p-2.5 rounded-lg',
            isDark
              ? 'bg-[var(--matrix-bg-primary)]/95 border border-white/20'
              : 'bg-[var(--matrix-bg-primary)]/95 border border-black/10',
            'shadow-lg shadow-black/40 backdrop-blur-sm pointer-events-none',
            'animate-fade-in',
          )}
        >
          <p className="text-[11px] text-[var(--matrix-text-primary)] font-medium truncate mb-1">{session.title}</p>
          <p className="text-[10px] text-[var(--matrix-text-secondary)] line-clamp-3 leading-relaxed">
            {session.preview}
          </p>
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--matrix-border)]">
            <span className="text-[9px] text-[var(--matrix-text-secondary)]">
              {session.messageCount}{' '}
              {session.messageCount === 1 ? t('sidebar.message', 'message') : t('sidebar.messages', 'messages')}
            </span>
            <span className="text-[9px] text-[var(--matrix-accent)]">
              {timeAgo(session.updatedAt ?? session.createdAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
