import { Hono } from 'hono';
import { generateId } from '@/lib/db';
import { EVENTS, eventBus } from '@/lib/event-bus';
import { getHydraBridge, getHydraStats } from '@/lib/hydra-bridge';
import { getKv, KV_KEYS } from '@/lib/kv';

const app = new Hono();

// ── GET /bridge/state ───────────────────────────────────────────────────────
app.get('/state', async (c) => {
  try {
    const bridge = await getHydraBridge();
    if (!bridge) {
      return c.json({ status: 'disconnected', message: 'Hydra not available' });
    }
    const stats = await getHydraStats();
    return c.json({ status: 'connected', ...stats });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Bridge error' }, 500);
  }
});

// ── POST /bridge/approve ────────────────────────────────────────────────────
app.post('/approve', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return c.json({ error: 'id is required' }, 400);

  const kv = getKv();
  const entryId = generateId();
  const now = new Date().toISOString();

  const entry = {
    id: entryId,
    approval_type: 'manual',
    action: 'approved',
    auto_approved: false,
    matched_rule: null,
    created_at: now,
  };

  await kv.set(KV_KEYS.approvalHistory(entryId), entry);
  await kv.zadd(KV_KEYS.approvalHistoryList, {
    score: Date.now(),
    member: entryId,
  });

  eventBus.emit(EVENTS.AUTO_APPROVED, { id, action: 'approved', manual: true });

  return c.json({ ok: true, id });
});

// ── POST /bridge/reject ─────────────────────────────────────────────────────
app.post('/reject', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return c.json({ error: 'id is required' }, 400);

  const kv = getKv();
  const entryId = generateId();
  const now = new Date().toISOString();

  const entry = {
    id: entryId,
    approval_type: 'manual',
    action: 'rejected',
    auto_approved: false,
    matched_rule: null,
    created_at: now,
  };

  await kv.set(KV_KEYS.approvalHistory(entryId), entry);
  await kv.zadd(KV_KEYS.approvalHistoryList, {
    score: Date.now(),
    member: entryId,
  });

  eventBus.emit(EVENTS.AUTO_APPROVED, { id, action: 'rejected', manual: true });

  return c.json({ ok: true, id });
});

// ── POST /bridge/clear ──────────────────────────────────────────────────────
app.post('/clear', async (c) => {
  // No-op: queue managed client-side
  return c.json({ ok: true, cleared: 0 });
});

export default app;
