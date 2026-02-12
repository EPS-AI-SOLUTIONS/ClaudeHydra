import os from 'node:os';
import { Hono } from 'hono';

const app = new Hono();

// ── GET /system/cpu — system info ─────────────────────────────────────────────
app.get('/cpu', async (c) => {
  const cpus = os.cpus();
  const first = cpus[0];

  return c.json({
    model: first?.model || 'Unknown',
    cores: cpus.length,
    speed: first?.speed || 0,
    loadAvg: os.loadavg(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
  });
});

export default app;
