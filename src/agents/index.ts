/**
 * Agents Module
 *
 * Task Agents mapped to Witcher characters for specialized operations.
 *
 * @module src/agents
 */

// Base Agent
import { AgentState as _AgentState, BaseAgent as _BaseAgent } from './base-agent.js';
export { _BaseAgent as BaseAgent, _AgentState as AgentState };

// Specialized Agents
import {
  createExploreAgent as _createExploreAgent,
  ExploreAgent as _ExploreAgent,
} from './explore-agent.js';
export { _ExploreAgent as ExploreAgent, _createExploreAgent as createExploreAgent };

import { createPlanAgent as _createPlanAgent, PlanAgent as _PlanAgent } from './plan-agent.js';
export { _PlanAgent as PlanAgent, _createPlanAgent as createPlanAgent };

import { BashAgent as _BashAgent, createBashAgent as _createBashAgent } from './bash-agent.js';
export { _BashAgent as BashAgent, _createBashAgent as createBashAgent };

// ============================================================================
// Agent Registry
// ============================================================================

/**
 * Agent type to class mapping
 * @type {Object<string, Function>}
 */
const AGENT_CLASSES = {
  explore: () => import('./explore-agent.js').then((m) => m.ExploreAgent),
  plan: () => import('./plan-agent.js').then((m) => m.PlanAgent),
  bash: () => import('./bash-agent.js').then((m) => m.BashAgent),
};

/**
 * Witcher name to agent type mapping
 * @type {Object<string, string>}
 */
export const WITCHER_AGENT_MAP = {
  // Research & Analysis
  Regis: 'explore',

  // Strategy & Planning
  Dijkstra: 'plan',

  // DevOps & Shell
  Eskel: 'bash',

  // Additional mappings for other Witcher agents
  // (These could be implemented as needed)
  Yennefer: 'code', // System Architecture
  Lambert: 'refactor', // Code Optimization
  Triss: 'test', // QA & Testing
  Jaskier: 'document', // Documentation
  Vesemir: 'review', // Code Review
  Geralt: 'security', // Security
  Ciri: 'performance', // Performance
  Zoltan: 'data', // Data & Database
  Philippa: 'api', // API & Integration
};

/**
 * Agent instances cache
 * @type {Map<string, BaseAgent>}
 */
const agentCache = new Map();

/**
 * Get or create an agent by type
 *
 * @param {string} type - Agent type
 * @param {Object} [options] - Agent options
 * @returns {Promise<BaseAgent>}
 */
export async function getAgent(type, options = {}) {
  const cacheKey = `${type}-${JSON.stringify(options)}`;

  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey);
  }

  // Store promise immediately to prevent race condition
  const agentPromise = (async () => {
    const AgentClass = await getAgentClass(type);
    if (!AgentClass) {
      // Remove failed promise from cache
      agentCache.delete(cacheKey);
      throw new Error(`Unknown agent type: ${type}`);
    }
    return new AgentClass(options);
  })();

  agentCache.set(cacheKey, agentPromise);

  return agentPromise;
}

/**
 * Get agent class by type
 *
 * @param {string} type - Agent type
 * @returns {Promise<Function | null>}
 */
export async function getAgentClass(type) {
  const loader = AGENT_CLASSES[type.toLowerCase()];
  if (!loader) {
    return null;
  }
  return loader();
}

/**
 * Get agent by Witcher name
 *
 * @param {string} witcherName - Witcher character name
 * @param {Object} [options] - Agent options
 * @returns {Promise<BaseAgent | null>}
 */
export async function getAgentByWitcherName(witcherName, options = {}) {
  const agentType = WITCHER_AGENT_MAP[witcherName];
  if (!agentType) {
    return null;
  }
  return getAgent(agentType, options);
}

/**
 * Clear agent cache
 */
export async function clearAgentCache() {
  const agents = await Promise.allSettled([...agentCache.values()]);
  for (const result of agents) {
    if (result.status === 'fulfilled' && result.value?.reset) {
      result.value.reset();
    }
  }
  agentCache.clear();
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run an exploration task
 *
 * @param {string} query - Search query
 * @param {Object} [options] - Options
 * @returns {Promise<Object>}
 */
export async function explore(query, options = {}) {
  const agent = await getAgent('explore');
  return agent.run({ query, ...options });
}

/**
 * Run a planning task
 *
 * @param {string} goal - Planning goal
 * @param {Object} [options] - Options
 * @returns {Promise<Object>}
 */
export async function plan(goal, options = {}) {
  const agent = await getAgent('plan');
  return agent.run({ query: goal, ...options });
}

/**
 * Run a bash command
 *
 * @param {string} command - Command to execute
 * @param {Object} [options] - Options
 * @returns {Promise<Object>}
 */
export async function bash(command, options = {}) {
  const agent = await getAgent('bash');
  return agent.run({ command, ...options });
}

/**
 * List available agent types
 *
 * @returns {string[]}
 */
export function listAgentTypes() {
  return Object.keys(AGENT_CLASSES);
}

/**
 * List Witcher agent mappings
 *
 * @returns {Object}
 */
export function listWitcherAgents() {
  return { ...WITCHER_AGENT_MAP };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Base
  BaseAgent: _BaseAgent,
  AgentState: _AgentState,

  // Agents
  ExploreAgent: _ExploreAgent,
  PlanAgent: _PlanAgent,
  BashAgent: _BashAgent,

  // Factory
  createExploreAgent: _createExploreAgent,
  createPlanAgent: _createPlanAgent,
  createBashAgent: _createBashAgent,

  // Registry
  getAgent,
  getAgentClass,
  getAgentByWitcherName,
  clearAgentCache,

  // Convenience
  explore,
  plan,
  bash,
  listAgentTypes,
  listWitcherAgents,

  // Mappings
  WITCHER_AGENT_MAP,
};
