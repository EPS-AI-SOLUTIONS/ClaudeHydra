#!/usr/bin/env node

/**
 * Create desktop shortcut using Node.js
 * Cross-platform compatible (Windows only for now)
 */

import { exec } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectDir = resolve(__dirname, '..');
const desktopPath = join(homedir(), 'Desktop');
const shortcutPath = join(desktopPath, 'ClaudeHydra CLI.lnk');

console.log('\n╔══════════════════════════════════════╗');
console.log('║  ClaudeHydra Shortcut Creator  ║');
console.log('╚══════════════════════════════════════╝\n');

console.log('📁 Project directory:', projectDir);
console.log('🖥️  Desktop path:', desktopPath);
console.log('🔗 Shortcut path:', shortcutPath);
console.log('');

// PowerShell command to create shortcut
const psCommand = `
$WshShell = New-Object -ComObject WScript.Shell;
$Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}');
$Shortcut.TargetPath = 'cmd.exe';
$Shortcut.Arguments = '/k cd /d "${projectDir.replace(/\\/g, '\\\\')}" && pnpm start';
$Shortcut.WorkingDirectory = '${projectDir.replace(/\\/g, '\\\\')}';
$Shortcut.Description = 'ClaudeHydra CLI - Witcher Swarm Mode';
$Shortcut.Save();
Write-Host 'OK'
`.trim();

console.log('⚙️  Creating shortcut...\n');

exec(
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`,
  (error, _stdout, stderr) => {
    if (error) {
      console.error('❌ Error creating shortcut:', error.message);
      console.error('\n💡 Try running this manually:');
      console.error(`   powershell -ExecutionPolicy Bypass -File scripts\\create-shortcut.ps1`);
      process.exit(1);
    }

    if (stderr) {
      console.warn('⚠️  Warning:', stderr);
    }

    console.log('✅ Shortcut created successfully!');
    console.log('');
    console.log('🐍 Skrót: ClaudeHydra CLI.lnk');
    console.log(`   Lokalizacja: ${desktopPath}`);
    console.log('');
    console.log('💡 Teraz możesz uruchomić ClaudeHydra przez double-click na skrócie!');
    console.log('');
  },
);
