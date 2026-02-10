// Local dev API server for Anthropic models proxy
// Runs on port 3001, injected API key from .env
// Usage: node scripts/dev-api-server.mjs

import { createServer } from 'node:http';
import { config } from 'dotenv';

config(); // loads root .env

const PORT = 3001;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/models';
const ALLOWED_ORIGIN = 'http://localhost:4200';

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key, content-type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // #17 — Instance Pool Status HTTP Endpoint
  if (req.url === '/api/instances/status' && req.method === 'GET') {
    try {
      // Dynamic import to avoid loading the full manager in dev proxy mode
      const { getClaudeInstanceManager } = await import(
        '../src/hydra/managers/claude-instance-manager.js'
      );
      const mgr = getClaudeInstanceManager();
      const statusJSON = mgr.isInitialized
        ? mgr.getFullStatusJSON()
        : { pool: { enabled: false }, message: 'Pool not initialized' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusJSON, null, 2));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          pool: { enabled: false },
          message: `Pool module not available: ${err.message}`,
        }),
      );
    }
    return;
  }

  if (req.url !== '/api/anthropic-models' || req.method !== 'GET') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  // Key priority: user header > server env
  const userKey = req.headers['x-api-key'];
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing API Key. Set ANTHROPIC_API_KEY in .env' }));
    return;
  }

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(errorText);
      return;
    }

    const data = await response.json();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
  }
});

server.listen(PORT, () => {
  console.log(`[dev-api] Anthropic models proxy running at http://localhost:${PORT}`);
  console.log(
    `[dev-api] API key: ${process.env.ANTHROPIC_API_KEY ? `***${process.env.ANTHROPIC_API_KEY.slice(-4)}` : 'NOT SET'}`,
  );
});
