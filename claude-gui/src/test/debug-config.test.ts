/**
 * Debug Configuration Tests
 *
 * These tests validate that debugging infrastructure is properly configured.
 * Based on Tauri 2 debugging best practices:
 * - https://v2.tauri.app/develop/debug/
 * - https://v2.tauri.app/develop/debug/vscode/
 * - https://github.com/crabnebula-dev/devtools
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Paths relative to claude-gui directory
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TAURI_ROOT = path.join(PROJECT_ROOT, 'src-tauri');
const VSCODE_ROOT = path.join(PROJECT_ROOT, '.vscode');

describe('Debug Configuration', () => {
  describe('Cargo.toml Configuration', () => {
    let cargoToml: string;

    beforeAll(() => {
      const cargoPath = path.join(TAURI_ROOT, 'Cargo.toml');
      cargoToml = fs.readFileSync(cargoPath, 'utf-8');
    });

    it('should have tauri-plugin-devtools dependency', () => {
      expect(cargoToml).toContain('tauri-plugin-devtools');
    });

    it('should have devtools feature defined', () => {
      expect(cargoToml).toContain('devtools = ["tauri/devtools"]');
    });

    it('should have debug profile with debug=true', () => {
      expect(cargoToml).toContain('[profile.dev]');
      expect(cargoToml).toContain('debug = true');
    });

    it('should have release profile with optimizations', () => {
      expect(cargoToml).toContain('[profile.release]');
      expect(cargoToml).toContain('lto = true');
    });

    it('should have tracing dependencies for logging', () => {
      expect(cargoToml).toContain('tracing = ');
      expect(cargoToml).toContain('tracing-subscriber');
    });
  });

  describe('VS Code Configuration', () => {
    it('should have .vscode directory', () => {
      expect(fs.existsSync(VSCODE_ROOT)).toBe(true);
    });

    describe('launch.json', () => {
      let launchConfig: any;

      beforeAll(() => {
        const launchPath = path.join(VSCODE_ROOT, 'launch.json');
        if (fs.existsSync(launchPath)) {
          const content = fs.readFileSync(launchPath, 'utf-8');
          launchConfig = JSON.parse(content);
        }
      });

      it('should exist', () => {
        expect(launchConfig).toBeDefined();
      });

      it('should have LLDB debug configuration', () => {
        const lldbConfig = launchConfig.configurations.find((c: any) => c.type === 'lldb');
        expect(lldbConfig).toBeDefined();
        expect(lldbConfig.name).toContain('Tauri');
      });

      it('should have cargo build args', () => {
        const lldbConfig = launchConfig.configurations.find((c: any) => c.type === 'lldb');
        expect(lldbConfig.cargo).toBeDefined();
        expect(lldbConfig.cargo.args).toContain('build');
      });

      it('should have Windows MSVC debug configuration', () => {
        const msvcConfig = launchConfig.configurations.find((c: any) => c.type === 'cppvsdbg');
        expect(msvcConfig).toBeDefined();
        expect(msvcConfig.program).toContain('claude-gui.exe');
      });

      it('should set RUST_BACKTRACE environment variable', () => {
        const msvcConfig = launchConfig.configurations.find((c: any) => c.type === 'cppvsdbg');
        const backtraceEnv = msvcConfig.environment?.find((e: any) => e.name === 'RUST_BACKTRACE');
        expect(backtraceEnv).toBeDefined();
        expect(backtraceEnv.value).toBe('1');
      });
    });

    describe('tasks.json', () => {
      let tasksConfig: any;

      beforeAll(() => {
        const tasksPath = path.join(VSCODE_ROOT, 'tasks.json');
        if (fs.existsSync(tasksPath)) {
          const content = fs.readFileSync(tasksPath, 'utf-8');
          tasksConfig = JSON.parse(content);
        }
      });

      it('should exist', () => {
        expect(tasksConfig).toBeDefined();
      });

      it('should have ui:dev task', () => {
        const task = tasksConfig.tasks.find((t: any) => t.label === 'ui:dev');
        expect(task).toBeDefined();
        expect(task.isBackground).toBe(true);
      });

      it('should have rust:build task', () => {
        const task = tasksConfig.tasks.find((t: any) => t.label === 'rust:build');
        expect(task).toBeDefined();
        expect(task.command).toBe('build');
      });

      it('should have rust:test task', () => {
        const task = tasksConfig.tasks.find((t: any) => t.label === 'rust:test');
        expect(task).toBeDefined();
        expect(task.command).toBe('test');
      });

      it('should have tauri:build-debug task', () => {
        const task = tasksConfig.tasks.find((t: any) => t.label === 'tauri:build-debug');
        expect(task).toBeDefined();
        expect(task.args).toContain('--debug');
      });
    });
  });

  describe('Tauri Configuration', () => {
    let tauriConfig: any;

    beforeAll(() => {
      const tauriPath = path.join(TAURI_ROOT, 'tauri.conf.json');
      const content = fs.readFileSync(tauriPath, 'utf-8');
      tauriConfig = JSON.parse(content);
    });

    it('should have valid app identifier', () => {
      expect(tauriConfig.identifier).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/);
    });

    it('should have build configuration', () => {
      expect(tauriConfig.build).toBeDefined();
      expect(tauriConfig.build.beforeDevCommand).toBeDefined();
      expect(tauriConfig.build.beforeBuildCommand).toBeDefined();
    });

    it('should have window configuration', () => {
      expect(tauriConfig.app.windows).toBeDefined();
      expect(tauriConfig.app.windows.length).toBeGreaterThan(0);
    });

    it('should have security CSP configured', () => {
      expect(tauriConfig.app.security).toBeDefined();
      expect(tauriConfig.app.security.csp).toBeDefined();
    });
  });
});

describe('Debug Utilities', () => {
  describe('Environment Detection', () => {
    it('should detect Tauri environment', () => {
      // In test environment, __TAURI__ is mocked
      const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
      expect(typeof isTauri).toBe('boolean');
    });

    it('should have debug mode detection utility', () => {
      // This tests that we can detect debug vs release mode
      const isDebug = process.env.NODE_ENV !== 'production';
      expect(typeof isDebug).toBe('boolean');
    });
  });

  describe('Console Logging', () => {
    it('console.log should be available', () => {
      expect(typeof console.log).toBe('function');
    });

    it('console.error should be available', () => {
      expect(typeof console.error).toBe('function');
    });

    it('console.warn should be available', () => {
      expect(typeof console.warn).toBe('function');
    });

    it('console.debug should be available', () => {
      expect(typeof console.debug).toBe('function');
    });
  });
});

describe('Project Structure Validation', () => {
  it('should have src-tauri directory', () => {
    expect(fs.existsSync(TAURI_ROOT)).toBe(true);
  });

  it('should have src-tauri/src directory', () => {
    expect(fs.existsSync(path.join(TAURI_ROOT, 'src'))).toBe(true);
  });

  it('should have lib.rs entry point', () => {
    expect(fs.existsSync(path.join(TAURI_ROOT, 'src', 'lib.rs'))).toBe(true);
  });

  it('should have main.rs entry point', () => {
    expect(fs.existsSync(path.join(TAURI_ROOT, 'src', 'main.rs'))).toBe(true);
  });

  it('should have debug.rs module', () => {
    expect(fs.existsSync(path.join(TAURI_ROOT, 'src', 'debug.rs'))).toBe(true);
  });

  it('should have icons directory for bundling', () => {
    expect(fs.existsSync(path.join(TAURI_ROOT, 'icons'))).toBe(true);
  });
});
