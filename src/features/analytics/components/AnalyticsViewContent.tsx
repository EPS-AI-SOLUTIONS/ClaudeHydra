// src/features/analytics/components/AnalyticsView.tsx

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { BarChart3, Clock, DollarSign, Target, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/atoms';
import {
  type CostBreakdown,
  type DailyLatency,
  type DailyTokenUsage,
  type ModelSuccessRate,
  type ToolUsageStat,
  useCostEstimate,
  useLatency,
  useSuccessRate,
  useTokenUsage,
  useTopTools,
} from '../hooks/useAnalytics';

// ---------------------------------------------------------------------------
// Time range selector
// ---------------------------------------------------------------------------

type TimeRange = 7 | 14 | 30;

function TimeRangeSelector({
  value,
  onChange,
  isLight,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
  isLight: boolean;
}) {
  const ranges: TimeRange[] = [7, 14, 30];
  return (
    <div className="flex items-center gap-1">
      {ranges.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            value === r
              ? isLight
                ? 'bg-emerald-500/15 text-emerald-700 shadow-sm'
                : 'bg-white/10 text-white shadow-sm'
              : isLight
                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                : 'text-white/40 hover:bg-white/5 hover:text-white/70',
          )}
        >
          {r}d
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Get a consistent color for a model name. */
function modelColor(model: string, isLight: boolean): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return isLight ? 'bg-purple-500' : 'bg-purple-500';
  if (m.includes('sonnet')) return isLight ? 'bg-blue-500' : 'bg-blue-500';
  if (m.includes('haiku')) return isLight ? 'bg-emerald-500' : 'bg-emerald-500';
  return isLight ? 'bg-gray-400' : 'bg-gray-500';
}

function modelColorText(model: string, isLight: boolean): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return isLight ? 'text-purple-600' : 'text-purple-400';
  if (m.includes('sonnet')) return isLight ? 'text-blue-600' : 'text-blue-400';
  if (m.includes('haiku')) return isLight ? 'text-emerald-600' : 'text-emerald-400';
  return isLight ? 'text-gray-600' : 'text-gray-400';
}

function tierColor(tier: string, isLight: boolean): string {
  const t = tier.toLowerCase();
  if (t === 'opus' || t === 'commander') return isLight ? 'bg-purple-500' : 'bg-purple-500';
  if (t === 'sonnet' || t === 'coordinator') return isLight ? 'bg-blue-500' : 'bg-blue-500';
  if (t === 'haiku' || t === 'executor') return isLight ? 'bg-emerald-500' : 'bg-emerald-500';
  return isLight ? 'bg-gray-400' : 'bg-gray-500';
}

/** Short model label (strip provider prefix, keep variant). */
function shortModel(model: string): string {
  // e.g. "claude-opus-4-6" -> "opus-4-6", "claude-sonnet-4-6" -> "sonnet-4-6"
  return model.replace(/^claude-/, '').replace(/^models\//, '');
}

// ---------------------------------------------------------------------------
// Token Usage Card
// ---------------------------------------------------------------------------

function TokenUsageCard({ data, isLight }: { data: DailyTokenUsage[]; isLight: boolean }) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={20} className="text-[var(--matrix-text-secondary)]" />}
        message={t('analytics.noTokenData', 'No token usage data yet')}
      />
    );
  }

  // Aggregate by day (combine all models per day)
  const byDay = new Map<string, { input: number; output: number; models: Map<string, number> }>();
  for (const row of data) {
    const entry = byDay.get(row.day) ?? { input: 0, output: 0, models: new Map() };
    entry.input += row.input_tokens;
    entry.output += row.output_tokens;
    entry.models.set(row.model, (entry.models.get(row.model) ?? 0) + row.total_tokens);
    byDay.set(row.day, entry);
  }

  const days = Array.from(byDay.entries());
  const maxTotal = Math.max(...days.map(([, d]) => d.input + d.output), 1);

  return (
    <div className="space-y-2">
      {days.map(([day, d]) => {
        const totalPct = ((d.input + d.output) / maxTotal) * 100;
        const inputPct = (d.input / (d.input + d.output || 1)) * totalPct;
        const outputPct = totalPct - inputPct;
        return (
          <div key={day} className="flex items-center gap-3">
            <span className="font-mono text-xs text-[var(--matrix-text-secondary)] w-20 shrink-0">{day.slice(5)}</span>
            <div className="flex-1 flex h-5 rounded overflow-hidden bg-[var(--matrix-bg-secondary)]">
              <div
                className={cn('h-full transition-all', isLight ? 'bg-blue-400' : 'bg-blue-500')}
                style={{ width: `${inputPct}%` }}
                title={`Input: ${formatTokens(d.input)}`}
              />
              <div
                className={cn('h-full transition-all', isLight ? 'bg-emerald-400' : 'bg-emerald-500')}
                style={{ width: `${outputPct}%` }}
                title={`Output: ${formatTokens(d.output)}`}
              />
            </div>
            <span className="font-mono text-xs text-[var(--matrix-text-secondary)] w-16 text-right shrink-0">
              {formatTokens(d.input + d.output)}
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-4 pt-1 text-xs text-[var(--matrix-text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className={cn('w-2.5 h-2.5 rounded-sm', isLight ? 'bg-blue-400' : 'bg-blue-500')} />
          Input
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('w-2.5 h-2.5 rounded-sm', isLight ? 'bg-emerald-400' : 'bg-emerald-500')} />
          Output
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Latency Card
// ---------------------------------------------------------------------------

function LatencyCard({ data, isLight }: { data: DailyLatency[]; isLight: boolean }) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Clock size={20} className="text-[var(--matrix-text-secondary)]" />}
        message={t('analytics.noLatencyData', 'No latency data yet')}
      />
    );
  }

  // Aggregate across all days per tier
  const byTier = new Map<string, { avg: number[]; p50: number[]; p95: number[]; count: number }>();
  for (const row of data) {
    const entry = byTier.get(row.tier) ?? { avg: [], p50: [], p95: [], count: 0 };
    entry.avg.push(row.avg_ms);
    entry.p50.push(row.p50_ms);
    entry.p95.push(row.p95_ms);
    entry.count += row.request_count;
    byTier.set(row.tier, entry);
  }

  const tiers = Array.from(byTier.entries()).map(([tier, d]) => ({
    tier,
    avg: d.avg.reduce((a, b) => a + b, 0) / d.avg.length,
    p50: d.p50.reduce((a, b) => a + b, 0) / d.p50.length,
    p95: d.p95.reduce((a, b) => a + b, 0) / d.p95.length,
    count: d.count,
  }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-white/10')}>
            <th className="text-left py-2 px-2 font-medium text-[var(--matrix-text-secondary)]">
              {t('analytics.tier', 'Tier')}
            </th>
            <th className="text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]">Avg</th>
            <th className="text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]">P50</th>
            <th className="text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]">P95</th>
            <th className="text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]">
              {t('analytics.requests', 'Requests')}
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((row) => (
            <tr
              key={row.tier}
              className={cn('transition-colors', isLight ? 'hover:bg-black/[0.02]' : 'hover:bg-white/[0.03]')}
            >
              <td className="py-2 px-2">
                <span className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', tierColor(row.tier, isLight))} />
                  <span className="font-mono text-sm capitalize">{row.tier}</span>
                </span>
              </td>
              <td className="text-right py-2 px-2 font-mono text-sm">{formatMs(row.avg)}</td>
              <td className="text-right py-2 px-2 font-mono text-sm">{formatMs(row.p50)}</td>
              <td className="text-right py-2 px-2 font-mono text-sm">{formatMs(row.p95)}</td>
              <td className="text-right py-2 px-2 font-mono text-sm text-[var(--matrix-text-secondary)]">
                {row.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success Rate Card
// ---------------------------------------------------------------------------

function SuccessRateCard({ data, isLight }: { data: ModelSuccessRate[]; isLight: boolean }) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Target size={20} className="text-[var(--matrix-text-secondary)]" />}
        message={t('analytics.noSuccessData', 'No success rate data yet')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const rateColor =
          row.success_rate >= 95
            ? isLight
              ? 'text-emerald-600'
              : 'text-emerald-400'
            : row.success_rate >= 80
              ? isLight
                ? 'text-amber-600'
                : 'text-amber-400'
              : isLight
                ? 'text-red-600'
                : 'text-red-400';
        const dotColor =
          row.success_rate >= 95 ? 'bg-emerald-500' : row.success_rate >= 80 ? 'bg-amber-500' : 'bg-red-500';

        return (
          <div key={row.model} className="flex items-center gap-3">
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', dotColor)} />
            <span
              className={cn('font-mono text-sm truncate flex-1 min-w-0', modelColorText(row.model, isLight))}
              title={row.model}
            >
              {shortModel(row.model)}
            </span>
            <span className={cn('font-mono text-sm font-bold shrink-0', rateColor)}>
              {row.success_rate.toFixed(1)}%
            </span>
            <span className="text-xs text-[var(--matrix-text-secondary)] shrink-0 w-16 text-right">
              {row.successes}/{row.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Tools Card
// ---------------------------------------------------------------------------

function TopToolsCard({ data, isLight }: { data: ToolUsageStat[]; isLight: boolean }) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Wrench size={20} className="text-[var(--matrix-text-secondary)]" />}
        message={t('analytics.noToolData', 'No tool usage data yet')}
      />
    );
  }

  const maxCount = Math.max(...data.map((d) => d.usage_count), 1);

  return (
    <div className="space-y-2">
      {data.map((row, idx) => {
        const pct = (row.usage_count / maxCount) * 100;
        const hasErrors = row.error_count > 0;
        return (
          <div key={row.tool_name} className="flex items-center gap-3">
            <span className="font-mono text-xs text-[var(--matrix-text-secondary)] w-5 shrink-0 text-right">
              {idx + 1}.
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-sm truncate">{row.tool_name}</span>
                {hasErrors && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded',
                      isLight ? 'bg-red-100 text-red-600' : 'bg-red-500/15 text-red-400',
                    )}
                  >
                    {row.error_count} err
                  </span>
                )}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-[var(--matrix-bg-secondary)]">
                <div
                  className={cn('h-full rounded-full transition-all', isLight ? 'bg-blue-400' : 'bg-blue-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-xs text-[var(--matrix-text-secondary)] w-10 text-right shrink-0">
              {row.usage_count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost Estimate Card
// ---------------------------------------------------------------------------

function CostCard({
  data,
  totalCost,
  projectedMonthly,
  days,
  isLight,
}: {
  data: CostBreakdown[];
  totalCost: number;
  projectedMonthly: number;
  days: number;
  isLight: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs text-[var(--matrix-text-secondary)] uppercase tracking-wider">
            {t('analytics.periodCost', 'Period cost')} ({days}d)
          </p>
          <p className={cn('text-2xl font-bold font-mono', isLight ? 'text-gray-900' : 'text-white')}>
            {formatUsd(totalCost)}
          </p>
        </div>
        <div className={cn('h-10 w-px', isLight ? 'bg-gray-200' : 'bg-white/10')} />
        <div>
          <p className="text-xs text-[var(--matrix-text-secondary)] uppercase tracking-wider">
            {t('analytics.projected', 'Projected monthly')}
          </p>
          <p className={cn('text-2xl font-bold font-mono', isLight ? 'text-emerald-600' : 'text-emerald-400')}>
            {formatUsd(projectedMonthly)}
          </p>
        </div>
      </div>

      {/* Breakdown by model */}
      {data.length > 0 ? (
        <div className="space-y-2">
          {data.map((row) => (
            <div
              key={`${row.model}-${row.tier}`}
              className={cn('flex items-center gap-3 px-3 py-2 rounded-lg', isLight ? 'bg-gray-50' : 'bg-white/[0.03]')}
            >
              <span className={cn('w-2 h-2 rounded-full shrink-0', modelColor(row.model, isLight))} />
              <span className={cn('font-mono text-sm flex-1 truncate', modelColorText(row.model, isLight))}>
                {shortModel(row.model)}
              </span>
              <span className="text-xs text-[var(--matrix-text-secondary)]">
                {formatTokens(row.input_tokens)} in / {formatTokens(row.output_tokens)} out
              </span>
              <span className="font-mono text-sm font-bold w-16 text-right">{formatUsd(row.total_cost_usd)}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<DollarSign size={20} className="text-[var(--matrix-text-secondary)]" />}
          message={t('analytics.noCostData', 'No cost data yet')}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state helper
// ---------------------------------------------------------------------------

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6">
      {icon}
      <p className="text-sm text-[var(--matrix-text-secondary)]">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

function SectionCard({
  icon,
  title,
  isLight,
  isLoading,
  isError,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  isLight: boolean;
  isLoading: boolean;
  isError: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className={cn('text-base font-semibold', isLight ? 'text-gray-800' : 'text-white/90')}>{title}</h2>
        </div>
        {isLoading && (
          <p className="text-sm text-[var(--matrix-text-secondary)] text-center py-6">
            {t('common.loading', 'Loading...')}
          </p>
        )}
        {isError && (
          <p className="text-sm text-red-400 text-center py-6">{t('common.loadError', 'Failed to load data')}</p>
        )}
        {!isLoading && !isError && children}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main AnalyticsView
// ---------------------------------------------------------------------------

const AnalyticsViewContent = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const isLight = theme.isLight;
  const [days, setDays] = useState<TimeRange>(7);

  const tokens = useTokenUsage(days);
  const latency = useLatency(days);
  const successRate = useSuccessRate(days);
  const topTools = useTopTools(days);
  const cost = useCostEstimate(days);

  return (
    <div className="h-full flex flex-col items-center p-8 overflow-y-auto">
      <motion.div
        className="w-full max-w-5xl space-y-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <BarChart3 size={22} className="text-[var(--matrix-accent)]" />
          <h1 className={cn('text-2xl font-bold font-mono tracking-tight', theme.title)}>
            {t('analytics.title', 'Analytics')}
          </h1>
          <div className="ml-auto">
            <TimeRangeSelector value={days} onChange={setDays} isLight={isLight} />
          </div>
        </div>

        {/* Cost Estimate — prominent at top */}
        <SectionCard
          icon={<DollarSign size={18} className={isLight ? 'text-emerald-600' : 'text-emerald-400'} />}
          title={t('analytics.costEstimate', 'Cost Estimate')}
          isLight={isLight}
          isLoading={cost.isLoading}
          isError={cost.isError}
        >
          <CostCard
            data={cost.data?.data ?? []}
            totalCost={cost.data?.total_cost_usd ?? 0}
            projectedMonthly={cost.data?.projected_monthly_usd ?? 0}
            days={days}
            isLight={isLight}
          />
        </SectionCard>

        {/* 2-column grid for Token Usage + Success Rate */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            icon={<BarChart3 size={18} className={isLight ? 'text-blue-600' : 'text-blue-400'} />}
            title={t('analytics.tokenUsage', 'Token Usage')}
            isLight={isLight}
            isLoading={tokens.isLoading}
            isError={tokens.isError}
          >
            <TokenUsageCard data={tokens.data?.data ?? []} isLight={isLight} />
          </SectionCard>

          <SectionCard
            icon={<Target size={18} className={isLight ? 'text-amber-600' : 'text-amber-400'} />}
            title={t('analytics.successRate', 'Success Rate')}
            isLight={isLight}
            isLoading={successRate.isLoading}
            isError={successRate.isError}
          >
            <SuccessRateCard data={successRate.data?.data ?? []} isLight={isLight} />
          </SectionCard>
        </div>

        {/* 2-column grid for Latency + Top Tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            icon={<Clock size={18} className={isLight ? 'text-purple-600' : 'text-purple-400'} />}
            title={t('analytics.latency', 'Response Latency')}
            isLight={isLight}
            isLoading={latency.isLoading}
            isError={latency.isError}
          >
            <LatencyCard data={latency.data?.data ?? []} isLight={isLight} />
          </SectionCard>

          <SectionCard
            icon={<Wrench size={18} className={isLight ? 'text-orange-600' : 'text-orange-400'} />}
            title={t('analytics.topTools', 'Top Tools')}
            isLight={isLight}
            isLoading={topTools.isLoading}
            isError={topTools.isError}
          >
            <TopToolsCard data={topTools.data?.data ?? []} isLight={isLight} />
          </SectionCard>
        </div>
      </motion.div>
    </div>
  );
});

AnalyticsViewContent.displayName = 'AnalyticsViewContent';

export default AnalyticsViewContent;
