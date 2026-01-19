import fs from 'fs';
import path from 'path';
import { PATHS } from './constants.js';

class Logger {
  constructor() {
    this.logDir = path.join(process.cwd(), '.hydra-data', 'logs');
    this.ensureLogDir();
    this.currentLogFile = this.getLogFileName();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFileName() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `hydra-${date}.log`);
  }

  formatMessage(level, message, meta = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...meta
    });
  }

  write(level, message, meta) {
    const logLine = this.formatMessage(level, message, meta) + '\n';
    
    if (level === 'error') {
      console.error(`[${level.toUpperCase()}] ${message}`);
    } else if (process.env.DEBUG || level === 'warn') {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }

    try {
      fs.appendFileSync(this.currentLogFile, logLine, { encoding: 'utf8' });
    } catch (err) {
      console.error('CRITICAL: Failed to write to log file', err);
    }
  }

  info(message, meta) { this.write('info', message, meta); }
  warn(message, meta) { this.write('warn', message, meta); }
  error(message, meta) { this.write('error', message, meta); }
  debug(message, meta) { 
    if (process.env.DEBUG) this.write('debug', message, meta); 
  }
}

export default new Logger();
