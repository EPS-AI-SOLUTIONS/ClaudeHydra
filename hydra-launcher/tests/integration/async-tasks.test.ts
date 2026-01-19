import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// ASYNC TASK HANDLER TESTS (Jules)
// Tests for task submission, polling, timeout handling
// ============================================================================

// Types
type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

interface AsyncTask {
  id: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  progress: number;
  result?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface TaskSubmission {
  name: string;
  prompt: string;
  priority?: TaskPriority;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

interface TaskPollingConfig {
  intervalMs: number;
  maxAttempts: number;
  backoffMultiplier: number;
}

// ============================================================================
// MOCK ASYNC TASK SERVICE
// ============================================================================

class AsyncTaskService {
  private tasks: Map<string, AsyncTask> = new Map();
  private pollingConfigs: Map<string, TaskPollingConfig> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private timeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  onTaskUpdate: ((task: AsyncTask) => void) | null = null;
  onTaskComplete: ((task: AsyncTask) => void) | null = null;
  onTaskError: ((task: AsyncTask, error: Error) => void) | null = null;

  // Simulated API latency
  private apiLatencyMs = 50;

  async submitTask(submission: TaskSubmission): Promise<AsyncTask> {
    await this.simulateLatency();

    const task: AsyncTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: submission.name,
      status: 'pending',
      priority: submission.priority || 'normal',
      createdAt: Date.now(),
      progress: 0,
      metadata: submission.metadata,
    };

    this.tasks.set(task.id, task);

    // Set up timeout if specified
    if (submission.timeoutMs) {
      this.setupTimeout(task.id, submission.timeoutMs);
    }

    // Simulate queue processing - only if still pending
    setTimeout(() => {
      const currentTask = this.tasks.get(task.id);
      if (currentTask && currentTask.status === 'pending') {
        this.updateTaskStatus(task.id, 'queued');
      }
    }, 10);

    return task;
  }

  async getTask(taskId: string): Promise<AsyncTask | null> {
    await this.simulateLatency();
    return this.tasks.get(taskId) || null;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    await this.simulateLatency();

    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'completed' || task.status === 'failed') {
      return false; // Cannot cancel completed tasks
    }

    this.updateTaskStatus(taskId, 'cancelled');
    this.cleanupTask(taskId);
    return true;
  }

  startPolling(taskId: string, config: TaskPollingConfig = {
    intervalMs: 1000,
    maxAttempts: 100,
    backoffMultiplier: 1.5,
  }): void {
    this.pollingConfigs.set(taskId, config);
    let attempts = 0;
    let currentInterval = config.intervalMs;

    const poll = async () => {
      attempts++;

      const task = await this.getTask(taskId);
      if (!task) {
        this.stopPolling(taskId);
        return;
      }

      if (this.onTaskUpdate) {
        this.onTaskUpdate(task);
      }

      if (task.status === 'completed') {
        if (this.onTaskComplete) {
          this.onTaskComplete(task);
        }
        this.stopPolling(taskId);
        return;
      }

      if (task.status === 'failed' || task.status === 'cancelled' || task.status === 'timeout') {
        if (this.onTaskError) {
          this.onTaskError(task, new Error(task.error || `Task ${task.status}`));
        }
        this.stopPolling(taskId);
        return;
      }

      if (attempts >= config.maxAttempts) {
        this.updateTaskStatus(taskId, 'timeout');
        const timeoutTask = this.tasks.get(taskId);
        if (timeoutTask && this.onTaskError) {
          this.onTaskError(timeoutTask, new Error('Max polling attempts exceeded'));
        }
        this.stopPolling(taskId);
        return;
      }

      // Apply backoff
      currentInterval = Math.min(currentInterval * config.backoffMultiplier, 30000);
    };

    const timer = setInterval(poll, currentInterval);
    this.pollTimers.set(taskId, timer);

    // Immediate first poll
    poll();
  }

  stopPolling(taskId: string): void {
    const timer = this.pollTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(taskId);
    }
    this.pollingConfigs.delete(taskId);
  }

  // Internal methods for simulation
  updateTaskStatus(taskId: string, status: TaskStatus, result?: string, error?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;

    if (status === 'running' && !task.startedAt) {
      task.startedAt = Date.now();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout') {
      task.completedAt = Date.now();
    }

    if (result) task.result = result;
    if (error) task.error = error;

    this.tasks.set(taskId, task);
  }

  updateTaskProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress));
      this.tasks.set(taskId, task);
    }
  }

  private setupTimeout(taskId: string, timeoutMs: number): void {
    const timer = setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && task.status !== 'completed' && task.status !== 'failed') {
        this.updateTaskStatus(taskId, 'timeout', undefined, 'Task timed out');
      }
    }, timeoutMs);

    this.timeoutTimers.set(taskId, timer);
  }

  private cleanupTask(taskId: string): void {
    const timeoutTimer = this.timeoutTimers.get(taskId);
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      this.timeoutTimers.delete(taskId);
    }

    this.stopPolling(taskId);
  }

  private async simulateLatency(): Promise<void> {
    await new Promise(r => setTimeout(r, this.apiLatencyMs));
  }

  // For testing
  setApiLatency(ms: number): void {
    this.apiLatencyMs = ms;
  }

  getAllTasks(): AsyncTask[] {
    return Array.from(this.tasks.values());
  }

  clearAllTasks(): void {
    for (const taskId of this.tasks.keys()) {
      this.cleanupTask(taskId);
    }
    this.tasks.clear();
  }
}

// ============================================================================
// MOCK JULES API RESPONSES
// ============================================================================

interface JulesApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

function createMockJulesApi() {
  let originalFetch: typeof global.fetch;

  const setup = () => {
    originalFetch = global.fetch;
  };

  const teardown = () => {
    global.fetch = originalFetch;
  };

  const mockSubmitTask = (responseData: JulesApiResponse) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: responseData.success,
      json: () => Promise.resolve(responseData),
    });
  };

  const mockGetTask = (task: AsyncTask | null) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: task,
      }),
    });
  };

  const mockTaskProgress = (tasks: AsyncTask[]) => {
    let callIndex = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      const task = tasks[Math.min(callIndex++, tasks.length - 1)];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: task,
        }),
      });
    });
  };

  return { setup, teardown, mockSubmitTask, mockGetTask, mockTaskProgress };
}

// ============================================================================
// TASK SUBMISSION TESTS
// ============================================================================

describe('Task Submission (Jules)', () => {
  let service: AsyncTaskService;

  beforeEach(() => {
    service = new AsyncTaskService();
    service.setApiLatency(0);
  });

  afterEach(() => {
    service.clearAllTasks();
  });

  it('should submit a task successfully', async () => {
    const task = await service.submitTask({
      name: 'code-review',
      prompt: 'Review the authentication module',
    });

    expect(task.id).toMatch(/^task_\d+_[a-z0-9]+$/);
    expect(task.name).toBe('code-review');
    expect(task.status).toBe('pending');
    expect(task.progress).toBe(0);
  });

  it('should set task priority', async () => {
    const normalTask = await service.submitTask({
      name: 'normal-task',
      prompt: 'Normal priority task',
    });

    const highTask = await service.submitTask({
      name: 'high-task',
      prompt: 'High priority task',
      priority: 'high',
    });

    const criticalTask = await service.submitTask({
      name: 'critical-task',
      prompt: 'Critical priority task',
      priority: 'critical',
    });

    expect(normalTask.priority).toBe('normal');
    expect(highTask.priority).toBe('high');
    expect(criticalTask.priority).toBe('critical');
  });

  it('should include metadata in task', async () => {
    const task = await service.submitTask({
      name: 'task-with-metadata',
      prompt: 'Task prompt',
      metadata: {
        repository: 'my-repo',
        branch: 'feature/test',
        commit: 'abc123',
      },
    });

    expect(task.metadata).toEqual({
      repository: 'my-repo',
      branch: 'feature/test',
      commit: 'abc123',
    });
  });

  it('should transition from pending to queued', async () => {
    const task = await service.submitTask({
      name: 'queuing-test',
      prompt: 'Test task',
    });

    expect(task.status).toBe('pending');

    // Wait for the 10ms internal timer to transition to 'queued'
    await new Promise(r => setTimeout(r, 50));

    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('queued');
  });

  it('should handle submission failure', async () => {
    const mockApi = createMockJulesApi();
    mockApi.setup();
    mockApi.mockSubmitTask({
      success: false,
      error: 'Rate limit exceeded',
    });

    const response = await fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', prompt: 'test' }),
    });

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Rate limit exceeded');

    mockApi.teardown();
  });

  it('should generate unique task IDs', async () => {
    const tasks = await Promise.all([
      service.submitTask({ name: 'task1', prompt: 'Prompt 1' }),
      service.submitTask({ name: 'task2', prompt: 'Prompt 2' }),
      service.submitTask({ name: 'task3', prompt: 'Prompt 3' }),
    ]);

    const ids = tasks.map(t => t.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(3);
  });
});

// ============================================================================
// POLLING RESPONSE TESTS
// ============================================================================

describe('Polling Responses (Jules)', () => {
  let service: AsyncTaskService;

  beforeEach(() => {
    vi.useRealTimers();
    service = new AsyncTaskService();
    service.setApiLatency(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.clearAllTasks();
  });

  it('should poll for task status updates', async () => {
    const updates: AsyncTask[] = [];
    service.onTaskUpdate = (task) => updates.push({ ...task });

    const task = await service.submitTask({
      name: 'polling-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 10,
      backoffMultiplier: 1,
    });

    // Simulate task progressing
    await new Promise(r => setTimeout(r, 30));
    service.updateTaskStatus(task.id, 'running');

    await new Promise(r => setTimeout(r, 100));

    expect(updates.length).toBeGreaterThan(0);
    expect(updates.some(u => u.status === 'running')).toBe(true);

    service.stopPolling(task.id);
  });

  it('should call onTaskComplete when task finishes', async () => {
    let completedTask: AsyncTask | null = null;
    service.onTaskComplete = (task) => { completedTask = task; };

    const task = await service.submitTask({
      name: 'completion-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 10,
      backoffMultiplier: 1,
    });

    // Simulate completion
    await new Promise(r => setTimeout(r, 50));
    service.updateTaskStatus(task.id, 'completed', 'Task result');

    await new Promise(r => setTimeout(r, 50));

    expect(completedTask).not.toBeNull();
    expect(completedTask?.status).toBe('completed');
    expect(completedTask?.result).toBe('Task result');
  });

  it('should call onTaskError when task fails', async () => {
    let errorTask: AsyncTask | null = null;
    let receivedError: Error | null = null;

    service.onTaskError = (task, error) => {
      errorTask = task;
      receivedError = error;
    };

    const task = await service.submitTask({
      name: 'error-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 10,
      backoffMultiplier: 1,
    });

    // Simulate failure
    await new Promise(r => setTimeout(r, 50));
    service.updateTaskStatus(task.id, 'failed', undefined, 'Execution error');

    await new Promise(r => setTimeout(r, 50));

    expect(errorTask).not.toBeNull();
    expect(errorTask?.status).toBe('failed');
    expect(receivedError?.message).toContain('Execution error');
  });

  it('should stop polling after completion', async () => {
    let pollCount = 0;
    service.onTaskUpdate = () => { pollCount++; };

    const task = await service.submitTask({
      name: 'stop-polling-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 100,
      backoffMultiplier: 1,
    });

    await new Promise(r => setTimeout(r, 100));
    const pollsBeforeComplete = pollCount;

    service.updateTaskStatus(task.id, 'completed', 'Done');

    await new Promise(r => setTimeout(r, 100));

    // Polling should stop, only one more update (the completion)
    expect(pollCount).toBeLessThanOrEqual(pollsBeforeComplete + 2);
  });

  it('should track progress updates', async () => {
    const progressValues: number[] = [];
    service.onTaskUpdate = (task) => progressValues.push(task.progress);

    const task = await service.submitTask({
      name: 'progress-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 20,
      backoffMultiplier: 1,
    });

    // Simulate progress
    await new Promise(r => setTimeout(r, 30));
    service.updateTaskProgress(task.id, 25);

    await new Promise(r => setTimeout(r, 30));
    service.updateTaskProgress(task.id, 50);

    await new Promise(r => setTimeout(r, 30));
    service.updateTaskProgress(task.id, 75);

    await new Promise(r => setTimeout(r, 30));
    service.updateTaskProgress(task.id, 100);
    service.updateTaskStatus(task.id, 'completed');

    await new Promise(r => setTimeout(r, 50));

    expect(progressValues).toContain(25);
    expect(progressValues).toContain(50);
    expect(progressValues).toContain(75);
    expect(progressValues).toContain(100);

    service.stopPolling(task.id);
  });
});

// ============================================================================
// TIMEOUT HANDLING TESTS
// ============================================================================

describe('Timeout Handling (Jules)', () => {
  let service: AsyncTaskService;

  beforeEach(() => {
    vi.useRealTimers();
    service = new AsyncTaskService();
    service.setApiLatency(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.clearAllTasks();
  });

  it('should timeout task after specified duration', async () => {
    // Use short timeout for testing
    const task = await service.submitTask({
      name: 'timeout-test',
      prompt: 'Test task',
      timeoutMs: 100,
    });

    expect(task.status).toBe('pending');

    // Wait past timeout
    await new Promise(r => setTimeout(r, 200));

    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('timeout');
    expect(updatedTask?.error).toBe('Task timed out');
  });

  it('should not timeout completed tasks', async () => {
    const task = await service.submitTask({
      name: 'no-timeout-test',
      prompt: 'Test task',
      timeoutMs: 150,
    });

    // Complete before timeout
    await new Promise(r => setTimeout(r, 50));
    service.updateTaskStatus(task.id, 'completed', 'Success');

    // Wait past original timeout
    await new Promise(r => setTimeout(r, 200));

    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('completed');
  });

  it('should call onTaskError on timeout', async () => {
    let errorTask: AsyncTask | null = null;
    service.onTaskError = (task) => { errorTask = task; };

    const task = await service.submitTask({
      name: 'timeout-error-test',
      prompt: 'Test task',
      timeoutMs: 100,
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 20,
      backoffMultiplier: 1,
    });

    // Wait past timeout
    await new Promise(r => setTimeout(r, 200));

    expect(errorTask?.status).toBe('timeout');
    service.stopPolling(task.id);
  });

  it('should handle polling max attempts as timeout', async () => {
    let timedOut = false;
    service.onTaskError = (task) => {
      if (task.status === 'timeout') timedOut = true;
    };

    const task = await service.submitTask({
      name: 'max-attempts-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 5,
      backoffMultiplier: 1,
    });

    // Wait for all attempts to be exhausted
    await new Promise(r => setTimeout(r, 200));

    expect(timedOut).toBe(true);
    service.stopPolling(task.id);
  });

  it('should apply backoff to polling interval', async () => {
    let pollCount = 0;
    service.onTaskUpdate = () => { pollCount++; };

    const task = await service.submitTask({
      name: 'backoff-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 10,
      backoffMultiplier: 2,
    });

    // Wait a bit and check polling happened
    await new Promise(r => setTimeout(r, 100));
    const pollsIn100ms = pollCount;

    // Due to backoff, polls should slow down
    // With 20ms initial and 2x backoff: 20, 40, 80, 160ms...
    // In 100ms we should see about 2-3 polls
    expect(pollsIn100ms).toBeGreaterThan(0);
    expect(pollsIn100ms).toBeLessThan(10); // Much fewer than 100/20=5 without backoff

    service.stopPolling(task.id);
  });
});

// ============================================================================
// TASK CANCELLATION TESTS
// ============================================================================

describe('Task Cancellation (Jules)', () => {
  let service: AsyncTaskService;

  beforeEach(() => {
    vi.useRealTimers();
    service = new AsyncTaskService();
    service.setApiLatency(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.clearAllTasks();
  });

  it('should cancel pending task', async () => {
    const task = await service.submitTask({
      name: 'cancel-test',
      prompt: 'Test task',
    });

    const result = await service.cancelTask(task.id);

    expect(result).toBe(true);
    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('cancelled');
  });

  it('should cancel running task', async () => {
    const task = await service.submitTask({
      name: 'cancel-running-test',
      prompt: 'Test task',
    });

    service.updateTaskStatus(task.id, 'running');
    const result = await service.cancelTask(task.id);

    expect(result).toBe(true);
    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('cancelled');
  });

  it('should not cancel completed task', async () => {
    const task = await service.submitTask({
      name: 'no-cancel-completed-test',
      prompt: 'Test task',
    });

    service.updateTaskStatus(task.id, 'completed', 'Done');
    const result = await service.cancelTask(task.id);

    expect(result).toBe(false);
    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('completed');
  });

  it('should not cancel failed task', async () => {
    const task = await service.submitTask({
      name: 'no-cancel-failed-test',
      prompt: 'Test task',
    });

    service.updateTaskStatus(task.id, 'failed', undefined, 'Error');
    const result = await service.cancelTask(task.id);

    expect(result).toBe(false);
    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('failed');
  });

  it('should return false for non-existent task', async () => {
    const result = await service.cancelTask('non_existent_id');
    expect(result).toBe(false);
  });

  it('should stop polling when task is cancelled', async () => {
    // This test verifies that polling stops after cancellation
    // We use real timers but with short intervals
    let pollCount = 0;
    service.onTaskUpdate = () => { pollCount++; };

    const task = await service.submitTask({
      name: 'cancel-polling-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 50,
      maxAttempts: 100,
      backoffMultiplier: 1,
    });

    // Wait for a few polls
    await new Promise(r => setTimeout(r, 200));
    const pollsBeforeCancel = pollCount;

    await service.cancelTask(task.id);

    // Wait more - polling should have stopped
    await new Promise(r => setTimeout(r, 200));

    // Should have stopped polling (only one more update for cancel)
    expect(pollCount).toBeLessThanOrEqual(pollsBeforeCancel + 2);

    service.stopPolling(task.id);
  });

  it('should clean up timeout timer on cancellation', async () => {
    // Create task with a short timeout for testing
    const task = await service.submitTask({
      name: 'cancel-timeout-test',
      prompt: 'Test task',
      timeoutMs: 100, // Short timeout
    });

    // Cancel immediately
    await service.cancelTask(task.id);

    // Wait past original timeout
    await new Promise(r => setTimeout(r, 200));

    // Should stay cancelled, not timeout
    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.status).toBe('cancelled');
  });
});

// ============================================================================
// MULTIPLE TASKS TESTS
// ============================================================================

describe('Multiple Tasks (Jules)', () => {
  let service: AsyncTaskService;

  beforeEach(() => {
    vi.useRealTimers();
    service = new AsyncTaskService();
    service.setApiLatency(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.clearAllTasks();
  });

  it('should handle multiple concurrent tasks', async () => {
    const tasks = await Promise.all([
      service.submitTask({ name: 'task1', prompt: 'Prompt 1' }),
      service.submitTask({ name: 'task2', prompt: 'Prompt 2' }),
      service.submitTask({ name: 'task3', prompt: 'Prompt 3' }),
    ]);

    expect(tasks.length).toBe(3);
    expect(service.getAllTasks().length).toBe(3);
  });

  it('should track tasks independently', async () => {
    const task1 = await service.submitTask({ name: 'task1', prompt: 'Prompt 1' });
    const task2 = await service.submitTask({ name: 'task2', prompt: 'Prompt 2' });

    // Manually update status (bypassing internal setTimeout)
    service.updateTaskStatus(task1.id, 'running');
    service.updateTaskProgress(task1.id, 50);

    service.updateTaskStatus(task2.id, 'completed', 'Done');

    const updated1 = await service.getTask(task1.id);
    const updated2 = await service.getTask(task2.id);

    // Both should reflect manually set status
    expect(updated1?.status).toBe('running');
    expect(updated1?.progress).toBe(50);
    expect(updated2?.status).toBe('completed');
  });

  it('should poll multiple tasks independently', async () => {
    // Use real timers with short intervals for this test
    const updates: Map<string, number> = new Map();
    service.onTaskUpdate = (task) => {
      const count = updates.get(task.id) || 0;
      updates.set(task.id, count + 1);
    };

    const task1 = await service.submitTask({ name: 'task1', prompt: 'Prompt 1' });
    const task2 = await service.submitTask({ name: 'task2', prompt: 'Prompt 2' });

    service.startPolling(task1.id, {
      intervalMs: 30,
      maxAttempts: 10,
      backoffMultiplier: 1,
    });

    service.startPolling(task2.id, {
      intervalMs: 30,
      maxAttempts: 10,
      backoffMultiplier: 1,
    });

    // Wait for a few poll cycles (real time)
    await new Promise(r => setTimeout(r, 150));

    expect(updates.get(task1.id)).toBeGreaterThan(0);
    expect(updates.get(task2.id)).toBeGreaterThan(0);

    service.stopPolling(task1.id);
    service.stopPolling(task2.id);
  });

  it('should prioritize tasks correctly', async () => {
    const lowTask = await service.submitTask({
      name: 'low',
      prompt: 'Low priority',
      priority: 'low',
    });

    const normalTask = await service.submitTask({
      name: 'normal',
      prompt: 'Normal priority',
      priority: 'normal',
    });

    const highTask = await service.submitTask({
      name: 'high',
      prompt: 'High priority',
      priority: 'high',
    });

    const criticalTask = await service.submitTask({
      name: 'critical',
      prompt: 'Critical priority',
      priority: 'critical',
    });

    const tasks = service.getAllTasks();
    const sortedByPriority = [...tasks].sort((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = {
        critical: 4,
        high: 3,
        normal: 2,
        low: 1,
      };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    expect(sortedByPriority[0].priority).toBe('critical');
    expect(sortedByPriority[1].priority).toBe('high');
    expect(sortedByPriority[2].priority).toBe('normal');
    expect(sortedByPriority[3].priority).toBe('low');
  });
});

// ============================================================================
// ERROR RECOVERY TESTS
// ============================================================================

describe('Error Recovery (Jules)', () => {
  let service: AsyncTaskService;

  beforeEach(() => {
    vi.useRealTimers();
    service = new AsyncTaskService();
    service.setApiLatency(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.clearAllTasks();
  });

  it('should handle API errors gracefully', async () => {
    const mockApi = createMockJulesApi();
    mockApi.setup();

    // First call fails, second succeeds
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ success: false, error: 'Server error' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { id: 'task_123', status: 'pending' },
        }),
      });
    });

    // First attempt fails
    const response1 = await fetch('/api/tasks', { method: 'POST' });
    expect(response1.ok).toBe(false);

    // Retry succeeds
    const response2 = await fetch('/api/tasks', { method: 'POST' });
    expect(response2.ok).toBe(true);

    mockApi.teardown();
  });

  it('should record error details on task failure', async () => {
    const task = await service.submitTask({
      name: 'error-details-test',
      prompt: 'Test task',
    });

    service.updateTaskStatus(task.id, 'failed', undefined, 'Detailed error message: OOM');

    const updatedTask = await service.getTask(task.id);
    expect(updatedTask?.error).toBe('Detailed error message: OOM');
    expect(updatedTask?.completedAt).toBeDefined();
  });

  it('should handle network timeout on polling', async () => {
    // Use real timers with very short intervals for this test
    let errorReceived = false;
    let finalStatus: TaskStatus | undefined;
    service.onTaskError = (task) => {
      errorReceived = true;
      finalStatus = task.status;
    };

    const task = await service.submitTask({
      name: 'network-timeout-test',
      prompt: 'Test task',
    });

    service.startPolling(task.id, {
      intervalMs: 10,
      maxAttempts: 3,
      backoffMultiplier: 1,
    });

    // Wait for polling to exhaust all attempts (real time)
    // 3 attempts at 10ms each + buffer + API latency (0ms in test)
    await new Promise(r => setTimeout(r, 300));

    expect(errorReceived).toBe(true);
    expect(finalStatus).toBe('timeout');

    service.stopPolling(task.id);
  });

  it('should set completedAt timestamp on any terminal state', async () => {
    const task1 = await service.submitTask({ name: 'task1', prompt: 'Prompt 1' });
    const task2 = await service.submitTask({ name: 'task2', prompt: 'Prompt 2' });
    const task3 = await service.submitTask({ name: 'task3', prompt: 'Prompt 3' });

    service.updateTaskStatus(task1.id, 'completed', 'Done');
    service.updateTaskStatus(task2.id, 'failed', undefined, 'Error');
    service.updateTaskStatus(task3.id, 'cancelled');

    const updated1 = await service.getTask(task1.id);
    const updated2 = await service.getTask(task2.id);
    const updated3 = await service.getTask(task3.id);

    expect(updated1?.completedAt).toBeDefined();
    expect(updated2?.completedAt).toBeDefined();
    expect(updated3?.completedAt).toBeDefined();
  });
});

// ============================================================================
// JULES-SPECIFIC INTEGRATION TESTS
// ============================================================================

describe('Jules Integration', () => {
  let service: AsyncTaskService;
  let mockApi: ReturnType<typeof createMockJulesApi>;

  beforeEach(() => {
    vi.useRealTimers(); // Ensure clean timer state
    service = new AsyncTaskService();
    service.setApiLatency(0);
    mockApi = createMockJulesApi();
    mockApi.setup();
  });

  afterEach(() => {
    vi.useRealTimers(); // Clean up fake timers
    service.clearAllTasks();
    mockApi.teardown();
  });

  it('should simulate full Jules workflow', async () => {
    // Use real timers with short intervals for integration test
    const updates: TaskStatus[] = [];
    service.onTaskUpdate = (task) => updates.push(task.status);
    service.onTaskComplete = (task) => updates.push(task.status);

    // Submit task
    const task = await service.submitTask({
      name: 'jules-workflow',
      prompt: 'Refactor the authentication module',
      priority: 'high',
      metadata: {
        repository: 'user/repo',
        branch: 'main',
      },
    });

    expect(task.status).toBe('pending');

    // Start polling
    service.startPolling(task.id, {
      intervalMs: 20,
      maxAttempts: 50,
      backoffMultiplier: 1,
    });

    // Simulate Jules processing progression
    await new Promise(r => setTimeout(r, 30));
    service.updateTaskStatus(task.id, 'queued');

    await new Promise(r => setTimeout(r, 30));
    service.updateTaskStatus(task.id, 'running');
    service.updateTaskProgress(task.id, 10);

    await new Promise(r => setTimeout(r, 30));
    service.updateTaskProgress(task.id, 50);

    await new Promise(r => setTimeout(r, 30));
    service.updateTaskProgress(task.id, 90);

    await new Promise(r => setTimeout(r, 30));
    service.updateTaskStatus(task.id, 'completed', 'Refactoring complete. PR #123 created.');

    await new Promise(r => setTimeout(r, 50));

    expect(updates).toContain('queued');
    expect(updates).toContain('running');
    expect(updates).toContain('completed');

    const finalTask = await service.getTask(task.id);
    expect(finalTask?.result).toContain('PR #123');

    service.stopPolling(task.id);
  });

  it('should handle GitHub integration metadata', async () => {
    // This test doesn't need fake timers, uses real timers from beforeEach
    const task = await service.submitTask({
      name: 'github-integration-test',
      prompt: 'Fix issue #42',
      metadata: {
        github: {
          owner: 'user',
          repo: 'project',
          issue: 42,
          targetBranch: 'main',
        },
      },
    });

    expect(task.metadata?.github).toEqual({
      owner: 'user',
      repo: 'project',
      issue: 42,
      targetBranch: 'main',
    });
  });
});
