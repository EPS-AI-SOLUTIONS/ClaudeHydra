import { describe, it, expect, vi, beforeEach } from 'vitest';

// SWARM Protocol Types
interface SwarmStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  result?: string;
  error?: string;
}

interface SwarmSession {
  id: string;
  query: string;
  steps: SwarmStep[];
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
}

// SWARM Protocol Constants
const SWARM_STEPS = ['ROUTE', 'SPECULATE', 'PLAN', 'EXECUTE', 'SYNTHESIZE', 'REPORT'] as const;

// Mock SWARM Protocol implementation
class SwarmProtocol {
  private sessions: Map<string, SwarmSession> = new Map();

  createSession(query: string): SwarmSession {
    const id = `swarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: SwarmSession = {
      id,
      query,
      steps: SWARM_STEPS.map(name => ({ name, status: 'pending' })),
      startTime: Date.now(),
      status: 'running',
    };
    this.sessions.set(id, session);
    return session;
  }

  startStep(sessionId: string, stepName: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const step = session.steps.find(s => s.name === stepName);
    if (!step) return false;

    step.status = 'running';
    step.startTime = Date.now();
    return true;
  }

  completeStep(sessionId: string, stepName: string, result: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const step = session.steps.find(s => s.name === stepName);
    if (!step) return false;

    step.status = 'completed';
    step.endTime = Date.now();
    step.result = result;
    return true;
  }

  failStep(sessionId: string, stepName: string, error: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const step = session.steps.find(s => s.name === stepName);
    if (!step) return false;

    step.status = 'failed';
    step.endTime = Date.now();
    step.error = error;
    session.status = 'failed';
    return true;
  }

  skipStep(sessionId: string, stepName: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const step = session.steps.find(s => s.name === stepName);
    if (!step) return false;

    step.status = 'skipped';
    return true;
  }

  getSession(sessionId: string): SwarmSession | undefined {
    return this.sessions.get(sessionId);
  }

  completeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'completed';
    session.endTime = Date.now();
    return true;
  }

  generateReport(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return 'Session not found';

    const completedSteps = session.steps.filter(s => s.status === 'completed').length;
    const duration = session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime;

    return `
╔══════════════════════════════════════════════════════════════╗
║  SWARM PROTOCOL REPORT                                        ║
╠══════════════════════════════════════════════════════════════╣
║  Session: ${session.id.substring(0, 20)}...                   ║
║  Query: ${session.query.substring(0, 40)}...                  ║
║  Status: ${session.status.toUpperCase()}                      ║
║  Steps: ${completedSteps}/${session.steps.length} completed   ║
║  Duration: ${duration}ms                                      ║
╚══════════════════════════════════════════════════════════════╝
    `.trim();
  }
}

describe('SWARM Protocol', () => {
  let protocol: SwarmProtocol;

  beforeEach(() => {
    protocol = new SwarmProtocol();
  });

  describe('Session Lifecycle', () => {
    it('should create a new session with unique ID', () => {
      const session = protocol.createSession('Test query');
      expect(session.id).toMatch(/^swarm_\d+_[a-z0-9]+$/);
      expect(session.query).toBe('Test query');
      expect(session.status).toBe('running');
    });

    it('should initialize all 6 steps as pending', () => {
      const session = protocol.createSession('Test query');
      expect(session.steps.length).toBe(6);
      expect(session.steps.every(s => s.status === 'pending')).toBe(true);
    });

    it('should have correct step names in order', () => {
      const session = protocol.createSession('Test query');
      const stepNames = session.steps.map(s => s.name);
      expect(stepNames).toEqual(['ROUTE', 'SPECULATE', 'PLAN', 'EXECUTE', 'SYNTHESIZE', 'REPORT']);
    });
  });

  describe('Step Tracking', () => {
    it('should start a step correctly', () => {
      const session = protocol.createSession('Test query');
      const result = protocol.startStep(session.id, 'ROUTE');

      expect(result).toBe(true);
      const updatedSession = protocol.getSession(session.id);
      const step = updatedSession?.steps.find(s => s.name === 'ROUTE');
      expect(step?.status).toBe('running');
      expect(step?.startTime).toBeDefined();
    });

    it('should complete a step with result', () => {
      const session = protocol.createSession('Test query');
      protocol.startStep(session.id, 'ROUTE');
      const result = protocol.completeStep(session.id, 'ROUTE', 'Routed to HYDRA');

      expect(result).toBe(true);
      const updatedSession = protocol.getSession(session.id);
      const step = updatedSession?.steps.find(s => s.name === 'ROUTE');
      expect(step?.status).toBe('completed');
      expect(step?.result).toBe('Routed to HYDRA');
    });

    it('should track step duration', () => {
      const session = protocol.createSession('Test query');
      protocol.startStep(session.id, 'SPECULATE');

      // Simulate some work
      const step = protocol.getSession(session.id)?.steps.find(s => s.name === 'SPECULATE');
      const startTime = step?.startTime || 0;

      protocol.completeStep(session.id, 'SPECULATE', 'Context gathered');
      const completedStep = protocol.getSession(session.id)?.steps.find(s => s.name === 'SPECULATE');

      expect(completedStep?.endTime).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('Error Handling', () => {
    it('should fail a step with error message', () => {
      const session = protocol.createSession('Test query');
      protocol.startStep(session.id, 'EXECUTE');
      const result = protocol.failStep(session.id, 'EXECUTE', 'Execution timeout');

      expect(result).toBe(true);
      const updatedSession = protocol.getSession(session.id);
      const step = updatedSession?.steps.find(s => s.name === 'EXECUTE');
      expect(step?.status).toBe('failed');
      expect(step?.error).toBe('Execution timeout');
    });

    it('should mark session as failed when a step fails', () => {
      const session = protocol.createSession('Test query');
      protocol.startStep(session.id, 'PLAN');
      protocol.failStep(session.id, 'PLAN', 'Planning failed');

      const updatedSession = protocol.getSession(session.id);
      expect(updatedSession?.status).toBe('failed');
    });

    it('should return false for non-existent session', () => {
      const result = protocol.startStep('non_existent_id', 'ROUTE');
      expect(result).toBe(false);
    });
  });

  describe('Step Skipping', () => {
    it('should skip a step', () => {
      const session = protocol.createSession('Simple query');
      const result = protocol.skipStep(session.id, 'SPECULATE');

      expect(result).toBe(true);
      const step = protocol.getSession(session.id)?.steps.find(s => s.name === 'SPECULATE');
      expect(step?.status).toBe('skipped');
    });
  });

  describe('Report Generation', () => {
    it('should generate ASCII report', () => {
      const session = protocol.createSession('Analyze codebase');

      // Complete some steps
      protocol.startStep(session.id, 'ROUTE');
      protocol.completeStep(session.id, 'ROUTE', 'Done');
      protocol.startStep(session.id, 'SPECULATE');
      protocol.completeStep(session.id, 'SPECULATE', 'Done');
      protocol.completeSession(session.id);

      const report = protocol.generateReport(session.id);

      expect(report).toContain('SWARM PROTOCOL REPORT');
      expect(report).toContain('COMPLETED');
      expect(report).toContain('2/6 completed');
    });

    it('should return error message for non-existent session', () => {
      const report = protocol.generateReport('non_existent');
      expect(report).toBe('Session not found');
    });
  });

  describe('Full Protocol Flow', () => {
    it('should execute complete 6-step protocol', () => {
      const session = protocol.createSession('Implement feature X');

      // Execute all steps
      SWARM_STEPS.forEach(stepName => {
        protocol.startStep(session.id, stepName);
        protocol.completeStep(session.id, stepName, `${stepName} completed`);
      });

      protocol.completeSession(session.id);

      const finalSession = protocol.getSession(session.id);
      expect(finalSession?.status).toBe('completed');
      expect(finalSession?.steps.every(s => s.status === 'completed')).toBe(true);
    });
  });
});
