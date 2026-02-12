import { Hono } from 'hono';
import { generateId } from '@/lib/db';
import { getKv, KV_KEYS } from '@/lib/kv';

const app = new Hono();

// ── GET /learning/stats ───────────────────────────────────────────────────────
app.get('/stats', async (c) => {
  const kv = getKv();

  const [trainingCount, ragCount, prefKeys] = await Promise.all([
    kv.zcard(KV_KEYS.trainingExampleList),
    kv.zcard(KV_KEYS.ragDocumentList),
    kv.keys('pref:*'),
  ]);

  return c.json({
    training_examples: trainingCount,
    rag_documents: ragCount,
    preferences: prefKeys.length,
  });
});

// ── GET /learning/preferences ─────────────────────────────────────────────────
app.get('/preferences', async (c) => {
  const kv = getKv();
  const keys = await kv.keys('pref:*');

  if (!keys.length) return c.json([]);

  const pipe = kv.pipeline();
  for (const key of keys) pipe.get(key);
  const results = await pipe.exec();

  return c.json(results.filter(Boolean));
});

// ── POST /learning/preferences — upsert ───────────────────────────────────────
app.post('/preferences', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { key, value } = body as { key?: string; value?: unknown };

  if (!key) return c.json({ error: 'key is required' }, 400);

  const kv = getKv();
  const now = new Date().toISOString();

  const pref = { key, value: value ?? null, updated_at: now };
  await kv.set(KV_KEYS.preference(key), pref);

  return c.json(pref);
});

// ── GET /learning/training ────────────────────────────────────────────────────
app.get('/training', async (c) => {
  const kv = getKv();
  const ids = await kv.zrange(KV_KEYS.trainingExampleList, 0, -1, {
    rev: true,
  });

  if (!ids.length) return c.json([]);

  const pipe = kv.pipeline();
  for (const id of ids.slice(0, 100)) pipe.get(KV_KEYS.trainingExample(id as string));
  const results = await pipe.exec();

  return c.json(results.filter(Boolean));
});

// ── POST /learning/training ───────────────────────────────────────────────────
app.post('/training', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { prompt, response, category, rating } = body as {
    prompt?: string;
    response?: string;
    category?: string;
    rating?: number;
  };

  if (!prompt || !response) {
    return c.json({ error: 'prompt and response are required' }, 400);
  }

  const kv = getKv();
  const id = generateId();
  const now = new Date().toISOString();

  const example = {
    id,
    prompt,
    response,
    category: category || 'general',
    rating: rating ?? null,
    created_at: now,
  };

  await kv.set(KV_KEYS.trainingExample(id), example);
  await kv.zadd(KV_KEYS.trainingExampleList, {
    score: Date.now(),
    member: id,
  });

  return c.json(example, 201);
});

// ── GET /learning/rag ─────────────────────────────────────────────────────────
app.get('/rag', async (c) => {
  const kv = getKv();
  const ids = await kv.zrange(KV_KEYS.ragDocumentList, 0, -1, { rev: true });

  if (!ids.length) return c.json([]);

  const pipe = kv.pipeline();
  for (const id of ids.slice(0, 100)) pipe.get(KV_KEYS.ragDocument(id as string));
  const results = await pipe.exec();

  return c.json(results.filter(Boolean));
});

export default app;
