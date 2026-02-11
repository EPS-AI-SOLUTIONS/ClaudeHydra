/**
 * Task Queue Visualization Panel
 * Displays queued tasks with progress bars for Debug LiveView
 */

import { CheckCircle, Clock, ListTodo, Loader2, XCircle } from 'lucide-react';

interface Task {
  id: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  startedAt?: number;
  completedAt?: number;
}

interface TaskQueuePanelProps {
  activeTasks: number;
  queuedTasks: number;
  completedTasks: number;
}

export function TaskQueuePanel({ activeTasks, queuedTasks, completedTasks }: TaskQueuePanelProps) {
  // Generate mock tasks for visualization
  const tasks: Task[] = [
    ...Array(activeTasks)
      .fill(null)
      .map((_, i) => ({
        id: `active-${i}`,
        name: `Task ${i + 1}`,
        status: 'running' as const,
        progress: Math.random() * 80 + 10,
      })),
    ...Array(Math.min(queuedTasks, 5))
      .fill(null)
      .map((_, i) => ({
        id: `queued-${i}`,
        name: `Queued ${i + 1}`,
        status: 'queued' as const,
        progress: 0,
      })),
  ];

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 size={12} className="animate-spin text-yellow-400" />;
      case 'queued':
        return <Clock size={12} className="text-gray-400" />;
      case 'completed':
        return <CheckCircle size={12} className="text-green-400" />;
      case 'failed':
        return <XCircle size={12} className="text-red-400" />;
    }
  };

  const totalCapacity = Math.max(activeTasks + queuedTasks, 10);
  const utilizationPercent = (activeTasks / totalCapacity) * 100;

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListTodo size={14} className="text-matrix-accent" />
          <span className="text-sm font-semibold text-matrix-text">Task Queue</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-yellow-400">● {activeTasks} active</span>
          <span className="text-gray-400">○ {queuedTasks} queued</span>
          <span className="text-green-400">✓ {completedTasks} done</span>
        </div>
      </div>

      {/* Utilization bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[9px] text-matrix-text-dim mb-1">
          <span>Queue Utilization</span>
          <span>{utilizationPercent.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-matrix-bg-primary/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-300"
            style={{ width: `${utilizationPercent}%` }}
          />
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-1.5 max-h-24 overflow-auto">
        {tasks.length === 0 ? (
          <div className="text-center text-xs text-matrix-text-dim py-2">No tasks</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2">
              {getStatusIcon(task.status)}
              <span className="text-[10px] text-matrix-text flex-1 truncate">{task.name}</span>
              {task.status === 'running' && (
                <div className="w-16 h-1.5 bg-matrix-bg-primary/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TaskQueuePanel;
