// ============================================================================
// AI PROVIDERS MODULE
// Centralizes all AI provider logic in frontend for easier extensibility
// ============================================================================

import { safeInvoke, isTauri } from '../hooks/useTauri';

export type CLIProvider = 'hydra' | 'gemini' | 'jules' | 'deepseek' | 'codex' | 'grok' | 'ollama';

export interface ProviderConfig {
  id: CLIProvider;
  name: string;
  icon: string;
  color: string;
  description: string;
  isAvailable: boolean;
  isLocal: boolean;
  maxContextTokens: number;
  specialties: string[];
}

export interface ProviderResponse {
  content: string;
  provider: CLIProvider;
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
}

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

export const PROVIDERS: Record<CLIProvider, ProviderConfig> = {
  hydra: {
    id: 'hydra',
    name: 'HYDRA',
    icon: '🐉',
    color: 'amber',
    description: 'Claude CLI with HYDRA context, Serena, Desktop Commander',
    isAvailable: true,
    isLocal: false,
    maxContextTokens: 200000,
    specialties: ['symbolic_analysis', 'system_operations', 'code_generation'],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    icon: '🔵',
    color: 'blue',
    description: 'Google Gemini 2.0 with 2M context window',
    isAvailable: true,
    isLocal: false,
    maxContextTokens: 2000000,
    specialties: ['long_context', 'multimodal', 'analysis'],
  },
  jules: {
    id: 'jules',
    name: 'Jules',
    icon: '🟣',
    color: 'purple',
    description: 'Google Jules for async background tasks',
    isAvailable: true,
    isLocal: false,
    maxContextTokens: 100000,
    specialties: ['background_tasks', 'async', 'github'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔴',
    color: 'red',
    description: 'DeepSeek-R1 for 100+ programming languages',
    isAvailable: true,
    isLocal: false,
    maxContextTokens: 128000,
    specialties: ['multi_language', 'code_generation', 'reasoning'],
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    icon: '🟢',
    color: 'green',
    description: 'OpenAI GPT-5-Codex for code generation',
    isAvailable: false, // Placeholder
    isLocal: false,
    maxContextTokens: 128000,
    specialties: ['code_generation', 'mcp'],
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    icon: '⚫',
    color: 'gray',
    description: 'xAI Grok 3 for real-time, unfiltered responses',
    isAvailable: false, // Placeholder
    isLocal: false,
    maxContextTokens: 100000,
    specialties: ['real_time', 'unfiltered'],
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    color: 'orange',
    description: 'Local Ollama models (free, private)',
    isAvailable: true,
    isLocal: true,
    maxContextTokens: 8000,
    specialties: ['local', 'private', 'free'],
  },
};

// ============================================================================
// BASE PROVIDER CLASS
// ============================================================================

export abstract class AIProvider {
  protected config: ProviderConfig;

  constructor(providerId: CLIProvider) {
    this.config = PROVIDERS[providerId];
  }

  abstract send(prompt: string): Promise<ProviderResponse>;
  abstract checkHealth(): Promise<boolean>;

  getConfig(): ProviderConfig {
    return this.config;
  }
}

// ============================================================================
// HYDRA PROVIDER (Claude CLI)
// ============================================================================

export class HydraProvider extends AIProvider {
  constructor() {
    super('hydra');
  }

  async send(prompt: string): Promise<ProviderResponse> {
    const start = Date.now();

    try {
      if (isTauri()) {
        const response = await safeInvoke<string>('send_to_claude', { message: prompt });
        return {
          content: response,
          provider: 'hydra',
          latencyMs: Date.now() - start,
        };
      } else {
        // Browser mode - mock
        await new Promise(r => setTimeout(r, 2000));
        return {
          content: `[HYDRA Demo] Otrzymano: "${prompt.slice(0, 50)}..."`,
          provider: 'hydra',
          latencyMs: Date.now() - start,
        };
      }
    } catch (error) {
      return {
        content: '',
        provider: 'hydra',
        error: String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (isTauri()) {
        await safeInvoke('start_claude_session', { yoloMode: true });
        return true;
      }
      return true; // Browser mode always "healthy"
    } catch {
      return false;
    }
  }
}

// ============================================================================
// GEMINI PROVIDER
// ============================================================================

export class GeminiProvider extends AIProvider {
  constructor() {
    super('gemini');
  }

  async send(prompt: string): Promise<ProviderResponse> {
    const start = Date.now();

    try {
      if (isTauri()) {
        // Try to execute Gemini CLI
        const response = await safeInvoke<string>('execute_cli', {
          provider: 'gemini',
          args: ['-p', prompt],
        });
        return {
          content: response,
          provider: 'gemini',
          latencyMs: Date.now() - start,
        };
      } else {
        await new Promise(r => setTimeout(r, 1500));
        return {
          content: `[Gemini Demo] 2M context ready for: "${prompt.slice(0, 50)}..."`,
          provider: 'gemini',
          latencyMs: Date.now() - start,
        };
      }
    } catch (error) {
      return {
        content: '',
        provider: 'gemini',
        error: String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    // Check if Gemini CLI is available
    return true; // Simplified for now
  }
}

// ============================================================================
// JULES PROVIDER (Async Background)
// ============================================================================

export class JulesProvider extends AIProvider {
  constructor() {
    super('jules');
  }

  async send(prompt: string): Promise<ProviderResponse> {
    const start = Date.now();

    try {
      if (isTauri()) {
        const response = await safeInvoke<string>('execute_cli', {
          provider: 'jules',
          args: ['run', prompt],
        });
        return {
          content: response,
          provider: 'jules',
          latencyMs: Date.now() - start,
        };
      } else {
        await new Promise(r => setTimeout(r, 1000));
        return {
          content: `[Jules Demo] Task queued: "${prompt.slice(0, 50)}..."`,
          provider: 'jules',
          latencyMs: Date.now() - start,
        };
      }
    } catch (error) {
      return {
        content: '',
        provider: 'jules',
        error: String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// DEEPSEEK PROVIDER
// ============================================================================

export class DeepSeekProvider extends AIProvider {
  constructor() {
    super('deepseek');
  }

  async send(prompt: string): Promise<ProviderResponse> {
    const start = Date.now();

    try {
      if (isTauri()) {
        const response = await safeInvoke<string>('execute_cli', {
          provider: 'deepseek',
          args: ['chat', '-m', prompt],
        });
        return {
          content: response,
          provider: 'deepseek',
          latencyMs: Date.now() - start,
        };
      } else {
        await new Promise(r => setTimeout(r, 1800));
        return {
          content: `[DeepSeek Demo] Processing: "${prompt.slice(0, 50)}..."`,
          provider: 'deepseek',
          latencyMs: Date.now() - start,
        };
      }
    } catch (error) {
      return {
        content: '',
        provider: 'deepseek',
        error: String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// OLLAMA PROVIDER (Local)
// ============================================================================

export class OllamaProvider extends AIProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:11434', model = 'llama3.2:3b') {
    super('ollama');
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async send(prompt: string): Promise<ProviderResponse> {
    const start = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        content: data.response || '',
        provider: 'ollama',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        content: '',
        provider: 'ollama',
        error: String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  setModel(model: string) {
    this.model = model;
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

const providerInstances: Partial<Record<CLIProvider, AIProvider>> = {};

export function getProvider(providerId: CLIProvider): AIProvider {
  if (!providerInstances[providerId]) {
    switch (providerId) {
      case 'hydra':
        providerInstances[providerId] = new HydraProvider();
        break;
      case 'gemini':
        providerInstances[providerId] = new GeminiProvider();
        break;
      case 'jules':
        providerInstances[providerId] = new JulesProvider();
        break;
      case 'deepseek':
        providerInstances[providerId] = new DeepSeekProvider();
        break;
      case 'ollama':
        providerInstances[providerId] = new OllamaProvider();
        break;
      default:
        // Fallback to HYDRA
        providerInstances[providerId] = new HydraProvider();
    }
  }
  return providerInstances[providerId]!;
}

export function getAvailableProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS).filter(p => p.isAvailable);
}

export function getProviderConfig(providerId: CLIProvider): ProviderConfig {
  return PROVIDERS[providerId];
}
