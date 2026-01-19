// ============================================================================
// WITCHER MODE - Intelligent CLI Routing
// Frontend implementation for easier extensibility
// ============================================================================

import { CLIProvider, getProvider, ProviderResponse } from './index';

export type WitcherSign = 'aard' | 'igni' | 'yrden' | 'quen' | 'axii';

export type TaskType =
  | 'code_generation'
  | 'long_context'
  | 'background_task'
  | 'multi_language'
  | 'symbolic_analysis'
  | 'system_operation'
  | 'security_audit'
  | 'general';

export interface RouteDecision {
  provider: CLIProvider;
  taskType: TaskType;
  sign?: WitcherSign;
  confidence: number;
  reason: string;
}

// ============================================================================
// WITCHER SIGNS CONFIGURATION
// ============================================================================

const WITCHER_SIGNS: Record<WitcherSign, {
  name: string;
  description: string;
  primaryProvider: CLIProvider;
  fallbackProvider: CLIProvider;
}> = {
  aard: {
    name: 'Aard',
    description: 'Fast code generation push',
    primaryProvider: 'codex',
    fallbackProvider: 'claude',
  },
  igni: {
    name: 'Igni',
    description: 'Deep analysis fire',
    primaryProvider: 'gemini',
    fallbackProvider: 'claude',
  },
  yrden: {
    name: 'Yrden',
    description: 'Background task trap',
    primaryProvider: 'jules',
    fallbackProvider: 'claude',
  },
  quen: {
    name: 'Quen',
    description: 'Security audit shield',
    primaryProvider: 'claude',
    fallbackProvider: 'grok',
  },
  axii: {
    name: 'Axii',
    description: 'Multi-model consensus mind control',
    primaryProvider: 'claude', // Orchestrator
    fallbackProvider: 'claude',
  },
};

// ============================================================================
// TASK DETECTION PATTERNS
// ============================================================================

const TASK_PATTERNS: Record<TaskType, string[]> = {
  code_generation: [
    'napisz kod', 'write code', 'implement', 'zaimplementuj',
    'create function', 'stwórz funkcję', 'add method', 'dodaj metodę',
    'generate', 'wygeneruj', 'code', 'kod', 'function', 'class',
  ],
  long_context: [
    'całą bazę', 'entire codebase', 'all files', 'wszystkie pliki',
    'full repository', 'cały projekt', 'analyze everything',
    'przeanalizuj wszystko', 'deep dive', 'comprehensive', 'full analysis',
  ],
  background_task: [
    'in background', 'w tle', 'async', 'asynchronously',
    'później', 'later', 'schedule', 'zaplanuj', 'queue', 'batch',
  ],
  multi_language: [
    'python', 'rust', 'java', 'kotlin', 'swift', 'go ', 'golang',
    'ruby', 'php', 'scala', 'haskell', 'c++', 'c#',
  ],
  symbolic_analysis: [
    'find symbol', 'znajdź symbol', 'references', 'referencje',
    'refactor', 'rename', 'zmień nazwę', 'call graph', 'dependency',
  ],
  system_operation: [
    'run command', 'uruchom', 'execute', 'wykonaj', 'terminal',
    'shell', 'bash', 'powershell', 'install', 'zainstaluj', 'build',
  ],
  security_audit: [
    'security', 'bezpieczeństwo', 'audit', 'audyt', 'vulnerability',
    'podatność', 'pentest', 'owasp', 'exploit', 'secure',
  ],
  general: [],
};

// Task type to provider mapping
const TASK_TO_PROVIDER: Record<TaskType, CLIProvider> = {
  code_generation: 'claude',
  long_context: 'gemini',
  background_task: 'jules',
  multi_language: 'codex',
  symbolic_analysis: 'claude',
  system_operation: 'claude',
  security_audit: 'claude',
  general: 'claude',
};

// ============================================================================
// WITCHER ROUTER CLASS
// ============================================================================

export class WitcherRouter {
  private routeHistory: RouteDecision[] = [];

  /**
   * Detect Witcher sign from prompt
   */
  detectSign(prompt: string): WitcherSign | undefined {
    const lower = prompt.toLowerCase();

    if (lower.includes('/witcher aard') || (lower.includes('aard') && lower.includes('witcher'))) {
      return 'aard';
    }
    if (lower.includes('/witcher igni') || (lower.includes('igni') && lower.includes('witcher'))) {
      return 'igni';
    }
    if (lower.includes('/witcher yrden') || (lower.includes('yrden') && lower.includes('witcher'))) {
      return 'yrden';
    }
    if (lower.includes('/witcher quen') || (lower.includes('quen') && lower.includes('witcher'))) {
      return 'quen';
    }
    if (lower.includes('/witcher axii') || (lower.includes('axii') && lower.includes('witcher'))) {
      return 'axii';
    }

    return undefined;
  }

  /**
   * Detect task type from prompt content
   */
  detectTaskType(prompt: string): { type: TaskType; confidence: number } {
    const lower = prompt.toLowerCase();
    let bestMatch: TaskType = 'general';
    let bestScore = 0;

    for (const [taskType, patterns] of Object.entries(TASK_PATTERNS) as [TaskType, string[]][]) {
      if (taskType === 'general') continue;

      const matchCount = patterns.filter(p => lower.includes(p)).length;
      const score = matchCount / patterns.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = taskType;
      }
    }

    return {
      type: bestMatch,
      confidence: bestScore > 0 ? Math.min(bestScore * 2, 1) : 0.5,
    };
  }

  /**
   * Route a prompt to the best provider
   */
  route(prompt: string): RouteDecision {
    // Check for Witcher sign first
    const sign = this.detectSign(prompt);

    if (sign) {
      const signConfig = WITCHER_SIGNS[sign];
      const decision: RouteDecision = {
        provider: signConfig.primaryProvider,
        taskType: 'general',
        sign,
        confidence: 1.0,
        reason: `Witcher Sign ${signConfig.name}: ${signConfig.description}`,
      };
      this.routeHistory.push(decision);
      return decision;
    }

    // Detect task type
    const { type: taskType, confidence } = this.detectTaskType(prompt);
    const provider = TASK_TO_PROVIDER[taskType];

    const decision: RouteDecision = {
      provider,
      taskType,
      confidence,
      reason: `Task type: ${taskType} → Provider: ${provider}`,
    };

    this.routeHistory.push(decision);
    return decision;
  }

  /**
   * Execute Axii sign - Multi-model consensus
   */
  async executeAxii(prompt: string): Promise<{
    consensus: string;
    responses: Record<CLIProvider, ProviderResponse>;
  }> {
    const providers: CLIProvider[] = ['claude', 'gemini', 'ollama'];
    const responses: Record<CLIProvider, ProviderResponse> = {} as any;

    // Query all providers in parallel
    const results = await Promise.allSettled(
      providers.map(async (providerId) => {
        const provider = getProvider(providerId);
        const response = await provider.send(prompt);
        return { providerId, response };
      })
    );

    // Collect responses
    for (const result of results) {
      if (result.status === 'fulfilled') {
        responses[result.value.providerId] = result.value.response;
      }
    }

    // Simple consensus: use the longest non-error response
    // In a real implementation, this could be more sophisticated
    let consensus = '';
    let maxLength = 0;

    for (const response of Object.values(responses)) {
      if (!response.error && response.content.length > maxLength) {
        maxLength = response.content.length;
        consensus = response.content;
      }
    }

    return { consensus, responses };
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    total: number;
    byProvider: Record<CLIProvider, number>;
    byTaskType: Record<TaskType, number>;
    bySign: Record<WitcherSign, number>;
  } {
    const byProvider: Partial<Record<CLIProvider, number>> = {};
    const byTaskType: Partial<Record<TaskType, number>> = {};
    const bySign: Partial<Record<WitcherSign, number>> = {};

    for (const decision of this.routeHistory) {
      byProvider[decision.provider] = (byProvider[decision.provider] || 0) + 1;
      byTaskType[decision.taskType] = (byTaskType[decision.taskType] || 0) + 1;
      if (decision.sign) {
        bySign[decision.sign] = (bySign[decision.sign] || 0) + 1;
      }
    }

    return {
      total: this.routeHistory.length,
      byProvider: byProvider as Record<CLIProvider, number>,
      byTaskType: byTaskType as Record<TaskType, number>,
      bySign: bySign as Record<WitcherSign, number>,
    };
  }

  /**
   * Clear routing history
   */
  clearHistory(): void {
    this.routeHistory = [];
  }
}

// Singleton instance
let routerInstance: WitcherRouter | null = null;

export function getWitcherRouter(): WitcherRouter {
  if (!routerInstance) {
    routerInstance = new WitcherRouter();
  }
  return routerInstance;
}

// ============================================================================
// WITCHER COMMAND PARSER
// ============================================================================

export interface WitcherCommand {
  sign?: WitcherSign;
  action: string;
  args: string[];
}

export function parseWitcherCommand(input: string): WitcherCommand | null {
  const witcherMatch = input.match(/^\/witcher\s+(\w+)(?:\s+(.*))?$/i);

  if (!witcherMatch) return null;

  const [, signOrAction, rest] = witcherMatch;
  const sign = signOrAction.toLowerCase() as WitcherSign;

  if (sign in WITCHER_SIGNS) {
    return {
      sign,
      action: rest || '',
      args: rest ? rest.split(/\s+/) : [],
    };
  }

  return {
    action: signOrAction,
    args: rest ? rest.split(/\s+/) : [],
  };
}
