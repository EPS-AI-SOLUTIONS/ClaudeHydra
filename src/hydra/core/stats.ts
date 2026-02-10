/**
 * HYDRA Stats - Comprehensive statistics tracking and metrics collection
 */

/**
 * Time-series data point
 * @typedef {Object} DataPoint
 * @property {number} timestamp - Unix timestamp
 * @property {any} value - The value
 */

/**
 * Rolling window statistics calculator
 */
export class RollingStats {
  /**
   * @param {number} windowSize - Number of samples to keep
   */
  constructor(windowSize = 100) {
    this.windowSize = windowSize;
    this._samples = [];
  }

  /**
   * Add a sample
   * @param {number} value
   */
  add(value) {
    this._samples.push(value);
    if (this._samples.length > this.windowSize) {
      this._samples.shift();
    }
  }

  /**
   * Get average
   * @returns {number}
   */
  average() {
    if (this._samples.length === 0) return 0;
    return this._samples.reduce((a, b) => a + b, 0) / this._samples.length;
  }

  /**
   * Get minimum
   * @returns {number}
   */
  min() {
    if (this._samples.length === 0) return 0;
    return Math.min(...this._samples);
  }

  /**
   * Get maximum
   * @returns {number}
   */
  max() {
    if (this._samples.length === 0) return 0;
    return Math.max(...this._samples);
  }

  /**
   * Get standard deviation
   * @returns {number}
   */
  stdDev() {
    if (this._samples.length < 2) return 0;
    const avg = this.average();
    const squareDiffs = this._samples.map((v) => (v - avg) ** 2);
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / (this._samples.length - 1));
  }

  /**
   * Get percentile
   * @param {number} p - Percentile (0-100)
   * @returns {number}
   */
  percentile(p) {
    if (this._samples.length === 0) return 0;
    const sorted = [...this._samples].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get count
   * @returns {number}
   */
  count() {
    return this._samples.length;
  }

  /**
   * Get all statistics
   * @returns {Object}
   */
  getStats() {
    return {
      count: this.count(),
      average: this.average(),
      min: this.min(),
      max: this.max(),
      stdDev: this.stdDev(),
      p50: this.percentile(50),
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99),
    };
  }

  /**
   * Reset samples
   */
  reset() {
    this._samples = [];
  }
}

/**
 * Time-series metrics with bucketing
 */
export class TimeSeriesMetrics {
  /**
   * @param {Object} config
   * @property {number} bucketSize - Bucket size in ms (default: 60000 = 1 minute)
   * @property {number} retention - How many buckets to keep (default: 60)
   */
  constructor(config = {}) {
    this.bucketSize = config.bucketSize || 60000;
    this.retention = config.retention || 60;
    this._buckets = new Map();
  }

  /**
   * Get current bucket key
   * @returns {number}
   */
  _getBucketKey(timestamp = Date.now()) {
    return Math.floor(timestamp / this.bucketSize) * this.bucketSize;
  }

  /**
   * Get or create bucket
   * @param {number} key
   * @returns {Object}
   */
  _getOrCreateBucket(key) {
    if (!this._buckets.has(key)) {
      this._buckets.set(key, {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        values: [],
      });
      this._prune();
    }
    return this._buckets.get(key);
  }

  /**
   * Remove old buckets
   */
  _prune() {
    const cutoff = this._getBucketKey() - this.retention * this.bucketSize;
    for (const key of this._buckets.keys()) {
      if (key < cutoff) {
        this._buckets.delete(key);
      }
    }
  }

  /**
   * Record a value
   * @param {number} value
   * @param {number} timestamp
   */
  record(value, timestamp = Date.now()) {
    const key = this._getBucketKey(timestamp);
    const bucket = this._getOrCreateBucket(key);

    bucket.count++;
    bucket.sum += value;
    bucket.min = Math.min(bucket.min, value);
    bucket.max = Math.max(bucket.max, value);
    bucket.values.push(value);
  }

  /**
   * Get aggregated metrics for time range
   * @param {number} startTime
   * @param {number} endTime
   * @returns {Object}
   */
  getMetrics(startTime = 0, endTime = Date.now()) {
    let totalCount = 0;
    let totalSum = 0;
    let min = Infinity;
    let max = -Infinity;
    const allValues = [];

    for (const [key, bucket] of this._buckets) {
      if (key >= startTime && key <= endTime) {
        totalCount += bucket.count;
        totalSum += bucket.sum;
        min = Math.min(min, bucket.min);
        max = Math.max(max, bucket.max);
        allValues.push(...bucket.values);
      }
    }

    if (totalCount === 0) {
      return { count: 0, average: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    allValues.sort((a, b) => a - b);

    return {
      count: totalCount,
      average: totalSum / totalCount,
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max,
      p50: allValues[Math.floor(allValues.length * 0.5)] || 0,
      p95: allValues[Math.floor(allValues.length * 0.95)] || 0,
      p99: allValues[Math.floor(allValues.length * 0.99)] || 0,
    };
  }

  /**
   * Get time series data
   * @param {number} startTime
   * @param {number} endTime
   * @returns {Array}
   */
  getTimeSeries(startTime = 0, endTime = Date.now()) {
    const series = [];

    for (const [key, bucket] of this._buckets) {
      if (key >= startTime && key <= endTime) {
        series.push({
          timestamp: key,
          count: bucket.count,
          average: bucket.count > 0 ? bucket.sum / bucket.count : 0,
          min: bucket.min === Infinity ? 0 : bucket.min,
          max: bucket.max === -Infinity ? 0 : bucket.max,
        });
      }
    }

    return series.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clear all data
   */
  reset() {
    this._buckets.clear();
  }
}

/**
 * Counter with labels (like Prometheus)
 */
export class Counter {
  constructor(name, description = '') {
    this.name = name;
    this.description = description;
    this._values = new Map();
  }

  /**
   * Generate label key
   * @param {Object} labels
   * @returns {string}
   */
  _labelKey(labels = {}) {
    return JSON.stringify(Object.entries(labels).sort());
  }

  /**
   * Increment counter
   * @param {number} value
   * @param {Object} labels
   */
  inc(value = 1, labels = {}) {
    const key = this._labelKey(labels);
    const current = this._values.get(key) || 0;
    this._values.set(key, current + value);
  }

  /**
   * Get counter value
   * @param {Object} labels
   * @returns {number}
   */
  get(labels = {}) {
    const key = this._labelKey(labels);
    return this._values.get(key) || 0;
  }

  /**
   * Get all values with labels
   * @returns {Array}
   */
  getAll() {
    const result = [];
    for (const [key, value] of this._values) {
      result.push({
        labels: JSON.parse(key).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
        value,
      });
    }
    return result;
  }

  /**
   * Reset counter
   */
  reset() {
    this._values.clear();
  }
}

/**
 * Histogram for latency tracking
 */
export class Histogram {
  /**
   * @param {string} name
   * @param {number[]} buckets - Bucket boundaries
   */
  constructor(name, buckets = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    this.name = name;
    this.buckets = buckets.sort((a, b) => a - b);
    this._counts = new Array(buckets.length + 1).fill(0);
    this._sum = 0;
    this._count = 0;
  }

  /**
   * Observe a value
   * @param {number} value
   */
  observe(value) {
    this._sum += value;
    this._count++;

    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this._counts[i]++;
        return;
      }
    }
    this._counts[this._counts.length - 1]++;
  }

  /**
   * Get histogram data
   * @returns {Object}
   */
  getData() {
    const bucketData = this.buckets.map((boundary, i) => ({
      le: boundary,
      count: this._counts.slice(0, i + 1).reduce((a, b) => a + b, 0),
    }));

    bucketData.push({
      le: '+Inf',
      count: this._count,
    });

    return {
      name: this.name,
      buckets: bucketData,
      sum: this._sum,
      count: this._count,
      average: this._count > 0 ? this._sum / this._count : 0,
    };
  }

  /**
   * Reset histogram
   */
  reset() {
    this._counts = new Array(this.buckets.length + 1).fill(0);
    this._sum = 0;
    this._count = 0;
  }
}

/**
 * HYDRA Stats Collector - Central statistics collection
 */
export class StatsCollector {
  constructor() {
    // Request counters
    this.requests = new Counter('hydra_requests_total', 'Total number of requests');
    this.errors = new Counter('hydra_errors_total', 'Total number of errors');

    // Latency histograms
    this.latency = new Histogram('hydra_request_latency_ms');
    this.routingLatency = new Histogram('hydra_routing_latency_ms', [1, 5, 10, 25, 50, 100]);

    // Cost tracking
    this.cost = new Counter('hydra_cost_total', 'Total estimated cost');
    this.savings = new Counter('hydra_savings_total', 'Total estimated savings');

    // Token tracking
    this.tokens = new Counter('hydra_tokens_total', 'Total tokens used');

    // Rolling stats for recent data
    this.recentLatency = new RollingStats(100);
    this.recentCost = new RollingStats(100);

    // Time series for trends
    this.latencyTimeSeries = new TimeSeriesMetrics();
    this.requestTimeSeries = new TimeSeriesMetrics();
  }

  /**
   * Record a request
   * @param {Object} data
   */
  recordRequest(data) {
    const { provider, category, latency, cost, savings, tokens, success, error } = data;

    // Increment counters
    this.requests.inc(1, { provider, category, status: success ? 'success' : 'failure' });

    if (!success) {
      this.errors.inc(1, { provider, category, error_type: error?.type || 'unknown' });
    }

    // Record latency
    if (latency) {
      this.latency.observe(latency);
      this.recentLatency.add(latency);
      this.latencyTimeSeries.record(latency);
    }

    // Record cost
    if (cost) {
      this.cost.inc(cost, { provider });
      this.recentCost.add(cost);
    }

    // Record savings
    if (savings) {
      this.savings.inc(savings);
    }

    // Record tokens
    if (tokens) {
      this.tokens.inc(tokens, { provider });
    }

    // Record for time series
    this.requestTimeSeries.record(1);
  }

  /**
   * Record routing decision
   * @param {Object} data
   */
  recordRouting(data) {
    const { latency, category, provider, complexity } = data;

    if (latency) {
      this.routingLatency.observe(latency);
    }

    this.requests.inc(1, {
      type: 'routing',
      category,
      provider,
      complexity: complexity?.toString(),
    });
  }

  /**
   * Get summary statistics
   * @returns {Object}
   */
  getSummary() {
    return {
      requests: {
        total: this.requests.getAll().reduce((sum, r) => sum + r.value, 0),
        byProvider: this._aggregateByLabel(this.requests.getAll(), 'provider'),
        byCategory: this._aggregateByLabel(this.requests.getAll(), 'category'),
        byStatus: this._aggregateByLabel(this.requests.getAll(), 'status'),
      },
      errors: {
        total: this.errors.getAll().reduce((sum, r) => sum + r.value, 0),
        byType: this._aggregateByLabel(this.errors.getAll(), 'error_type'),
      },
      latency: {
        histogram: this.latency.getData(),
        recent: this.recentLatency.getStats(),
      },
      cost: {
        total: this.cost.getAll().reduce((sum, r) => sum + r.value, 0),
        byProvider: this._aggregateByLabel(this.cost.getAll(), 'provider'),
        savings: this.savings.get(),
      },
      tokens: {
        total: this.tokens.getAll().reduce((sum, r) => sum + r.value, 0),
        byProvider: this._aggregateByLabel(this.tokens.getAll(), 'provider'),
      },
    };
  }

  /**
   * Aggregate counter values by label
   * @param {Array} data
   * @param {string} labelKey
   * @returns {Object}
   */
  _aggregateByLabel(data, labelKey) {
    const result = {};
    for (const item of data) {
      const key = item.labels[labelKey] || 'unknown';
      result[key] = (result[key] || 0) + item.value;
    }
    return result;
  }

  /**
   * Get time-based trends
   * @param {number} period - Time period in ms
   * @returns {Object}
   */
  getTrends(period = 3600000) {
    const endTime = Date.now();
    const startTime = endTime - period;

    return {
      latency: this.latencyTimeSeries.getTimeSeries(startTime, endTime),
      requests: this.requestTimeSeries.getTimeSeries(startTime, endTime),
      aggregated: {
        latency: this.latencyTimeSeries.getMetrics(startTime, endTime),
        requests: this.requestTimeSeries.getMetrics(startTime, endTime),
      },
    };
  }

  /**
   * Export metrics in Prometheus format
   * @returns {string}
   */
  exportPrometheus() {
    const lines = [];

    // Requests counter
    lines.push(`# HELP ${this.requests.name} ${this.requests.description}`);
    lines.push(`# TYPE ${this.requests.name} counter`);
    for (const item of this.requests.getAll()) {
      const labels = Object.entries(item.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${this.requests.name}{${labels}} ${item.value}`);
    }

    // Errors counter
    lines.push(`# HELP ${this.errors.name} ${this.errors.description}`);
    lines.push(`# TYPE ${this.errors.name} counter`);
    for (const item of this.errors.getAll()) {
      const labels = Object.entries(item.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${this.errors.name}{${labels}} ${item.value}`);
    }

    // Latency histogram
    const histData = this.latency.getData();
    lines.push(`# HELP ${this.latency.name} Request latency in milliseconds`);
    lines.push(`# TYPE ${this.latency.name} histogram`);
    for (const bucket of histData.buckets) {
      lines.push(`${this.latency.name}_bucket{le="${bucket.le}"} ${bucket.count}`);
    }
    lines.push(`${this.latency.name}_sum ${histData.sum}`);
    lines.push(`${this.latency.name}_count ${histData.count}`);

    // Cost counter
    lines.push(`# HELP ${this.cost.name} ${this.cost.description}`);
    lines.push(`# TYPE ${this.cost.name} counter`);
    for (const item of this.cost.getAll()) {
      const labels = Object.entries(item.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${this.cost.name}{${labels}} ${item.value}`);
    }

    // Tokens counter
    lines.push(`# HELP ${this.tokens.name} ${this.tokens.description}`);
    lines.push(`# TYPE ${this.tokens.name} counter`);
    for (const item of this.tokens.getAll()) {
      const labels = Object.entries(item.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${this.tokens.name}{${labels}} ${item.value}`);
    }

    // Savings counter
    lines.push(`# HELP ${this.savings.name} ${this.savings.description}`);
    lines.push(`# TYPE ${this.savings.name} counter`);
    lines.push(`${this.savings.name} ${this.savings.get()}`);

    return lines.join('\n');
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.requests.reset();
    this.errors.reset();
    this.latency.reset();
    this.routingLatency.reset();
    this.cost.reset();
    this.savings.reset();
    this.tokens.reset();
    this.recentLatency.reset();
    this.recentCost.reset();
    this.latencyTimeSeries.reset();
    this.requestTimeSeries.reset();
  }
}

// Singleton instance
let _statsCollector = null;

/**
 * Get or create stats collector singleton
 * @returns {StatsCollector}
 */
export function getStatsCollector() {
  if (!_statsCollector) {
    _statsCollector = new StatsCollector();
  }
  return _statsCollector;
}
