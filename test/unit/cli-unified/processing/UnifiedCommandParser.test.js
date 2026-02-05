/**
 * UnifiedCommandParser Tests
 * @module test/unit/cli-unified/processing/UnifiedCommandParser.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  COMMAND_PREFIX: '/'
}));

vi.mock('../../../../src/cli-unified/core/EventBus.js', () => ({
  eventBus: {
    emit: vi.fn()
  },
  EVENT_TYPES: {
    COMMAND_EXECUTE: 'command:execute',
    COMMAND_COMPLETE: 'command:complete',
    COMMAND_ERROR: 'command:error'
  }
}));

import {
  UnifiedCommandParser,
  createCommandParser
} from '../../../../src/cli-unified/processing/UnifiedCommandParser.js';
import { eventBus } from '../../../../src/cli-unified/core/EventBus.js';

describe('UnifiedCommandParser Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with default options', () => {
      const parser = new UnifiedCommandParser();
      expect(parser.prefix).toBe('/');
      expect(parser.commands).toBeInstanceOf(Map);
      expect(parser.aliases).toBeInstanceOf(Map);
      expect(parser.categories).toBeInstanceOf(Map);
    });

    it('should extend EventEmitter', () => {
      const parser = new UnifiedCommandParser();
      expect(parser).toBeInstanceOf(EventEmitter);
    });

    it('should accept custom prefix', () => {
      const parser = new UnifiedCommandParser({ prefix: '!' });
      expect(parser.prefix).toBe('!');
    });

    it('should register built-in commands by default', () => {
      const parser = new UnifiedCommandParser();
      expect(parser.has('help')).toBe(true);
      expect(parser.has('clear')).toBe(true);
      expect(parser.has('exit')).toBe(true);
    });

    it('should skip builtins when registerBuiltins is false', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      expect(parser.has('help')).toBe(false);
      expect(parser.has('clear')).toBe(false);
      expect(parser.has('exit')).toBe(false);
    });
  });

  // ===========================================================================
  // Register Tests
  // ===========================================================================

  describe('register()', () => {
    it('should register a command', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test command',
        handler: vi.fn()
      });

      expect(parser.has('test')).toBe(true);
    });

    it('should throw if missing name or handler', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });

      expect(() => parser.register({ description: 'No name' }))
        .toThrow('Command must have name and handler');

      expect(() => parser.register({ name: 'nohandler', description: 'No handler' }))
        .toThrow('Command must have name and handler');
    });

    it('should register aliases', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        aliases: ['t', 'tst'],
        description: 'Test command',
        handler: vi.fn()
      });

      expect(parser.has('t')).toBe(true);
      expect(parser.has('tst')).toBe(true);
    });

    it('should track category', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        category: 'testing',
        description: 'Test command',
        handler: vi.fn()
      });

      expect(parser.categories.get('testing')).toContain('test');
    });

    it('should use general category by default', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test command',
        handler: vi.fn()
      });

      expect(parser.categories.get('general')).toContain('test');
    });

    it('should emit registered event', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      const spy = vi.fn();
      parser.on('registered', spy);

      parser.register({
        name: 'test',
        description: 'Test',
        handler: vi.fn()
      });

      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should return this for chaining', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      const result = parser.register({
        name: 'test',
        description: 'Test',
        handler: vi.fn()
      });

      expect(result).toBe(parser);
    });
  });

  // ===========================================================================
  // Unregister Tests
  // ===========================================================================

  describe('unregister()', () => {
    it('should unregister a command', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler: vi.fn()
      });

      const result = parser.unregister('test');

      expect(result).toBe(true);
      expect(parser.has('test')).toBe(false);
    });

    it('should return false for unknown command', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      const result = parser.unregister('unknown');

      expect(result).toBe(false);
    });

    it('should remove aliases', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        aliases: ['t'],
        description: 'Test',
        handler: vi.fn()
      });

      parser.unregister('test');

      expect(parser.has('t')).toBe(false);
    });

    it('should remove from category', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        category: 'testing',
        description: 'Test',
        handler: vi.fn()
      });

      parser.unregister('test');

      expect(parser.categories.get('testing')).not.toContain('test');
    });

    it('should emit unregistered event', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler: vi.fn()
      });

      const spy = vi.fn();
      parser.on('unregistered', spy);

      parser.unregister('test');

      expect(spy).toHaveBeenCalledWith('test');
    });
  });

  // ===========================================================================
  // isCommand Tests
  // ===========================================================================

  describe('isCommand()', () => {
    it('should detect commands with prefix', () => {
      const parser = new UnifiedCommandParser();
      expect(parser.isCommand('/help')).toBe(true);
      expect(parser.isCommand('/test arg')).toBe(true);
    });

    it('should reject non-commands', () => {
      const parser = new UnifiedCommandParser();
      expect(parser.isCommand('help')).toBe(false);
      expect(parser.isCommand('hello world')).toBe(false);
    });

    it('should handle whitespace', () => {
      const parser = new UnifiedCommandParser();
      expect(parser.isCommand('  /help')).toBe(true);
    });
  });

  // ===========================================================================
  // Parse Tests
  // ===========================================================================

  describe('parse()', () => {
    it('should return null for non-commands', () => {
      const parser = new UnifiedCommandParser();
      expect(parser.parse('hello')).toBeNull();
    });

    it('should return null for empty command', () => {
      const parser = new UnifiedCommandParser();
      expect(parser.parse('/')).toBeNull();
    });

    it('should parse simple command', () => {
      const parser = new UnifiedCommandParser();
      const result = parser.parse('/help');

      expect(result.name).toBe('help');
      expect(result.command).toBeDefined();
      expect(result.args).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should parse command with arguments', () => {
      const parser = new UnifiedCommandParser();
      const result = parser.parse('/help test');

      expect(result.name).toBe('help');
      expect(result.args).toEqual(['test']);
    });

    it('should resolve aliases', () => {
      const parser = new UnifiedCommandParser();
      const result = parser.parse('/h');

      expect(result.name).toBe('help');
    });

    it('should return error for unknown command', () => {
      const parser = new UnifiedCommandParser();
      const result = parser.parse('/unknown');

      expect(result.error).toContain('Unknown command');
      expect(result.command).toBeNull();
    });
  });

  // ===========================================================================
  // Tokenize Tests
  // ===========================================================================

  describe('tokenize()', () => {
    it('should split by spaces', () => {
      const parser = new UnifiedCommandParser();
      const tokens = parser.tokenize('test arg1 arg2');

      expect(tokens).toEqual(['test', 'arg1', 'arg2']);
    });

    it('should handle quoted strings', () => {
      const parser = new UnifiedCommandParser();
      const tokens = parser.tokenize('test "hello world" arg');

      expect(tokens).toEqual(['test', 'hello world', 'arg']);
    });

    it('should handle single quotes', () => {
      const parser = new UnifiedCommandParser();
      const tokens = parser.tokenize("test 'hello world' arg");

      expect(tokens).toEqual(['test', 'hello world', 'arg']);
    });

    it('should handle empty input', () => {
      const parser = new UnifiedCommandParser();
      const tokens = parser.tokenize('');

      expect(tokens).toEqual([]);
    });

    it('should handle multiple spaces', () => {
      const parser = new UnifiedCommandParser();
      const tokens = parser.tokenize('test   arg1   arg2');

      expect(tokens).toEqual(['test', 'arg1', 'arg2']);
    });
  });

  // ===========================================================================
  // parseArgs Tests
  // ===========================================================================

  describe('parseArgs()', () => {
    it('should separate args from flags', () => {
      const parser = new UnifiedCommandParser();
      // Note: --flag without '=' consumes next non-flag value as its value
      // So 'arg2' becomes the value of --flag
      const command = { flags: [] };
      const { args, flags } = parser.parseArgs(['arg1', '--flag', 'arg2'], command);

      expect(args).toEqual(['arg1']);
      expect(flags.flag).toBe('arg2');
    });

    it('should keep args when flag is boolean type', () => {
      const parser = new UnifiedCommandParser();
      const command = { flags: [{ name: 'flag', long: 'flag', type: 'boolean' }] };
      const { args, flags } = parser.parseArgs(['arg1', '--flag', 'arg2'], command);

      expect(args).toEqual(['arg1', 'arg2']);
      expect(flags.flag).toBe(true);
    });

    it('should parse long flags with values', () => {
      const parser = new UnifiedCommandParser();
      const command = { flags: [] };
      const { flags } = parser.parseArgs(['--name=value'], command);

      expect(flags.name).toBe('value');
    });

    it('should parse long flags with separate values', () => {
      const parser = new UnifiedCommandParser();
      const command = { flags: [{ name: 'name', type: 'string' }] };
      const { flags } = parser.parseArgs(['--name', 'value'], command);

      expect(flags.name).toBe('value');
    });

    it('should parse boolean flags', () => {
      const parser = new UnifiedCommandParser();
      const command = { flags: [{ name: 'verbose', type: 'boolean' }] };
      const { flags } = parser.parseArgs(['--verbose'], command);

      expect(flags.verbose).toBe(true);
    });

    it('should parse short flags', () => {
      const parser = new UnifiedCommandParser();
      const command = { flags: [{ name: 'verbose', short: 'v', type: 'boolean' }] };
      const { flags } = parser.parseArgs(['-v'], command);

      expect(flags.verbose).toBe(true);
    });

    it('should parse short flags with values', () => {
      const parser = new UnifiedCommandParser();
      const command = { flags: [{ name: 'file', short: 'f', type: 'string' }] };
      const { flags } = parser.parseArgs(['-f', 'test.txt'], command);

      expect(flags.file).toBe('test.txt');
    });
  });

  // ===========================================================================
  // Execute Tests
  // ===========================================================================

  describe('execute()', () => {
    it('should throw on parse error', async () => {
      const parser = new UnifiedCommandParser();
      const parsed = { error: 'Unknown command' };

      await expect(parser.execute(parsed)).rejects.toThrow('Unknown command');
      expect(eventBus.emit).toHaveBeenCalled();
    });

    it('should execute command handler', async () => {
      const handler = vi.fn(() => 'result');
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler
      });

      const parsed = parser.parse('/test arg');
      const result = await parser.execute(parsed);

      expect(handler).toHaveBeenCalledWith(['arg'], expect.any(Object));
      expect(result).toBe('result');
    });

    it('should run before hooks', async () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler: () => 'result'
      });

      const beforeHook = vi.fn();
      parser.addHook('before', beforeHook);

      const parsed = parser.parse('/test');
      await parser.execute(parsed);

      expect(beforeHook).toHaveBeenCalled();
    });

    it('should cancel on before hook returning false', async () => {
      const handler = vi.fn(() => 'result');
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler
      });

      parser.addHook('before', () => false);

      const parsed = parser.parse('/test');
      const result = await parser.execute(parsed);

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should run after hooks', async () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler: () => 'result'
      });

      const afterHook = vi.fn();
      parser.addHook('after', afterHook);

      const parsed = parser.parse('/test');
      await parser.execute(parsed);

      expect(afterHook).toHaveBeenCalledWith(parsed, 'result', expect.any(Object));
    });

    it('should run error hooks on failure', async () => {
      const error = new Error('Handler failed');
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler: () => { throw error; }
      });

      const errorHook = vi.fn();
      parser.addHook('error', errorHook);

      const parsed = parser.parse('/test');

      await expect(parser.execute(parsed)).rejects.toThrow('Handler failed');
      expect(errorHook).toHaveBeenCalledWith(parsed, error, expect.any(Object));
    });

    it('should emit events', async () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler: () => 'result'
      });

      const parsed = parser.parse('/test');
      await parser.execute(parsed);

      expect(eventBus.emit).toHaveBeenCalledWith('command:execute', expect.any(Object));
      expect(eventBus.emit).toHaveBeenCalledWith('command:complete', expect.any(Object));
    });
  });

  // ===========================================================================
  // Run Tests
  // ===========================================================================

  describe('run()', () => {
    it('should parse and execute', async () => {
      const handler = vi.fn(() => 'result');
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        handler
      });

      const result = await parser.run('/test');

      expect(handler).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should return null for non-commands', async () => {
      const parser = new UnifiedCommandParser();
      const result = await parser.run('hello');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // addHook Tests
  // ===========================================================================

  describe('addHook()', () => {
    it('should add hook to correct type', () => {
      const parser = new UnifiedCommandParser();
      const hook = vi.fn();

      parser.addHook('before', hook);

      expect(parser.hooks.before).toContain(hook);
    });

    it('should throw for unknown hook type', () => {
      const parser = new UnifiedCommandParser();

      expect(() => parser.addHook('unknown', vi.fn()))
        .toThrow('Unknown hook type');
    });

    it('should return this for chaining', () => {
      const parser = new UnifiedCommandParser();
      const result = parser.addHook('before', vi.fn());

      expect(result).toBe(parser);
    });
  });

  // ===========================================================================
  // getCompletions Tests
  // ===========================================================================

  describe('getCompletions()', () => {
    it('should return empty for non-command', () => {
      const parser = new UnifiedCommandParser();
      const completions = parser.getCompletions('hello');

      expect(completions).toEqual([]);
    });

    it('should complete command names', () => {
      const parser = new UnifiedCommandParser();
      const completions = parser.getCompletions('/hel');

      expect(completions).toContain('/help');
    });

    it('should complete aliases', () => {
      const parser = new UnifiedCommandParser();
      const completions = parser.getCompletions('/h');

      expect(completions).toContain('/help');
      expect(completions).toContain('/h');
    });

    it('should not include hidden commands', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'hidden',
        hidden: true,
        description: 'Hidden',
        handler: vi.fn()
      });
      parser.register({
        name: 'help',
        description: 'Help',
        handler: vi.fn()
      });

      const completions = parser.getCompletions('/h');

      expect(completions).toContain('/help');
      expect(completions).not.toContain('/hidden');
    });

    it('should complete long flags', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        flags: [{ name: 'verbose', long: 'verbose' }],
        handler: vi.fn()
      });

      const completions = parser.getCompletions('/test --ver');

      expect(completions).toContain('--verbose');
    });

    it('should complete short flags', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        flags: [{ name: 'verbose', short: 'v' }],
        handler: vi.fn()
      });

      const completions = parser.getCompletions('/test -');

      expect(completions).toContain('-v');
    });
  });

  // ===========================================================================
  // getCommandHelp Tests
  // ===========================================================================

  describe('getCommandHelp()', () => {
    it('should return help for command', () => {
      const parser = new UnifiedCommandParser();
      const help = parser.getCommandHelp('help');

      expect(help).toContain('help');
      expect(help).toContain('Show help');
    });

    it('should resolve aliases', () => {
      const parser = new UnifiedCommandParser();
      const help = parser.getCommandHelp('h');

      expect(help).toContain('help');
    });

    it('should return error for unknown command', () => {
      const parser = new UnifiedCommandParser();
      const help = parser.getCommandHelp('unknown');

      expect(help).toContain('Unknown command');
    });

    it('should include aliases', () => {
      const parser = new UnifiedCommandParser();
      const help = parser.getCommandHelp('help');

      expect(help).toContain('aliases');
      expect(help).toContain('h');
    });

    it('should include usage', () => {
      const parser = new UnifiedCommandParser();
      const help = parser.getCommandHelp('help');

      expect(help).toContain('Usage');
    });

    it('should include arguments', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        args: [{ name: 'input', required: true, description: 'Input file' }],
        handler: vi.fn()
      });

      const help = parser.getCommandHelp('test');

      expect(help).toContain('Arguments');
      expect(help).toContain('input');
    });

    it('should include flags', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'test',
        description: 'Test',
        flags: [{ name: 'verbose', short: 'v', long: 'verbose', description: 'Verbose output' }],
        handler: vi.fn()
      });

      const help = parser.getCommandHelp('test');

      expect(help).toContain('Flags');
      expect(help).toContain('-v');
      expect(help).toContain('--verbose');
    });
  });

  // ===========================================================================
  // getFullHelp Tests
  // ===========================================================================

  describe('getFullHelp()', () => {
    it('should list all commands', () => {
      const parser = new UnifiedCommandParser();
      const help = parser.getFullHelp();

      expect(help).toContain('Available Commands');
      expect(help).toContain('help');
      expect(help).toContain('clear');
      expect(help).toContain('exit');
    });

    it('should group by category', () => {
      const parser = new UnifiedCommandParser();
      const help = parser.getFullHelp();

      expect(help).toContain('GENERAL');
    });

    it('should not include hidden commands', () => {
      const parser = new UnifiedCommandParser({ registerBuiltins: false });
      parser.register({
        name: 'visible',
        description: 'Visible',
        handler: vi.fn()
      });
      parser.register({
        name: 'hidden',
        hidden: true,
        description: 'Hidden',
        handler: vi.fn()
      });

      const help = parser.getFullHelp();

      expect(help).toContain('visible');
      expect(help).not.toContain('hidden');
    });
  });

  // ===========================================================================
  // Utility Methods Tests
  // ===========================================================================

  describe('getCommandNames()', () => {
    it('should return all command names', () => {
      const parser = new UnifiedCommandParser();
      const names = parser.getCommandNames();

      expect(names).toContain('help');
      expect(names).toContain('clear');
      expect(names).toContain('exit');
    });
  });

  describe('has()', () => {
    it('should check command existence', () => {
      const parser = new UnifiedCommandParser();

      expect(parser.has('help')).toBe(true);
      expect(parser.has('unknown')).toBe(false);
    });

    it('should check aliases', () => {
      const parser = new UnifiedCommandParser();

      expect(parser.has('h')).toBe(true);
      expect(parser.has('?')).toBe(true);
    });
  });

  describe('get()', () => {
    it('should return command', () => {
      const parser = new UnifiedCommandParser();
      const cmd = parser.get('help');

      expect(cmd.name).toBe('help');
    });

    it('should resolve aliases', () => {
      const parser = new UnifiedCommandParser();
      const cmd = parser.get('h');

      expect(cmd.name).toBe('help');
    });

    it('should return undefined for unknown', () => {
      const parser = new UnifiedCommandParser();
      const cmd = parser.get('unknown');

      expect(cmd).toBeUndefined();
    });
  });

  // ===========================================================================
  // Built-in Commands Tests
  // ===========================================================================

  describe('built-in commands', () => {
    describe('help command', () => {
      it('should show full help when no argument', async () => {
        const parser = new UnifiedCommandParser();
        const result = await parser.run('/help');

        expect(result).toContain('Available Commands');
      });

      it('should show command help when argument provided', async () => {
        const parser = new UnifiedCommandParser();
        const result = await parser.run('/help clear');

        expect(result).toContain('clear');
        expect(result).toContain('Clear screen');
      });
    });

    describe('exit command', () => {
      it('should set exit flag in context', async () => {
        const parser = new UnifiedCommandParser();
        let internalCtx = null;

        // Use after hook to capture the internal context
        parser.addHook('after', (parsed, result, ctx) => {
          internalCtx = ctx;
        });

        await parser.run('/exit', {});

        expect(internalCtx.exit).toBe(true);
      });

      it('should return goodbye message', async () => {
        const parser = new UnifiedCommandParser();
        const result = await parser.run('/exit', {});

        expect(result).toBe('Goodbye!');
      });
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createCommandParser()', () => {
    it('should create UnifiedCommandParser instance', () => {
      const parser = createCommandParser();
      expect(parser).toBeInstanceOf(UnifiedCommandParser);
    });

    it('should pass options', () => {
      const parser = createCommandParser({ prefix: '!' });
      expect(parser.prefix).toBe('!');
    });
  });
});
