/** Jaskier Shared Pattern — Temperature Settings Section */

import { cn } from '@jaskier/ui';
import { Minus, Plus, Thermometer } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/atoms';
import { apiPost } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

const MIN = 0;
const MAX = 2;
const STEP = 0.1;

export const TemperatureSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);

  const current = settings?.temperature ?? 0.7;

  const save = useCallback(
    async (value: number) => {
      const clamped = Math.round(Math.max(MIN, Math.min(MAX, value)) * 10) / 10;
      setSaving(true);
      try {
        await apiPost<Settings>('/api/settings', { ...settings, temperature: clamped });
        await refetch();
        toast.success(t('settings.temperature.saved', 'Temperature updated'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [settings, refetch, t],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Thermometer size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.temperature.title', 'Temperature')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t(
          'settings.temperature.description',
          'Controls response creativity. Lower values produce focused, deterministic output. Higher values increase variety and exploration.',
        )}
      </p>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => save(current - STEP)}
          disabled={saving || current <= MIN}
          aria-label="Decrease"
        >
          <Minus size={14} />
        </Button>

        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={current}
          onChange={(e) => save(Number(e.target.value))}
          disabled={saving}
          className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--matrix-accent)] bg-[var(--matrix-glass)]"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => save(current + STEP)}
          disabled={saving || current >= MAX}
          aria-label="Increase"
        >
          <Plus size={14} />
        </Button>

        <span className={cn('text-lg font-mono font-bold min-w-[3ch] text-center', theme.text)}>
          {current.toFixed(1)}
        </span>
      </div>

      <div className={cn('flex justify-between text-[10px] font-mono px-1', theme.textMuted)}>
        <span>0.0 (precise)</span>
        <span>2.0 (creative)</span>
      </div>
    </div>
  );
});

TemperatureSection.displayName = 'TemperatureSection';
