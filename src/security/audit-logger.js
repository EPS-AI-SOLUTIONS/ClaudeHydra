import fs from 'fs';
import path from 'path';

class AuditLogger {
  constructor() {
    this.logPath = path.join(process.cwd(), '.hydra-data', 'logs', 'audit.log');
    this.ensureLogDir();
  }

  ensureLogDir() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  logCommand(command, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'SHELL_COMMAND',
      command,
      user: process.env.USERNAME || 'unknown',
      ...context
    };

    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      fs.appendFileSync(this.logPath, logLine, { encoding: 'utf8' });
    } catch (error) {
      console.error('Failed to write to audit log:', error);
    }
  }

  logSecurityEvent(event, severity = 'INFO') {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'SECURITY_EVENT',
      severity,
      event
    };

    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      fs.appendFileSync(this.logPath, logLine, { encoding: 'utf8' });
    } catch (error) {
      console.error('Failed to write to audit log:', error);
    }
  }
}

export default new AuditLogger();