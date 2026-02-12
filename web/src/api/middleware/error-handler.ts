import type { Context, Next } from 'hono';

/**
 * Central error handler middleware for Hono.
 * Catches all unhandled errors, logs them, and returns a consistent JSON shape.
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[api]', c.req.method, c.req.path, message);
    return c.json({ error: message }, 500);
  }
}
