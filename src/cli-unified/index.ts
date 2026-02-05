/**
 * CLI-Unified Entry Point
 * @module cli-unified
 */

import { UnifiedCLI, createCLI } from './UnifiedCLI.js';
import { CLI_MODES, VERSION, CODENAME } from './core/constants.js';

// Re-export main class and factory
export { UnifiedCLI, createCLI };

// Re-export constants
export { CLI_MODES, VERSION, CODENAME };

// Re-export core modules
export * from './core/constants.js';
export * from './core/EventBus.js';
export * from './core/ConfigManager.js';
export * from './core/ThemeRegistry.js';

// Re-export output modules
export * from './output/SpinnerSystem.js';
export * from './output/BorderRenderer.js';
export * from './output/MarkdownRenderer.js';
export * from './output/TableRenderer.js';
export * from './output/StreamingRenderer.js';
export * from './output/UnifiedOutputRenderer.js';

// Re-export input modules
export * from './input/AutocompleteEngine.js';
export * from './input/VimModeHandler.js';
export * from './input/TemplateExpander.js';
export * from './input/MacroRecorder.js';
export * from './input/UnifiedInputHandler.js';

// Re-export history modules
export * from './history/FuzzySearchEngine.js';
export * from './history/UnifiedHistoryManager.js';

// Re-export processing modules
export * from './processing/UnifiedCommandParser.js';
export * from './processing/AgentRouter.js';
export * from './processing/ContextManager.js';
export * from './processing/CacheManager.js';
export * from './processing/QueryProcessor.js';

// Re-export modes
export { BasicMode } from './modes/BasicMode.js';
export { EnhancedMode } from './modes/EnhancedMode.js';
export { SwarmMode } from './modes/SwarmMode.js';

// Re-export session manager
export { SessionManager, createSessionManager } from './session/SessionManager.js';

// Re-export input enhancements
export {
  GhostTextPreview,
  ExternalEditor,
  KeyboardShortcuts,
  FilePreview,
  ContextProgress
} from './input/InputEnhancements.js';

/**
 * Main entry point - run CLI
 */
export async function main(args = process.argv.slice(2)) {
  // Parse command line arguments
  // Defaults: swarm mode, yolo enabled (no questions, full permissions)
  const options = {
    yolo: true,        // No confirmation prompts
    autoApprove: true  // Auto-approve all actions
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
    } else if (arg === '--version' || arg === '-v') {
      console.log(`ClaudeHydra CLI v${VERSION} (${CODENAME})`);
      process.exit(0);
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
`);
      process.exit(0);
    }
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
  CODENAME
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
  main().catch(error => {
    console.error('Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
