/**
 * Create desktop shortcuts for ClaudeHydra and GeminiHydra
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const desktop = join(homedir(), 'Desktop');

const shortcuts = [
  {
    name: 'ClaudeHydra',
    target: join(desktop, 'ClaudeHydra', 'start-hydra.bat'),
    workdir: join(desktop, 'ClaudeHydra'),
    description: 'ClaudeHydra - Witcher Swarm'
  },
  {
    name: 'GeminiHydra',
    target: join(desktop, 'GeminiHydra', 'GeminiHydra', 'start-hydra.bat'),
    workdir: join(desktop, 'GeminiHydra', 'GeminiHydra'),
    description: 'GeminiHydra - Witcher Swarm'
  }
];

for (const shortcut of shortcuts) {
  const lnkPath = join(desktop, `${shortcut.name}.lnk`);

  if (!existsSync(shortcut.target)) {
    console.log(`⚠️  Target not found: ${shortcut.target}`);
    continue;
  }

  const psCommand = `
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('${lnkPath.replace(/\\/g, '\\\\')}')
    $Shortcut.TargetPath = '${shortcut.target.replace(/\\/g, '\\\\')}'
    $Shortcut.WorkingDirectory = '${shortcut.workdir.replace(/\\/g, '\\\\')}'
    $Shortcut.Description = '${shortcut.description}'
    $Shortcut.Save()
  `.trim();

  try {
    execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'pipe' });
    console.log(`✅ Created: ${shortcut.name}.lnk`);
  } catch (err) {
    console.error(`❌ Failed: ${shortcut.name} - ${err.message}`);
  }
}

console.log('\\nDone!');
