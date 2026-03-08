// src/features/settings/components/WatchdogHistory.tsx
/**
 * Watchdog History — shows browser proxy health events from the ring buffer.
 */

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle, RefreshCw, WifiOff } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { apiGet } from '@/shared/api/client';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';

interface HealthEvent {
  event_type: string;
  timestamp: string;
  workers_ready: number;
  pool_size: number;
  error: string | null;
}

interface HistoryResponse {
  events: HealthEvent[];
  total: number;
}

const eventConfig: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  online: { icon: CheckCircle, color: 'text-emerald-400', label: 'Online' },
  unreachable: { icon: WifiOff, color: 'text-red-400', label: 'Unreachable' },
  not_ready: { icon: AlertTriangle, color: 'text-amber-400', label: 'Not Ready' },
  restart_initiated: { icon: RefreshCw, color: 'text-blue-400', label: 'Restart' },
};

const defaultEvent = { icon: Activity, color: 'text-zinc-400', label: 'Event' };

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Dzisiaj';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

export const WatchdogHistory = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ['browser-proxy-history'],
    queryFn: () => apiGet<HistoryResponse>('/api/browser-proxy/history'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const events = data?.events ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.watchdog.title')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>{t('settings.watchdog.description')}</p>

      {isLoading ? (
        <div className={cn('text-xs font-mono', theme.textMuted)}>{t('common.loading')}</div>
      ) : events.length === 0 ? (
        <div className={cn('text-xs font-mono py-4 text-center', theme.textMuted)}>
          {t('settings.watchdog.noEvents')}
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-hide">
          {events.map((evt) => {
            const cfg = eventConfig[evt.event_type] ?? defaultEvent;
            const Icon = cfg.icon;
            const workerInfo = `${evt.workers_ready}/${evt.pool_size}`;
            return (
              <div
                key={`${evt.timestamp}-${evt.event_type}`}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-mono',
                  theme.isLight ? 'hover:bg-black/5' : 'hover:bg-white/5',
                )}
              >
                <Icon size={13} className={cn('flex-shrink-0', cfg.color)} />
                <span className={cn('w-16 flex-shrink-0', theme.textMuted)}>{formatTime(evt.timestamp)}</span>
                <span className={cn('w-12 flex-shrink-0 text-[10px]', theme.textMuted)}>
                  {formatDate(evt.timestamp)}
                </span>
                <span className={cn('font-medium', cfg.color)}>{cfg.label}</span>
                <span className={cn('flex-shrink-0', theme.textMuted)}>{workerInfo}</span>
                {evt.error && (
                  <span className={cn('truncate', theme.textMuted)} title={evt.error}>
                    {evt.error}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

WatchdogHistory.displayName = 'WatchdogHistory';
