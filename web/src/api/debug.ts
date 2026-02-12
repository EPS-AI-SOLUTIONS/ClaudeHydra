import { Hono } from 'hono';
import { clearDebugLogs, getDebugLogs } from '@/lib/debug-logs';
import { EVENTS, eventBus } from '@/lib/event-bus';
import { getHydraStats } from '@/lib/hydra-bridge';
import { getKv } from '@/lib/kv';

const app = new Hono();

// ── GET /debug/stats ──────────────────────────────────────────────────────────
app.get('/stats', async (c) => {
  const kv = getKv();

  const [sessionCount, messageKeys, memoryKeys, hydraStats] = await Promise.all([
    kv.zcard('cs:list'),
    kv.keys('cm:*'),
    kv.keys('am:*'),
    getHydraStats().catch(() => null),
  ]);

  const messageCount = messageKeys.filter((k) => !k.startsWith('cm:by-session:')).length;
  const memoryCount = memoryKeys.filter((k) => !k.startsWith('am:by-agent:')).length;

  const mem = process.memoryUsage();

  return c.json({
    db: {
      sessions: sessionCount,
      messages: messageCount,
      memories: memoryCount,
    },
    hydra: hydraStats || null,
    uptime: process.uptime(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    node: process.version,
  });
});

// ── GET /debug/logs ───────────────────────────────────────────────────────────
app.get('/logs', async (c) => {
  const logs = getDebugLogs(100);
  return c.json(logs);
});

// ── DELETE /debug/logs ────────────────────────────────────────────────────────
app.delete('/logs', async (c) => {
  clearDebugLogs();
  return c.json({ ok: true });
});

// ── GET /debug/snapshot ───────────────────────────────────────────────────────
app.get('/snapshot', async (c) => {
  const kv = getKv();

  try {
    // Last 10 sessions
    const sessionIds = await kv.zrange('cs:list', 0, 9, { rev: true });
    let sessions: unknown[] = [];
    if (sessionIds.length) {
      const pipe = kv.pipeline();
      for (const id of sessionIds) pipe.get(`cs:${id}`);
      sessions = (await pipe.exec()).filter(Boolean);
    }

    // Last 20 messages (scan cm: keys)
    const msgKeys = (await kv.keys('cm:*'))
      .filter((k) => !k.startsWith('cm:by-session:'))
      .slice(0, 20);
    let messages: unknown[] = [];
    if (msgKeys.length) {
      const pipe = kv.pipeline();
      for (const k of msgKeys) pipe.get(k);
      messages = (await pipe.exec()).filter(Boolean);
    }

    // Last 20 agent memories
    const memKeys = (await kv.keys('am:*'))
      .filter((k) => !k.startsWith('am:by-agent:'))
      .slice(0, 20);
    let memories: unknown[] = [];
    if (memKeys.length) {
      const pipe = kv.pipeline();
      for (const k of memKeys) pipe.get(k);
      memories = (await pipe.exec()).filter(Boolean);
    }

    // All preferences
    const prefKeys = await kv.keys('pref:*');
    let preferences: unknown[] = [];
    if (prefKeys.length) {
      const pipe = kv.pipeline();
      for (const k of prefKeys) pipe.get(k);
      preferences = (await pipe.exec()).filter(Boolean);
    }

    const hydraStats = await getHydraStats().catch(() => null);
    const mem = process.memoryUsage();

    return c.json({
      timestamp: new Date().toISOString(),
      sessions,
      messages,
      memories,
      preferences,
      process: {
        uptime: process.uptime(),
        memory: { rss: mem.rss, heapUsed: mem.heapUsed },
        node: process.version,
        pid: process.pid,
      },
      hydra: hydraStats || null,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Snapshot error' }, 500);
  }
});

// ── GET /debug/stream — SSE ───────────────────────────────────────────────────
app.get('/stream', async (c) => {
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

      const onLog = (data: unknown) => send('debug-log', data);
      eventBus.on(EVENTS.DEBUG_LOG, onLog);

      // Heartbeat every 20s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20_000);

      // Cleanup on cancel
      c.req.raw.signal.addEventListener('abort', () => {
        eventBus.off(EVENTS.DEBUG_LOG, onLog);
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

export default app;
