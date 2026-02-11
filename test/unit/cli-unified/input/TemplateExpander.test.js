/**
 * TemplateExpander Tests
 * @module test/unit/cli-unified/input/TemplateExpander.test
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
}));

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  DATA_DIR: '.claude-test',
}));

import {
  BUILTIN_TEMPLATES,
  createTemplateExpander,
  TemplateExpander,
} from '../../../../src/cli-unified/input/TemplateExpander.js';

describe('TemplateExpander', () => {
  let expander;

  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(false);
    readdirSync.mockReturnValue([]);
    expander = new TemplateExpander({ templatesDir: '/test/templates' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Built-in Templates Tests
  // ===========================================================================

  describe('BUILTIN_TEMPLATES', () => {
    it('should define code-review template', () => {
      expect(BUILTIN_TEMPLATES['code-review']).toBeDefined();
      expect(BUILTIN_TEMPLATES['code-review'].variables).toContain('code');
    });

    it('should define explain template', () => {
      expect(BUILTIN_TEMPLATES.explain).toBeDefined();
      expect(BUILTIN_TEMPLATES.explain.variables).toContain('language');
      expect(BUILTIN_TEMPLATES.explain.variables).toContain('code');
    });

    it('should define refactor template', () => {
      expect(BUILTIN_TEMPLATES.refactor).toBeDefined();
      expect(BUILTIN_TEMPLATES.refactor.variables).toContain('aspect');
    });

    it('should define test template', () => {
      expect(BUILTIN_TEMPLATES.test).toBeDefined();
      expect(BUILTIN_TEMPLATES.test.agent).toBe('Triss');
    });

    it('should define debug template', () => {
      expect(BUILTIN_TEMPLATES.debug).toBeDefined();
      expect(BUILTIN_TEMPLATES.debug.variables).toContain('issue');
    });

    it('should define security template', () => {
      expect(BUILTIN_TEMPLATES.security).toBeDefined();
      expect(BUILTIN_TEMPLATES.security.agent).toBe('Geralt');
    });

    it('should have all templates with required fields', () => {
      for (const [_key, template] of Object.entries(BUILTIN_TEMPLATES)) {
        expect(template.name).toBeDefined();
        expect(template.prompt).toBeDefined();
        expect(Array.isArray(template.variables)).toBe(true);
        expect(template.agent).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create expander instance', () => {
      expect(expander).toBeInstanceOf(TemplateExpander);
    });

    it('should initialize with built-in templates', () => {
      expect(expander.count).toBe(Object.keys(BUILTIN_TEMPLATES).length);
    });

    it('should load custom templates from disk', () => {
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue(['custom.json']);
      readFileSync.mockReturnValue(
        JSON.stringify({
          name: 'Custom Template',
          prompt: 'Custom {{var}}',
          variables: ['var'],
          agent: 'Geralt',
        }),
      );

      const exp = new TemplateExpander({ templatesDir: '/test/templates' });

      expect(exp.has('custom')).toBe(true);
    });

    it('should handle missing templates directory', () => {
      existsSync.mockReturnValue(false);

      const exp = new TemplateExpander({ templatesDir: '/test/templates' });

      expect(exp.count).toBe(Object.keys(BUILTIN_TEMPLATES).length);
    });

    it('should handle invalid custom template files', () => {
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue(['invalid.json']);
      readFileSync.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      // Should not throw
      const exp = new TemplateExpander({ templatesDir: '/test/templates' });
      expect(exp).toBeInstanceOf(TemplateExpander);
    });
  });

  // ===========================================================================
  // Template Management Tests
  // ===========================================================================

  describe('get()', () => {
    it('should return template by name', () => {
      const template = expander.get('code-review');

      expect(template).not.toBeNull();
      expect(template.name).toBe('Code Review');
    });

    it('should return null for non-existent template', () => {
      expect(expander.get('nonexistent')).toBeNull();
    });
  });

  describe('list()', () => {
    it('should return list of all templates', () => {
      const list = expander.list();

      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(Object.keys(BUILTIN_TEMPLATES).length);

      const item = list.find((t) => t.key === 'code-review');
      expect(item).toBeDefined();
      expect(item.name).toBe('Code Review');
      expect(item.variables).toContain('code');
      expect(item.agent).toBe('Vesemir');
    });
  });

  describe('has()', () => {
    it('should return true for existing template', () => {
      expect(expander.has('code-review')).toBe(true);
    });

    it('should return false for non-existent template', () => {
      expect(expander.has('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('should return number of templates', () => {
      expect(expander.count).toBe(Object.keys(BUILTIN_TEMPLATES).length);
    });
  });

  // ===========================================================================
  // Apply Tests
  // ===========================================================================

  describe('apply()', () => {
    it('should apply template with variables', () => {
      const result = expander.apply('code-review', {
        code: 'function test() {}',
      });

      expect(result.prompt).toContain('function test() {}');
      expect(result.agent).toBe('Vesemir');
    });

    it('should return null for non-existent template', () => {
      expect(expander.apply('nonexistent', {})).toBeNull();
    });

    it('should track unresolved variables', () => {
      const result = expander.apply('explain', { code: 'code here' });

      expect(result.unresolvedVars).toContain('language');
    });

    it('should use stored variables', () => {
      expander.setVariable('language', 'JavaScript');

      const result = expander.apply('explain', { code: 'code here' });

      expect(result.prompt).toContain('JavaScript');
      expect(result.unresolvedVars).not.toContain('language');
    });

    it('should replace all occurrences of a variable', () => {
      // Create a template with duplicate variables
      expander.create('multi-var', {
        name: 'Multi Var',
        prompt: '{{lang}} code in {{lang}} format',
        variables: ['lang'],
        agent: 'Ciri',
      });

      const result = expander.apply('multi-var', { lang: 'Python' });

      expect(result.prompt).toBe('Python code in Python format');
    });
  });

  // ===========================================================================
  // Variable Management Tests
  // ===========================================================================

  describe('setVariable()', () => {
    it('should set variable', () => {
      expander.setVariable('code', 'function test() {}');

      expect(expander.getVariable('code')).toBe('function test() {}');
    });

    it('should emit variableSet event', () => {
      const spy = vi.fn();
      expander.on('variableSet', spy);

      expander.setVariable('code', 'test');

      expect(spy).toHaveBeenCalledWith('code', 'test');
    });
  });

  describe('getVariable()', () => {
    it('should return variable value', () => {
      expander.setVariable('test', 'value');

      expect(expander.getVariable('test')).toBe('value');
    });

    it('should return undefined for non-existent variable', () => {
      expect(expander.getVariable('nonexistent')).toBeUndefined();
    });
  });

  describe('clearVariables()', () => {
    it('should clear all variables', () => {
      expander.setVariable('var1', 'value1');
      expander.setVariable('var2', 'value2');

      expander.clearVariables();

      expect(expander.getVariable('var1')).toBeUndefined();
      expect(expander.getVariable('var2')).toBeUndefined();
    });
  });

  describe('listVariables()', () => {
    it('should return all variables as object', () => {
      expander.setVariable('var1', 'value1');
      expander.setVariable('var2', 'value2');

      const vars = expander.listVariables();

      expect(vars.var1).toBe('value1');
      expect(vars.var2).toBe('value2');
    });

    it('should return empty object when no variables', () => {
      expect(expander.listVariables()).toEqual({});
    });
  });

  // ===========================================================================
  // Expand Tests
  // ===========================================================================

  describe('expand()', () => {
    it('should expand variables in text', () => {
      expander.setVariable('name', 'World');

      const result = expander.expand('Hello, {{name}}!');

      expect(result.text).toBe('Hello, World!');
      expect(result.unresolvedVars).toHaveLength(0);
    });

    it('should track unresolved variables', () => {
      const result = expander.expand('Hello, {{name}}! You are {{age}} years old.');

      expect(result.text).toContain('{{name}}');
      expect(result.unresolvedVars).toContain('name');
      expect(result.unresolvedVars).toContain('age');
    });

    it('should handle text without variables', () => {
      const result = expander.expand('Plain text');

      expect(result.text).toBe('Plain text');
      expect(result.unresolvedVars).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Parse Tests
  // ===========================================================================

  describe('parse()', () => {
    it('should parse text for variables', () => {
      const result = expander.parse('Hello, {{name}}! You are {{age}} years old.');

      expect(result.template).toBe('Hello, {{name}}! You are {{age}} years old.');
      expect(result.variables).toContain('name');
      expect(result.variables).toContain('age');
      expect(result.missing).toContain('name');
      expect(result.missing).toContain('age');
    });

    it('should identify resolved variables', () => {
      expander.setVariable('name', 'John');

      const result = expander.parse('Hello, {{name}}! You are {{age}} years old.');

      expect(result.resolved.get('name')).toBe('John');
      expect(result.missing).toContain('age');
      expect(result.missing).not.toContain('name');
    });

    it('should handle text without variables', () => {
      const result = expander.parse('Plain text');

      expect(result.variables).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Custom Template Tests
  // ===========================================================================

  describe('create()', () => {
    it('should create custom template', () => {
      expander.create('custom', {
        name: 'Custom Template',
        prompt: 'Custom prompt with {{var}}',
        agent: 'Geralt',
      });

      expect(expander.has('custom')).toBe(true);
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should auto-extract variables from prompt', () => {
      expander.create('auto-vars', {
        name: 'Auto Vars',
        prompt: 'Hello {{name}}, you have {{count}} items',
        agent: 'Ciri',
      });

      const template = expander.get('auto-vars');
      expect(template.variables).toContain('name');
      expect(template.variables).toContain('count');
    });

    it('should create directory if not exists', () => {
      existsSync.mockReturnValue(false);

      expander.create('custom', {
        name: 'Custom',
        prompt: 'Test',
        variables: [],
        agent: 'Geralt',
      });

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should emit templateCreated event', () => {
      const spy = vi.fn();
      expander.on('templateCreated', spy);

      expander.create('custom', {
        name: 'Custom',
        prompt: 'Test',
        variables: [],
        agent: 'Geralt',
      });

      expect(spy).toHaveBeenCalledWith('custom', expect.any(Object));
    });
  });

  describe('delete()', () => {
    it('should delete custom template', () => {
      existsSync.mockReturnValue(true);

      expander.create('custom', {
        name: 'Custom',
        prompt: 'Test',
        variables: [],
        agent: 'Geralt',
      });

      const result = expander.delete('custom');

      expect(result).toBe(true);
      expect(expander.has('custom')).toBe(false);
    });

    it('should throw when deleting built-in template', () => {
      expect(() => expander.delete('code-review')).toThrow('Cannot delete built-in template');
    });

    it('should return false for non-existent template', () => {
      expect(expander.delete('nonexistent')).toBe(false);
    });

    it('should emit templateDeleted event', () => {
      const spy = vi.fn();
      expander.on('templateDeleted', spy);

      expander.create('custom', {
        name: 'Custom',
        prompt: 'Test',
        variables: [],
        agent: 'Geralt',
      });
      expander.delete('custom');

      expect(spy).toHaveBeenCalledWith('custom');
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createTemplateExpander()', () => {
    it('should create new TemplateExpander instance', () => {
      const exp = createTemplateExpander({ templatesDir: '/test/templates' });

      expect(exp).toBeInstanceOf(TemplateExpander);
    });
  });
});
