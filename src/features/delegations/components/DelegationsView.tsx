// src/features/delegations/components/DelegationsView.tsx

import { cn } from '@jaskier/ui';
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2, Network, RefreshCw, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { type DelegationTask, useDelegations } from '../hooks/useDelegations';

const TIER_COLORS: Record<string, string> = {
  commander: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  coordinator: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  executor: 'text-green-400 bg-green-500/10 border-green-500/30',
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  working: Loader2,
  error: AlertTriangle,
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function TaskRow({ task, theme }: { task: DelegationTask; theme: ReturnType<typeof useViewTheme> }) {
  const [expanded, setExpanded] = useState(false);
  const tierClass = TIER_COLORS[task.agent_tier] || TIER_COLORS.executor;
  const StatusIcon = STATUS_ICONS[task.status] || Activity;
  const isWorking = task.status === 'working';
  const isError = task.is_error;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'border rounded-lg p-3 transition-colors cursor-pointer',
        isError
          ? 'border-red-500/30 bg-red-500/5'
          : isWorking
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-[var(--matrix-border)] bg-[var(--matrix-bg-secondary)]',
        'hover:bg-[var(--matrix-bg-tertiary)]',
        task.call_depth > 1 && 'ml-6 border-l-2 border-l-[var(--matrix-accent)]',
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <StatusIcon
          size={16}
          className={cn(isError ? 'text-red-400' : isWorking ? 'text-amber-400 animate-spin' : 'text-emerald-400')}
        />
        <span className={cn('px-2 py-0.5 text-xs font-bold rounded border', tierClass)}>
          {task.agent_tier.toUpperCase()}
        </span>
        <span className={cn('font-medium text-sm', 'text-[var(--matrix-text-primary)]')}>{task.agent_name}</span>
        <span className={cn('text-xs ml-auto', theme.textMuted)}>{timeAgo(task.created_at)}</span>
        <span className={cn('text-xs tabular-nums', theme.textMuted)}>{formatDuration(task.duration_ms)}</span>
        <span className="text-xs text-[var(--matrix-text-secondary)]">d{task.call_depth}</span>
      </div>

      <p className={cn('text-xs mt-1.5 truncate', theme.textMuted)}>{task.task_prompt}</p>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={cn('mt-2 pt-2 border-t border-[var(--matrix-border)] text-xs space-y-1', theme.textMuted)}>
              <p>
                <strong>Model:</strong> {task.model_used}
              </p>
              <p>
                <strong>Status:</strong> {task.status}
              </p>
              <p className="break-all">
                <strong>Task:</strong> {task.task_prompt}
              </p>
              {task.result_preview && (
                <p className="break-all">
                  <strong>Result:</strong> {task.result_preview}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const TIERS = ['all', 'commander', 'coordinator', 'executor'] as const;
const STATUSES = ['all', 'working', 'completed', 'failed'] as const;

function DelegationsView() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data, isLoading, isError, refetch } = useDelegations(autoRefresh);

  const allTasks = data?.tasks ?? [];
  const stats = data?.stats ?? { total: 0, completed: 0, errors: 0, avg_duration_ms: null };

  const tasks = allTasks.filter((task) => {
    if (tierFilter !== 'all' && task.agent_tier !== tierFilter) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'failed') return task.is_error;
      if (statusFilter === 'working') return task.status === 'working';
      if (statusFilter === 'completed') return task.status === 'completed' && !task.is_error;
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col p-4 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-[var(--matrix-accent)]" />
          <h1 className={cn('text-lg font-bold', 'text-[var(--matrix-text-primary)]')}>
            {t('delegations.title', 'Agent Delegations')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-2 py-1 rounded text-xs bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)] text-[var(--matrix-text-primary)]"
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier === 'all' ? t('delegations.allTiers', 'All Tiers') : tier.charAt(0).toUpperCase() + tier.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 rounded text-xs bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)] text-[var(--matrix-text-primary)]"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'all'
                  ? t('delegations.allStatuses', 'All Statuses')
                  : status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium transition-colors',
              autoRefresh
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-[var(--matrix-bg-secondary)] text-[var(--matrix-text-secondary)] border border-[var(--matrix-border)]',
            )}
          >
            {autoRefresh ? t('logs.autoRefreshOn', 'Live') : t('logs.autoRefreshOff', 'Paused')}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-1.5 rounded text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('delegations.total', 'Total'), value: stats.total, icon: Users, color: 'text-blue-400' },
          {
            label: t('delegations.completed', 'Completed'),
            value: stats.completed,
            icon: CheckCircle2,
            color: 'text-emerald-400',
          },
          { label: t('delegations.errors', 'Errors'), value: stats.errors, icon: AlertTriangle, color: 'text-red-400' },
          {
            label: t('delegations.avgDuration', 'Avg Duration'),
            value: formatDuration(stats.avg_duration_ms),
            icon: Clock,
            color: 'text-amber-400',
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={cn('rounded-lg border border-[var(--matrix-border)] bg-[var(--matrix-bg-secondary)] p-3')}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={stat.color} />
                <span className={cn('text-xs', theme.textMuted)}>{stat.label}</span>
              </div>
              <p className={cn('text-xl font-bold tabular-nums', 'text-[var(--matrix-text-primary)]')}>{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Task list */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--matrix-accent)]" />
        </div>
      )}

      {isError && (
        <div className={cn('text-center py-8 text-sm', theme.textMuted)}>
          {t('common.loadError', 'Failed to load data')}
        </div>
      )}

      {!isLoading && !isError && tasks.length === 0 && (
        <div className={cn('text-center py-12 text-sm', theme.textMuted)}>
          {t(
            'delegations.empty',
            'No delegations yet. Agents will delegate subtasks automatically during complex conversations.',
          )}
        </div>
      )}

      {!isLoading && !isError && tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(DelegationsView);
