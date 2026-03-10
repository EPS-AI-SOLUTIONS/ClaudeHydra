/** Jaskier Shared Pattern */
// src/features/health/components/HealthDashboard.tsx
/**
 * ClaudeHydra v4 - Health Dashboard
 * ===================================
 * Compact grid of stat cards showing backend status, auth mode,
 * system resources, model cache size, and uptime.
 */

import { BaseMetricsDashboard, Card, cn } from '@jaskier/ui';
import { Clock, RefreshCw, Shield } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/molecules/QueryError';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { useHealthDashboard } from '../hooks/useHealthDashboard';

// ============================================================================
// HELPERS
// ============================================================================

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${String(h)}h ${String(m)}m`;
  return `${String(m)}m`;
}

function formatMemory(usedMb: number, totalMb: number): string {
  return `${String(Math.round(usedMb))} / ${String(Math.round(totalMb))} MB`;
}

// ============================================================================
// STAT CARD SUB-COMPONENT
// ============================================================================

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  statusColor?: string;
}

const StatCard = memo<StatCardProps>(({ icon, label, value, statusColor }) => {
  const theme = useViewTheme();

  return (
    <Card variant="default" padding="sm" className="flex items-center gap-3 min-w-0">
      <div className={cn('flex-shrink-0', theme.iconMuted)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-[10px] uppercase tracking-wider font-mono', theme.textMuted)}>{label}</p>
        <p className={cn('text-sm font-mono font-semibold truncate', statusColor ?? theme.text)}>{value}</p>
      </div>
    </Card>
  );
});

StatCard.displayName = 'StatCard';

// ============================================================================
// HEALTH DASHBOARD
// ============================================================================

export const HealthDashboard = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const data = useHealthDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    data.refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (data.loading) {
    return (
      <div className="w-full">
        <h3 className={cn('text-sm font-mono font-semibold uppercase tracking-wider mb-3', theme.textMuted)}>
          {t('health.title', 'System Health')}
        </h3>
        <div className={cn('text-sm font-mono animate-pulse', theme.textMuted)}>
          {t('common.loading', 'Loading...')}
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="w-full">
        <h3 className={cn('text-sm font-mono font-semibold uppercase tracking-wider mb-3', theme.textMuted)}>
          {t('health.title', 'System Health')}
        </h3>
        <QueryError onRetry={data.refetch} />
      </div>
    );
  }

  const memoryPercent =
    data.memoryTotalMb && data.memoryTotalMb > 0 ? ((data.memoryUsedMb ?? 0) / data.memoryTotalMb) * 100 : 0;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-sm font-mono font-semibold uppercase tracking-wider', theme.textMuted)}>
          {t('health.title', 'System Health')}
        </h3>
        <button
          type="button"
          onClick={handleRefresh}
          className={cn('p-1.5 rounded-lg transition-all', theme.btnGhost)}
          aria-label={t('health.refresh', 'Refresh health data')}
          title={t('health.refresh', 'Refresh')}
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <BaseMetricsDashboard
        title={t('health.metrics', 'System Metrics')}
        cpu={
          data.cpuUsage !== null
            ? {
                label: 'CPU',
                value: data.cpuUsage,
                status: data.cpuUsage > 90 ? 'error' : data.cpuUsage > 70 ? 'warning' : 'success',
              }
            : undefined
        }
        ram={
          data.memoryUsedMb !== null && data.memoryTotalMb !== null
            ? {
                label: 'RAM',
                value: memoryPercent,
                displayValue: formatMemory(data.memoryUsedMb, data.memoryTotalMb),
                status: memoryPercent > 90 ? 'error' : memoryPercent > 75 ? 'warning' : 'success',
              }
            : undefined
        }
        network={{
          label: 'Backend',
          status: data.backendOnline ? 'online' : 'offline',
        }}
        modelLoad={
          data.modelCount !== null
            ? {
                label: 'Models Loaded',
                value: Math.min(data.modelCount * 20, 100), // pseudo-visualization
                displayValue: String(data.modelCount),
                status: 'accent',
              }
            : undefined
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {/* Auth Mode */}
        <StatCard
          icon={<Shield size={16} />}
          label={t('health.auth', 'Authentication')}
          value={
            data.authRequired === null
              ? '--'
              : data.authRequired
                ? t('health.enabled', 'Enabled')
                : t('health.devMode', 'Dev Mode')
          }
        />

        {/* Uptime */}
        <StatCard
          icon={<Clock size={16} />}
          label={t('health.uptime', 'Uptime')}
          value={data.uptimeSeconds !== null ? formatUptime(data.uptimeSeconds) : '--'}
        />
      </div>
    </div>
  );
});

HealthDashboard.displayName = 'HealthDashboard';

export default HealthDashboard;
