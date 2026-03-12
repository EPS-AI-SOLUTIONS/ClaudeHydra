/** Compact working folder picker with native OS folder dialog — Jaskier Shared Pattern */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { Check, FolderOpen, Loader2, Pencil, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPatch, apiPost } from '@/shared/api/client';

// ============================================================================
// WORKING FOLDER PICKER (per-session)
// ============================================================================

interface WorkingFolderPickerProps {
  sessionId: string;
  workingDirectory: string;
  onDirectoryChange: (wd: string) => void;
}

export const WorkingFolderPicker = memo<WorkingFolderPickerProps>(
  ({ sessionId, workingDirectory, onDirectoryChange }) => {
    const { t } = useTranslation();
    const theme = useViewTheme();

    const [editing, setEditing] = useState(false);
    const [browsing, setBrowsing] = useState(false);
    const [value, setValue] = useState(workingDirectory);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const currentFolder = workingDirectory;

    useEffect(() => {
      setValue(workingDirectory);
    }, [workingDirectory]);

    useEffect(() => {
      if (editing) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }, [editing]);

    const saveFolder = useCallback(
      async (path: string) => {
        setSaving(true);
        try {
          await apiPatch(`/api/sessions/${sessionId}/working-directory`, { working_directory: path });
          onDirectoryChange(path);
          setValue(path);
          setEditing(false);
          toast.success(
            path
              ? t('settings.workingFolder.saved', 'Working folder saved')
              : t('settings.workingFolder.cleared', 'Working folder cleared'),
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
          setSaving(false);
        }
      },
      [sessionId, onDirectoryChange, t],
    );

    const handleBrowse = useCallback(async () => {
      setBrowsing(true);
      try {
        const res = await apiPost<{ path?: string; cancelled?: boolean; error?: string }>('/api/files/browse', {
          initial_path: currentFolder || '',
        });
        if (res.error) {
          toast.error(res.error);
        } else if (res.path && !res.cancelled) {
          saveFolder(res.path);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to open folder dialog');
      } finally {
        setBrowsing(false);
      }
    }, [currentFolder, saveFolder]);

    const handleSave = useCallback(() => {
      const trimmed = value.trim();
      if (trimmed === currentFolder) {
        setEditing(false);
        return;
      }
      saveFolder(trimmed);
    }, [value, currentFolder, saveFolder]);

    const handleClear = useCallback(() => saveFolder(''), [saveFolder]);

    const handleCancel = useCallback(() => {
      setValue(currentFolder);
      setEditing(false);
    }, [currentFolder]);

    const displayPath =
      currentFolder.length > 40
        ? `…${currentFolder.slice(currentFolder.lastIndexOf('\\', currentFolder.length - 20))}`
        : currentFolder;

    return (
      <div>
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="edit"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-[var(--matrix-bg-secondary)]/50"
            >
              <FolderOpen size={18} className="shrink-0 text-[var(--matrix-accent)]" />
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                  if (e.key === 'Escape') handleCancel();
                }}
                placeholder="C:\Users\you\project"
                disabled={saving}
                className={cn(
                  'flex-1 text-sm font-mono px-2.5 py-1.5 rounded-md bg-transparent',
                  'border border-[var(--matrix-accent)]/30 focus:border-[var(--matrix-accent)]/60',
                  'focus:outline-none transition-colors',
                  theme.text,
                )}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="p-1.5 rounded hover:bg-green-500/20 text-green-400 transition-colors"
                title={t('common.save', 'Save')}
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                title={t('common.cancel', 'Cancel')}
              >
                <X size={16} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="display"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-[var(--matrix-bg-secondary)]/30"
            >
              {currentFolder ? (
                <>
                  <button
                    type="button"
                    onClick={handleBrowse}
                    disabled={browsing || saving}
                    className="shrink-0 p-1.5 rounded-md transition-colors text-[var(--matrix-accent)] hover:bg-[var(--matrix-accent)]/10"
                    title={t('settings.workingFolder.browse', 'Browse folders')}
                  >
                    {browsing ? <Loader2 size={18} className="animate-spin" /> : <FolderOpen size={18} />}
                  </button>
                  <span className={cn('text-sm font-mono truncate', theme.textMuted)} title={currentFolder}>
                    {displayPath}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      theme.textMuted,
                      'hover:text-[var(--matrix-accent)] hover:bg-white/5',
                    )}
                    title={t('settings.workingFolder.change', 'Change')}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={saving}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      theme.textMuted,
                      'hover:text-red-400 hover:bg-red-500/5',
                    )}
                    title={t('settings.workingFolder.clear', 'Clear')}
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={browsing || saving}
                  className={cn(
                    'flex items-center gap-2.5 text-sm font-mono italic py-0.5 transition-colors',
                    theme.textMuted,
                    'hover:text-[var(--matrix-accent)]',
                  )}
                >
                  {browsing ? <Loader2 size={18} className="animate-spin" /> : <FolderOpen size={18} />}
                  {browsing
                    ? t('settings.workingFolder.opening', 'Opening dialog…')
                    : t('settings.workingFolder.set', 'Set working folder…')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

WorkingFolderPicker.displayName = 'WorkingFolderPicker';
