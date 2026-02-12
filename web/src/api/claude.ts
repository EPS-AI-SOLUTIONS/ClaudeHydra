import { Hono } from 'hono';
import { generateId } from '@/lib/db';
import { EVENTS, eventBus } from '@/lib/event-bus';
import { getKv, KV_KEYS } from '@/lib/kv';

const app = new Hono();

// ── GET /claude/events — SSE stream ───────────────────────────────────────────
app.get('/events', async (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      const onClaudeEvent = (data: unknown) => send('claude-event', data);
      const onApprovalRequired = (data: unknown) => send('approval-required', data);
      const onAutoApproved = (data: unknown) => send('auto-approved', data);
      const onSessionEnded = (data: unknown) => send('session-ended', data);

      eventBus.on(EVENTS.CLAUDE_EVENT, onClaudeEvent);
      eventBus.on(EVENTS.APPROVAL_REQUIRED, onApprovalRequired);
      eventBus.on(EVENTS.AUTO_APPROVED, onAutoApproved);
      eventBus.on(EVENTS.SESSION_ENDED, onSessionEnded);

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Cleanup on cancel
      c.req.raw.signal.addEventListener('abort', () => {
        eventBus.off(EVENTS.CLAUDE_EVENT, onClaudeEvent);
        eventBus.off(EVENTS.APPROVAL_REQUIRED, onApprovalRequired);
        eventBus.off(EVENTS.AUTO_APPROVED, onAutoApproved);
        eventBus.off(EVENTS.SESSION_ENDED, onSessionEnded);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// ── GET /claude/history — list approval history ───────────────────────────────
app.get('/history', async (c) => {
  const kv = getKv();
  const ids = await kv.zrange(KV_KEYS.approvalHistoryList, 0, -1, {
    rev: true,
  });

  if (!ids.length) return c.json([]);

  const pipe = kv.pipeline();
  for (const id of ids.slice(0, 200)) pipe.get(KV_KEYS.approvalHistory(id as string));
  const results = await pipe.exec();

  return c.json(results.filter(Boolean));
});

// ── POST /claude/history — create approval record ─────────────────────────────
app.post('/history', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { approval_type, action, auto_approved, matched_rule } = body as {
    approval_type?: string;
    action?: string;
    auto_approved?: boolean;
    matched_rule?: string;
  };

  if (!approval_type || !action) {
    return c.json({ error: 'approval_type and action are required' }, 400);
  }

  const kv = getKv();
  const id = generateId();
  const now = new Date().toISOString();

  const entry = {
    id,
    approval_type,
    action,
    auto_approved: auto_approved ?? false,
    matched_rule: matched_rule ?? null,
    created_at: now,
  };

  await kv.set(KV_KEYS.approvalHistory(id), entry);
  await kv.zadd(KV_KEYS.approvalHistoryList, {
    score: Date.now(),
    member: id,
  });

  return c.json(entry, 201);
});

// ── DELETE /claude/history — clear all history ────────────────────────────────
app.delete('/history', async (c) => {
  const kv = getKv();
  const ids = await kv.zrange(KV_KEYS.approvalHistoryList, 0, -1);

  if (ids.length) {
    const pipe = kv.pipeline();
    for (const id of ids) pipe.del(KV_KEYS.approvalHistory(id as string));
    await pipe.exec();
  }
  await kv.del(KV_KEYS.approvalHistoryList);

  return c.json({ ok: true });
});

// ── GET /claude/rules — list approval rules ───────────────────────────────────
app.get('/rules', async (c) => {
  const kv = getKv();
  const ids = await kv.zrange(KV_KEYS.approvalRuleList, 0, -1);

  if (!ids.length) return c.json([]);

  const pipe = kv.pipeline();
  for (const id of ids) pipe.get(KV_KEYS.approvalRule(id as string));
  const results = await pipe.exec();

  return c.json(results.filter(Boolean));
});

// ── POST /claude/rules — create approval rule ─────────────────────────────────
app.post('/rules', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, description, pattern, tool, enabled, auto_approve } = body as {
    name?: string;
    description?: string;
    pattern?: string;
    tool?: string;
    enabled?: boolean;
    auto_approve?: boolean;
  };

  if (!name || !pattern) {
    return c.json({ error: 'name and pattern are required' }, 400);
  }

  const kv = getKv();
  const id = generateId();
  const now = new Date().toISOString();

  const rule = {
    id,
    name,
    description: description ?? null,
    pattern,
    tool: tool ?? '*',
    enabled: enabled ?? true,
    auto_approve: auto_approve ?? false,
    created_at: now,
  };

  await kv.set(KV_KEYS.approvalRule(id), rule);
  await kv.zadd(KV_KEYS.approvalRuleList, {
    score: Date.now(),
    member: id,
  });

  return c.json(rule, 201);
});

export default app;
