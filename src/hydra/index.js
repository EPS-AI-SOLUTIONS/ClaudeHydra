/**
 * HYDRA Core Module Library
 * Unified exports for all HYDRA subsystems
 */

// Colors & Styling
export {
  ANSI,
  COLORS,
  PROGRESS,
  BOX,
  createPalette,
  createStyler,
  style,
} from './colors.js';

// Logging
export {
  Logger,
  getLogger,
  setGlobalLogger,
  LOG_LEVELS,
} from './logger.js';

// Progress & Animations
export {
  Spinner,
  ProgressBar,
  StepProgress,
  SplashScreen,
  createSpinner,
  createProgressBar,
} from './progress.js';

// Benchmarks & Performance
export {
  Timer,
  StartupBenchmark,
  MetricsCollector,
  MemoryMonitor,
  LatencyProfiler,
  getStartupBenchmark,
  getMetricsCollector,
  getMemoryMonitor,
  getLatencyProfiler,
} from './benchmarks.js';

// Crash Reporter & Graceful Shutdown
export {
  CrashReporter,
  GracefulShutdown,
  getCrashReporter,
  getGracefulShutdown,
} from './crash-reporter.js';

// Config Validation & Hot Reload
export {
  ConfigValidator,
  ConfigHotReload,
  PortableMode,
  ConfigSync,
  getConfigValidator,
  getConfigHotReload,
  getPortableMode,
  getConfigSync,
} from './config-validator.js';

// Network & WebSocket
export {
  httpPing,
  tcpPing,
  dnsLookup,
  icmpPing,
  NetworkDiagnostics,
  WebSocketManager,
  getNetworkDiagnostics,
  getWebSocketManager,
} from './network.js';

// Model Registry & GPU
export {
  ModelRegistry,
  GPUManager,
  getModelRegistry,
  getGPUManager,
  MODEL_CATALOG,
  DEFAULT_ALIASES,
} from './model-registry.js';

// CLI Completions
export {
  CompletionsManager,
  getCompletion,
  generateBashCompletion,
  generateZshCompletion,
  generatePowerShellCompletion,
  generateFishCompletion,
  CLI_SPEC,
} from './completions.js';

/**
 * Initialize all HYDRA subsystems
 */
export async function initializeHydra(config = {}) {
  const {
    enableCrashReporter = true,
    enableGracefulShutdown = true,
    enableMemoryMonitor = false,
    enableConfigHotReload = false,
    logLevel = 'info',
    colorized = true,
    configPath = null,
  } = config;

  // Initialize logger
  const { getLogger } = await import('./logger.js');
  const logger = getLogger({
    name: 'HYDRA',
    level: logLevel,
    colorized,
  });

  // Install crash reporter
  if (enableCrashReporter) {
    const { getCrashReporter } = await import('./crash-reporter.js');
    getCrashReporter().install();
    logger.debug('Crash reporter installed');
  }

  // Install graceful shutdown
  if (enableGracefulShutdown) {
    const { getGracefulShutdown } = await import('./crash-reporter.js');
    getGracefulShutdown().install();
    logger.debug('Graceful shutdown installed');
  }

  // Start memory monitor
  if (enableMemoryMonitor) {
    const { getMemoryMonitor } = await import('./benchmarks.js');
    getMemoryMonitor().start();
    logger.debug('Memory monitor started');
  }

  // Start config hot reload
  if (enableConfigHotReload && configPath) {
    const { getConfigHotReload } = await import('./config-validator.js');
    getConfigHotReload(configPath).start();
    logger.debug('Config hot reload started');
  }

  return {
    logger,
    initialized: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get HYDRA version
 */
export function getHydraVersion() {
  return '5.0.0';
}
