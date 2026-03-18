// src/features/logs/components/LogsView.tsx

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, ScrollText, Search, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Card, Input } from '@/components/atoms';
import { type BackendLogEntry, clearBackendLogs, useBackendLogs } from '../hooks/useLogs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelBadgeClasses(level: string, isLight: boolean): string {
  const l = level.toUpperCase();
  if (l === 'ERROR') return isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/15 text-red-400';
  if (l === 'WARN') return isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/15 text-amber-400';
  if (l === 'INFO') return isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/15 text-blue-400';
  return isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-white/40';
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Main LogsView
// ---------------------------------------------------------------------------

export const LogsView = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, isError, refetch } = useBackendLogs(
    { limit: 200, level: level || undefined, search: search || undefined },
    autoRefresh,
  );

  const logs = data?.logs ?? [];

  const handleCopy = useCallback(async () => {
    if (!logs.length) {
      toast.error(t('logs.nothingToCopy', 'Nothing to copy'));
      return;
    }
    const text = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.target}: ${l.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    toast.success(t('logs.copied', 'Copied to clipboard'));
  }, [logs, t]);

  const handleClear = useCallback(async () => {
    try {
      await clearBackendLogs();
      queryClient.invalidateQueries({ queryKey: ['logs-backend'] });
      toast.success(t('logs.cleared', 'Logs cleared'));
    } catch {
      toast.error(t('logs.clearError', 'Failed to clear logs'));
    }
  }, [queryClient, t]);

  return (
    <div className="h-full flex flex-col items-center p-8 overflow-y-auto">
      <motion.div
        className="w-full max-w-5xl space-y-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <ScrollText size={22} className="text-[var(--matrix-accent)]" />
          <h1 className={cn('text-2xl font-bold font-mono tracking-tight', theme.title)}>{t('logs.title', 'Logs')}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopy} leftIcon={<Copy size={14} />}>
              {t('logs.copy', 'Copy')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleClear()} leftIcon={<Trash2 size={14} />}>
              {t('logs.clear', 'Clear')}
            </Button>
          </div>
        </div>

        {/* Filters + Content */}
        <Card>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Input
                  inputSize="sm"
                  placeholder={t('logs.searchPlaceholder', 'Search logs...')}
                  icon={<Search size={14} />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className={cn(
                  'glass-input rounded-lg font-mono text-xs px-2.5 py-1.5 outline-none',
                  'text-[var(--matrix-text-primary)]',
                )}
                aria-label={t('logs.levelFilter', 'Filter by level')}
              >
                <option value="">{t('logs.allLevels', 'All levels')}</option>
                <option value="ERROR">ERROR</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
                <option value="DEBUG">DEBUG</option>
                <option value="TRACE">TRACE</option>
              </select>
              <Button
                variant={autoRefresh ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                leftIcon={<RefreshCw size={14} className={autoRefresh ? 'animate-spin' : ''} />}
              >
                {autoRefresh ? t('logs.autoRefreshOn', 'Live') : t('logs.autoRefreshOff', 'Paused')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void refetch()} leftIcon={<RefreshCw size={14} />}>
                {t('logs.refresh', 'Refresh')}
              </Button>
            </div>

            {isLoading && (
              <p className="text-sm text-[var(--matrix-text-secondary)] text-center py-8">
                {t('common.loading', 'Loading...')}
              </p>
            )}
            {isError && (
              <p className="text-sm text-red-400 text-center py-8">{t('common.loadError', 'Failed to load data')}</p>
            )}

            {!isLoading && !isError && logs.length === 0 && (
              <p className="text-sm text-[var(--matrix-text-secondary)] text-center py-8">
                {t('logs.empty', 'No log entries')}
              </p>
            )}

            {logs.length > 0 && (
              <div className="space-y-0.5 max-h-[65vh] overflow-y-auto">
                {logs.map((entry: BackendLogEntry, i: number) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2 rounded-lg transition-colors',
                      theme.isLight ? 'hover:bg-black/[0.03]' : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <span className="font-mono text-xs text-[var(--matrix-text-secondary)] shrink-0 pt-0.5 w-20">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0 w-14 text-center',
                        levelBadgeClasses(entry.level, theme.isLight),
                      )}
                    >
                      {entry.level}
                    </span>
                    <span className="font-mono text-xs text-[var(--matrix-text-secondary)] shrink-0 w-32 truncate pt-0.5">
                      {entry.target}
                    </span>
                    <span className="font-mono text-xs text-[var(--matrix-text-primary)] flex-1 break-all">
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
});

LogsView.displayName = 'LogsView';

export default LogsView;
