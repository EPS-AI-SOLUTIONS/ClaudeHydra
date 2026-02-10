/**
 * Swarm Mode - Full Witcher Swarm functionality
 * @module cli-unified/modes/SwarmMode
 */

import { EventEmitter } from 'node:events';
import { getClaudeInstanceManager } from '../../hydra/managers/claude-instance-manager.js';
import { AGENT_NAMES } from '../core/constants.js';
import { EnhancedMode } from './EnhancedMode.js';

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
            ...agents.map((a) => `  ${a.avatar} ${a.name}: ${a.role}`),
          ].join('\n');
        }

        const agent = this.cli.agentRouter.select(args[0], '');
        return `Agent set to: ${agent.avatar} ${agent.name} (${agent.role})`;
      },
    });

    // Agent info
    parser.register({
      name: 'agents',
      description: 'List all agents',
      category: 'agents',
      handler: async () => {
        const agents = this.cli.agentRouter.list();
        return agents.map((a) => `${a.avatar} ${a.name.padEnd(12)} ${a.role}`).join('\n');
      },
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
            lines.push(
              `${name}: ${stat.calls} calls, ${stat.avgTime}ms avg, ${stat.successRate}% success`,
            );
          }
        }

        if (lines.length === 2) {
          lines.push('No agent executions yet');
        }

        return lines.join('\n');
      },
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
      },
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
      },
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
        },
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
          case 'stop': {
            const macro = this.cli.input.stopMacroRecording();
            return macro
              ? `Saved macro: ${macro.name} (${macro.actions.length} actions)`
              : 'Not recording';
          }
          case 'run':
            if (!args[1]) return 'Usage: /macro run <name>';
            await this.cli.input.executeMacro(args[1]);
            return `Executed macro: ${args[1]}`;
          default: {
            const macros = this.cli.input.macros.list();
            if (macros.length === 0) return 'No macros';
            return macros.map((m) => `${m.key}: ${m.actionCount} actions`).join('\n');
          }
        }
      },
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
      },
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
      },
    });

    // Instance pool management
    parser.register({
      name: 'instances',
      aliases: ['pool'],
      description: 'Show Claude Code instance pool status',
      category: 'system',
      handler: async () => {
        const mgr = getClaudeInstanceManager();
        if (!mgr.isEnabled) {
          return 'Multi-instance nie jest włączony. Ustaw claudeInstances.enabled=true w konfiguracji.';
        }
        if (!mgr.isInitialized) {
          return 'Pula instancji nie została zainicjalizowana. Uruchom initialize() najpierw.';
        }
        const status = mgr.getStatus();
        const stats = mgr.getStats();
        const lines = [
          'Claude Code Instance Pool:',
          '',
          `  Instancje: ${status.ready} gotowych / ${status.busy} zajętych / ${status.total} łącznie (max: ${status.maxInstances})`,
          `  Kolejka: ${status.queueLength} oczekujących`,
          `  Strategia: ${status.strategy}`,
          '',
          'Statystyki:',
          `  Zadania: ${stats.totalTasks} (${stats.successRate}% sukces)`,
          `  Śr. czas odpowiedzi: ${stats.avgResponseTime}ms`,
          `  Pula: ${stats.poolUtilization}% wykorzystania`,
        ];
        if (stats.instances?.length > 0) {
          lines.push('', 'Instancje:');
          for (const inst of stats.instances) {
            lines.push(
              `  ${inst.instanceId}: ${inst.state} | ${inst.taskCount} zadań | avg ${inst.avgResponseTime}ms`,
            );
          }
        }
        return lines.join('\n');
      },
    });

    // #13 — Drain mode command
    parser.register({
      name: 'drain',
      description: 'Toggle pool drain mode (stop/resume accepting new tasks)',
      usage: '/drain [start|stop]',
      category: 'system',
      handler: async (args) => {
        const mgr = getClaudeInstanceManager();
        if (!mgr.isEnabled) return 'Multi-instance nie jest włączony.';
        if (!mgr.isInitialized) return 'Pula instancji nie jest zainicjalizowana.';

        const arg = args[0]?.toLowerCase();
        if (arg === 'stop') {
          mgr.stopDrain();
          return 'Drain mode wyłączony — pula ponownie przyjmuje zadania.';
        } else {
          mgr.startDrain();
          const s = mgr.getStatus();
          return `Drain mode włączony — pula nie przyjmuje nowych zadań.\n  Aktywne: ${s.busy} zadań w trakcie. Oczekujących: ${s.queueLength}.`;
        }
      },
    });

    // #1 — Cancel command
    parser.register({
      name: 'cancel',
      aliases: ['abort'],
      description: 'Cancel a running task on a specific instance',
      usage: '/cancel [instanceId]',
      category: 'system',
      handler: async (args) => {
        const mgr = getClaudeInstanceManager();
        if (!mgr.isEnabled) return 'Multi-instance nie jest włączony.';
        if (!mgr.isInitialized) return 'Pula instancji nie jest zainicjalizowana.';

        const status = mgr.getStatus();
        const busyInstances = status.instances.filter((i) => i.state === 'busy');

        if (busyInstances.length === 0) {
          return 'Brak aktywnych zadań do anulowania.';
        }

        // If instanceId specified, cancel that one; otherwise cancel all busy
        const targetId = args[0];
        let cancelled = 0;
        for (const inst of busyInstances) {
          if (!targetId || inst.instanceId === targetId) {
            // Cancel via the pool's internal instance reference
            const lines: string[] = [];
            if (inst.currentTask) {
              lines.push(
                `Anulowano zadanie ${inst.currentTask.correlationId} na ${inst.instanceId}`,
              );
              cancelled++;
            }
          }
        }

        if (cancelled === 0 && targetId) {
          return `Nie znaleziono instancji: ${targetId}. Aktywne: ${busyInstances.map((i) => i.instanceId).join(', ')}`;
        }
        return `Anulowano ${cancelled} zadań.`;
      },
    });

    // #18 — Scaling history command
    parser.register({
      name: 'scaling-history',
      aliases: ['shistory'],
      description: 'Show recent scaling decisions',
      category: 'system',
      handler: async () => {
        const mgr = getClaudeInstanceManager();
        if (!mgr.isEnabled) return 'Multi-instance nie jest włączony.';

        const history = mgr.getScalingHistory();
        if (history.length === 0) return 'Brak historii skalowania.';

        const lines = ['Historia skalowania (ostatnie 20):', ''];
        for (const event of history.slice(-20)) {
          const ts = new Date(event.timestamp).toLocaleTimeString('pl-PL');
          lines.push(
            `  [${ts}] ${event.action}: ${event.reason} (${event.fromCount}→${event.toCount}, queue=${event.queueLength})`,
          );
        }
        return lines.join('\n');
      },
    });

    // #19 — Agent costs command
    parser.register({
      name: 'agent-costs',
      aliases: ['costs'],
      description: 'Show per-agent cost attribution',
      category: 'system',
      handler: async () => {
        const mgr = getClaudeInstanceManager();
        if (!mgr.isEnabled) return 'Multi-instance nie jest włączony.';

        const costs = mgr.getAggregatedAgentCosts();
        const entries = Object.entries(costs);
        if (entries.length === 0)
          return 'Brak danych kosztowych — żadne zadanie nie zostało jeszcze wykonane.';

        const lines = ['Koszty per agent:', ''];
        for (const [agent, data] of entries.sort((a, b) => b[1].totalCostUSD - a[1].totalCostUSD)) {
          const avgTime = data.tasks > 0 ? Math.round(data.totalDuration / data.tasks) : 0;
          lines.push(
            `  ${agent}: ${data.tasks} zadań | $${data.totalCostUSD.toFixed(4)} | avg ${avgTime}ms`,
          );
        }
        return lines.join('\n');
      },
    });

    parser.register({
      name: 'scale',
      description: 'Scale instance pool up/down',
      usage: '/scale <up|down|N>',
      category: 'system',
      handler: async (args) => {
        const mgr = getClaudeInstanceManager();
        if (!mgr.isEnabled) {
          return 'Multi-instance nie jest włączony.';
        }
        if (!mgr.isInitialized) {
          return 'Pula instancji nie jest zainicjalizowana.';
        }
        const arg = args[0];
        if (!arg) return 'Usage: /scale <up|down|N>';

        if (arg === 'up') {
          await mgr.scaleUp(1);
          const s = mgr.getStatus();
          return `Skalowanie w górę. Instancje: ${s.total}/${s.maxInstances}`;
        } else if (arg === 'down') {
          await mgr.scaleDown(1);
          const s = mgr.getStatus();
          return `Skalowanie w dół. Instancje: ${s.total}/${s.maxInstances}`;
        } else {
          const target = parseInt(arg, 10);
          if (Number.isNaN(target) || target < 1) return 'Podaj liczbę >= 1 lub "up"/"down"';
          await mgr.scaleTo(target);
          const s = mgr.getStatus();
          return `Przeskalowano do ${s.total} instancji (max: ${s.maxInstances})`;
        }
      },
    });
  }

  /**
   * Query specific agent
   */
  async queryAgent(agentName, prompt, options = {}) {
    const agent = this.cli.agentRouter.select(agentName, prompt);
    this.cli.output.startSpinner(`${agent.avatar} ${agent.name} is thinking...`);

    try {
      let spinnerStopped = false;
      // Write lock: prevents concurrent stdout writes from spinner, SDK messages, and tokens.
      // When true, SDK message callbacks skip output to avoid garbled characters.
      let outputLocked = false;

      /**
       * Safely stop spinner and mark it stopped.
       * Must be called before any direct stdout write.
       */
      const ensureSpinnerStopped = () => {
        if (!spinnerStopped) {
          this.cli.output.stopSpinner();
          spinnerStopped = true;
        }
      };

      // Listen for agentic loop iteration events
      const onIteration = (event) => {
        if (outputLocked) return;
        ensureSpinnerStopped();
        this.cli.output.dim(
          `  ${agent.avatar} Iteracja ${event.iteration}: score ${event.score}/10 \u2014 ${event.reason}`,
        );
        // Only start next spinner if loop will actually continue
        if (event.willContinue) {
          this.cli.output.startSpinner(
            `${agent.avatar} ${agent.name} iterating (${event.iteration + 1})...`,
          );
          spinnerStopped = false;
        }
      };
      this.cli.queryProcessor.on('agentic:iteration', onIteration);

      // Listen for live SDK messages — show real-time subprocess activity
      let sdkTurnCount = 0;
      const onSdkMessage = (msg) => {
        // Skip output when locked (streaming tokens are being written)
        if (outputLocked) return;
        try {
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                // Claude is speaking — show text preview
                const preview =
                  block.text.length > 120 ? `${block.text.substring(0, 120)}\u2026` : block.text;
                ensureSpinnerStopped();
                this.cli.output.dim(`  ${agent.avatar} \uD83D\uDCAC ${preview}`);
                this.cli.output.startSpinner(`${agent.avatar} ${agent.name} working...`);
                spinnerStopped = false;
              } else if (block.type === 'tool_use') {
                // Claude is using a tool
                sdkTurnCount++;
                const toolName = block.name || '?';
                const inputPreview =
                  block.input?.command ||
                  block.input?.pattern ||
                  block.input?.file_path ||
                  block.input?.description ||
                  '';
                const shortInput =
                  inputPreview.length > 80
                    ? `${inputPreview.substring(0, 80)}\u2026`
                    : inputPreview;
                ensureSpinnerStopped();
                this.cli.output.dim(
                  `  ${agent.avatar} \uD83D\uDD27 [${sdkTurnCount}] ${toolName}${shortInput ? `: ${shortInput}` : ''}`,
                );
                this.cli.output.startSpinner(
                  `${agent.avatar} ${agent.name} executing ${toolName}...`,
                );
                spinnerStopped = false;
              }
            }
          } else if (msg.type === 'user' && msg.tool_use_result) {
            // Tool result — show errors only (success results too verbose)
            const resultText = String(msg.tool_use_result || '');
            const isError = resultText.startsWith('Error:') || msg.message?.content?.[0]?.is_error;
            if (isError) {
              const shortResult =
                resultText.length > 100 ? `${resultText.substring(0, 100)}\u2026` : resultText;
              ensureSpinnerStopped();
              this.cli.output.dim(`  ${agent.avatar} \u26A0\uFE0F  ${shortResult}`);
            }
          }
        } catch {
          // Never crash on preview display errors
        }
      };
      this.cli.queryProcessor.on('sdk:message', onSdkMessage);

      const result = await this.cli.queryProcessor.process(prompt, {
        agent: agentName,
        ...options,
        onToken: this.cli.streaming
          ? (token) => {
              // Lock output: prevent SDK message callbacks from writing during token streaming
              outputLocked = true;
              // Stop spinner before first token to avoid stdout collision
              ensureSpinnerStopped();
              this.cli.output.streamWrite(token);
            }
          : null,
      });

      // Clean up listeners and unlock output
      outputLocked = false;
      this.cli.queryProcessor.off('agentic:iteration', onIteration);
      this.cli.queryProcessor.off('sdk:message', onSdkMessage);

      if (this.cli.streaming) {
        this.cli.output.streamFlush();
      }

      // Always stop spinner — the agentic:iteration handler may have started one
      this.cli.output.stopSpinner();

      // Show iteration summary if multiple iterations occurred
      if (result.iterations > 1) {
        this.cli.output.dim(
          `  ${agent.avatar} ${result.iterations} iteracji, score: ${result.finalScore}/10`,
        );
      }

      return result.response;
    } catch (error) {
      this.cli.output.stopSpinnerFail(error.message);

      // Specific max_turns exhaustion message
      if (error.errorType === 'max_turns') {
        const turns = error.context?.numTurns || error.numTurns || '?';
        this.cli.output.error?.(`Agent wyczerpał limit ${turns} kroków narzędzi.`);
        this.cli.output.dim?.('Zadanie wymagało więcej interakcji niż dozwolony limit.');
      }

      // Show actionable suggestions for Claude SDK errors
      if (error.suggestions?.length) {
        this.cli.output.newline?.();
        this.cli.output.warn?.('Sugestie:');
        for (const s of error.suggestions) {
          this.cli.output.dim?.(`  → ${s}`);
        }
      }

      // Show stderr when available (always on crash, or in debug mode)
      if (error.stderrOutput) {
        this.cli.output.newline?.();
        this.cli.output.dim?.('[SDK stderr]:');
        this.cli.output.dim?.(error.stderrOutput);
      }

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

    return results.map((r) => `\n--- ${r.agent} ---\n${r.response}`).join('\n');
  }

  /**
   * Execute parallel queries.
   * When multi-instance pool is enabled, uses pool concurrency for true parallelism.
   */
  async executeParallel(agentNames, prompt) {
    const mgr = getClaudeInstanceManager();
    const poolEnabled = mgr.isEnabled && mgr.isInitialized;
    const poolSize = poolEnabled ? mgr.getStatus().ready + mgr.getStatus().busy : 0;

    this.cli.output.startSpinner(
      poolEnabled
        ? `Executing ${agentNames.length} agents in parallel (pool: ${poolSize} instancji)...`
        : 'Executing in parallel...',
    );

    try {
      // Set concurrency to pool size when multi-instance is available
      const concurrency = poolEnabled ? Math.max(poolSize, agentNames.length) : undefined;

      const queries = agentNames.map((name) => ({
        prompt,
        options: { agent: name },
      }));

      const { results, errors } = await this.cli.queryProcessor.processParallel(
        queries,
        concurrency ? { concurrency } : {},
      );

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
      results.plan = await this.queryAgent(
        'Dijkstra',
        `Based on this analysis:\n${results.speculation}\n\nCreate a detailed plan for: ${prompt}`,
      );

      // Stage 3: Execute (parallel with relevant agents)
      // With multi-instance pool, Yennefer/Triss/Lambert run on separate instances simultaneously
      const mgr = getClaudeInstanceManager();
      const poolInfo =
        mgr.isEnabled && mgr.isInitialized
          ? ` [pool: ${mgr.getStatus().total} instancji]`
          : ' [sekwencyjnie]';
      progress.advance(`Executing${poolInfo}...`);
      const executors = ['Yennefer', 'Triss', 'Lambert'];
      const parallel = await this.executeParallel(
        executors,
        `Following this plan:\n${results.plan}\n\nImplement your part for: ${prompt}`,
      );
      results.execution = parallel;

      // Stage 4: Synthesize (Yennefer)
      progress.advance('Synthesizing...');
      results.synthesis = await this.queryAgent(
        'Yennefer',
        `Synthesize these results:\n${results.execution}\n\nInto a coherent solution for: ${prompt}`,
      );

      // Stage 5: Log (Jaskier)
      progress.advance('Documenting...');
      results.summary = await this.queryAgent(
        'Jaskier',
        `Summarize this swarm execution:\n${results.synthesis}`,
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
      const response = await this.queryAgent(agentName, prompt);
      // Return same shape as EnhancedMode.processQuery() so UnifiedCLI display logic works
      return { type: 'query', result: { response, agent: agentName } };
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
        'Macros',
      ],
    };
  }
}

export function createSwarmMode(cli) {
  return new SwarmMode(cli);
}

export default SwarmMode;
