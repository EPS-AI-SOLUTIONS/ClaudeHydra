#!/usr/bin/env node

/**
 * Create both desktop shortcuts (Standard + Verbose) using Node.js
 */

import { exec } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectDir = resolve(__dirname, '..');
const desktopPath = join(homedir(), 'Desktop');

console.log('\n╔══════════════════════════════════════╗');
console.log('║  ClaudeHydra Shortcut Creator  ║');
console.log('║      Standard + Verbose        ║');
console.log('╚══════════════════════════════════════╝\n');

const shortcuts = [
  {
    name: 'ClaudeHydra CLI.lnk',
    args: `/k cd /d "${projectDir}" && pnpm hydra`,
    desc: 'ClaudeHydra CLI - Witcher Swarm Mode',
    emoji: '🐍',
  },
  {
    name: 'ClaudeHydra CLI (Verbose).lnk',
    args: `/k cd /d "${projectDir}" && pnpm hydra --verbose`,
    desc: 'ClaudeHydra CLI - Swarm Mode with Debug Logging',
    emoji: '🔍',
  },
];

let completed = 0;
const errors = [];

shortcuts.forEach((shortcut, index) => {
  const shortcutPath = join(desktopPath, shortcut.name);

  const psCommand = `
$WshShell = New-Object -ComObject WScript.Shell;
$Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}');
$Shortcut.TargetPath = 'cmd.exe';
$Shortcut.Arguments = '${shortcut.args.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}';
$Shortcut.WorkingDirectory = '${projectDir.replace(/\\/g, '\\\\')}';
$Shortcut.Description = '${shortcut.desc}';
$Shortcut.Save();
Write-Host 'OK'
`.trim();

  console.log(`[${index + 1}/${shortcuts.length}] Tworzę: ${shortcut.name}...`);

  exec(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`,
    (error, _stdout, _stderr) => {
      completed++;

      if (error) {
        console.error(`      ✗ Błąd: ${error.message}`);
        errors.push(shortcut.name);
      } else {
        console.log(`      ✓ ${shortcut.emoji} ${shortcut.name}`);
      }

      // When all done
      if (completed === shortcuts.length) {
        console.log('');
        console.log('══════════════════════════════════════');
        console.log('');

        if (errors.length === 0) {
          console.log('✅ Gotowe! Skróty utworzone na pulpicie:');
          console.log('');
          console.log('   🐍 ClaudeHydra CLI.lnk');
          console.log('      (Standardowy Swarm Mode)');
          console.log('');
          console.log('   🔍 ClaudeHydra CLI (Verbose).lnk');
          console.log('      (Swarm Mode + Debug Logs)');
          console.log('');
          console.log('💡 Verbose mode pokazuje:');
          console.log('     - Wybór agenta i scoring');
          console.log('     - Parametry Ollama API');
          console.log('     - Czas wykonania query');
          console.log('     - MCP tool calls');
          console.log('');
        } else {
          console.error(`❌ ${errors.length} skrótów nie zostało utworzonych:`);
          errors.forEach((name) => console.error(`   - ${name}`));
          console.log('');
          console.log('💡 Spróbuj uruchomić jako administrator lub:');
          console.log('   Double-click na: create-both-shortcuts.vbs');
          process.exit(1);
        }
      }
    },
  );
});
