/**
 * Swarm Bridge Tool - Refactored with BaseTool architecture
 * Bridges to the Agent Swarm Protocol with improved error handling
 * @module tools/swarm-bridge
 */

import { z } from 'zod';
import { BaseTool, ToolResult } from './base-tool.js';
import { swarmSchema } from '../schemas/tools.js';
import { ValidationError, ToolExecutionError } from '../errors/AppError.js';

/**
 * @typedef {Object} SwarmIteration
 * @property {string} agent - Agent that performed the iteration
 * @property {string} output - Iteration output
 * @property {number} [duration] - Duration in milliseconds
 */

/**
 * @typedef {Object} SwarmResult
 * @property {boolean} [success] - Whether execution succeeded
 * @property {string} [error] - Error message if failed
 * @property {SwarmIteration[]} [iterations] - Execution iterations
 * @property {string} [finalOutput] - Final consolidated output
 * @property {string} [output] - Alternative output field
 * @property {string[]} [agentsUsed] - List of agents that participated
 * @property {number} [executionTime] - Total execution time
 * @property {boolean} [memoryStored] - Whether results were stored to memory
 * @property {*} [partialResults] - Partial results if execution failed midway
 */

/**
 * @typedef {Object} ProcessedSwarmResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} [error] - Error message if failed
 * @property {SwarmIteration[]} [iterations] - Execution iterations
 * @property {string} [finalOutput] - Final consolidated output
 * @property {string[]} [agentsUsed] - List of agents that participated
 * @property {number} [executionTime] - Total execution time
 * @property {boolean} [memoryStored] - Whether results were stored
 * @property {SwarmSummary} [summary] - Execution summary
 */

/**
 * @typedef {Object} SwarmSummary
 * @property {number} totalIterations - Total number of iterations
 * @property {number} uniqueAgents - Number of unique agents used
 * @property {boolean} hasOutput - Whether output was produced
 * @property {boolean} completedSuccessfully - Whether swarm completed without errors
 */

/**
 * @typedef {function(Object): Promise<SwarmResult>} SwarmFunction
 */

// Lazy load swarm module to handle optional dependency
/** @type {SwarmFunction|null} */
let runSwarm = null;
/** @type {string|null} */
let swarmLoadError = null;

/**
 * Load the swarm module lazily
 * @returns {Promise<{runSwarm: SwarmFunction|null, error: string|null}>}
 */
async function loadSwarmModule() {
  if (runSwarm !== null || swarmLoadError !== null) {
    return { runSwarm, error: swarmLoadError };
  }

  try {
    const swarmModule = await import('../swarm.js');
    runSwarm = swarmModule.runSwarm || swarmModule.default;

    if (typeof runSwarm !== 'function') {
      throw new Error('Swarm module does not export a valid runSwarm function');
    }

    return { runSwarm, error: null };
  } catch (error) {
    swarmLoadError = error.message;
    return { runSwarm: null, error: swarmLoadError };
  }
}

/**
 * Swarm execution result processor
 * @class SwarmResultProcessor
 */
class SwarmResultProcessor {
  /**
   * Process and normalize swarm execution results
   * @param {SwarmResult} rawResult - Raw result from swarm execution
   * @returns {ProcessedSwarmResult} Processed result
   */
  static process(rawResult) {
    if (!rawResult) {
      return {
        success: false,
        error: 'Swarm returned no result'
      };
    }

    // Handle error results
    if (rawResult.error) {
      return {
        success: false,
        error: rawResult.error,
        partialResults: rawResult.partialResults || null
      };
    }

    // Process successful results
    return {
      success: true,
      iterations: rawResult.iterations || [],
      finalOutput: rawResult.finalOutput || rawResult.output,
      agentsUsed: rawResult.agentsUsed || [],
      executionTime: rawResult.executionTime,
      memoryStored: rawResult.memoryStored || false,
      summary: this.generateSummary(rawResult)
    };
  }

  /**
   * Generate a summary of swarm execution
   * @param {SwarmResult} result - Raw swarm result
   * @returns {SwarmSummary} Execution summary
   */
  static generateSummary(result) {
    const iterations = result.iterations || [];
    const agentCount = new Set(iterations.map(i => i.agent)).size;

    return {
      totalIterations: iterations.length,
      uniqueAgents: agentCount,
      hasOutput: !!(result.finalOutput || result.output),
      completedSuccessfully: result.success !== false
    };
  }
}

/**
 * Hydra Swarm Tool - Execute multi-agent swarm protocol
 * @class HydraSwarmTool
 * @extends BaseTool
 */
class HydraSwarmTool extends BaseTool {
  constructor() {
    super({
      name: 'hydra_swarm',
      description: 'Execute the multi-step Agent Swarm Protocol for complex task decomposition and execution',
      inputSchema: swarmSchema,
      timeoutMs: 300000 // 5 minutes for swarm operations
    });
  }

  /**
   * Execute the swarm protocol
   * @param {Object} input - Validated input
   * @param {string} input.prompt - Task description for the swarm
   * @param {string[]} [input.agents] - Specific agents to use
   * @param {boolean} [input.saveMemory=true] - Save results to memory
   * @param {string} [input.title] - Title for the swarm session
   * @param {number} [input.maxIterations=6] - Maximum iteration count
   * @param {boolean} [input.parallel=true] - Run agents in parallel
   * @returns {Promise<ProcessedSwarmResult & {config: Object}>}
   * @throws {ToolExecutionError} If swarm engine is unavailable
   */
  async run({ prompt, agents, saveMemory, title, maxIterations, parallel }) {
    // Load swarm module
    const { runSwarm: swarmFn, error } = await loadSwarmModule();

    if (error || !swarmFn) {
      throw new ToolExecutionError(
        `Swarm engine is not available: ${error || 'Unknown error'}`,
        'SWARM_UNAVAILABLE'
      );
    }

    this.logger.info('Invoking Hydra Swarm', {
      promptPreview: prompt.substring(0, 100),
      agents,
      maxIterations,
      parallel
    });

    // Execute swarm with configuration
    const rawResult = await swarmFn({
      prompt,
      agents,
      saveMemory,
      title,
      maxIterations,
      parallel
    });

    // Process and return result
    const processed = SwarmResultProcessor.process(rawResult);

    return {
      ...processed,
      config: {
        prompt: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
        agents,
        saveMemory,
        maxIterations
      }
    };
  }
}

/**
 * Swarm Status Tool - Check swarm availability and status
 * @class SwarmStatusTool
 * @extends BaseTool
 */
class SwarmStatusTool extends BaseTool {
  constructor() {
    super({
      name: 'swarm_status',
      description: 'Check the availability and status of the swarm engine',
      inputSchema: z.object({}),
      timeoutMs: 5000
    });
  }

  /**
   * Execute the status check
   * @returns {Promise<{available: boolean, error: string|null, version: string, capabilities: string[]}>}
   */
  async run() {
    const { runSwarm: swarmFn, error } = await loadSwarmModule();

    return {
      available: !!swarmFn,
      error: error || null,
      version: swarmFn?.version || 'unknown',
      capabilities: swarmFn ? await this.getCapabilities(swarmFn) : []
    };
  }

  /**
   * Get swarm engine capabilities
   * @param {SwarmFunction} swarmFn - Swarm function
   * @returns {Promise<string[]>} List of capabilities
   * @private
   */
  async getCapabilities(swarmFn) {
    const capabilities = ['basic_execution'];

    if (swarmFn.supportedAgents) {
      capabilities.push('custom_agents');
    }
    if (swarmFn.parallelExecution) {
      capabilities.push('parallel_execution');
    }
    if (swarmFn.memoryIntegration) {
      capabilities.push('memory_integration');
    }

    return capabilities;
  }
}

// Create tool instances
const hydraSwarmTool = new HydraSwarmTool();
const swarmStatusTool = new SwarmStatusTool();

/**
 * Export tools in legacy format for backward compatibility
 * @type {{hydraSwarm: HydraSwarmTool, swarmStatus: SwarmStatusTool}}
 */
export const tools = {
  hydraSwarm: hydraSwarmTool,
  swarmStatus: swarmStatusTool
};

/**
 * Legacy export format for existing tool registry
 * @type {Array<{name: string, description: string, inputSchema: Object, execute: Function}>}
 */
export default [
  {
    name: hydraSwarmTool.name,
    description: hydraSwarmTool.description,
    inputSchema: hydraSwarmTool.getJsonSchema(),
    execute: (input) => hydraSwarmTool.execute(input)
  },
  {
    name: swarmStatusTool.name,
    description: swarmStatusTool.description,
    inputSchema: swarmStatusTool.getJsonSchema(),
    execute: (input) => swarmStatusTool.execute(input)
  }
];

// Named exports for direct class access
export {
  HydraSwarmTool,
  SwarmResultProcessor,
  SwarmStatusTool,
  loadSwarmModule
};
