import { Grid } from 'lucide-react';
import { useMemo } from 'react';

interface HeatmapCell {
  hour: number;
  minute: number;
  value: number;
}

interface PerformanceHeatmapProps {
  ipcCallsPerSec: number;
  eventsPerSec: number;
  avgLatency: number;
}

export function PerformanceHeatmap({
  ipcCallsPerSec,
  eventsPerSec,
  avgLatency,
}: PerformanceHeatmapProps) {
  // Generate mock heatmap data (in real app, this would come from backend)
  const heatmapData = useMemo(() => {
    const data: HeatmapCell[] = [];
    const now = new Date();
    const currentHour = now.getHours();

    // Generate data for last 6 hours, 10-minute buckets
    for (let h = 0; h < 6; h++) {
      for (let m = 0; m < 6; m++) {
        data.push({
          hour: (currentHour - 5 + h + 24) % 24,
          minute: m * 10,
          value: Math.random() * (ipcCallsPerSec + 1) * 10,
        });
      }
    }
    return data;
  }, [ipcCallsPerSec]);

  const maxValue = Math.max(...heatmapData.map((d) => d.value), 1);

  const getColor = (value: number) => {
    const intensity = value / maxValue;
    if (intensity < 0.2) return 'bg-green-900/30';
    if (intensity < 0.4) return 'bg-green-700/40';
    if (intensity < 0.6) return 'bg-yellow-600/50';
    if (intensity < 0.8) return 'bg-orange-500/60';
    return 'bg-red-500/70';
  };

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Grid size={14} className="text-matrix-accent" />
          <span className="text-sm font-semibold text-matrix-text">Performance Heatmap</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-matrix-text-dim">
          <span>Low</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded-sm bg-green-900/30" />
            <div className="w-3 h-3 rounded-sm bg-green-700/40" />
            <div className="w-3 h-3 rounded-sm bg-yellow-600/50" />
            <div className="w-3 h-3 rounded-sm bg-orange-500/60" />
            <div className="w-3 h-3 rounded-sm bg-red-500/70" />
          </div>
          <span>High</span>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="grid grid-cols-6 gap-0.5">
        {heatmapData.map((cell, i) => (
          <div
            key={i}
            className={`h-4 rounded-sm ${getColor(cell.value)} transition-colors duration-200 hover:ring-1 hover:ring-matrix-accent`}
            title={`${cell.hour}:${String(cell.minute).padStart(2, '0')} - ${cell.value.toFixed(1)} calls`}
          />
        ))}
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1 text-[8px] text-matrix-text-dim font-mono">
        {Array.from({ length: 6 }, (_, i) => {
          const hour = (new Date().getHours() - 5 + i + 24) % 24;
          return <span key={i}>{String(hour).padStart(2, '0')}:00</span>;
        })}
      </div>

      {/* Stats row */}
      <div className="flex justify-around mt-3 pt-2 border-t border-matrix-border/30 text-[10px]">
        <div className="text-center">
          <div className="text-matrix-accent font-mono">{ipcCallsPerSec.toFixed(1)}</div>
          <div className="text-matrix-text-dim">IPC/sec</div>
        </div>
        <div className="text-center">
          <div className="text-blue-400 font-mono">{eventsPerSec.toFixed(1)}</div>
          <div className="text-matrix-text-dim">Events/sec</div>
        </div>
        <div className="text-center">
          <div className="text-yellow-400 font-mono">{avgLatency.toFixed(1)}ms</div>
          <div className="text-matrix-text-dim">Avg Latency</div>
        </div>
      </div>
    </div>
  );
}
