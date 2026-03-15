/**
 * MemoryPruningPanel — Advanced Agent Self-Reflection & Memory Pruning Dashboard
 *
 * Displays pruning metrics, cycle history, configuration controls,
 * and detailed log entries for each pruning cycle.
 * Integrated into SwarmView as a tab alongside Monitoring and Builder.
 */

import {
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GitMerge,
  Layers,
  Loader2,
  Play,
  Settings2,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import {
  type PruneCycleSummary,
  type PruneLogEntry,
  usePruningConfig,
  usePruningDetails,
  usePruningHistory,
  usePruningStats,
  useTriggerPrune,
  useUpdatePruningConfig,
} from '../hooks/useMemoryPruning';

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid #2a2a4e',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '11px', color: '#8b8ba7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0ff' }}>{value}</div>
      </div>
    </div>
  );
}

// ── Action Badge ─────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  delete: { bg: '#ef444430', text: '#f87171', icon: Trash2 },
  merge: { bg: '#a855f730', text: '#c084fc', icon: GitMerge },
  keep: { bg: '#22c55e30', text: '#4ade80', icon: CheckCircle2 },
  archive: { bg: '#eab30830', text: '#facc15', icon: Layers },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_STYLES[action] ?? { bg: '#22c55e30', text: '#4ade80', icon: CheckCircle2 };
  const Icon = style.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '6px',
        background: style.bg,
        color: style.text,
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      <Icon size={12} />
      {action}
    </span>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: '#22c55e30', text: '#4ade80' },
    running: { bg: '#3b82f630', text: '#60a5fa' },
    failed: { bg: '#ef444430', text: '#f87171' },
  };
  const c = colors[status] ?? { bg: '#22c55e30', text: '#4ade80' };
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '6px',
        background: c.bg,
        color: c.text,
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

// ── Cycle Details Panel ──────────────────────────────────────────────────────

function CycleDetails({ cycleId }: { cycleId: string }) {
  const { data, isLoading } = usePruningDetails(cycleId);

  if (isLoading) {
    return (
      <div style={{ padding: '12px', color: '#8b8ba7', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Loader2 size={14} className="animate-spin" />
        Wczytywanie szczegółów...
      </div>
    );
  }

  const entries = data?.entries ?? [];
  if (entries.length === 0) {
    return <div style={{ padding: '12px', color: '#6b7280', fontSize: '13px' }}>Brak wpisów dla tego cyklu.</div>;
  }

  return (
    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2a4e', color: '#8b8ba7' }}>
            <th style={{ padding: '8px', textAlign: 'left' }}>Encja</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Akcja</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Powód</th>
            <th style={{ padding: '8px', textAlign: 'right' }}>Podobieństwo</th>
            <th style={{ padding: '8px', textAlign: 'right' }}>Tokeny</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry: PruneLogEntry) => (
            <tr key={`${entry.entity_name}-${entry.action}`} style={{ borderBottom: '1px solid #1a1a2e' }}>
              <td style={{ padding: '8px', color: '#e0e0ff', fontFamily: 'monospace', fontSize: '12px' }}>
                {entry.entity_name}
                {entry.merged_into && <div style={{ fontSize: '11px', color: '#8b8ba7' }}>→ {entry.merged_into}</div>}
              </td>
              <td style={{ padding: '8px' }}>
                <ActionBadge action={entry.action} />
              </td>
              <td
                style={{
                  padding: '8px',
                  color: '#a0a0c0',
                  maxWidth: '250px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {entry.reason}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', color: '#e0e0ff' }}>
                {entry.similarity_score != null ? `${(entry.similarity_score * 100).toFixed(1)}%` : '—'}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', color: '#e0e0ff' }}>
                {entry.tokens_before > 0 ? (
                  <span>
                    {entry.tokens_before} → {entry.tokens_after}
                    {entry.tokens_before > entry.tokens_after && (
                      <span style={{ color: '#4ade80', marginLeft: '4px' }}>
                        (-{entry.tokens_before - entry.tokens_after})
                      </span>
                    )}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function MemoryPruningPanel() {
  const { data: statsData, isLoading: statsLoading } = usePruningStats();
  const { data: historyData } = usePruningHistory(20);
  const { data: configData } = usePruningConfig();
  const updateConfig = useUpdatePruningConfig();
  const triggerPrune = useTriggerPrune();

  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const metrics = statsData?.metrics;
  const isRunning = statsData?.is_running ?? false;
  const cycles = historyData?.cycles ?? [];
  const config = configData;

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Brain size={24} color="#c084fc" />
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#e0e0ff' }}>Self-Reflection & Memory Pruning</h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#8b8ba7' }}>
              Automatyczne oczyszczanie Knowledge Graph z duplikatów i nieaktualnych wpisów
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #2a2a4e',
              background: '#1a1a2e',
              color: '#a0a0c0',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            <Settings2 size={14} />
            Konfiguracja
          </button>
          <button
            type="button"
            onClick={() => triggerPrune.mutate()}
            disabled={isRunning || triggerPrune.isPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: isRunning ? '#3b82f6' : '#a855f7',
              color: '#fff',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: isRunning ? 0.7 : 1,
            }}
          >
            {isRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Pruning w toku...
              </>
            ) : (
              <>
                <Play size={14} />
                Uruchom Pruning
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <StatCard label="Cykli pruning" value={metrics?.total_cycles ?? 0} icon={BarChart3} color="#3b82f6" />
        <StatCard label="Usunięte wpisy" value={metrics?.total_deleted ?? 0} icon={Trash2} color="#ef4444" />
        <StatCard label="Scalone wpisy" value={metrics?.total_merged ?? 0} icon={GitMerge} color="#a855f7" />
        <StatCard
          label="Tokeny zaoszczędzone"
          value={metrics?.total_tokens_saved?.toLocaleString() ?? '0'}
          icon={Zap}
          color="#22c55e"
        />
        <StatCard label="Klastry znalezione" value={metrics?.total_clusters_found ?? 0} icon={Layers} color="#eab308" />
        <StatCard
          label="Ostatni cykl"
          value={metrics?.last_cycle_duration_ms ? `${metrics.last_cycle_duration_ms}ms` : '—'}
          icon={Clock}
          color="#06b6d4"
        />
      </div>

      {/* Config Panel */}
      <AnimatePresence>
        {showConfig && config && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              background: '#1a1a2e',
              border: '1px solid #2a2a4e',
              borderRadius: '12px',
              marginBottom: '24px',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#e0e0ff' }}>Konfiguracja Pruning</h3>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}
              >
                {/* Enabled toggle */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#a0a0c0',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => updateConfig.mutate({ enabled: e.target.checked })}
                    style={{ accentColor: '#a855f7' }}
                  />
                  Auto-pruning aktywny
                </label>

                {/* Similarity threshold */}
                <div>
                  <label
                    htmlFor="prune-similarity"
                    style={{ fontSize: '12px', color: '#8b8ba7', display: 'block', marginBottom: '4px' }}
                  >
                    Próg podobieństwa: {(config.similarity_threshold * 100).toFixed(0)}%
                  </label>
                  <input
                    id="prune-similarity"
                    type="range"
                    min="50"
                    max="99"
                    value={config.similarity_threshold * 100}
                    onChange={(e) => updateConfig.mutate({ similarity_threshold: Number(e.target.value) / 100 })}
                    style={{ width: '100%', accentColor: '#a855f7' }}
                  />
                </div>

                {/* Min age */}
                <div>
                  <label
                    htmlFor="prune-min-age"
                    style={{ fontSize: '12px', color: '#8b8ba7', display: 'block', marginBottom: '4px' }}
                  >
                    Min. wiek wpisu (godz.): {config.min_age_hours}
                  </label>
                  <input
                    id="prune-min-age"
                    type="range"
                    min="0"
                    max="168"
                    value={config.min_age_hours}
                    onChange={(e) => updateConfig.mutate({ min_age_hours: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#a855f7' }}
                  />
                </div>

                {/* Max entries */}
                <div>
                  <label
                    htmlFor="prune-max-entries"
                    style={{ fontSize: '12px', color: '#8b8ba7', display: 'block', marginBottom: '4px' }}
                  >
                    Maks. wpisów pamięci: {config.max_memory_entries}
                  </label>
                  <input
                    id="prune-max-entries"
                    type="number"
                    min="10"
                    max="10000"
                    value={config.max_memory_entries}
                    onChange={(e) => updateConfig.mutate({ max_memory_entries: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #2a2a4e',
                      background: '#0d0d1a',
                      color: '#e0e0ff',
                      fontSize: '13px',
                    }}
                  />
                </div>

                {/* Interval */}
                <div>
                  <label
                    htmlFor="prune-interval"
                    style={{ fontSize: '12px', color: '#8b8ba7', display: 'block', marginBottom: '4px' }}
                  >
                    Interwał auto-pruning (sek.): {config.auto_prune_interval_secs}
                  </label>
                  <input
                    id="prune-interval"
                    type="number"
                    min="300"
                    max="86400"
                    step="300"
                    value={config.auto_prune_interval_secs}
                    onChange={(e) => updateConfig.mutate({ auto_prune_interval_secs: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #2a2a4e',
                      background: '#0d0d1a',
                      color: '#e0e0ff',
                      fontSize: '13px',
                    }}
                  />
                </div>

                {/* Max cluster size */}
                <div>
                  <label
                    htmlFor="prune-max-cluster"
                    style={{ fontSize: '12px', color: '#8b8ba7', display: 'block', marginBottom: '4px' }}
                  >
                    Maks. rozmiar klastra: {config.max_cluster_size}
                  </label>
                  <input
                    id="prune-max-cluster"
                    type="range"
                    min="2"
                    max="20"
                    value={config.max_cluster_size}
                    onChange={(e) => updateConfig.mutate({ max_cluster_size: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#a855f7' }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cycle History */}
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid #2a2a4e',
          borderRadius: '12px',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2a2a4e' }}>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#e0e0ff' }}>Historia cykli pruning</h3>
        </div>

        {statsLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#8b8ba7' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            <div>Wczytywanie...</div>
          </div>
        ) : cycles.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <Brain size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <div>Brak ukończonych cykli pruning</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              Kliknij "Uruchom Pruning" aby rozpocząć analizę Knowledge Graph
            </div>
          </div>
        ) : (
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {cycles.map((cycle: PruneCycleSummary) => {
              const isExpanded = expandedCycle === cycle.id;
              return (
                <div key={cycle.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedCycle(isExpanded ? null : cycle.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 20px',
                      borderBottom: '1px solid #1a1a2e',
                      background: isExpanded ? '#1f1f3a' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: '#e0e0ff',
                      fontSize: '13px',
                    }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <StatusBadge status={cycle.status} />
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#8b8ba7' }}>
                      {new Date(cycle.started_at).toLocaleString('pl-PL')}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#a0a0c0' }}>
                      <span title="Usunięte">
                        <Trash2 size={12} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                        {cycle.deleted_count}
                      </span>
                      <span title="Scalone">
                        <GitMerge size={12} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                        {cycle.merged_count}
                      </span>
                      <span title="Zachowane">
                        <CheckCircle2 size={12} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                        {cycle.kept_count}
                      </span>
                      <span title="Tokeny zaoszczędzone" style={{ color: '#4ade80' }}>
                        <Zap size={12} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                        {cycle.tokens_saved.toLocaleString()}
                      </span>
                    </span>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{cycle.triggered_by}</span>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', background: '#14142a', borderBottom: '1px solid #2a2a4e' }}
                      >
                        <div style={{ padding: '8px 20px' }}>
                          {cycle.error && (
                            <div
                              style={{
                                padding: '8px 12px',
                                marginBottom: '8px',
                                borderRadius: '6px',
                                background: '#ef444420',
                                color: '#f87171',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <XCircle size={14} />
                              {cycle.error}
                            </div>
                          )}
                          <CycleDetails cycleId={cycle.id} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
