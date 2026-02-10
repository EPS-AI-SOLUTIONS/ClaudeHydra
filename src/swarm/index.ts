/**
 * ClaudeHydra - Main Entry Point
 * School of the Wolf - 12 Witcher Agents
 *
 * 3-Tier Model Hierarchy:
 * - COMMANDER (Claude Opus 4): Dijkstra - Planning/Strategy
 * - COORDINATOR (Claude Opus 4): Regis, Yennefer
 * - EXECUTOR (Claude Opus 4): Geralt, Triss, Ciri, Eskel, Lambert, Zoltan, Philippa, Jaskier
 * - EXECUTOR (Claude Sonnet 4.5): Vesemir - Code Review/Quality (cost-effective)
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

// Re-export Vesemir reviewer
export {
  Category,
  formatReview,
  quickReview,
  REVIEW_MODEL,
  reviewDiff,
  reviewFiles,
  Severity,
  strictReview,
} from './vesemir-reviewer.js';

// Default export
import agents from './agents.js';
import protocol from './protocol.js';
import vesemirReviewer from './vesemir-reviewer.js';

export default {
  ...agents,
  ...protocol,
  ...vesemirReviewer,
};
