export interface SwarmAgent {
  name: string;
  persona: string;
  specialization: string;
  model: string;
}

export interface SwarmConfig {
  agents: SwarmAgent[];
  maxConcurrent: number;
  timeout: number;
}

export interface SwarmResult {
  mode: 'swarm';
  title: string;
  summary: string;
  final: string;
  agents: AgentResult[];
  warnings: string[];
}

export interface AgentResult {
  name: string;
  model: string;
  fallbackUsed: boolean;
  preview: string;
  success: boolean;
}

// ============================================================================
// WITCHER MODE TYPES
// ============================================================================

/**
 * Provider names for multi-CLI orchestration
 */
export type ProviderName = 'anthropic' | 'google' | 'openai' | 'xai' | 'ollama';

/**
 * Witcher Sign configuration for specialized operations
 */
export interface WitcherSign {
  name: string;
  description: string;
  primary: ProviderName;
  timeout_ms: number;
  async: boolean;
  parallel: boolean;
}

/**
 * Fallback configuration for provider chain
 */
export interface FallbackConfig {
  enabled: boolean;
  max_retries: number;
  chain: ProviderName[];
}

/**
 * Debug configuration for tracing and logging
 */
export interface DebugConfig {
  enabled: boolean;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  correlation_id: string;
}

/**
 * Cache configuration for response caching
 */
export interface CacheConfig {
  enabled: boolean;
  ttl_ms: number;
  encryption_key: string;
  max_size: number;
}