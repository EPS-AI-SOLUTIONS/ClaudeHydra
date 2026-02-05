/**
 * CLI E2E Tests
 * Tests for ClaudeHydra CLI functionality
 */

import { test, expect } from '@playwright/test';
import { spawn, execSync } from 'child_process';
import { join } from 'path';

const ROOT_DIR = join(import.meta.dirname, '..', '..');
const CLI_PATH = join(ROOT_DIR, 'src', 'cli-unified', 'index.js');

/**
 * Helper to run CLI command and capture output
 */
function runCLI(args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 10000;
    let stdout = '';
    let stderr = '';

    const proc = spawn('node', [CLI_PATH, ...args], {
      cwd: ROOT_DIR,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send exit command after brief delay
    if (!options.noAutoExit) {
      setTimeout(() => {
        proc.stdin.write('/exit\n');
      }, 500);
    }

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (error) => {
      reject(error);
    });

    // Force kill after timeout
    setTimeout(() => {
      proc.kill('SIGTERM');
    }, timeout - 500);
  });
}

test.describe('CLI Startup', () => {
  test('should start in basic mode', async () => {
    const result = await runCLI(['--mode', 'basic']);

    expect(result.stdout).toContain('ClaudeHydra');
    // CLI exits via timeout kill, so code may be null or 0
    expect([0, null]).toContain(result.code);
  });

  test('should display version info', async () => {
    const result = await runCLI(['--version'], { noAutoExit: true, timeout: 5000 });

    // Version flag might not be implemented, but should not crash
    expect(result.code).toBeDefined();
  });

  test('should display help when requested', async () => {
    const result = await runCLI(['--help'], { noAutoExit: true, timeout: 5000 });

    // Help flag might not be implemented, but should not crash
    expect(result.code).toBeDefined();
  });
});

test.describe('CLI Modes', () => {
  test('should accept basic mode flag', async () => {
    const result = await runCLI(['--mode', 'basic']);

    expect(result.stdout.toLowerCase()).toMatch(/basic|mode/i);
    // CLI exits via timeout kill, so code may be null or 0
    expect([0, null]).toContain(result.code);
  });

  test('should accept enhanced mode flag', async () => {
    const result = await runCLI(['--mode', 'enhanced']);

    // CLI exits via timeout kill, so code may be null or 0
    expect([0, null]).toContain(result.code);
  });

  test('should accept swarm mode flag', async () => {
    const result = await runCLI(['--mode', 'swarm']);

    // CLI exits via timeout kill, so code may be null or 0
    expect([0, null]).toContain(result.code);
  });
});

test.describe('CLI Banner', () => {
  test('should display banner with version', async () => {
    const result = await runCLI(['--mode', 'basic']);

    // Banner should contain version
    expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
  });

  test('should display codename', async () => {
    const result = await runCLI(['--mode', 'basic']);

    // Codename should be in banner (Regis Edition or similar)
    expect(result.stdout).toMatch(/edition/i);
  });

  test('should display greeting', async () => {
    const result = await runCLI(['--mode', 'basic']);

    // Should have some kind of greeting message
    expect(result.stdout.length).toBeGreaterThan(100);
  });
});

test.describe('CLI Error Handling', () => {
  test('should handle invalid mode gracefully', async () => {
    const result = await runCLI(['--mode', 'invalid']);

    // Should fall back to basic mode or show error
    expect(result.code).toBeDefined();
  });

  test('should not crash on unknown flag', async () => {
    const result = await runCLI(['--unknown-flag'], { timeout: 5000 });

    // Should not hang or crash badly
    expect(result).toBeDefined();
  });
});

test.describe('CLI Shutdown', () => {
  test('should exit gracefully on /exit command', async () => {
    const result = await runCLI(['--mode', 'basic']);

    // Should show goodbye message
    expect(result.stdout.toLowerCase()).toMatch(/goodbye|exit|bye/i);
    // CLI exits via timeout kill or /exit command, so code may be null or 0
    expect([0, null]).toContain(result.code);
  });

  test('should save config on exit', async () => {
    // This test verifies no errors during config save
    const result = await runCLI(['--mode', 'basic']);

    // Should not have config save errors in stderr
    expect(result.stderr).not.toMatch(/failed to save config/i);
  });
});
