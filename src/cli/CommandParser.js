/**
 * CLI Command Parser
 * Command registration, parsing, and execution
 * @module cli/CommandParser
 */

import { COMMAND_PREFIX } from './constants.js';

/**
 * @typedef {Object} CommandArg
 * @property {string} name - Argument name
 * @property {boolean} [required=false] - Is argument required
 * @property {string} [type='string'] - Argument type
 * @property {*} [default] - Default value
 * @property {string} [description] - Argument description
 */

/**
 * @typedef {Object} Command
 * @property {string} name - Command name
 * @property {string[]} [aliases] - Command aliases
 * @property {string} description - Command description
 * @property {CommandArg[]} [args] - Command arguments
 * @property {Object.<string, CommandArg>} [flags] - Command flags
 * @property {Function} handler - Command handler function
 * @property {string} [category] - Command category
 * @property {boolean} [hidden=false] - Hide from help
 */

/**
 * @typedef {Object} ParsedCommand
 * @property {string} name - Command name
 * @property {string[]} args - Positional arguments
 * @property {Object.<string, *>} flags - Parsed flags
 * @property {string} raw - Raw input string
 */

/**
 * Command parser and executor
 */
export class CommandParser {
  /** @type {Map<string, Command>} */
  #commands = new Map();

  /** @type {Map<string, string>} */
  #aliases = new Map();

  /** @type {string} */
  #prefix;

  /**
   * Create a new CommandParser
   * @param {string} [prefix='/'] - Command prefix
   */
  constructor(prefix = COMMAND_PREFIX) {
    this.#prefix = prefix;
  }

  /**
   * Register a command
   * @param {Command} command - Command definition
   * @returns {CommandParser} This parser for chaining
   */
  register(command) {
    if (!command.name) {
      throw new Error('Command must have a name');
    }
    if (!command.handler || typeof command.handler !== 'function') {
      throw new Error('Command must have a handler function');
    }

    // Normalize command
    const normalized = {
      ...command,
      name: command.name.toLowerCase(),
      aliases: (command.aliases || []).map(a => a.toLowerCase()),
      args: command.args || [],
      flags: command.flags || {},
      category: command.category || 'General',
      hidden: command.hidden || false
    };

    // Store command
    this.#commands.set(normalized.name, normalized);

    // Register aliases
    for (const alias of normalized.aliases) {
      this.#aliases.set(alias, normalized.name);
    }

    return this;
  }

  /**
   * Unregister a command
   * @param {string} name - Command name
   * @returns {boolean} True if removed
   */
  unregister(name) {
    const cmd = this.#commands.get(name.toLowerCase());
    if (!cmd) return false;

    // Remove aliases
    for (const alias of cmd.aliases) {
      this.#aliases.delete(alias);
    }

    return this.#commands.delete(name.toLowerCase());
  }

  /**
   * Check if input is a command
   * @param {string} input - User input
   * @returns {boolean} True if input is a command
   */
  isCommand(input) {
    return input.trim().startsWith(this.#prefix);
  }

  /**
   * Parse command input
   * @param {string} input - Command input (with or without prefix)
   * @returns {ParsedCommand|null} Parsed command or null
   */
  parse(input) {
    const trimmed = input.trim();

    // Remove prefix if present
    const withoutPrefix = trimmed.startsWith(this.#prefix)
      ? trimmed.slice(this.#prefix.length)
      : trimmed;

    if (!withoutPrefix) return null;

    // Split into parts
    const parts = this.#tokenize(withoutPrefix);
    if (parts.length === 0) return null;

    const name = parts[0].toLowerCase();
    const rest = parts.slice(1);

    // Separate args and flags
    const args = [];
    const flags = {};

    for (let i = 0; i < rest.length; i++) {
      const part = rest[i];

      if (part.startsWith('--')) {
        // Long flag: --flag or --flag=value
        const [flagName, ...valueParts] = part.slice(2).split('=');
        if (valueParts.length > 0) {
          flags[flagName] = valueParts.join('=');
        } else if (rest[i + 1] && !rest[i + 1].startsWith('-')) {
          flags[flagName] = rest[++i];
        } else {
          flags[flagName] = true;
        }
      } else if (part.startsWith('-') && part.length === 2) {
        // Short flag: -f or -f value
        const flagName = part.slice(1);
        if (rest[i + 1] && !rest[i + 1].startsWith('-')) {
          flags[flagName] = rest[++i];
        } else {
          flags[flagName] = true;
        }
      } else {
        // Positional argument
        args.push(part);
      }
    }

    return {
      name,
      args,
      flags,
      raw: input
    };
  }

  /**
   * Execute a command
   * @param {string} input - Command input
   * @param {Object} [context] - Execution context
   * @returns {Promise<*>} Command result
   */
  async execute(input, context = {}) {
    const parsed = this.parse(input);
    if (!parsed) {
      throw new Error('Invalid command');
    }

    // Resolve alias
    const cmdName = this.#aliases.get(parsed.name) || parsed.name;
    const command = this.#commands.get(cmdName);

    if (!command) {
      throw new Error(`Unknown command: ${parsed.name}`);
    }

    // Validate required arguments
    const requiredArgs = command.args.filter(a => a.required);
    if (parsed.args.length < requiredArgs.length) {
      const missing = requiredArgs[parsed.args.length].name;
      throw new Error(`Missing required argument: ${missing}`);
    }

    // Build argument object with defaults
    const argValues = {};
    for (let i = 0; i < command.args.length; i++) {
      const argDef = command.args[i];
      const value = parsed.args[i];
      argValues[argDef.name] = value !== undefined
        ? this.#coerceValue(value, argDef.type)
        : argDef.default;
    }

    // Build flag object with defaults
    const flagValues = {};
    for (const [flagName, flagDef] of Object.entries(command.flags)) {
      const value = parsed.flags[flagName] ?? parsed.flags[flagName[0]];
      flagValues[flagName] = value !== undefined
        ? this.#coerceValue(value, flagDef.type)
        : flagDef.default;
    }

    // Execute handler
    return command.handler({
      args: argValues,
      flags: flagValues,
      raw: parsed.raw,
      context
    });
  }

  /**
   * Get completions for partial input
   * @param {string} partial - Partial command input
   * @returns {string[]} Matching completions
   */
  getCompletions(partial) {
    const trimmed = partial.trim();
    const withoutPrefix = trimmed.startsWith(this.#prefix)
      ? trimmed.slice(this.#prefix.length)
      : trimmed;

    const lowerPartial = withoutPrefix.toLowerCase();

    // Get all command names and aliases
    const allNames = [
      ...this.#commands.keys(),
      ...this.#aliases.keys()
    ].filter(name => !this.#commands.get(this.#aliases.get(name) || name)?.hidden);

    // Filter by prefix match
    return allNames
      .filter(name => name.startsWith(lowerPartial))
      .map(name => this.#prefix + name);
  }

  /**
   * Get help text for a command or all commands
   * @param {string} [commandName] - Specific command name
   * @returns {string} Help text
   */
  getHelp(commandName) {
    if (commandName) {
      const name = commandName.toLowerCase().replace(this.#prefix, '');
      const cmdName = this.#aliases.get(name) || name;
      const cmd = this.#commands.get(cmdName);

      if (!cmd) {
        return `Unknown command: ${commandName}`;
      }

      return this.#formatCommandHelp(cmd);
    }

    // Group commands by category
    const categories = new Map();
    for (const cmd of this.#commands.values()) {
      if (cmd.hidden) continue;

      const category = cmd.category || 'General';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category).push(cmd);
    }

    // Format all commands
    const lines = ['Available Commands:', ''];

    for (const [category, commands] of categories) {
      lines.push(`  ${category}:`);
      for (const cmd of commands) {
        const aliases = cmd.aliases.length > 0
          ? ` (${cmd.aliases.map(a => this.#prefix + a).join(', ')})`
          : '';
        lines.push(`    ${this.#prefix}${cmd.name}${aliases} - ${cmd.description}`);
      }
      lines.push('');
    }

    lines.push(`Use ${this.#prefix}help <command> for detailed help`);

    return lines.join('\n');
  }

  /**
   * Get all registered commands
   * @param {boolean} [includeHidden=false] - Include hidden commands
   * @returns {Command[]} All commands
   */
  getAll(includeHidden = false) {
    return [...this.#commands.values()]
      .filter(cmd => includeHidden || !cmd.hidden);
  }

  /**
   * Get command by name or alias
   * @param {string} name - Command name or alias
   * @returns {Command|undefined} Command or undefined
   */
  get(name) {
    const normalized = name.toLowerCase().replace(this.#prefix, '');
    const cmdName = this.#aliases.get(normalized) || normalized;
    return this.#commands.get(cmdName);
  }

  /**
   * Check if command exists
   * @param {string} name - Command name or alias
   * @returns {boolean} True if exists
   */
  has(name) {
    const normalized = name.toLowerCase().replace(this.#prefix, '');
    return this.#commands.has(normalized) || this.#aliases.has(normalized);
  }

  /**
   * Tokenize input respecting quotes
   * @param {string} input - Input string
   * @returns {string[]} Tokens
   * @private
   */
  #tokenize(input) {
    const tokens = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false;
          if (current) {
            tokens.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inQuote = true;
        quoteChar = char;
      } else if (char === ' ' || char === '\t') {
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
   * Coerce value to specified type
   * @param {*} value - Value to coerce
   * @param {string} [type='string'] - Target type
   * @returns {*} Coerced value
   * @private
   */
  #coerceValue(value, type = 'string') {
    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === true || value === 'true' || value === '1';
      case 'string':
      default:
        return String(value);
    }
  }

  /**
   * Format detailed help for a command
   * @param {Command} cmd - Command object
   * @returns {string} Formatted help
   * @private
   */
  #formatCommandHelp(cmd) {
    const lines = [
      `Command: ${this.#prefix}${cmd.name}`,
      `Description: ${cmd.description}`,
      ''
    ];

    if (cmd.aliases.length > 0) {
      lines.push(`Aliases: ${cmd.aliases.map(a => this.#prefix + a).join(', ')}`);
      lines.push('');
    }

    if (cmd.args.length > 0) {
      lines.push('Arguments:');
      for (const arg of cmd.args) {
        const required = arg.required ? '(required)' : '(optional)';
        const def = arg.default !== undefined ? ` [default: ${arg.default}]` : '';
        lines.push(`  ${arg.name} ${required}${def}`);
        if (arg.description) {
          lines.push(`    ${arg.description}`);
        }
      }
      lines.push('');
    }

    if (Object.keys(cmd.flags).length > 0) {
      lines.push('Flags:');
      for (const [name, flag] of Object.entries(cmd.flags)) {
        const def = flag.default !== undefined ? ` [default: ${flag.default}]` : '';
        lines.push(`  --${name}${def}`);
        if (flag.description) {
          lines.push(`    ${flag.description}`);
        }
      }
      lines.push('');
    }

    // Usage example
    const argUsage = cmd.args.map(a =>
      a.required ? `<${a.name}>` : `[${a.name}]`
    ).join(' ');
    lines.push(`Usage: ${this.#prefix}${cmd.name} ${argUsage}`);

    return lines.join('\n');
  }
}

/**
 * Create a new command parser
 * @param {string} [prefix] - Command prefix
 * @returns {CommandParser} New parser instance
 */
export function createCommandParser(prefix) {
  return new CommandParser(prefix);
}

export default CommandParser;
