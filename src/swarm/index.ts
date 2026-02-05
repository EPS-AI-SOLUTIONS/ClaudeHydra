/**
 * ClaudeHydra - Main Entry Point
 * School of the Wolf - 12 Witcher Agents
 *
 * 3-Tier Model Hierarchy:
 * - COMMANDER (Claude Opus): Dijkstra - Planning/Strategy
 * - COORDINATOR (Claude Sonnet): Regis, Yennefer, Jaskier
 * - EXECUTOR (llama.cpp): Geralt, Triss, Vesemir, Ciri, Eskel, Lambert, Zoltan, Philippa
 *
 * @module swarm
 */

// Re-export agents
export {
  // Tier configuration
  MODEL_TIERS,
  AGENT_TIERS,
  EXECUTOR_MODELS,

  // Agent definitions
  AGENT_SPECS,
  AGENT_NAMES,

  // Model resolution
  getAgentModel,
  getAgentSpec,
  getAgentTier,
  getAgentsByTier,

  // Prompts
  buildAgentPrompt,

  // Invocation
  invokeAgent,

  // Classification
  classifyPrompt,
  classifyPrompts,
  analyzeComplexity,

  // Health checks
  checkProviders,
  checkRequiredModels
} from './agents.js';

// Re-export protocol
export {
  SWARM_VERSION,
  invokeSwarm,
  quickSwarm,
  yoloSwarm,
  STANDARD_MODE,
  YOLO_MODE
} from './protocol.js';

// Default export
import agents from './agents.js';
import protocol from './protocol.js';

export default {
  ...agents,
  ...protocol
};
