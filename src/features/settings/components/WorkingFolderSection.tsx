/** Jaskier Shared Pattern — Working Folder Settings Section */

import { cn } from '@jaskier/ui';
import { AlertCircle, Check, FolderOpen, Loader2, Pencil, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Input } from '@/components/atoms';
import { apiPost } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

export const WorkingFolderSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();

  const [editing, setEditing] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings?.working_directory !== undefined) {
      setValue(settings.working_directory);
    }
  }, [settings?.working_directory]);

  const saveFolder = useCallback(
    async (path: string) => {
      if (!settings) return;
      setSaving(true);
      setError('');
      try {
        await apiPost<Settings>('/api/settings', { ...settings, working_directory: path });
        await refetch();
        setValue(path);
        setEditing(false);
        toast.success(
          path
            ? t('settings.workingFolder.saved', 'Working folder saved')
            : t('settings.workingFolder.cleared', 'Working folder cleared'),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save';
        setError(msg);
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [settings, refetch, t],
  );

  const handleBrowse = useCallback(async () => {
    setBrowsing(true);
    try {
      const res = await apiPost<{ path?: string; cancelled?: boolean; error?: string }>('/api/files/browse', {
        initial_path: settings?.working_directory || '',
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
  }, [settings?.working_directory, saveFolder]);

  const handleSave = useCallback(() => saveFolder(value.trim()), [value, saveFolder]);

  const handleClear = useCallback(() => saveFolder(''), [saveFolder]);

  const handleCancel = useCallback(() => {
    setValue(settings?.working_directory ?? '');
    setEditing(false);
    setError('');
  }, [settings?.working_directory]);

  const currentFolder = settings?.working_directory;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FolderOpen size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.workingFolder.title', 'Working Folder')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t(
          'settings.workingFolder.description',
          'Set a default working directory so agents can use relative paths instead of absolute ones.',
        )}
      </p>

      {editing ? (
        <div className="space-y-3">
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            placeholder="C:\Users\you\project"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          {error && (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={14} />
              <span className="text-xs">{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" leftIcon={<Check size={14} />} onClick={handleSave} isLoading={saving}>
              {t('common.save', 'Save')}
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={handleCancel} disabled={saving}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {currentFolder ? (
            <div className={cn('text-sm font-mono px-3 py-2 rounded-lg bg-[var(--matrix-glass)]', theme.text)}>
              {currentFolder}
            </div>
          ) : (
            <p className={cn('text-xs italic', theme.textMuted)}>
              {t('settings.workingFolder.notSet', 'Not set — agents will require absolute paths')}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={browsing ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              onClick={handleBrowse}
              disabled={browsing || saving}
            >
              {browsing
                ? t('settings.workingFolder.opening', 'Opening…')
                : currentFolder
                  ? t('settings.workingFolder.change', 'Change')
                  : t('settings.workingFolder.set', 'Set Folder')}
            </Button>
            {currentFolder && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Pencil size={14} />}
                  onClick={() => setEditing(true)}
                  disabled={browsing || saving}
                >
                  {t('settings.workingFolder.editManually', 'Edit')}
                </Button>
                <Button variant="danger" size="sm" leftIcon={<X size={14} />} onClick={handleClear} isLoading={saving}>
                  {t('settings.workingFolder.clear', 'Clear')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

WorkingFolderSection.displayName = 'WorkingFolderSection';
