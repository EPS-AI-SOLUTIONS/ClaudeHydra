import 'dotenv/config';

import { accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkHealth } from '../src/ollama-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const results = {
  ok: 0,
  warn: 0,
  fail: 0
};

const log = (level, message) => {
  console.log(`[${level}] ${message}`);
};

const ok = (message) => {
  results.ok += 1;
  log('ok', message);
};

const warn = (message) => {
  results.warn += 1;
  log('warn', message);
};

const fail = (message) => {
  results.fail += 1;
  log('fail', message);
};

const hasPath = (path) => {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const canRunPowerShell = (command) => {
  const result = spawnSync(
    command,
    ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'],
    {
      stdio: 'ignore'
    }
  );
  if (result.error) return false;
  return result.status === 0;
};

const resolvePowerShell = () => {
  const candidates =
    process.platform === 'win32'
      ? ['powershell.exe', 'pwsh']
      : ['pwsh', 'powershell'];
  for (const candidate of candidates) {
    if (canRunPowerShell(candidate)) return candidate;
  }
  return null;
};

const nodeMajor = Number.parseInt(
  process.versions.node.split('.')[0] ?? '0',
  10
);
if (nodeMajor >= 20) {
  ok(`Node.js ${process.versions.node} (>=20)`);
} else {
  fail(`Node.js ${process.versions.node} (requires >=20)`);
}

if (hasPath(join(repoRoot, 'package.json'))) {
  ok('package.json present');
} else {
  fail('package.json missing');
}

if (hasPath(join(repoRoot, 'src', 'server.js'))) {
  ok('src/server.js present');
} else {
  fail('src/server.js missing');
}

if (hasPath(join(repoRoot, 'scripts', 'launcher', 'index.mjs'))) {
  ok('scripts/launcher/index.mjs present');
} else {
  warn('scripts/launcher/index.mjs missing');
}

if (hasPath(join(repoRoot, '_launcher.ps1'))) {
  ok('_launcher.ps1 present');
} else {
  warn('_launcher.ps1 missing (launcher will fall back to npm start)');
}

const nodeModulesPath = join(repoRoot, 'node_modules');
if (hasPath(nodeModulesPath)) {
  ok('node_modules present');
} else {
  warn('node_modules missing (run npm install)');
}

if (hasPath(join(repoRoot, '.env'))) {
  ok('.env present');
} else {
  warn('Missing .env (copy .env.example to .env)');
}

if (process.env.GEMINI_API_KEY) {
  ok('GEMINI_API_KEY set');
} else {
  warn('GEMINI_API_KEY not set');
}

if (process.env.CACHE_ENCRYPTION_KEY) {
  ok('CACHE_ENCRYPTION_KEY set');
} else {
  warn('CACHE_ENCRYPTION_KEY not set');
}

const psCommand = resolvePowerShell();
if (psCommand) {
  ok(`PowerShell available (${psCommand})`);
} else {
  warn('PowerShell not available');
}

const health = await checkHealth();
if (health.available) {
  const modelCount = Array.isArray(health.models) ? health.models.length : 0;
  ok(`Ollama reachable at ${health.host} (${modelCount} models)`);
} else {
  const host =
    health.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
  fail(`Ollama not reachable at ${host}: ${health.error || 'unknown error'}`);
}

if (results.fail > 0) {
  log(
    'fail',
    `Doctor found ${results.fail} failure(s), ${results.warn} warning(s).`
  );
  process.exitCode = 1;
} else if (results.warn > 0) {
  log('warn', `Doctor found ${results.warn} warning(s).`);
} else {
  log('ok', 'All checks passed.');
}
