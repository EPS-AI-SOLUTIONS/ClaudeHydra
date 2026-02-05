/**
 * Swarm Mode - Full Witcher Swarm functionality
 * @module cli-unified/modes/SwarmMode
 */

import { EventEmitter } from 'events';
import { EnhancedMode } from './EnhancedMode.js';
import { AGENT_NAMES } from '../core/constants.js';

/**
 * Swarm Mode - includes 12 agents, chains, parallel execution
 */
export class SwarmMode extends EventEmitter {
  constructor(cli) {
    super();
    this.cli = cli;
    this.name = 'swarm';
    this.enhancedMode = new EnhancedMode(cli);
  }

  /**
   * Initialize swarm mode
   */
  async init() {
    // Initialize enhanced mode first
    await this.enhancedMode.init();

    // Register swarm commands
    this.registerCommands();
    this.emit('ready');
  }

  /**
   * Register swarm commands
   */
  registerCommands() {
    const parser = this.cli.commandParser;

    // Agent selection
    parser.register({
      name: 'agent',
      aliases: ['a'],
      description: 'Select or show agent',
      usage: '/agent [name|auto]',
      category: 'agents',
      handler: async (args) => {
        if (!args[0]) {
          const current = this.cli.agentRouter.getCurrent();
          const agents = this.cli.agentRouter.list();
          return [
            `Current: ${current?.name || 'auto'}`,
            '',
            'Available agents:',
            ...agents.map(a => `  ${a.avatar} ${a.name}: ${a.role}`)
          ].join('\n');
        }

        const agent = this.cli.agentRouter.select(args[0], '');
        return `Agent set to: ${agent.avatar} ${agent.name} (${agent.role})`;
      }
    });

    // Agent info
    parser.register({
      name: 'agents',
      description: 'List all agents',
      category: 'agents',
      handler: async () => {
        const agents = this.cli.agentRouter.list();
        return agents
          .map(a => `${a.avatar} ${a.name.padEnd(12)} ${a.role}`)
          .join('\n');
      }
    });

    // Agent stats
    parser.register({
      name: 'stats',
      description: 'Show agent statistics',
      category: 'agents',
      handler: async () => {
        const stats = this.cli.agentRouter.getStats();
        const lines = ['Agent Statistics:', ''];

        for (const [name, stat] of Object.entries(stats)) {
          if (stat.calls > 0) {
            lines.push(`${name}: ${stat.calls} calls, ${stat.avgTime}ms avg, ${stat.successRate}% success`);
          }
        }

        if (lines.length === 2) {
          lines.push('No agent executions yet');
        }

        return lines.join('\n');
      }
    });

    // Chain command
    parser.register({
      name: 'chain',
      description: 'Create agent chain',
      usage: '/chain <agent1> <agent2> ... -- <prompt>',
      category: 'agents',
      handler: async (args) => {
        const delimiterIdx = args.indexOf('--');
        if (delimiterIdx === -1) {
          return 'Usage: /chain <agent1> <agent2> ... -- <prompt>';
        }

        const agentNames = args.slice(0, delimiterIdx);
        const prompt = args.slice(delimiterIdx + 1).join(' ');

        if (agentNames.length === 0 || !prompt) {
          return 'Usage: /chain <agent1> <agent2> ... -- <prompt>';
        }

        return this.executeChain(agentNames, prompt);
      }
    });

    // Parallel execution
    parser.register({
      name: 'parallel',
      aliases: ['par'],
      description: 'Execute with multiple agents in parallel',
      usage: '/parallel <agent1,agent2,...> <prompt>',
      category: 'agents',
      handler: async (args) => {
        if (args.length < 2) {
          return 'Usage: /parallel <agent1,agent2,...> <prompt>';
        }

        const agentNames = args[0].split(',');
        const prompt = args.slice(1).join(' ');

        return this.executeParallel(agentNames, prompt);
      }
    });

    // Quick shortcuts for common agents
    for (const agentName of AGENT_NAMES) {
      const lower = agentName.toLowerCase();
      parser.register({
        name: lower,
        description: `Query ${agentName}`,
        usage: `/${lower} <prompt>`,
        category: 'agents',
        hidden: true,
        handler: async (args) => {
          if (!args[0]) return `Usage: /${lower} <prompt>`;
          return this.queryAgent(agentName, args.join(' '));
        }
      });
    }

    // Macro recording
    parser.register({
      name: 'macro',
      description: 'Macro recording',
      usage: '/macro [record|stop|run|list] [name]',
      category: 'automation',
      handler: async (args) => {
        switch (args[0]) {
          case 'record':
            if (!args[1]) return 'Usage: /macro record <name>';
            this.cli.input.startMacroRecording(args[1]);
            return `Recording macro: ${args[1]}`;
          case 'stop':
            const macro = this.cli.input.stopMacroRecording();
            return macro ? `Saved macro: ${macro.name} (${macro.actions.length} actions)` : 'Not recording';
          case 'run':
            if (!args[1]) return 'Usage: /macro run <name>';
            await this.cli.input.executeMacro(args[1]);
            return `Executed macro: ${args[1]}`;
          case 'list':
          default:
            const macros = this.cli.input.macros.list();
            if (macros.length === 0) return 'No macros';
            return macros.map(m => `${m.key}: ${m.actionCount} actions`).join('\n');
        }
      }
    });

    // Swarm protocol
    parser.register({
      name: 'swarm',
      description: 'Execute full swarm protocol',
      usage: '/swarm <prompt>',
      category: 'agents',
      handler: async (args) => {
        if (!args[0]) return 'Usage: /swarm <prompt>';
        return this.executeSwarmProtocol(args.join(' '));
      }
    });

    // YOLO mode
    parser.register({
      name: 'yolo',
      description: 'Execute in YOLO mode (fast, less safe)',
      usage: '/yolo <prompt>',
      category: 'agents',
      handler: async (args, ctx) => {
        if (!args[0]) return 'Usage: /yolo <prompt>';
        ctx.yolo = true;
        return this.queryAgent('Ciri', args.join(' '), { temperature: 0.9 });
      }
    });
  }

  /**
   * Query specific agent
   */
  async queryAgent(agentName, prompt, options = {}) {
    const agent = this.cli.agentRouter.select(agentName, prompt);
    this.cli.output.startSpinner(`${agent.avatar} ${agent.name} is thinking...`);

    try {
      const result = await this.cli.queryProcessor.process(prompt, {
        agent: agentName,
        ...options,
        onToken: this.cli.streaming ? (token) => {
          this.cli.output.streamWrite(token);
        } : null
      });

      if (this.cli.streaming) {
        this.cli.output.streamFlush();
      }

      this.cli.output.stopSpinnerSuccess(`${agent.avatar} ${agent.name} done`);
      return result.response;
    } catch (error) {
      this.cli.output.stopSpinnerFail(error.message);
      throw error;
    }
  }

  /**
   * Execute agent chain
   */
  async executeChain(agentNames, prompt) {
    const results = [];
    let currentPrompt = prompt;

    for (const name of agentNames) {
      this.cli.output.info(`Chain: ${name}...`);

      const response = await this.queryAgent(name, currentPrompt);
      results.push({ agent: name, response });

      // Use response as context for next agent
      currentPrompt = `Previous agent (${name}) response:\n${response}\n\nContinue with: ${prompt}`;
    }

    return results.map(r => `\n--- ${r.agent} ---\n${r.response}`).join('\n');
  }

  /**
   * Execute parallel queries
   */
  async executeParallel(agentNames, prompt) {
    this.cli.output.startSpinner('Executing in parallel...');

    try {
      const queries = agentNames.map(name => ({
        prompt,
        options: { agent: name }
      }));

      const { results, errors } = await this.cli.queryProcessor.processParallel(queries);

      const output = [];
      for (let i = 0; i < agentNames.length; i++) {
        const name = agentNames[i];
        const result = results[i];
        if (result?.error) {
          output.push(`\n--- ${name} [ERROR] ---\n${result.error}`);
        } else if (result?.response) {
          output.push(`\n--- ${name} ---\n${result.response}`);
        } else {
          output.push(`\n--- ${name} [NO RESPONSE] ---`);
        }
      }

      return output.join('\n');
    } finally {
      this.cli.output.stopSpinner();
    }
  }

  /**
   * Execute full swarm protocol
   */
  async executeSwarmProtocol(prompt) {
    const stages = ['Speculate', 'Plan', 'Execute', 'Synthesize', 'Log'];
    const progress = this.cli.output.createProgressIndicator(stages);
    progress.start();

    const results = {};

    try {
      // Stage 1: Speculate (Regis)
      progress.advance('Speculating...');
      results.speculation = await this.queryAgent('Regis', `Research and analyze: ${prompt}`);

      // Stage 2: Plan (Dijkstra)
      progress.advance('Planning...');
      results.plan = await this.queryAgent('Dijkstra',
        `Based on this analysis:\n${results.speculation}\n\nCreate a detailed plan for: ${prompt}`
      );

      // Stage 3: Execute (parallel with relevant agents)
      progress.advance('Executing...');
      const executors = ['Yennefer', 'Triss', 'Lambert'];
      const parallel = await this.executeParallel(executors,
        `Following this plan:\n${results.plan}\n\nImplement your part for: ${prompt}`
      );
      results.execution = parallel;

      // Stage 4: Synthesize (Yennefer)
      progress.advance('Synthesizing...');
      results.synthesis = await this.queryAgent('Yennefer',
        `Synthesize these results:\n${results.execution}\n\nInto a coherent solution for: ${prompt}`
      );

      // Stage 5: Log (Jaskier)
      progress.advance('Documenting...');
      results.summary = await this.queryAgent('Jaskier',
        `Summarize this swarm execution:\n${results.synthesis}`
      );

      progress.complete();

      return `\n=== SWARM COMPLETE ===\n\n${results.summary}`;
    } catch (error) {
      this.cli.output.error(`Swarm failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process input in swarm mode
   */
  async processInput(input, ctx = {}) {
    // Check for @agent syntax
    const agentMatch = input.match(/^@(\w+)\s+(.+)$/);
    if (agentMatch) {
      const [, agentName, prompt] = agentMatch;
      return { type: 'query', result: await this.queryAgent(agentName, prompt) };
    }

    // Delegate to enhanced mode
    return this.enhancedMode.processInput(input, ctx);
  }

  /**
   * Get mode info
   */
  getInfo() {
    return {
      name: this.name,
      description: 'Full Witcher Swarm with 12 agents',
      features: [
        '12 Specialized Agents',
        'Agent Chains',
        'Parallel Execution',
        'Swarm Protocol',
        'YOLO Mode',
        'Macros'
      ]
    };
  }
}

export function createSwarmMode(cli) {
  return new SwarmMode(cli);
}

export default SwarmMode;
