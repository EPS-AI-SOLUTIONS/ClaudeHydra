import { Hono } from 'hono';
import { generateId } from '@/lib/db';
import { getKv, KV_KEYS } from '@/lib/kv';

const app = new Hono();

// ── GET /memory — list agent memories ─────────────────────────────────────────
app.get('/', async (c) => {
  const agent = c.req.query('agent');
  const kv = getKv();

  try {
    if (agent) {
      const ids = await kv.zrange(KV_KEYS.memoriesByAgent(agent), 0, -1, {
        rev: true,
      });
      if (!ids.length) return c.json([]);

      const pipe = kv.pipeline();
      for (const id of ids) pipe.get(KV_KEYS.memory(id as string));
      const results = await pipe.exec();
      return c.json(results.filter(Boolean));
    }

    // No agent filter — return last 100 memories across all agents
    // Scan memory keys
    const allKeys = await kv.keys('am:*');
    const memoryKeys = allKeys.filter((k) => !k.startsWith('am:by-agent:'));

    if (!memoryKeys.length) return c.json([]);

    const pipe = kv.pipeline();
    for (const key of memoryKeys.slice(0, 100)) pipe.get(key);
    const results = await pipe.exec();
    return c.json(results.filter(Boolean));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Memory error' }, 500);
  }
});

// ── POST /memory — create memory entry ────────────────────────────────────────
app.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { agent, entry_type, content, tags } = body as {
    agent?: string;
    entry_type?: string;
    content?: string;
    tags?: string;
  };

  if (!agent || !content) {
    return c.json({ error: 'agent and content are required' }, 400);
  }

  const kv = getKv();
  const id = generateId();
  const now = new Date().toISOString();

  const entry = {
    id,
    agent,
    entry_type: entry_type || 'general',
    content,
    tags: tags || null,
    created_at: now,
  };

  await kv.set(KV_KEYS.memory(id), entry);
  await kv.zadd(KV_KEYS.memoriesByAgent(agent), {
    score: Date.now(),
    member: id,
  });

  return c.json(entry, 201);
});

// ── GET /memory/graph — knowledge graph ───────────────────────────────────────
app.get('/graph', async (c) => {
  const kv = getKv();

  try {
    const nodeIds = await kv.zrange(KV_KEYS.knowledgeNodeList, 0, -1);
    const edgeIds = await kv.zrange(KV_KEYS.knowledgeEdgeList, 0, -1);

    let nodes: unknown[] = [];
    let edges: unknown[] = [];

    if (nodeIds.length) {
      const pipe = kv.pipeline();
      for (const id of nodeIds) pipe.get(KV_KEYS.knowledgeNode(id as string));
      nodes = (await pipe.exec()).filter(Boolean);
    }

    if (edgeIds.length) {
      const pipe = kv.pipeline();
      for (const id of edgeIds) pipe.get(KV_KEYS.knowledgeEdge(id as string));
      edges = (await pipe.exec()).filter(Boolean);
    }

    return c.json({ nodes, edges });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Graph error' }, 500);
  }
});

export default app;
