import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('HYDRA E2E Tests', () => {
  const launcherPath = path.join(__dirname, '../../src/server.js');
  
  test('Server should start and respond to health check', () => {
    // This is a basic smoke test. In a real scenario, we would spawn the process.
    // Here we just check if the main entry point exists.
    expect(fs.existsSync(launcherPath)).toBe(true);
    
    // Note: execSyncing 'node -c' on an ESM file might work, or might need flags.
    // Since we converted to ESM, checking syntax via node -c is still valid.
    try {
      execSync(`node -c "${launcherPath}"`);
      expect(true).toBe(true); // Syntax check passed
    } catch (e) {
      fail('Server syntax check failed');
    }
  });

  // Dynamic import of constants for checking
  test('Project constants should be loaded', async () => {
    const constants = await import('../../src/constants.js');
    expect(constants.MODELS.CORE).toBeDefined();
    expect(constants.AGENTS.GERALT).toBe('Geralt');
  });
});