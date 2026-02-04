/**
 * ClaudeHydra - Main Entry Point
 * School of the Wolf - 12 Witcher Agents
 *
 * @module swarm
 */

// Re-export agents
export {
  AGENT_MODELS,
  AGENT_SPECS,
  AGENT_NAMES,
  getAgentModel,
  getAgentSpec,
  buildAgentPrompt,
  invokeAgent,
  classifyPrompt,
  classifyPrompts,
  analyzeComplexity,
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
