/**
 * Agent Router for Witcher Swarm
 * Based on src/cli-enhanced/agent-router.js
 * @module cli-unified/processing/AgentRouter
 */

import { EventEmitter } from 'events';
import { AGENT_NAMES, AGENT_AVATARS } from '../core/constants.js';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';

/**
 * Agent specifications
 */
export const AGENT_SPECS = {
  Geralt: {
    name: 'Geralt',
    role: 'Security & Validation',
    model: 'llama3.2:1b',
    temperature: 0.3,
    patterns: ['security', 'auth', 'permission', 'validate', 'sanitize', 'xss', 'sql injection'],
    avatar: AGENT_AVATARS.Geralt,
    color: '#c0c0c0'
  },
  Yennefer: {
    name: 'Yennefer',
    role: 'Architecture & Synthesis',
    model: 'qwen2.5-coder:7b',
    temperature: 0.7,
    patterns: ['architecture', 'design', 'pattern', 'refactor', 'structure', 'synthesize'],
    avatar: AGENT_AVATARS.Yennefer,
    color: '#9400d3'
  },
  Triss: {
    name: 'Triss',
    role: 'Data & Integration',
    model: 'llama3.2:1b',
    temperature: 0.5,
    patterns: ['data', 'database', 'api', 'integration', 'transform', 'migrate'],
    avatar: AGENT_AVATARS.Triss,
    color: '#ff4500'
  },
  Jaskier: {
    name: 'Jaskier',
    role: 'Documentation & Logging',
    model: 'llama3.2:1b',
    temperature: 0.8,
    patterns: ['document', 'explain', 'readme', 'comment', 'log', 'describe'],
    avatar: AGENT_AVATARS.Jaskier,
    color: '#ffd700'
  },
  Vesemir: {
    name: 'Vesemir',
    role: 'Code Review & Mentoring',
    model: 'qwen2.5-coder:7b',
    temperature: 0.4,
    patterns: ['review', 'mentor', 'best practice', 'convention', 'quality'],
    avatar: AGENT_AVATARS.Vesemir,
    color: '#8b4513'
  },
  Ciri: {
    name: 'Ciri',
    role: 'Fast Execution & Portals',
    model: 'llama3.2:1b',
    temperature: 0.5,
    patterns: ['quick', 'fast', 'convert', 'transform', 'port', 'migrate'],
    avatar: AGENT_AVATARS.Ciri,
    color: '#00ced1'
  },
  Eskel: {
    name: 'Eskel',
    role: 'Testing & Stability',
    model: 'qwen2.5-coder:7b',
    temperature: 0.3,
    patterns: ['test', 'unit', 'spec', 'coverage', 'stability', 'regression'],
    avatar: AGENT_AVATARS.Eskel,
    color: '#2f4f4f'
  },
  Lambert: {
    name: 'Lambert',
    role: 'Refactoring & Cleanup',
    model: 'llama3.2:1b',
    temperature: 0.4,
    patterns: ['refactor', 'clean', 'optimize', 'simplify', 'remove', 'delete'],
    avatar: AGENT_AVATARS.Lambert,
    color: '#cd853f'
  },
  Zoltan: {
    name: 'Zoltan',
    role: 'Infrastructure & DevOps',
    model: 'llama3.2:1b',
    temperature: 0.5,
    patterns: ['deploy', 'docker', 'ci', 'cd', 'infrastructure', 'kubernetes', 'server'],
    avatar: AGENT_AVATARS.Zoltan,
    color: '#daa520'
  },
  Regis: {
    name: 'Regis',
    role: 'Research & Speculation',
    model: 'llama3.2:1b',
    temperature: 0.9,
    patterns: ['research', 'analyze', 'speculate', 'explore', 'investigate'],
    avatar: AGENT_AVATARS.Regis,
    color: '#800020'
  },
  Dijkstra: {
    name: 'Dijkstra',
    role: 'Planning & Strategy',
    model: 'qwen2.5-coder:7b',
    temperature: 0.6,
    patterns: ['plan', 'strategy', 'roadmap', 'task', 'schedule', 'organize'],
    avatar: AGENT_AVATARS.Dijkstra,
    color: '#4b0082'
  },
  Philippa: {
    name: 'Philippa',
    role: 'UI/UX & Frontend',
    model: 'llama3.2:1b',
    temperature: 0.6,
    patterns: ['ui', 'ux', 'frontend', 'css', 'html', 'react', 'component', 'design'],
    avatar: AGENT_AVATARS.Philippa,
    color: '#8b008b'
  }
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
   * Classify prompt to determine best agent
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

      // Boost for exact word matches
      for (const pattern of spec.patterns) {
        const regex = new RegExp(`\\b${pattern}\\b`, 'i');
        if (regex.test(prompt)) {
          scores[name] += 0.5;
        }
      }
    }

    // Find highest scoring agent
    let bestAgent = 'Jaskier'; // Default
    let bestScore = 0;

    for (const [name, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestAgent = name;
      }
    }

    return {
      agent: bestAgent,
      score: bestScore,
      scores
    };
  }

  /**
   * Select agent (manual or auto)
   */
  select(nameOrAuto, prompt = '') {
    if (nameOrAuto === 'auto' || !nameOrAuto) {
      const classification = this.classify(prompt);
      this.currentAgent = classification.agent;
      eventBus.emit(EVENT_TYPES.AGENT_SELECT, {
        agent: this.currentAgent,
        auto: true,
        score: classification.score
      });
      return this.agents[this.currentAgent];
    }

    // Manual selection
    const name = this.normalizeName(nameOrAuto);
    if (!this.agents[name]) {
      throw new Error(`Unknown agent: ${nameOrAuto}`);
    }

    this.currentAgent = name;
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
    return Object.values(this.agents).map(agent => ({
      name: agent.name,
      role: agent.role,
      avatar: agent.avatar,
      color: agent.color
    }));
  }

  /**
   * Build agent prompt
   */
  buildPrompt(agent, userPrompt) {
    const spec = typeof agent === 'string' ? this.agents[agent] : agent;
    if (!spec) return userPrompt;

    return `You are ${spec.name}, a specialized AI assistant focused on ${spec.role}.

Your expertise includes: ${spec.patterns.join(', ')}.

Please respond to the following request:

${userPrompt}`;
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
        successRate: stat.calls > 0 ? ((stat.calls - stat.errors) / stat.calls * 100).toFixed(1) : 100
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
      ...config
    };

    this.emit('agentUpdated', normalized, this.agents[normalized]);
  }

  /**
   * Create agent chain
   */
  createChain(agentNames) {
    return agentNames.map(name => ({
      name: this.normalizeName(name),
      agent: this.get(name)
    })).filter(a => a.agent);
  }
}

export function createAgentRouter(options) {
  return new AgentRouter(options);
}

// Export constants
export { AGENT_NAMES, AGENT_AVATARS };

export default AgentRouter;
