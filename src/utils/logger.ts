/**
 * Advanced Logger for ClaudeHydra with color-coded levels
 * @module utils/logger
 */

import chalk from 'chalk';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

export interface LoggerConfig {
  level: LogLevel;
  enableTimestamps: boolean;
  enableColors: boolean;
  prefix?: string;
}

export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: this.parseLogLevel(process.env.LOG_LEVEL || 'INFO'),
      enableTimestamps: process.env.LOG_TIMESTAMPS === '1',
      enableColors: process.env.FORCE_COLOR !== '0',
      ...config,
    };
  }

  private parseLogLevel(level: string): LogLevel {
    const normalized = level.toUpperCase();
    switch (normalized) {
      case 'ERROR':
        return LogLevel.ERROR;
      case 'WARN':
        return LogLevel.WARN;
      case 'INFO':
        return LogLevel.INFO;
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'TRACE':
        return LogLevel.TRACE;
      default:
        return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  private formatTimestamp(): string {
    if (!this.config.enableTimestamps) return '';
    const now = new Date();
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    return chalk.gray(`[${now.toLocaleTimeString('pl-PL')}.${ms}]`);
  }

  private formatPrefix(): string {
    if (!this.config.prefix) return '';
    return chalk.cyan(`[${this.config.prefix}]`);
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = this.formatTimestamp();
    const prefix = this.formatPrefix();

    let levelLabel = '';
    if (this.config.enableColors) {
      switch (level) {
        case LogLevel.ERROR:
          levelLabel = chalk.red.bold('[ERROR]');
          break;
        case LogLevel.WARN:
          levelLabel = chalk.yellow.bold('[WARN] ');
          break;
        case LogLevel.INFO:
          levelLabel = chalk.blue.bold('[INFO] ');
          break;
        case LogLevel.DEBUG:
          levelLabel = chalk.magenta.bold('[DEBUG]');
          break;
        case LogLevel.TRACE:
          levelLabel = chalk.gray.bold('[TRACE]');
          break;
      }
    } else {
      levelLabel = `[${LogLevel[level]}]`;
    }

    const parts = [timestamp, prefix, levelLabel, message].filter(Boolean);

    if (args.length > 0) {
      const formatted = args
        .map((arg) => {
          if (typeof arg === 'object') {
            return `\n${JSON.stringify(arg, null, 2)}`;
          }
          return String(arg);
        })
        .join(' ');
      return `${parts.join(' ')} ${formatted}`;
    }

    return parts.join(' ');
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message, ...args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, ...args));
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(LogLevel.INFO, message, ...args));
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(LogLevel.DEBUG, message, ...args));
    }
  }

  trace(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      console.log(this.formatMessage(LogLevel.TRACE, message, ...args));
    }
  }

  /**
   * Log MCP tool call
   */
  mcp(toolName: string, params: any, response?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const arrow = this.config.enableColors ? chalk.green('→') : '->';
      this.debug(`MCP ${arrow} ${toolName}`, { params });

      if (response && this.shouldLog(LogLevel.TRACE)) {
        const arrowBack = this.config.enableColors ? chalk.blue('←') : '<-';
        this.trace(`MCP ${arrowBack} ${toolName}`, { response });
      }
    }
  }

  /**
   * Log agent selection
   */
  agent(agentName: string, reason: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const emoji = this.config.enableColors ? '🤖' : '[AGENT]';
      this.debug(`${emoji} Selected: ${chalk.bold(agentName)} - ${reason}`, metadata);
    }
  }

  /**
   * Log Ollama API call
   */
  ollama(endpoint: string, params: any, response?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const arrow = this.config.enableColors ? chalk.yellow('→') : '->';
      this.debug(`Ollama ${arrow} ${endpoint}`, {
        model: params.model,
        tokens: params.num_predict,
        temperature: params.temperature,
        penalties: {
          repeat: params.repeat_penalty,
          frequency: params.frequency_penalty,
        },
      });

      if (response && this.shouldLog(LogLevel.TRACE)) {
        const arrowBack = this.config.enableColors ? chalk.yellow('←') : '<-';
        this.trace(`Ollama ${arrowBack} ${endpoint}`, {
          tokens_generated: response.eval_count,
          duration_ms: response.total_duration ? Math.round(response.total_duration / 1e6) : 0,
          response_preview: `${response.response?.substring(0, 100)}...`,
        });
      }
    }
  }

  /**
   * Create child logger with prefix
   */
  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function getLogger(prefix?: string): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }

  if (prefix) {
    return globalLogger.child(prefix);
  }

  return globalLogger;
}

export function setLogLevel(level: LogLevel | string): void {
  if (!globalLogger) {
    globalLogger = new Logger();
  }

  if (typeof level === 'string') {
    level = globalLogger.parseLogLevel(level);
  }

  globalLogger.config.level = level;
}
