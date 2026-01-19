import { exec } from 'child_process';
import Logger from '../logger.js';
import AuditLogger from '../security/audit-logger.js';

const runShellTool = {
  name: 'run_shell_command',
  description: 'Execute a shell command',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' }
    },
    required: ['command']
  },
  execute: async ({ command }) => {
    Logger.info(`Executing shell command: ${command}`);
    AuditLogger.logCommand(command);

    return new Promise((resolve, reject) => {
      exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error) {
          Logger.warn(`Command failed: ${command}`, { error: error.message });
          return resolve({
            exitCode: error.code || 1,
            stdout: stdout.trim(),
            stderr: stderr.trim() || error.message
          });
        }
        resolve({
          exitCode: 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
    });
  }
};

export default [runShellTool];