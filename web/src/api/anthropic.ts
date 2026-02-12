import { Hono } from 'hono';

const app = new Hono();

// ── GET /anthropic/models — static model list ─────────────────────────────────
app.get('/models', async (c) => {
  return c.json([
    {
      id: 'claude-opus-4-6',
      name: 'Claude Opus 4.6',
      description: 'Most capable model for complex tasks',
      maxTokens: 200000,
    },
    {
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      description: 'Balanced performance and speed',
      maxTokens: 200000,
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      description: 'Fast and cost-effective',
      maxTokens: 200000,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'Previous generation balanced model',
      maxTokens: 200000,
    },
  ]);
});

export default app;
