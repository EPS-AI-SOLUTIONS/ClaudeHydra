#!/usr/bin/env node
/**
 * HYDRA 10.6.1 - Model Loader with Lazy Loading
 *
 * Loads available models from each provider's API on startup
 * and selects the best model automatically.
 */

const https = require('https');
const http = require('http');

// Model ranking by provider (higher = better)
const MODEL_RANKINGS = {
  anthropic: [
    'claude-opus-4-5-20251101',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307'
  ],
  google: [
    'gemini-2.5-pro',
    'gemini-2.0-pro',
    'gemini-2.0-flash-thinking',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash'
  ],
  openai: [
    'gpt-5',
    'gpt-5-codex',
    'gpt-4.1',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'o3',
    'o1',
    'o1-mini'
  ],
  xai: [
    'grok-3',
    'grok-2',
    'grok-beta'
  ],
  deepseek: [
    'deepseek-r1',
    'deepseek-v3',
    'deepseek-coder',
    'deepseek-chat'
  ],
  ollama: [
    'llama3.3:70b',
    'llama3.2:3b',
    'llama3.2:1b',
    'qwen2.5-coder:7b',
    'qwen2.5-coder:1.5b',
    'deepseek-r1:7b',
    'deepseek-r1:1.5b'
  ]
};

// Cache for loaded models
const modelCache = {
  anthropic: null,
  google: null,
  openai: null,
  xai: null,
  deepseek: null,
  ollama: null,
  _timestamp: {}
};

const CACHE_TTL = 300000; // 5 minutes

/**
 * Fetch JSON from URL
 */
function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;

    const req = client.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Load models from Anthropic API
 */
async function loadAnthropicModels() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { available: false, models: [], error: 'No API key' };

  try {
    // Anthropic doesn't have a public models endpoint, use known models
    const knownModels = MODEL_RANKINGS.anthropic;
    return {
      available: true,
      models: knownModels,
      best: knownModels[0],
      provider: 'anthropic'
    };
  } catch (e) {
    return { available: false, models: [], error: e.message };
  }
}

/**
 * Load models from Google/Gemini API
 */
async function loadGoogleModels() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return { available: false, models: [], error: 'No API key' };

  try {
    const data = await fetchJSON(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    const models = (data.models || [])
      .filter(m => m.name.includes('gemini'))
      .map(m => m.name.replace('models/', ''));

    // Select best available
    const best = MODEL_RANKINGS.google.find(m =>
      models.some(am => am.includes(m.replace('gemini-', '')))
    ) || models[0];

    return {
      available: true,
      models,
      best,
      provider: 'google'
    };
  } catch (e) {
    return { available: false, models: [], error: e.message };
  }
}

/**
 * Load models from OpenAI API
 */
async function loadOpenAIModels() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { available: false, models: [], error: 'No API key' };

  try {
    const data = await fetchJSON('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const models = (data.data || [])
      .filter(m => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
      .map(m => m.id);

    const best = MODEL_RANKINGS.openai.find(m => models.includes(m)) || models[0];

    return {
      available: true,
      models,
      best,
      provider: 'openai'
    };
  } catch (e) {
    return { available: false, models: [], error: e.message };
  }
}

/**
 * Load models from xAI/Grok API
 */
async function loadXAIModels() {
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!apiKey) return { available: false, models: [], error: 'No API key' };

  try {
    // xAI API (similar to OpenAI)
    const data = await fetchJSON('https://api.x.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const models = (data.data || []).map(m => m.id);
    const best = MODEL_RANKINGS.xai.find(m => models.includes(m)) || models[0];

    return {
      available: true,
      models,
      best,
      provider: 'xai'
    };
  } catch (e) {
    return { available: false, models: [], error: e.message };
  }
}

/**
 * Load models from DeepSeek API
 */
async function loadDeepSeekModels() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { available: false, models: [], error: 'No API key' };

  try {
    const data = await fetchJSON('https://api.deepseek.com/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const models = (data.data || []).map(m => m.id);
    const best = MODEL_RANKINGS.deepseek.find(m => models.includes(m)) || models[0];

    return {
      available: true,
      models,
      best,
      provider: 'deepseek'
    };
  } catch (e) {
    return { available: false, models: [], error: e.message };
  }
}

/**
 * Load models from local Ollama
 */
async function loadOllamaModels() {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';

  try {
    const data = await fetchJSON(`${host}/api/tags`);

    const models = (data.models || []).map(m => m.name);
    const best = MODEL_RANKINGS.ollama.find(m =>
      models.some(am => am.startsWith(m.split(':')[0]))
    ) || models[0];

    return {
      available: true,
      models,
      best,
      provider: 'ollama',
      local: true
    };
  } catch (e) {
    return { available: false, models: [], error: e.message };
  }
}

/**
 * Lazy load models for a provider
 */
async function getModels(provider) {
  // Check cache
  const now = Date.now();
  if (modelCache[provider] &&
      modelCache._timestamp[provider] &&
      (now - modelCache._timestamp[provider]) < CACHE_TTL) {
    return modelCache[provider];
  }

  // Load from API
  let result;
  switch (provider) {
    case 'anthropic':
      result = await loadAnthropicModels();
      break;
    case 'google':
      result = await loadGoogleModels();
      break;
    case 'openai':
      result = await loadOpenAIModels();
      break;
    case 'xai':
      result = await loadXAIModels();
      break;
    case 'deepseek':
      result = await loadDeepSeekModels();
      break;
    case 'ollama':
      result = await loadOllamaModels();
      break;
    default:
      result = { available: false, models: [], error: 'Unknown provider' };
  }

  // Update cache
  modelCache[provider] = result;
  modelCache._timestamp[provider] = now;

  return result;
}

/**
 * Load all providers in parallel
 */
async function loadAllProviders() {
  const providers = ['anthropic', 'google', 'openai', 'xai', 'deepseek', 'ollama'];

  const results = await Promise.allSettled(
    providers.map(p => getModels(p))
  );

  const summary = {};
  providers.forEach((p, i) => {
    summary[p] = results[i].status === 'fulfilled'
      ? results[i].value
      : { available: false, error: results[i].reason?.message };
  });

  return summary;
}

/**
 * Get best model for a task type
 */
function getBestModelForTask(providers, taskType) {
  const taskPreferences = {
    'code': ['deepseek', 'openai', 'anthropic', 'google'],
    'analysis': ['google', 'anthropic', 'openai', 'deepseek'],
    'reasoning': ['anthropic', 'deepseek', 'openai', 'google'],
    'multimodal': ['google', 'openai', 'anthropic'],
    'realtime': ['xai', 'google', 'openai'],
    'local': ['ollama'],
    'default': ['anthropic', 'google', 'openai', 'deepseek', 'xai', 'ollama']
  };

  const order = taskPreferences[taskType] || taskPreferences.default;

  for (const provider of order) {
    if (providers[provider]?.available && providers[provider]?.best) {
      return {
        provider,
        model: providers[provider].best,
        all_models: providers[provider].models
      };
    }
  }

  return null;
}

/**
 * Generate init message with loaded models
 */
function generateInitMessage(providers) {
  const lines = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║  HYDRA 10.6.1 - Model Loader                                 ║',
    '╠══════════════════════════════════════════════════════════════╣'
  ];

  const icons = {
    anthropic: '🐉',
    google: '🔵',
    openai: '🟢',
    xai: '⚫',
    deepseek: '🔴',
    ollama: '🏠'
  };

  for (const [provider, data] of Object.entries(providers)) {
    if (provider.startsWith('_')) continue;

    const icon = icons[provider] || '⚪';
    const status = data.available ? '✅' : '❌';
    const model = data.best || 'N/A';
    const count = data.models?.length || 0;

    lines.push(`║  ${icon} ${provider.padEnd(10)} ${status} ${model.padEnd(25)} (${count})  ║`);
  }

  lines.push('╚══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  switch (command) {
    case 'status':
    case 'load': {
      console.log('Loading models from all providers...\n');
      const providers = await loadAllProviders();
      console.log(generateInitMessage(providers));

      // Output JSON for parsing
      if (args.includes('--json')) {
        console.log('\n--- JSON ---');
        console.log(JSON.stringify(providers, null, 2));
      }
      break;
    }

    case 'best': {
      const taskType = args[1] || 'default';
      const providers = await loadAllProviders();
      const best = getBestModelForTask(providers, taskType);

      if (best) {
        console.log(`Best for "${taskType}": ${best.provider}/${best.model}`);
      } else {
        console.log('No available models found');
      }
      break;
    }

    case 'provider': {
      const provider = args[1];
      if (!provider) {
        console.log('Usage: model-loader.js provider <name>');
        process.exit(1);
      }

      const result = await getModels(provider);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.log('HYDRA Model Loader');
      console.log('==================');
      console.log('Commands:');
      console.log('  status          Show all providers and models');
      console.log('  best [task]     Get best model for task (code/analysis/reasoning/multimodal)');
      console.log('  provider <name> Load models for specific provider');
      console.log('');
      console.log('Options:');
      console.log('  --json          Output raw JSON');
  }
}

// Export for use as module
module.exports = {
  getModels,
  loadAllProviders,
  getBestModelForTask,
  MODEL_RANKINGS
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
