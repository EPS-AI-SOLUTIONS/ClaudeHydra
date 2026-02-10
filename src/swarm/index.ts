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
  AGENT_NAMES,
  // Agent definitions
  AGENT_SPECS,
  AGENT_TIERS,
  analyzeComplexity,
  // Prompts
  buildAgentPrompt,
  // Health checks
  checkProviders,
  checkRequiredModels,
  // Classification
  classifyPrompt,
  classifyPrompts,
  EXECUTOR_MODELS,
  // Model resolution
  getAgentModel,
  getAgentSpec,
  getAgentsByTier,
  getAgentTier,
  // Invocation
  invokeAgent,
  // Tier configuration
  MODEL_TIERS,
} from './agents.js';

// Re-export protocol
export {
  invokeSwarm,
  quickSwarm,
  STANDARD_MODE,
  SWARM_VERSION,
  YOLO_MODE,
  yoloSwarm,
} from './protocol.js';

// Default export
import agents from './agents.js';
import protocol from './protocol.js';

export default {
  ...agents,
  ...protocol,
};
