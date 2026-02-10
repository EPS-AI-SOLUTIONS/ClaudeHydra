/**
 * Tools Index - Unified export for all tools
 * Provides both legacy array format and new class-based access
 * @module tools
 */

// Import tools
import filesystemTools, {
  DeleteFileTool,
  tools as filesystemClasses,
  ListDirectoryTool,
  PathResolver,
  ReadFileTool,
  WriteFileTool,
} from './filesystem.js';
import knowledgeTools, {
  KnowledgeAddTool,
  KnowledgeDeleteTool,
  KnowledgeSearchTool,
  tools as knowledgeClasses,
  SearchResultFormatter,
} from './knowledge.js';
import shellTools, { CommandSanitizer, RunShellTool, tools as shellClasses } from './shell.js';
import swarmTools, {
  HydraSwarmTool,
  loadSwarmModule,
  SwarmResultProcessor,
  SwarmStatusTool,
  tools as swarmClasses,
} from './swarm-bridge.js';

// Import base tool and result
export { BaseTool, ToolResult } from './base-tool.js';

/**
 * All tools in legacy array format for backward compatibility
 * @type {Array<{name: string, description: string, inputSchema: Object, execute: Function}>}
 */
export const allTools = [...filesystemTools, ...shellTools, ...knowledgeTools, ...swarmTools];

/**
 * Tool registry - Map of tool names to tool definitions
 * @type {Map<string, Object>}
 */
export const toolRegistry = new Map(allTools.map((tool) => [tool.name, tool]));

/**
 * Get a tool by name
 * @param {string} name - Tool name
 * @returns {Object|undefined} Tool definition
 */
export function getTool(name) {
  return toolRegistry.get(name);
}

/**
 * Check if a tool exists
 * @param {string} name - Tool name
 * @returns {boolean}
 */
export function hasTool(name) {
  return toolRegistry.has(name);
}

/**
 * Get all tool names
 * @returns {string[]}
 */
export function getToolNames() {
  return Array.from(toolRegistry.keys());
}

/**
 * Tool classes organized by category
 */
export const toolClasses = {
  filesystem: filesystemClasses,
  shell: shellClasses,
  knowledge: knowledgeClasses,
  swarm: swarmClasses,
};

/**
 * Utility classes
 */
export const utilities = {
  PathResolver,
  CommandSanitizer,
  SearchResultFormatter,
  SwarmResultProcessor,
};

// Named exports for individual tool classes
export {
  // Filesystem
  ListDirectoryTool,
  ReadFileTool,
  WriteFileTool,
  DeleteFileTool,
  PathResolver,
  // Shell
  RunShellTool,
  CommandSanitizer,
  // Knowledge
  KnowledgeAddTool,
  KnowledgeSearchTool,
  KnowledgeDeleteTool,
  SearchResultFormatter,
  // Swarm
  HydraSwarmTool,
  SwarmResultProcessor,
  SwarmStatusTool,
  loadSwarmModule,
};

/**
 * Get tool count by category
 * @returns {Object<string, number>}
 */
export function getToolCountByCategory() {
  const counts = {
    filesystem: filesystemTools.length,
    shell: shellTools.length,
    knowledge: knowledgeTools.length,
    swarm: swarmTools.length,
  };
  return counts;
}

/**
 * Get total tool count
 * @returns {number}
 */
export function getTotalToolCount() {
  return allTools.length;
}

// Default export is the legacy array format
export default allTools;
