/**
 * @fileoverview Claude Code Multi-Instance Configuration Schema
 * Zod-based validation for the claudeInstances config section.
 *
 * Improvements v2.2:
 *   #5  — Logical constraint validation (max >= min, spawnTimeout < perInstanceTimeout)
 *   #20 — Environment variable overrides (CLAUDE_POOL_MAX_INSTANCES, etc.)
 *
 * @module hydra/core/config-schemas-claude-instances
 * @version 2.2.0
 */

import { z } from 'zod';

// =============================================================================
// Claude Code Instance Pool Schema
// =============================================================================

/**
 * Configuration schema for multi-instance Claude Code management.
 * Controls pool size, scaling behavior, load balancing strategy, and timeouts.
 */
export const ClaudeInstancesConfigSchema = z
  .object({
    /** Enable multi-instance mode. When false, uses legacy single-subprocess behavior. */
    enabled: z.boolean().default(false),

    /** Minimum number of instances to keep alive (warm pool). */
    minInstances: z.number().min(1).max(20).default(1),

    /** Maximum number of instances allowed (hard cap). */
    maxInstances: z.number().min(1).max(20).default(5),

    /** Timeout (ms) to wait for an available instance before throwing PoolExhaustedError. */
    acquireTimeout: z.number().min(5000).max(120000).default(60000),

    /** Load balancing strategy for distributing tasks across instances. */
    strategy: z.enum(['least-loaded', 'round-robin', 'agent-affinity']).default('least-loaded'),

    /** Time (ms) an instance must be idle before it can be scaled down. */
    scaleDownIdleTime: z.number().min(30000).max(600000).default(300000),

    /** Queue length that triggers auto-scale-up when all instances are busy. */
    scaleUpThreshold: z.number().min(1).max(50).default(2),

    /** Max consecutive failures before an instance is marked TERMINATED. */
    maxConsecutiveFailures: z.number().min(1).max(10).default(3),

    /** Timeout (ms) for spawning a new Claude Code subprocess. */
    spawnTimeout: z.number().min(5000).max(60000).default(30000),

    /** Per-instance task execution timeout (ms). */
    perInstanceTimeout: z.number().min(30000).max(600000).default(300000),

    /** Shared rate limit across all instances (requests per interval). */
    rateLimit: z
      .object({
        enabled: z.boolean().default(true),
        requestsPerInterval: z.number().min(1).default(10),
        interval: z.number().min(1000).default(60000),
      })
      .default({}),

    /** Maximum pending requests in the acquire queue. 0 = unlimited. (#3 Queue Overflow) */
    maxQueueSize: z.number().min(0).max(1000).default(50),

    /** Health check interval (ms). 0 = disabled. (#6 Health Check) */
    healthCheckInterval: z.number().min(0).max(300000).default(60000),

    /** Zombie detection timeout (ms) — busy longer than this → force terminate. (#8 Zombie) */
    zombieTimeout: z.number().min(30000).max(1800000).default(600000),

    /** Enable hedged requests for critical tasks. (#12 Hedging) */
    hedging: z
      .object({
        enabled: z.boolean().default(false),
        criticalOnly: z.boolean().default(true),
      })
      .default({}),

    /** Spawn retry configuration. (#10 Spawn Retry) */
    spawnRetry: z
      .object({
        maxRetries: z.number().min(0).max(5).default(3),
        baseDelay: z.number().min(500).max(10000).default(1000),
        maxDelay: z.number().min(1000).max(60000).default(8000),
      })
      .default({}),

    /** Adaptive scaling. (#14) */
    adaptiveScaling: z
      .object({
        enabled: z.boolean().default(false),
        /** Moving average window size for queue length sampling. */
        windowSize: z.number().min(5).max(100).default(20),
        /** Scale-up if avg queue > this factor × current scaleUpThreshold. */
        scaleFactor: z.number().min(0.5).max(5).default(1.5),
      })
      .default({}),

    /** Pool drain mode. (#13) When true, stop accepting new tasks; finish current. */
    drainOnShutdown: z.boolean().default(true),
  })
  // ============================================================================
  // #5 — Logical constraint validation (.refine)
  // ============================================================================
  .refine((cfg) => cfg.maxInstances >= cfg.minInstances, {
    message: 'maxInstances must be >= minInstances',
    path: ['maxInstances'],
  })
  .refine((cfg) => cfg.spawnTimeout < cfg.perInstanceTimeout, {
    message: 'spawnTimeout must be < perInstanceTimeout',
    path: ['spawnTimeout'],
  })
  .refine((cfg) => cfg.zombieTimeout >= cfg.perInstanceTimeout, {
    message: 'zombieTimeout should be >= perInstanceTimeout',
    path: ['zombieTimeout'],
  });

/** Inferred TypeScript type for Claude instances config */
export type ClaudeInstancesConfig = z.infer<typeof ClaudeInstancesConfigSchema>;

// =============================================================================
// #20 — Environment Variable Overrides
// =============================================================================

/**
 * Apply environment variable overrides on top of parsed config.
 * Supported env vars:
 *   CLAUDE_POOL_ENABLED          = "true" | "false"
 *   CLAUDE_POOL_MIN_INSTANCES    = number
 *   CLAUDE_POOL_MAX_INSTANCES    = number
 *   CLAUDE_POOL_STRATEGY         = "least-loaded" | "round-robin" | "agent-affinity"
 *   CLAUDE_POOL_ACQUIRE_TIMEOUT  = ms
 *   CLAUDE_POOL_MAX_QUEUE_SIZE   = number
 */
export function applyEnvOverrides(config: ClaudeInstancesConfig): ClaudeInstancesConfig {
  const env = process.env;
  const result = { ...config };

  if (env.CLAUDE_POOL_ENABLED !== undefined) {
    result.enabled = env.CLAUDE_POOL_ENABLED === 'true' || env.CLAUDE_POOL_ENABLED === '1';
  }
  if (env.CLAUDE_POOL_MIN_INSTANCES) {
    const v = parseInt(env.CLAUDE_POOL_MIN_INSTANCES, 10);
    if (!Number.isNaN(v) && v >= 1) result.minInstances = v;
  }
  if (env.CLAUDE_POOL_MAX_INSTANCES) {
    const v = parseInt(env.CLAUDE_POOL_MAX_INSTANCES, 10);
    if (!Number.isNaN(v) && v >= 1) result.maxInstances = Math.max(v, result.minInstances);
  }
  if (env.CLAUDE_POOL_STRATEGY) {
    const s = env.CLAUDE_POOL_STRATEGY;
    if (['least-loaded', 'round-robin', 'agent-affinity'].includes(s)) {
      result.strategy = s as ClaudeInstancesConfig['strategy'];
    }
  }
  if (env.CLAUDE_POOL_ACQUIRE_TIMEOUT) {
    const v = parseInt(env.CLAUDE_POOL_ACQUIRE_TIMEOUT, 10);
    if (!Number.isNaN(v) && v >= 5000) result.acquireTimeout = v;
  }
  if (env.CLAUDE_POOL_MAX_QUEUE_SIZE) {
    const v = parseInt(env.CLAUDE_POOL_MAX_QUEUE_SIZE, 10);
    if (!Number.isNaN(v) && v >= 0) result.maxQueueSize = v;
  }

  return result;
}

// =============================================================================
// Default Configuration
// =============================================================================

// =============================================================================
// #20 — Config File Watcher (Hot-Reload)
// =============================================================================

/**
 * Watch a JSON config file for changes and invoke callback with updated config.
 * Returns a cleanup function to stop watching.
 *
 * Usage:
 *   const stop = watchConfigFile('./hydra-config.json', (newConfig) => {
 *     manager.updateConfig(newConfig);
 *   });
 */
export function watchConfigFile(
  filePath: string,
  onUpdate: (config: ClaudeInstancesConfig) => void,
  options: { debounceMs?: number } = {},
): () => void {
  // Dynamic import to avoid top-level fs dependency in browser contexts
  let watcher: any = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = options.debounceMs ?? 500;

  (async () => {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const resolvedPath = path.resolve(filePath);

      watcher = fs.watch(resolvedPath, (eventType) => {
        if (eventType !== 'change') return;

        // Debounce rapid file saves
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            const raw = fs.readFileSync(resolvedPath, 'utf-8');
            const json = JSON.parse(raw);

            // Validate and parse through schema
            const parsed = ClaudeInstancesConfigSchema.parse(json.claudeInstances || json);
            const withEnv = applyEnvOverrides(parsed);

            onUpdate(withEnv);
          } catch (err) {
            // Silently ignore parse errors — don't crash on malformed saves
            console.warn(
              `[config-watcher] Failed to reload ${resolvedPath}: ${(err as Error).message}`,
            );
          }
        }, debounceMs);
      });
    } catch {
      // fs.watch not available (browser, test env) — no-op
    }
  })();

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (watcher) {
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
    }
  };
}

// =============================================================================
// Default Configuration
// =============================================================================

/** Default values for Claude instances config (matches schema defaults) */
export const DEFAULT_CLAUDE_INSTANCES_CONFIG: ClaudeInstancesConfig = {
  enabled: false,
  minInstances: 1,
  maxInstances: 5,
  acquireTimeout: 60000,
  strategy: 'least-loaded',
  scaleDownIdleTime: 300000,
  scaleUpThreshold: 2,
  maxConsecutiveFailures: 3,
  spawnTimeout: 30000,
  perInstanceTimeout: 300000,
  rateLimit: {
    enabled: true,
    requestsPerInterval: 10,
    interval: 60000,
  },
  maxQueueSize: 50,
  healthCheckInterval: 60000,
  zombieTimeout: 600000,
  hedging: {
    enabled: false,
    criticalOnly: true,
  },
  spawnRetry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 8000,
  },
  adaptiveScaling: {
    enabled: false,
    windowSize: 20,
    scaleFactor: 1.5,
  },
  drainOnShutdown: true,
};
