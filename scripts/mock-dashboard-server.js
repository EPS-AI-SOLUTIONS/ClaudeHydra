import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATIC_DIR = path.join(__dirname, '../src/dashboard/static');
const PORT = 8080;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Mocks
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'Online',
      version: 'TEST-v2.0',
      mode: 'Test'
    }));
    return;
  }

  if (req.url === '/api/system') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      cpu_usage: 45.5,
      memory_used: 1024 * 1024 * 1024 * 4, // 4GB
      memory_total: 1024 * 1024 * 1024 * 16,
      uptime: 3600,
      platform: 'TestOS'
    }));
    return;
  }

  if (req.url === '/api/logs') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`[INFO] System started
[INFO] Loaded plugins
[WARN] Test warning log
[INFO] User connected`);
    return;
  }

  // Static Files
  let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Basic security
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Access denied');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Mock Dashboard Server running at http://localhost:${PORT}`);
});