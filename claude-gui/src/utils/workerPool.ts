/**
 * Worker Pool Manager - wykorzystaj wszystkie rdzenie CPU!
 *
 * Automatycznie tworzy pulę workerów (domyślnie = navigator.hardwareConcurrency)
 * i dystrybuuje zadania round-robin z kolejką priorytetową.
 */

export type WorkerTask =
  | { type: 'prime'; iterations: number }
  | { type: 'hash'; data: string }
  | { type: 'sort'; data: number[] }
  | { type: 'search'; data: string[]; query: string }
  | { type: 'markdown'; content: string }
  | { type: 'json'; data: string };

export type WorkerResult<T = unknown> =
  | { status: 'success'; value: T; workerId: number; duration: number }
  | { status: 'error'; message: string; workerId: number }
  | { status: 'progress'; value: number; workerId: number };

interface QueuedTask {
  task: WorkerTask;
  priority: number;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface WorkerInfo {
  worker: Worker;
  id: number;
  busy: boolean;
  tasksCompleted: number;
  totalTime: number;
}

class WorkerPool {
  private workers: WorkerInfo[] = [];
  private queue: QueuedTask[] = [];
  private poolSize: number;
  private onProgress?: (workerId: number, progress: number) => void;

  constructor(size?: number) {
    // Użyj wszystkich dostępnych rdzeni minus 1 (dla UI thread)
    this.poolSize = size ?? Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(new URL('../workers/heavyComputation.worker.ts', import.meta.url), {
        type: 'module',
      });

      this.workers.push({
        worker,
        id: i,
        busy: false,
        tasksCompleted: 0,
        totalTime: 0,
      });
    }
    console.log(
      `[WorkerPool] Initialized ${this.poolSize} workers (${navigator.hardwareConcurrency} cores available)`,
    );
  }

  /**
   * Wykonaj zadanie z priorytetem (wyższy = ważniejszy)
   */
  async execute<T = unknown>(task: WorkerTask, priority = 5): Promise<WorkerResult<T>> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        priority,
        resolve: resolve as (result: WorkerResult) => void,
        reject,
        timestamp: Date.now(),
      });

      // Sortuj kolejkę według priorytetu (malejąco)
      this.queue.sort((a, b) => b.priority - a.priority);

      this.processQueue();
    });
  }

  /**
   * Wykonaj wiele zadań równolegle
   */
  async executeAll<T = unknown>(tasks: WorkerTask[], priority = 5): Promise<WorkerResult<T>[]> {
    return Promise.all(tasks.map((task) => this.execute<T>(task, priority)));
  }

  /**
   * Wykonaj batch z limitem równoległości
   */
  async executeBatch<T = unknown>(
    tasks: WorkerTask[],
    batchSize?: number,
    onBatchProgress?: (completed: number, total: number) => void,
  ): Promise<WorkerResult<T>[]> {
    const effectiveBatchSize = batchSize ?? this.poolSize;
    const results: WorkerResult<T>[] = [];

    for (let i = 0; i < tasks.length; i += effectiveBatchSize) {
      const batch = tasks.slice(i, i + effectiveBatchSize);
      const batchResults = await this.executeAll<T>(batch);
      results.push(...batchResults);
      onBatchProgress?.(Math.min(i + effectiveBatchSize, tasks.length), tasks.length);
    }

    return results;
  }

  private processQueue(): void {
    const availableWorker = this.workers.find((w) => !w.busy);
    if (!availableWorker || this.queue.length === 0) return;

    const queuedTask = this.queue.shift()!;
    availableWorker.busy = true;
    const startTime = Date.now();

    const handleMessage = (e: MessageEvent) => {
      const data = e.data;

      if (data.type === 'progress') {
        this.onProgress?.(availableWorker.id, data.value);
        queuedTask.resolve({
          status: 'progress',
          value: data.value,
          workerId: availableWorker.id,
        });
        return; // Don't cleanup on progress, wait for result
      }

      // Cleanup
      availableWorker.worker.removeEventListener('message', handleMessage);
      availableWorker.worker.removeEventListener('error', handleError);
      availableWorker.busy = false;

      const duration = Date.now() - startTime;
      availableWorker.tasksCompleted++;
      availableWorker.totalTime += duration;

      if (data.type === 'result') {
        queuedTask.resolve({
          status: 'success',
          value: data.value,
          workerId: availableWorker.id,
          duration,
        });
      } else if (data.type === 'error') {
        queuedTask.resolve({
          status: 'error',
          message: data.message,
          workerId: availableWorker.id,
        });
      }

      // Process next task in queue
      this.processQueue();
    };

    const handleError = (error: ErrorEvent) => {
      availableWorker.worker.removeEventListener('message', handleMessage);
      availableWorker.worker.removeEventListener('error', handleError);
      availableWorker.busy = false;

      queuedTask.reject(new Error(error.message));
      this.processQueue();
    };

    availableWorker.worker.addEventListener('message', handleMessage);
    availableWorker.worker.addEventListener('error', handleError);
    availableWorker.worker.postMessage(queuedTask.task);
  }

  /**
   * Ustaw callback dla progress updates
   */
  setProgressHandler(handler: (workerId: number, progress: number) => void): void {
    this.onProgress = handler;
  }

  /**
   * Pobierz statystyki puli
   */
  getStats(): {
    poolSize: number;
    busyWorkers: number;
    queueLength: number;
    workers: Array<{ id: number; busy: boolean; tasksCompleted: number; avgTime: number }>;
  } {
    return {
      poolSize: this.poolSize,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queueLength: this.queue.length,
      workers: this.workers.map((w) => ({
        id: w.id,
        busy: w.busy,
        tasksCompleted: w.tasksCompleted,
        avgTime: w.tasksCompleted > 0 ? Math.round(w.totalTime / w.tasksCompleted) : 0,
      })),
    };
  }

  /**
   * Zakończ wszystkie workery
   */
  terminate(): void {
    this.workers.forEach((w) => w.worker.terminate());
    this.workers = [];
    this.queue = [];
    console.log('[WorkerPool] Terminated all workers');
  }

  /**
   * Skaluj pulę (dodaj/usuń workery)
   */
  resize(newSize: number): void {
    const currentSize = this.workers.length;

    if (newSize > currentSize) {
      // Dodaj nowe workery
      for (let i = currentSize; i < newSize; i++) {
        const worker = new Worker(
          new URL('../workers/heavyComputation.worker.ts', import.meta.url),
          { type: 'module' },
        );
        this.workers.push({
          worker,
          id: i,
          busy: false,
          tasksCompleted: 0,
          totalTime: 0,
        });
      }
    } else if (newSize < currentSize) {
      // Usuń nadmiarowe workery (tylko te, które nie są busy)
      const toRemove = this.workers.filter((w) => !w.busy).slice(0, currentSize - newSize);

      toRemove.forEach((w) => {
        w.worker.terminate();
        const idx = this.workers.indexOf(w);
        if (idx !== -1) this.workers.splice(idx, 1);
      });
    }

    this.poolSize = this.workers.length;
    console.log(`[WorkerPool] Resized to ${this.poolSize} workers`);
  }
}

// Singleton instance
let poolInstance: WorkerPool | null = null;

export function getWorkerPool(size?: number): WorkerPool {
  if (!poolInstance) {
    poolInstance = new WorkerPool(size);
  }
  return poolInstance;
}

export function terminateWorkerPool(): void {
  poolInstance?.terminate();
  poolInstance = null;
}

export { WorkerPool };
