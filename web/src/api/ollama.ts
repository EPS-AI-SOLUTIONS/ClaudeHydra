import { Hono } from 'hono';

const app = new Hono();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// ── GET /ollama-local/health ────────────────────────────────────────────────
app.get('/health', async (c) => {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    return c.json({ ok: true, url: OLLAMA_URL });
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Ollama unreachable',
        url: OLLAMA_URL,
      },
      502,
    );
  }
});

// ── GET /ollama-local/models ────────────────────────────────────────────────
app.get('/models', async (c) => {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = (await res.json()) as {
      models: Array<{
        name: string;
        size: number;
        digest: string;
        modified_at: string;
      }>;
    };
    const models = (data.models || []).map((m) => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modified_at: m.modified_at,
    }));
    return c.json(models);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Ollama unreachable' }, 502);
  }
});

// ── POST /ollama-local/generate — one-shot generation ───────────────────────
app.post('/generate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { prompt, model } = body as { prompt?: string; model?: string };

  if (!prompt || !model) {
    return c.json({ error: 'prompt and model are required' }, 400);
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Ollama error' }, 502);
  }
});

// ── POST /ollama-local/chat — streaming or sync chat ────────────────────────
app.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const {
    model,
    messages,
    stream = true,
  } = body as {
    model?: string;
    messages?: Array<{ role: string; content: string }>;
    stream?: boolean;
  };

  if (!model || !messages) {
    return c.json({ error: 'model and messages are required' }, 400);
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream }),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}`);

    if (stream && res.body) {
      // Return raw NDJSON stream
      return new Response(res.body, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const data = await res.json();
    return c.json(data);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Ollama error' }, 502);
  }
});

export default app;
