import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const launcherPath = join(repoRoot, '_launcher.ps1');
const userArgs = process.argv.slice(2);

const log = (message) => {
  console.log(`[launcher] ${message}`);
};

const hasFile = (path) => {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const canRun = (command) => {
  const result = spawnSync(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'], {
    stdio: 'ignore'
  });
  if (result.error) return false;
  return result.status === 0;
};

const resolvePowerShell = () => {
  const candidates = process.platform === 'win32'
    ? ['powershell.exe', 'pwsh']
    : ['pwsh', 'powershell'];
  for (const cmd of candidates) {
    if (canRun(cmd)) return cmd;
  }
  return null;
};

const runFallback = () => {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  log('PowerShell not available or launcher missing; falling back to npm start.');
  const child = spawn(npmCmd, ['start'], { stdio: 'inherit', cwd: repoRoot });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (error) => {
    log(`Failed to run npm start: ${error.message}`);
    process.exit(1);
  });
};

const runLauncher = (psCommand) => {
  const args = process.platform === 'win32'
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath]
    : ['-NoProfile', '-File', launcherPath];
  if (userArgs.length) args.push(...userArgs);
  const child = spawn(psCommand, args, { stdio: 'inherit', cwd: repoRoot });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (error) => {
    log(`Failed to start PowerShell launcher: ${error.message}`);
    runFallback();
  });
};

const psCommand = resolvePowerShell();
if (!psCommand || !hasFile(launcherPath)) {
  if (!hasFile(launcherPath)) {
    log('Missing _launcher.ps1 at repo root.');
  }
  runFallback();
} else {
  runLauncher(psCommand);
}
