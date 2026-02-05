#!/usr/bin/env node
/**
 * Create Windows shortcuts for ClaudeHydra
 * Replaces create-shortcut.ps1
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Get desktop path
const DESKTOP = process.env.USERPROFILE
  ? join(process.env.USERPROFILE, 'Desktop')
  : 'C:\\Users\\BIURODOM\\Desktop';

/**
 * Create a Windows shortcut using PowerShell
 */
function createShortcut(name, targetPath, args = '', workingDir = '', iconPath = '') {
  const shortcutPath = join(DESKTOP, `${name}.lnk`);

  // Escape for PowerShell
  const escape = (s) => s.replace(/'/g, "''");

  // Build PowerShell commands with proper semicolons
  const commands = [
    `$WshShell = New-Object -comObject WScript.Shell`,
    `$Shortcut = $WshShell.CreateShortcut('${escape(shortcutPath)}')`,
    `$Shortcut.TargetPath = '${escape(targetPath)}'`,
  ];

  if (args) {
    commands.push(`$Shortcut.Arguments = '${escape(args)}'`);
  }
  if (workingDir) {
    commands.push(`$Shortcut.WorkingDirectory = '${escape(workingDir)}'`);
  }
  if (iconPath) {
    commands.push(`$Shortcut.IconLocation = '${escape(iconPath)}'`);
  }

  commands.push(`$Shortcut.Save()`);

  try {
    // Use -NoProfile to avoid PSReadLine issues
    execSync(`powershell -NoProfile -Command "${commands.join('; ')}"`, { stdio: 'pipe' });
    console.log(`Created: ${shortcutPath}`);
    return true;
  } catch (error) {
    console.error(`Failed to create ${name}: ${error.message}`);
    return false;
  }
}

// Find node.exe
function findNode() {
  try {
    const nodePath = execSync('where node', { encoding: 'utf-8' }).trim().split('\n')[0];
    return nodePath.trim();
  } catch {
    return 'node';
  }
}

// Main
const nodePath = findNode();
console.log(`Using Node: ${nodePath}`);
console.log(`Project: ${ROOT_DIR}`);
console.log('');

// Create shortcuts - both use cli-unified (default mode: swarm)
createShortcut(
  'ClaudeHydra',
  nodePath,
  `"${join(ROOT_DIR, 'src', 'cli-unified', 'index.js')}"`,
  ROOT_DIR
);

createShortcut(
  'ClaudeHydra Swarm',
  nodePath,
  `"${join(ROOT_DIR, 'src', 'cli-unified', 'index.js')}" --mode swarm`,
  ROOT_DIR
);

console.log('');
console.log('Shortcuts updated!');
