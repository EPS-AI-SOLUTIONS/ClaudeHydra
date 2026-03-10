/** Jaskier Shared Pattern — Completion Sound Settings */

import { cn } from '@jaskier/ui';
import { Bell, BellOff } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCompletionVolume,
  isCompletionSoundEnabled,
  setCompletionSoundEnabled,
  setCompletionVolume,
} from '@/shared/hooks/useCompletionFeedback';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

export const CompletionSoundSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [enabled, setEnabled] = useState(isCompletionSoundEnabled);
  const [volume, setVolume] = useState(getCompletionVolume);

  const toggleSound = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setCompletionSoundEnabled(next);
  }, [enabled]);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    setCompletionVolume(v);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {enabled ? (
          <Bell size={18} className="text-[var(--matrix-accent)]" />
        ) : (
          <BellOff size={18} className="text-[var(--matrix-accent)]" />
        )}
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.completionSound.title', 'Completion Sound')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t(
          'settings.completionSound.description',
          'Play a chime and show a toast when the AI finishes generating a response.',
        )}
      </p>

      <div className="flex items-center gap-4">
        {/* Toggle switch */}
        <button
          type="button"
          onClick={toggleSound}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0',
            enabled ? 'bg-[var(--matrix-accent)]' : 'bg-[var(--matrix-glass)]',
          )}
          role="switch"
          aria-checked={enabled}
          aria-label={t('settings.completionSound.toggle', 'Toggle completion sound')}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
              enabled && 'translate-x-5',
            )}
          />
        </button>

        {/* Volume slider */}
        {enabled && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={handleVolume}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--matrix-accent)] bg-[var(--matrix-glass)]"
            aria-label={t('settings.completionSound.volume', 'Volume')}
          />
        )}

        {enabled && (
          <span className={cn('text-xs font-mono min-w-[3ch] text-right', theme.textMuted)}>
            {Math.round(volume * 100)}%
          </span>
        )}
      </div>
    </div>
  );
});

CompletionSoundSection.displayName = 'CompletionSoundSection';
