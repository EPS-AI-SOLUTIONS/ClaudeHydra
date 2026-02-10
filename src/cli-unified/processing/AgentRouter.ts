/**
 * Agent Router for Witcher Swarm
 * Based on src/cli-enhanced/agent-router.js
 * @module cli-unified/processing/AgentRouter
 */

import { EventEmitter } from 'node:events';
import { AGENT_TIERS } from '../../swarm/agents.js';
import { getLogger } from '../../utils/logger.js';
import { AGENT_AVATARS, AGENT_NAMES } from '../core/constants.js';
import { EVENT_TYPES, eventBus } from '../core/EventBus.js';

const logger = getLogger('AgentRouter');

/**
 * Agent specifications
 */
/**
 * Model tier mapping — all agents now use Claude Opus 4 via Anthropic API.
 *
 * Cloud model (Anthropic API):
 *   claude-opus-4-20250514 — all tiers, maximum capability
 */
const MODEL_TIER = {
  heavy: 'claude-opus-4-20250514', // Architecture, review, planning, research
  medium: 'claude-opus-4-20250514', // Security, documentation, data, integrations
  fast: 'claude-opus-4-20250514', // Quick tasks, portals
  code: 'claude-opus-4-20250514', // Code-specific tasks
};

export const AGENT_SPECS = {
  Geralt: {
    name: 'Geralt',
    role: 'Security & Validation',
    model: MODEL_TIER.medium,
    temperature: 0.3,
    patterns: [
      'security',
      'auth',
      'permission',
      'validate',
      'sanitize',
      'xss',
      'sql injection',
      'bezpieczeństwo',
      'autoryzacja',
      'uprawnienia',
      'walidacja',
      'zabezpiecz',
    ],
    avatar: AGENT_AVATARS.Geralt,
    color: '#c0c0c0',
  },
  Yennefer: {
    name: 'Yennefer',
    role: 'Architecture & Synthesis',
    model: MODEL_TIER.heavy,
    temperature: 0.7,
    patterns: [
      'architecture',
      'design',
      'pattern',
      'refactor',
      'structure',
      'synthesize',
      'architektura',
      'projektuj',
      'wzorzec',
      'struktura',
      'synteza',
      'modularyzacja',
    ],
    avatar: AGENT_AVATARS.Yennefer,
    color: '#9400d3',
  },
  Triss: {
    name: 'Triss',
    role: 'Data & Integration',
    model: MODEL_TIER.medium,
    temperature: 0.5,
    patterns: [
      'data',
      'database',
      'api',
      'integration',
      'transform',
      'migrate',
      'dane',
      'baza danych',
      'integracja',
      'transformuj',
      'migracja',
      'migruj',
    ],
    avatar: AGENT_AVATARS.Triss,
    color: '#ff4500',
  },
  Jaskier: {
    name: 'Jaskier',
    role: 'Documentation & Logging',
    model: MODEL_TIER.medium,
    temperature: 0.8,
    patterns: [
      'document',
      'explain',
      'readme',
      'comment',
      'log',
      'describe',
      'dokumentacja',
      'opisz',
      'wyjaśnij',
      'komentarz',
      'udokumentuj',
    ],
    avatar: AGENT_AVATARS.Jaskier,
    color: '#ffd700',
  },
  Vesemir: {
    name: 'Vesemir',
    role: 'Code Review & Mentoring',
    model: MODEL_TIER.medium,
    temperature: 0.4,
    patterns: [
      'review',
      'mentor',
      'best practice',
      'convention',
      'quality',
      'przegląd',
      'recenzja',
      'jakość',
      'konwencja',
      'sprawdź kod',
    ],
    avatar: AGENT_AVATARS.Vesemir,
    color: '#8b4513',
  },
  Ciri: {
    name: 'Ciri',
    role: 'Fast Execution & Portals',
    model: MODEL_TIER.fast,
    temperature: 0.5,
    patterns: [
      'quick',
      'fast',
      'convert',
      'transform',
      'port',
      'migrate',
      'szybko',
      'konwertuj',
      'przekształć',
      'przenieś',
    ],
    avatar: AGENT_AVATARS.Ciri,
    color: '#00ced1',
  },
  Eskel: {
    name: 'Eskel',
    role: 'Testing & Stability',
    model: MODEL_TIER.medium,
    temperature: 0.3,
    patterns: [
      'test',
      'unit',
      'spec',
      'coverage',
      'stability',
      'regression',
      'testuj',
      'testy',
      'pokrycie',
      'stabilność',
      'regresja',
    ],
    avatar: AGENT_AVATARS.Eskel,
    color: '#2f4f4f',
  },
  Lambert: {
    name: 'Lambert',
    role: 'Refactoring & Cleanup',
    model: MODEL_TIER.medium,
    temperature: 0.4,
    patterns: [
      'refactor',
      'clean',
      'optimize',
      'simplify',
      'remove',
      'delete',
      'refaktoryzacja',
      'refaktoryzuj',
      'wyczyść',
      'optymalizuj',
      'uprość',
      'usuń',
    ],
    avatar: AGENT_AVATARS.Lambert,
    color: '#cd853f',
  },
  Zoltan: {
    name: 'Zoltan',
    role: 'Infrastructure & DevOps',
    model: MODEL_TIER.medium,
    temperature: 0.5,
    patterns: [
      'deploy',
      'docker',
      'ci',
      'cd',
      'infrastructure',
      'kubernetes',
      'server',
      'wdróż',
      'wdrożenie',
      'infrastruktura',
      'serwer',
      'kontener',
    ],
    avatar: AGENT_AVATARS.Zoltan,
    color: '#daa520',
  },
  Regis: {
    name: 'Regis',
    role: 'Research & Speculation',
    model: MODEL_TIER.heavy,
    temperature: 0.9,
    patterns: [
      'research',
      'analyze',
      'speculate',
      'explore',
      'investigate',
      'zbadaj',
      'analizuj',
      'przeanalizuj',
      'eksploruj',
      'sprawdź',
      'zbadaj kod',
      'analiza',
    ],
    avatar: AGENT_AVATARS.Regis,
    color: '#800020',
  },
  Dijkstra: {
    name: 'Dijkstra',
    role: 'Planning & Strategy',
    model: MODEL_TIER.heavy,
    temperature: 0.6,
    patterns: [
      'plan',
      'strategy',
      'roadmap',
      'task',
      'schedule',
      'organize',
      'zaplanuj',
      'strategia',
      'harmonogram',
      'zadanie',
      'organizuj',
      'plan',
    ],
    avatar: AGENT_AVATARS.Dijkstra,
    color: '#4b0082',
  },
  Philippa: {
    name: 'Philippa',
    role: 'UI/UX & Frontend',
    model: MODEL_TIER.medium,
    temperature: 0.6,
    patterns: [
      'ui',
      'ux',
      'frontend',
      'css',
      'html',
      'react',
      'component',
      'design',
      'interfejs',
      'komponent',
      'stylowanie',
      'widok',
    ],
    avatar: AGENT_AVATARS.Philippa,
    color: '#8b008b',
  },
};

/**
 * Agent Router
 */
export class AgentRouter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.agents = { ...AGENT_SPECS };
    this.defaultAgent = options.defaultAgent || 'auto';
    this.currentAgent = null;
    this.stats = {};

    // Initialize stats
    for (const name of AGENT_NAMES) {
      this.stats[name] = { calls: 0, totalTime: 0, errors: 0 };
    }
  }

  /**
   * Classify prompt to determine best agent.
   * Uses pattern matching with both English and Polish keywords.
   * Falls back to Regis (research) for general queries instead of Jaskier.
   */
  classify(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const scores = {};

    for (const [name, spec] of Object.entries(this.agents)) {
      scores[name] = 0;

      for (const pattern of spec.patterns) {
        if (lowerPrompt.includes(pattern)) {
          scores[name] += 1;
        }
      }

      // Boost for exact word matches (handles word boundaries)
      for (const pattern of spec.patterns) {
        // Escape regex special chars in pattern, use unicode word boundary for Polish
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          const regex = new RegExp(`(?:^|\\s|[.,!?;:])${escaped}(?:$|\\s|[.,!?;:])`, 'i');
          if (regex.test(prompt)) {
            scores[name] += 0.5;
          }
        } catch {
          // Skip invalid regex patterns
        }
      }
    }

    // Find highest scoring agent
    // Fallback to Regis (research & analysis) for general/ambiguous queries
    // instead of Jaskier — Regis is better suited for open-ended prompts
    let bestAgent = 'Regis';
    let bestScore = 0;

    for (const [name, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestAgent = name;
      }
    }

    // If best score is too low (< 1.0), the match is weak — use Regis as general-purpose
    if (bestScore < 1.0) {
      bestAgent = 'Regis';
    }

    return {
      agent: bestAgent,
      score: bestScore,
      scores,
    };
  }

  /**
   * Select agent (manual or auto)
   */
  select(nameOrAuto, prompt = '') {
    if (nameOrAuto === 'auto' || !nameOrAuto) {
      const classification = this.classify(prompt);
      this.currentAgent = classification.agent;

      logger.agent(this.currentAgent, `Auto-selected (score: ${classification.score.toFixed(2)})`, {
        topScores: Object.entries(classification.scores)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 3)
          .map(([name, score]) => `${name}:${score}`),
      });

      eventBus.emit(EVENT_TYPES.AGENT_SELECT, {
        agent: this.currentAgent,
        auto: true,
        score: classification.score,
      });
      return this.agents[this.currentAgent];
    }

    // Manual selection
    const name = this.normalizeName(nameOrAuto);
    if (!this.agents[name]) {
      throw new Error(`Unknown agent: ${nameOrAuto}`);
    }

    this.currentAgent = name;
    logger.agent(name, 'Manually selected');
    eventBus.emit(EVENT_TYPES.AGENT_SELECT, { agent: name, auto: false });
    return this.agents[name];
  }

  /**
   * Normalize agent name
   */
  normalizeName(name) {
    const lower = name.toLowerCase();
    for (const agentName of AGENT_NAMES) {
      if (agentName.toLowerCase() === lower) {
        return agentName;
      }
    }
    return name;
  }

  /**
   * Get current agent
   */
  getCurrent() {
    return this.currentAgent ? this.agents[this.currentAgent] : null;
  }

  /**
   * Get agent by name
   */
  get(name) {
    const normalized = this.normalizeName(name);
    return this.agents[normalized] || null;
  }

  /**
   * List all agents
   */
  list() {
    return Object.values(this.agents).map((agent) => ({
      name: agent.name,
      role: agent.role,
      avatar: agent.avatar,
      color: agent.color,
    }));
  }

  /**
   * Build agent prompt with structured instructions for better LLM output.
   * For Claude models: clean prompt without ChatML tokens.
   * For local models (Ollama): ChatML format with <|system|> tokens.
   */
  buildPrompt(agent, userPrompt, options?: { isClaudeModel?: boolean }) {
    const spec = typeof agent === 'string' ? this.agents[agent] : agent;
    if (!spec) return userPrompt;

    const tier = this.getAgentTier(spec.name);

    // Claude API — clean prompt without ChatML tokens
    if (options?.isClaudeModel) {
      return `You are ${spec.name}, a senior software engineer specialized in ${spec.role}.
Expertise: ${spec.patterns.join(', ')}.
Tier: ${tier} in ClaudeHydra multi-agent swarm.

Rules:
- Be thorough but concise
- If you don't know something, say "I don't know"
- Respond in the same language as the user's request
- End with [DONE] when complete, [CONTINUE] if more space needed
- When using the Task tool, subagent_type must use EXACT casing: "Bash", "Explore", "Plan", "general-purpose" (case-sensitive!)

${userPrompt}`;
    }

    // Local models (Ollama) — ChatML format
    return `<|system|>
You are ${spec.name}, a senior software engineer specialized in ${spec.role}.
Expertise: ${spec.patterns.join(', ')}.

IDENTITY & PIPELINE:
- You are an AI agent in ClaudeHydra v2.0.0, a multi-agent swarm system
- 12 Witcher-themed agents, all powered by Claude Opus 4 (Anthropic Cloud API)
  * COMMANDER (Dijkstra) - strategic planning & coordination
  * COORDINATORS (Regis, Yennefer) - research & synthesis
  * EXECUTORS (Geralt, Triss, Jaskier, Vesemir, Ciri, Eskel, Lambert, Zoltan, Philippa) - task execution
- Your current model: claude-opus-4-20250514 (Anthropic Cloud API)
- Your tier: ${tier}

ENVIRONMENT:
- Running LOCALLY on the user's machine via ClaudeHydra CLI
- You have access to local files and shell commands through MCP tools
- MCP tools available: list_directory, read_file, write_file, delete_file, knowledge_add, knowledge_search, run_shell_command, hydra_swarm, swarm_status
- Display: terminal (monospace font, no rich formatting)
- DO NOT suggest cloud APIs or external services unless asked

OUTPUT RULES:
- Be thorough but concise — answer the question fully
- If your response is incomplete or you need more space, end with [CONTINUE]
- If you are confident the answer is complete and fully addresses the question, end with [DONE]
- If you need to use tools (read files, run commands), request them — you have tool access
- If you don't know something, say "I don't know" and STOP immediately
- NEVER repeat the same sentence twice
- Be direct — this is a CLI, not a chatbot
- Respond in the same language as the user's request
<|end|>

<|user|>
${userPrompt}
<|end|>

<|assistant|>`;
  }

  /**
   * Get the tier classification for an agent
   */
  getAgentTier(agentName) {
    return AGENT_TIERS[agentName] || 'executor';
  }

  /**
   * Record execution stats
   */
  recordExecution(agentName, duration, error = null) {
    if (!this.stats[agentName]) {
      this.stats[agentName] = { calls: 0, totalTime: 0, errors: 0 };
    }

    this.stats[agentName].calls++;
    this.stats[agentName].totalTime += duration;

    if (error) {
      this.stats[agentName].errors++;
    }

    if (error) {
      eventBus.emit(EVENT_TYPES.AGENT_ERROR, { agent: agentName, error });
    } else {
      eventBus.emit(EVENT_TYPES.AGENT_COMPLETE, { agent: agentName, duration });
    }
  }

  /**
   * Get execution statistics
   */
  getStats() {
    const result = {};

    for (const [name, stat] of Object.entries(this.stats)) {
      result[name] = {
        ...stat,
        avgTime: stat.calls > 0 ? Math.round(stat.totalTime / stat.calls) : 0,
        successRate:
          stat.calls > 0 ? (((stat.calls - stat.errors) / stat.calls) * 100).toFixed(1) : 100,
      };
    }

    return result;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    for (const name of AGENT_NAMES) {
      this.stats[name] = { calls: 0, totalTime: 0, errors: 0 };
    }
  }

  /**
   * Get model for agent
   */
  getModel(agentName) {
    const agent = this.get(agentName);
    return agent?.model || 'llama3.2';
  }

  /**
   * Get temperature for agent
   */
  getTemperature(agentName) {
    const agent = this.get(agentName);
    return agent?.temperature ?? 0.7;
  }

  /**
   * Update agent configuration
   */
  updateAgent(name, config) {
    const normalized = this.normalizeName(name);
    if (!this.agents[normalized]) {
      throw new Error(`Unknown agent: ${name}`);
    }

    this.agents[normalized] = {
      ...this.agents[normalized],
      ...config,
    };

    this.emit('agentUpdated', normalized, this.agents[normalized]);
  }

  /**
   * Create agent chain
   */
  createChain(agentNames) {
    return agentNames
      .map((name) => ({
        name: this.normalizeName(name),
        agent: this.get(name),
      }))
      .filter((a) => a.agent);
  }
}

export function createAgentRouter(options) {
  return new AgentRouter(options);
}

// Export constants
export { AGENT_NAMES, AGENT_AVATARS };

export default AgentRouter;
