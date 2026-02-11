/**
 * HYDRA Stats Tests
 * @module test/unit/hydra/core/stats.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Counter,
  getStatsCollector,
  Histogram,
  RollingStats,
  StatsCollector,
  TimeSeriesMetrics,
} from '../../../../src/hydra/core/stats.js';

describe('HYDRA Stats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('RollingStats', () => {
    let stats;

    beforeEach(() => {
      stats = new RollingStats(5);
    });

    describe('constructor()', () => {
      it('should set window size', () => {
        expect(stats.windowSize).toBe(5);
      });

      it('should use default window size', () => {
        const defaultStats = new RollingStats();
        expect(defaultStats.windowSize).toBe(100);
      });
    });

    describe('add()', () => {
      it('should add samples', () => {
        stats.add(10);
        stats.add(20);
        expect(stats.count()).toBe(2);
      });

      it('should maintain window size', () => {
        for (let i = 1; i <= 10; i++) {
          stats.add(i);
        }
        expect(stats.count()).toBe(5);
      });
    });

    describe('average()', () => {
      it('should calculate average', () => {
        stats.add(10);
        stats.add(20);
        stats.add(30);
        expect(stats.average()).toBe(20);
      });

      it('should return 0 for empty samples', () => {
        expect(stats.average()).toBe(0);
      });
    });

    describe('min() and max()', () => {
      it('should return min value', () => {
        stats.add(30);
        stats.add(10);
        stats.add(20);
        expect(stats.min()).toBe(10);
      });

      it('should return max value', () => {
        stats.add(30);
        stats.add(10);
        stats.add(20);
        expect(stats.max()).toBe(30);
      });

      it('should return 0 for empty samples', () => {
        expect(stats.min()).toBe(0);
        expect(stats.max()).toBe(0);
      });
    });

    describe('stdDev()', () => {
      it('should calculate standard deviation', () => {
        stats.add(2);
        stats.add(4);
        stats.add(4);
        stats.add(4);
        stats.add(6);
        const stdDev = stats.stdDev();
        expect(stdDev).toBeCloseTo(Math.SQRT2, 2);
      });

      it('should return 0 for less than 2 samples', () => {
        stats.add(10);
        expect(stats.stdDev()).toBe(0);
      });
    });

    describe('percentile()', () => {
      it('should calculate percentile', () => {
        for (let i = 1; i <= 100; i++) {
          stats = new RollingStats(100);
        }
        stats = new RollingStats(100);
        for (let i = 1; i <= 100; i++) {
          stats.add(i);
        }
        expect(stats.percentile(50)).toBe(50);
        expect(stats.percentile(90)).toBe(90);
        expect(stats.percentile(99)).toBe(99);
      });

      it('should return 0 for empty samples', () => {
        expect(stats.percentile(50)).toBe(0);
      });
    });

    describe('getStats()', () => {
      it('should return all statistics', () => {
        stats.add(10);
        stats.add(20);
        stats.add(30);
        const result = stats.getStats();
        expect(result.count).toBe(3);
        expect(result.average).toBe(20);
        expect(result.min).toBe(10);
        expect(result.max).toBe(30);
        expect(result.p50).toBeDefined();
        expect(result.p90).toBeDefined();
        expect(result.p95).toBeDefined();
        expect(result.p99).toBeDefined();
      });
    });

    describe('reset()', () => {
      it('should clear samples', () => {
        stats.add(10);
        stats.add(20);
        stats.reset();
        expect(stats.count()).toBe(0);
      });
    });
  });

  describe('TimeSeriesMetrics', () => {
    let metrics;

    beforeEach(() => {
      metrics = new TimeSeriesMetrics({ bucketSize: 1000, retention: 10 });
    });

    describe('constructor()', () => {
      it('should use default config', () => {
        const defaultMetrics = new TimeSeriesMetrics();
        expect(defaultMetrics.bucketSize).toBe(60000);
        expect(defaultMetrics.retention).toBe(60);
      });

      it('should accept custom config', () => {
        expect(metrics.bucketSize).toBe(1000);
        expect(metrics.retention).toBe(10);
      });
    });

    describe('record()', () => {
      it('should record values', () => {
        metrics.record(100);
        metrics.record(200);
        const result = metrics.getMetrics();
        expect(result.count).toBe(2);
        expect(result.average).toBe(150);
      });

      it('should bucket values by time', () => {
        metrics.record(100);
        vi.advanceTimersByTime(1500);
        metrics.record(200);
        const series = metrics.getTimeSeries();
        expect(series.length).toBe(2);
      });
    });

    describe('getMetrics()', () => {
      it('should aggregate metrics for time range', () => {
        metrics.record(100);
        metrics.record(50);
        metrics.record(150);
        const result = metrics.getMetrics();
        expect(result.count).toBe(3);
        expect(result.average).toBe(100);
        expect(result.min).toBe(50);
        expect(result.max).toBe(150);
      });

      it('should return zeros for empty data', () => {
        const result = metrics.getMetrics();
        expect(result.count).toBe(0);
        expect(result.average).toBe(0);
        expect(result.min).toBe(0);
        expect(result.max).toBe(0);
      });
    });

    describe('getTimeSeries()', () => {
      it('should return time series data', () => {
        metrics.record(100);
        vi.advanceTimersByTime(1500);
        metrics.record(200);
        const series = metrics.getTimeSeries();
        expect(series).toBeInstanceOf(Array);
        expect(series[0].timestamp).toBeDefined();
        expect(series[0].count).toBeDefined();
        expect(series[0].average).toBeDefined();
      });
    });

    describe('reset()', () => {
      it('should clear all data', () => {
        metrics.record(100);
        metrics.reset();
        expect(metrics.getMetrics().count).toBe(0);
      });
    });
  });

  describe('Counter', () => {
    let counter;

    beforeEach(() => {
      counter = new Counter('test_counter', 'Test description');
    });

    describe('constructor()', () => {
      it('should set name and description', () => {
        expect(counter.name).toBe('test_counter');
        expect(counter.description).toBe('Test description');
      });
    });

    describe('inc()', () => {
      it('should increment by 1 by default', () => {
        counter.inc();
        expect(counter.get()).toBe(1);
      });

      it('should increment by specified value', () => {
        counter.inc(5);
        expect(counter.get()).toBe(5);
      });

      it('should support labels', () => {
        counter.inc(1, { provider: 'gemini' });
        counter.inc(2, { provider: 'claude' });
        expect(counter.get({ provider: 'gemini' })).toBe(1);
        expect(counter.get({ provider: 'claude' })).toBe(2);
      });
    });

    describe('get()', () => {
      it('should return 0 for non-existent label', () => {
        expect(counter.get({ provider: 'unknown' })).toBe(0);
      });
    });

    describe('getAll()', () => {
      it('should return all values with labels', () => {
        counter.inc(1, { provider: 'gemini' });
        counter.inc(2, { provider: 'claude' });
        const all = counter.getAll();
        expect(all).toHaveLength(2);
        expect(all.find((i) => i.labels.provider === 'gemini').value).toBe(1);
        expect(all.find((i) => i.labels.provider === 'claude').value).toBe(2);
      });
    });

    describe('reset()', () => {
      it('should clear all values', () => {
        counter.inc(10);
        counter.reset();
        expect(counter.get()).toBe(0);
      });
    });
  });

  describe('Histogram', () => {
    let histogram;

    beforeEach(() => {
      histogram = new Histogram('test_histogram', [10, 50, 100, 500, 1000]);
    });

    describe('constructor()', () => {
      it('should set name', () => {
        expect(histogram.name).toBe('test_histogram');
      });

      it('should use default buckets', () => {
        const defaultHist = new Histogram('default');
        expect(defaultHist.buckets).toContain(100);
        expect(defaultHist.buckets).toContain(1000);
      });

      it('should sort buckets', () => {
        const unsorted = new Histogram('unsorted', [100, 10, 50]);
        expect(unsorted.buckets).toEqual([10, 50, 100]);
      });
    });

    describe('observe()', () => {
      it('should track observations', () => {
        histogram.observe(25);
        histogram.observe(75);
        histogram.observe(150);
        const data = histogram.getData();
        expect(data.count).toBe(3);
        expect(data.sum).toBe(250);
      });

      it('should bucket values correctly', () => {
        histogram.observe(5); // <= 10
        histogram.observe(15); // <= 50
        histogram.observe(75); // <= 100
        const data = histogram.getData();
        expect(data.buckets.find((b) => b.le === 10).count).toBe(1);
        expect(data.buckets.find((b) => b.le === 50).count).toBe(2);
        expect(data.buckets.find((b) => b.le === 100).count).toBe(3);
      });
    });

    describe('getData()', () => {
      it('should return histogram data', () => {
        histogram.observe(50);
        histogram.observe(100);
        const data = histogram.getData();
        expect(data.name).toBe('test_histogram');
        expect(data.count).toBe(2);
        expect(data.sum).toBe(150);
        expect(data.average).toBe(75);
        expect(data.buckets).toBeInstanceOf(Array);
        expect(data.buckets[data.buckets.length - 1].le).toBe('+Inf');
      });
    });

    describe('reset()', () => {
      it('should clear all data', () => {
        histogram.observe(50);
        histogram.reset();
        const data = histogram.getData();
        expect(data.count).toBe(0);
        expect(data.sum).toBe(0);
      });
    });
  });

  describe('StatsCollector', () => {
    let collector;

    beforeEach(() => {
      collector = new StatsCollector();
    });

    describe('constructor()', () => {
      it('should initialize all metrics', () => {
        expect(collector.requests).toBeInstanceOf(Counter);
        expect(collector.errors).toBeInstanceOf(Counter);
        expect(collector.latency).toBeInstanceOf(Histogram);
        expect(collector.cost).toBeInstanceOf(Counter);
        expect(collector.tokens).toBeInstanceOf(Counter);
        expect(collector.recentLatency).toBeInstanceOf(RollingStats);
      });
    });

    describe('recordRequest()', () => {
      it('should record successful request', () => {
        collector.recordRequest({
          provider: 'gemini',
          category: 'simple',
          latency: 100,
          cost: 0.01,
          tokens: 500,
          success: true,
        });
        const summary = collector.getSummary();
        expect(summary.requests.total).toBe(1);
        expect(summary.latency.recent.count).toBe(1);
      });

      it('should record failed request', () => {
        collector.recordRequest({
          provider: 'gemini',
          category: 'simple',
          success: false,
          error: { type: 'timeout' },
        });
        const summary = collector.getSummary();
        expect(summary.errors.total).toBe(1);
      });
    });

    describe('recordRouting()', () => {
      it('should record routing decision', () => {
        collector.recordRouting({
          latency: 5,
          category: 'simple',
          provider: 'gemini',
          complexity: 0.3,
        });
        const summary = collector.getSummary();
        expect(summary.requests.total).toBeGreaterThan(0);
      });
    });

    describe('getSummary()', () => {
      it('should return comprehensive summary', () => {
        collector.recordRequest({
          provider: 'gemini',
          category: 'simple',
          latency: 100,
          cost: 0.01,
          tokens: 500,
          success: true,
        });
        const summary = collector.getSummary();
        expect(summary.requests).toBeDefined();
        expect(summary.errors).toBeDefined();
        expect(summary.latency).toBeDefined();
        expect(summary.cost).toBeDefined();
        expect(summary.tokens).toBeDefined();
      });
    });

    describe('getTrends()', () => {
      it('should return time-based trends', () => {
        collector.recordRequest({
          provider: 'gemini',
          latency: 100,
          success: true,
        });
        const trends = collector.getTrends(60000);
        expect(trends.latency).toBeInstanceOf(Array);
        expect(trends.requests).toBeInstanceOf(Array);
        expect(trends.aggregated).toBeDefined();
      });
    });

    describe('exportPrometheus()', () => {
      it('should export in Prometheus format', () => {
        collector.recordRequest({
          provider: 'gemini',
          latency: 100,
          success: true,
        });
        const prometheus = collector.exportPrometheus();
        expect(prometheus).toContain('# HELP');
        expect(prometheus).toContain('# TYPE');
        expect(prometheus).toContain('hydra_requests_total');
        expect(prometheus).toContain('hydra_request_latency_ms');
      });
    });

    describe('reset()', () => {
      it('should reset all statistics', () => {
        collector.recordRequest({
          provider: 'gemini',
          latency: 100,
          success: true,
        });
        collector.reset();
        const summary = collector.getSummary();
        expect(summary.requests.total).toBe(0);
        expect(summary.latency.recent.count).toBe(0);
      });
    });
  });

  describe('getStatsCollector()', () => {
    it('should return singleton instance', () => {
      const collector1 = getStatsCollector();
      const collector2 = getStatsCollector();
      expect(collector1).toBe(collector2);
    });

    it('should return StatsCollector instance', () => {
      const collector = getStatsCollector();
      expect(collector).toBeInstanceOf(StatsCollector);
    });
  });
});
