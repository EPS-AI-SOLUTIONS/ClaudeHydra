import Logger from '../logger.js';
import { swarmSchema } from '../schemas/tools.js';

let runSwarm;
try {
  // ESM dynamic import
  const swarmModule = await import('../swarm.js');
  runSwarm = swarmModule.runSwarm || swarmModule.default;
} catch (e) {
  Logger.warn('Swarm module not found or failed to load', { error: e.message });
}

const hydraSwarmTool = {
  name: 'hydra_swarm',
  description: 'Execute the 6-step Agent Swarm Protocol',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      agents: { type: 'array', items: { type: 'string' } },
      saveMemory: { type: 'boolean' }
    },
    required: ['prompt']
  },
  execute: async (args) => {
    Logger.info('Invoking Hydra Swarm', { prompt_preview: args.prompt.substring(0, 50) });
    
    const validation = swarmSchema.safeParse(args);
    if (!validation.success) {
      throw new Error(`Validation Error: ${validation.error.message}`);
    }

    if (!runSwarm) {
      return { error: 'Swarm engine is not available.' };
    }

    const result = await runSwarm(args);
    return result;
  }
};

export default [hydraSwarmTool];