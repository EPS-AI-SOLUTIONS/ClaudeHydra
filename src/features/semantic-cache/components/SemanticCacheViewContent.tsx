/**
 * SemanticCacheView — Dashboard for the Semantic Cache & Context Compression system.
 *
 * Shows cache hit/miss metrics, cost savings, Qdrant health, TTL config,
 * cached entries list, and manual invalidation controls.
 */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  DollarSign,
  Gauge,
  RefreshCw,
  Settings2,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import {
  type CacheEntry,
  useCacheConfig,
  useCacheEntries,
  useCacheHealth,
  useCacheStats,
  useDeleteEntry,
  useInvalidateCache,
  useUpdateConfig,
} from '../hooks/useSemanticCache';

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
  isDark,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-4 border transition-all',
        isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-200 shadow-sm',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-lg', color)}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs font-medium', isDark ? 'text-white/50' : 'text-gray-500')}>{label}</p>
          <p className={cn('text-xl font-bold tabular-nums', isDark ? 'text-white' : 'text-gray-900')}>{value}</p>
          {subtitle && (
            <p className={cn('text-[10px] mt-0.5', isDark ? 'text-white/40' : 'text-gray-400')}>{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Health Badge ─────────────────────────────────────────────────────────────

function HealthBadge({ ok, label, isDark }: { ok: boolean; label: string; isDark: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 size={14} className="text-green-400" /> : <XCircle size={14} className="text-red-400" />}
      <span className={cn('text-sm', isDark ? 'text-white/70' : 'text-gray-600')}>{label}</span>
    </div>
  );
}

// ── Entry Row ────────────────────────────────────────────────────────────────

function EntryRow({ entry, isDark, onDelete }: { entry: CacheEntry; isDark: boolean; onDelete: () => void }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg border transition-all',
        isDark ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-white border-gray-100 hover:bg-gray-50',
      )}
    >
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', isDark ? 'text-white/80' : 'text-gray-700')}>{entry.query_preview}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className={cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400')}>{entry.model}</span>
          <span className={cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400')}>
            {entry.token_count} tokens
          </span>
          <span className={cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400')}>{entry.hit_count} hits</span>
          <span className={cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400')}>
            {new Date(entry.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className={cn(
          'p-1.5 rounded-md transition-colors',
          isDark
            ? 'hover:bg-red-500/20 text-white/30 hover:text-red-400'
            : 'hover:bg-red-50 text-gray-300 hover:text-red-500',
        )}
        title="Delete entry"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── Main View ────────────────────────────────────────────────────────────────

function SemanticCacheViewContent() {
  const theme = useViewTheme();
  const isDark = !theme.isLight;

  const { data: stats, isLoading: statsLoading } = useCacheStats();
  const { data: health } = useCacheHealth();
  const { data: config } = useCacheConfig();
  const { data: entries } = useCacheEntries(20);
  const updateConfig = useUpdateConfig();
  const deleteEntry = useDeleteEntry();
  const invalidateCache = useInvalidateCache();

  const [showConfig, setShowConfig] = useState(false);

  const metrics = stats?.metrics;
  const collection = stats?.collection;

  const hitRatePercent = metrics ? (metrics.hit_rate * 100).toFixed(1) : '0.0';
  const costSaved = metrics?.estimated_cost_saved_usd.toFixed(4) ?? '0.0000';
  const avgLatency = metrics?.avg_search_latency_ms.toFixed(1) ?? '0.0';

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={cn('text-2xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>Semantic Cache</h1>
            <p className={cn('text-sm mt-1', isDark ? 'text-white/50' : 'text-gray-500')}>
              Qdrant Vector Router &bull; AST Context Compression &bull; Few-Shot Fallback
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                isDark ? 'bg-white/10 hover:bg-white/15 text-white/70' : 'bg-gray-100 hover:bg-gray-200 text-gray-600',
              )}
            >
              <Settings2 size={14} />
              Config
            </button>
            <button
              type="button"
              onClick={() => invalidateCache.mutate({ flush_all: true })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                isDark ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-600',
              )}
              disabled={invalidateCache.isPending}
            >
              <RefreshCw size={14} className={invalidateCache.isPending ? 'animate-spin' : ''} />
              Flush Cache
            </button>
          </div>
        </div>

        {/* Health Badges */}
        {health && (
          <div
            className={cn(
              'flex items-center gap-6 px-4 py-3 rounded-xl border',
              isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200',
            )}
          >
            <HealthBadge ok={health.qdrant_reachable} label="Qdrant" isDark={isDark} />
            <HealthBadge ok={health.embedding_configured} label="Embeddings" isDark={isDark} />
            <HealthBadge ok={health.cache_enabled} label="Cache Enabled" isDark={isDark} />
            <HealthBadge ok={health.collection_exists} label="Collection" isDark={isDark} />
            {collection && (
              <span className={cn('text-xs ml-auto', isDark ? 'text-white/40' : 'text-gray-400')}>
                {collection.points_count} points &bull; {collection.status}
              </span>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Cache Hit Rate"
            value={`${hitRatePercent}%`}
            icon={Gauge}
            color={isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}
            subtitle={`${metrics?.exact_hits ?? 0} exact + ${metrics?.partial_hits ?? 0} partial`}
            isDark={isDark}
          />
          <StatCard
            label="Cost Saved (USD)"
            value={`$${costSaved}`}
            icon={DollarSign}
            color={isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600'}
            subtitle={`${metrics?.tokens_saved ?? 0} tokens saved`}
            isDark={isDark}
          />
          <StatCard
            label="Avg Search Latency"
            value={`${avgLatency}ms`}
            icon={Zap}
            color={isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}
            subtitle="Qdrant cosine search"
            isDark={isDark}
          />
          <StatCard
            label="Total Queries"
            value={metrics?.total_queries ?? 0}
            icon={Activity}
            color={isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600'}
            subtitle={`${metrics?.misses ?? 0} cache misses`}
            isDark={isDark}
          />
        </div>

        {/* Hit/Miss Distribution */}
        {metrics && metrics.total_queries > 0 && (
          <div
            className={cn(
              'rounded-xl p-4 border',
              isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200',
            )}
          >
            <h3 className={cn('text-sm font-medium mb-3', isDark ? 'text-white/70' : 'text-gray-600')}>
              Hit/Miss Distribution
            </h3>
            <div className="flex h-4 rounded-full overflow-hidden">
              {metrics.exact_hits > 0 && (
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(metrics.exact_hits / metrics.total_queries) * 100}%` }}
                  title={`Exact: ${metrics.exact_hits}`}
                />
              )}
              {metrics.partial_hits > 0 && (
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(metrics.partial_hits / metrics.total_queries) * 100}%` }}
                  title={`Partial: ${metrics.partial_hits}`}
                />
              )}
              {metrics.misses > 0 && (
                <div
                  className={cn('transition-all', isDark ? 'bg-white/10' : 'bg-gray-200')}
                  style={{ width: `${(metrics.misses / metrics.total_queries) * 100}%` }}
                  title={`Miss: ${metrics.misses}`}
                />
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Exact ({metrics.exact_hits})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Partial ({metrics.partial_hits})
              </span>
              <span className="flex items-center gap-1">
                <span className={cn('w-2 h-2 rounded-full', isDark ? 'bg-white/10' : 'bg-gray-200')} /> Miss (
                {metrics.misses})
              </span>
            </div>
          </div>
        )}

        {/* Configuration Panel (collapsible) */}
        {showConfig && config && (
          <div
            className={cn(
              'rounded-xl p-4 border space-y-4',
              isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200',
            )}
          >
            <h3 className={cn('text-sm font-medium', isDark ? 'text-white/70' : 'text-gray-600')}>Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ConfigField label="Cache Enabled" isDark={isDark}>
                <button
                  type="button"
                  onClick={() => updateConfig.mutate({ enabled: !config.enabled })}
                  className={cn(
                    'px-3 py-1 rounded text-sm font-medium transition-all',
                    config.enabled
                      ? isDark
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-emerald-100 text-emerald-600'
                      : isDark
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-red-100 text-red-600',
                  )}
                >
                  {config.enabled ? 'ON' : 'OFF'}
                </button>
              </ConfigField>
              <ConfigField label="TTL (hours)" isDark={isDark}>
                <span className={cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800')}>
                  {(config.ttl_seconds / 3600).toFixed(0)}h
                </span>
              </ConfigField>
              <ConfigField label="Exact Hit Threshold" isDark={isDark}>
                <span className={cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800')}>
                  {(config.exact_hit_threshold * 100).toFixed(0)}%
                </span>
              </ConfigField>
              <ConfigField label="Partial Hit Threshold" isDark={isDark}>
                <span className={cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800')}>
                  {(config.partial_hit_threshold * 100).toFixed(0)}%
                </span>
              </ConfigField>
              <ConfigField label="Embedding Model" isDark={isDark}>
                <span className={cn('text-xs font-mono truncate', isDark ? 'text-white/60' : 'text-gray-600')}>
                  {config.embedding_model}
                </span>
              </ConfigField>
              <ConfigField label="Vector Size" isDark={isDark}>
                <span className={cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800')}>
                  {config.vector_size}
                </span>
              </ConfigField>
            </div>
          </div>
        )}

        {/* Cached Entries */}
        <div
          className={cn('rounded-xl border', isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200')}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
            <div className="flex items-center gap-2">
              <Database size={14} className={isDark ? 'text-white/50' : 'text-gray-400'} />
              <h3 className={cn('text-sm font-medium', isDark ? 'text-white/70' : 'text-gray-600')}>Cached Entries</h3>
              <span className={cn('text-xs', isDark ? 'text-white/40' : 'text-gray-400')}>
                ({entries?.total_estimate ?? 0} total)
              </span>
            </div>
          </div>
          <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
            {entries?.entries.length === 0 && (
              <p className={cn('text-sm text-center py-8', isDark ? 'text-white/30' : 'text-gray-400')}>
                No cached entries yet
              </p>
            )}
            {entries?.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} isDark={isDark} onDelete={() => deleteEntry.mutate(entry.id)} />
            ))}
          </div>
        </div>

        {/* Loading state */}
        {statsLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span className={cn('text-sm', isDark ? 'text-white/50' : 'text-gray-500')}>
                Loading cache metrics...
              </span>
            </div>
          </div>
        )}

        {/* Warning if Qdrant is unreachable */}
        {health && !health.qdrant_reachable && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300">
              Qdrant is unreachable at {config?.qdrant_url ?? 'localhost:6333'}. Start Qdrant to enable semantic
              caching.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Config Field ─────────────────────────────────────────────────────────────

function ConfigField({ label, isDark, children }: { label: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p
        className={cn(
          'text-[10px] font-medium uppercase tracking-wider mb-1',
          isDark ? 'text-white/40' : 'text-gray-400',
        )}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

export default SemanticCacheViewContent;
