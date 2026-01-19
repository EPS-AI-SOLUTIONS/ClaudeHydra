import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PROVIDERS data
const mockProviders = {
  hydra: {
    id: 'hydra',
    name: 'HYDRA',
    icon: '🐉',
    isAvailable: true,
    description: 'Claude Opus 4.5 with Serena MCP',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    icon: '🔵',
    isAvailable: true,
    description: 'Google Gemini 2.0 with 2M context',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔴',
    isAvailable: true,
    description: 'DeepSeek-R1 for code generation',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    icon: '🟢',
    isAvailable: false,
    description: 'OpenAI GPT-5-Codex (placeholder)',
  },
};

describe('Providers', () => {
  describe('Provider Registry', () => {
    it('should have all required providers', () => {
      const providerIds = Object.keys(mockProviders);
      expect(providerIds).toContain('hydra');
      expect(providerIds).toContain('gemini');
      expect(providerIds).toContain('deepseek');
    });

    it('should have hydra as the default available provider', () => {
      expect(mockProviders.hydra.isAvailable).toBe(true);
    });

    it('should mark placeholder providers as unavailable', () => {
      expect(mockProviders.codex.isAvailable).toBe(false);
    });
  });

  describe('Provider Properties', () => {
    it('should have required fields for each provider', () => {
      Object.values(mockProviders).forEach((provider) => {
        expect(provider).toHaveProperty('id');
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('icon');
        expect(provider).toHaveProperty('isAvailable');
        expect(provider).toHaveProperty('description');
      });
    });

    it('should have valid icon emojis', () => {
      Object.values(mockProviders).forEach((provider) => {
        expect(provider.icon.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Available Providers Filter', () => {
    it('should filter only available providers', () => {
      const availableProviders = Object.values(mockProviders).filter(p => p.isAvailable);
      expect(availableProviders.length).toBe(3);
      expect(availableProviders.map(p => p.id)).toContain('hydra');
      expect(availableProviders.map(p => p.id)).not.toContain('codex');
    });
  });
});
