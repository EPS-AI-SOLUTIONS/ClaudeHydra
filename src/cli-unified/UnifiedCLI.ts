/**
 * Unified CLI - Main class
 * @module cli-unified/UnifiedCLI
 */

import { EventEmitter } from 'events';
import { CLI_MODES, VERSION, CODENAME } from './core/constants.js';
import { eventBus, EVENT_TYPES } from './core/EventBus.js';
import { ConfigManager, getConfigManager } from './core/ConfigManager.js';
import { themeRegistry, getAutoTheme } from './core/ThemeRegistry.js';
import { UnifiedOutputRenderer, createOutputRenderer } from './output/UnifiedOutputRenderer.js';
import { UnifiedInputHandler, createInputHandler } from './input/UnifiedInputHandler.js';
import { UnifiedHistoryManager, createHistoryManager } from './history/UnifiedHistoryManager.js';
import { UnifiedCommandParser, createCommandParser } from './processing/UnifiedCommandParser.js';
import { AgentRouter, createAgentRouter } from './processing/AgentRouter.js';
import { ContextManager, createContextManager } from './processing/ContextManager.js';
import { CacheManager, createCacheManager } from './processing/CacheManager.js';
import { QueryProcessor, createQueryProcessor } from './processing/QueryProcessor.js';
import { BasicMode } from './modes/BasicMode.js';
import { EnhancedMode } from './modes/EnhancedMode.js';
import { SwarmMode } from './modes/SwarmMode.js';
import { SessionManager, createSessionManager } from './session/SessionManager.js';
import { initializeMCPClientManager } from '../mcp/client-manager.js';
import { getLlamaCppBridge } from '../hydra/providers/llamacpp-bridge.js';

/**
 * Unified CLI main class
 */
export class UnifiedCLI extends EventEmitter {
  constructor(options = {}) {
    super();

    this.version = VERSION;
    this.codename = CODENAME;

    // YOLO mode - no confirmations, full permissions (default: true)
    this.yolo = options.yolo !== false;
    this.autoApprove = options.autoApprove !== false;

    // Load configuration
    this.config = getConfigManager(options.configPath);

    // Determine mode (default: SWARM for full Witcher experience)
    this.modeName = options.mode || this.config.get('general.mode') || CLI_MODES.SWARM;

    // Initialize theme
    this.themeRegistry = themeRegistry;
    const themeName = options.theme || this.config.get('general.theme') || 'hydra';
    this.themeRegistry.set(themeName);

    // Initialize components
    this.output = createOutputRenderer({ theme: this.themeRegistry.getCurrent() });
    this.history = createHistoryManager();
    this.commandParser = createCommandParser();
    this.agentRouter = createAgentRouter();
    this.context = createContextManager();
    this.cache = createCacheManager({
      enabled: this.config.get('performance.cacheEnabled'),
      maxSize: this.config.get('performance.cacheMaxSize'),
      ttl: this.config.get('performance.cacheTTL') * 1000
    });

    // Initialize input handler
    this.input = createInputHandler({
      theme: this.themeRegistry.getCurrent(),
      history: this.history,
      vimMode: this.config.get('input.vimMode')
    });

    // Initialize query processor
    this.queryProcessor = createQueryProcessor({
      agentRouter: this.agentRouter,
      cacheManager: this.cache,
      contextManager: this.context,
      llamacppEnabled: this.config.get('models.llamacpp.enabled'),
      defaultModel: this.config.get('models.llamacpp.models.main'),
      streaming: this.config.get('ui.streamingEnabled')
    });

    this.streaming = this.config.get('ui.streamingEnabled');

    // Initialize session manager
    this.session = createSessionManager({
      autoSave: true,
      autoSaveInterval: 30000
    });

    // Mode instance
    this.mode = null;
    this.running = false;
  }

  /**
   * Initialize CLI
   */
  async init() {
    // Initialize MCP Client Manager and set up LlamaCpp bridge
    try {
      const mcpManager = await initializeMCPClientManager({
        autoConnect: true,
        enableHealthChecks: true
      });

      // Create invoker that calls MCP tools
      const mcpInvoker = async (toolName, params) => {
        return mcpManager.executeToolById(toolName, params);
      };

      // Set invoker in LlamaCpp bridge
      const bridge = getLlamaCppBridge();
      bridge.setMcpInvoker(mcpInvoker);

      this.mcpManager = mcpManager;
    } catch (error) {
      // CLI still works without AI (local commands only)
      console.warn('[CLI] MCP initialization failed:', error.message);
      this.mcpManager = null;
    }

    // Auto-detect mode if needed
    if (this.modeName === CLI_MODES.AUTO) {
      this.modeName = await this.detectMode();
    }

    // Create mode instance
    switch (this.modeName) {
      case CLI_MODES.BASIC:
        this.mode = new BasicMode(this);
        break;
      case CLI_MODES.ENHANCED:
        this.mode = new EnhancedMode(this);
        break;
      case CLI_MODES.SWARM:
        this.mode = new SwarmMode(this);
        break;
      default:
        this.mode = new BasicMode(this);
    }

    // Initialize mode
    await this.mode.init();

    eventBus.emit(EVENT_TYPES.CLI_INIT, { mode: this.modeName });
    this.emit('init', this.modeName);
  }

  /**
   * Auto-detect best mode
   */
  async detectMode() {
    // Check LlamaCpp health
    const health = await this.queryProcessor.checkHealth();

    if (!health.healthy) {
      return CLI_MODES.BASIC;
    }

    // Check for multiple models (suggests swarm capability)
    if (health.models && health.models.length >= 3) {
      return CLI_MODES.SWARM;
    }

    return CLI_MODES.ENHANCED;
  }

  /**
   * Show banner
   */
  showBanner() {
    const theme = this.themeRegistry.getCurrent();
    const modeInfo = this.mode.getInfo();

    this.output.newline();
    this.output.print(theme.colors.primary(`╔══════════════════════════════════════╗`));
    this.output.print(theme.colors.primary(`║`) + theme.colors.highlight(`   ClaudeHydra CLI v${this.version}   `) + theme.colors.primary(`║`));
    this.output.print(theme.colors.primary(`║`) + theme.colors.dim(`       "${this.codename}" Edition        `) + theme.colors.primary(`║`));
    this.output.print(theme.colors.primary(`╠══════════════════════════════════════╣`));
    this.output.print(theme.colors.primary(`║`) + theme.colors.info(` Mode: ${modeInfo.name.padEnd(28)}`) + theme.colors.primary(`║`));
    this.output.print(theme.colors.primary(`╚══════════════════════════════════════╝`));
    this.output.newline();

    // Greeting message
    const greetings = [
      'Witaj, wędrowcze. Czym mogę służyć?',
      'Gotowy do pracy. Co dziś robimy?',
      'System uruchomiony. Jestem do dyspozycji.',
      'Cześć! Gotowy na wyzwania.',
      'Witcher Swarm aktywny. Zadawaj pytania.'
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    this.output.print(theme.colors.success(`🐍 ${greeting}`));
    this.output.newline();

    this.output.dim(`Type /help for commands, /exit to quit`);
    this.output.newline();
  }

  /**
   * Main run loop
   */
  async run() {
    await this.init();
    this.showBanner();

    this.running = true;
    eventBus.emit(EVENT_TYPES.CLI_READY);

    while (this.running) {
      try {
        // Read input
        const { value, cancelled, multiline } = await this.input.read();

        if (cancelled) {
          continue;
        }

        if (!value.trim()) {
          continue;
        }

        // Add to history
        this.history.add(value);

        // Process input through mode
        const context = { cli: this };
        const result = await this.mode.processInput(value, context);

        // Handle exit
        if (context.exit) {
          this.running = false;
          break;
        }

        // Handle multiline request
        if (context.multiline) {
          const mlResult = await this.input.readMultiline();
          if (!mlResult.cancelled && mlResult.value) {
            const mlContext = { cli: this };
            await this.mode.processInput(mlResult.value, mlContext);
          }
          continue;
        }

        // Display result
        if (result?.result) {
          if (result.type === 'command' && typeof result.result === 'string') {
            this.output.print(result.result);
          } else if (result.type === 'query') {
            if (!this.streaming && result.result?.response) {
              this.output.renderMarkdown(result.result.response);
            } else if (!this.streaming && !result.result?.response) {
              this.output.dim('[No response received]');
            }
          }
        }

        this.output.newline();

      } catch (error) {
        this.output.error(error.message || 'Unknown error');
        if (error.stack && process.env.DEBUG) {
          this.output.dim(error.stack);
        }
        this.output.newline();
      }
    }

    this.shutdown();
  }

  /**
   * Shutdown CLI gracefully
   */
  async shutdown() {
    this.running = false;

    // Stop spinner if running
    try {
      this.output.stopSpinner();
    } catch {
      // Ignore spinner errors
    }

    // Close input
    try {
      this.input.close();
    } catch {
      // Ignore input close errors
    }

    // Save config
    try {
      this.config.saveConfig();
    } catch (error) {
      console.error('Failed to save config:', error.message);
    }

    // Emit exit events
    eventBus.emit(EVENT_TYPES.CLI_EXIT);
    this.emit('exit');

    this.output.success('Goodbye!');

    // Give time for cleanup
    setTimeout(() => process.exit(0), 100);
  }

  /**
   * Get current mode info
   */
  getModeInfo() {
    return this.mode?.getInfo() || { name: 'unknown' };
  }

  /**
   * Switch mode
   */
  async switchMode(newMode) {
    if (!Object.values(CLI_MODES).includes(newMode)) {
      throw new Error(`Unknown mode: ${newMode}`);
    }

    this.modeName = newMode;
    await this.init();
    this.emit('modeSwitch', newMode);
  }
}

/**
 * Create CLI instance
 */
export async function createCLI(options = {}) {
  const cli = new UnifiedCLI(options);
  return cli;
}

export default UnifiedCLI;
