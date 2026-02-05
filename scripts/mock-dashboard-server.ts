/**
 * Mock Dashboard Server for E2E Testing
 * Simple HTTP server that serves static responses for Playwright tests
 */

import { createServer } from 'http';

const PORT = 8080;

const mockResponses = {
  '/': {
    status: 200,
    contentType: 'text/html',
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HYDRA Command Center</title>
  <style>
    body { font-family: monospace; background: #0a1f0a; color: #0f0; }
    .xterm-rows { white-space: pre; }
  </style>
</head>
<body>
  <div id="app">
    <h3>HYDRA Status</h3>
    <div id="status-indicator">Online</div>
    <div id="cpu-val">45%</div>
    <div id="ram-val">8.2 GB</div>
    <canvas id="resourceChart"></canvas>
    <div id="terminal-container">
      <div class="xterm-rows">Test warning log - System initialized</div>
    </div>
  </div>
</body>
</html>`
  },
  '/api/health': {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', version: '2.0.0', uptime: 1000 })
  },
  '/api/status': {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      providers: ['ollama', 'gemini'],
      activeProvider: 'ollama',
      models: ['llama3.2:3b', 'qwen2.5-coder:1.5b']
    })
  }
};

const server = createServer((req, res) => {
  const path = req.url?.split('?')[0] || '/';
  const mock = mockResponses[path];

  if (mock) {
    res.writeHead(mock.status, { 'Content-Type': mock.contentType });
    res.end(mock.body);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Mock dashboard server running at http://localhost:${PORT}`);
});
