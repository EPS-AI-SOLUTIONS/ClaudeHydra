/**
 * Tests for AgentRouter
 * @module test/unit/cli-unified/processing/AgentRouter
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  AGENT_NAMES: [
    'Geralt',
    'Yennefer',
    'Triss',
    'Jaskier',
    'Vesemir',
    'Ciri',
    'Eskel',
    'Lambert',
    'Zoltan',
    'Regis',
    'Dijkstra',
    'Philippa',
  ],
  AGENT_AVATARS: {
    Geralt: 'G',
    Yennefer: 'Y',
    Triss: 'T',
    Jaskier: 'J',
    Vesemir: 'V',
    Ciri: 'C',
    Eskel: 'E',
    Lambert: 'L',
    Zoltan: 'Z',
    Regis: 'R',
    Dijkstra: 'D',
    Philippa: 'P',
  },
}));

// Mock EventBus
vi.mock('../../../../src/cli-unified/core/EventBus.js', () => ({
  eventBus: { emit: vi.fn() },
  EVENT_TYPES: {
    AGENT_SELECT: 'agent:select',
    AGENT_COMPLETE: 'agent:complete',
    AGENT_ERROR: 'agent:error',
  },
}));

// Mock AGENT_TIERS from swarm/agents
vi.mock('../../../../src/swarm/agents.js', () => ({
  AGENT_TIERS: {
    Dijkstra: 'commander',
    Regis: 'coordinator',
    Yennefer: 'coordinator',
    Geralt: 'executor',
    Triss: 'executor',
    Jaskier: 'executor',
    Vesemir: 'executor',
    Ciri: 'executor',
    Eskel: 'executor',
    Lambert: 'executor',
    Zoltan: 'executor',
    Philippa: 'executor',
  },
}));

import { EVENT_TYPES, eventBus } from '../../../../src/cli-unified/core/EventBus.js';
import {
  AGENT_SPECS,
  AgentRouter,
  createAgentRouter,
} from '../../../../src/cli-unified/processing/AgentRouter.js';

describe('AgentRouter Module', () => {
  describe('AGENT_SPECS', () => {
    it('should define all 12 agents', () => {
      expect(Object.keys(AGENT_SPECS)).toHaveLength(12);
    });

    it('should have required properties for each agent', () => {
      for (const [name, spec] of Object.entries(AGENT_SPECS)) {
        expect(spec).toHaveProperty('name', name);
        expect(spec).toHaveProperty('role');
        expect(spec).toHaveProperty('model');
        expect(spec).toHaveProperty('temperature');
        expect(spec).toHaveProperty('patterns');
        expect(spec).toHaveProperty('color');
        expect(Array.isArray(spec.patterns)).toBe(true);
      }
    });

    it('should define Geralt for security', () => {
      expect(AGENT_SPECS.Geralt.role).toBe('Security & Validation');
      expect(AGENT_SPECS.Geralt.patterns).toContain('security');
    });

    it('should define Jaskier for documentation', () => {
      expect(AGENT_SPECS.Jaskier.role).toBe('Documentation & Logging');
      expect(AGENT_SPECS.Jaskier.patterns).toContain('document');
    });

    it('should define Eskel for testing', () => {
      expect(AGENT_SPECS.Eskel.role).toBe('Testing & Stability');
      expect(AGENT_SPECS.Eskel.patterns).toContain('test');
    });
  });

  describe('AgentRouter', () => {
    let router;

    beforeEach(() => {
      vi.clearAllMocks();
      router = new AgentRouter();
    });

    describe('constructor', () => {
      it('should create with default options', () => {
        expect(router.agents).toBeDefined();
        expect(router.defaultAgent).toBe('auto');
        expect(router.currentAgent).toBeNull();
        expect(router.stats).toBeDefined();
      });

      it('should accept custom default agent', () => {
        const custom = new AgentRouter({ defaultAgent: 'Geralt' });
        expect(custom.defaultAgent).toBe('Geralt');
      });

      it('should initialize stats for all agents', () => {
        expect(router.stats.Geralt).toEqual({ calls: 0, totalTime: 0, errors: 0 });
        expect(router.stats.Jaskier).toEqual({ calls: 0, totalTime: 0, errors: 0 });
      });

      it('should extend EventEmitter', () => {
        expect(typeof router.on).toBe('function');
        expect(typeof router.emit).toBe('function');
      });
    });

    describe('classify()', () => {
      it('should classify security prompts to Geralt', () => {
        const result = router.classify('Check for security vulnerabilities');
        expect(result.agent).toBe('Geralt');
        expect(result.score).toBeGreaterThan(0);
      });

      it('should classify test prompts to Eskel', () => {
        const result = router.classify('Write unit tests for the function');
        expect(result.agent).toBe('Eskel');
      });

      it('should classify documentation prompts to Jaskier', () => {
        const result = router.classify('Document this function and add comments');
        expect(result.agent).toBe('Jaskier');
      });

      it('should classify UI prompts to Philippa', () => {
        const result = router.classify('Create a React component for the UI');
        expect(result.agent).toBe('Philippa');
      });

      it('should classify deploy prompts to Zoltan', () => {
        const result = router.classify('Deploy to kubernetes cluster');
        expect(result.agent).toBe('Zoltan');
      });

      it('should return Regis as default for ambiguous queries', () => {
        const result = router.classify('Do something random');
        expect(result.agent).toBe('Regis');
      });

      it('should return scores for all agents', () => {
        const result = router.classify('Test security');
        expect(result.scores).toHaveProperty('Geralt');
        expect(result.scores).toHaveProperty('Eskel');
      });

      it('should give bonus for word boundary matches', () => {
        const result1 = router.classify('authentication system');
        const result2 = router.classify('auth system');

        // 'auth' matches word boundary, 'authentication' doesn't
        expect(result2.scores.Geralt).toBeGreaterThanOrEqual(result1.scores.Geralt);
      });
    });

    describe('select()', () => {
      it('should auto-select based on prompt', () => {
        const agent = router.select('auto', 'Write tests');

        expect(agent.name).toBe('Eskel');
        expect(router.currentAgent).toBe('Eskel');
      });

      it('should auto-select when no name provided', () => {
        const agent = router.select(null, 'security check');

        expect(agent.name).toBe('Geralt');
      });

      it('should manually select agent', () => {
        const agent = router.select('Yennefer');

        expect(agent.name).toBe('Yennefer');
        expect(router.currentAgent).toBe('Yennefer');
      });

      it('should throw for unknown agent', () => {
        expect(() => router.select('Unknown')).toThrow('Unknown agent');
      });

      it('should emit events for auto selection', () => {
        router.select('auto', 'test prompt');

        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.AGENT_SELECT,
          expect.objectContaining({ auto: true }),
        );
      });

      it('should emit events for manual selection', () => {
        router.select('Geralt');

        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.AGENT_SELECT,
          expect.objectContaining({ agent: 'Geralt', auto: false }),
        );
      });
    });

    describe('normalizeName()', () => {
      it('should normalize case', () => {
        expect(router.normalizeName('geralt')).toBe('Geralt');
        expect(router.normalizeName('YENNEFER')).toBe('Yennefer');
        expect(router.normalizeName('JaSkIeR')).toBe('Jaskier');
      });

      it('should return original for unknown names', () => {
        expect(router.normalizeName('unknown')).toBe('unknown');
      });
    });

    describe('getCurrent()', () => {
      it('should return null when no agent selected', () => {
        expect(router.getCurrent()).toBeNull();
      });

      it('should return current agent', () => {
        router.select('Triss');
        const current = router.getCurrent();

        expect(current.name).toBe('Triss');
      });
    });

    describe('get()', () => {
      it('should return agent by name', () => {
        const agent = router.get('Ciri');

        expect(agent).not.toBeNull();
        expect(agent.name).toBe('Ciri');
      });

      it('should normalize name', () => {
        const agent = router.get('ciri');

        expect(agent.name).toBe('Ciri');
      });

      it('should return null for unknown agent', () => {
        const agent = router.get('Unknown');

        expect(agent).toBeNull();
      });
    });

    describe('list()', () => {
      it('should list all agents', () => {
        const agents = router.list();

        expect(agents).toHaveLength(12);
        expect(agents[0]).toHaveProperty('name');
        expect(agents[0]).toHaveProperty('role');
        expect(agents[0]).toHaveProperty('avatar');
        expect(agents[0]).toHaveProperty('color');
      });
    });

    describe('buildPrompt()', () => {
      it('should build prompt with agent context', () => {
        const prompt = router.buildPrompt('Geralt', 'Check this code');

        expect(prompt).toContain('You are Geralt');
        expect(prompt).toContain('Security & Validation');
        expect(prompt).toContain('Check this code');
      });

      it('should accept agent object', () => {
        const agent = router.get('Jaskier');
        const prompt = router.buildPrompt(agent, 'Document this');

        expect(prompt).toContain('You are Jaskier');
      });

      it('should return original prompt for unknown agent', () => {
        const prompt = router.buildPrompt(null, 'Test prompt');

        expect(prompt).toBe('Test prompt');
      });

      it('should include pipeline self-knowledge in prompt', () => {
        const prompt = router.buildPrompt('Geralt', 'What is your pipeline?');

        expect(prompt).toContain('ClaudeHydra');
        expect(prompt).toContain('12 Witcher-themed agents');
        expect(prompt).toContain('COMMANDER');
        expect(prompt).toContain('Dijkstra');
        expect(prompt).toContain('Claude Opus 4');
      });

      it('should include current model and MCP tools info in Ollama format', () => {
        const prompt = router.buildPrompt('Ciri', 'Who are you?');

        expect(prompt).toContain('claude-opus-4-20250514');
        expect(prompt).toContain('MCP tools available');
        expect(prompt).toContain('read_file');
      });

      it('should use clean format for Claude models', () => {
        const prompt = router.buildPrompt('Ciri', 'Who are you?', { isClaudeModel: true });

        expect(prompt).not.toContain('<|system|>');
        expect(prompt).not.toContain('<|end|>');
        expect(prompt).toContain('Ciri');
        expect(prompt).toContain('Who are you?');
      });

      it('should include agent tier', () => {
        const prompt = router.buildPrompt('Geralt', 'Test');

        expect(prompt).toContain('Your tier:');
      });
    });

    describe('recordExecution()', () => {
      it('should record successful execution', () => {
        router.recordExecution('Geralt', 1000);

        expect(router.stats.Geralt.calls).toBe(1);
        expect(router.stats.Geralt.totalTime).toBe(1000);
        expect(router.stats.Geralt.errors).toBe(0);
      });

      it('should record failed execution', () => {
        const error = new Error('Test error');
        router.recordExecution('Geralt', 500, error);

        expect(router.stats.Geralt.calls).toBe(1);
        expect(router.stats.Geralt.errors).toBe(1);
      });

      it('should accumulate stats', () => {
        router.recordExecution('Geralt', 1000);
        router.recordExecution('Geralt', 2000);

        expect(router.stats.Geralt.calls).toBe(2);
        expect(router.stats.Geralt.totalTime).toBe(3000);
      });

      it('should emit complete event on success', () => {
        router.recordExecution('Geralt', 1000);

        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.AGENT_COMPLETE,
          expect.objectContaining({ agent: 'Geralt', duration: 1000 }),
        );
      });

      it('should emit error event on failure', () => {
        const error = new Error('Test');
        router.recordExecution('Geralt', 500, error);

        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.AGENT_ERROR,
          expect.objectContaining({ agent: 'Geralt', error }),
        );
      });

      it('should handle unknown agent', () => {
        // Should not throw and should create stats
        router.recordExecution('NewAgent', 1000);

        expect(router.stats.NewAgent).toEqual({
          calls: 1,
          totalTime: 1000,
          errors: 0,
        });
      });
    });

    describe('getStats()', () => {
      it('should return formatted statistics', () => {
        router.recordExecution('Geralt', 1000);
        router.recordExecution('Geralt', 2000);
        router.recordExecution('Geralt', 500, new Error('Test'));

        const stats = router.getStats();

        expect(stats.Geralt.calls).toBe(3);
        expect(stats.Geralt.avgTime).toBe(1167); // (1000+2000+500)/3 rounded
        expect(stats.Geralt.successRate).toBe('66.7');
      });

      it('should handle agents with no calls', () => {
        const stats = router.getStats();

        expect(stats.Jaskier.avgTime).toBe(0);
        expect(stats.Jaskier.successRate).toBe(100); // Number, not string
      });
    });

    describe('resetStats()', () => {
      it('should reset all statistics', () => {
        router.recordExecution('Geralt', 1000);
        router.recordExecution('Jaskier', 500);

        router.resetStats();

        expect(router.stats.Geralt).toEqual({ calls: 0, totalTime: 0, errors: 0 });
        expect(router.stats.Jaskier).toEqual({ calls: 0, totalTime: 0, errors: 0 });
      });
    });

    describe('getModel()', () => {
      it('should return model for agent', () => {
        const model = router.getModel('Geralt');
        // Dynamically check against AGENT_SPECS to avoid hardcoding model names
        expect(model).toBe(AGENT_SPECS.Geralt.model);
      });

      it('should return default for unknown agent', () => {
        const model = router.getModel('Unknown');
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      });
    });

    describe('getTemperature()', () => {
      it('should return temperature for agent', () => {
        const temp = router.getTemperature('Regis');
        expect(temp).toBe(0.9);
      });

      it('should return default for unknown agent', () => {
        const temp = router.getTemperature('Unknown');
        expect(temp).toBe(0.7);
      });
    });

    describe('updateAgent()', () => {
      it('should update agent configuration', () => {
        router.updateAgent('Geralt', { temperature: 0.5 });

        const agent = router.get('Geralt');
        expect(agent.temperature).toBe(0.5);
      });

      it('should throw for unknown agent', () => {
        expect(() => router.updateAgent('Unknown', {})).toThrow('Unknown agent');
      });

      it('should emit event', () => {
        const spy = vi.fn();
        router.on('agentUpdated', spy);

        router.updateAgent('Geralt', { model: 'new-model' });

        expect(spy).toHaveBeenCalledWith('Geralt', expect.any(Object));
      });

      it('should preserve existing properties', () => {
        router.updateAgent('Geralt', { temperature: 0.5 });

        const agent = router.get('Geralt');
        expect(agent.role).toBe('Security & Validation');
        expect(agent.name).toBe('Geralt');
      });
    });

    describe('createChain()', () => {
      it('should create chain of agents', () => {
        const chain = router.createChain(['Geralt', 'Eskel', 'Jaskier']);

        expect(chain).toHaveLength(3);
        expect(chain[0].name).toBe('Geralt');
        expect(chain[1].name).toBe('Eskel');
        expect(chain[2].name).toBe('Jaskier');
      });

      it('should normalize names', () => {
        const chain = router.createChain(['geralt', 'ESKEL']);

        expect(chain[0].name).toBe('Geralt');
        expect(chain[1].name).toBe('Eskel');
      });

      it('should filter out unknown agents', () => {
        const chain = router.createChain(['Geralt', 'Unknown', 'Jaskier']);

        expect(chain).toHaveLength(2);
      });

      it('should return empty chain for empty input', () => {
        const chain = router.createChain([]);

        expect(chain).toEqual([]);
      });
    });
  });

  describe('createAgentRouter()', () => {
    it('should create AgentRouter instance', () => {
      const router = createAgentRouter();
      expect(router).toBeInstanceOf(AgentRouter);
    });

    it('should pass options', () => {
      const router = createAgentRouter({ defaultAgent: 'Ciri' });
      expect(router.defaultAgent).toBe('Ciri');
    });
  });
});
