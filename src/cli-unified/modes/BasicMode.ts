/**
 * Basic Mode - Minimal CLI functionality
 * @module cli-unified/modes/BasicMode
 */

import { EventEmitter } from 'events';

/**
 * Basic Mode - minimal features
 */
export class BasicMode extends EventEmitter {
  constructor(cli) {
    super();
    this.cli = cli;
    this.name = 'basic';
  }

  /**
   * Initialize basic mode
   */
  async init() {
    // Register basic commands only
    this.registerCommands();
    this.emit('ready');
  }

  /**
   * Register basic commands
   */
  registerCommands() {
    const parser = this.cli.commandParser;

    parser.register({
      name: 'model',
      aliases: ['m'],
      description: 'Set or show current model',
      usage: '/model [model-name]',
      category: 'models',
      handler: async (args) => {
        if (args[0]) {
          this.cli.queryProcessor.defaultModel = args[0];
          return `Model set to: ${args[0]}`;
        }
        const models = await this.cli.queryProcessor.getModels();
        return `Current: ${this.cli.queryProcessor.defaultModel}\nAvailable: ${models.join(', ')}`;
      }
    });

    parser.register({
      name: 'multiline',
      aliases: ['ml'],
      description: 'Enter multiline input mode',
      category: 'input',
      handler: async (args, ctx) => {
        ctx.multiline = true;
        return null;
      }
    });

    parser.register({
      name: 'theme',
      aliases: ['t'],
      description: 'Set or show theme',
      usage: '/theme [theme-name]',
      category: 'ui',
      handler: async (args) => {
        if (args[0]) {
          this.cli.output.setTheme(args[0]);
          return `Theme set to: ${args[0]}`;
        }
        const themes = this.cli.themeRegistry.list();
        return `Current: ${this.cli.themeRegistry.getCurrent().name}\nAvailable: ${themes.join(', ')}`;
      }
    });

    parser.register({
      name: 'history',
      aliases: ['hist'],
      description: 'Show history',
      usage: '/history [count]',
      category: 'history',
      handler: async (args) => {
        const count = parseInt(args[0]) || 10;
        const entries = this.cli.history.getRecent(count);
        if (entries.length === 0) {
          return 'No history';
        }
        return entries
          .map((e, i) => `${i + 1}. ${e.text.slice(0, 50)}${e.text.length > 50 ? '...' : ''}`)
          .join('\n');
      }
    });

    parser.register({
      name: 'status',
      description: 'Show system status',
      category: 'general',
      handler: async () => {
        const health = await this.cli.queryProcessor.checkHealth();
        const lines = [
          `Mode: ${this.name}`,
          `LlamaCpp: ${health.healthy ? 'Connected' : 'Disconnected'}`,
          `Model: ${this.cli.queryProcessor.defaultModel}`,
          `History: ${this.cli.history.count} entries`
        ];
        if (health.models) {
          lines.push(`Models: ${health.models.length} available`);
        }
        return lines.join('\n');
      }
    });
  }

  /**
   * Process input in basic mode
   */
  async processInput(input) {
    // Check if command
    if (this.cli.commandParser.isCommand(input)) {
      const result = await this.cli.commandParser.run(input, { cli: this.cli });
      return { type: 'command', result };
    }

    // Process as query
    this.cli.output.startSpinner('Thinking...');

    try {
      let firstToken = true;
      const result = await this.cli.queryProcessor.process(input, {
        autoAgent: false,
        onToken: this.cli.streaming ? (token) => {
          if (firstToken) {
            this.cli.output.stopSpinner(); // Stop spinner before first token
            this.cli.output.newline();
            firstToken = false;
          }
          this.cli.output.streamWrite(token);
        } : null
      });

      if (this.cli.streaming) {
        this.cli.output.streamFlush();
        this.cli.output.newline();
        this.cli.output.success('Done');
      } else {
        this.cli.output.stopSpinnerSuccess('Done');
      }
      return { type: 'query', result };
    } catch (error) {
      this.cli.output.stopSpinnerFail(error.message);
      throw error;
    }
  }

  /**
   * Get mode info
   */
  getInfo() {
    return {
      name: this.name,
      description: 'Minimal CLI with basic features',
      features: ['Commands', 'History', 'Themes']
    };
  }
}

export function createBasicMode(cli) {
  return new BasicMode(cli);
}

export default BasicMode;
