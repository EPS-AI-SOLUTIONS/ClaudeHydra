/**
 * ClaudeHydra CLI - Enhanced Chat Interface
 * 50 Features Implementation
 * @module swarm/cli
 */

// Core modules
export { EnhancedInputHandler } from './input/EnhancedInputHandler.js';
export { SyntaxHighlighter } from './input/SyntaxHighlighter.js';
export { BracketMatcher } from './input/BracketMatcher.js';
export { UndoManager } from './input/UndoManager.js';
export { SmartPaste } from './input/SmartPaste.js';
export { VimMode } from './input/VimMode.js';

// History modules
export { FuzzySearch } from './history/FuzzySearch.js';
export { SessionManager } from './history/SessionManager.js';
export { ConversationBrancher } from './history/ConversationBrancher.js';
export { HistoryTags } from './history/HistoryTags.js';
export { HistoryExporter } from './history/HistoryExporter.js';

// Commands modules
export { CommandAliases } from './commands/CommandAliases.js';
export { CommandChainer } from './commands/CommandChainer.js';
export { Snippets } from './commands/Snippets.js';
export { Macros } from './commands/Macros.js';
export { CommandPalette } from './commands/CommandPalette.js';

// UI modules
export { StreamingRenderer } from './ui/StreamingRenderer.js';
export { ProgressIndicator } from './ui/ProgressIndicator.js';
export { CollapsibleSections } from './ui/CollapsibleSections.js';
export { SyntaxThemes } from './ui/SyntaxThemes.js';
export { AgentAvatars } from './ui/AgentAvatars.js';
export { MarkdownTableRenderer } from './ui/MarkdownTableRenderer.js';

// Integration modules
export { FileHandler } from './integrations/FileHandler.js';
export { UrlFetcher } from './integrations/UrlFetcher.js';
export { CodeExecutor } from './integrations/CodeExecutor.js';
export { DiffViewer } from './integrations/DiffViewer.js';
export { GitIntegration } from './integrations/GitIntegration.js';
export { NotificationManager } from './integrations/NotificationManager.js';
export { PluginSystem } from './integrations/PluginSystem.js';

// Main CLI class
export { ClaudeHydraCLI } from './ClaudeHydraCLI.js';

// Version
export const CLI_VERSION = '3.0.0';
