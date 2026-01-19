#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const bumpType = args[0] || 'patch'; // major, minor, patch

try {
  // Read current version from hydra-config.json
  const configPath = path.join(rootDir, 'hydra-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const currentVersion = config.version || '0.0.0';

  const [major, minor, patch] = currentVersion.split('.').map(Number);

  // Calculate new version
  let newVersion;
  switch (bumpType) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
  }

  console.log(`🚀 Bumping version: ${currentVersion} → ${newVersion}`);

  // Update hydra-config.json
  config.version = newVersion;
  config.lastUpdated = new Date().toISOString();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  // Update all CLI package.json files
  const cliDirs = [
    'CodexCLI',
    'DeepSeekCLI',
    'GeminiCLI',
    'GrokCLI',
    'JulesCLI'
  ];

  for (const cliDir of cliDirs) {
    const pkgPath = path.join(rootDir, cliDir, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      pkg.version = newVersion;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`  ✅ Updated ${cliDir}/package.json`);
    } catch (err) {
      console.warn(`  ⚠️ Could not update ${cliDir}/package.json: ${err.message}`);
    }
  }

  // Update hydra-launcher package.json
  const launcherPath = path.join(rootDir, 'hydra-launcher', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(launcherPath, 'utf8'));
    pkg.version = newVersion;
    writeFileSync(launcherPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`  ✅ Updated hydra-launcher/package.json`);
  } catch (err) {
    console.warn(`  ⚠️ Could not update hydra-launcher/package.json: ${err.message}`);
  }

  // Git operations
  try {
    execSync('git add hydra-config.json */package.json', { cwd: rootDir });
    execSync(`git commit -m "chore(release): v${newVersion}"`, { cwd: rootDir });
    execSync(`git tag v${newVersion}`, { cwd: rootDir });

    console.log(`\n✅ Released v${newVersion}`);
    console.log('📝 Next steps:');
    console.log('   git push');
    console.log('   git push --tags');
  } catch (err) {
    if (err.message.includes('nothing to commit')) {
      console.log('\n⚠️ No changes to commit');
    } else {
      throw err;
    }
  }
} catch (error) {
  console.error(`\n❌ Release failed: ${error.message}`);
  process.exit(1);
}
