/**
 * HYDRA LAUNCHER v5.0
 * Pure Node.js launcher with full HYDRA module integration
 *
 * Features:
 * - ASCII banner with splash screen
 * - Config file support with hot-reload
 * - Integrated doctor diagnostics (--doctor)
 * - Watchdog mode (--watchdog)
 * - Network diagnostics (--ping)
 * - Model registry & stats (--models, --stats)
 * - GPU information (--gpu)
 * - Crash reports (--crashes)
 * - Startup benchmarks (--benchmarks)
 * - Shell completions (--completions)
 * - Smart Windows Terminal detection
 * - Stale lock cleanup
 * - Ollama health check & auto-start
 * - Graceful shutdown handling
 */

import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  unlinkSync,
  statSync,
  accessSync,
  constants,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHealth } from '../src/ollama-client.js';
import { loadConfigWithCli, CONFIG_PATH } from '../src/hydra-config.js';

// Import HYDRA modules
import {
  // Colors & styling
  createStyler,
  COLORS,
  // Logging
  Logger,
  LOG_LEVELS,
  // Progress indicators
  Spinner,
  SplashScreen,
  // Benchmarks
  StartupBenchmark,
  getMetricsCollector,
  // Crash reporting
  getCrashReporter,
  getGracefulShutdown,
  // Config validation
  getConfigValidator,
  // Network
  getNetworkDiagnostics,
  // Model registry
  getModelRegistry,
  getGPUManager,
  // Completions
  getCompletion,
  CompletionsManager,
  // Version
  getHydraVersion,
} from '../src/hydra/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LAUNCHER_PS1 = join(REPO_ROOT, '_launcher.ps1');

// Initialize startup benchmark
const benchmark = new StartupBenchmark();
benchmark.start();
benchmark.mark('imports');

// Load configuration
let config;
try {
  config = loadConfigWithCli();
  benchmark.mark('config');
} catch (err) {
  console.error(`[CONFIG] Failed to load config: ${err.message}`);
  process.exit(1);
}

// Initialize styler based on config
const useColors = config.logging.colorized;
const styler = createStyler({ enabled: useColors });
const c = useColors ? COLORS : Object.fromEntries(
  Object.keys(COLORS).map(k => [k, ''])
);

// Initialize logger
const logger = new Logger({
  level: config.logging.level,
  timestamps: config.logging.timestamps,
  colorized: useColors,
  prefix: 'HYDRA',
});

// Initialize crash reporter
const crashReporter = getCrashReporter({
  crashDir: join(REPO_ROOT, 'crashes'),
  enabled: true,
});
crashReporter.setContext('launcher', 'hydra-launcher');
crashReporter.setContext('version', getHydraVersion());
crashReporter.install();

// Initialize graceful shutdown
const shutdown = getGracefulShutdown();
shutdown.install();

benchmark.mark('init');

// ═══════════════════════════════════════════════════════════════════
// ASCII Banner
// ═══════════════════════════════════════════════════════════════════
function showBanner(yoloMode = false) {
  if (!config.launcher.showBanner) return;

  // Get version from package.json
  let version = '5.0';
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'));
    version = pkg.version || version;
  } catch {
    /* ignore */
  }

  const banner = `
${c.cyan}${c.bold}
    ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗
    ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗
    ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║
    ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║
    ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║
    ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝${c.reset}
${c.dim}    ─────────────────────────────────────────
    Three-Headed Beast │ Launcher v${version}
    Ollama + Gemini CLI + MCP Servers${c.reset}
`;

  const yoloBanner = `
${c.red}${c.bold}
    ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗
    ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗
    ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║
    ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║
    ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║
    ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝${c.reset}
${c.bgRed}${c.white}${c.bold}  ⚠ YOLO MODE - SAFETY DISABLED ⚠  ${c.reset}
${c.dim}    ─────────────────────────────────────────${c.reset}
`;

  console.log(yoloMode ? yoloBanner : banner);
}

// ═══════════════════════════════════════════════════════════════════
// Show Config (--show-config flag)
// ═══════════════════════════════════════════════════════════════════
function showConfig() {
  console.log(`\n${c.cyan}${c.bold}Current Configuration${c.reset}\n`);
  console.log(`${c.dim}Config file: ${CONFIG_PATH}${c.reset}`);
  console.log(`${c.dim}─────────────────────────────────────────${c.reset}\n`);
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════
// Doctor Diagnostics
// ═══════════════════════════════════════════════════════════════════
const diagnostics = { ok: 0, warn: 0, fail: 0 };

function diagOk(msg) {
  diagnostics.ok++;
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

function diagWarn(msg) {
  diagnostics.warn++;
  console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
}

function diagFail(msg) {
  diagnostics.fail++;
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
}

function hasPath(path) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function canRunPowerShell(command) {
  const result = spawnSync(
    command,
    ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'],
    { stdio: 'ignore' }
  );
  return !result.error && result.status === 0;
}

function resolvePowerShell() {
  const candidates =
    process.platform === 'win32'
      ? ['pwsh', 'powershell.exe']
      : ['pwsh', 'powershell'];
  for (const cmd of candidates) {
    if (canRunPowerShell(cmd)) return cmd;
  }
  return null;
}

async function runDiagnostics() {
  console.log(`\n${c.cyan}${c.bold}System Diagnostics${c.reset}\n`);

  // Node.js version
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 20) {
    diagOk(`Node.js ${process.versions.node} (>=20)`);
  } else {
    diagFail(`Node.js ${process.versions.node} (requires >=20)`);
  }

  // Critical files
  hasPath(join(REPO_ROOT, 'package.json'))
    ? diagOk('package.json present')
    : diagFail('package.json missing');

  hasPath(join(REPO_ROOT, 'src', 'server.js'))
    ? diagOk('src/server.js present')
    : diagFail('src/server.js missing');

  hasPath(LAUNCHER_PS1)
    ? diagOk('_launcher.ps1 present')
    : diagWarn('_launcher.ps1 missing (fallback to npm start)');

  hasPath(join(REPO_ROOT, 'scripts', 'hydra-launcher.js'))
    ? diagOk('scripts/hydra-launcher.js present')
    : diagFail('scripts/hydra-launcher.js missing');

  // Config
  hasPath(CONFIG_PATH)
    ? diagOk('hydra.config.json present')
    : diagWarn('hydra.config.json missing (using defaults)');

  // Config validation
  const validator = getConfigValidator();
  const validation = validator.validateFile(CONFIG_PATH);
  if (validation.valid) {
    diagOk('Config schema valid');
  } else {
    diagWarn(`Config validation: ${validation.errors[0]?.message || 'unknown error'}`);
  }

  // Dependencies
  hasPath(join(REPO_ROOT, 'node_modules'))
    ? diagOk('node_modules present')
    : diagWarn('node_modules missing (run npm install)');

  // Environment
  hasPath(join(REPO_ROOT, '.env'))
    ? diagOk('.env present')
    : diagWarn('.env missing (copy .env.example)');

  process.env.GEMINI_API_KEY
    ? diagOk('GEMINI_API_KEY set')
    : diagWarn('GEMINI_API_KEY not set');

  // PowerShell
  const psCmd = resolvePowerShell();
  psCmd
    ? diagOk(`PowerShell available (${psCmd})`)
    : diagWarn('PowerShell not available');

  // Windows Terminal
  const wtPath = findWindowsTerminal();
  wtPath
    ? diagOk(`Windows Terminal found: ${wtPath}`)
    : diagWarn('Windows Terminal not found (will use PowerShell)');

  // Ollama
  const health = await checkHealth();
  if (health.available) {
    const modelCount = health.models?.length || 0;
    diagOk(`Ollama reachable at ${health.host} (${modelCount} models)`);

    // Check if default model exists
    const defaultModel = config.ollama.defaultModel;
    const hasDefaultModel = health.models?.some((m) =>
      m.toLowerCase().startsWith(defaultModel.toLowerCase())
    );
    if (hasDefaultModel) {
      diagOk(`Default model '${defaultModel}' available`);
    } else {
      diagWarn(`Default model '${defaultModel}' not found`);
    }
  } else {
    diagFail(`Ollama not reachable: ${health.error || 'unknown'}`);
  }

  // HYDRA modules
  diagOk(`HYDRA modules v${getHydraVersion()} loaded`);

  // Summary
  console.log(`\n${c.dim}─────────────────────────────────────────${c.reset}`);
  if (diagnostics.fail > 0) {
    console.log(
      `${c.red}${c.bold}Result: ${diagnostics.fail} error(s), ${diagnostics.warn} warning(s)${c.reset}`
    );
    return false;
  } else if (diagnostics.warn > 0) {
    console.log(
      `${c.yellow}${c.bold}Result: ${diagnostics.warn} warning(s)${c.reset}`
    );
    return true;
  } else {
    console.log(`${c.green}${c.bold}Result: All checks passed!${c.reset}`);
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Network Diagnostics (--ping)
// ═══════════════════════════════════════════════════════════════════
async function runNetworkDiagnostics() {
  console.log(`\n${c.cyan}${c.bold}Network Diagnostics${c.reset}\n`);

  const spinner = new Spinner({ text: 'Running network checks...' });
  spinner.start();

  const network = getNetworkDiagnostics({
    ollamaHost: config.ollama.host,
  });

  const results = await network.runAll();
  spinner.stop();

  // Format output
  console.log(network.formatReport({
    ok: () => `${c.green}✓${c.reset}`,
    fail: () => `${c.red}✗${c.reset}`,
  }));

  return results.summary.failed === 0;
}

// ═══════════════════════════════════════════════════════════════════
// Model Registry (--models, --stats)
// ═══════════════════════════════════════════════════════════════════
async function showModels() {
  const registry = getModelRegistry();

  console.log(`\n${c.cyan}${c.bold}Model Registry${c.reset}`);

  // Get available models from Ollama
  const spinner = new Spinner({ text: 'Fetching models...' });
  spinner.start();

  try {
    const available = await registry.getAvailable();
    spinner.stop();

    console.log(registry.formatList(available));
    console.log(registry.formatAliases());
  } catch (error) {
    spinner.stop();
    console.log(`${c.red}Failed to fetch models: ${error.message}${c.reset}`);
  }
}

async function showStats() {
  const registry = getModelRegistry();

  console.log(`\n${c.cyan}${c.bold}Model Statistics${c.reset}\n`);

  const allStats = registry.getAllStats();

  if (Object.keys(allStats).length === 0) {
    console.log(`${c.dim}No usage statistics recorded yet.${c.reset}\n`);
    return;
  }

  console.log('─'.repeat(70));
  console.log(
    `  ${'Model'.padEnd(25)} ${'Calls'.padStart(8)} ${'Tokens'.padStart(10)} ${'Cache Hit'.padStart(10)}`
  );
  console.log('─'.repeat(70));

  for (const [model, stat] of Object.entries(allStats)) {
    const cacheHitRate =
      stat.totalCalls > 0
        ? Math.round((stat.cacheHits / stat.totalCalls) * 100) + '%'
        : 'N/A';
    console.log(
      `  ${model.padEnd(25)} ${String(stat.totalCalls).padStart(8)} ${String(stat.totalTokens).padStart(10)} ${cacheHitRate.padStart(10)}`
    );
  }

  console.log('─'.repeat(70));

  // Cache summary
  const cacheStats = registry.getCacheStats();
  console.log(
    `\n  Cache: ${cacheStats.hits} hits / ${cacheStats.misses} misses (${cacheStats.hitRate}% hit rate)`
  );
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════
// GPU Information (--gpu)
// ═══════════════════════════════════════════════════════════════════
async function showGPU() {
  console.log(`\n${c.cyan}${c.bold}GPU Detection${c.reset}`);

  const spinner = new Spinner({ text: 'Detecting GPUs...' });
  spinner.start();

  const gpuManager = getGPUManager();
  await gpuManager.detect();

  spinner.stop();

  console.log(gpuManager.formatInfo());

  if (gpuManager.isMultiGpu()) {
    console.log(`${c.green}Multi-GPU support available${c.reset}\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Crash Reports (--crashes)
// ═══════════════════════════════════════════════════════════════════
function showCrashes() {
  console.log(`\n${c.cyan}${c.bold}Crash Reports${c.reset}`);
  console.log(crashReporter.formatList());
}

// ═══════════════════════════════════════════════════════════════════
// Benchmarks (--benchmarks)
// ═══════════════════════════════════════════════════════════════════
function showBenchmarks() {
  console.log(`\n${c.cyan}${c.bold}Startup Benchmarks${c.reset}\n`);

  const phases = benchmark.getPhases();
  const total = benchmark.getTotal();

  console.log('─'.repeat(50));
  console.log(`  ${'Phase'.padEnd(20)} ${'Duration'.padStart(12)}`);
  console.log('─'.repeat(50));

  for (const [name, duration] of Object.entries(phases)) {
    const ms = `${duration.toFixed(2)}ms`;
    const bar = '█'.repeat(Math.min(Math.round(duration / 10), 30));
    console.log(`  ${name.padEnd(20)} ${ms.padStart(12)} ${c.cyan}${bar}${c.reset}`);
  }

  console.log('─'.repeat(50));
  console.log(`  ${'Total'.padEnd(20)} ${total.toFixed(2).padStart(12)}ms`);
  console.log('');

  // Memory info
  const mem = process.memoryUsage();
  console.log(`${c.dim}Memory: ${Math.round(mem.heapUsed / 1024 / 1024)}MB heap, ${Math.round(mem.rss / 1024 / 1024)}MB RSS${c.reset}\n`);
}

// ═══════════════════════════════════════════════════════════════════
// Shell Completions (--completions)
// ═══════════════════════════════════════════════════════════════════
function showCompletions(shell) {
  if (!shell || shell === true) {
    // Show all available
    console.log(`\n${c.cyan}${c.bold}Shell Completions${c.reset}\n`);
    console.log('Available shells: bash, zsh, powershell, fish\n');
    console.log('Usage: hydra --completions <shell>\n');
    console.log('Example: hydra --completions bash > ~/.bash_completion.d/hydra');
    console.log('         hydra --completions powershell >> $PROFILE\n');
    return;
  }

  try {
    const script = getCompletion(shell);
    console.log(script);
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    console.log('Available shells: bash, zsh, powershell, fish');
  }
}

// ═══════════════════════════════════════════════════════════════════
// Stale Lock Cleanup
// ═══════════════════════════════════════════════════════════════════
function cleanStaleLocks() {
  if (!config.launcher.cleanLocksOnStart) return;

  const lockPaths = config.paths.lockDirs;
  let cleaned = 0;

  for (const lockPath of lockPaths) {
    if (!existsSync(lockPath)) continue;
    try {
      const files = readdirSync(lockPath);
      for (const file of files) {
        const filePath = join(lockPath, file);
        try {
          if (statSync(filePath).isFile()) {
            unlinkSync(filePath);
            cleaned++;
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (cleaned > 0) {
    logger.debug(`Cleaned ${cleaned} stale lock file(s)`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Ollama Management
// ═══════════════════════════════════════════════════════════════════
async function ensureOllama() {
  if (!config.features.autoStartOllama) {
    logger.debug('Auto-start Ollama disabled in config');
    return true;
  }

  logger.info('Checking Ollama...');

  const health = await checkHealth();
  if (health.available) {
    const modelCount = health.models?.length || 0;
    logger.info(`Ollama ready (${modelCount} models)`);
    return true;
  }

  logger.warn('Ollama not responding. Starting...');

  // Start Ollama in background using cmd.exe to avoid DEP0190
  const ollama = spawn('cmd.exe', ['/c', 'start', '/b', 'ollama', 'serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  ollama.unref();

  // Wait for Ollama to become ready
  const maxWait = config.ollama.startupTimeout;
  const interval = config.ollama.healthCheckInterval;
  let waited = 0;

  while (waited < maxWait) {
    await new Promise((r) => setTimeout(r, interval));
    waited += interval;

    const recheck = await checkHealth();
    if (recheck.available) {
      logger.info('Ollama started successfully');
      return true;
    }
  }

  logger.warn('Ollama timeout - may still be starting');
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// Windows Terminal Detection (improved)
// ═══════════════════════════════════════════════════════════════════
function findWindowsTerminal() {
  if (!config.launcher.preferWindowsTerminal) {
    return null;
  }

  // 1. Check PATH first (user may have custom install)
  const pathCheck = spawnSync('where', ['wt.exe'], { stdio: 'pipe' });
  if (!pathCheck.error && pathCheck.status === 0) {
    const wtPath = pathCheck.stdout.toString().trim().split('\n')[0];
    if (wtPath && existsSync(wtPath)) {
      return wtPath;
    }
  }

  // 2. Standard WindowsApps location
  const localAppData = process.env.LOCALAPPDATA || '';
  const standardPath = join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe');
  if (existsSync(standardPath)) {
    return standardPath;
  }

  // 3. Program Files locations
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 =
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const alternatePaths = [
    join(programFiles, 'Windows Terminal', 'wt.exe'),
    join(programFilesX86, 'Windows Terminal', 'wt.exe'),
  ];

  for (const path of alternatePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Terminal Launcher
// ═══════════════════════════════════════════════════════════════════
function launchTerminal(wtPath, yoloMode) {
  const psArgs = [
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    LAUNCHER_PS1,
  ];

  if (yoloMode) {
    psArgs.push('-Yolo');
    logger.warn('YOLO MODE ENABLED');
  }

  if (wtPath) {
    logger.info('Launching Windows Terminal...');

    const wtArgs = [
      '-p',
      config.launcher.terminalProfile,
      '--title',
      'Gemini CLI',
      'powershell.exe',
      ...psArgs,
    ];

    const proc = spawn(wtPath, wtArgs, {
      detached: true,
      stdio: 'ignore',
      cwd: REPO_ROOT,
      windowsHide: false,
    });
    proc.unref();
  } else {
    logger.info('Launching PowerShell...');

    const proc = spawn('powershell.exe', psArgs, {
      detached: true,
      stdio: 'ignore',
      cwd: REPO_ROOT,
      windowsHide: false,
    });
    proc.unref();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Watchdog Mode
// ═══════════════════════════════════════════════════════════════════
async function runWatchdog() {
  const { checkInterval, maxRestarts, restartDelay, notifyOnRestart } =
    config.watchdog;

  console.log(`\n${c.magenta}${c.bold}Watchdog Mode Active${c.reset}`);
  console.log(
    `${c.dim}Monitoring Ollama health every ${checkInterval / 1000} seconds...${c.reset}`
  );
  console.log(`${c.dim}Max restarts: ${maxRestarts}${c.reset}`);
  console.log(`${c.dim}Press Ctrl+C to stop${c.reset}\n`);

  let restartCount = 0;

  const monitor = async () => {
    const health = await checkHealth();
    const timestamp = new Date().toLocaleTimeString();

    if (health.available) {
      const models = health.models?.length || 0;
      process.stdout.write(
        `\r${c.dim}[${timestamp}]${c.reset} ${c.green}●${c.reset} Ollama OK (${models} models)    `
      );
      restartCount = 0; // Reset on success
    } else {
      if (notifyOnRestart) {
        console.log(
          `\n${c.dim}[${timestamp}]${c.reset} ${c.red}●${c.reset} Ollama DOWN - attempting restart (${restartCount + 1}/${maxRestarts})`
        );
      }

      if (restartCount < maxRestarts) {
        restartCount++;
        spawn('cmd.exe', ['/c', 'start', '/b', 'ollama', 'serve'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }).unref();

        // Wait for restart
        await new Promise((r) => setTimeout(r, restartDelay));
      } else {
        console.log(
          `${c.red}Max restarts reached. Manual intervention required.${c.reset}`
        );
      }
    }
  };

  // Initial check
  await monitor();

  // Set up interval
  setInterval(monitor, checkInterval);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log(`\n${c.yellow}Watchdog stopped.${c.reset}`);
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Help Text
// ═══════════════════════════════════════════════════════════════════
function showHelp() {
  const version = getHydraVersion();

  console.log(`
${c.cyan}${c.bold}HYDRA Launcher v${version}${c.reset}
Three-Headed Beast - Ollama + Gemini CLI + MCP

${c.bold}USAGE:${c.reset}
  hydra [options]

${c.bold}COMMANDS:${c.reset}
  ${c.cyan}--doctor, -d${c.reset}       Run system diagnostics
  ${c.cyan}--watchdog, -w${c.reset}     Monitor Ollama health continuously
  ${c.cyan}--ping${c.reset}             Run network diagnostics
  ${c.cyan}--models${c.reset}           List available models
  ${c.cyan}--stats${c.reset}            Show model usage statistics
  ${c.cyan}--gpu${c.reset}              Show GPU information
  ${c.cyan}--crashes${c.reset}          List crash reports
  ${c.cyan}--benchmarks${c.reset}       Show startup benchmarks
  ${c.cyan}--completions${c.reset}      Generate shell completions
  ${c.cyan}--show-config${c.reset}      Show current configuration
  ${c.cyan}--version, -v${c.reset}      Show version
  ${c.cyan}--help, -h${c.reset}         Show this help message

${c.bold}OPTIONS:${c.reset}
  ${c.cyan}--yolo${c.reset}             Enable YOLO mode (disable safety)
  ${c.cyan}--no-banner${c.reset}        Hide ASCII banner
  ${c.cyan}--no-color${c.reset}         Disable colors
  ${c.cyan}--portable${c.reset}         Run in portable mode
  ${c.cyan}--host <URL>${c.reset}       Override Ollama host URL
  ${c.cyan}--model <NAME>${c.reset}     Override default model
  ${c.cyan}--log-level <LVL>${c.reset}  Set log level (debug|info|warn|error)

${c.bold}EXAMPLES:${c.reset}
  hydra                    Launch normally
  hydra --doctor           Run diagnostics
  hydra --watchdog         Start monitoring mode
  hydra --ping             Test network connectivity
  hydra --models           Show available models
  hydra --gpu              Show GPU info
  hydra --completions bash Generate bash completions

${c.dim}Config file: ${CONFIG_PATH}${c.reset}
`);
}

// ═══════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const yoloMode = config.launcher.yoloMode;
  const doctorMode = args.includes('--doctor') || args.includes('-d');
  const watchdogMode =
    config.watchdog.enabled ||
    args.includes('--watchdog') ||
    args.includes('-w');
  const showConfigMode = args.includes('--show-config');
  const versionMode = args.includes('--version') || args.includes('-v');
  const helpMode = args.includes('--help') || args.includes('-h');
  const pingMode = args.includes('--ping');
  const modelsMode = args.includes('--models');
  const statsMode = args.includes('--stats');
  const gpuMode = args.includes('--gpu');
  const crashesMode = args.includes('--crashes');
  const benchmarksMode = args.includes('--benchmarks');
  const completionsMode = args.includes('--completions');

  benchmark.mark('args');

  // Help mode
  if (helpMode) {
    showHelp();
    process.exit(0);
  }

  // Version mode
  if (versionMode) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')
      );
      console.log(`HYDRA Launcher v${pkg.version} (modules v${getHydraVersion()})`);
    } catch {
      console.log(`HYDRA Launcher v5.0 (modules v${getHydraVersion()})`);
    }
    process.exit(0);
  }

  // Show banner
  showBanner(yoloMode);

  // Show config mode
  if (showConfigMode) {
    showConfig();
    process.exit(0);
  }

  // Doctor mode
  if (doctorMode) {
    benchmark.mark('pre-doctor');
    const ok = await runDiagnostics();
    benchmark.end();
    process.exit(ok ? 0 : 1);
  }

  // Network diagnostics mode
  if (pingMode) {
    benchmark.mark('pre-ping');
    const ok = await runNetworkDiagnostics();
    benchmark.end();
    process.exit(ok ? 0 : 1);
  }

  // Models mode
  if (modelsMode) {
    benchmark.mark('pre-models');
    await showModels();
    benchmark.end();
    process.exit(0);
  }

  // Stats mode
  if (statsMode) {
    await showStats();
    process.exit(0);
  }

  // GPU mode
  if (gpuMode) {
    benchmark.mark('pre-gpu');
    await showGPU();
    benchmark.end();
    process.exit(0);
  }

  // Crashes mode
  if (crashesMode) {
    showCrashes();
    process.exit(0);
  }

  // Benchmarks mode
  if (benchmarksMode) {
    benchmark.mark('pre-benchmarks');
    benchmark.end();
    showBenchmarks();
    process.exit(0);
  }

  // Completions mode
  if (completionsMode) {
    const shellIndex = args.indexOf('--completions');
    const shell = args[shellIndex + 1];
    showCompletions(shell);
    process.exit(0);
  }

  // Watchdog mode - run continuous monitoring
  if (watchdogMode) {
    await runWatchdog();
    return; // Never exits
  }

  // Normal launch sequence
  logger.info('Initializing...');
  benchmark.mark('pre-launch');

  // 1. Check _launcher.ps1
  if (!existsSync(LAUNCHER_PS1)) {
    logger.error(`_launcher.ps1 not found`);
    logger.error(`Expected at: ${LAUNCHER_PS1}`);
    process.exit(1);
  }

  // 2. Clean stale locks
  cleanStaleLocks();
  benchmark.mark('locks');

  // 3. Ensure Ollama
  await ensureOllama();
  benchmark.mark('ollama');

  // 4. Find Windows Terminal
  const wtPath = findWindowsTerminal();
  benchmark.mark('terminal');

  // 5. Launch
  console.log('');
  launchTerminal(wtPath, yoloMode);

  benchmark.end();
  logger.info('Bootstrap complete. Terminal spawned.');

  // Log benchmark summary
  logger.debug(`Startup time: ${benchmark.getTotal().toFixed(0)}ms`);
  console.log('');

  // Brief delay then exit bootstrap
  setTimeout(() => process.exit(0), 500);
}

// Register shutdown handler
shutdown.register('cleanup', () => {
  logger.debug('Shutdown cleanup complete');
}, 1);

// Run
main().catch((err) => {
  crashReporter.report(err, { phase: 'main' });
  logger.error(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
