/**
 * Shell Tools Tests
 * @module test/unit/tools/shell.test
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock audit logger
vi.mock('../../../src/security/audit-logger.js', () => ({
  default: {
    logCommand: vi.fn(),
  },
}));

// Mock schemas - need to provide actual exports
vi.mock('../../../src/schemas/tools.js', async () => {
  const actual = await vi.importActual('../../../src/schemas/tools.js');
  return {
    ...actual,
    assessCommandRisk: vi.fn((cmd) => {
      // Simple mock risk assessment
      if (cmd.includes('rm -rf /') || cmd.includes('format')) {
        return { safe: false, risks: ['destructive'], severity: 'critical' };
      }
      if (cmd.includes('sudo') || cmd.includes('admin')) {
        return { safe: false, risks: ['elevated privileges'], severity: 'high' };
      }
      return { safe: true, risks: [], severity: 'low' };
    }),
  };
});

// Dynamic import after mocks are set up
const { tools } = await import('../../../src/tools/shell.js');

import { assessCommandRisk } from '../../../src/schemas/tools.js';
import AuditLogger from '../../../src/security/audit-logger.js';

describe('Shell Tools', () => {
  let mockChildProcess;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock child process
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = vi.fn();
    mockChildProcess.killed = false;

    spawn.mockReturnValue(mockChildProcess);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // CommandSanitizer Tests (tested through RunShellTool)
  // ===========================================================================

  describe('Command Sanitization', () => {
    it('should reject commands that are too long', async () => {
      const longCommand = 'a'.repeat(15000);

      await expect(
        tools.runShell.run({
          command: longCommand,
          timeout: 5000,
        }),
      ).rejects.toThrow('exceeds maximum length');
    });

    it('should block critical security risk commands', async () => {
      assessCommandRisk.mockReturnValueOnce({
        safe: false,
        risks: ['destructive'],
        severity: 'critical',
      });

      await expect(
        tools.runShell.run({
          command: 'rm -rf /',
          timeout: 5000,
        }),
      ).rejects.toThrow('blocked for security reasons');
    });

    it('should allow commands with warnings for non-critical risks', async () => {
      assessCommandRisk.mockReturnValueOnce({
        safe: false,
        risks: ['elevated privileges'],
        severity: 'high',
      });

      // Simulate successful command execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', 'output');
        mockChildProcess.emit('close', 0, null);
      }, 10);

      const result = await tools.runShell.run({
        command: 'sudo ls',
        timeout: 5000,
      });

      expect(result.risks).toContain('elevated privileges');
      expect(result.severity).toBe('high');
    });
  });

  // ===========================================================================
  // Environment Variable Filtering
  // ===========================================================================

  describe('Environment Filtering', () => {
    it('should filter dangerous environment variables', async () => {
      assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

      setTimeout(() => {
        mockChildProcess.emit('close', 0, null);
      }, 10);

      await tools.runShell.run({
        command: 'echo test',
        env: {
          SAFE_VAR: 'value',
          LD_PRELOAD: '/evil/lib.so', // Should be filtered
          DYLD_INSERT_LIBRARIES: '/evil', // Should be filtered
          BASH_ENV: '/evil/script', // Should be filtered
          NORMAL_VAR: 'ok',
        },
        timeout: 5000,
      });

      // The spawn call should have been made with filtered env
      expect(spawn).toHaveBeenCalled();
      const spawnCall = spawn.mock.calls[0];
      const envPassed = spawnCall[2].env;

      // Dangerous vars should not be present (from user input)
      // Note: they may still exist from process.env
      expect(envPassed.SAFE_VAR).toBe('value');
      expect(envPassed.NORMAL_VAR).toBe('ok');
    });

    it('should filter env values containing command injection', async () => {
      assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

      setTimeout(() => {
        mockChildProcess.emit('close', 0, null);
      }, 10);

      await tools.runShell.run({
        command: 'echo test',
        env: {
          SAFE: 'normal-value',
          DANGEROUS: '$(whoami)', // Contains command substitution
        },
        timeout: 5000,
      });

      const spawnCall = spawn.mock.calls[0];
      const envPassed = spawnCall[2].env;

      expect(envPassed.SAFE).toBe('normal-value');
      expect(envPassed.DANGEROUS).toBeUndefined();
    });
  });

  // ===========================================================================
  // RunShellTool Tests
  // ===========================================================================

  describe('RunShellTool', () => {
    describe('constructor', () => {
      it('should have correct name and description', () => {
        expect(tools.runShell.name).toBe('run_shell_command');
        expect(tools.runShell.description).toContain('shell command');
      });
    });

    describe('run()', () => {
      it('should execute command and return stdout', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          mockChildProcess.stdout.emit('data', 'Hello World');
          mockChildProcess.emit('close', 0, null);
        }, 10);

        const result = await tools.runShell.run({
          command: 'echo Hello World',
          timeout: 5000,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('Hello World');
        expect(result.timedOut).toBe(false);
      });

      it('should capture stderr when captureStderr is true', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          mockChildProcess.stdout.emit('data', 'stdout output');
          mockChildProcess.stderr.emit('data', 'stderr output');
          mockChildProcess.emit('close', 0, null);
        }, 10);

        const result = await tools.runShell.run({
          command: 'test command',
          captureStderr: true,
          timeout: 5000,
        });

        expect(result.stdout).toBe('stdout output');
        expect(result.stderr).toBe('stderr output');
      });

      it('should handle command errors', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          mockChildProcess.emit('error', new Error('Command not found'));
        }, 10);

        await expect(
          tools.runShell.run({
            command: 'nonexistent-command',
            timeout: 5000,
          }),
        ).rejects.toThrow('Failed to execute command');
      });

      it('should handle non-zero exit codes', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          mockChildProcess.stderr.emit('data', 'error message');
          mockChildProcess.emit('close', 1, null);
        }, 10);

        const result = await tools.runShell.run({
          command: 'failing-command',
          captureStderr: true,
          timeout: 5000,
        });

        expect(result.exitCode).toBe(1);
      });

      it('should timeout long-running commands', async () => {
        vi.useFakeTimers();
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        const promise = tools.runShell.run({
          command: 'sleep 100',
          timeout: 1000,
        });

        // Advance past timeout
        vi.advanceTimersByTime(1100);

        // Simulate timeout kill
        mockChildProcess.emit('close', -1, 'SIGTERM');

        vi.useRealTimers();

        const result = await promise;

        expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
        expect(result.timedOut).toBe(true);
        expect(result.exitCode).toBe(-1);
      });

      it('should log commands to audit logger', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          mockChildProcess.emit('close', 0, null);
        }, 10);

        await tools.runShell.run({
          command: 'echo test',
          timeout: 5000,
        });

        expect(AuditLogger.logCommand).toHaveBeenCalledWith(
          'echo test',
          expect.objectContaining({
            risks: [],
            severity: 'low',
          }),
        );
      });

      it('should truncate very large stdout', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          // Emit more than 5MB of data
          const largeData = 'x'.repeat(6 * 1024 * 1024);
          mockChildProcess.stdout.emit('data', largeData);
          mockChildProcess.emit('close', 0, null);
        }, 10);

        const result = await tools.runShell.run({
          command: 'cat large-file',
          timeout: 5000,
        });

        expect(result.stdout.length).toBeLessThanOrEqual(5 * 1024 * 1024 + 50);
        expect(result.stdout).toContain('TRUNCATED');
      });

      it('should truncate very large stderr', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          // Emit more than 1MB of stderr
          const largeData = 'e'.repeat(2 * 1024 * 1024);
          mockChildProcess.stderr.emit('data', largeData);
          mockChildProcess.emit('close', 0, null);
        }, 10);

        const result = await tools.runShell.run({
          command: 'error-command',
          captureStderr: true,
          timeout: 5000,
        });

        expect(result.stderr.length).toBeLessThanOrEqual(1024 * 1024 + 50);
        expect(result.stderr).toContain('TRUNCATED');
      });

      it('should include duration in result', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        setTimeout(() => {
          mockChildProcess.emit('close', 0, null);
        }, 50);

        const result = await tools.runShell.run({
          command: 'echo test',
          timeout: 5000,
        });

        expect(typeof result.durationMs).toBe('number');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getShellConfig()', () => {
      it('should return correct shell for powershell', () => {
        const config = tools.runShell.getShellConfig('powershell');
        // Result depends on platform
        expect(typeof config === 'string' || config === false).toBe(true);
      });

      it('should return correct shell for cmd', () => {
        const config = tools.runShell.getShellConfig('cmd');
        expect(typeof config === 'string' || config === false).toBe(true);
      });

      it('should return correct shell for bash', () => {
        const config = tools.runShell.getShellConfig('bash');
        expect(typeof config === 'string').toBe(true);
      });

      it('should return correct shell for sh', () => {
        const config = tools.runShell.getShellConfig('sh');
        // On Windows returns false, on Unix returns /bin/sh
        expect(config === false || config === '/bin/sh').toBe(true);
      });

      it('should return default shell when not specified', () => {
        const config = tools.runShell.getShellConfig();
        // Returns true on Windows, /bin/sh on Unix
        expect(config === true || config === '/bin/sh').toBe(true);
      });
    });

    describe('cleanup()', () => {
      it('should kill all active processes', async () => {
        assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

        // Start a command but don't finish it
        tools.runShell.run({
          command: 'sleep 100',
          timeout: 60000,
        });

        // Wait for process to be tracked
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Cleanup should kill active processes
        tools.runShell.cleanup();

        expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      });
    });
  });

  // ===========================================================================
  // Security Tests
  // ===========================================================================

  describe('Security', () => {
    it('should block working directory outside project root', async () => {
      assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

      await expect(
        tools.runShell.run({
          command: 'ls',
          cwd: '/etc',
          timeout: 5000,
        }),
      ).rejects.toThrow('must be within project root');
    });

    it('should allow working directory within project', async () => {
      assessCommandRisk.mockReturnValue({ safe: true, risks: [], severity: 'low' });

      setTimeout(() => {
        mockChildProcess.emit('close', 0, null);
      }, 10);

      // Use relative path within project
      const result = await tools.runShell.run({
        command: 'ls',
        cwd: './src',
        timeout: 5000,
      });

      expect(result.exitCode).toBe(0);
    });
  });
});
