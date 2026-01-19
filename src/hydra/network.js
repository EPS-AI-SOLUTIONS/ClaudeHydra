/**
 * HYDRA Network Module
 * Network diagnostics, connectivity checks, and ping utilities
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import dns from 'node:dns';

/**
 * Network diagnostic results
 */
class DiagnosticResult {
  constructor(target) {
    this.target = target;
    this.timestamp = new Date().toISOString();
    this.reachable = false;
    this.latency = null;
    this.error = null;
    this.details = {};
  }

  toJSON() {
    return {
      target: this.target,
      timestamp: this.timestamp,
      reachable: this.reachable,
      latency: this.latency,
      error: this.error,
      details: this.details,
    };
  }
}

/**
 * HTTP ping (health check)
 */
export async function httpPing(url, options = {}) {
  const timeout = options.timeout || 5000;
  const result = new DiagnosticResult(url);
  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: options.headers || {},
    });

    clearTimeout(timeoutId);

    result.latency = performance.now() - start;
    result.reachable = response.ok;
    result.details = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
    };
  } catch (error) {
    result.latency = performance.now() - start;
    result.error = error.name === 'AbortError' ? 'Timeout' : error.message;
  }

  return result;
}

/**
 * TCP ping (port check)
 */
export function tcpPing(host, port, options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || 5000;
    const result = new DiagnosticResult(`${host}:${port}`);
    const start = performance.now();

    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      result.latency = performance.now() - start;
      result.reachable = true;
      socket.destroy();
      resolve(result);
    });

    socket.on('timeout', () => {
      result.latency = timeout;
      result.error = 'Connection timeout';
      socket.destroy();
      resolve(result);
    });

    socket.on('error', (err) => {
      result.latency = performance.now() - start;
      result.error = err.message;
      resolve(result);
    });

    socket.connect(port, host);
  });
}

/**
 * DNS lookup
 */
export function dnsLookup(hostname) {
  return new Promise((resolve) => {
    const result = new DiagnosticResult(hostname);
    const start = performance.now();

    dns.lookup(hostname, { all: true }, (err, addresses) => {
      result.latency = performance.now() - start;

      if (err) {
        result.error = err.message;
      } else {
        result.reachable = true;
        result.details = { addresses };
      }

      resolve(result);
    });
  });
}

/**
 * ICMP ping (requires system ping command)
 */
export function icmpPing(host, options = {}) {
  return new Promise((resolve) => {
    const count = options.count || 1;
    const timeout = options.timeout || 5;
    const result = new DiagnosticResult(host);
    const start = performance.now();

    const isWindows = process.platform === 'win32';
    const args = isWindows
      ? ['-n', String(count), '-w', String(timeout * 1000), host]
      : ['-c', String(count), '-W', String(timeout), host];

    const proc = spawn('ping', args, { stdio: 'pipe' });
    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      result.latency = performance.now() - start;
      result.reachable = code === 0;

      // Parse latency from output
      const timeMatch = stdout.match(
        isWindows ? /Average = (\d+)ms/ : /min\/avg\/max\/.* = [\d.]+\/([\d.]+)/
      );
      if (timeMatch) {
        result.details.avgLatency = parseFloat(timeMatch[1]);
      }

      result.details.output = stdout;
      resolve(result);
    });

    proc.on('error', (err) => {
      result.error = err.message;
      resolve(result);
    });
  });
}

/**
 * Network Diagnostics Manager
 */
export class NetworkDiagnostics {
  constructor(config = {}) {
    this.ollamaHost = config.ollamaHost || 'http://localhost:11434';
    this.targets = config.targets || [];
    this.results = [];
  }

  /**
   * Parse URL into host and port
   */
  parseUrl(url) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check Ollama connectivity
   */
  async checkOllama() {
    const result = await httpPing(`${this.ollamaHost}/api/tags`, {
      timeout: 5000,
    });
    result.details.service = 'Ollama';
    this.results.push(result);
    return result;
  }

  /**
   * Check internet connectivity
   */
  async checkInternet() {
    const targets = [
      { url: 'https://www.google.com', name: 'Google' },
      { url: 'https://api.github.com', name: 'GitHub API' },
      { url: 'https://aistudio.google.com', name: 'Google AI Studio' },
    ];

    const results = [];
    for (const target of targets) {
      const result = await httpPing(target.url, { timeout: 5000 });
      result.details.service = target.name;
      results.push(result);
      this.results.push(result);
    }

    return results;
  }

  /**
   * Check custom targets
   */
  async checkTargets() {
    const results = [];
    for (const target of this.targets) {
      const result = await httpPing(target, { timeout: 5000 });
      results.push(result);
      this.results.push(result);
    }
    return results;
  }

  /**
   * Run full diagnostics
   */
  async runAll() {
    this.results = [];

    const results = {
      ollama: await this.checkOllama(),
      internet: await this.checkInternet(),
      custom: await this.checkTargets(),
      timestamp: new Date().toISOString(),
    };

    // Add summary
    results.summary = {
      total: this.results.length,
      reachable: this.results.filter((r) => r.reachable).length,
      failed: this.results.filter((r) => !r.reachable).length,
      avgLatency: this.calculateAvgLatency(),
    };

    return results;
  }

  /**
   * Calculate average latency of successful pings
   */
  calculateAvgLatency() {
    const successful = this.results.filter((r) => r.reachable && r.latency);
    if (successful.length === 0) return null;

    const sum = successful.reduce((acc, r) => acc + r.latency, 0);
    return Math.round(sum / successful.length);
  }

  /**
   * Format results for console output
   */
  formatReport(colorizer = null) {
    const lines = [];
    const ok = colorizer?.ok?.() || '✓';
    const fail = colorizer?.fail?.() || '✗';

    lines.push('');
    lines.push('Network Diagnostics');
    lines.push('─'.repeat(60));

    for (const result of this.results) {
      const status = result.reachable ? ok : fail;
      const latency = result.latency
        ? `${result.latency.toFixed(0)}ms`
        : 'N/A';
      const service = result.details?.service || '';
      const target = result.target.padEnd(35);
      const error = result.error ? ` (${result.error})` : '';

      lines.push(`  ${status} ${target} ${latency.padStart(8)} ${service}${error}`);
    }

    lines.push('─'.repeat(60));

    const summary = {
      total: this.results.length,
      reachable: this.results.filter((r) => r.reachable).length,
      avgLatency: this.calculateAvgLatency(),
    };

    lines.push(
      `  Total: ${summary.total} | ` +
      `Reachable: ${summary.reachable} | ` +
      `Failed: ${summary.total - summary.reachable} | ` +
      `Avg Latency: ${summary.avgLatency || 'N/A'}ms`
    );
    lines.push('');

    return lines.join('\n');
  }
}

/**
 * WebSocket connection manager (for real-time events)
 */
export class WebSocketManager {
  constructor(options = {}) {
    this.port = options.port || 3847;
    this.server = null;
    this.clients = new Set();
    this.eventHistory = [];
    this.maxHistory = options.maxHistory || 100;
  }

  /**
   * Start WebSocket server
   */
  async start() {
    const { WebSocketServer } = await import('ws');

    this.server = new WebSocketServer({ port: this.port });

    this.server.on('connection', (ws) => {
      this.clients.add(ws);

      // Send event history
      for (const event of this.eventHistory) {
        ws.send(JSON.stringify(event));
      }

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    console.log(`[WebSocket] Server started on port ${this.port}`);
    return this;
  }

  /**
   * Broadcast event to all clients
   */
  broadcast(event) {
    const payload = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    // Add to history
    this.eventHistory.push(payload);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // Send to clients
    const message = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        // OPEN
        client.send(message);
      }
    }
  }

  /**
   * Stop WebSocket server
   */
  stop() {
    if (this.server) {
      for (const client of this.clients) {
        client.close();
      }
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Get client count
   */
  getClientCount() {
    return this.clients.size;
  }
}

// Singleton instances
let networkDiagnostics = null;
let webSocketManager = null;

export function getNetworkDiagnostics(config) {
  if (!networkDiagnostics) {
    networkDiagnostics = new NetworkDiagnostics(config);
  }
  return networkDiagnostics;
}

export function getWebSocketManager(options) {
  if (!webSocketManager) {
    webSocketManager = new WebSocketManager(options);
  }
  return webSocketManager;
}
