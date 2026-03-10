// src/features/delegations/hooks/useDelegations.ts
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { apiGet, BASE_URL } from '@/shared/api/client';

export interface DelegationTask {
  id: string;
  agent_name: string;
  agent_tier: string;
  task_prompt: string;
  model_used: string;
  status: string;
  result_preview: string | null;
  call_depth: number;
  duration_ms: number | null;
  is_error: boolean;
  created_at: string;
  completed_at: string | null;
}

interface DelegationStats {
  total: number;
  completed: number;
  errors: number;
  avg_duration_ms: number | null;
}

interface DelegationsResponse {
  tasks: DelegationTask[];
  stats: DelegationStats;
}

interface DelegationStore {
  data: DelegationsResponse | null;
  isLoading: boolean;
  isError: boolean;
  fetchInitial: () => Promise<void>;
  updateFromSSE: (task: DelegationTask) => void;
}

const useDelegationStore = create<DelegationStore>((set) => ({
  data: null,
  isLoading: true,
  isError: false,
  fetchInitial: async () => {
    set({ isLoading: true, isError: false });
    try {
      const data = await apiGet<DelegationsResponse>('/api/agents/delegations');
      set({ data, isLoading: false, isError: false });
    } catch (error) {
      set({ isError: true, isLoading: false });
    }
  },
  updateFromSSE: (newTask: DelegationTask) =>
    set((state) => {
      if (!state.data) return state;

      const tasks = [...state.data.tasks];
      const index = tasks.findIndex((t) => t.id === newTask.id);

      if (index >= 0) {
        tasks[index] = newTask;
      } else {
        tasks.unshift(newTask);
        toast.info(`New Delegation: ${newTask.agent_name}`, {
          description:
            newTask.task_prompt.length > 60 ? newTask.task_prompt.substring(0, 60) + '...' : newTask.task_prompt,
        });
      }

      // Re-sort tasks by created_at DESC to maintain order
      tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Recalculate stats
      let completed = 0;
      let errors = 0;
      let totalDuration = 0;
      let completedWithDuration = 0;

      for (const t of tasks) {
        if (t.status === 'completed' && !t.is_error) completed++;
        if (t.is_error) errors++;
        if (t.duration_ms != null) {
          totalDuration += t.duration_ms;
          completedWithDuration++;
        }
      }

      return {
        data: {
          tasks,
          stats: {
            total: tasks.length,
            completed,
            errors,
            avg_duration_ms: completedWithDuration > 0 ? totalDuration / completedWithDuration : null,
          },
        },
      };
    }),
}));

export function useDelegations(autoRefresh: boolean) {
  const data = useDelegationStore((state) => state.data);
  const isLoading = useDelegationStore((state) => state.isLoading);
  const isError = useDelegationStore((state) => state.isError);
  const fetchInitial = useDelegationStore((state) => state.fetchInitial);
  const updateFromSSE = useDelegationStore((state) => state.updateFromSSE);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetHeartbeat = useCallback((eventSource: EventSource) => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      console.warn('[SSE] Delegations Heartbeat lost. Forcing reconnect...');
      eventSource.close();
      // Normally here you would trigger a reconnect logic by changing a state
    }, 15000);
  }, []);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (!autoRefresh) return;

    const eventSource = new EventSource(`${BASE_URL}/api/agents/delegations/stream`);

    eventSource.onopen = () => {
      resetHeartbeat(eventSource);
    };

    eventSource.onmessage = (event) => {
      resetHeartbeat(eventSource);
      if (event.data === 'ping') return;
      try {
        const task = JSON.parse(event.data) as DelegationTask;
        updateFromSSE(task);
      } catch (e) {
        console.error('Failed to parse SSE message', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
    };

    return () => {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      eventSource.close();
    };
  }, [autoRefresh, updateFromSSE, resetHeartbeat]);

  return {
    data,
    isLoading,
    isError,
    refetch: fetchInitial,
  };
}
