/**
 * @fileoverview Barrel exports for Hydra Manager modules
 *
 * @description
 * Central export point for the three extracted managers:
 * - HydraProviderManager: Provider lifecycle, health checks, direct calls
 * - HydraStatsManager: Statistics, metrics, trends
 * - HydraFeatureManager: Claude Code features (MCP, Hooks, Planning, Todos, Agents, Git)
 *
 * @module hydra/managers
 * @version 2.0.0
 */

export type {
  ClaudeCodeInstanceOptions,
  ExecuteOptions,
  InstanceMetrics,
  InstanceState,
  TaskInfo,
} from './claude-code-instance.js';
// Claude Code Instance (Single Instance)
export { ClaudeCodeInstance } from './claude-code-instance.js';
// Claude Instance Manager (Multi-Instance Pool)
export {
  ClaudeInstanceManager,
  getClaudeInstanceManager,
  resetClaudeInstanceManager,
} from './claude-instance-manager.js';
// Feature Manager
export {
  getFeatureManager,
  HydraFeatureManager,
  resetFeatureManager,
} from './feature-manager.js';
// Provider Manager
export {
  getProviderManager,
  HydraProviderManager,
  resetProviderManager,
} from './provider-manager.js';
// Stats Manager
export {
  getHydraStatsManager,
  HydraStatsManager,
  resetHydraStatsManager,
} from './stats-manager.js';
