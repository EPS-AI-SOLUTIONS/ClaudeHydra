/**
 * @fileoverview Ollama Bridge (formerly LlamaCpp Bridge)
 *
 * Dual-mode adapter: MCP protocol or direct Ollama HTTP API.
 * Automatically falls back to HTTP if MCP is unavailable.
 *
 * Ollama HTTP API: http://localhost:11434/api/generate, /api/chat, /api/embed
 *
 * @module hydra/providers/llamacpp-bridge
 */

import { getLogger } from '../../utils/logger.js';
import { GGUF_MODELS } from './llamacpp-models.js';

const logger = getLogger('LlamaCppBridge');

// =============================================================================
// Configuration
// =============================================================================

export const MCP_SERVER_ID = 'ollama';
const OLLAMA_BASE_URL = process.env.OLLAMA_HOST || 'http://localhost:11434';

export const MCP_TOOLS = {
  GENERATE: `mcp__${MCP_SERVER_ID}__ollama_generate`,
  CHAT: `mcp__${MCP_SERVER_ID}__ollama_chat`,
  EMBED: `mcp__${MCP_SERVER_ID}__ollama_embed`,
  LIST: `mcp__${MCP_SERVER_ID}__ollama_list`,
  SHOW: `mcp__${MCP_SERVER_ID}__ollama_show`,
  PS: `mcp__${MCP_SERVER_ID}__ollama_ps`,
};

const TOOL_NAME_MAP: Record<string, string> = {
  ollama_generate: MCP_TOOLS.GENERATE,
  ollama_chat: MCP_TOOLS.CHAT,
  ollama_embed: MCP_TOOLS.EMBED,
  ollama_list: MCP_TOOLS.LIST,
  llama_generate: MCP_TOOLS.GENERATE,
  llama_generate_fast: MCP_TOOLS.GENERATE,
  llama_chat: MCP_TOOLS.CHAT,
  llama_embed: MCP_TOOLS.EMBED,
  llama_code: MCP_TOOLS.GENERATE,
  llama_analyze: MCP_TOOLS.GENERATE,
  llama_json: MCP_TOOLS.GENERATE,
};

// =============================================================================
// Ollama HTTP Client (fallback when MCP unavailable)
// =============================================================================

async function ollamaFetch(endpoint: string, body: any, timeout = 120000): Promise<any> {
  const url = `${OLLAMA_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function ollamaGet(endpoint: string, timeout = 10000): Promise<any> {
  const url = `${OLLAMA_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================================
// LlamaCppBridge Class
// =============================================================================

export class LlamaCppBridge {
  mcpInvoker: ((toolName: string, params: any) => Promise<any>) | null;
  defaultTimeout: number;
  defaultModel: string;
  _mode: 'mcp' | 'http' | 'auto';
  _healthCheckCache: any;

  constructor(config: any = {}) {
    this.mcpInvoker = config.mcpInvoker || null;
    this.defaultTimeout = config.defaultTimeout || 120000;
    this.defaultModel = config.defaultModel || 'llama3.2:1b';
    this._mode = 'auto'; // auto-detect: try MCP first, fallback to HTTP
    this._healthCheckCache = null;
  }

  setMcpInvoker(invoker: (toolName: string, params: any) => Promise<any>) {
    this.mcpInvoker = invoker;
  }

  getFullToolName(shortName: string): string {
    return TOOL_NAME_MAP[shortName] || `mcp__${MCP_SERVER_ID}__${shortName}`;
  }

  /**
   * Determine execution mode: MCP if available, else HTTP
   */
  private get useHttp(): boolean {
    if (this._mode === 'http') return true;
    if (this._mode === 'mcp') return false;
    // auto: use HTTP if no MCP invoker set
    return !this.mcpInvoker;
  }

  /**
   * Call via MCP or HTTP depending on mode
   */
  async callTool(toolName: string, params: any = {}): Promise<any> {
    if (this.useHttp) {
      return this.callHttp(toolName, params);
    }

    const fullName = this.getFullToolName(toolName);
    const startTime = Date.now();

    try {
      const result = await this.mcpInvoker?.(fullName, params);
      return { ...result, duration_ms: Date.now() - startTime, tool: fullName };
    } catch (error: any) {
      // On MCP failure, fallback to HTTP in auto mode
      if (this._mode === 'auto') {
        this._mode = 'http';
        return this.callHttp(toolName, params);
      }
      error.tool = fullName;
      error.duration_ms = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Direct HTTP call to Ollama API
   */
  private async callHttp(toolName: string, params: any): Promise<any> {
    const startTime = Date.now();
    const name = toolName.replace('ollama_', '').replace('llama_', '');

    let result: any;
    switch (name) {
      case 'generate':
      case 'generate_fast':
        result = await ollamaFetch('/api/generate', params, this.defaultTimeout);
        break;
      case 'chat':
        result = await ollamaFetch('/api/chat', params, this.defaultTimeout);
        break;
      case 'embed':
        result = await ollamaFetch('/api/embed', params, this.defaultTimeout);
        break;
      case 'list':
        result = await ollamaGet('/api/tags');
        break;
      case 'ps':
        result = await ollamaGet('/api/ps');
        break;
      case 'show':
        result = await ollamaFetch('/api/show', params, 10000);
        break;
      default:
        // For code/analyze/json — route through generate
        result = await ollamaFetch('/api/generate', params, this.defaultTimeout);
    }

    return { ...result, duration_ms: Date.now() - startTime, tool: `http:${name}` };
  }

  // ===========================================================================
  // Generation Methods
  // ===========================================================================

  async generate(prompt: string, options: any = {}): Promise<any> {
    const {
      maxTokens = 1024,
      temperature = 0.7,
      model = this.defaultModel,
      stop = [],
      num_ctx,
    } = options;

    // Resolve context window: explicit option > model config > 4096 default
    const contextSize = num_ctx || GGUF_MODELS[model]?.contextSize || 4096;

    // Ollama API requires flat structure, NOT nested "options"
    const params: any = {
      prompt,
      model,
      stream: false,
      // Core sampling params (directly at root level)
      temperature,
      num_predict: maxTokens,
      num_ctx: contextSize,
      repeat_penalty: 1.3,
      frequency_penalty: 1.0,
      top_k: 30,
      top_p: 0.9,
    };

    // Stop sequences (MUST be at root level for Ollama)
    if (stop.length > 0) {
      params.stop = stop;
    }

    // Advanced logging
    logger.ollama('/api/generate', params);

    const result = await this.callTool('ollama_generate', params);

    logger.ollama('/api/generate', params, result);

    return this._normalizeResult(result, 'generate');
  }

  async generateFast(prompt: string, options: any = {}): Promise<any> {
    return this.generate(prompt, { ...options, maxTokens: options.maxTokens || 512 });
  }

  async chat(messages: Array<{ role: string; content: string }>, options: any = {}): Promise<any> {
    const { maxTokens = 2048, temperature = 0.7, model = this.defaultModel } = options;

    const params: any = { messages, model };
    const opts: any = {};
    if (temperature !== 0.7) opts.temperature = temperature;
    if (maxTokens !== 2048) opts.num_predict = maxTokens;
    if (Object.keys(opts).length > 0) params.options = opts;

    const result = await this.callTool('ollama_chat', params);
    return this._normalizeResult(result, 'chat');
  }

  // ===========================================================================
  // Specialized Methods (emulated via generate/chat)
  // ===========================================================================

  async code(task: string, params: any = {}): Promise<any> {
    const { code = '', description = '', language = 'javascript' } = params;
    const prompts: Record<string, string> = {
      generate: `You are a ${language} expert. Generate code for: ${description}\nOutput only the code.`,
      explain: `Explain this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``,
      refactor: `Refactor this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\nOutput only the refactored code.`,
      review: `Review this ${language} code for bugs and improvements:\n\`\`\`${language}\n${code}\n\`\`\``,
      fix: `Fix bugs in this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\n${description ? `Issue: ${description}` : ''}`,
      document: `Add documentation to this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``,
    };
    const prompt =
      prompts[task] ||
      `${task}: ${description}\n${code ? `\`\`\`${language}\n${code}\n\`\`\`` : ''}`;
    return this.generate(prompt, { temperature: 0.4, maxTokens: 4096 });
  }

  async json(prompt: string, schema: any, options: any = {}): Promise<any> {
    const schemaStr = JSON.stringify(schema, null, 2);
    const structuredPrompt = `${prompt}\n\nRespond ONLY with valid JSON matching this schema:\n${schemaStr}\n\nJSON:`;
    const result = await this.generate(structuredPrompt, {
      ...options,
      temperature: options.temperature ?? 0.3,
    });
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result.parsed = JSON.parse(jsonMatch[0]);
    } catch {
      /* best effort */
    }
    return result;
  }

  async analyze(text: string, task: string, options: any = {}): Promise<any> {
    const taskPrompts: Record<string, string> = {
      sentiment: `Analyze the sentiment of this text (positive/negative/neutral):\n\n${text}`,
      summary: `Summarize this text concisely:\n\n${text}`,
      keywords: `Extract key topics from this text, comma-separated:\n\n${text}`,
      translate: `Translate to ${options.targetLanguage || 'en'}:\n\n${text}`,
    };
    const prompt = taskPrompts[task] || `${task}:\n\n${text}`;
    return this.generate(prompt, { temperature: 0.3, maxTokens: 1024 });
  }

  async embed(text: string | string[]): Promise<any> {
    const input = Array.isArray(text) ? text.join('\n') : text;
    const result = await this.callTool('ollama_embed', { input, model: this.defaultModel });
    return this._normalizeResult(result, 'embed');
  }

  async vision(_image: string, _prompt: string, _options: any = {}): Promise<any> {
    return {
      content: 'Vision not available via this bridge.',
      success: false,
      operation: 'vision',
      raw: null,
    };
  }

  async functionCall(messages: any[], tools: any[], options: any = {}): Promise<any> {
    const toolDesc = tools
      .map(
        (t: any) => `- ${t.function?.name || t.name}: ${t.function?.description || t.description}`,
      )
      .join('\n');
    const systemMsg = {
      role: 'system',
      content: `Tools:\n${toolDesc}\n\nTo use a tool, respond: {"tool": "name", "arguments": {...}}`,
    };
    return this.chat([systemMsg, ...messages], options);
  }

  async grammar(prompt: string, options: any = {}): Promise<any> {
    const hint = options.jsonSchema
      ? `\nRespond ONLY with JSON: ${JSON.stringify(options.jsonSchema)}`
      : '';
    return this.generate(prompt + hint, {
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 2048,
    });
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  async similarity(text1: string, text2: string): Promise<any> {
    try {
      const [e1, e2] = await Promise.all([this.embed(text1), this.embed(text2)]);
      if (e1.raw?.embedding && e2.raw?.embedding) {
        const score = cosineSimilarity(e1.raw.embedding, e2.raw.embedding);
        return {
          content: String(score),
          similarity: score,
          success: true,
          operation: 'similarity',
        };
      }
      return { content: 'Embeddings not available', success: false, operation: 'similarity' };
    } catch (err: any) {
      return { content: err.message, success: false, operation: 'similarity' };
    }
  }

  async countTokens(text: string): Promise<any> {
    const approx = Math.ceil(text.length / 4);
    return {
      content: String(approx),
      tokens: approx,
      success: true,
      operation: 'count_tokens',
      approximate: true,
    };
  }

  async getInfo(): Promise<any> {
    try {
      const result = await this.callTool('ollama_list', {});
      this._healthCheckCache = { ...result, checkedAt: new Date() };
      return this._normalizeResult(result, 'info');
    } catch (err: any) {
      return { content: err.message, success: false, operation: 'info', error: err.message };
    }
  }

  async healthCheck(forceRefresh = false): Promise<any> {
    if (!forceRefresh && this._healthCheckCache) {
      const age = Date.now() - this._healthCheckCache.checkedAt.getTime();
      if (age < 30000) return { available: true, ...this._healthCheckCache };
    }
    try {
      const info = await this.getInfo();
      return { available: info.success !== false, ...info, checkedAt: new Date() };
    } catch (err: any) {
      return { available: false, error: err.message, checkedAt: new Date() };
    }
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  _normalizeResult(result: any, operation: string): any {
    // Ollama API returns: { response, model, total_duration, eval_count, ... }
    let content =
      result.response ||
      result.message?.content ||
      result.content ||
      result.text ||
      result.result ||
      '';

    // ⚠️ CRITICAL: Manual stop token enforcement (fallback if Ollama ignores them)
    const stopTokens = [
      '<|end|>',
      '<|user|>',
      '<|system|>',
      '<|im_end|>',
      '<|im_start|>', // ChatML (Qwen3 native format)
      '### System',
      '### User Request',
    ];
    if (typeof content === 'string') {
      for (const stopToken of stopTokens) {
        const idx = content.indexOf(stopToken);
        if (idx !== -1) {
          content = content.substring(0, idx).trim();
          break;
        }
      }

      // ⚠️ EMERGENCY: Remove exact repetitions (hallucination loop detector)
      // Split on sentence boundaries (.!?) AND newlines
      const sentences = content.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
      const seen = new Map();
      const deduped = [];

      for (const sentence of sentences) {
        const normalized = sentence.trim().toLowerCase();
        if (!normalized) continue;

        const count = seen.get(normalized) || 0;
        if (count < 1) {
          // Allow only 1 occurrence (no repeats)
          deduped.push(sentence);
          seen.set(normalized, count + 1);
        }
      }

      content = deduped.join(' ').trim();

      // Secondary pass: detect repeated phrases within unsplit text
      // Catches "I don't know X I don't know X I don't know X" (no punctuation)
      if (content.length > 100) {
        // Short phrases (20+ chars repeating 3+ times)
        const phraseMatch = content.match(/(.{20,}?)\1{2,}/);
        if (phraseMatch) {
          const escaped = phraseMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(`(${escaped}){2,}`, 'g'), phraseMatch[1]);
        }

        // Longer blocks (50+ chars repeating 2+ times) — catches paragraph-level loops
        const blockMatch = content.match(/(.{50,}?)\1+/);
        if (blockMatch) {
          const escaped = blockMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(`(${escaped})+`, 'g'), blockMatch[1]);
        }
      }
    }

    const tokens = result.eval_count || result.tokens || result.token_count || 0;
    const model = result.model || this.defaultModel;

    return {
      content: typeof content === 'string' ? content : JSON.stringify(content),
      model,
      duration_ms: result.duration_ms || (result.total_duration ? result.total_duration / 1e6 : 0),
      tokens,
      success: true,
      operation,
      raw: result,
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    nA = 0,
    nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

// =============================================================================
// Singleton
// =============================================================================

let _bridgeInstance: LlamaCppBridge | null = null;

export function getLlamaCppBridge(config: any = {}): LlamaCppBridge {
  if (!_bridgeInstance) _bridgeInstance = new LlamaCppBridge(config);
  return _bridgeInstance;
}

export function resetLlamaCppBridge(): void {
  _bridgeInstance = null;
}

export default { LlamaCppBridge, getLlamaCppBridge, resetLlamaCppBridge, MCP_TOOLS, MCP_SERVER_ID };
