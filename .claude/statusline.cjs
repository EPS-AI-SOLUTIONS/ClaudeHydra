#!/usr/bin/env node
/**
 * Claude Code CLI Status Line - AI HANDLER EDITION v5
 *
 * FULL:    AI | Model | Context | Tokens | Limits | [MCP] | Sys:CPU/RAM
 * COMPACT: AI | Model | Ctx | I/O | Lim | MCP | C%/R%
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const USAGE_FILE = path.join(os.tmpdir(), 'claude-usage-tracking.json');
const CONFIG_FILE = path.join(__dirname, '..', 'ai-models.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.local.json');

const TERMINAL_WIDTH = process.stdout.columns || 120;
const COMPACT_MODE = process.env.STATUSLINE_COMPACT === '1' || TERMINAL_WIDTH < 100;

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', blink: '\x1b[5m',
  gray: '\x1b[90m',
  neonRed: '\x1b[91m', neonGreen: '\x1b[92m', neonYellow: '\x1b[93m',
  neonBlue: '\x1b[94m', neonMagenta: '\x1b[95m', neonCyan: '\x1b[96m', neonWhite: '\x1b[97m',
};

let aiConfig;
try {
  aiConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (_e) {
  aiConfig = {
    models: {},
    tiers: { pro: { label: 'PRO', color: 'magenta' }, standard: { label: 'STD', color: 'blue' }, lite: { label: 'LITE', color: 'green' } }
  };
}

let mcpServers = [];
try {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  mcpServers = settings.enabledMcpjsonServers || [];
} catch (_e) {
  mcpServers = ['serena', 'desktop-commander', 'playwright'];
}

function getColorCode(colorName) {
  const map = { 'magenta': c.neonMagenta, 'blue': c.neonBlue, 'green': c.neonGreen, 'cyan': c.neonCyan, 'yellow': c.neonYellow, 'red': c.neonRed, 'white': c.neonWhite };
  return map[colorName] || c.neonWhite;
}

function fmt(n) {
  if (n === undefined || n === null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toString();
}

function getRemainColor(percent) {
  if (percent <= 10) return c.neonRed + c.blink + c.bold;
  if (percent <= 25) return c.neonRed;
  if (percent <= 50) return c.neonYellow;
  return c.neonGreen;
}

function getUsageColor(percent) {
  if (percent >= 90) return c.neonRed;
  if (percent >= 70) return c.neonYellow;
  return c.neonGreen;
}

function getModelConfig(modelId) {
  if (!modelId) return null;
  const id = modelId.toLowerCase();
  if (aiConfig.models[id]) return { ...aiConfig.models[id], id };
  for (const [key, model] of Object.entries(aiConfig.models)) {
    if (id.includes(key)) return { ...model, id: key };
  }
  return null;
}

function checkAIHandlerStatus() {
  let ollamaRunning = false;
  let modelCount = 0;
  try {
    if (process.platform === 'win32') {
      const output = execSync('tasklist /FI "IMAGENAME eq ollama.exe" /NH 2>nul', { encoding: 'utf8', timeout: 2000, windowsHide: true });
      ollamaRunning = output.toLowerCase().includes('ollama.exe');
    } else {
      const output = execSync('pgrep -x ollama 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 2000 });
      ollamaRunning = output.trim().length > 0;
    }
    if (ollamaRunning) {
      try {
        const modelsOutput = execSync('ollama list 2>nul', { encoding: 'utf8', timeout: 3000, windowsHide: true });
        modelCount = modelsOutput.trim().split('\n').length - 1;
        if (modelCount < 0) modelCount = 0;
      } catch (_e) { modelCount = 0; }
    }
  } catch (_e) { ollamaRunning = false; }
  return { running: ollamaRunning, models: modelCount };
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

function getResourceColor(percent) {
  if (percent >= 90) return c.neonRed + c.bold;
  if (percent >= 75) return c.neonRed;
  if (percent >= 50) return c.neonYellow;
  return c.neonGreen;
}

function getHydraStatus() {
  const yolo = process.env.HYDRA_YOLO_MODE === 'true';
  const turbo = process.env.HYDRA_TURBO_MODE === 'true';
  const deep = process.env.HYDRA_DEEP_THINKING === 'true';

  if (!yolo && !turbo && !deep) return null;

  const flags = [];
  if (yolo) flags.push(`${c.neonMagenta}${c.bold}Y${c.reset}`);
  if (turbo) flags.push(`${c.neonRed}${c.bold}T${c.reset}`);
  if (deep) flags.push(`${c.neonYellow}${c.bold}D${c.reset}`);

  return {
    compact: `${c.neonCyan}H${c.reset}[${flags.join('')}]`,
    full: `${c.neonCyan}${c.bold}HYDRA${c.reset}[${flags.join('')}]`
  };
}

function loadUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      const now = Date.now();
      if (data.lastMinuteStart < now - 60000) {
        return { lastMinuteStart: now, tokensThisMinute: 0, requestsThisMinute: 0, lastTotalTokens: data.lastTotalTokens || 0, lastTotalRequests: data.lastTotalRequests || 0 };
      }
      return data;
    }
  } catch (_e) { }
  return { lastMinuteStart: Date.now(), tokensThisMinute: 0, requestsThisMinute: 0, lastTotalTokens: 0, lastTotalRequests: 0 };
}

function saveUsage(usage) {
  try { fs.writeFileSync(USAGE_FILE, JSON.stringify(usage), 'utf8'); } catch (_e) { }
}

let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => { let chunk; while ((chunk = process.stdin.read()) !== null) inputData += chunk; });

process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(inputData);
  } catch {
    const aiStatus = checkAIHandlerStatus();
    const hydraStatus = getHydraStatus();
    const aiLabel = aiStatus.running ? `${c.neonGreen}${c.bold}AI:ON${c.reset}${c.gray}(${aiStatus.models})${c.reset}` : `${c.neonRed}${c.bold}AI:OFF${c.reset}`;
    const hydraLabel = hydraStatus ? `${hydraStatus.full} ${c.gray}║${c.reset} ` : '';
    console.log(`${hydraLabel}${aiLabel} ${c.gray}║${c.reset} ${c.neonCyan}${c.bold}Claude Code${c.reset} ${c.gray}║${c.reset} ${c.dim}Waiting...${c.reset}`);
    return;
  }

  const parts = [];
  const modelConfig = getModelConfig(data.model?.id) || { name: data.model?.display_name || 'Unknown', tier: 'standard', contextWindow: 200000, limits: { tokensPerMinute: 40000, requestsPerMinute: 100 } };

  let usage = loadUsage();
  const now = Date.now();
  if (now - usage.lastMinuteStart >= 60000) { usage.lastMinuteStart = now; usage.tokensThisMinute = 0; usage.requestsThisMinute = 0; }
  const currentTotalTokens = (data.context_window?.total_input_tokens || 0) + (data.context_window?.total_output_tokens || 0);
  const tokensDelta = Math.max(0, currentTotalTokens - usage.lastTotalTokens);
  if (tokensDelta > 0) { usage.tokensThisMinute += tokensDelta; usage.requestsThisMinute += 1; usage.lastTotalTokens = currentTotalTokens; }
  saveUsage(usage);

  const limits = modelConfig.limits || {};
  const tokensLimit = limits.tokensPerMinute || Infinity;
  const reqLimit = limits.requestsPerMinute || Infinity;
  const tokensRemaining = Math.max(0, tokensLimit - usage.tokensThisMinute);
  const requestsRemaining = Math.max(0, reqLimit - usage.requestsThisMinute);
  const tokensPercent = tokensLimit === Infinity ? 100 : Math.round((tokensRemaining / tokensLimit) * 100);
  const reqPercent = reqLimit === Infinity ? 100 : Math.round((requestsRemaining / reqLimit) * 100);
  const timeToReset = Math.max(0, Math.ceil((60000 - (now - usage.lastMinuteStart)) / 1000));

  const aiStatus = checkAIHandlerStatus();
  const hydraStatus = getHydraStatus();

  // HYDRA status first (if active)
  if (hydraStatus) {
    parts.push(COMPACT_MODE ? hydraStatus.compact : hydraStatus.full);
  }

  if (COMPACT_MODE) {
    parts.push(aiStatus.running ? `${c.neonGreen}${c.bold}AI${c.reset}` : `${c.neonRed}${c.bold}AI${c.reset}`);
  } else {
    parts.push(aiStatus.running ? `${c.neonGreen}${c.bold}AI:ON${c.reset}${c.gray}(${aiStatus.models} models)${c.reset}` : `${c.neonRed}${c.bold}AI:OFF${c.reset}`);
  }

  if (COMPACT_MODE) {
    const tierInfo = aiConfig.tiers[modelConfig.tier] || aiConfig.tiers.standard;
    const tierColor = getColorCode(tierInfo.color);
    let shortName = modelConfig.name.replace(/Claude\s*\d*\.?\d*\s*/i, '').replace('latest', '').trim().substring(0, 8);
    parts.push(`${tierColor}${c.bold}${shortName}${c.reset}`);
    if (data.context_window) {
      const ctx = data.context_window;
      const used = ctx.current_usage ? (ctx.current_usage.input_tokens || 0) + (ctx.current_usage.output_tokens || 0) : 0;
      const max = ctx.context_window_size || modelConfig.contextWindow;
      parts.push(`${getUsageColor(Math.round((used / max) * 100))}${Math.round((used / max) * 100)}%${c.reset}`);
    }
    if (data.context_window) {
      parts.push(`${c.neonBlue}${fmt(data.context_window.total_input_tokens || 0)}${c.gray}/${c.neonGreen}${fmt(data.context_window.total_output_tokens || 0)}${c.reset}`);
    }
    parts.push(`${getRemainColor(tokensPercent)}${tokensLimit === Infinity ? '∞' : fmt(tokensRemaining)}${c.gray}/${c.dim}${timeToReset}s${c.reset}`);
    const dots = mcpServers.map(_s => `${c.neonGreen}●${c.reset}`).join('');
    if (dots) parts.push(dots);
    const res = getSystemResources();
    parts.push(`${getResourceColor(res.cpu.percent)}C${res.cpu.percent}%${c.reset}${c.gray}/${c.reset}${getResourceColor(res.ram.percent)}R${res.ram.percent}%${c.reset}`);
  } else {
    const tierInfo = aiConfig.tiers[modelConfig.tier] || aiConfig.tiers.standard;
    const tierColor = getColorCode(tierInfo.color);
    parts.push(`${tierColor}${c.bold}[${tierInfo.label}] ${modelConfig.name.replace('Claude 3.5 ', '').replace('Claude 3 ', '').replace('latest', '').trim()}${c.reset}`);
    if (data.context_window) {
      const ctx = data.context_window;
      const used = ctx.current_usage ? (ctx.current_usage.input_tokens || 0) + (ctx.current_usage.output_tokens || 0) + (ctx.current_usage.cache_creation_input_tokens || 0) : 0;
      const max = ctx.context_window_size || modelConfig.contextWindow;
      parts.push(`${c.gray}Context:${c.reset}${getUsageColor(Math.round((used / max) * 100))}${Math.round((used / max) * 100)}%${c.reset}`);
    }
    if (data.context_window) {
      parts.push(`${c.gray}Tokens:${c.reset}${c.neonBlue}↑${fmt(data.context_window.total_input_tokens || 0)}${c.reset}${c.gray}/${c.reset}${c.neonGreen}↓${fmt(data.context_window.total_output_tokens || 0)}${c.reset}`);
    }
    const timeColor = timeToReset < 10 ? c.neonRed + c.blink : c.dim;
    parts.push(`${c.gray}Limits:${c.reset}${getRemainColor(tokensPercent)}${tokensLimit === Infinity ? '∞' : fmt(tokensRemaining)}${c.gray}/${c.dim}${tokensLimit === Infinity ? '∞' : fmt(tokensLimit)}${c.reset}${c.gray}tok ${c.reset}${getRemainColor(reqPercent)}${reqLimit === Infinity ? '∞' : requestsRemaining}${c.gray}/${c.dim}${reqLimit === Infinity ? '∞' : reqLimit}${c.reset}${c.gray}req ${c.reset}${timeColor}${timeToReset}s${c.reset}`);
    const mcpDots = mcpServers.map(server => { const abbrev = { 'serena': 'S', 'desktop-commander': 'D', 'playwright': 'P' }[server] || server[0].toUpperCase(); return `${c.neonGreen}${abbrev}${c.reset}`; }).join('');
    if (mcpDots) parts.push(`${c.gray}MCP:[${c.reset}${mcpDots}${c.gray}]${c.reset}`);
    const resources = getSystemResources();
    parts.push(`${c.gray}Sys:${c.reset}${getResourceColor(resources.cpu.percent)}CPU ${resources.cpu.percent}%${c.reset}${c.gray}(${resources.cpu.cores}c)${c.reset} ${getResourceColor(resources.ram.percent)}RAM ${resources.ram.usedGB}/${resources.ram.totalGB}GB${c.reset}`);
  }

  console.log(parts.join(COMPACT_MODE ? ` ${c.gray}│${c.reset} ` : ` ${c.gray}║${c.reset} `));
});

setTimeout(() => {
  if (!inputData) {
    const mode = COMPACT_MODE ? 'COMPACT' : 'FULL';
    const res = getSystemResources();
    const aiStatus = checkAIHandlerStatus();
    const hydraStatus = getHydraStatus();
    const aiLabel = aiStatus.running ? `${c.neonGreen}${c.bold}AI:ON${c.reset}${c.gray}(${aiStatus.models})${c.reset}` : `${c.neonRed}${c.bold}AI:OFF${c.reset}`;
    const hydraLabel = hydraStatus ? `${hydraStatus.full} ${c.gray}║${c.reset} ` : '';
    console.log(`${hydraLabel}${aiLabel} ${c.gray}║${c.reset} ${c.neonBlue}${c.bold}[STD]${c.reset} ${c.neonCyan}Claude${c.reset} ${c.gray}║${c.reset} ${getResourceColor(res.cpu.percent)}CPU ${res.cpu.percent}%${c.reset} ${getResourceColor(res.ram.percent)}RAM ${res.ram.usedGB}/${res.ram.totalGB}GB${c.reset} ${c.gray}║${c.reset} ${c.dim}${mode} (${TERMINAL_WIDTH}cols)${c.reset}`);
    process.exit(0);
  }
}, 100);
