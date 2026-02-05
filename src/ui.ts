/**
 * HYDRA UI Module
 * Central export file for all UI components
 *
 * This module consolidates exports from:
 * - src/cli/ - Command line interface components
 * - src/logger/ - Logging and color utilities
 *
 * @module ui
 */

// ============================================================================
// CLI Components
// ============================================================================

// Main CLI Application
export { HydraCLI, main as cliMain } from './cli/index.js';

// Banner and ASCII Art
export {
  showBanner,
  showCompactBanner,
  showMinimalBanner,
  showStartupAnimation,
  VERSION,
  CODENAME,
  gradients,
  LOGOS,
  BORDERS,
  centerText,
  horizontalLine,
  createBox,
  hexToRgb as bannerHexToRgb,
  getTerminalWidth
} from './cli/Banner.js';

// Theme System
export {
  HydraTheme,
  MinimalTheme,
  NeonTheme,
  MonokaiTheme,
  DraculaTheme,
  getTheme as getCliTheme,
  getAvailableThemes,
  supportsUnicode,
  getAutoTheme
} from './cli/Theme.js';

// Input Handling
export {
  InputHandler,
  createInputHandler
} from './cli/InputHandler.js';

// Output Rendering
export {
  OutputRenderer,
  createRenderer
} from './cli/OutputRenderer.js';

// Command Parser
export {
  CommandParser,
  createCommandParser
} from './cli/CommandParser.js';

// History Manager
export {
  HistoryManager,
  createHistoryManager
} from './cli/HistoryManager.js';

// Autocomplete System
export {
  Autocomplete,
  createAutocomplete
} from './cli/Autocomplete.js';

// Spinner and Progress
export {
  Spinner,
  SpinnerTypes,
  getSpinnerType,
  getAvailableSpinnerTypes,
  ProgressBar,
  MultiSpinner,
  AnimatedText,
  createSpinner,
  createTypedSpinner,
  createProgressBar,
  createMultiSpinner,
  demoSpinners
} from './cli/Spinner.js';

// Prompt Builder
export {
  PromptBuilder,
  createPromptBuilder
} from './cli/PromptBuilder.js';

// CLI Constants
export {
  HISTORY_FILE,
  MAX_HISTORY_SIZE,
  DEFAULT_PROMPT,
  MULTILINE_PROMPT,
  COMMAND_PREFIX,
  KEYS,
  ANSI,
  DEFAULT_TERMINAL_WIDTH,
  SPINNER_INTERVAL,
  PROMPT_STATES,
  EXECUTION_MODES,
  RESPONSE_TIME_THRESHOLDS,
  BOX_UNICODE,
  BOX_ASCII
} from './cli/constants.js';

// ============================================================================
// Logger Components
// ============================================================================

// Color Utilities
export {
  COLORS,
  RESET,
  Styles,
  FgColors,
  BgColors,
  supportsColors,
  getColorDepth,
  colorize,
  createColorFormatter,
  stripAnsi,
  visibleLength,
  // Convenience colors
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  grey,
  bold,
  dim,
  italic,
  underline,
  inverse,
  strikethrough,
  // Semantic colors
  error,
  warning,
  success,
  info,
  debug,
  // Extended colors
  fg256,
  bg256,
  fgRGB,
  bgRGB,
  fgHex,
  bgHex,
  default as colors
} from './logger/colors.js';

// Log Rotation
export {
  LogRotation,
  getLogRotation,
  resetLogRotation,
  default as rotation
} from './logger/rotation.js';

// ============================================================================
// Convenience Namespace Exports
// ============================================================================

// Import all modules for namespace exports
import * as BannerModule from './cli/Banner.js';
import * as ThemeModule from './cli/Theme.js';
import * as InputModule from './cli/InputHandler.js';
import * as OutputModule from './cli/OutputRenderer.js';
import * as CommandModule from './cli/CommandParser.js';
import * as HistoryModule from './cli/HistoryManager.js';
import * as AutocompleteModule from './cli/Autocomplete.js';
import * as SpinnerModule from './cli/Spinner.js';
import * as PromptModule from './cli/PromptBuilder.js';
import * as ConstantsModule from './cli/constants.js';
import * as ColorsModule from './logger/colors.js';
import * as RotationModule from './logger/rotation.js';
import { HydraCLI, main } from './cli/index.js';

/**
 * CLI namespace containing all CLI-related exports
 */
export const cli = {
  // Main application
  HydraCLI,
  main,

  // Components
  Banner: BannerModule,
  Theme: ThemeModule,
  Input: InputModule,
  Output: OutputModule,
  Command: CommandModule,
  History: HistoryModule,
  Autocomplete: AutocompleteModule,
  Spinner: SpinnerModule,
  Prompt: PromptModule,
  constants: ConstantsModule
};

/**
 * Logger namespace containing all logging-related exports
 */
export const logger = {
  colors: ColorsModule,
  rotation: RotationModule
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a complete CLI setup with all components
 * @param {Object} [options] - Configuration options
 * @param {Object} [options.theme] - Theme to use
 * @param {string} [options.historyFile] - History file path
 * @param {boolean} [options.autocomplete=true] - Enable autocomplete
 * @returns {Object} CLI components bundle
 */
export function createCLI(options = {}) {
  const theme = options.theme || ThemeModule.getAutoTheme();
  const history = HistoryModule.createHistoryManager({ file: options.historyFile });
  const autocomplete = options.autocomplete !== false ? AutocompleteModule.createAutocomplete() : null;
  const commands = CommandModule.createCommandParser();
  const output = OutputModule.createRenderer(theme);
  const spinner = SpinnerModule.createSpinner({ theme });
  const promptBuilder = PromptModule.createPromptBuilder(theme);

  const input = InputModule.createInputHandler({
    theme,
    history,
    autocomplete
  });

  // Setup default autocomplete providers
  if (autocomplete) {
    autocomplete.addProvider(AutocompleteModule.Autocomplete.CommandProvider(commands));
    autocomplete.addProvider(AutocompleteModule.Autocomplete.HistoryProvider(history));
  }

  return {
    theme,
    history,
    autocomplete,
    commands,
    output,
    spinner,
    promptBuilder,
    input,
    // Quick access methods
    print: output.renderMarkdown.bind(output),
    success: output.success.bind(output),
    error: output.error.bind(output),
    warning: output.warning.bind(output),
    info: output.info.bind(output),
    clear: output.clear.bind(output),
    showBanner: output.renderBanner.bind(output)
  };
}

/**
 * Create a themed output renderer
 * @param {string} themeName - Theme name: 'hydra', 'minimal', 'neon', 'monokai', 'dracula'
 * @returns {OutputRenderer} Configured renderer
 */
export function createThemedRenderer(themeName) {
  const theme = ThemeModule.getTheme(themeName);
  return OutputModule.createRenderer(theme);
}

/**
 * Create a spinner with specific type and theme
 * @param {string} type - Spinner type from SpinnerTypes
 * @param {string} [themeName='hydra'] - Theme name
 * @returns {Spinner} Configured spinner
 */
export function createThemedSpinner(type, themeName = 'hydra') {
  const theme = ThemeModule.getTheme(themeName);
  return SpinnerModule.createTypedSpinner(type, { theme });
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Namespaces
  cli,
  logger,

  // Factory functions
  createCLI,
  createThemedRenderer,
  createThemedSpinner,

  // Core classes
  HydraCLI,
  InputHandler: InputModule.InputHandler,
  OutputRenderer: OutputModule.OutputRenderer,
  CommandParser: CommandModule.CommandParser,
  HistoryManager: HistoryModule.HistoryManager,
  Autocomplete: AutocompleteModule.Autocomplete,
  Spinner: SpinnerModule.Spinner,
  ProgressBar: SpinnerModule.ProgressBar,
  MultiSpinner: SpinnerModule.MultiSpinner,
  AnimatedText: SpinnerModule.AnimatedText,
  PromptBuilder: PromptModule.PromptBuilder,
  LogRotation: RotationModule.LogRotation,

  // Themes
  HydraTheme: ThemeModule.HydraTheme,
  MinimalTheme: ThemeModule.MinimalTheme,
  NeonTheme: ThemeModule.NeonTheme,
  MonokaiTheme: ThemeModule.MonokaiTheme,
  DraculaTheme: ThemeModule.DraculaTheme,
  getTheme: ThemeModule.getTheme,
  getAvailableThemes: ThemeModule.getAvailableThemes,

  // Banner utilities
  showBanner: BannerModule.showBanner,
  showCompactBanner: BannerModule.showCompactBanner,
  showMinimalBanner: BannerModule.showMinimalBanner,
  VERSION: BannerModule.VERSION,
  CODENAME: BannerModule.CODENAME,

  // Spinner utilities
  SpinnerTypes: SpinnerModule.SpinnerTypes,
  getSpinnerType: SpinnerModule.getSpinnerType,
  getAvailableSpinnerTypes: SpinnerModule.getAvailableSpinnerTypes,

  // Color utilities
  colors: ColorsModule.default,
  COLORS: ColorsModule.COLORS,
  supportsColors: ColorsModule.supportsColors,
  colorize: ColorsModule.colorize,
  stripAnsi: ColorsModule.stripAnsi
};
