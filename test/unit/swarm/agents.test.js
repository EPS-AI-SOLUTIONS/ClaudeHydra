/**
 * Swarm Agents Tests
 * @module test/unit/swarm/agents.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dependencies
vi.mock('../../../src/hydra/providers/llamacpp-bridge.js', () => ({
  getLlamaCppBridge: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({ content: 'mock response', model: 'test' }),
    generateFast: vi.fn().mockResolvedValue({ content: 'fast response', model: 'draft' }),
    generateCode: vi.fn().mockResolvedValue({ content: 'code response', model: 'code' }),
    generateJson: vi.fn().mockResolvedValue({ content: '{}', model: 'json' }),
    functionCall: vi.fn().mockResolvedValue({ content: 'function result', model: 'functionary' }),
    getInfo: vi.fn().mockResolvedValue({ status: 'connected' })
  }))
}));

vi.mock('../../../src/hydra/providers/llamacpp-models.js', () => ({
  EXECUTOR_AGENT_MODELS: {
    default: { model: 'main', tool: 'llama_generate' },
    code: { model: 'main', tool: 'llama_code' },
    fast: { model: 'draft', tool: 'llama_generate_fast' },
    json: { model: 'main', tool: 'llama_json' },
    functionary: { model: 'functionary', tool: 'llama_function_call' }
  },
  getModelForAgent: vi.fn((agent) => {
    const models = {
      Geralt: { model: 'main', tool: 'llama_generate' },
      Ciri: { model: 'draft', tool: 'llama_generate_fast' },
      Triss: { model: 'main', tool: 'llama_code' }
    };
    return models[agent] || { model: 'main', tool: 'llama_generate' };
  })
}));

vi.mock('../../../src/hydra/providers/claude-client.js', () => ({
  generate: vi.fn().mockResolvedValue({ content: 'claude response' }),
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  selectModel: vi.fn().mockReturnValue('claude-3-sonnet-20240229')
}));

describe('Swarm Agents', () => {
  let agents;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    agents = await import('../../../src/swarm/agents.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    describe('MODEL_TIERS', () => {
      it('should define commander tier', () => {
        expect(agents.MODEL_TIERS.commander).toBeDefined();
        expect(agents.MODEL_TIERS.commander.provider).toBe('claude');
        expect(agents.MODEL_TIERS.commander.displayName).toContain('Opus');
      });

      it('should define coordinator tier', () => {
        expect(agents.MODEL_TIERS.coordinator).toBeDefined();
        expect(agents.MODEL_TIERS.coordinator.provider).toBe('claude');
        expect(agents.MODEL_TIERS.coordinator.displayName).toContain('Opus');
      });

      it('should define executor tier', () => {
        expect(agents.MODEL_TIERS.executor).toBeDefined();
        expect(agents.MODEL_TIERS.executor.provider).toBe('claude');
        expect(agents.MODEL_TIERS.executor.model).toBe('claude-opus-4-20250514');
      });
    });

    describe('AGENT_TIERS', () => {
      it('should assign Dijkstra as commander', () => {
        expect(agents.AGENT_TIERS.Dijkstra).toBe('commander');
      });

      it('should assign coordinators correctly', () => {
        expect(agents.AGENT_TIERS.Regis).toBe('coordinator');
        expect(agents.AGENT_TIERS.Yennefer).toBe('coordinator');
      });

      it('should assign executors correctly', () => {
        expect(agents.AGENT_TIERS.Geralt).toBe('executor');
        expect(agents.AGENT_TIERS.Triss).toBe('executor');
        expect(agents.AGENT_TIERS.Vesemir).toBe('executor');
        expect(agents.AGENT_TIERS.Ciri).toBe('executor');
        expect(agents.AGENT_TIERS.Eskel).toBe('executor');
        expect(agents.AGENT_TIERS.Lambert).toBe('executor');
        expect(agents.AGENT_TIERS.Zoltan).toBe('executor');
        expect(agents.AGENT_TIERS.Philippa).toBe('executor');
      });
    });

    describe('AGENT_SPECS', () => {
      it('should define specs for all 12 agents', () => {
        expect(Object.keys(agents.AGENT_SPECS).length).toBe(12);
      });

      it('should have required properties for each agent', () => {
        for (const [name, spec] of Object.entries(agents.AGENT_SPECS)) {
          expect(spec.persona).toBeDefined();
          expect(spec.focus).toBeDefined();
          expect(spec.tier).toBeDefined();
          expect(Array.isArray(spec.skills)).toBe(true);
          expect(spec.skills.length).toBeGreaterThan(0);
        }
      });

      it('should define Dijkstra as Spymaster', () => {
        expect(agents.AGENT_SPECS.Dijkstra.persona).toBe('Spymaster');
        expect(agents.AGENT_SPECS.Dijkstra.focus).toContain('Planning');
      });

      it('should define Geralt as White Wolf', () => {
        expect(agents.AGENT_SPECS.Geralt.persona).toBe('White Wolf');
        expect(agents.AGENT_SPECS.Geralt.focus).toContain('Security');
      });
    });

    describe('AGENT_NAMES', () => {
      it('should contain all 12 agent names', () => {
        expect(agents.AGENT_NAMES).toHaveLength(12);
        expect(agents.AGENT_NAMES).toContain('Dijkstra');
        expect(agents.AGENT_NAMES).toContain('Geralt');
        expect(agents.AGENT_NAMES).toContain('Yennefer');
        expect(agents.AGENT_NAMES).toContain('Ciri');
        expect(agents.AGENT_NAMES).toContain('Regis');
        expect(agents.AGENT_NAMES).toContain('Triss');
        expect(agents.AGENT_NAMES).toContain('Vesemir');
        expect(agents.AGENT_NAMES).toContain('Eskel');
        expect(agents.AGENT_NAMES).toContain('Lambert');
        expect(agents.AGENT_NAMES).toContain('Zoltan');
        expect(agents.AGENT_NAMES).toContain('Philippa');
        expect(agents.AGENT_NAMES).toContain('Jaskier');
      });
    });

    describe('EXECUTOR_MODELS', () => {
      it('should define model configs for all executors', () => {
        expect(agents.EXECUTOR_MODELS.Geralt).toBeDefined();
        expect(agents.EXECUTOR_MODELS.Geralt.model).toBe('claude-opus-4-20250514');
        expect(agents.EXECUTOR_MODELS.Geralt.provider).toBe('claude');
      });

      it('should use Claude for Ciri', () => {
        expect(agents.EXECUTOR_MODELS.Ciri.model).toBe('claude-opus-4-20250514');
        expect(agents.EXECUTOR_MODELS.Ciri.provider).toBe('claude');
      });

      it('should use Claude for Triss and Lambert', () => {
        expect(agents.EXECUTOR_MODELS.Triss.model).toBe('claude-opus-4-20250514');
        expect(agents.EXECUTOR_MODELS.Lambert.model).toBe('claude-opus-4-20250514');
      });

      it('should use Claude for Zoltan', () => {
        expect(agents.EXECUTOR_MODELS.Zoltan.model).toBe('claude-opus-4-20250514');
        expect(agents.EXECUTOR_MODELS.Zoltan.provider).toBe('claude');
      });

      it('should use Claude for Philippa', () => {
        expect(agents.EXECUTOR_MODELS.Philippa.model).toBe('claude-opus-4-20250514');
        expect(agents.EXECUTOR_MODELS.Philippa.provider).toBe('claude');
      });
    });
  });

  // ===========================================================================
  // Utility Functions Tests
  // ===========================================================================

  describe('Utility Functions', () => {
    describe('getAgentTier()', () => {
      it('should return commander for Dijkstra', () => {
        expect(agents.getAgentTier('Dijkstra')).toBe('commander');
      });

      it('should return coordinator for Regis', () => {
        expect(agents.getAgentTier('Regis')).toBe('coordinator');
      });

      it('should return executor for Geralt', () => {
        expect(agents.getAgentTier('Geralt')).toBe('executor');
      });

      it('should return executor for unknown agent', () => {
        expect(agents.getAgentTier('Unknown')).toBe('executor');
      });
    });

    describe('getAgentModel()', () => {
      it('should return claude config for commander', () => {
        const config = agents.getAgentModel('Dijkstra');
        expect(config.provider).toBe('claude');
      });

      it('should return claude config for coordinator', () => {
        const config = agents.getAgentModel('Regis');
        expect(config.provider).toBe('claude');
      });

      it('should return claude config for executor', () => {
        const config = agents.getAgentModel('Geralt');
        expect(config.provider).toBe('claude');
      });
    });

    describe('classifyPrompt()', () => {
      it('should classify security-related prompts to Geralt', () => {
        const result = agents.classifyPrompt('Check for security vulnerabilities');
        expect(result.agent).toBe('Geralt');
        expect(result.tier).toBe('executor');
      });

      it('should classify test-related prompts to Triss', () => {
        // Use "test" keyword without "write" to ensure Triss matches
        const result = agents.classifyPrompt('Run tests and validate results');
        expect(result.agent).toBe('Triss');
        expect(result.tier).toBe('executor');
      });

      it('should classify documentation prompts to Jaskier', () => {
        // Use "document" keyword without "write" to ensure Jaskier matches
        const result = agents.classifyPrompt('Document the API endpoints');
        expect(result.agent).toBe('Jaskier');
        expect(result.tier).toBe('executor');
      });

      it('should classify research prompts to Regis', () => {
        // Use "research" or "analyze" without "best practice"
        const result = agents.classifyPrompt('Analyze this complex algorithm');
        expect(result.agent).toBe('Regis');
        expect(result.tier).toBe('coordinator');
      });

      it('should return classification details', () => {
        const result = agents.classifyPrompt('Fix this bug');
        expect(result.agent).toBeDefined();
        expect(result.tier).toBeDefined();
        expect(result.provider).toBeDefined();
        expect(result.model).toBeDefined();
        expect(result.prompt).toBe('Fix this bug');
      });

      it('should classify quick tasks to Ciri', () => {
        const result = agents.classifyPrompt('Quick fix needed');
        expect(result.agent).toBe('Ciri');
      });

      it('should classify deploy tasks to Eskel', () => {
        const result = agents.classifyPrompt('Deploy to kubernetes');
        expect(result.agent).toBe('Eskel');
      });

      it('should classify debug tasks to Lambert', () => {
        // Use "profile" or "optimize" without "test" or "validate"
        const result = agents.classifyPrompt('Profile and optimize memory usage');
        expect(result.agent).toBe('Lambert');
      });

      it('should classify data tasks to Zoltan', () => {
        // Use "database" or "sql" keyword
        const result = agents.classifyPrompt('Create database migration');
        expect(result.agent).toBe('Zoltan');
      });

      it('should classify API tasks to Philippa', () => {
        const result = agents.classifyPrompt('Integrate with external API');
        expect(result.agent).toBe('Philippa');
      });

      it('should classify planning tasks to Dijkstra', () => {
        const result = agents.classifyPrompt('Plan the project roadmap');
        expect(result.agent).toBe('Dijkstra');
      });

      it('should default to Yennefer for unmatched prompts', () => {
        const result = agents.classifyPrompt('Some random task');
        expect(result.agent).toBe('Yennefer');
      });
    });

    describe('analyzeComplexity()', () => {
      it('should return complexity analysis', () => {
        const result = agents.analyzeComplexity('Simple task');
        expect(result).toBeDefined();
        expect(result.level).toBeDefined();
      });

      it('should identify simple tasks', () => {
        const result = agents.analyzeComplexity('Print hello');
        expect(['simple', 'low', 'basic']).toContain(result.level?.toLowerCase() || result.complexity?.toLowerCase());
      });

      it('should identify complex tasks', () => {
        const result = agents.analyzeComplexity(
          'Refactor the entire authentication system, implement OAuth2, add rate limiting, create comprehensive tests, and document the API endpoints'
        );
        expect(result).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // Provider Check Tests
  // ===========================================================================

  describe('checkProviders()', () => {
    it('should check provider health', async () => {
      const result = await agents.checkProviders();
      expect(result).toBeDefined();
    });

    it('should return status object', async () => {
      const result = await agents.checkProviders();
      expect(typeof result).toBe('object');
    });
  });
});
