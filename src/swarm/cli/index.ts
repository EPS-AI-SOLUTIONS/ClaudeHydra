/**
 * ClaudeHydra CLI - Enhanced Chat Interface
 * 50 Features Implementation
 * @module swarm/cli
 */

// Main CLI class
export { ClaudeHydraCLI } from './ClaudeHydraCLI.js';
// Commands modules
export { CommandAliases } from './commands/CommandAliases.js';
export { CommandChainer } from './commands/CommandChainer.js';
export { CommandPalette } from './commands/CommandPalette.js';
export { Macros } from './commands/Macros.js';
export { Snippets } from './commands/Snippets.js';
export { ConversationBrancher } from './history/ConversationBrancher.js';
// History modules
export { FuzzySearch } from './history/FuzzySearch.js';
export { HistoryExporter } from './history/HistoryExporter.js';
export { HistoryTags } from './history/HistoryTags.js';
export { SessionManager } from './history/SessionManager.js';
export { BracketMatcher } from './input/BracketMatcher.js';
// Core modules
export { EnhancedInputHandler } from './input/EnhancedInputHandler.js';
export { SmartPaste } from './input/SmartPaste.js';
export { SyntaxHighlighter } from './input/SyntaxHighlighter.js';
export { UndoManager } from './input/UndoManager.js';
export { VimMode } from './input/VimMode.js';
export { CodeExecutor } from './integrations/CodeExecutor.js';
export { DiffViewer } from './integrations/DiffViewer.js';
// Integration modules
export { FileHandler } from './integrations/FileHandler.js';
export { GitIntegration } from './integrations/GitIntegration.js';
export { NotificationManager } from './integrations/NotificationManager.js';
export { PluginSystem } from './integrations/PluginSystem.js';
export { UrlFetcher } from './integrations/UrlFetcher.js';
export { AgentAvatars } from './ui/AgentAvatars.js';
export { CollapsibleSections } from './ui/CollapsibleSections.js';
export { MarkdownTableRenderer } from './ui/MarkdownTableRenderer.js';
export { ProgressIndicator } from './ui/ProgressIndicator.js';
// UI modules
export { StreamingRenderer } from './ui/StreamingRenderer.js';
export { SyntaxThemes } from './ui/SyntaxThemes.js';

// Version
export const CLI_VERSION = '3.0.0';
