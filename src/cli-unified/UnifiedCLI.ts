/**
 * Unified CLI - Main class
 * @module cli-unified/UnifiedCLI
 */

import { EventEmitter } from 'node:events';
import { getLlamaCppBridge } from '../hydra/providers/llamacpp-bridge.js';
import { initializeMCPClientManager } from '../mcp/client-manager.js';
import { getLogger, LogLevel, setLogLevel } from '../utils/logger.js';
import { getConfigManager } from './core/ConfigManager.js';
import { CLI_MODES, CODENAME, VERSION } from './core/constants.js';
import { EVENT_TYPES, eventBus } from './core/EventBus.js';
import { themeRegistry } from './core/ThemeRegistry.js';
import { createHistoryManager } from './history/UnifiedHistoryManager.js';
import { createInputHandler } from './input/UnifiedInputHandler.js';
import { BasicMode } from './modes/BasicMode.js';
import { EnhancedMode } from './modes/EnhancedMode.js';
import { SwarmMode } from './modes/SwarmMode.js';
import { createOutputRenderer } from './output/UnifiedOutputRenderer.js';
import { createAgentRouter } from './processing/AgentRouter.js';
import { createCacheManager } from './processing/CacheManager.js';
import { createContextManager } from './processing/ContextManager.js';
import { createQueryProcessor } from './processing/QueryProcessor.js';
import { getMCPToolDefinitions } from './processing/tools-for-sdk.js';
import { createCommandParser } from './processing/UnifiedCommandParser.js';
import { createSessionManager } from './session/SessionManager.js';

const logger = getLogger('UnifiedCLI');

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

    // Configure logging
    if (options.verbose) {
      setLogLevel(LogLevel.DEBUG);
      logger.info('Verbose mode enabled (DEBUG level)');
    } else if (options.trace) {
      setLogLevel(LogLevel.TRACE);
      logger.info('Trace mode enabled (TRACE level)');
    } else if (process.env.LOG_LEVEL) {
      setLogLevel(process.env.LOG_LEVEL);
    }

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
      ttl: this.config.get('performance.cacheTTL') * 1000,
    });

    // Initialize input handler
    this.input = createInputHandler({
      theme: this.themeRegistry.getCurrent(),
      history: this.history,
      vimMode: this.config.get('input.vimMode'),
    });

    // Initialize query processor with agentic loop.
    // maxTurns controls how many SDK round-trips (tool calls) are allowed.
    // Too high (25+) causes excessive tool calls (50-60 per query).
    // Default 10 balances thoroughness vs cost/latency.
    const configuredMaxTurns = this.config.get('agentic.maxTurns');
    this.queryProcessor = createQueryProcessor({
      agentRouter: this.agentRouter,
      cacheManager: this.cache,
      contextManager: this.context,
      llamacppEnabled: this.config.get('models.llamacpp.enabled'),
      defaultModel: this.config.get('models.llamacpp.models.main'),
      streaming: this.config.get('ui.streamingEnabled'),
      agentic: {
        enabled: true,
        maxIterations: 3,
        qualityThreshold: 7,
        verbose: false,
        maxTurns: configuredMaxTurns ?? 10,
        tools: getMCPToolDefinitions(),
      },
    });

    this.streaming = this.config.get('ui.streamingEnabled');

    // Initialize session manager
    this.session = createSessionManager({
      autoSave: true,
      autoSaveInterval: 30000,
    });

    // Mode instance
    this.mode = null;
    this.running = false;
  }

  /**
   * Initialize local components (fast, no network)
   */
  async initLocal() {
    // Auto-detect mode if needed (without MCP health check - default to swarm)
    if (this.modeName === CLI_MODES.AUTO) {
      this.modeName = CLI_MODES.SWARM;
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
   * Initialize MCP connections (slow, runs in background)
   */
  async initMCP() {
    try {
      const mcpManager = await initializeMCPClientManager({
        autoConnect: true,
        enableHealthChecks: true,
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
      this.mcpManager = null;
      throw error;
    }
  }

  /**
   * Initialize CLI (full - for backward compatibility).
   * MCP failure is non-fatal: CLI degrades gracefully to local-only mode.
   */
  async init() {
    await this.initLocal();
    try {
      await this.initMCP();
    } catch (error) {
      // Graceful degradation — CLI works without MCP
      eventBus.emit(EVENT_TYPES.CLI_INIT, { mcpError: error.message });
    }
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
    this.output.print(
      theme.colors.primary(`║`) +
        theme.colors.highlight(`   ClaudeHydra CLI v${this.version}   `) +
        theme.colors.primary(`║`),
    );
    this.output.print(
      theme.colors.primary(`║`) +
        theme.colors.dim(`       "${this.codename}" Edition        `) +
        theme.colors.primary(`║`),
    );
    this.output.print(theme.colors.primary(`╠══════════════════════════════════════╣`));
    this.output.print(
      theme.colors.primary(`║`) +
        theme.colors.info(` Mode: ${modeInfo.name.padEnd(28)}`) +
        theme.colors.primary(`║`),
    );
    this.output.print(theme.colors.primary(`╚══════════════════════════════════════╝`));
    this.output.newline();

    // Greeting message
    const greetings = [
      'Witaj, wędrowcze. Czym mogę służyć?',
      'Gotowy do pracy. Co dziś robimy?',
      'System uruchomiony. Jestem do dyspozycji.',
      'Cześć! Gotowy na wyzwania.',
      'Witcher Swarm aktywny. Zadawaj pytania.',
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
    // Show banner immediately (before slow MCP init)
    await this.initLocal();
    this.showBanner();

    // Start MCP connections in background (non-blocking).
    // Track completion so we can display status safely between queries
    // instead of interrupting active output.
    this._mcpReady = false;
    this._mcpError = null;
    this.initMCP()
      .then(() => {
        this._mcpReady = true;
      })
      .catch((error) => {
        this._mcpError = error.message;
      });

    this.running = true;
    eventBus.emit(EVENT_TYPES.CLI_READY);

    while (this.running) {
      try {
        // Show deferred MCP status between queries (safe moment — no active output)
        if (this._mcpReady === true) {
          this.output.dim('[MCP] Servers connected');
          this._mcpReady = 'shown';
        } else if (this._mcpError && this._mcpError !== 'shown') {
          this.output.dim(`[MCP] Background init: ${this._mcpError}`);
          this._mcpError = 'shown';
        }

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

        // Reset streaming state before each query
        this.output.streamReset();

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
            } else if (!result.result?.response) {
              // Show fallback for both streaming (empty response) and non-streaming
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
