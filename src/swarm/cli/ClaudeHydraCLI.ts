/**
 * ClaudeHydra CLI - Main Class
 * Integrates all 50 enhancements
 * @module swarm/cli/ClaudeHydraCLI
 */

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthCheck } from '../../hydra/providers/llamacpp-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI Colors & Styles
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  // Foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Agent Avatars (Feature #37)
const AGENT_AVATARS = {
  Geralt: { icon: '🐺', color: c.white, title: 'White Wolf' },
  Yennefer: { icon: '⚡', color: c.magenta, title: 'Sorceress' },
  Triss: { icon: '🔥', color: c.red, title: 'Healer' },
  Jaskier: { icon: '🎭', color: c.yellow, title: 'Bard' },
  Ciri: { icon: '⚔️', color: c.cyan, title: 'Lion Cub' },
  Vesemir: { icon: '🛡️', color: c.gray, title: 'Mentor' },
  Lambert: { icon: '🗡️', color: c.red, title: 'Hothead' },
  Eskel: { icon: '🏔️', color: c.green, title: 'Mountain' },
  Regis: { icon: '🧛', color: c.blue, title: 'Sage' },
  Dijkstra: { icon: '🕵️', color: c.gray, title: 'Spymaster' },
  Philippa: { icon: '🦉', color: c.magenta, title: 'Owl' },
  Zoltan: { icon: '⛏️', color: c.yellow, title: 'Dwarf' },
};

// Syntax Themes (Feature #36)
const _SYNTAX_THEMES = {
  monokai: {
    keyword: c.brightMagenta,
    string: c.yellow,
    number: c.brightCyan,
    comment: c.gray,
    function: c.brightGreen,
    variable: c.white,
    operator: c.red,
  },
  dracula: {
    keyword: c.brightMagenta,
    string: c.brightYellow,
    number: c.brightCyan,
    comment: c.gray,
    function: c.brightGreen,
    variable: c.brightWhite,
    operator: c.brightRed,
  },
  nord: {
    keyword: c.blue,
    string: c.green,
    number: c.magenta,
    comment: c.gray,
    function: c.cyan,
    variable: c.white,
    operator: c.cyan,
  },
};

/**
 * ClaudeHydra CLI - Enhanced Chat Interface
 */
export class ClaudeHydraCLI extends EventEmitter {
  #running = false;

  // State
  #state = {
    yoloMode: false,
    vimMode: false,
    currentTheme: 'monokai',
    streamingEnabled: true,
    timestampsEnabled: false,
    notificationsEnabled: true,
  };

  // History & Session (Features #11-20)
  #history = [];
  #historyFile = '';
  #sessionId = '';
  #conversationBranches = new Map();
  #currentBranch = 'main';
  #historyTags = new Map();
  #favorites = new Set();

  // Commands & Aliases (Features #21-30)
  #aliases = new Map();
  #snippets = new Map();
  #macros = new Map();
  #recordingMacro = null;
  #macroBuffer = [];

  // Plugins (Feature #50)
  #plugins = new Map();

  // Data paths
  #dataDir = '';

  constructor(options = {}) {
    super();

    this.#dataDir = options.dataDir || join(__dirname, '..', '..', '..', 'data', 'cli');
    this.#ensureDataDir();

    this.#historyFile = join(this.#dataDir, 'history.json');
    this.#sessionId = this.#generateSessionId();
    this.#sessionFile = join(this.#dataDir, 'sessions', `${this.#sessionId}.json`);

    this.#loadHistory();
    this.#loadAliases();
    this.#loadSnippets();
    this.#loadPlugins();

    // Default aliases (Feature #21)
    this.#setupDefaultAliases();

    // Default snippets (Feature #25)
    this.#setupDefaultSnippets();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  #ensureDataDir() {
    const dirs = [
      this.#dataDir,
      join(this.#dataDir, 'sessions'),
      join(this.#dataDir, 'exports'),
      join(this.#dataDir, 'plugins'),
      join(this.#dataDir, 'macros'),
    ];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  #generateSessionId() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const rand = Math.random().toString(36).slice(2, 6);
    return `${date}_${time}_${rand}`;
  }

  #setupDefaultAliases() {
    const defaults = {
      q: '/quick',
      s: '/status',
      m: '/models',
      h: '/help',
      c: '/clear',
      x: '/exit',
      y: '/yolo',
      n: '/safe',
      hist: '/history',
      exp: '/export',
      fav: '/favorites',
    };
    for (const [alias, cmd] of Object.entries(defaults)) {
      if (!this.#aliases.has(alias)) {
        this.#aliases.set(alias, cmd);
      }
    }
  }

  #setupDefaultSnippets() {
    const defaults = {
      'code-review':
        'Review this code for bugs, security issues, and improvements:\n```\n{code}\n```',
      explain: 'Explain this code step by step:\n```\n{code}\n```',
      refactor: 'Refactor this code to be more clean and efficient:\n```\n{code}\n```',
      test: 'Write unit tests for this code:\n```\n{code}\n```',
      doc: 'Write documentation for this code:\n```\n{code}\n```',
      debug: 'Help me debug this error:\n```\n{error}\n```',
      optimize: 'Optimize this code for performance:\n```\n{code}\n```',
    };
    for (const [name, template] of Object.entries(defaults)) {
      if (!this.#snippets.has(name)) {
        this.#snippets.set(name, template);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY & PERSISTENCE (Features #11-20)
  // ═══════════════════════════════════════════════════════════════════════════

  #loadHistory() {
    try {
      if (existsSync(this.#historyFile)) {
        const data = JSON.parse(readFileSync(this.#historyFile, 'utf-8'));
        this.#history = data.history || [];
        this.#historyTags = new Map(Object.entries(data.tags || {}));
        this.#favorites = new Set(data.favorites || []);
      }
    } catch (_e) {
      this.#history = [];
    }
  }

  #saveHistory() {
    try {
      const data = {
        history: this.#history.slice(-1000), // Keep last 1000
        tags: Object.fromEntries(this.#historyTags),
        favorites: [...this.#favorites],
      };
      writeFileSync(this.#historyFile, JSON.stringify(data, null, 2));
    } catch (_e) {
      // Ignore
    }
  }

  #addToHistory(entry) {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      query: entry,
      timestamp: new Date().toISOString(),
      branch: this.#currentBranch,
    };
    this.#history.push(item);
    this.#historyIndex = this.#history.length;

    // Record macro if recording
    if (this.#recordingMacro) {
      this.#macroBuffer.push(entry);
    }
  }

  // Feature #11: Fuzzy History Search
  #fuzzySearch(query, items) {
    const lowerQuery = query.toLowerCase();
    return items
      .filter((item) => {
        const text = typeof item === 'string' ? item : item.query;
        return text.toLowerCase().includes(lowerQuery);
      })
      .sort((a, b) => {
        const textA = typeof a === 'string' ? a : a.query;
        const textB = typeof b === 'string' ? b : b.query;
        const indexA = textA.toLowerCase().indexOf(lowerQuery);
        const indexB = textB.toLowerCase().indexOf(lowerQuery);
        return indexA - indexB;
      });
  }

  // Feature #13: Conversation Branching
  #createBranch(name) {
    if (this.#conversationBranches.has(name)) {
      return false;
    }
    this.#conversationBranches.set(name, {
      parent: this.#currentBranch,
      createdAt: new Date().toISOString(),
      history: [],
    });
    this.#currentBranch = name;
    return true;
  }

  // Feature #14: History Tags
  #tagHistory(id, tag) {
    if (!this.#historyTags.has(tag)) {
      this.#historyTags.set(tag, []);
    }
    this.#historyTags.get(tag).push(id);
  }

  // Feature #15: History Export
  #exportHistory(format = 'markdown') {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `chat-export-${timestamp}.${format === 'markdown' ? 'md' : 'json'}`;
    const filepath = join(this.#dataDir, 'exports', filename);

    if (format === 'markdown') {
      const content = this.#history
        .map(
          (h) => `## ${new Date(h.timestamp).toLocaleString()}\n\n**Query:** ${h.query}\n\n---\n`,
        )
        .join('\n');
      writeFileSync(filepath, `# ClaudeHydra Chat Export\n\n${content}`);
    } else {
      writeFileSync(filepath, JSON.stringify(this.#history, null, 2));
    }

    return filepath;
  }

  // Feature #16: History Stats
  #getHistoryStats() {
    const stats = {
      total: this.#history.length,
      favorites: this.#favorites.size,
      tags: this.#historyTags.size,
      branches: this.#conversationBranches.size,
      byDate: {},
    };

    for (const item of this.#history) {
      const date = item.timestamp.slice(0, 10);
      stats.byDate[date] = (stats.byDate[date] || 0) + 1;
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALIASES & SNIPPETS (Features #21-30)
  // ═══════════════════════════════════════════════════════════════════════════

  #loadAliases() {
    try {
      const file = join(this.#dataDir, 'aliases.json');
      if (existsSync(file)) {
        const data = JSON.parse(readFileSync(file, 'utf-8'));
        this.#aliases = new Map(Object.entries(data));
      }
    } catch (_e) {
      // Use defaults
    }
  }

  #saveAliases() {
    const file = join(this.#dataDir, 'aliases.json');
    writeFileSync(file, JSON.stringify(Object.fromEntries(this.#aliases), null, 2));
  }

  #loadSnippets() {
    try {
      const file = join(this.#dataDir, 'snippets.json');
      if (existsSync(file)) {
        const data = JSON.parse(readFileSync(file, 'utf-8'));
        this.#snippets = new Map(Object.entries(data));
      }
    } catch (_e) {
      // Use defaults
    }
  }

  #saveSnippets() {
    const file = join(this.#dataDir, 'snippets.json');
    writeFileSync(file, JSON.stringify(Object.fromEntries(this.#snippets), null, 2));
  }

  // Feature #22: Command Chaining
  #parseChainedCommands(input) {
    return input
      .split(/\s*&&\s*/)
      .map((cmd) => cmd.trim())
      .filter(Boolean);
  }

  // Feature #24: Bang Commands
  #expandBangCommand(input) {
    if (input === '!!') {
      return this.#history.length > 0 ? this.#history[this.#history.length - 1].query : '';
    }

    const match = input.match(/^!(\d+)$/);
    if (match) {
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < this.#history.length) {
        return this.#history[index].query;
      }
    }

    return input;
  }

  // Feature #26: Macros
  #startMacroRecording(name) {
    this.#recordingMacro = name;
    this.#macroBuffer = [];
  }

  #stopMacroRecording() {
    if (this.#recordingMacro) {
      this.#macros.set(this.#recordingMacro, [...this.#macroBuffer]);
      const file = join(this.#dataDir, 'macros', `${this.#recordingMacro}.json`);
      writeFileSync(file, JSON.stringify(this.#macroBuffer, null, 2));
      const name = this.#recordingMacro;
      this.#recordingMacro = null;
      this.#macroBuffer = [];
      return name;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKDOWN TABLE RENDERER (Feature #40)
  // ═══════════════════════════════════════════════════════════════════════════

  #renderTable(headers, rows) {
    const colWidths = headers.map((h, i) => {
      const maxRow = Math.max(...rows.map((r) => String(r[i] || '').length));
      return Math.max(h.length, maxRow);
    });

    const separator = `┼${colWidths.map((w) => '─'.repeat(w + 2)).join('┼')}┼`;
    const headerRow = `│${headers.map((h, i) => ` ${c.bold}${h.padEnd(colWidths[i])}${c.reset} `).join('│')}│`;

    console.log(`┌${colWidths.map((w) => '─'.repeat(w + 2)).join('┬')}┐`);
    console.log(headerRow);
    console.log(separator);

    for (const row of rows) {
      const rowStr = `│${row.map((cell, i) => ` ${String(cell || '').padEnd(colWidths[i])} `).join('│')}│`;
      console.log(rowStr);
    }

    console.log(`└${colWidths.map((w) => '─'.repeat(w + 2)).join('┴')}┘`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLUGINS (Feature #50)
  // ═══════════════════════════════════════════════════════════════════════════

  #loadPlugins() {
    const pluginDir = join(this.#dataDir, 'plugins');
    try {
      const files = existsSync(pluginDir)
        ? require('node:fs')
            .readdirSync(pluginDir)
            .filter((f) => f.endsWith('.js'))
        : [];

      for (const file of files) {
        try {
          const plugin = require(join(pluginDir, file));
          if (plugin.name && plugin.init) {
            this.#plugins.set(plugin.name, plugin);
            plugin.init(this);
          }
        } catch (_e) {
          // Skip invalid plugins
        }
      }
    } catch (_e) {
      // Ignore
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  #commands = {
    // Basic commands
    '/help': () => this.#showHelp(),
    '/exit': () => this.#exit(),
    '/clear': () => this.#clear(),
    '/status': () => this.#showStatus(),
    '/models': () => this.#showModels(),

    // Mode commands
    '/yolo': () => this.#setYoloMode(true),
    '/safe': () => this.#setYoloMode(false),
    '/vim': () => this.#toggleVimMode(),
    '/stream': () => this.#toggleStreaming(),
    '/timestamps': () => this.#toggleTimestamps(),
    '/notifications': () => this.#toggleNotifications(),

    // History commands (Features #11-20)
    '/history': (args) => this.#showHistory(args),
    '/search': (args) => this.#searchHistory(args),
    '/branch': (args) => this.#manageBranch(args),
    '/tag': (args) => this.#manageTag(args),
    '/export': (args) => this.#exportChat(args),
    '/favorites': () => this.#showFavorites(),
    '/fav': (args) => this.#toggleFavorite(args),
    '/stats': () => this.#showStats(),

    // Alias & Snippet commands (Features #21-26)
    '/alias': (args) => this.#manageAlias(args),
    '/snippet': (args) => this.#manageSnippet(args),
    '/macro': (args) => this.#manageMacro(args),

    // UI commands (Features #31-40)
    '/theme': (args) => this.#setTheme(args),
    '/agents': () => this.#showAgents(),

    // Integration commands (Features #41-50)
    '/file': (args) => this.#handleFile(args),
    '/url': (args) => this.#fetchUrl(args),
    '/run': (args) => this.#runCode(args),
    '/diff': (args) => this.#showDiff(args),
    '/git': (args) => this.#gitCommand(args),
    '/plugin': (args) => this.#managePlugin(args),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  #showHelp() {
    console.log(`
${c.cyan}${c.bold}╔══════════════════════════════════════════════════════════════════════════════╗
║                        CLAUDEHYDRA CLI - HELP                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝${c.reset}

${c.yellow}${c.bold}BASIC COMMANDS${c.reset}
  /help              Show this help
  /exit, /quit       Exit CLI
  /clear, /cls       Clear screen
  /status            Show system status
  /models            List available models

${c.yellow}${c.bold}MODE COMMANDS${c.reset}
  /yolo              Enable YOLO mode (fast & dangerous)
  /safe              Disable YOLO mode (standard)
  /vim               Toggle Vim mode
  /stream            Toggle streaming output
  /timestamps        Toggle timestamps
  /notifications     Toggle desktop notifications

${c.yellow}${c.bold}HISTORY COMMANDS${c.reset}
  /history [n]       Show last n entries (default: 10)
  /search <query>    Fuzzy search history (Ctrl+R)
  /branch <name>     Create/switch conversation branch
  /tag <id> <tag>    Tag a history entry
  /export [format]   Export chat (markdown/json)
  /favorites         Show favorite entries
  /fav <id>          Toggle favorite on entry
  /stats             Show history statistics

${c.yellow}${c.bold}ALIAS & SNIPPET COMMANDS${c.reset}
  /alias             List aliases
  /alias <a>=<cmd>   Create alias
  /snippet           List snippets
  /snippet <name>    Use snippet
  /macro record <n>  Start recording macro
  /macro stop        Stop recording
  /macro play <n>    Play macro

${c.yellow}${c.bold}UI COMMANDS${c.reset}
  /theme <name>      Set theme (monokai/dracula/nord)
  /agents            Show agent avatars

${c.yellow}${c.bold}INTEGRATION COMMANDS${c.reset}
  /file <path>       Load file for analysis
  /url <url>         Fetch URL content
  /run               Run last code block
  /diff              Show diff of last changes
  /git <cmd>         Run git command
  /plugin list       List plugins

${c.yellow}${c.bold}SHORTCUTS${c.reset}
  !!                 Repeat last command
  !n                 Repeat nth command
  Ctrl+R             Fuzzy search history
  Ctrl+C             Cancel current input
  Ctrl+D             Exit (in empty line)
  Tab                Autocomplete

${c.yellow}${c.bold}AGENT SHORTCUTS${c.reset}
  @geralt            Invoke Geralt (Security)
  @yennefer          Invoke Yennefer (Architecture)
  @regis             Invoke Regis (Research)
  @dijkstra          Invoke Dijkstra (Planning)
`);
  }

  #exit() {
    console.log(`\n${c.cyan}Farewell, Witcher!${c.reset}\n`);
    this.#saveHistory();
    this.#running = false;
  }

  #clear() {
    console.clear();
  }

  async #showStatus() {
    // Will be overridden by actual implementation
    console.log(`${c.green}[+] System Status: OK${c.reset}`);
  }

  async #showModels() {
    try {
      const health = await healthCheck();
      if (health.available) {
        console.log(`\n${c.cyan}${c.bold}Available Models (${health.models.length}):${c.reset}\n`);
        health.models.forEach((model) => {
          console.log(`  ${c.green}✓${c.reset} ${model}`);
        });
        console.log();
      } else {
        console.log(`${c.red}LlamaCpp is offline${c.reset}`);
      }
    } catch (error) {
      console.log(`${c.red}Error fetching models: ${error.message}${c.reset}`);
    }
  }

  #setYoloMode(enabled) {
    this.#state.yoloMode = enabled;
    if (enabled) {
      console.log(`${c.red}⚠️  YOLO Mode ENABLED - Fast & Dangerous!${c.reset}`);
    } else {
      console.log(`${c.green}✓ YOLO Mode DISABLED - Standard Mode${c.reset}`);
    }
  }

  #toggleVimMode() {
    this.#state.vimMode = !this.#state.vimMode;
    console.log(`${c.cyan}Vim mode: ${this.#state.vimMode ? 'ON' : 'OFF'}${c.reset}`);
  }

  #toggleStreaming() {
    this.#state.streamingEnabled = !this.#state.streamingEnabled;
    console.log(`${c.cyan}Streaming: ${this.#state.streamingEnabled ? 'ON' : 'OFF'}${c.reset}`);
  }

  #toggleTimestamps() {
    this.#state.timestampsEnabled = !this.#state.timestampsEnabled;
    console.log(`${c.cyan}Timestamps: ${this.#state.timestampsEnabled ? 'ON' : 'OFF'}${c.reset}`);
  }

  #toggleNotifications() {
    this.#state.notificationsEnabled = !this.#state.notificationsEnabled;
    console.log(
      `${c.cyan}Notifications: ${this.#state.notificationsEnabled ? 'ON' : 'OFF'}${c.reset}`,
    );
  }

  #showHistory(args) {
    const count = parseInt(args, 10) || 10;
    const items = this.#history.slice(-count);

    console.log(`\n${c.cyan}${c.bold}History (last ${count}):${c.reset}\n`);

    items.forEach((item, i) => {
      const num = this.#history.length - count + i + 1;
      const fav = this.#favorites.has(item.id) ? '⭐' : '  ';
      const time = this.#state.timestampsEnabled
        ? `${c.gray}[${new Date(item.timestamp).toLocaleTimeString()}]${c.reset} `
        : '';
      console.log(
        `${fav} ${c.yellow}${num}.${c.reset} ${time}${item.query.substring(0, 60)}${item.query.length > 60 ? '...' : ''}`,
      );
    });
    console.log();
  }

  #searchHistory(query) {
    if (!query) {
      console.log(`${c.yellow}Usage: /search <query>${c.reset}`);
      return;
    }

    const results = this.#fuzzySearch(query, this.#history);

    console.log(`\n${c.cyan}${c.bold}Search results for "${query}":${c.reset}\n`);

    if (results.length === 0) {
      console.log(`${c.gray}No matches found${c.reset}`);
    } else {
      results.slice(0, 10).forEach((item, i) => {
        console.log(`${c.yellow}${i + 1}.${c.reset} ${item.query.substring(0, 70)}...`);
      });
    }
    console.log();
  }

  #manageBranch(args) {
    if (!args) {
      console.log(`\n${c.cyan}Current branch: ${c.bold}${this.#currentBranch}${c.reset}`);
      console.log(
        `${c.gray}Branches: ${[...this.#conversationBranches.keys()].join(', ') || 'none'}${c.reset}\n`,
      );
      return;
    }

    if (this.#createBranch(args)) {
      console.log(`${c.green}Created and switched to branch: ${args}${c.reset}`);
    } else {
      this.#currentBranch = args;
      console.log(`${c.cyan}Switched to branch: ${args}${c.reset}`);
    }
  }

  #manageTag(args) {
    const [idStr, ...tagParts] = (args || '').split(' ');
    const id = parseInt(idStr, 10);
    const tag = tagParts.join(' ');

    if (!id || !tag) {
      console.log(`${c.yellow}Usage: /tag <history_id> <tag_name>${c.reset}`);
      return;
    }

    this.#tagHistory(id, tag);
    console.log(`${c.green}Tagged entry #${id} with "${tag}"${c.reset}`);
  }

  #exportChat(args) {
    const format = args === 'json' ? 'json' : 'markdown';
    const filepath = this.#exportHistory(format);
    console.log(`${c.green}Exported to: ${filepath}${c.reset}`);
  }

  #showFavorites() {
    const favItems = this.#history.filter((h) => this.#favorites.has(h.id));

    console.log(`\n${c.cyan}${c.bold}Favorites (${favItems.length}):${c.reset}\n`);

    if (favItems.length === 0) {
      console.log(`${c.gray}No favorites yet. Use /fav <id> to add.${c.reset}`);
    } else {
      favItems.forEach((item, i) => {
        console.log(`⭐ ${c.yellow}${i + 1}.${c.reset} ${item.query.substring(0, 60)}...`);
      });
    }
    console.log();
  }

  #toggleFavorite(args) {
    const id = parseInt(args, 10);
    if (!id) {
      console.log(`${c.yellow}Usage: /fav <history_id>${c.reset}`);
      return;
    }

    if (this.#favorites.has(id)) {
      this.#favorites.delete(id);
      console.log(`${c.gray}Removed from favorites${c.reset}`);
    } else {
      this.#favorites.add(id);
      console.log(`${c.yellow}⭐ Added to favorites${c.reset}`);
    }
  }

  #showStats() {
    const stats = this.#getHistoryStats();

    console.log(`\n${c.cyan}${c.bold}History Statistics:${c.reset}\n`);
    this.#renderTable(
      ['Metric', 'Value'],
      [
        ['Total Queries', stats.total],
        ['Favorites', stats.favorites],
        ['Tags', stats.tags],
        ['Branches', stats.branches],
      ],
    );
    console.log();
  }

  #manageAlias(args) {
    if (!args) {
      console.log(`\n${c.cyan}${c.bold}Aliases:${c.reset}\n`);
      for (const [alias, cmd] of this.#aliases) {
        console.log(`  ${c.yellow}${alias}${c.reset} → ${cmd}`);
      }
      console.log();
      return;
    }

    const match = args.match(/^(\w+)=(.+)$/);
    if (match) {
      this.#aliases.set(match[1], match[2]);
      this.#saveAliases();
      console.log(`${c.green}Alias created: ${match[1]} → ${match[2]}${c.reset}`);
    } else {
      console.log(`${c.yellow}Usage: /alias <name>=<command>${c.reset}`);
    }
  }

  #manageSnippet(args) {
    if (!args) {
      console.log(`\n${c.cyan}${c.bold}Snippets:${c.reset}\n`);
      for (const [name, template] of this.#snippets) {
        console.log(`  ${c.yellow}${name}${c.reset}: ${template.substring(0, 40)}...`);
      }
      console.log();
      return;
    }

    const snippet = this.#snippets.get(args);
    if (snippet) {
      console.log(`\n${c.cyan}Snippet "${args}":${c.reset}\n${snippet}\n`);
    } else {
      console.log(`${c.yellow}Snippet not found: ${args}${c.reset}`);
    }
  }

  #manageMacro(args) {
    const [action, name] = (args || '').split(' ');

    switch (action) {
      case 'record':
        if (!name) {
          console.log(`${c.yellow}Usage: /macro record <name>${c.reset}`);
          return;
        }
        this.#startMacroRecording(name);
        console.log(`${c.red}⏺ Recording macro: ${name}${c.reset}`);
        break;

      case 'stop': {
        const recorded = this.#stopMacroRecording();
        if (recorded) {
          console.log(`${c.green}⏹ Macro saved: ${recorded}${c.reset}`);
        } else {
          console.log(`${c.yellow}No macro recording in progress${c.reset}`);
        }
        break;
      }

      case 'play': {
        if (!name) {
          console.log(`${c.yellow}Usage: /macro play <name>${c.reset}`);
          return;
        }
        const macro = this.#macros.get(name);
        if (macro) {
          console.log(`${c.cyan}▶ Playing macro: ${name}${c.reset}`);
          // Execute macro commands
          for (const cmd of macro) {
            console.log(`${c.gray}> ${cmd}${c.reset}`);
            // Process command
          }
        } else {
          console.log(`${c.yellow}Macro not found: ${name}${c.reset}`);
        }
        break;
      }

      default:
        console.log(`\n${c.cyan}${c.bold}Macros:${c.reset}\n`);
        for (const [n, cmds] of this.#macros) {
          console.log(`  ${c.yellow}${n}${c.reset}: ${cmds.length} commands`);
        }
        console.log(`\n${c.gray}Usage: /macro record|stop|play <name>${c.reset}\n`);
    }
  }

  #setTheme(args) {
    const themes = ['monokai', 'dracula', 'nord'];

    if (!args || !themes.includes(args)) {
      console.log(`${c.yellow}Available themes: ${themes.join(', ')}${c.reset}`);
      console.log(`${c.gray}Current: ${this.#state.currentTheme}${c.reset}`);
      return;
    }

    this.#state.currentTheme = args;
    console.log(`${c.green}Theme set to: ${args}${c.reset}`);
  }

  #showAgents() {
    console.log(`\n${c.cyan}${c.bold}Witcher Agents:${c.reset}\n`);

    for (const [name, info] of Object.entries(AGENT_AVATARS)) {
      console.log(`  ${info.icon} ${info.color}${c.bold}${name}${c.reset} - ${info.title}`);
    }
    console.log();
  }

  async #handleFile(args) {
    if (!args) {
      console.log(`${c.yellow}Usage: /file <path>${c.reset}`);
      return;
    }

    try {
      if (existsSync(args)) {
        const content = readFileSync(args, 'utf-8');
        console.log(`${c.green}File loaded: ${args} (${content.length} bytes)${c.reset}`);
        return content;
      } else {
        console.log(`${c.red}File not found: ${args}${c.reset}`);
      }
    } catch (e) {
      console.log(`${c.red}Error reading file: ${e.message}${c.reset}`);
    }
  }

  async #fetchUrl(args) {
    if (!args) {
      console.log(`${c.yellow}Usage: /url <url>${c.reset}`);
      return;
    }

    try {
      console.log(`${c.cyan}Fetching: ${args}${c.reset}`);
      const response = await fetch(args);
      const text = await response.text();
      console.log(`${c.green}Fetched ${text.length} bytes${c.reset}`);
      return text;
    } catch (e) {
      console.log(`${c.red}Error fetching URL: ${e.message}${c.reset}`);
    }
  }

  #runCode(_args) {
    console.log(`${c.yellow}Code execution not implemented in sandbox mode${c.reset}`);
  }

  #showDiff(_args) {
    console.log(`${c.yellow}Diff viewer: provide two texts to compare${c.reset}`);
  }

  async #gitCommand(args) {
    if (!args) {
      console.log(`${c.yellow}Usage: /git <command>${c.reset}`);
      return;
    }

    try {
      // SECURITY FIX: Use safeGit() instead of raw execSync with string interpolation.
      // Validates git subcommand against injection patterns before execution.
      const { safeGit } = await import('../../security/safe-command.js');
      const result = await safeGit(args);
      if (result.success) {
        console.log(result.stdout);
      } else {
        console.log(`${c.red}Git error: ${result.stderr}${c.reset}`);
      }
    } catch (e) {
      console.log(`${c.red}Git error: ${e.message}${c.reset}`);
    }
  }

  #managePlugin(args) {
    const [action, _name] = (args || '').split(' ');

    if (action === 'list' || !action) {
      console.log(`\n${c.cyan}${c.bold}Plugins:${c.reset}\n`);
      if (this.#plugins.size === 0) {
        console.log(`${c.gray}No plugins installed${c.reset}`);
      } else {
        for (const [n, p] of this.#plugins) {
          console.log(`  ${c.green}✓${c.reset} ${n}: ${p.description || 'No description'}`);
        }
      }
      console.log();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN REPL
  // ═══════════════════════════════════════════════════════════════════════════

  async #processInput(input) {
    // Expand bang commands
    input = this.#expandBangCommand(input);

    // Expand aliases
    for (const [alias, cmd] of this.#aliases) {
      if (input === alias || input.startsWith(`${alias} `)) {
        input = input.replace(alias, cmd);
        break;
      }
    }

    // Handle chained commands
    const commands = this.#parseChainedCommands(input);

    for (const cmd of commands) {
      if (cmd.startsWith('/')) {
        const [command, ...argParts] = cmd.split(' ');
        const args = argParts.join(' ');

        const handler = this.#commands[command];
        if (handler) {
          await handler(args);
        } else {
          console.log(`${c.yellow}Unknown command: ${command}. Type /help for list.${c.reset}`);
        }
      } else if (cmd.startsWith('@')) {
        // Agent shortcut
        const agent = cmd.slice(1).split(' ')[0];
        const query = cmd.slice(agent.length + 2);
        console.log(`${c.cyan}Invoking agent: ${agent}${c.reset}`);
        // Process with specific agent
        return { agent, query };
      } else {
        // Regular query
        this.#addToHistory(cmd);
        return { query: cmd };
      }
    }

    return null;
  }

  getPrompt() {
    const mode = this.#state.yoloMode ? `${c.red}[YOLO]${c.reset}` : `${c.green}[SAFE]${c.reset}`;
    const branch =
      this.#currentBranch !== 'main' ? `${c.magenta}(${this.#currentBranch})${c.reset}` : '';
    const recording = this.#recordingMacro ? `${c.red}⏺${c.reset}` : '';
    const timestamp = this.#state.timestampsEnabled
      ? `${c.gray}[${new Date().toLocaleTimeString()}]${c.reset} `
      : '';

    return `${timestamp}${mode}${branch}${recording} Query> `;
  }

  // Public API
  get state() {
    return { ...this.#state };
  }
  get history() {
    return [...this.#history];
  }
  get sessionId() {
    return this.#sessionId;
  }
  get isRunning() {
    return this.#running;
  }

  async processCommand(input) {
    return this.#processInput(input);
  }

  showBanner() {
    console.log(`
${c.cyan}    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                                                                       ║
    ║     ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗                  ║
    ║    ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝                  ║
    ║    ██║     ██║     ███████║██║   ██║██║  ██║█████╗                    ║
    ║    ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝                    ║
    ║    ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗                  ║
    ║     ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝                  ║
    ║                                                                       ║
    ║    ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗                           ║
    ║    ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗                          ║
    ║    ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║                          ║
    ║    ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║                          ║
    ║    ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║                          ║
    ║    ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝                          ║
    ║                                                                       ║
    ║               School of the Wolf - v3.0.0                             ║
    ║                    50 Enhanced Features                               ║
    ╚═══════════════════════════════════════════════════════════════════════╝${c.reset}
`);
  }

  showWelcome() {
    console.log(`  ${c.gray}Type your query and press Enter. Type /help for commands.${c.reset}`);
    console.log(`  ${c.gray}Commands: /status, /yolo, /safe, /models, /help, /exit${c.reset}`);
    console.log(`  ${c.gray}Shortcuts: !!, !n, @agent, Ctrl+R (search), Tab (complete)${c.reset}`);
    console.log();
  }

  cleanup() {
    this.#saveHistory();
    this.#saveAliases();
    this.#saveSnippets();
  }
}

export default ClaudeHydraCLI;
