/**
 * HYDRA Benchmarks Module
 * Performance timing, metrics collection, and profiling
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * High-resolution timer
 */
export class Timer {
  constructor(name = 'timer') {
    this.name = name;
    this.startTime = null;
    this.endTime = null;
    this.laps = [];
  }

  start() {
    this.startTime = performance.now();
    this.laps = [];
    return this;
  }

  lap(label) {
    const now = performance.now();
    const duration = now - (this.laps.length > 0
      ? this.laps[this.laps.length - 1].time
      : this.startTime);
    this.laps.push({ label, time: now, duration });
    return duration;
  }

  stop() {
    this.endTime = performance.now();
    return this.elapsed();
  }

  elapsed() {
    const end = this.endTime || performance.now();
    return end - this.startTime;
  }

  report() {
    return {
      name: this.name,
      total: this.elapsed(),
      laps: this.laps,
    };
  }
}

/**
 * Startup benchmark tracker
 */
export class StartupBenchmark {
  constructor() {
    this.phases = new Map();
    this.startTime = null;
    this.endTime = null;
    this.marks = {};
    this.lastMark = null;
    this.results = null;
  }

  /**
   * Start the benchmark timer
   */
  start() {
    this.startTime = performance.now();
    this.lastMark = this.startTime;
    return this;
  }

  /**
   * Mark a point in time (records duration from last mark)
   */
  mark(name) {
    const now = performance.now();
    const duration = now - (this.lastMark || this.startTime || now);
    this.marks[name] = duration;
    this.lastMark = now;
    return duration;
  }

  /**
   * End the benchmark
   */
  end() {
    this.endTime = performance.now();
    return this.getTotal();
  }

  /**
   * Get all phase durations
   */
  getPhases() {
    return { ...this.marks };
  }

  /**
   * Get total elapsed time
   */
  getTotal() {
    const end = this.endTime || performance.now();
    return end - (this.startTime || end);
  }

  startPhase(name) {
    this.phases.set(name, {
      start: performance.now(),
      end: null,
      duration: null,
      status: 'running',
    });
    return this;
  }

  endPhase(name, status = 'success') {
    const phase = this.phases.get(name);
    if (phase) {
      phase.end = performance.now();
      phase.duration = phase.end - phase.start;
      phase.status = status;
    }
    return phase?.duration || 0;
  }

  failPhase(name, error) {
    const phase = this.phases.get(name);
    if (phase) {
      phase.end = performance.now();
      phase.duration = phase.end - phase.start;
      phase.status = 'failed';
      phase.error = error;
    }
    return this;
  }

  skipPhase(name) {
    this.phases.set(name, {
      start: null,
      end: null,
      duration: 0,
      status: 'skipped',
    });
    return this;
  }

  finish() {
    const totalTime = performance.now() - this.startTime;
    const phases = {};

    for (const [name, data] of this.phases) {
      phases[name] = {
        duration: data.duration,
        status: data.status,
        percent: data.duration ? ((data.duration / totalTime) * 100).toFixed(1) : 0,
      };
    }

    this.results = {
      totalTime,
      phases,
      timestamp: new Date().toISOString(),
    };

    return this.results;
  }

  getResults() {
    return this.results || this.finish();
  }

  /**
   * Format results for console display
   */
  formatReport(colorizer = null) {
    const results = this.getResults();
    const lines = [];

    lines.push('');
    lines.push('Startup Benchmarks');
    lines.push('─'.repeat(50));

    for (const [name, data] of Object.entries(results.phases)) {
      const duration = data.duration?.toFixed(2) || '0.00';
      const percent = data.percent || 0;
      const status = data.status === 'success' ? '✓' :
                     data.status === 'failed' ? '✗' :
                     data.status === 'skipped' ? '○' : '●';

      const bar = this.createBar(parseFloat(percent), 20);
      lines.push(`  ${status} ${name.padEnd(20)} ${duration.padStart(8)}ms ${bar} ${percent}%`);
    }

    lines.push('─'.repeat(50));
    lines.push(`  Total: ${results.totalTime.toFixed(2)}ms`);
    lines.push('');

    return lines.join('\n');
  }

  createBar(percent, width) {
    const filled = Math.round((percent / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }
}

/**
 * Performance metrics collector
 */
export class MetricsCollector {
  constructor(options = {}) {
    this.metrics = new Map();
    this.historySize = options.historySize || 100;
    this.persistPath = options.persistPath || null;

    if (this.persistPath && existsSync(this.persistPath)) {
      this.load();
    }
  }

  /**
   * Record a metric value
   */
  record(name, value, tags = {}) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        values: [],
        tags: {},
        stats: null,
      });
    }

    const metric = this.metrics.get(name);
    metric.values.push({
      value,
      timestamp: Date.now(),
      tags,
    });

    // Trim history
    if (metric.values.length > this.historySize) {
      metric.values.shift();
    }

    // Invalidate stats cache
    metric.stats = null;

    return this;
  }

  /**
   * Time a function execution
   */
  async time(name, fn, tags = {}) {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.record(name, duration, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.record(name, duration, { ...tags, status: 'error', error: error.message });
      throw error;
    }
  }

  /**
   * Get statistics for a metric
   */
  stats(name) {
    const metric = this.metrics.get(name);
    if (!metric || metric.values.length === 0) {
      return null;
    }

    // Return cached stats if available
    if (metric.stats) {
      return metric.stats;
    }

    const values = metric.values.map((v) => v.value);
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;

    metric.stats = {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: sum / count,
      median: sorted[Math.floor(count / 2)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      sum,
      latest: values[count - 1],
    };

    return metric.stats;
  }

  /**
   * Get all metrics summary
   */
  summary() {
    const result = {};
    for (const [name] of this.metrics) {
      result[name] = this.stats(name);
    }
    return result;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }

  /**
   * Persist metrics to file
   */
  save() {
    if (!this.persistPath) return;

    const dir = dirname(this.persistPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = {};
    for (const [name, metric] of this.metrics) {
      data[name] = metric.values;
    }

    writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
  }

  /**
   * Load metrics from file
   */
  load() {
    if (!this.persistPath || !existsSync(this.persistPath)) return;

    try {
      const data = JSON.parse(readFileSync(this.persistPath, 'utf-8'));
      for (const [name, values] of Object.entries(data)) {
        this.metrics.set(name, {
          values,
          tags: {},
          stats: null,
        });
      }
    } catch {
      /* ignore load errors */
    }
  }
}

/**
 * Memory usage tracker
 */
export class MemoryMonitor {
  constructor(options = {}) {
    this.samples = [];
    this.maxSamples = options.maxSamples || 60;
    this.warningThresholdMB = options.warningThreshold || 500;
    this.criticalThresholdMB = options.criticalThreshold || 1000;
    this.interval = null;
    this.listeners = [];
  }

  /**
   * Get current memory usage
   */
  current() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024),
      timestamp: Date.now(),
    };
  }

  /**
   * Take a sample
   */
  sample() {
    const usage = this.current();
    this.samples.push(usage);

    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // Check thresholds
    if (usage.heapUsedMB >= this.criticalThresholdMB) {
      this.notify('critical', usage);
    } else if (usage.heapUsedMB >= this.warningThresholdMB) {
      this.notify('warning', usage);
    }

    return usage;
  }

  /**
   * Start periodic monitoring
   */
  start(intervalMs = 5000) {
    if (this.interval) return this;

    this.interval = setInterval(() => this.sample(), intervalMs);
    this.sample(); // Initial sample

    return this;
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return this;
  }

  /**
   * Add threshold listener
   */
  onThreshold(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Notify listeners
   */
  notify(level, usage) {
    for (const listener of this.listeners) {
      try {
        listener(level, usage);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Get memory statistics
   */
  stats() {
    if (this.samples.length === 0) {
      return null;
    }

    const heapValues = this.samples.map((s) => s.heapUsedMB);
    const sorted = [...heapValues].sort((a, b) => a - b);

    return {
      current: this.samples[this.samples.length - 1],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round(heapValues.reduce((a, b) => a + b, 0) / heapValues.length),
      samples: this.samples.length,
    };
  }

  /**
   * Force garbage collection (if exposed)
   */
  gc() {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }
}

/**
 * Request/Query latency profiler
 */
export class LatencyProfiler {
  constructor() {
    this.requests = new Map();
    this.completed = [];
    this.maxCompleted = 1000;
  }

  /**
   * Start tracking a request
   */
  startRequest(id, metadata = {}) {
    this.requests.set(id, {
      id,
      start: performance.now(),
      metadata,
      checkpoints: [],
    });
    return this;
  }

  /**
   * Add checkpoint to request
   */
  checkpoint(id, name) {
    const request = this.requests.get(id);
    if (request) {
      request.checkpoints.push({
        name,
        time: performance.now(),
        elapsed: performance.now() - request.start,
      });
    }
    return this;
  }

  /**
   * Complete request tracking
   */
  endRequest(id, metadata = {}) {
    const request = this.requests.get(id);
    if (!request) return null;

    const end = performance.now();
    const result = {
      ...request,
      end,
      duration: end - request.start,
      metadata: { ...request.metadata, ...metadata },
    };

    this.requests.delete(id);
    this.completed.push(result);

    if (this.completed.length > this.maxCompleted) {
      this.completed.shift();
    }

    return result;
  }

  /**
   * Get latency statistics
   */
  stats() {
    if (this.completed.length === 0) {
      return null;
    }

    const durations = this.completed.map((r) => r.duration);
    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: durations.reduce((a, b) => a + b, 0) / count,
      median: sorted[Math.floor(count / 2)],
      p90: sorted[Math.floor(count * 0.9)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  /**
   * Get recent requests
   */
  recent(n = 10) {
    return this.completed.slice(-n);
  }

  /**
   * Clear history
   */
  clear() {
    this.completed = [];
    this.requests.clear();
  }
}

// Singleton instances
let startupBenchmark = null;
let metricsCollector = null;
let memoryMonitor = null;
let latencyProfiler = null;

export function getStartupBenchmark() {
  if (!startupBenchmark) {
    startupBenchmark = new StartupBenchmark();
  }
  return startupBenchmark;
}

export function getMetricsCollector(options) {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector(options);
  }
  return metricsCollector;
}

export function getMemoryMonitor(options) {
  if (!memoryMonitor) {
    memoryMonitor = new MemoryMonitor(options);
  }
  return memoryMonitor;
}

export function getLatencyProfiler() {
  if (!latencyProfiler) {
    latencyProfiler = new LatencyProfiler();
  }
  return latencyProfiler;
}
