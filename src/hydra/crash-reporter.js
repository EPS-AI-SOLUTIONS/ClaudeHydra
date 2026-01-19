/**
 * HYDRA Crash Reporter Module
 * Automatic error reporting, stack traces, and crash dumps
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { getMemoryMonitor } from './benchmarks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Crash report structure
 */
class CrashReport {
  constructor(error, context = {}) {
    this.id = `crash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.timestamp = new Date().toISOString();
    this.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    };
    this.context = context;
    this.system = this.getSystemInfo();
    this.process = this.getProcessInfo();
    this.memory = this.getMemoryInfo();
  }

  getSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
    };
  }

  getProcessInfo() {
    return {
      pid: process.pid,
      ppid: process.ppid,
      uptime: process.uptime(),
      cwd: process.cwd(),
      execPath: process.execPath,
      argv: process.argv,
      env: this.sanitizeEnv(process.env),
    };
  }

  getMemoryInfo() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    };
  }

  sanitizeEnv(env) {
    const sensitiveKeys = [
      'API_KEY',
      'SECRET',
      'PASSWORD',
      'TOKEN',
      'CREDENTIAL',
      'AUTH',
      'PRIVATE',
    ];

    const sanitized = {};
    for (const [key, value] of Object.entries(env)) {
      const isSensitive = sensitiveKeys.some((s) =>
        key.toUpperCase().includes(s)
      );
      sanitized[key] = isSensitive ? '[REDACTED]' : value;
    }
    return sanitized;
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      error: this.error,
      context: this.context,
      system: this.system,
      process: this.process,
      memory: this.memory,
    };
  }

  toString() {
    const lines = [
      '═'.repeat(60),
      `HYDRA CRASH REPORT`,
      '═'.repeat(60),
      `ID: ${this.id}`,
      `Time: ${this.timestamp}`,
      '',
      '── ERROR ──────────────────────────────────────────────────',
      `Name: ${this.error.name}`,
      `Message: ${this.error.message}`,
      '',
      'Stack Trace:',
      this.error.stack || 'No stack trace available',
      '',
      '── CONTEXT ────────────────────────────────────────────────',
      JSON.stringify(this.context, null, 2),
      '',
      '── SYSTEM ─────────────────────────────────────────────────',
      `Platform: ${this.system.platform} (${this.system.arch})`,
      `Node: ${this.system.nodeVersion}`,
      `CPUs: ${this.system.cpus}`,
      `Memory: ${Math.round(this.system.freeMemory / 1024 / 1024)}MB free / ${Math.round(this.system.totalMemory / 1024 / 1024)}MB total`,
      '',
      '── PROCESS ────────────────────────────────────────────────',
      `PID: ${this.process.pid}`,
      `Uptime: ${Math.round(this.process.uptime)}s`,
      `Heap: ${this.memory.heapUsedMB}MB`,
      '',
      '═'.repeat(60),
    ];

    return lines.join('\n');
  }
}

/**
 * Crash Reporter class
 */
export class CrashReporter {
  constructor(options = {}) {
    this.crashDir = options.crashDir || join(__dirname, '..', '..', 'crashes');
    this.maxReports = options.maxReports || 10;
    this.enabled = options.enabled !== false;
    this.onCrash = options.onCrash || null;
    this.context = {};
    this.installed = false;
  }

  /**
   * Set context that will be included in all reports
   */
  setContext(key, value) {
    this.context[key] = value;
    return this;
  }

  /**
   * Install global error handlers
   */
  install() {
    if (this.installed || !this.enabled) return this;

    // Ensure crash directory exists
    if (!existsSync(this.crashDir)) {
      mkdirSync(this.crashDir, { recursive: true });
    }

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.report(error, { type: 'uncaughtException' });
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const error =
        reason instanceof Error ? reason : new Error(String(reason));
      this.report(error, { type: 'unhandledRejection' });
      console.error('Unhandled Rejection:', reason);
    });

    // SIGTERM/SIGINT for graceful info
    process.on('SIGTERM', () => {
      this.saveContext({ type: 'SIGTERM', graceful: true });
    });

    process.on('SIGINT', () => {
      this.saveContext({ type: 'SIGINT', graceful: true });
    });

    this.installed = true;
    return this;
  }

  /**
   * Generate and save a crash report
   */
  report(error, additionalContext = {}) {
    if (!this.enabled) return null;

    const report = new CrashReport(error, {
      ...this.context,
      ...additionalContext,
    });

    // Save to file
    const filePath = join(this.crashDir, `${report.id}.json`);
    try {
      writeFileSync(filePath, JSON.stringify(report.toJSON(), null, 2));

      // Also save human-readable version
      const txtPath = join(this.crashDir, `${report.id}.txt`);
      writeFileSync(txtPath, report.toString());
    } catch (e) {
      console.error('Failed to save crash report:', e);
    }

    // Cleanup old reports
    this.cleanup();

    // Notify callback
    if (this.onCrash) {
      try {
        this.onCrash(report);
      } catch {
        /* ignore callback errors */
      }
    }

    return report;
  }

  /**
   * Save context snapshot (for graceful shutdowns)
   */
  saveContext(additionalContext = {}) {
    const contextPath = join(this.crashDir, 'last-context.json');
    try {
      writeFileSync(
        contextPath,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            context: { ...this.context, ...additionalContext },
            memory: process.memoryUsage(),
            uptime: process.uptime(),
          },
          null,
          2
        )
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * List all crash reports
   */
  list() {
    if (!existsSync(this.crashDir)) return [];

    return readdirSync(this.crashDir)
      .filter((f) => f.endsWith('.json') && f.startsWith('crash-'))
      .map((f) => {
        const filePath = join(this.crashDir, f);
        try {
          const stat = statSync(filePath);
          const content = JSON.parse(readFileSync(filePath, 'utf-8'));
          return {
            id: content.id,
            timestamp: content.timestamp,
            error: content.error.message,
            size: stat.size,
            path: filePath,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get a specific crash report
   */
  get(id) {
    const filePath = join(this.crashDir, `${id}.json`);
    if (!existsSync(filePath)) return null;

    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Delete a crash report
   */
  delete(id) {
    const jsonPath = join(this.crashDir, `${id}.json`);
    const txtPath = join(this.crashDir, `${id}.txt`);

    if (existsSync(jsonPath)) unlinkSync(jsonPath);
    if (existsSync(txtPath)) unlinkSync(txtPath);
  }

  /**
   * Cleanup old reports
   */
  cleanup() {
    const reports = this.list();
    if (reports.length <= this.maxReports) return;

    // Delete oldest reports
    const toDelete = reports.slice(this.maxReports);
    for (const report of toDelete) {
      this.delete(report.id);
    }
  }

  /**
   * Clear all reports
   */
  clearAll() {
    const reports = this.list();
    for (const report of reports) {
      this.delete(report.id);
    }
  }

  /**
   * Format report list for console
   */
  formatList() {
    const reports = this.list();
    if (reports.length === 0) {
      return 'No crash reports found.';
    }

    const lines = [
      '',
      'Crash Reports',
      '─'.repeat(70),
    ];

    for (const report of reports) {
      const date = new Date(report.timestamp).toLocaleString();
      const error = report.error.slice(0, 40).padEnd(40);
      lines.push(`  ${report.id}  ${date}  ${error}`);
    }

    lines.push('─'.repeat(70));
    lines.push(`  Total: ${reports.length} report(s)`);
    lines.push('');

    return lines.join('\n');
  }
}

/**
 * Graceful shutdown handler
 */
export class GracefulShutdown {
  constructor() {
    this.handlers = [];
    this.shutdownInProgress = false;
    this.timeout = 10000; // 10 seconds default
  }

  /**
   * Register a shutdown handler
   */
  register(name, handler, priority = 10) {
    this.handlers.push({ name, handler, priority });
    this.handlers.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /**
   * Install signal handlers
   */
  install() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];

    for (const signal of signals) {
      process.on(signal, () => this.shutdown(signal));
    }

    return this;
  }

  /**
   * Execute shutdown sequence
   */
  async shutdown(signal = 'manual') {
    if (this.shutdownInProgress) return;
    this.shutdownInProgress = true;

    console.log(`\n[HYDRA] Graceful shutdown initiated (${signal})...`);

    // Set timeout for forced exit
    const forceExit = setTimeout(() => {
      console.error('[HYDRA] Shutdown timeout - forcing exit');
      process.exit(1);
    }, this.timeout);

    // Execute handlers
    for (const { name, handler } of this.handlers) {
      try {
        console.log(`[HYDRA] Shutting down: ${name}`);
        await Promise.resolve(handler());
      } catch (error) {
        console.error(`[HYDRA] Shutdown error in ${name}:`, error.message);
      }
    }

    clearTimeout(forceExit);
    console.log('[HYDRA] Shutdown complete');
    process.exit(0);
  }
}

// Singleton instances
let crashReporter = null;
let gracefulShutdown = null;

export function getCrashReporter(options) {
  if (!crashReporter) {
    crashReporter = new CrashReporter(options);
  }
  return crashReporter;
}

export function getGracefulShutdown() {
  if (!gracefulShutdown) {
    gracefulShutdown = new GracefulShutdown();
  }
  return gracefulShutdown;
}
