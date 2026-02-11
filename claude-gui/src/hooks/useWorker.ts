/**
 * useWorker - React Hook dla Worker Pool
 *
 * Automatycznie wykorzystuje pulę workerów do ciężkich obliczeń
 * bez blokowania UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWorkerPool,
  terminateWorkerPool,
  type WorkerResult,
  type WorkerTask,
} from '../utils/workerPool';

interface UseWorkerOptions {
  /** Priorytet zadania (1-10, wyższy = ważniejszy) */
  priority?: number;
  /** Callback dla progress updates */
  onProgress?: (progress: number) => void;
  /** Auto-cleanup przy unmount */
  autoCleanup?: boolean;
}

interface UseWorkerReturn<T> {
  /** Wykonaj pojedyncze zadanie */
  execute: (task: WorkerTask) => Promise<WorkerResult<T>>;
  /** Wykonaj wiele zadań równolegle */
  executeAll: (tasks: WorkerTask[]) => Promise<WorkerResult<T>[]>;
  /** Wykonaj batch z limitem */
  executeBatch: (tasks: WorkerTask[], batchSize?: number) => Promise<WorkerResult<T>[]>;
  /** Czy trwa wykonywanie */
  isLoading: boolean;
  /** Postęp (0-100) */
  progress: number;
  /** Ostatni błąd */
  error: string | null;
  /** Ostatni wynik */
  result: T | null;
  /** Statystyki puli */
  stats: ReturnType<typeof getWorkerPool>['getStats'] extends () => infer R ? R : never;
}

export function useWorker<T = unknown>(options: UseWorkerOptions = {}): UseWorkerReturn<T> {
  const { priority = 5, onProgress, autoCleanup = false } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [stats, setStats] = useState(() => getWorkerPool().getStats());

  const poolRef = useRef(getWorkerPool());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Setup progress handler
    poolRef.current.setProgressHandler((_, prog) => {
      if (mountedRef.current) {
        setProgress(prog);
        onProgress?.(prog);
      }
    });

    // Update stats periodically
    const interval = setInterval(() => {
      if (mountedRef.current) {
        setStats(poolRef.current.getStats());
      }
    }, 1000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      if (autoCleanup) {
        terminateWorkerPool();
      }
    };
  }, [onProgress, autoCleanup]);

  const execute = useCallback(
    async (task: WorkerTask): Promise<WorkerResult<T>> => {
      setIsLoading(true);
      setError(null);
      setProgress(0);

      try {
        const res = await poolRef.current.execute<T>(task, priority);

        if (mountedRef.current) {
          if (res.status === 'success') {
            setResult(res.value);
            setProgress(100);
          } else if (res.status === 'error') {
            setError(res.message);
          }
          setIsLoading(false);
          setStats(poolRef.current.getStats());
        }

        return res;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setError(message);
          setIsLoading(false);
        }
        return { status: 'error', message, workerId: -1 };
      }
    },
    [priority],
  );

  const executeAll = useCallback(
    async (tasks: WorkerTask[]): Promise<WorkerResult<T>[]> => {
      setIsLoading(true);
      setError(null);
      setProgress(0);

      try {
        const results = await poolRef.current.executeAll<T>(tasks, priority);

        if (mountedRef.current) {
          const successResults = results.filter((r) => r.status === 'success');
          if (successResults.length > 0) {
            setResult((successResults[successResults.length - 1] as { value: T }).value);
          }
          setProgress(100);
          setIsLoading(false);
          setStats(poolRef.current.getStats());
        }

        return results;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setError(message);
          setIsLoading(false);
        }
        return [{ status: 'error', message, workerId: -1 }];
      }
    },
    [priority],
  );

  const executeBatch = useCallback(
    async (tasks: WorkerTask[], batchSize?: number): Promise<WorkerResult<T>[]> => {
      setIsLoading(true);
      setError(null);
      setProgress(0);

      try {
        const results = await poolRef.current.executeBatch<T>(
          tasks,
          batchSize,
          (completed, total) => {
            if (mountedRef.current) {
              setProgress(Math.round((completed / total) * 100));
            }
          },
        );

        if (mountedRef.current) {
          setProgress(100);
          setIsLoading(false);
          setStats(poolRef.current.getStats());
        }

        return results;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setError(message);
          setIsLoading(false);
        }
        return [{ status: 'error', message, workerId: -1 }];
      }
    },
    [],
  );

  return {
    execute,
    executeAll,
    executeBatch,
    isLoading,
    progress,
    error,
    result,
    stats,
  };
}

/**
 * Hook do fuzzy search z workerem
 */
export function useWorkerSearch(data: string[]) {
  const { execute, isLoading, result, error } = useWorker<Array<{ item: string; score: number }>>();

  const search = useCallback(
    async (query: string) => {
      if (!query.trim() || data.length === 0) return [];
      return execute({ type: 'search', data, query });
    },
    [data, execute],
  );

  return { search, isLoading, results: result ?? [], error };
}

/**
 * Hook do sortowania z workerem
 */
export function useWorkerSort() {
  const { execute, isLoading, result, error } = useWorker<number[]>();

  const sort = useCallback(
    async (data: number[]) => {
      return execute({ type: 'sort', data });
    },
    [execute],
  );

  return { sort, isLoading, sorted: result ?? [], error };
}

/**
 * Hook do hashowania z workerem
 */
export function useWorkerHash() {
  const { execute, isLoading, result, error } = useWorker<number>();

  const hash = useCallback(
    async (data: string) => {
      return execute({ type: 'hash', data });
    },
    [execute],
  );

  return { hash, isLoading, hashValue: result, error };
}
