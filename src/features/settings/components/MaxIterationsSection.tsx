/** Jaskier Shared Pattern — Max Iterations Settings Section */

import { cn } from '@jaskier/ui';
import { Minus, Plus, Repeat } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/atoms';
import { apiPost } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

const MIN = 5;
const MAX = 50;
const STEP = 5;

export const MaxIterationsSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);

  const current = settings?.max_iterations ?? 10;

  const save = useCallback(
    async (value: number) => {
      const clamped = Math.max(MIN, Math.min(MAX, value));
      setSaving(true);
      try {
        await apiPost<Settings>('/api/settings', { ...settings, max_iterations: clamped });
        await refetch();
        toast.success(t('settings.maxIterations.saved', 'Max iterations updated'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [refetch, t, settings],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Repeat size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.maxIterations.title', 'Agent Iterations')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t(
          'settings.maxIterations.description',
          'How many tool-call rounds the agent can perform per request. Higher values let agents complete complex tasks autonomously.',
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

        <span className={cn('text-lg font-mono font-bold min-w-[3ch] text-center', theme.text)}>{current}</span>
      </div>

      <div className={cn('flex justify-between text-[10px] font-mono px-1', theme.textMuted)}>
        <span>{MIN} (fast)</span>
        <span>{MAX} (autonomous)</span>
      </div>
    </div>
  );
});

MaxIterationsSection.displayName = 'MaxIterationsSection';
