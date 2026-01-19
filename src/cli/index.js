#!/usr/bin/env node
/**
 * HYDRA CLI - Modern Interactive Interface
 * Gemini + Ollama AI Orchestration
 * @module cli
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { Hydra } from '../hydra/index.js';
import { InputHandler } from './InputHandler.js';
import { OutputRenderer } from './OutputRenderer.js';
import { CommandParser } from './CommandParser.js';
import { HistoryManager } from './HistoryManager.js';
import { Autocomplete } from './Autocomplete.js';
import { Spinner } from './Spinner.js';
import { HydraTheme, getAutoTheme, getTheme } from './Theme.js';
import { COMMAND_PREFIX } from './constants.js';
import { loadConfig } from '../config.js';

/**
 * @typedef {Object} CLIOptions
 * @property {boolean} [verbose=true] - Enable verbose output
 * @property {Object} [theme] - Theme to use
 * @property {string} [historyFile] - History file path
 */

/**
 * HYDRA CLI Application
 * Main orchestrator for the command-line interface
 */
export class HydraCLI {
  /** @type {Hydra} */
  #hydra;

  /** @type {InputHandler} */
  #input;

  /** @type {OutputRenderer} */
  #output;

  /** @type {CommandParser} */
  #commands;

  /** @type {HistoryManager} */
  #history;

  /** @type {Autocomplete} */
  #autocomplete;

  /** @type {Spinner} */
  #spinner;

  /** @type {Object} */
  #theme;

  /** @type {Object} */
  #state = {
    forceProvider: null,
    quickMode: false,
    multilineMode: false,
    running: false
  };

  /**
   * Create a new HydraCLI instance
   * @param {CLIOptions} [options] - CLI options
   */
  constructor(options = {}) {
    this.#theme = options.theme || getAutoTheme();

    // Initialize Hydra
    this.#hydra = new Hydra({ verbose: options.verbose ?? true });

    // Initialize components
    this.#output = new OutputRenderer(this.#theme);
    this.#spinner = new Spinner({ theme: this.#theme });
    this.#history = new HistoryManager({ file: options.historyFile });
    this.#commands = new CommandParser(COMMAND_PREFIX);
    this.#autocomplete = new Autocomplete();

    // Setup autocomplete providers
    this.#autocomplete.addProvider(Autocomplete.CommandProvider(this.#commands));
    this.#autocomplete.addProvider(Autocomplete.HistoryProvider(this.#history));

    // Initialize input handler
    this.#input = new InputHandler({
      theme: this.#theme,
      history: this.#history,
      autocomplete: this.#autocomplete
    });

    // Register commands
    this.#registerCommands();
  }

  /**
   * Register all CLI commands
   * @private
   */
  #registerCommands() {
    // Health check
    this.#commands.register({
      name: 'health',
      aliases: ['h'],
      description: 'Check provider status',
      category: 'Status',
      handler: () => this.#cmdHealth()
    });

    // Statistics
    this.#commands.register({
      name: 'stats',
      aliases: ['s'],
      description: 'Show usage statistics',
      category: 'Status',
      handler: () => this.#cmdStats()
    });

    // Force Ollama
    this.#commands.register({
      name: 'ollama',
      aliases: ['o'],
      description: 'Force next query to use Ollama',
      category: 'Provider',
      handler: () => this.#cmdForceProvider('ollama')
    });

    // Force Gemini
    this.#commands.register({
      name: 'gemini',
      aliases: ['g'],
      description: 'Force next query to use Gemini',
      category: 'Provider',
      handler: () => this.#cmdForceProvider('gemini')
    });

    // Auto mode (reset)
    this.#commands.register({
      name: 'auto',
      aliases: ['a'],
      description: 'Reset to automatic provider selection',
      category: 'Provider',
      handler: () => this.#cmdForceProvider(null)
    });

    // Quick mode
    this.#commands.register({
      name: 'quick',
      aliases: ['q'],
      description: 'Toggle quick mode (skip planning)',
      category: 'Mode',
      handler: () => this.#cmdQuickMode()
    });

    // Multiline mode
    this.#commands.register({
      name: 'multiline',
      aliases: ['m', 'ml'],
      description: 'Enter multiline input mode',
      category: 'Mode',
      handler: () => this.#cmdMultiline()
    });

    // Analyze routing
    this.#commands.register({
      name: 'analyze',
      aliases: ['an'],
      description: 'Analyze routing without executing',
      category: 'Debug',
      args: [{ name: 'prompt', required: false, description: 'Prompt to analyze' }],
      handler: ({ args }) => this.#cmdAnalyze(args.prompt)
    });

    // Clear screen
    this.#commands.register({
      name: 'clear',
      aliases: ['c', 'cls'],
      description: 'Clear the screen',
      category: 'General',
      handler: () => this.#cmdClear()
    });

    // Help
    this.#commands.register({
      name: 'help',
      aliases: ['?'],
      description: 'Show help',
      category: 'General',
      args: [{ name: 'command', required: false, description: 'Command to get help for' }],
      handler: ({ args }) => this.#cmdHelp(args.command)
    });

    // History
    this.#commands.register({
      name: 'history',
      aliases: ['hist'],
      description: 'Show command history',
      category: 'General',
      args: [{ name: 'count', required: false, type: 'number', default: 10 }],
      handler: ({ args }) => this.#cmdHistory(args.count)
    });

    // Theme
    this.#commands.register({
      name: 'theme',
      aliases: ['t'],
      description: 'Change color theme',
      category: 'General',
      args: [{ name: 'name', required: false, description: 'Theme name (hydra, minimal, neon, monokai, dracula)' }],
      handler: ({ args }) => this.#cmdTheme(args.name)
    });

    // Exit
    this.#commands.register({
      name: 'exit',
      aliases: ['quit', 'bye'],
      description: 'Exit HYDRA CLI',
      category: 'General',
      handler: () => this.#cmdExit()
    });

    // Models - list available Ollama models
    this.#commands.register({
      name: 'models',
      aliases: ['mod', 'lm'],
      description: 'List available Ollama models',
      category: 'Status',
      handler: () => this.#cmdModels()
    });

    // Config - show current configuration
    this.#commands.register({
      name: 'config',
      aliases: ['cfg', 'conf'],
      description: 'Show current configuration',
      category: 'Status',
      handler: () => this.#cmdConfig()
    });

    // Reset - reset statistics
    this.#commands.register({
      name: 'reset',
      aliases: ['rst'],
      description: 'Reset usage statistics',
      category: 'Status',
      handler: () => this.#cmdReset()
    });

    // Export - export history to file
    this.#commands.register({
      name: 'export',
      aliases: ['exp'],
      description: 'Export history to file',
      category: 'General',
      args: [{ name: 'file', required: false, description: 'Output file path (default: hydra-history-export.json)' }],
      handler: ({ args }) => this.#cmdExport(args.file)
    });

    // Import - import history from file
    this.#commands.register({
      name: 'import',
      aliases: ['imp'],
      description: 'Import history from file',
      category: 'General',
      args: [{ name: 'file', required: true, description: 'Input file path' }],
      handler: ({ args }) => this.#cmdImport(args.file)
    });
  }

  // ============ Command Handlers ============

  async #cmdHealth() {
    this.#spinner.start('Checking providers...');
    try {
      const health = await this.#hydra.healthCheck();
      this.#spinner.stop();
      this.#output.renderHealth(health);
    } catch (error) {
      this.#spinner.fail('Health check failed');
      this.#output.error(error.message);
    }
  }

  #cmdStats() {
    const stats = this.#hydra.getStats();
    this.#output.newline();
    this.#output.renderStats(stats);
  }

  #cmdForceProvider(provider) {
    this.#state.forceProvider = provider;
    if (provider === 'ollama') {
      this.#output.info('Next query will use Ollama');
    } else if (provider === 'gemini') {
      this.#output.info('Next query will use Gemini');
    } else {
      this.#output.success('Provider selection reset to automatic');
    }
  }

  #cmdQuickMode() {
    this.#state.quickMode = !this.#state.quickMode;
    if (this.#state.quickMode) {
      this.#output.success('Quick mode: ON (planning skipped)');
    } else {
      this.#output.info('Quick mode: OFF (full pipeline)');
    }
  }

  async #cmdMultiline() {
    this.#state.multilineMode = true;
    this.#output.dim('Entering multiline mode...');
  }

  async #cmdAnalyze(prompt) {
    if (!prompt) {
      this.#output.warning('Provide a prompt to analyze, or next input will be analyzed');
      this.#state.analyzeOnly = true;
      return;
    }

    this.#spinner.start('Analyzing routing...');
    try {
      const analysis = await this.#hydra.analyze(prompt);
      this.#spinner.stop();

      this.#output.newline();
      this.#output.renderBox([
        `Category:   ${analysis.category || 'unknown'}`,
        `Complexity: ${analysis.complexity || 'N/A'}`,
        `Provider:   ${analysis.provider || 'auto'}`,
        `Model:      ${analysis.model || 'default'}`,
        `Reason:     ${analysis.reason || 'N/A'}`
      ], 'Routing Analysis');
    } catch (error) {
      this.#spinner.fail('Analysis failed');
      this.#output.error(error.message);
    }
  }

  #cmdClear() {
    this.#output.clear();
    this.#output.renderBanner();
  }

  #cmdHelp(command) {
    this.#output.newline();
    console.log(this.#commands.getHelp(command));
    this.#output.newline();
  }

  #cmdHistory(count) {
    const entries = this.#history.getRecent(count);
    if (entries.length === 0) {
      this.#output.dim('No history yet');
      return;
    }

    this.#output.newline();
    entries.forEach((entry, i) => {
      console.log(this.#theme.colors.dim(`${i + 1}.`) + ' ' + entry);
    });
    this.#output.newline();
  }

  #cmdTheme(name) {
    const theme = getTheme(name);
    if (theme) {
      this.#theme = theme;
      this.#output.theme = theme;
      this.#input.theme = theme;
      this.#output.success(`Theme changed to: ${name || theme.name}`);
    } else {
      this.#output.warning(`Unknown theme: ${name}. Available: hydra, minimal, neon, monokai, dracula`);
    }
  }

  async #cmdExit() {
    this.#output.newline();
    await this.#cmdStats();
    this.#output.secondary('Goodbye!');
    await this.#history.save();
    this.#input.close();
    process.exit(0);
  }

  /**
   * List available Ollama models
   * @private
   */
  async #cmdModels() {
    this.#spinner.start('Fetching Ollama models...');
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      this.#spinner.stop();

      if (!data.models || data.models.length === 0) {
        this.#output.warning('No models found. Run "ollama pull <model>" to download models.');
        return;
      }

      this.#output.newline();
      const tableData = data.models.map(model => ({
        Name: model.name,
        Size: this.#formatSize(model.size),
        Modified: new Date(model.modified_at).toLocaleDateString()
      }));
      this.#output.renderTable(tableData, ['Name', 'Size', 'Modified']);
      this.#output.dim(`Total: ${data.models.length} models`);
    } catch (error) {
      this.#spinner.fail('Failed to fetch models');
      this.#output.error(`Could not connect to Ollama: ${error.message}`);
      this.#output.dim('Make sure Ollama is running (ollama serve)');
    }
  }

  /**
   * Format file size in human-readable form
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   * @private
   */
  #formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Show current configuration
   * @private
   */
  async #cmdConfig() {
    try {
      const config = loadConfig();
      this.#output.newline();
      this.#output.renderJSON(config);
    } catch (error) {
      this.#output.error(`Failed to load config: ${error.message}`);
    }
  }

  /**
   * Reset usage statistics
   * @private
   */
  #cmdReset() {
    if (this.#hydra.resetStats) {
      this.#hydra.resetStats();
      this.#output.success('Statistics have been reset');
    } else {
      // Fallback if resetStats is not available
      this.#output.warning('Statistics reset not supported in current version');
    }
  }

  /**
   * Export history to file
   * @param {string} [file] - Output file path
   * @private
   */
  async #cmdExport(file) {
    const outputFile = file || 'hydra-history-export.json';
    const filePath = resolve(process.cwd(), outputFile);

    try {
      const history = this.#history.getAll();
      const stats = this.#hydra.getStats();
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        history,
        stats
      };

      await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
      this.#output.success(`History exported to: ${filePath}`);
      this.#output.dim(`${history.length} entries exported`);
    } catch (error) {
      this.#output.error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Import history from file
   * @param {string} file - Input file path
   * @private
   */
  async #cmdImport(file) {
    if (!file) {
      this.#output.error('Please provide a file path');
      return;
    }

    const filePath = resolve(process.cwd(), file);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (!data.history || !Array.isArray(data.history)) {
        throw new Error('Invalid export file format');
      }

      let imported = 0;
      for (const entry of data.history) {
        if (typeof entry === 'string' && entry.trim()) {
          this.#history.add(entry);
          imported++;
        }
      }

      await this.#history.save();
      this.#output.success(`History imported from: ${filePath}`);
      this.#output.dim(`${imported} entries imported`);

      if (data.exportedAt) {
        this.#output.dim(`Originally exported: ${data.exportedAt}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.#output.error(`File not found: ${filePath}`);
      } else {
        this.#output.error(`Import failed: ${error.message}`);
      }
    }
  }

  // ============ Query Processing ============

  /**
   * Process a user query
   * @param {string} prompt - User prompt
   * @private
   */
  async #processQuery(prompt) {
    // Check for analyze-only mode
    if (this.#state.analyzeOnly) {
      this.#state.analyzeOnly = false;
      return this.#cmdAnalyze(prompt);
    }

    this.#spinner.start('Processing with HYDRA...');

    try {
      let result;

      if (this.#state.forceProvider === 'ollama') {
        result = await this.#hydra.ollama(prompt);
        this.#state.forceProvider = null;
      } else if (this.#state.forceProvider === 'gemini') {
        result = await this.#hydra.gemini(prompt);
        this.#state.forceProvider = null;
      } else if (this.#state.quickMode) {
        result = await this.#hydra.quick(prompt);
      } else {
        result = await this.#hydra.process(prompt, { verbose: false });
      }

      this.#spinner.stop();

      if (result.success !== false) {
        // Render metadata if available
        if (result.metadata) {
          this.#output.renderMetadata(result.metadata);
        }

        // Render response content
        this.#output.newline();
        this.#output.primary('Response:');
        this.#output.newline();

        // Use markdown rendering for content
        if (result.content) {
          this.#output.renderMarkdown(result.content);
        }

        // Duration
        const duration = result.metadata?.totalDuration_ms || result.duration_ms;
        if (duration) {
          this.#output.newline();
          this.#output.dim(`Total time: ${duration}ms`);
        }
      } else {
        this.#output.error(result.error || 'Unknown error');
      }
    } catch (error) {
      this.#spinner.fail('Processing failed');
      this.#output.error(error.message);
    }

    this.#output.newline();
  }

  // ============ Main REPL ============

  /**
   * Run the interactive REPL
   * @private
   */
  async #repl() {
    this.#state.running = true;

    while (this.#state.running && !this.#input.isClosed) {
      try {
        // Build prompt string
        let promptStr = 'HYDRA';
        if (this.#state.forceProvider) {
          promptStr = `[${this.#state.forceProvider}]`;
        } else if (this.#state.quickMode) {
          promptStr = '[quick]';
        }
        promptStr += '> ';

        // Read input
        let result;
        if (this.#state.multilineMode) {
          result = await this.#input.readMultiline(promptStr);
          this.#state.multilineMode = false;
        } else {
          result = await this.#input.read(promptStr);
        }

        // Handle cancelled input
        if (result.cancelled) {
          continue;
        }

        const input = result.value.trim();

        // Skip empty input
        if (!input) {
          continue;
        }

        // Check for command
        if (this.#commands.isCommand(input)) {
          try {
            await this.#commands.execute(input);
          } catch (error) {
            this.#output.error(error.message);
          }
          continue;
        }

        // Process as query
        await this.#processQuery(input);

      } catch (error) {
        if (error.message === 'readline was closed') {
          break;
        }
        this.#output.error(`Unexpected error: ${error.message}`);
      }
    }
  }

  /**
   * Run the CLI
   * @param {string[]} [args] - Command line arguments
   */
  async run(args = []) {
    // Load history
    await this.#history.load();

    // Check for one-shot mode (prompt as argument)
    if (args.length > 0 && !args[0].startsWith('-')) {
      const prompt = args.join(' ');
      await this.#processQuery(prompt);
      await this.#history.save();
      return;
    }

    // Interactive mode
    this.#output.renderBanner();
    await this.#cmdHealth();
    this.#output.newline();

    // Setup graceful exit
    process.on('SIGINT', async () => {
      this.#output.newline();
      await this.#cmdExit();
    });

    // Start REPL
    await this.#repl();

    // Cleanup
    await this.#history.save();
  }
}

/**
 * Create and run the CLI
 */
export async function main() {
  const cli = new HydraCLI();
  await cli.run(process.argv.slice(2));
}

// Run if executed directly
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('cli/index.js') ||
  process.argv[1]?.endsWith('cli\\index.js');

if (isMain) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

export default HydraCLI;
