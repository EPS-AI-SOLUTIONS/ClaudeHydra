import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const configPath = path.join(process.cwd(), 'hydra.config.json');

const defaultConfig = {
  watchdog: {
    enabled: true,
    interval: 5000,
  },
  launcher: {
    autoStartOllama: true,
    checkUpdates: false,
  },
  permissions: {
    allowShell: true,
    allowFileWrite: true,
  },
};

console.log('🧙 Hydra Configuration Wizard');
console.log('-----------------------------');

const ask = (question, defaultVal) =>
  new Promise((resolve) => {
    rl.question(`${question} (${defaultVal}): `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });

async function runWizard() {
  const config = { ...defaultConfig };

  config.watchdog.enabled = (await ask('Enable Watchdog?', 'yes')) === 'yes';
  config.launcher.autoStartOllama = (await ask('Auto-start Ollama?', 'yes')) === 'yes';
  config.permissions.allowShell = (await ask('Allow Shell Execution?', 'yes')) === 'yes';

  const model = await ask('Preferred Code Model?', 'qwen2.5-coder:1.5b');
  config.models = { code: model };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\n✨ Configuration saved to ${configPath}`);
  rl.close();
}

runWizard();
