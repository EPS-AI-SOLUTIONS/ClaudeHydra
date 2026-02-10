/**
 * CLI-Unified Entry Point
 * @module cli-unified
 */

// Force chalk colors on Windows Terminal / modern terminals
if (!process.env.FORCE_COLOR && (process.env.WT_SESSION || process.stdout.isTTY)) {
  process.env.FORCE_COLOR = '3';
}

import { CLI_MODES, CODENAME, VERSION } from './core/constants.js';
import { createCLI, UnifiedCLI } from './UnifiedCLI.js';

// Re-export main class and factory
export { UnifiedCLI, createCLI };

// Re-export constants
export { CLI_MODES, VERSION, CODENAME };

export * from './core/ConfigManager.js';
// Re-export core modules
export * from './core/constants.js';
export * from './core/EventBus.js';
export * from './core/ThemeRegistry.js';
// Re-export history modules
export * from './history/FuzzySearchEngine.js';
export * from './history/UnifiedHistoryManager.js';
// Re-export input modules
export * from './input/AutocompleteEngine.js';
// Re-export input enhancements
export {
  ContextProgress,
  ExternalEditor,
  FilePreview,
  GhostTextPreview,
  KeyboardShortcuts,
} from './input/InputEnhancements.js';
export * from './input/MacroRecorder.js';
export * from './input/TemplateExpander.js';
export * from './input/UnifiedInputHandler.js';
export * from './input/VimModeHandler.js';
// Re-export modes
export { BasicMode } from './modes/BasicMode.js';
export { EnhancedMode } from './modes/EnhancedMode.js';
export { SwarmMode } from './modes/SwarmMode.js';
export * from './output/BorderRenderer.js';
export * from './output/MarkdownRenderer.js';
// Re-export output modules
export * from './output/SpinnerSystem.js';
export * from './output/StreamingRenderer.js';
export * from './output/TableRenderer.js';
export * from './output/UnifiedOutputRenderer.js';
export * from './processing/AgentRouter.js';
export * from './processing/CacheManager.js';
export * from './processing/ContextManager.js';
export * from './processing/QueryProcessor.js';
// Re-export processing modules
export * from './processing/UnifiedCommandParser.js';
// Re-export session manager
export { createSessionManager, SessionManager } from './session/SessionManager.js';

/**
 * Main entry point - run CLI
 */
export async function main(args = process.argv.slice(2)) {
  // Parse command line arguments
  // Defaults: swarm mode, yolo enabled (no questions, full permissions)
  const options = {
    yolo: true, // No confirmation prompts
    autoApprove: true, // Auto-approve all actions
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--mode' || arg === '-m') {
      options.mode = args[++i];
    } else if (arg === '--theme' || arg === '-t') {
      options.theme = args[++i];
    } else if (arg === '--basic') {
      options.mode = CLI_MODES.BASIC;
    } else if (arg === '--enhanced') {
      options.mode = CLI_MODES.ENHANCED;
    } else if (arg === '--swarm') {
      options.mode = CLI_MODES.SWARM;
    } else if (arg === '--yolo' || arg === '-y' || arg === '--yes') {
      options.yolo = true;
      options.autoApprove = true;
    } else if (arg === '--safe' || arg === '--confirm') {
      options.yolo = false;
      options.autoApprove = false;
    } else if (arg === '--verbose' || arg === '-V') {
      options.verbose = true;
    } else if (arg === '--trace') {
      options.trace = true;
    } else if (arg === '--version' || arg === '-v') {
      console.log(`ClaudeHydra CLI v${VERSION} (${CODENAME})`);
      process.exit(0);
    } else if (arg === '--diagnose') {
      options.diagnose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
ClaudeHydra CLI v${VERSION} (${CODENAME})

Usage: claudehydra [options]

Options:
  --mode, -m <mode>   Set CLI mode (basic, enhanced, swarm, auto)
  --theme, -t <theme> Set theme (hydra, minimal, neon, monokai, dracula, witcher, cyberpunk)
  --basic             Shortcut for --mode basic
  --enhanced          Shortcut for --mode enhanced
  --swarm             Shortcut for --mode swarm
  --yolo, -y, --yes   No confirmations, full permissions [DEFAULT]
  --safe, --confirm   Ask for confirmations (safe mode)
  --diagnose          Run Claude SDK diagnostic and exit
  --version, -v       Show version
  --help, -h          Show this help

Modes:
  swarm     Full Witcher Swarm (12 agents, chains, parallel) [DEFAULT]
  enhanced  Extended features (context, cache, templates, vim)
  basic     Minimal features (commands, history, themes)
  auto      Auto-detect best mode based on system

Examples:
  claudehydra                    Start in swarm mode, YOLO (default)
  claudehydra --safe             Start with confirmations enabled
  claudehydra --theme cyberpunk  Start with cyberpunk theme
  claudehydra --diagnose         Check Claude SDK connection
`);
      process.exit(0);
    }
  }

  // Run diagnostic mode if requested
  if (options.diagnose) {
    process.env.CLAUDE_SDK_DEBUG = '1';
    const { healthCheck } = await import('../hydra/providers/claude-client.js');

    console.log(`ClaudeHydra CLI v${VERSION} (${CODENAME})`);
    console.log('Uruchamianie diagnostyki Claude SDK...\n');

    const result = await healthCheck();

    if (result.available) {
      console.log('✓ Claude SDK: DOSTĘPNY');
      console.log(`  Provider: ${result.provider}`);
      console.log(`  Modele: ${result.models?.join(', ')}`);
      console.log(`  Latencja: ${result.latency_ms}ms`);
      if (result.claudeCodeVersion) {
        console.log(`  Claude Code: v${result.claudeCodeVersion}`);
      }
    } else {
      console.log('✗ Claude SDK: NIEDOSTĘPNY');
      console.log(`  Błąd: ${result.error}`);
      if (result.errorType) {
        console.log(`  Typ: ${result.errorType}`);
      }
      if (result.stderrOutput) {
        console.log(`\n  [stderr]:`);
        for (const line of result.stderrOutput.split('\n')) {
          console.log(`    ${line}`);
        }
      }
      if (result.suggestions?.length) {
        console.log('\nSugestie:');
        for (const s of result.suggestions) {
          console.log(`  → ${s}`);
        }
      }
    }

    console.log(`\nŚrodowisko:`);
    console.log(`  Node.js: ${process.version}`);
    console.log(`  Platform: ${process.platform} ${process.arch}`);
    console.log(`  CLAUDE_SDK_DEBUG: ${process.env.CLAUDE_SDK_DEBUG || 'nie ustawiony'}`);
    console.log(`  CLAUDE_API_KEY: ${process.env.CLAUDE_API_KEY ? 'ustawiony' : 'nie ustawiony'}`);

    process.exit(result.available ? 0 : 1);
  }

  // TEMPORARY: --test-sdk flag to debug crash in full CLI context
  if (args.includes('--test-sdk')) {
    console.log('[test-sdk] Creating full CLI...');
    const cli = await createCLI(options);
    await cli.initLocal();

    // Start MCP in background (same as run())
    cli
      .initMCP?.()
      .then(() => console.log('[test-sdk] MCP connected'))
      .catch(() => {});

    console.log('[test-sdk] CLI initialized with readline. Testing SDK...');
    console.log(
      '[test-sdk] stdin.isTTY:',
      process.stdin.isTTY,
      'stdout.isTTY:',
      process.stdout.isTTY,
    );
    console.log('[test-sdk] FORCE_COLOR:', process.env.FORCE_COLOR);

    const { generate } = await import('../hydra/providers/claude-client.js');
    const start = Date.now();
    const result = await generate('Say pong. One word only.', {
      model: 'claude-opus',
      maxTurns: 1,
      timeout: 30000,
    });
    console.log(
      `[test-sdk] Done in ${Date.now() - start}ms | success=${result.success} content=${result.content?.substring(0, 50)} error=${result.error}`,
    );
    process.exit(result.success ? 0 : 1);
  }

  // Create and run CLI
  const cli = await createCLI(options);
  await cli.run();
}

// Default export
export default {
  UnifiedCLI,
  createCLI,
  main,
  CLI_MODES,
  VERSION,
  CODENAME,
};

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

// Run if executed directly
const isMain = process.argv[1]?.includes('cli-unified');
if (isMain) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
