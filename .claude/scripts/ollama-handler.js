#!/usr/bin/env node
/**
 * HYDRA 10.6.1 - Ollama Handler
 *
 * Centralny moduł do zarządzania funkcjami przez lokalną Ollama:
 * - Query/Chat - podstawowe zapytania
 * - Analyze - analiza kodu i tekstu
 * - Summarize - streszczenia
 * - Code - generowanie kodu
 * - Memory - zarządzanie memories
 * - Batch - równoległe zapytania
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'llama3.2:3b';
const FAST_MODEL = process.env.FAST_MODEL || 'llama3.2:1b';
const CODER_MODEL = process.env.CODER_MODEL || 'qwen2.5-coder:1.5b';

// Model selection based on task
const TASK_MODELS = {
  chat: DEFAULT_MODEL,
  query: DEFAULT_MODEL,
  analyze: DEFAULT_MODEL,
  summarize: FAST_MODEL,
  code: CODER_MODEL,
  memory: FAST_MODEL,
  batch: FAST_MODEL
};

/**
 * Make HTTP request to Ollama API
 */
function ollamaRequest(endpoint, data, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, OLLAMA_HOST);
    const postData = JSON.stringify(data);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: options.timeout || 120000
    }, (res) => {
      let responseData = '';

      res.on('data', chunk => {
        responseData += chunk;

        // Stream mode - emit each line
        if (options.stream && data.stream !== false) {
          const lines = responseData.split('\n');
          for (let i = 0; i < lines.length - 1; i++) {
            try {
              const json = JSON.parse(lines[i]);
              if (json.response && options.onToken) {
                options.onToken(json.response);
              }
            } catch (e) { }
          }
          responseData = lines[lines.length - 1];
        }
      });

      res.on('end', () => {
        try {
          // For streaming, collect all responses
          if (data.stream !== false) {
            const lines = responseData.split('\n').filter(l => l.trim());
            let fullResponse = '';
            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                if (json.response) fullResponse += json.response;
                if (json.done) {
                  resolve({
                    response: fullResponse,
                    model: json.model,
                    total_duration: json.total_duration,
                    eval_count: json.eval_count
                  });
                  return;
                }
              } catch (e) { }
            }
            resolve({ response: fullResponse });
          } else {
            resolve(JSON.parse(responseData));
          }
        } catch (e) {
          resolve({ response: responseData });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));

    req.write(postData);
    req.end();
  });
}

/**
 * Get available models
 */
async function getModels() {
  return new Promise((resolve, reject) => {
    http.get(`${OLLAMA_HOST}/api/tags`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.models || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Check if Ollama is running
 */
async function isRunning() {
  try {
    await getModels();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Basic query/chat
 */
async function query(prompt, options = {}) {
  const model = options.model || TASK_MODELS.query;

  return ollamaRequest('/api/generate', {
    model,
    prompt,
    stream: options.stream !== false,
    options: {
      temperature: options.temperature || 0.7,
      num_predict: options.maxTokens || 2048
    }
  }, options);
}

/**
 * Analyze code or text
 */
async function analyze(content, type = 'code', options = {}) {
  const prompts = {
    code: `Analyze this code. Identify: 1) Purpose, 2) Key functions, 3) Potential issues, 4) Improvements.\n\nCode:\n${content}`,
    text: `Analyze this text. Summarize key points and provide insights.\n\nText:\n${content}`,
    error: `Analyze this error. Explain: 1) What caused it, 2) How to fix it.\n\nError:\n${content}`,
    security: `Security audit of this code. Find vulnerabilities and suggest fixes.\n\nCode:\n${content}`
  };

  return query(prompts[type] || prompts.code, {
    model: options.model || TASK_MODELS.analyze,
    ...options
  });
}

/**
 * Summarize content
 */
async function summarize(content, options = {}) {
  const prompt = `Summarize this in ${options.sentences || 3} sentences. Be concise.\n\n${content}`;

  return query(prompt, {
    model: options.model || TASK_MODELS.summarize,
    maxTokens: options.maxTokens || 500,
    ...options
  });
}

/**
 * Generate code
 */
async function generateCode(description, language = 'javascript', options = {}) {
  const prompt = `Generate ${language} code for: ${description}\n\nProvide only the code, no explanations. Use best practices.`;

  return query(prompt, {
    model: options.model || TASK_MODELS.code,
    temperature: 0.3,
    ...options
  });
}

/**
 * Process memory - analyze and extract key info
 */
async function processMemory(memoryContent, action = 'summarize', options = {}) {
  const prompts = {
    summarize: `Summarize this memory file. Extract key facts in bullet points.\n\n${memoryContent}`,
    extract: `Extract key technical details from this memory:\n\n${memoryContent}`,
    update: `Given this memory content, what should be updated or added?\n\n${memoryContent}`,
    query: `Based on this memory, answer: ${options.question}\n\nMemory:\n${memoryContent}`
  };

  return query(prompts[action] || prompts.summarize, {
    model: options.model || TASK_MODELS.memory,
    ...options
  });
}

/**
 * Batch queries - run multiple queries in parallel
 */
async function batch(queries, options = {}) {
  const model = options.model || TASK_MODELS.batch;
  const concurrency = options.concurrency || 2;

  const results = [];
  for (let i = 0; i < queries.length; i += concurrency) {
    const chunk = queries.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(q => query(q, { model, ...options }))
    );
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Chat with context (multi-turn)
 */
async function chat(messages, options = {}) {
  const model = options.model || TASK_MODELS.chat;

  // Build context from messages
  let context = '';
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    context += `${role}: ${msg.content}\n\n`;
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === 'user') {
    context += 'Assistant:';
  }

  return query(context, {
    model,
    ...options
  });
}

/**
 * Execute function by name
 */
async function execute(functionName, args = {}) {
  switch (functionName) {
    case 'query':
    case 'ask':
      return query(args.prompt, args);

    case 'analyze':
      return analyze(args.content, args.type, args);

    case 'summarize':
      return summarize(args.content, args);

    case 'code':
    case 'generate':
      return generateCode(args.description, args.language, args);

    case 'memory':
      return processMemory(args.content, args.action, args);

    case 'batch':
      return batch(args.queries, args);

    case 'chat':
      return chat(args.messages, args);

    case 'models':
      return getModels();

    case 'status':
      const running = await isRunning();
      const models = running ? await getModels() : [];
      return {
        running,
        host: OLLAMA_HOST,
        models: models.map(m => m.name),
        defaultModel: DEFAULT_MODEL,
        fastModel: FAST_MODEL,
        coderModel: CODER_MODEL
      };

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  try {
    switch (command) {
      case 'status': {
        const status = await execute('status');
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║  🏠 OLLAMA STATUS                                            ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║  Running: ${status.running ? '✅ Yes' : '❌ No'}                                           ║`);
        console.log(`║  Host: ${status.host.padEnd(47)}  ║`);
        console.log(`║  Models: ${status.models.length}                                                  ║`);
        for (const model of status.models) {
          console.log(`║    - ${model.padEnd(50)}  ║`);
        }
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║  Default: ${status.defaultModel.padEnd(44)}  ║`);
        console.log(`║  Fast:    ${status.fastModel.padEnd(44)}  ║`);
        console.log(`║  Coder:   ${status.coderModel.padEnd(44)}  ║`);
        console.log('╚══════════════════════════════════════════════════════════════╝\n');
        break;
      }

      case 'query':
      case 'ask': {
        const prompt = args.slice(1).join(' ');
        if (!prompt) {
          console.log('Usage: ollama-handler.js query <prompt>');
          process.exit(1);
        }
        console.log('Querying Ollama...\n');
        const result = await query(prompt, { stream: false });
        console.log(result.response || result);
        console.log('\n');
        break;
      }

      case 'analyze': {
        const file = args[1];
        const type = args[2] || 'code';
        if (!file) {
          console.log('Usage: ollama-handler.js analyze <file> [type]');
          process.exit(1);
        }
        const content = fs.readFileSync(file, 'utf-8');
        console.log(`Analyzing ${file}...\n`);
        const result = await analyze(content, type, { stream: false });
        console.log(result.response || result);
        console.log('\n');
        break;
      }

      case 'summarize': {
        const input = args.slice(1).join(' ');
        if (!input) {
          console.log('Usage: ollama-handler.js summarize <text or file>');
          process.exit(1);
        }
        const content = fs.existsSync(input) ? fs.readFileSync(input, 'utf-8') : input;
        console.log('Summarizing...\n');
        const result = await summarize(content, { stream: false });
        console.log(result.response || result);
        console.log('\n');
        break;
      }

      case 'code': {
        const description = args.slice(1).join(' ');
        if (!description) {
          console.log('Usage: ollama-handler.js code <description>');
          process.exit(1);
        }
        console.log('Generating code...\n');
        const result = await generateCode(description, 'javascript', { stream: false });
        console.log(result.response || result);
        console.log('\n');
        break;
      }

      case 'memory': {
        const memoryName = args[1];
        const action = args[2] || 'summarize';
        if (!memoryName) {
          console.log('Usage: ollama-handler.js memory <name> [action]');
          process.exit(1);
        }
        const memoryPath = path.join(__dirname, '..', '..', '.serena', 'memories', `${memoryName}.md`);
        if (!fs.existsSync(memoryPath)) {
          console.log(`Memory "${memoryName}" not found`);
          process.exit(1);
        }
        const content = fs.readFileSync(memoryPath, 'utf-8');
        console.log(`Processing memory: ${memoryName}...\n`);
        const result = await processMemory(content, action, { stream: false });
        console.log(result.response || result);
        console.log('\n');
        break;
      }

      case 'models': {
        const models = await getModels();
        console.log('\nAvailable Ollama models:');
        for (const model of models) {
          const size = (model.size / 1024 / 1024 / 1024).toFixed(2);
          console.log(`  - ${model.name} (${size} GB)`);
        }
        console.log('');
        break;
      }

      default:
        console.log(`
HYDRA Ollama Handler
====================

Commands:
  status              Show Ollama status and models
  query <prompt>      Send query to Ollama
  analyze <file>      Analyze code file
  summarize <text>    Summarize text or file
  code <description>  Generate code
  memory <name>       Process a Serena memory
  models              List available models

Environment:
  OLLAMA_HOST         Ollama server URL (default: http://localhost:11434)
  DEFAULT_MODEL       Default model (default: llama3.2:3b)
  FAST_MODEL          Fast model for quick tasks (default: llama3.2:1b)
  CODER_MODEL         Code generation model (default: qwen2.5-coder:1.5b)
`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
module.exports = {
  query,
  analyze,
  summarize,
  generateCode,
  processMemory,
  batch,
  chat,
  execute,
  getModels,
  isRunning,
  OLLAMA_HOST,
  DEFAULT_MODEL,
  FAST_MODEL,
  CODER_MODEL,
  TASK_MODELS
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
