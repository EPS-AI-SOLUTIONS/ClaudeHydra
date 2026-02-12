/**
 * Storage layer — migrated from SQLite (better-sqlite3) to Upstash Redis KV.
 *
 * This module re-exports the KV client and provides a compatibility shim
 * so that existing Route Handlers continue to compile during the migration
 * to Hono (Phase 3). Each Route Handler will be replaced by a Hono route
 * that calls KV directly.
 *
 * @deprecated Route Handlers should import from @/lib/kv directly.
 */

import { getKv, KV_KEYS } from './kv';

// ── Re-export for backward compatibility ────────────────────────────────────

export { getKv, KV_KEYS };

// ── Generate unique IDs (unchanged) ─────────────────────────────────────────

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Compatibility shim ──────────────────────────────────────────────────────
// Returns a mock that satisfies db.prepare(...).all/get/run() calls
// with empty results. This allows the build to pass while we migrate
// Route Handlers → Hono routes in Phase 3.

interface StmtResult {
  all: (..._args: unknown[]) => unknown[];
  get: (..._args: unknown[]) => unknown | undefined;
  run: (..._args: unknown[]) => { changes: number; lastInsertRowid: number };
}

interface DbShim {
  prepare: (_sql: string) => StmtResult;
  exec: (_sql: string) => void;
  pragma: (_pragma: string) => unknown;
}

const noopStmt: StmtResult = {
  all: () => [],
  get: () => undefined,
  run: () => ({ changes: 0, lastInsertRowid: 0 }),
};

const dbShim: DbShim = {
  prepare: () => noopStmt,
  exec: () => {},
  pragma: () => undefined,
};

/**
 * @deprecated Use `getKv()` from `@/lib/kv` instead.
 * This shim returns a noop mock so the build compiles.
 * Real data access happens via Hono routes + KV.
 */
export function getDb(): DbShim {
  console.warn('[DB] getDb() called — this is a noop shim. Migrate to KV via Hono routes.');
  return dbShim;
}
