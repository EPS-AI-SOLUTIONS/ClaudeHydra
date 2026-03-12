/** Jaskier Shared Pattern — Auto Updater Settings Section */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { RefreshCw } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';
import { useSettingsQuery } from '@/shared/hooks/useSettings';

export const AutoUpdaterSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);

  const enabled = settings?.auto_updater ?? true;

  const toggle = useCallback(async () => {
    setSaving(true);
    try {
      await apiPost<Settings>('/api/settings', { ...settings, auto_updater: !enabled });
      await refetch();
      toast.success(t('settings.autoUpdater.saved', 'Auto-updater setting saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [enabled, refetch, settings, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.autoUpdater.title', 'Auto Updater')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t('settings.autoUpdater.description', 'Automatically check for and apply updates when available.')}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0',
            enabled ? 'bg-[var(--matrix-accent)]' : 'bg-[var(--matrix-glass)]',
          )}
          role="switch"
          aria-checked={enabled}
          aria-label={t('settings.autoUpdater.toggle', 'Toggle auto-updater')}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
              enabled && 'translate-x-5',
            )}
          />
        </button>
        <span className={cn('text-sm font-mono', theme.textMuted)}>
          {enabled ? t('settings.autoUpdater.enabled', 'Enabled') : t('settings.autoUpdater.disabled', 'Disabled')}
        </span>
      </div>
    </div>
  );
});

AutoUpdaterSection.displayName = 'AutoUpdaterSection';
