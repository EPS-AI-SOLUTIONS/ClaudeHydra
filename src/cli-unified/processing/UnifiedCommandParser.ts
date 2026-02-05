/**
 * Unified Command Parser
 * Merges src/cli/CommandParser.js with enhanced features
 * @module cli-unified/processing/UnifiedCommandParser
 */

import { EventEmitter } from 'events';
import { COMMAND_PREFIX } from '../core/constants.js';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';

/**
 * Command definition
 * @typedef {Object} Command
 * @property {string} name - Command name
 * @property {string[]} [aliases] - Command aliases
 * @property {string} description - Description
 * @property {string} [usage] - Usage example
 * @property {string} [category] - Command category
 * @property {boolean} [hidden] - Hide from help
 * @property {Object[]} [args] - Argument definitions
 * @property {Object[]} [flags] - Flag definitions
 * @property {Function} handler - Command handler
 */

/**
 * Unified Command Parser
 */
export class UnifiedCommandParser extends EventEmitter {
  constructor(options = {}) {
    super();

    this.prefix = options.prefix || COMMAND_PREFIX;
    this.commands = new Map();
    this.aliases = new Map();
    this.categories = new Map();
    this.hooks = {
      before: [],
      after: [],
      error: []
    };

    // Register built-in commands
    if (options.registerBuiltins !== false) {
      this._registerBuiltins();
    }
  }

  /**
   * Register built-in commands
   */
  _registerBuiltins() {
    this.register({
      name: 'help',
      aliases: ['h', '?'],
      description: 'Show help',
      usage: '/help [command]',
      category: 'general',
      handler: async (args, ctx) => {
        if (args[0]) {
          return this.getCommandHelp(args[0]);
        }
        return this.getFullHelp();
      }
    });

    this.register({
      name: 'clear',
      aliases: ['cls'],
      description: 'Clear screen',
      category: 'general',
      handler: async () => {
        process.stdout.write('\x1b[2J\x1b[H');
        return null;
      }
    });

    this.register({
      name: 'exit',
      aliases: ['quit', 'q'],
      description: 'Exit CLI',
      category: 'general',
      handler: async (args, ctx) => {
        ctx.exit = true;
        return 'Goodbye!';
      }
    });
  }

  /**
   * Register a command
   */
  register(command) {
    if (!command.name || !command.handler) {
      throw new Error('Command must have name and handler');
    }

    this.commands.set(command.name, command);

    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }

    // Track category
    const category = command.category || 'general';
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(command.name);

    this.emit('registered', command.name);
    return this;
  }

  /**
   * Unregister a command
   */
  unregister(name) {
    const command = this.commands.get(name);
    if (!command) return false;

    this.commands.delete(name);

    // Remove aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.delete(alias);
      }
    }

    // Remove from category
    const category = command.category || 'general';
    const catCommands = this.categories.get(category);
    if (catCommands) {
      const idx = catCommands.indexOf(name);
      if (idx !== -1) catCommands.splice(idx, 1);
    }

    this.emit('unregistered', name);
    return true;
  }

  /**
   * Check if input is a command
   */
  isCommand(input) {
    return input.trim().startsWith(this.prefix);
  }

  /**
   * Parse command input
   */
  parse(input) {
    if (!this.isCommand(input)) {
      return null;
    }

    const trimmed = input.trim().slice(this.prefix.length);
    const parts = this.tokenize(trimmed);

    if (parts.length === 0) {
      return null;
    }

    const name = parts[0].toLowerCase();
    const rawArgs = parts.slice(1);

    // Resolve alias
    const resolvedName = this.aliases.get(name) || name;
    const command = this.commands.get(resolvedName);

    if (!command) {
      return {
        name: resolvedName,
        command: null,
        args: rawArgs,
        flags: {},
        error: `Unknown command: ${name}`
      };
    }

    // Parse arguments and flags
    const { args, flags } = this.parseArgs(rawArgs, command);

    return {
      name: resolvedName,
      command,
      args,
      flags,
      error: null
    };
  }

  /**
   * Tokenize input string
   */
  tokenize(input) {
    const tokens = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (const char of input) {
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Parse arguments and flags
   */
  parseArgs(rawArgs, command) {
    const args = [];
    const flags = {};

    const flagDefs = command.flags || [];

    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];

      // Long flag (--flag or --flag=value)
      if (arg.startsWith('--')) {
        const [flagName, value] = arg.slice(2).split('=');
        const flagDef = flagDefs.find(f => f.name === flagName || f.long === flagName);

        if (value !== undefined) {
          flags[flagName] = value;
        } else if (flagDef?.type === 'boolean') {
          flags[flagName] = true;
        } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
          flags[flagName] = rawArgs[++i];
        } else {
          flags[flagName] = true;
        }
      }
      // Short flag (-f or -f value)
      else if (arg.startsWith('-') && arg.length > 1) {
        const flagChar = arg.slice(1);
        const flagDef = flagDefs.find(f => f.short === flagChar);

        if (flagDef?.type === 'boolean') {
          flags[flagDef.name || flagChar] = true;
        } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
          flags[flagDef?.name || flagChar] = rawArgs[++i];
        } else {
          flags[flagDef?.name || flagChar] = true;
        }
      }
      // Regular argument
      else {
        args.push(arg);
      }
    }

    return { args, flags };
  }

  /**
   * Execute a parsed command
   */
  async execute(parsed, context = {}) {
    if (parsed.error) {
      eventBus.emit(EVENT_TYPES.COMMAND_ERROR, { error: parsed.error });
      throw new Error(parsed.error);
    }

    const { command, args, flags } = parsed;
    const ctx = { ...context, flags };

    // Run before hooks
    for (const hook of this.hooks.before) {
      const result = await hook(parsed, ctx);
      if (result === false) {
        return null; // Hook cancelled execution
      }
    }

    eventBus.emit(EVENT_TYPES.COMMAND_EXECUTE, { name: parsed.name, args, flags });

    try {
      const result = await command.handler(args, ctx);

      // Run after hooks
      for (const hook of this.hooks.after) {
        await hook(parsed, result, ctx);
      }

      eventBus.emit(EVENT_TYPES.COMMAND_COMPLETE, { name: parsed.name, result });
      return result;
    } catch (error) {
      // Run error hooks
      for (const hook of this.hooks.error) {
        await hook(parsed, error, ctx);
      }

      eventBus.emit(EVENT_TYPES.COMMAND_ERROR, { name: parsed.name, error: error.message });
      throw error;
    }
  }

  /**
   * Parse and execute command
   */
  async run(input, context = {}) {
    const parsed = this.parse(input);
    if (!parsed) {
      return null;
    }
    return this.execute(parsed, context);
  }

  /**
   * Add hook
   */
  addHook(type, handler) {
    if (!this.hooks[type]) {
      throw new Error(`Unknown hook type: ${type}`);
    }
    this.hooks[type].push(handler);
    return this;
  }

  /**
   * Get completions for partial input
   */
  getCompletions(partial) {
    const trimmed = partial.trim();
    if (!trimmed.startsWith(this.prefix)) {
      return [];
    }

    const withoutPrefix = trimmed.slice(this.prefix.length).toLowerCase();
    const parts = withoutPrefix.split(/\s+/);

    // Complete command name
    if (parts.length <= 1) {
      const prefix = parts[0] || '';
      const matches = [];

      for (const [name, cmd] of this.commands) {
        if (!cmd.hidden && name.startsWith(prefix)) {
          matches.push(this.prefix + name);
        }
      }

      for (const [alias, cmdName] of this.aliases) {
        const cmd = this.commands.get(cmdName);
        if (!cmd?.hidden && alias.startsWith(prefix)) {
          matches.push(this.prefix + alias);
        }
      }

      return matches;
    }

    // Complete command arguments/flags
    const cmdName = this.aliases.get(parts[0]) || parts[0];
    const command = this.commands.get(cmdName);

    if (!command) return [];

    // Suggest flags
    const flags = command.flags || [];
    const lastPart = parts[parts.length - 1];

    if (lastPart.startsWith('--')) {
      return flags
        .filter(f => f.long && `--${f.long}`.startsWith(lastPart))
        .map(f => `--${f.long}`);
    }

    if (lastPart.startsWith('-')) {
      return flags
        .filter(f => f.short && `-${f.short}`.startsWith(lastPart))
        .map(f => `-${f.short}`);
    }

    return [];
  }

  /**
   * Get help for specific command
   */
  getCommandHelp(name) {
    const resolvedName = this.aliases.get(name) || name;
    const command = this.commands.get(resolvedName);

    if (!command) {
      return `Unknown command: ${name}`;
    }

    let help = `\n${command.name}`;
    if (command.aliases?.length) {
      help += ` (aliases: ${command.aliases.join(', ')})`;
    }
    help += `\n  ${command.description}`;

    if (command.usage) {
      help += `\n\n  Usage: ${command.usage}`;
    }

    if (command.args?.length) {
      help += '\n\n  Arguments:';
      for (const arg of command.args) {
        help += `\n    ${arg.name}${arg.required ? '' : '?'} - ${arg.description}`;
      }
    }

    if (command.flags?.length) {
      help += '\n\n  Flags:';
      for (const flag of command.flags) {
        const short = flag.short ? `-${flag.short}, ` : '    ';
        const long = flag.long ? `--${flag.long}` : '';
        help += `\n    ${short}${long} - ${flag.description}`;
      }
    }

    return help;
  }

  /**
   * Get full help
   */
  getFullHelp() {
    let help = '\nAvailable Commands:\n';

    for (const [category, cmdNames] of this.categories) {
      const visibleCmds = cmdNames.filter(n => !this.commands.get(n)?.hidden);
      if (visibleCmds.length === 0) continue;

      help += `\n  ${category.toUpperCase()}:\n`;

      for (const name of visibleCmds) {
        const cmd = this.commands.get(name);
        help += `    ${this.prefix}${name.padEnd(15)} ${cmd.description}\n`;
      }
    }

    help += `\nUse ${this.prefix}help <command> for more info.`;
    return help;
  }

  /**
   * Get all command names
   */
  getCommandNames() {
    return Array.from(this.commands.keys());
  }

  /**
   * Check if command exists
   */
  has(name) {
    return this.commands.has(name) || this.aliases.has(name);
  }

  /**
   * Get command
   */
  get(name) {
    const resolvedName = this.aliases.get(name) || name;
    return this.commands.get(resolvedName);
  }
}

export function createCommandParser(options) {
  return new UnifiedCommandParser(options);
}

export default UnifiedCommandParser;
