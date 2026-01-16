#!/usr/bin/env node
/**
 * Gemini CLI Status Line - HYDRA EDITION v2
 *
 * FULL:    AI | Model | Context | Tokens | Limits | [MCP] | Sys:CPU/RAM
 * COMPACT: AI | Model | Ctx | I/O | Lim | MCP | C%/R%
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Config paths
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

const TERMINAL_WIDTH = process.stdout.columns || 120;
const COMPACT_MODE = process.env.STATUSLINE_COMPACT === '1' || TERMINAL_WIDTH < 100;

// Colors (using ANSI codes)
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', blink: '\x1b[5m',
  gray: '\x1b[90m',
  neonRed: '\x1b[91m', neonGreen: '\x1b[92m', neonYellow: '\x1b[93m',
  neonBlue: '\x1b[94m', neonMagenta: '\x1b[95m', neonCyan: '\x1b[96m', neonWhite: '\x1b[97m',
};

// Load settings
try {
  JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
} catch (_e) {
  // ignore
}
// settings is unused but we keep the read for potential future use or validation
// actually, just suppress the warning by using it or removing it?
// Let's just suppress lint for this block or use _settings
// Wait, settings is defined with 'let settings = {}'.
// If I change it to 'let _settings' I need to change usage in try block.
// Better: remove settings variable if it's truly unused.
// In checkOllamaStatus, it is not used.
// It seems unused.
// Removing it entirely.

// Load settings (check for existence only)
try {
  JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
} catch (_e) {
  // ignore
}

// Helper functions
function getStatusColor(status) {
  if (status === 'active' || status === 'on' || status === 'ok') return c.neonGreen;
  if (status === 'busy' || status === 'thinking') return c.neonBlue + c.blink;
  if (status === 'error' || status === 'off') return c.neonRed;
  return c.gray;
}

function getResourceColor(percent) {
  if (percent >= 90) return c.neonRed + c.bold;
  if (percent >= 75) return c.neonRed;
  if (percent >= 50) return c.neonYellow;
  return c.neonGreen;
}

function checkAIHandler() {
  // Check environment variable set by PowerShell profile/launcher
  const status = process.env.AI_HANDLER_STATUS || 'unknown';
  const provider = process.env.AI_PROVIDER || 'Auto';
  return { status, provider };
}

function checkDeepThinking() {
  // Check env var for Thinking Mode (0=Off, 1=On, 2=Deep)
  const mode = process.env.GEMINI_DEEP_THINKING || '0';
  return mode !== '0';
}

function checkOllamaStatus() {
  let running = false;
  let modelCount = 0;
  try {
    if (process.platform === 'win32') {
      const output = execSync('tasklist /FI "IMAGENAME eq ollama.exe" /NH 2>nul', { encoding: 'utf8', timeout: 1000, windowsHide: true });
      running = output.toLowerCase().includes('ollama.exe');
    } else {
      const output = execSync('pgrep -x ollama 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 1000 });
      running = output.trim().length > 0;
    }
    
    // Quick check only if running (timeout sensitive)
    if (running && !process.env.SKIP_OLLAMA_CHECK) {
       // logic skipped for speed in statusline
       modelCount = '?'; 
    }
  } catch (_e) { running = false; }
  return { running, models: modelCount };
}

function getSystemResources() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.round((usedMem / totalMem) * 100);
  const ramUsedGB = (usedMem / (1024 ** 3)).toFixed(1);
  const ramTotalGB = (totalMem / (1024 ** 3)).toFixed(1);

  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  const cpuPercent = Math.round(100 - (totalIdle / totalTick * 100));

  return {
    cpu: { percent: cpuPercent, cores: cpus.length },
    ram: { percent: ramPercent, usedGB: ramUsedGB, totalGB: ramTotalGB }
  };
}

// Data processing
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => { let chunk; while ((chunk = process.stdin.read()) !== null) inputData += chunk; });

process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(inputData); } catch (_e) {}
  printStatusLine(data);
});

// Timeout fallback (if no input)
setTimeout(() => {
  if (!inputData) {
    // Check for --tooltip argument
    const isTooltip = process.argv.includes('--tooltip');
    printStatusLine({}, isTooltip);
  }
}, 50);

function printStatusLine(_data, isTooltip = false) {
  const parts = [];
  const ollama = checkOllamaStatus();
  const res = getSystemResources();
  const aiHandler = checkAIHandler();
  const isThinking = checkDeepThinking();
  
  // 1. AI Handler Status
  const handlerColor = getStatusColor(aiHandler.status === 'active' ? 'active' : 'off');
  const handlerText = aiHandler.status === 'active' ? 'Active' : 'Inactive';
  
  if (isTooltip) {
    parts.push(`AI Handler: ${handlerColor}${handlerText}${c.reset} (Provider: ${c.bold}${aiHandler.provider}${c.reset})`);
  } else if (COMPACT_MODE) {
    parts.push(`${c.bold}H:${handlerColor}${handlerText[0]}${c.reset}`);
  } else {
    parts.push(`${c.bold}Handler:${handlerColor}${handlerText}${c.reset}${c.gray}(${aiHandler.provider})${c.reset}`);
  }

  // 2. Deep Thinking Status
  if (isTooltip) {
    parts.push(`Deep Thinking: ${isThinking ? c.neonMagenta + 'ON' : c.dim + 'OFF'}${c.reset} (Toggle: ${c.bold}Alt+t${c.reset})`);
  } else if (isThinking) {
    parts.push(`${c.neonMagenta}${c.blink}Deep${c.reset}`);
  }

  // 3. MCP Servers (Ollama check implied here)
  const ollamaColor = ollama.running ? c.neonGreen : c.neonRed;
  const ollamaStatusText = ollama.running ? 'Running' : 'Not Found';
  
  if (isTooltip) {
    parts.push(`Ollama: ${ollamaColor}${ollamaStatusText}${c.reset}`);
  } else if (COMPACT_MODE) {
    parts.push(`O:${ollamaColor}${ollama.running ? '●' : '○'}${c.reset}`);
  } else {
    parts.push(`${c.gray}Ollama:${ollamaColor}${ollama.running ? 'ON' : 'OFF'}${c.reset}`);
  }

  // 4. System Resources
  if (isTooltip) {
    parts.push(`CPU: ${getResourceColor(res.cpu.percent)}${res.cpu.percent}%${c.reset} | RAM: ${getResourceColor(res.ram.percent)}${res.ram.percent}%${c.reset} (${res.ram.usedGB}G / ${res.ram.totalGB}G)`);
  } else if (COMPACT_MODE) {
    parts.push(`${getResourceColor(res.cpu.percent)}C${res.cpu.percent}%${c.reset}${getResourceColor(res.ram.percent)}R${res.ram.percent}%${c.reset}`);
  } else {
    parts.push(`${c.gray}Sys:${c.reset}${getResourceColor(res.cpu.percent)}CPU ${res.cpu.percent}%${c.reset} ${getResourceColor(res.ram.percent)}RAM ${res.ram.usedGB}G${c.reset}`);
  }
  
  const separator = isTooltip ? ` ${c.gray}|${c.reset} ` : (COMPACT_MODE ? ` ${c.gray}|${c.reset} ` : ` ${c.gray}|${c.reset} `);
  console.log(parts.join(separator));
  process.exit(0);
}

