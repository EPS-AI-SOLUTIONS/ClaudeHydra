import { Hono } from 'hono';
import { z } from 'zod';
import { generateId } from '@/lib/db';
import { getKv, KV_KEYS } from '@/lib/kv';

const app = new Hono();

// ── GET /chats — list sessions ──────────────────────────────────────────────
app.get('/', async (c) => {
  const kv = getKv();
  const ids = await kv.zrange(KV_KEYS.sessionList, 0, -1, { rev: true });
  if (!ids.length) return c.json([]);

  const pipe = kv.pipeline();
  for (const id of ids) pipe.get(KV_KEYS.session(id as string));
  const results = await pipe.exec();
  return c.json(results.filter(Boolean));
});

// ── POST /chats — create session ────────────────────────────────────────────
app.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = generateId();
  const now = new Date().toISOString();

  const session = {
    id,
    title: body.title || 'New Chat',
    provider: body.provider || 'ollama',
    model: body.model || 'default',
    created_at: now,
    updated_at: now,
    message_count: 0,
  };

  const kv = getKv();
  await kv.set(KV_KEYS.session(id), session);
  await kv.zadd(KV_KEYS.sessionList, { score: Date.now(), member: id });

  return c.json(session, 201);
});

// ── GET /chats/:id — get session ────────────────────────────────────────────
app.get('/:id', async (c) => {
  const { id } = c.req.param();
  const kv = getKv();
  const session = await kv.get(KV_KEYS.session(id));
  if (!session) return c.json({ error: 'Session not found' }, 404);
  return c.json(session);
});

// ── PATCH /chats/:id — update session ───────────────────────────────────────
app.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const kv = getKv();
  const existing = await kv.get<Record<string, unknown>>(KV_KEYS.session(id));
  if (!existing) return c.json({ error: 'Session not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const allowedFields = ['title', 'model', 'provider'];
  let updated = false;

  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      (existing as Record<string, unknown>)[key] = body[key];
      updated = true;
    }
  }

  if (!updated) return c.json({ error: 'No fields to update' }, 400);

  existing.updated_at = new Date().toISOString();
  await kv.set(KV_KEYS.session(id), existing);

  return c.json(existing);
});

// ── DELETE /chats/:id — delete session + messages ───────────────────────────
app.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const kv = getKv();

  // Delete all messages for this session
  const msgIds = await kv.zrange(KV_KEYS.messagesBySession(id), 0, -1);
  if (msgIds.length) {
    const pipe = kv.pipeline();
    for (const mid of msgIds) pipe.del(KV_KEYS.message(mid as string));
    await pipe.exec();
  }
  await kv.del(KV_KEYS.messagesBySession(id));

  // Delete session itself
  await kv.del(KV_KEYS.session(id));
  await kv.zrem(KV_KEYS.sessionList, id);

  return c.json({ ok: true });
});

// ── GET /chats/:id/messages — list messages ─────────────────────────────────
app.get('/:id/messages', async (c) => {
  const { id } = c.req.param();
  const kv = getKv();
  const msgIds = await kv.zrange(KV_KEYS.messagesBySession(id), 0, -1);
  if (!msgIds.length) return c.json([]);

  const pipe = kv.pipeline();
  for (const mid of msgIds) pipe.get(KV_KEYS.message(mid as string));
  const results = await pipe.exec();
  return c.json(results.filter(Boolean));
});

// ── POST /chats/:id/messages — add message ──────────────────────────────────
app.post('/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const kv = getKv();

  const id = generateId();
  const now = new Date().toISOString();

  const message = {
    id,
    session_id: sessionId,
    role: body.role || 'user',
    content: body.content || '',
    model: body.model || null,
    tokens: body.tokens || null,
    created_at: now,
  };

  await kv.set(KV_KEYS.message(id), message);
  await kv.zadd(KV_KEYS.messagesBySession(sessionId), {
    score: Date.now(),
    member: id,
  });

  // Update session message count + updated_at
  const session = await kv.get<Record<string, unknown>>(KV_KEYS.session(sessionId));
  if (session) {
    session.message_count = ((session.message_count as number) || 0) + 1;
    session.updated_at = now;
    await kv.set(KV_KEYS.session(sessionId), session);
    await kv.zadd(KV_KEYS.sessionList, {
      score: Date.now(),
      member: sessionId,
    });
  }

  return c.json(message, 201);
});

export default app;
