/**
 * Enhanced Mode - Extended CLI functionality
 * @module cli-unified/modes/EnhancedMode
 */

import { EventEmitter } from 'events';
import { BasicMode } from './BasicMode.js';

/**
 * Enhanced Mode - includes context, caching, templates
 */
export class EnhancedMode extends EventEmitter {
  constructor(cli) {
    super();
    this.cli = cli;
    this.name = 'enhanced';
    this.basicMode = new BasicMode(cli);
  }

  /**
   * Initialize enhanced mode
   */
  async init() {
    // Initialize basic mode first
    await this.basicMode.init();

    // Register enhanced commands
    this.registerCommands();
    this.emit('ready');
  }

  /**
   * Register enhanced commands
   */
  registerCommands() {
    const parser = this.cli.commandParser;

    // Context commands
    parser.register({
      name: 'file',
      aliases: ['f'],
      description: 'Add file to context',
      usage: '/file <path> [--watch]',
      category: 'context',
      flags: [
        { name: 'watch', short: 'w', type: 'boolean', description: 'Watch for changes' }
      ],
      handler: async (args, ctx) => {
        if (!args[0]) return 'Usage: /file <path>';
        const file = this.cli.context.addFile(args[0], { watch: ctx.flags.watch });
        return `Added: ${file.name} (${file.language}, ${Math.round(file.size / 1024)}KB)`;
      }
    });

    parser.register({
      name: 'url',
      aliases: ['u'],
      description: 'Add URL to context',
      usage: '/url <url>',
      category: 'context',
      handler: async (args) => {
        if (!args[0]) return 'Usage: /url <url>';
        const url = await this.cli.context.addUrl(args[0]);
        return `Added: ${args[0]} (${Math.round(url.size / 1024)}KB)`;
      }
    });

    parser.register({
      name: 'context',
      aliases: ['ctx'],
      description: 'Show or clear context',
      usage: '/context [clear]',
      category: 'context',
      handler: async (args) => {
        if (args[0] === 'clear') {
          this.cli.context.clear();
          return 'Context cleared';
        }
        const summary = this.cli.context.getSummary();
        if (summary.files.length === 0 && summary.urls.length === 0) {
          return 'Context is empty';
        }
        const lines = ['Files:'];
        for (const f of summary.files) {
          lines.push(`  ${f.name} (${f.language})`);
        }
        lines.push('URLs:');
        for (const u of summary.urls) {
          lines.push(`  ${u.url}`);
        }
        lines.push(`Total: ${Math.round(summary.totalSize / 1024)}KB / ${Math.round(summary.maxSize / 1024)}KB`);
        return lines.join('\n');
      }
    });

    // Cache commands
    parser.register({
      name: 'cache',
      description: 'Cache management',
      usage: '/cache [stats|clear|on|off]',
      category: 'performance',
      handler: async (args) => {
        switch (args[0]) {
          case 'stats':
            const stats = this.cli.cache.getStats();
            return [
              `Hits: ${stats.hits}`,
              `Misses: ${stats.misses}`,
              `Hit Rate: ${stats.hitRate}`,
              `Size: ${stats.size}/${stats.maxSize}`,
              `Tokens Saved: ${stats.totalTokensSaved}`
            ].join('\n');
          case 'clear':
            this.cli.cache.clear();
            return 'Cache cleared';
          case 'on':
            this.cli.cache.enable();
            return 'Cache enabled';
          case 'off':
            this.cli.cache.disable();
            return 'Cache disabled';
          default:
            return `Cache: ${this.cli.cache.isEnabled ? 'ON' : 'OFF'} (${this.cli.cache.size} entries)`;
        }
      }
    });

    // Template commands
    parser.register({
      name: 'template',
      aliases: ['tpl', 't'],
      description: 'Use a prompt template',
      usage: '/template <name> [var=value...]',
      category: 'templates',
      handler: async (args, ctx) => {
        if (!args[0]) {
          const templates = this.cli.input.templates.list();
          return 'Templates:\n' + templates
            .map(t => `  ${t.key}: ${t.name} (${t.variables.join(', ')})`)
            .join('\n');
        }

        const name = args[0];
        const vars = {};
        for (const arg of args.slice(1)) {
          const [key, value] = arg.split('=');
          if (key && value) vars[key] = value;
        }

        const result = this.cli.input.templates.apply(name, vars);
        if (!result) return `Template not found: ${name}`;

        if (result.unresolvedVars.length > 0) {
          return `Missing variables: ${result.unresolvedVars.join(', ')}`;
        }

        ctx.templatePrompt = result.prompt;
        ctx.templateAgent = result.agent;
        return null;
      }
    });

    // Vim mode toggle
    parser.register({
      name: 'vim',
      description: 'Toggle vim mode',
      category: 'input',
      handler: async () => {
        const enabled = this.cli.input.toggleVimMode();
        return `Vim mode: ${enabled ? 'ON' : 'OFF'}`;
      }
    });

    // Variable commands
    parser.register({
      name: 'var',
      description: 'Set or show variables',
      usage: '/var [name] [value]',
      category: 'templates',
      handler: async (args) => {
        if (!args[0]) {
          const vars = this.cli.input.templates.listVariables();
          const entries = Object.entries(vars);
          if (entries.length === 0) return 'No variables set';
          return entries.map(([k, v]) => `${k}=${v}`).join('\n');
        }
        if (!args[1]) {
          const value = this.cli.input.templates.getVariable(args[0]);
          return value !== undefined ? `${args[0]}=${value}` : 'Variable not set';
        }
        this.cli.input.templates.setVariable(args[0], args.slice(1).join(' '));
        return `Set: ${args[0]}`;
      }
    });

    // Bookmark commands
    parser.register({
      name: 'bookmark',
      aliases: ['bm'],
      description: 'Manage bookmarks',
      usage: '/bookmark [add|list|get] [name]',
      category: 'history',
      handler: async (args) => {
        switch (args[0]) {
          case 'add':
            if (!args[1]) return 'Usage: /bookmark add <name>';
            const recent = this.cli.history.getRecent(1)[0];
            if (!recent) return 'No history to bookmark';
            this.cli.history.addBookmark(recent.id, args[1]);
            return `Bookmarked as: ${args[1]}`;
          case 'get':
            const bm = this.cli.history.getBookmark(args[1]);
            return bm ? bm.text : 'Bookmark not found';
          case 'list':
          default:
            const bookmarks = this.cli.history.listBookmarks();
            if (bookmarks.length === 0) return 'No bookmarks';
            return bookmarks.map(b => `${b.name}: ${b.text.slice(0, 40)}...`).join('\n');
        }
      }
    });

    // Session commands
    parser.register({
      name: 'session',
      aliases: ['ses'],
      description: 'Manage conversation sessions',
      usage: '/session [new|save|load|list|export|delete] [name|id]',
      category: 'session',
      handler: async (args) => {
        const session = this.cli.session;
        if (!session) return 'Session manager not available';

        switch (args[0]) {
          case 'new':
            session.create(args.slice(1).join(' ') || null);
            return `New session: ${session.getCurrent().name}`;

          case 'save':
            if (session.save()) {
              return `Saved: ${session.getCurrent().name}`;
            }
            return 'No active session to save';

          case 'load':
            if (!args[1]) {
              const recent = session.loadRecent();
              if (recent) return `Loaded: ${recent.name} (${recent.messages.length} messages)`;
              return 'No sessions found';
            }
            try {
              const loaded = session.load(args[1]);
              return `Loaded: ${loaded.name} (${loaded.messages.length} messages)`;
            } catch (e) {
              return `Error: ${e.message}`;
            }

          case 'list':
            const sessions = session.list();
            if (sessions.length === 0) return 'No saved sessions';
            return sessions
              .slice(0, 10)
              .map(s => `${s.id.slice(0, 12)}... | ${s.name} | ${s.messageCount} msgs`)
              .join('\n');

          case 'export':
            const format = args[1] || 'md';
            try {
              const exported = session.export(format);
              return `Exported ${format.toUpperCase()}:\n${exported.slice(0, 500)}${exported.length > 500 ? '\n...' : ''}`;
            } catch (e) {
              return `Error: ${e.message}`;
            }

          case 'delete':
            if (!args[1]) return 'Usage: /session delete <id>';
            if (session.delete(args[1])) {
              return `Deleted session: ${args[1]}`;
            }
            return 'Session not found';

          case 'rename':
            if (!args[1]) return 'Usage: /session rename <new-name>';
            session.rename(args.slice(1).join(' '));
            return `Renamed to: ${session.getCurrent().name}`;

          default:
            const current = session.getCurrent();
            if (!current) return 'No active session. Use /session new';
            return [
              `Session: ${current.name}`,
              `ID: ${current.id}`,
              `Messages: ${current.messages.length}`,
              `Tokens: ${current.metadata.totalTokens}`,
              `Created: ${new Date(current.created).toLocaleString()}`
            ].join('\n');
        }
      }
    });

    // Shortcuts help
    parser.register({
      name: 'shortcuts',
      aliases: ['keys'],
      description: 'Show keyboard shortcuts',
      category: 'help',
      handler: async () => {
        return [
          'Keyboard Shortcuts:',
          '',
          '  Ctrl+U     Clear line',
          '  Ctrl+R     Reverse search history',
          '  Ctrl+L     Clear screen',
          '  Ctrl+E     Open external editor',
          '  Ctrl+P     Preview file at cursor',
          '  Tab        Autocomplete',
          '  Alt+Enter  Multiline mode',
          '  F1         Show this help',
          '',
          'Type /help for all commands'
        ].join('\n');
      }
    });

    // Tokens/context status
    parser.register({
      name: 'tokens',
      aliases: ['ctx-size'],
      description: 'Show token usage',
      category: 'context',
      handler: async () => {
        const session = this.cli.session?.getCurrent();
        const tokens = session?.metadata?.totalTokens || 0;
        const maxTokens = 128000;
        const percent = ((tokens / maxTokens) * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));

        return [
          'Token Usage:',
          `[${bar}] ${percent}%`,
          `${tokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`
        ].join('\n');
      }
    });
  }

  /**
   * Process input in enhanced mode
   */
  async processInput(input, ctx = {}) {
    // Check if command
    if (this.cli.commandParser.isCommand(input)) {
      const result = await this.cli.commandParser.run(input, { cli: this.cli, ...ctx });

      // Handle template prompt
      if (ctx.templatePrompt) {
        return this.processQuery(ctx.templatePrompt, { agent: ctx.templateAgent });
      }

      return { type: 'command', result };
    }

    return this.processQuery(input, ctx);
  }

  /**
   * Process query with enhanced features
   */
  async processQuery(input, options = {}) {
    this.cli.output.startSpinner('Processing...');

    // Filter out cli reference to avoid circular JSON serialization in cache
    const { cli, ...safeOptions } = options;

    try {
      const result = await this.cli.queryProcessor.process(input, {
        autoAgent: true,
        ...safeOptions,
        onToken: this.cli.streaming ? (token) => {
          this.cli.output.streamWrite(token);
        } : null
      });

      if (this.cli.streaming) {
        this.cli.output.streamFlush();
      }

      this.cli.output.stopSpinner();
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
      description: 'Extended CLI with context, caching, templates',
      features: ['Context Management', 'Caching', 'Templates', 'Vim Mode', 'Bookmarks']
    };
  }
}

export function createEnhancedMode(cli) {
  return new EnhancedMode(cli);
}

export default EnhancedMode;
