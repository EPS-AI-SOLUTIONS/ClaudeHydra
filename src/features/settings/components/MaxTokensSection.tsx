/** Jaskier Shared Pattern — Max Tokens Settings Section */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { Minus, Plus, TextCursorInput } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/atoms';
import { apiPost } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';
import { useSettingsQuery } from '@/shared/hooks/useSettings';

const MIN = 1024;
const MAX = 16384;
const STEP = 1024;

function formatTokens(n: number): string {
  return n >= 1024 ? `${Math.round(n / 1024)}K` : String(n);
}

export const MaxTokensSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);

  const current = settings?.max_tokens ?? 4096;

  const save = useCallback(
    async (value: number) => {
      const clamped = Math.max(MIN, Math.min(MAX, value));
      setSaving(true);
      try {
        await apiPost<Settings>('/api/settings', { ...settings, max_tokens: clamped });
        await refetch();
        toast.success(t('settings.maxTokens.saved', 'Max tokens updated'));
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
        <TextCursorInput size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.maxTokens.title', 'Max Output Tokens')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t(
          'settings.maxTokens.description',
          'Maximum number of tokens the model can generate per response. Higher values allow longer, more detailed answers.',
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

        <span className={cn('text-lg font-mono font-bold min-w-[4ch] text-center', theme.text)}>
          {formatTokens(current)}
        </span>
      </div>

      <div className={cn('flex justify-between text-[10px] font-mono px-1', theme.textMuted)}>
        <span>{formatTokens(MIN)} (short)</span>
        <span>{formatTokens(MAX)} (long)</span>
      </div>
    </div>
  );
});

MaxTokensSection.displayName = 'MaxTokensSection';
