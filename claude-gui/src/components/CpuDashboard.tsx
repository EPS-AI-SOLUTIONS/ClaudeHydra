/**
 * CPU Performance Dashboard
 *
 * Monitoruje wykorzystanie Worker Pool i wydajność CPU w czasie rzeczywistym.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Activity, BarChart3, Cpu, Gauge, Play, Square, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useWorker } from '../hooks/useWorker';
import { getWorkerPool, type WorkerTask } from '../utils/workerPool';

interface WorkerStats {
  id: number;
  busy: boolean;
  tasksCompleted: number;
  avgTime: number;
}

export function CpuDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<{
    poolSize: number;
    busyWorkers: number;
    queueLength: number;
    workers: WorkerStats[];
  } | null>(null);

  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkResults, setBenchmarkResults] = useState<{
    sequential: number;
    parallel: number;
    speedup: number;
  } | null>(null);

  const { executeBatch, progress } = useWorker();

  // Update stats every 500ms
  useEffect(() => {
    const pool = getWorkerPool();
    const interval = setInterval(() => {
      setStats(pool.getStats());
    }, 500);

    // Initial stats
    setStats(pool.getStats());

    return () => clearInterval(interval);
  }, []);

  // Run benchmark
  const runBenchmark = useCallback(async () => {
    setBenchmarkRunning(true);
    setBenchmarkResults(null);

    const tasks: WorkerTask[] = Array.from({ length: 12 }, (_, i) => ({
      type: 'prime' as const,
      iterations: 10000 + i * 1000,
    }));

    // Sequential (simulate with delay)
    const seqStart = performance.now();
    for (const task of tasks.slice(0, 4)) {
      await getWorkerPool().execute(task);
    }
    const seqTime = performance.now() - seqStart;

    // Parallel
    const parStart = performance.now();
    await executeBatch(tasks);
    const parTime = performance.now() - parStart;

    setBenchmarkResults({
      sequential: Math.round(seqTime),
      parallel: Math.round(parTime),
      speedup: Number((seqTime / parTime).toFixed(2)),
    });
    setBenchmarkRunning(false);
  }, [executeBatch]);

  const cpuCores = navigator.hardwareConcurrency || 4;
  const utilizationPercent = stats ? Math.round((stats.busyWorkers / stats.poolSize) * 100) : 0;

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 p-3 rounded-full bg-emerald-500/20 border border-emerald-500/30
                   hover:bg-emerald-500/30 transition-colors z-50 backdrop-blur-sm"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        title="CPU Dashboard"
      >
        <Cpu className="w-5 h-5 text-emerald-400" />
        {stats && stats.busyWorkers > 0 && (
          <motion.span
            className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          />
        )}
      </motion.button>

      {/* Dashboard panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed right-4 bottom-20 w-80 bg-black/90 border border-emerald-500/30
                       rounded-lg backdrop-blur-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-emerald-500/20">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-matrix-text">CPU Dashboard</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-emerald-500/20 rounded transition-colors"
              >
                <Square className="w-3 h-3 text-emerald-400" />
              </button>
            </div>

            {/* Stats */}
            <div className="p-3 space-y-3">
              {/* CPU Info */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Dostępne rdzenie:</span>
                <span className="text-matrix-text font-mono">{cpuCores}</span>
              </div>

              {/* Worker Pool */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Worker Pool:</span>
                  <span className="text-matrix-text font-mono">
                    {stats?.busyWorkers ?? 0}/{stats?.poolSize ?? 0} aktywnych
                  </span>
                </div>

                {/* Utilization bar */}
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 to-green-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${utilizationPercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="text-right text-xs text-gray-500">
                  {utilizationPercent}% wykorzystania
                </div>
              </div>

              {/* Queue */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Kolejka zadań:</span>
                <span className="text-yellow-400 font-mono">{stats?.queueLength ?? 0}</span>
              </div>

              {/* Worker details */}
              <div className="space-y-1">
                <div className="text-xs text-gray-400 mb-1">Workery:</div>
                <div className="grid grid-cols-6 gap-1">
                  {stats?.workers.map((w) => (
                    <motion.div
                      key={w.id}
                      className={`h-6 rounded flex items-center justify-center text-xs font-mono
                        ${
                          w.busy
                            ? 'bg-emerald-500/40 border border-emerald-400/50 text-emerald-300'
                            : 'bg-gray-800 border border-gray-700 text-gray-500'
                        }`}
                      animate={
                        w.busy
                          ? {
                              boxShadow: [
                                '0 0 0 0 rgba(16, 185, 129, 0)',
                                '0 0 8px 2px rgba(16, 185, 129, 0.3)',
                                '0 0 0 0 rgba(16, 185, 129, 0)',
                              ],
                            }
                          : {}
                      }
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      title={`Worker ${w.id}: ${w.tasksCompleted} tasks, avg ${w.avgTime}ms`}
                    >
                      {w.id}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Benchmark */}
              <div className="pt-2 border-t border-emerald-500/20">
                <button
                  type="button"
                  onClick={runBenchmark}
                  disabled={benchmarkRunning}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3
                             bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50
                             border border-emerald-500/30 rounded text-xs text-matrix-text
                             transition-colors"
                >
                  {benchmarkRunning ? (
                    <>
                      <Activity className="w-3 h-3 animate-pulse" />
                      Benchmark... {progress}%
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      Uruchom Benchmark
                    </>
                  )}
                </button>

                {benchmarkResults && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 p-2 bg-emerald-500/10 rounded border border-emerald-500/20"
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-gray-400">Sekwencyjnie:</div>
                        <div className="text-red-400 font-mono">
                          {benchmarkResults.sequential}ms
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Równolegle:</div>
                        <div className="text-matrix-text font-mono">
                          {benchmarkResults.parallel}ms
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs">
                      <Zap className="w-3 h-3 text-yellow-400" />
                      <span className="text-yellow-400 font-bold">
                        {benchmarkResults.speedup}x szybciej!
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Stats summary */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-500/20">
                <div className="text-center">
                  <Gauge className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                  <div className="text-xs text-gray-400">Tasks</div>
                  <div className="text-sm font-mono text-matrix-text">
                    {stats?.workers.reduce((sum, w) => sum + w.tasksCompleted, 0) ?? 0}
                  </div>
                </div>
                <div className="text-center">
                  <Activity className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                  <div className="text-xs text-gray-400">Avg</div>
                  <div className="text-sm font-mono text-matrix-text">
                    {Math.round(
                      (stats?.workers.reduce((sum, w) => sum + w.avgTime, 0) ?? 0) /
                        (stats?.poolSize ?? 1),
                    )}
                    ms
                  </div>
                </div>
                <div className="text-center">
                  <BarChart3 className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                  <div className="text-xs text-gray-400">Pool</div>
                  <div className="text-sm font-mono text-matrix-text">{stats?.poolSize ?? 0}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default CpuDashboard;
