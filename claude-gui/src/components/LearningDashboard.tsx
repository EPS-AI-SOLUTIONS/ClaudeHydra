/**
 * Learning Dashboard Component
 * Block 9: Analytics & Monitoring Dashboard for AI Learning System
 *
 * Displays:
 * - Core metrics (samples, model versions, RAG entries, quality)
 * - Alzur status (incremental learning)
 * - Top 5 topics pie chart
 * - Query type distribution
 * - Cost estimation
 * - Performance timing
 * - Recent activity
 */

import {
  Activity,
  BarChart3,
  Brain,
  Clock,
  Cpu,
  Database,
  DollarSign,
  Layers,
  RefreshCw,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
  type ActivityEntry,
  type QueryType,
  selectCostSummary,
  selectQueryDistribution,
  selectTopKeywords,
  type TopicCluster,
  useAnalyticsStore,
} from '../lib/analytics';

// ============================================================================
// Sub-components
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subValue?: string;
}

function MetricCard({ label, value, icon: Icon, color, subValue }: MetricCardProps) {
  return (
    <div className="glass-card p-3 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded ${color} bg-opacity-20`}>
          <Icon size={14} className={color} />
        </div>
        <span className="text-xs text-matrix-text-dim">{label}</span>
      </div>
      <div className="text-xl font-bold text-matrix-text">{value}</div>
      {subValue && <div className="text-[10px] text-matrix-text-dim mt-1">{subValue}</div>}
    </div>
  );
}

interface TopicPieChartProps {
  topics: TopicCluster[];
}

function TopicPieChart({ topics }: TopicPieChartProps) {
  const colors = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500'];

  if (topics.length === 0) {
    return (
      <div className="text-center text-matrix-text-dim text-xs py-4">
        Brak danych o tematach. Wykonaj kilka zapytan.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {topics.slice(0, 5).map((topic, i) => (
        <div key={topic.id} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-matrix-text truncate max-w-[120px]" title={topic.name}>
              {topic.name}
            </span>
            <span className="text-matrix-text-dim">{topic.percentage.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-matrix-bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full ${colors[i % colors.length]} transition-all duration-500`}
              style={{ width: `${Math.min(topic.percentage, 100)}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {topic.keywords.slice(0, 3).map((kw) => (
              <span
                key={kw}
                className="text-[9px] px-1 py-0.5 bg-matrix-bg-tertiary rounded text-matrix-text-dim"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface QueryDistributionProps {
  distribution: Record<QueryType, number>;
  total: number;
}

function QueryDistribution({ distribution, total }: QueryDistributionProps) {
  const types: { key: QueryType; label: string; color: string }[] = [
    { key: 'code', label: 'Code', color: 'bg-green-400' },
    { key: 'explain', label: 'Explain', color: 'bg-blue-400' },
    { key: 'debug', label: 'Debug', color: 'bg-red-400' },
    { key: 'general', label: 'General', color: 'bg-gray-400' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-matrix-bg-secondary">
        {types.map(({ key, color }) => (
          <div
            key={key}
            className={`${color} transition-all duration-500`}
            style={{ width: `${distribution[key]}%` }}
            title={`${key}: ${distribution[key].toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 text-[10px]">
        {types.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-matrix-text-dim">{label}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-matrix-text-dim text-center">Total: {total} queries</div>
    </div>
  );
}

interface AlzurStatusCardProps {
  samples: number;
  bufferSize: number;
  modelVersion: string;
  lastUpdate: number;
  isTraining: boolean;
}

function AlzurStatusCard({
  samples,
  bufferSize,
  modelVersion,
  lastUpdate,
  isTraining,
}: AlzurStatusCardProps) {
  const formatTime = (ts: number) => {
    if (ts === 0) return 'Never';
    return new Date(ts).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-400" />
          <span className="text-sm font-semibold text-matrix-text">Alzur Status</span>
        </div>
        {isTraining && (
          <div className="flex items-center gap-1 text-yellow-400 text-[10px]">
            <RefreshCw size={10} className="animate-spin" />
            Training...
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-matrix-text-dim">Samples:</span>
          <span className="ml-2 text-matrix-accent font-mono">{samples}</span>
        </div>
        <div>
          <span className="text-matrix-text-dim">Buffer:</span>
          <span className="ml-2 text-matrix-text font-mono">{bufferSize}</span>
        </div>
        <div>
          <span className="text-matrix-text-dim">Model:</span>
          <span className="ml-2 text-blue-400 font-mono">{modelVersion}</span>
        </div>
        <div>
          <span className="text-matrix-text-dim">Updated:</span>
          <span className="ml-2 text-matrix-text-dim font-mono text-[10px]">
            {formatTime(lastUpdate)}
          </span>
        </div>
      </div>
      {/* Buffer progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-matrix-text-dim mb-1">
          <span>Buffer Progress</span>
          <span>{bufferSize}/1000</span>
        </div>
        <div className="h-1.5 bg-matrix-bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: `${Math.min((bufferSize / 1000) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface ActivityListProps {
  activities: ActivityEntry[];
}

function ActivityList({ activities }: ActivityListProps) {
  const getActivityIcon = (type: ActivityEntry['type']) => {
    switch (type) {
      case 'query':
        return <Target size={10} className="text-green-400" />;
      case 'learning':
        return <Brain size={10} className="text-purple-400" />;
      case 'rag_add':
        return <Database size={10} className="text-blue-400" />;
      case 'model_update':
        return <Cpu size={10} className="text-yellow-400" />;
      case 'export':
        return <Layers size={10} className="text-pink-400" />;
      default:
        return <Activity size={10} className="text-matrix-text-dim" />;
    }
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString('pl-PL');
  };

  if (activities.length === 0) {
    return (
      <div className="text-center text-matrix-text-dim text-xs py-4 italic">Brak aktywnosci</div>
    );
  }

  return (
    <div className="space-y-1 max-h-48 overflow-auto">
      {activities.slice(0, 10).map((activity) => (
        <div
          key={activity.id}
          className="flex items-center gap-2 p-1.5 rounded bg-matrix-bg-primary/30 hover:bg-matrix-bg-primary/50 transition-colors"
        >
          {getActivityIcon(activity.type)}
          <span className="text-[10px] text-matrix-text flex-1 truncate">
            {activity.description}
          </span>
          <span className="text-[9px] text-matrix-text-dim">{formatTime(activity.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

interface PerformanceCardProps {
  embedding: number;
  retrieval: number;
  generation: number;
  total: number;
}

function PerformanceCard({ embedding, retrieval, generation, total }: PerformanceCardProps) {
  const metrics = [
    { label: 'Embedding', value: embedding, color: 'text-blue-400' },
    { label: 'Retrieval', value: retrieval, color: 'text-purple-400' },
    { label: 'Generation', value: generation, color: 'text-green-400' },
    { label: 'Total', value: total, color: 'text-matrix-accent' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {metrics.map(({ label, value, color }) => (
        <div key={label} className="text-center">
          <div className={`text-lg font-mono font-bold ${color}`}>
            {value}
            <span className="text-[10px] text-matrix-text-dim">ms</span>
          </div>
          <div className="text-[9px] text-matrix-text-dim">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LearningDashboard() {
  // Store selectors
  const totalSamples = useAnalyticsStore((s) => s.totalSamples);
  const modelVersions = useAnalyticsStore((s) => s.modelVersions);
  const ragEntries = useAnalyticsStore((s) => s.ragEntries);
  const avgQuality = useAnalyticsStore((s) => s.avgQuality);
  const topTopics = useAnalyticsStore((s) => s.topTopics);
  const totalQueries = useAnalyticsStore((s) => s.totalQueries);
  const alzurStatus = useAnalyticsStore((s) => s.alzurStatus);
  const avgPerformance = useAnalyticsStore((s) => s.avgPerformance);
  const recentActivity = useAnalyticsStore((s) => s.recentActivity);

  // Derived selectors
  const queryDistribution = useAnalyticsStore(selectQueryDistribution);
  const topKeywords = useAnalyticsStore((s) => selectTopKeywords(s, 5));
  const costSummary = useAnalyticsStore(selectCostSummary);

  // Actions
  const updateTopics = useAnalyticsStore((s) => s.updateTopics);

  // Update topics when component mounts
  useEffect(() => {
    updateTopics();
  }, [updateTopics]);

  // Memoized values
  const latestModelVersion = useMemo(
    () => modelVersions[modelVersions.length - 1] || 'v1.0.0',
    [modelVersions],
  );

  return (
    <div className="flex-1 glass-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-matrix-border">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-matrix-accent" />
          <div>
            <h2 className="text-lg font-bold text-matrix-text">Analytics Dashboard</h2>
            <p className="text-xs text-matrix-text-dim">AI Learning Metrics & Monitoring</p>
          </div>
        </div>
        <button onClick={updateTopics} className="glass-button p-2" title="Refresh Topics">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Core Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Total Samples"
            value={totalSamples}
            icon={Database}
            color="text-blue-400"
            subValue={`+${alzurStatus.bufferSize} in buffer`}
          />
          <MetricCard
            label="Model Version"
            value={latestModelVersion}
            icon={Cpu}
            color="text-purple-400"
            subValue={`${modelVersions.length} versions`}
          />
          <MetricCard label="RAG Entries" value={ragEntries} icon={Layers} color="text-green-400" />
          <MetricCard
            label="Avg Quality"
            value={`${(avgQuality * 100).toFixed(1)}%`}
            icon={TrendingUp}
            color="text-yellow-400"
          />
        </div>

        {/* Alzur Status */}
        <AlzurStatusCard
          samples={alzurStatus.samples}
          bufferSize={alzurStatus.bufferSize}
          modelVersion={alzurStatus.modelVersion}
          lastUpdate={alzurStatus.lastUpdate}
          isTraining={alzurStatus.isTraining}
        />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Topics Pie Chart */}
          <div className="glass-card p-3">
            <div className="flex items-center gap-2 mb-3">
              <Target size={14} className="text-matrix-accent" />
              <span className="text-sm font-semibold text-matrix-text">Top 5 Topics</span>
            </div>
            <TopicPieChart topics={topTopics} />
          </div>

          {/* Query Distribution */}
          <div className="glass-card p-3">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-matrix-accent" />
              <span className="text-sm font-semibold text-matrix-text">Query Types</span>
            </div>
            <QueryDistribution distribution={queryDistribution} total={totalQueries} />
          </div>
        </div>

        {/* Cost & Performance Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cost Estimation */}
          <div className="glass-card p-3">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={14} className="text-yellow-400" />
              <span className="text-sm font-semibold text-matrix-text">Cost Estimation</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-matrix-text-dim">Session:</span>
                <div className="text-lg font-mono text-yellow-400">${costSummary.session}</div>
                <span className="text-[10px] text-matrix-text-dim">
                  {costSummary.sessionTokens.toLocaleString()} tokens
                </span>
              </div>
              <div>
                <span className="text-matrix-text-dim">Total:</span>
                <div className="text-lg font-mono text-matrix-accent">${costSummary.total}</div>
                <span className="text-[10px] text-matrix-text-dim">
                  {costSummary.totalTokens.toLocaleString()} tokens
                </span>
              </div>
            </div>
          </div>

          {/* Performance Timing */}
          <div className="glass-card p-3">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-blue-400" />
              <span className="text-sm font-semibold text-matrix-text">Avg Latency</span>
            </div>
            <PerformanceCard
              embedding={avgPerformance.embeddingMs}
              retrieval={avgPerformance.retrievalMs}
              generation={avgPerformance.generationMs}
              total={avgPerformance.totalMs}
            />
          </div>
        </div>

        {/* Top Keywords */}
        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-matrix-accent" />
            <span className="text-sm font-semibold text-matrix-text">Top Keywords</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topKeywords.length === 0 ? (
              <span className="text-xs text-matrix-text-dim italic">
                Brak zebranych slow kluczowych
              </span>
            ) : (
              topKeywords.map(({ keyword, count }) => (
                <span
                  key={keyword}
                  className="px-2 py-1 text-xs bg-matrix-accent/10 text-matrix-accent rounded border border-matrix-accent/20"
                >
                  {keyword}
                  <span className="ml-1 text-matrix-text-dim">({count})</span>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-matrix-accent" />
            <span className="text-sm font-semibold text-matrix-text">Recent Activity</span>
          </div>
          <ActivityList activities={recentActivity} />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-matrix-border text-[10px] text-matrix-text-dim flex justify-between">
        <span>Analytics & Monitoring v1.0</span>
        <span>Block 9: AI Learning System</span>
      </div>
    </div>
  );
}

export default LearningDashboard;
