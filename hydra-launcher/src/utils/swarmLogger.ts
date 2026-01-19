/**
 * SWARM Protocol Logger
 * Zapisuje kroki protokołu SWARM do pliku i konsoli
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// TYPES
// ============================================================================

export type SwarmStep = 'ROUTE' | 'SPECULATE' | 'PLAN' | 'EXECUTE' | 'SYNTHESIZE' | 'REPORT';
export type StepStatus = 'started' | 'completed' | 'error' | 'skipped';

export interface SwarmLogEntry {
  timestamp: string;
  sessionId: string;
  step: SwarmStep;
  status: StepStatus;
  duration?: number;
  agents?: string[];
  details?: string;
  error?: string;
}

export interface SwarmSession {
  id: string;
  startTime: Date;
  query: string;
  steps: SwarmLogEntry[];
  completed: boolean;
  totalDuration?: number;
}

// ============================================================================
// SWARM LOGGER CLASS
// ============================================================================

class SwarmLogger {
  private currentSession: SwarmSession | null = null;
  private stepStartTimes: Map<SwarmStep, number> = new Map();
  private logBuffer: SwarmLogEntry[] = [];
  private readonly LOG_FILE = 'hydra-logs/swarm.log';

  /**
   * Start a new SWARM session
   */
  startSession(query: string): string {
    const sessionId = `swarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      query,
      steps: [],
      completed: false,
    };

    this.log('info', `🐺 SWARM SESSION START: ${sessionId}`);
    this.log('info', `   Query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`);

    return sessionId;
  }

  /**
   * Log step start
   */
  stepStart(step: SwarmStep, agents?: string[]): void {
    if (!this.currentSession) {
      console.warn('SWARM Logger: No active session');
      return;
    }

    this.stepStartTimes.set(step, Date.now());

    const entry: SwarmLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.currentSession.id,
      step,
      status: 'started',
      agents,
    };

    this.currentSession.steps.push(entry);
    this.logBuffer.push(entry);

    const stepIndex = this.getStepIndex(step) + 1;
    this.log('info', `   [${stepIndex}/6] ${step} → Started${agents ? ` (agents: ${agents.join(', ')})` : ''}`);
  }

  /**
   * Log step completion
   */
  stepComplete(step: SwarmStep, details?: string): void {
    if (!this.currentSession) return;

    const startTime = this.stepStartTimes.get(step);
    const duration = startTime ? Date.now() - startTime : undefined;

    const entry: SwarmLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.currentSession.id,
      step,
      status: 'completed',
      duration,
      details,
    };

    this.currentSession.steps.push(entry);
    this.logBuffer.push(entry);

    const stepIndex = this.getStepIndex(step) + 1;
    this.log('info', `   [${stepIndex}/6] ${step} ✓ Complete (${duration ? `${duration}ms` : 'N/A'})`);
  }

  /**
   * Log step error
   */
  stepError(step: SwarmStep, error: string): void {
    if (!this.currentSession) return;

    const startTime = this.stepStartTimes.get(step);
    const duration = startTime ? Date.now() - startTime : undefined;

    const entry: SwarmLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.currentSession.id,
      step,
      status: 'error',
      duration,
      error,
    };

    this.currentSession.steps.push(entry);
    this.logBuffer.push(entry);

    this.log('error', `   [${this.getStepIndex(step) + 1}/6] ${step} ✗ Error: ${error}`);
  }

  /**
   * Skip a step
   */
  stepSkip(step: SwarmStep, reason: string): void {
    if (!this.currentSession) return;

    const entry: SwarmLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.currentSession.id,
      step,
      status: 'skipped',
      details: reason,
    };

    this.currentSession.steps.push(entry);
    this.logBuffer.push(entry);

    this.log('info', `   [${this.getStepIndex(step) + 1}/6] ${step} ⊘ Skipped: ${reason}`);
  }

  /**
   * End the current session
   */
  endSession(success: boolean, summary?: string): SwarmSession | null {
    if (!this.currentSession) return null;

    const totalDuration = Date.now() - this.currentSession.startTime.getTime();
    this.currentSession.completed = success;
    this.currentSession.totalDuration = totalDuration;

    this.log('info', `🐺 SWARM SESSION END: ${success ? '✓ SUCCESS' : '✗ FAILED'}`);
    this.log('info', `   Duration: ${totalDuration}ms`);
    if (summary) {
      this.log('info', `   Summary: ${summary}`);
    }
    this.log('info', '─'.repeat(60));

    // Write to file asynchronously
    this.flushToFile();

    const session = this.currentSession;
    this.currentSession = null;
    this.stepStartTimes.clear();

    return session;
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SwarmSession | null {
    return this.currentSession;
  }

  /**
   * Get step index (0-5)
   */
  private getStepIndex(step: SwarmStep): number {
    const steps: SwarmStep[] = ['ROUTE', 'SPECULATE', 'PLAN', 'EXECUTE', 'SYNTHESIZE', 'REPORT'];
    return steps.indexOf(step);
  }

  /**
   * Internal log function
   */
  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [SWARM]`;

    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Flush log buffer to file via Tauri
   */
  private async flushToFile(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    try {
      const logContent = this.logBuffer.map(entry => {
        return JSON.stringify(entry);
      }).join('\n') + '\n';

      // Try to append to log file via Tauri backend
      await invoke('append_to_log', {
        filename: this.LOG_FILE,
        content: logContent,
      }).catch(() => {
        // Fallback: store in localStorage if Tauri command not available
        const existing = localStorage.getItem('swarm_logs') || '';
        localStorage.setItem('swarm_logs', existing + logContent);
      });

      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to flush SWARM logs:', error);
    }
  }

  /**
   * Get formatted session report
   */
  getSessionReport(session: SwarmSession): string {
    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  🐺 SWARM PROTOCOL REPORT                                    ║',
      '╠══════════════════════════════════════════════════════════════╣',
      `║  Session: ${session.id.substring(0, 30).padEnd(30)}        ║`,
      `║  Status:  ${(session.completed ? '✓ SUCCESS' : '✗ FAILED').padEnd(30)}        ║`,
      `║  Duration: ${(session.totalDuration ? `${session.totalDuration}ms` : 'N/A').padEnd(29)}        ║`,
      '╠══════════════════════════════════════════════════════════════╣',
    ];

    const steps: SwarmStep[] = ['ROUTE', 'SPECULATE', 'PLAN', 'EXECUTE', 'SYNTHESIZE', 'REPORT'];
    steps.forEach((step, index) => {
      const entries = session.steps.filter(e => e.step === step);
      const completed = entries.find(e => e.status === 'completed');
      const error = entries.find(e => e.status === 'error');
      const skipped = entries.find(e => e.status === 'skipped');

      let status = '○ Pending';
      if (completed) status = `✓ ${completed.duration || 0}ms`;
      else if (error) status = '✗ Error';
      else if (skipped) status = '⊘ Skipped';

      lines.push(`║  ${index + 1}. ${step.padEnd(12)} ${status.padEnd(20)}            ║`);
    });

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const swarmLogger = new SwarmLogger();
export default swarmLogger;
