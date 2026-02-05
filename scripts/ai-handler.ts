#!/usr/bin/env node
/**
 * AI Handler - Local Ollama Integration
 * Replacement for ai-handler.ps1
 *
 * Usage:
 *   node scripts/ai-handler.js query "Write a sorting function"
 *   node scripts/ai-handler.js batch prompts.txt
 *   node scripts/ai-handler.js pull llama3.2:3b
 *   node scripts/ai-handler.js list
 *   node scripts/ai-handler.js status
 *   node scripts/ai-handler.js config defaultModel qwen2.5-coder:1.5b
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Configuration
const OLLAMA_HOST = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5-coder:1.5b';
const CONFIG_FILE = join(ROOT_DIR, 'config', 'ai-handler-config.json');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

/**
 * Load configuration
 * @returns {Object} Configuration
 */
function getConfig() {
  if (existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      // Return default if parsing fails
    }
  }
  return {
    defaultModel: DEFAULT_MODEL,
    parallelRequests: 3,
    timeout: 120
  };
}

/**
 * Save configuration
 * @param {Object} config - Configuration to save
 */
function saveConfig(config) {
  const configDir = dirname(CONFIG_FILE);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Check Ollama server status
 * @returns {Promise<Object>} Status object with running flag and models
 */
async function getOllamaStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { running: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      running: true,
      models: data.models || []
    };
  } catch (error) {
    return {
      running: false,
      error: error.message
    };
  }
}

/**
 * Send query to Ollama
 * @param {string} prompt - The prompt
 * @param {string} model - Model to use
 * @returns {Promise<string|null>} Response or null on error
 */
async function ollamaQuery(prompt, model = DEFAULT_MODEL) {
  const config = getConfig();
  const timeout = (config.timeout || 120) * 1000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    return null;
  }
}

/**
 * Process batch queries in parallel
 * @param {string[]} prompts - Array of prompts
 * @param {string} model - Model to use
 * @param {number} parallel - Max parallel requests
 * @returns {Promise<Object[]>} Results array
 */
async function batchQuery(prompts, model = DEFAULT_MODEL, parallel = 3) {
  const results = [];
  const queue = [...prompts];
  const active = [];

  async function processOne() {
    if (queue.length === 0) return;

    const prompt = queue.shift();
    try {
      const response = await ollamaQuery(prompt, model);
      results.push({
        prompt,
        response,
        success: response !== null
      });
    } catch (error) {
      results.push({
        prompt,
        error: error.message,
        success: false
      });
    }
  }

  // Process in batches
  while (queue.length > 0 || active.length > 0) {
    // Start new tasks up to parallel limit
    while (active.length < parallel && queue.length > 0) {
      active.push(processOne());
    }

    // Wait for at least one to complete
    if (active.length > 0) {
      await Promise.race(active);
      // Remove completed promises
      for (let i = active.length - 1; i >= 0; i--) {
        // Check if promise is settled by racing with immediate resolve
        const isSettled = await Promise.race([
          active[i].then(() => true, () => true),
          Promise.resolve(false)
        ]);
        if (isSettled) {
          active.splice(i, 1);
        }
      }
    }
  }

  return results;
}

/**
 * Pull a model using curl/fetch
 * @param {string} model - Model name
 */
async function pullModel(model) {
  console.log(`${c.cyan}Downloading model: ${model}${c.reset}`);

  try {
    // Use spawn to show progress
    const child = spawn('curl', [
      '-X', 'POST',
      `${OLLAMA_HOST}/api/pull`,
      '-d', JSON.stringify({ name: model }),
      '-H', 'Content-Type: application/json'
    ], { stdio: 'inherit' });

    return new Promise((resolve, reject) => {
      child.on('error', () => {
        // curl not available, try fetch
        fetchPull(model).then(resolve).catch(reject);
      });
      child.on('exit', (code) => {
        if (code === 0) {
          console.log(`\n${c.green}Model downloaded!${c.reset}`);
          resolve();
        } else {
          reject(new Error(`Exit code: ${code}`));
        }
      });
    });
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
  }
}

/**
 * Fallback pull using fetch
 * @param {string} model - Model name
 */
async function fetchPull(model) {
  const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  console.log(`${c.green}Model download initiated${c.reset}`);
}

/**
 * Format file size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Show help
 */
function showHelp() {
  const status = getOllamaStatus();

  console.log(`
${c.cyan}=== AI Handler - Local Ollama Integration ===${c.reset}

${c.bold}Commands:${c.reset}
  query <prompt> [model]     - Single AI query
  batch <file.txt>           - Process multiple prompts in parallel
  pull <model>               - Download new model
  list                       - List available models
  status                     - Check AI providers status
  config <key> <value>       - Change configuration
  help                       - This help

${c.bold}Examples:${c.reset}
  node scripts/ai-handler.js query "Write a sorting function" qwen2.5-coder:1.5b
  node scripts/ai-handler.js batch prompts.txt
  node scripts/ai-handler.js pull llama3.2:3b
  node scripts/ai-handler.js status

${c.yellow}Config keys:${c.reset} defaultModel, parallelRequests, timeout
`);

  // Show installed models if available
  status.then(s => {
    if (s.running && s.models?.length > 0) {
      console.log(`${c.yellow}Installed Ollama models:${c.reset}`);
      s.models.forEach(m => {
        console.log(`  ${c.cyan}- ${m.name}${c.reset}`);
      });
    } else if (!s.running) {
      console.log(`  ${c.red}(Ollama offline)${c.reset}`);
    }
  });
}

// ============ Command Handlers ============

async function cmdQuery(args) {
  if (args.length === 0) {
    console.log(`${c.yellow}Usage: ai-handler.js query <prompt> [model]${c.reset}`);
    process.exit(1);
  }

  const prompt = args[0];
  const config = getConfig();
  const model = args[1] || config.defaultModel;

  console.log(`${c.cyan}Model: ${model}${c.reset}`);
  console.log(`${c.gray}---${c.reset}`);

  const result = await ollamaQuery(prompt, model);
  if (result) {
    console.log(result);
  }
}

async function cmdBatch(args) {
  if (args.length === 0) {
    console.log(`${c.yellow}Usage: ai-handler.js batch <prompts-file.txt>${c.reset}`);
    process.exit(1);
  }

  const file = args[0];
  if (!existsSync(file)) {
    console.error(`${c.red}File not found: ${file}${c.reset}`);
    process.exit(1);
  }

  const config = getConfig();
  const prompts = readFileSync(file, 'utf-8').split('\n').filter(Boolean);

  console.log(`${c.cyan}Processing ${prompts.length} queries in parallel...${c.reset}`);

  const results = await batchQuery(prompts, config.defaultModel, config.parallelRequests);

  for (const r of results) {
    const shortPrompt = r.prompt.substring(0, 50);
    console.log(`\n${c.yellow}--- Prompt: ${shortPrompt}...${c.reset}`);
    if (r.success) {
      console.log(r.response);
    } else {
      console.log(`${c.red}Error: ${r.error}${c.reset}`);
    }
  }
}

async function cmdPull(args) {
  if (args.length === 0) {
    console.log(`${c.yellow}Usage: ai-handler.js pull <model-name>${c.reset}`);
    console.log(`${c.gray}Examples: llama3.2:1b, qwen2.5-coder:7b, phi3:mini${c.reset}`);
    process.exit(1);
  }

  await pullModel(args[0]);
}

async function cmdList() {
  const status = await getOllamaStatus();

  if (status.running) {
    console.log(`${c.green}Available Ollama models:${c.reset}`);
    for (const model of status.models) {
      const sizeGB = formatSize(model.size);
      console.log(`  ${c.cyan}- ${model.name}${c.reset} - ${sizeGB}`);
    }
  } else {
    console.log(`${c.red}Ollama is not running!${c.reset}`);
    console.log(`${c.yellow}Start with: ollama serve${c.reset}`);
  }
}

async function cmdStatus() {
  const status = await getOllamaStatus();

  console.log(`${c.cyan}=== AI Providers Status ===${c.reset}`);

  if (status.running) {
    console.log(`${c.green}[OK] Ollama: ONLINE${c.reset}`);
    console.log(`    Host: ${OLLAMA_HOST}`);
    console.log(`    Models: ${status.models.length}`);
  } else {
    console.log(`${c.red}[X] Ollama: OFFLINE${c.reset}`);
    console.log(`    ${status.error}`);
  }

  console.log('');
  console.log(`${c.cyan}=== Configuration ===${c.reset}`);
  const config = getConfig();
  console.log(`    Default model: ${config.defaultModel}`);
  console.log(`    Parallel requests: ${config.parallelRequests}`);
  console.log(`    Timeout: ${config.timeout}s`);
}

function cmdConfig(args) {
  if (args.length < 2) {
    console.log(`${c.yellow}Usage: ai-handler.js config <key> <value>${c.reset}`);
    console.log(`${c.gray}Keys: defaultModel, parallelRequests, timeout${c.reset}`);
    process.exit(1);
  }

  const config = getConfig();
  const key = args[0];
  const value = args[1];

  switch (key) {
    case 'defaultModel':
      config.defaultModel = value;
      break;
    case 'parallelRequests':
      config.parallelRequests = parseInt(value, 10);
      break;
    case 'timeout':
      config.timeout = parseInt(value, 10);
      break;
    default:
      console.error(`${c.red}Unknown key: ${key}${c.reset}`);
      process.exit(1);
  }

  saveConfig(config);
  console.log(`${c.green}Saved: ${key} = ${value}${c.reset}`);
}

// ============ Main ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const commandArgs = args.slice(1);

  switch (command) {
    case 'query':
      await cmdQuery(commandArgs);
      break;
    case 'batch':
      await cmdBatch(commandArgs);
      break;
    case 'pull':
      await cmdPull(commandArgs);
      break;
    case 'list':
      await cmdList();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'config':
      cmdConfig(commandArgs);
      break;
    case 'help':
    default:
      showHelp();
  }
}

main().catch(error => {
  console.error(`${c.red}Fatal error: ${error.message}${c.reset}`);
  process.exit(1);
});

// Export for programmatic use
export {
  getConfig,
  saveConfig,
  getOllamaStatus,
  ollamaQuery,
  batchQuery,
  pullModel
};
