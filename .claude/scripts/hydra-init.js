#!/usr/bin/env node
/**
 * HYDRA 10.6.1 - Initialization Script
 *
 * Runs on startup to:
 * 1. Load available models from all providers (lazy load)
 * 2. Select best models for each task type
 * 3. Generate init messages for each CLI
 * 4. Load Serena memories and chat context
 * 5. Update configuration cache
 */

const fs = require('fs');
const path = require('path');
const { loadAllProviders, getBestModelForTask, MODEL_RANKINGS } = require('./model-loader.js');
const {
  getMemories,
  getChatHistory,
  extractContext,
  generateContextSummary,
  analyzeAndGenerateMemory
} = require('./memory-manager.js');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'multi-cli.json');
const CACHE_PATH = path.join(__dirname, '..', 'cache', 'models.json');

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  const cacheDir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

/**
 * Generate full init message for a provider
 */
function generateProviderInit(providerName, providerData, allProviders, memoryContext = {}) {
  const accessList = [
    'files (read/write/edit)',
    'system (bash, processes)',
    'network (web fetch/search)',
    'MCP servers (Playwright, Desktop Commander, Chrome)',
    'Serena memories'
  ];

  const commands = [
    '/dashboard', '/witcher', '/gemini', '/deepseek',
    '/codex', '/grok', '/jules', '/ai', '/swarm', '/ai-models', '/memory'
  ];

  // List available models for this provider
  const models = providerData.models?.slice(0, 5).join(', ') || 'N/A';
  const bestModel = providerData.best || 'N/A';

  // List other available providers
  const otherProviders = Object.entries(allProviders)
    .filter(([name, data]) => name !== providerName && !name.startsWith('_') && data.available)
    .map(([name, data]) => `${name}:${data.best || 'N/A'}`)
    .join(', ');

  // Memory context
  const memoryInfo = memoryContext.summary || 'No memories loaded';

  return {
    short: `${providerName.toUpperCase()} READY - Best model: ${bestModel}. Full system access enabled. ${memoryContext.memories ? `Memories: ${memoryContext.memories.split(',').length}` : ''}`,
    full: `You are ${providerName.toUpperCase()} CLI in HYDRA 10.6.1 system. ` +
          `You have FULL ACCESS to: ${accessList.join(', ')}. ` +
          `Available commands: ${commands.join(', ')}. ` +
          `Your models: ${models}. Best: ${bestModel}. ` +
          `Other available providers: ${otherProviders}. ` +
          `CONTEXT: ${memoryInfo} ` +
          `Respond: ${providerName.toUpperCase()} READY - Full system access enabled.`
  };
}

/**
 * Generate summary table
 */
function generateSummary(providers) {
  const lines = [
    '',
    '┌──────────────────────────────────────────────────────────────────────┐',
    '│  🐉 HYDRA 10.6.1 - Model Loader Initialized                         │',
    '├──────────────────────────────────────────────────────────────────────┤',
    '│  Provider      │ Status │ Best Model              │ Models │        │',
    '├──────────────────────────────────────────────────────────────────────┤'
  ];

  const icons = {
    anthropic: '🐉',
    google: '🔵',
    openai: '🟢',
    xai: '⚫',
    deepseek: '🔴',
    ollama: '🏠'
  };

  for (const [name, data] of Object.entries(providers)) {
    if (name.startsWith('_')) continue;

    const icon = icons[name] || '⚪';
    const status = data.available ? '  ✅  ' : '  ❌  ';
    const best = (data.best || 'N/A').substring(0, 23).padEnd(23);
    const count = String(data.models?.length || 0).padStart(3);
    const local = data.local ? ' 🏠' : '   ';

    lines.push(`│  ${icon} ${name.padEnd(11)} │${status}│ ${best} │  ${count}  │${local}     │`);
  }

  lines.push('├──────────────────────────────────────────────────────────────────────┤');

  // Add best for tasks
  const taskBest = {
    code: getBestModelForTask(providers, 'code'),
    analysis: getBestModelForTask(providers, 'analysis'),
    reasoning: getBestModelForTask(providers, 'reasoning')
  };

  lines.push('│  Best for tasks:                                                     │');
  lines.push(`│    Code:      ${taskBest.code ? `${taskBest.code.provider}/${taskBest.code.model}` : 'N/A'}`.padEnd(72) + '│');
  lines.push(`│    Analysis:  ${taskBest.analysis ? `${taskBest.analysis.provider}/${taskBest.analysis.model}` : 'N/A'}`.padEnd(72) + '│');
  lines.push(`│    Reasoning: ${taskBest.reasoning ? `${taskBest.reasoning.provider}/${taskBest.reasoning.model}` : 'N/A'}`.padEnd(72) + '│');

  lines.push('└──────────────────────────────────────────────────────────────────────┘');
  lines.push('');

  return lines.join('\n');
}

/**
 * Load and display memories
 */
function loadMemories() {
  console.log('Loading Serena memories...');
  const memories = getMemories();

  console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│  🧠 SERENA MEMORIES LOADED                                           │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');

  for (const memory of memories.slice(0, 8)) {
    const name = memory.name.substring(0, 25).padEnd(25);
    const date = new Date(memory.modified).toLocaleDateString().padEnd(12);
    console.log(`│  📝 ${name} ${date}                       │`);
  }

  if (memories.length > 8) {
    console.log(`│  ... and ${memories.length - 8} more memories                                      │`);
  }

  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  return memories;
}

/**
 * Load chat history context
 */
function loadChatContext() {
  console.log('Extracting chat context...');
  const context = extractContext();
  const history = getChatHistory();

  const sessionCount = history.sessions?.length || 0;
  const totalEntries = history.sessions?.reduce((sum, s) => sum + (s.entries?.length || 0), 0) || 0;

  console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│  💬 CHAT CONTEXT                                                     │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log(`│  Sessions: ${String(sessionCount).padEnd(5)} | Entries: ${String(totalEntries).padEnd(5)}                            │`);

  if (context.recentTopics.length) {
    console.log(`│  Topics: ${context.recentTopics.slice(0, 5).join(', ').substring(0, 55).padEnd(55)}  │`);
  }
  if (context.recentFiles.length) {
    console.log(`│  Files: ${context.recentFiles.slice(0, 3).join(', ').substring(0, 56).padEnd(56)}  │`);
  }
  if (context.recentCommands.length) {
    console.log(`│  Commands: ${context.recentCommands.slice(0, 6).join(', ').substring(0, 53).padEnd(53)}  │`);
  }

  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  return context;
}

/**
 * Generate context for init messages
 */
function generateMemoryContext(memories, chatContext) {
  const memoryNames = memories.map(m => m.name).join(', ');
  const topics = chatContext.recentTopics.slice(0, 5).join(', ');
  const files = chatContext.recentFiles.slice(0, 3).join(', ');

  return {
    memories: memoryNames,
    topics,
    files,
    summary: `Memories: ${memories.length}. Recent topics: ${topics || 'none'}. Recent files: ${files || 'none'}.`
  };
}

/**
 * Main initialization
 */
async function init() {
  console.log('🐉 HYDRA 10.6.1 - Initializing...\n');

  // 1. Load Serena memories
  const memories = loadMemories();

  // 2. Load chat context
  const chatContext = loadChatContext();

  // 3. Generate memory context for init messages
  const memoryContext = generateMemoryContext(memories, chatContext);

  // 4. Load all providers
  console.log('Loading models from all providers (lazy load)...');
  const providers = await loadAllProviders();

  // 5. Generate init messages for each provider (with memory context)
  const initMessages = {};
  for (const [name, data] of Object.entries(providers)) {
    if (name.startsWith('_')) continue;
    initMessages[name] = generateProviderInit(name, data, providers, memoryContext);
  }

  // 6. Cache results
  ensureCacheDir();
  const cache = {
    timestamp: Date.now(),
    providers,
    initMessages,
    memories: memories.map(m => ({ name: m.name, modified: m.modified })),
    chatContext: {
      topics: chatContext.recentTopics,
      files: chatContext.recentFiles,
      commands: chatContext.recentCommands
    },
    taskBest: {
      code: getBestModelForTask(providers, 'code'),
      analysis: getBestModelForTask(providers, 'analysis'),
      reasoning: getBestModelForTask(providers, 'reasoning'),
      multimodal: getBestModelForTask(providers, 'multimodal'),
      realtime: getBestModelForTask(providers, 'realtime'),
      local: getBestModelForTask(providers, 'local')
    }
  };

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

  // 7. Update context summary
  generateContextSummary();

  // 8. Print model summary
  console.log(generateSummary(providers));

  // 9. Print init messages if requested
  if (process.argv.includes('--show-init')) {
    console.log('\n--- Init Messages ---\n');
    for (const [name, msgs] of Object.entries(initMessages)) {
      console.log(`[${name}] ${msgs.short}\n`);
    }
  }

  // 10. Auto-update memories if requested
  if (process.argv.includes('--update-memories')) {
    console.log('\nUpdating codebase memories...');
    await analyzeAndGenerateMemory('codebase_structure');
    await analyzeAndGenerateMemory('api_keys_status');
    await analyzeAndGenerateMemory('active_models');
    console.log('✅ Memories updated');
  }

  // 11. Return for programmatic use
  return cache;
}

// Export for use as module
module.exports = { init, generateProviderInit, generateSummary };

// Run if called directly
if (require.main === module) {
  init().catch(console.error);
}
