/**
 * Template Expander for prompt templates
 * Based on src/cli-enhanced/input-enhancer.js templates
 * @module cli-unified/input/TemplateExpander
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { DATA_DIR } from '../core/constants.js';

const TEMPLATES_DIR = join(homedir(), DATA_DIR, 'templates');

/**
 * Built-in prompt templates
 */
export const BUILTIN_TEMPLATES = {
  'code-review': {
    name: 'Code Review',
    prompt: 'Review this code for best practices, bugs, and improvements:\n\n{{code}}',
    variables: ['code'],
    agent: 'Vesemir'
  },
  'explain': {
    name: 'Explain Code',
    prompt: 'Explain this {{language}} code in detail:\n\n{{code}}',
    variables: ['language', 'code'],
    agent: 'Jaskier'
  },
  'refactor': {
    name: 'Refactor',
    prompt: 'Refactor this code to improve {{aspect}}:\n\n{{code}}',
    variables: ['aspect', 'code'],
    agent: 'Yennefer'
  },
  'test': {
    name: 'Write Tests',
    prompt: 'Write comprehensive tests for this {{language}} code:\n\n{{code}}',
    variables: ['language', 'code'],
    agent: 'Triss'
  },
  'debug': {
    name: 'Debug',
    prompt: 'Debug this code. The issue is: {{issue}}\n\n{{code}}',
    variables: ['issue', 'code'],
    agent: 'Lambert'
  },
  'document': {
    name: 'Document',
    prompt: 'Write documentation for this code including JSDoc/docstrings:\n\n{{code}}',
    variables: ['code'],
    agent: 'Jaskier'
  },
  'security': {
    name: 'Security Audit',
    prompt: 'Perform a security audit on this code, looking for vulnerabilities:\n\n{{code}}',
    variables: ['code'],
    agent: 'Geralt'
  },
  'optimize': {
    name: 'Optimize',
    prompt: 'Optimize this code for {{goal}} (performance/memory/readability):\n\n{{code}}',
    variables: ['goal', 'code'],
    agent: 'Lambert'
  },
  'api': {
    name: 'API Integration',
    prompt: 'Create an integration with {{api}} API that {{action}}',
    variables: ['api', 'action'],
    agent: 'Philippa'
  },
  'database': {
    name: 'Database Query',
    prompt: 'Write a {{dbType}} query to {{action}}',
    variables: ['dbType', 'action'],
    agent: 'Zoltan'
  },
  'architecture': {
    name: 'Architecture Review',
    prompt: 'Review the architecture of this {{type}} and suggest improvements:\n\n{{description}}',
    variables: ['type', 'description'],
    agent: 'Yennefer'
  },
  'convert': {
    name: 'Convert Code',
    prompt: 'Convert this {{fromLang}} code to {{toLang}}:\n\n{{code}}',
    variables: ['fromLang', 'toLang', 'code'],
    agent: 'Ciri'
  }
};

/**
 * Template Expander class
 */
export class TemplateExpander extends EventEmitter {
  constructor(options = {}) {
    super();

    this.templates = { ...BUILTIN_TEMPLATES };
    this.variables = new Map();
    this.templatesDir = options.templatesDir || TEMPLATES_DIR;

    this._loadCustomTemplates();
  }

  /**
   * Load custom templates from disk
   */
  _loadCustomTemplates() {
    try {
      if (existsSync(this.templatesDir)) {
        const files = readdirSync(this.templatesDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const template = JSON.parse(readFileSync(join(this.templatesDir, file), 'utf-8'));
          const name = basename(file, '.json');
          this.templates[name] = template;
        }
      }
    } catch {
      // No custom templates
    }
  }

  /**
   * Get template by name
   */
  get(name) {
    return this.templates[name] || null;
  }

  /**
   * List all templates
   */
  list() {
    return Object.entries(this.templates).map(([key, template]) => ({
      key,
      name: template.name,
      variables: template.variables,
      agent: template.agent
    }));
  }

  /**
   * Apply template with variables
   */
  apply(name, vars = {}) {
    const template = this.templates[name];
    if (!template) return null;

    let prompt = template.prompt;

    // Replace provided variables
    for (const [key, value] of Object.entries(vars)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Replace stored variables
    for (const [key, value] of this.variables) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return {
      prompt,
      agent: template.agent,
      unresolvedVars: this._findUnresolvedVars(prompt)
    };
  }

  /**
   * Find unresolved variables in text
   */
  _findUnresolvedVars(text) {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return matches.map(m => m.slice(2, -2));
  }

  /**
   * Set a variable
   */
  setVariable(name, value) {
    this.variables.set(name, value);
    this.emit('variableSet', name, value);
  }

  /**
   * Get a variable
   */
  getVariable(name) {
    return this.variables.get(name);
  }

  /**
   * Clear all variables
   */
  clearVariables() {
    this.variables.clear();
  }

  /**
   * List all variables
   */
  listVariables() {
    return Object.fromEntries(this.variables);
  }

  /**
   * Expand variables in text
   */
  expand(text) {
    let expanded = text;

    for (const [name, value] of this.variables) {
      expanded = expanded.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), value);
    }

    return {
      text: expanded,
      unresolvedVars: this._findUnresolvedVars(expanded)
    };
  }

  /**
   * Parse text for variable placeholders
   */
  parse(text) {
    const vars = this._findUnresolvedVars(text);
    const resolved = new Map();

    for (const varName of vars) {
      if (this.variables.has(varName)) {
        resolved.set(varName, this.variables.get(varName));
      }
    }

    return {
      template: text,
      variables: vars,
      resolved,
      missing: vars.filter(v => !resolved.has(v))
    };
  }

  /**
   * Create custom template
   */
  create(name, template) {
    // Extract variables from prompt
    if (!template.variables) {
      template.variables = this._findUnresolvedVars(template.prompt);
    }

    this.templates[name] = template;

    // Save to file
    try {
      if (!existsSync(this.templatesDir)) {
        mkdirSync(this.templatesDir, { recursive: true });
      }
      writeFileSync(
        join(this.templatesDir, `${name}.json`),
        JSON.stringify(template, null, 2)
      );
    } catch (error) {
      console.error('Failed to save template:', error.message);
    }

    this.emit('templateCreated', name, template);
  }

  /**
   * Delete a template
   */
  delete(name) {
    if (BUILTIN_TEMPLATES[name]) {
      throw new Error('Cannot delete built-in template');
    }

    if (!this.templates[name]) {
      return false;
    }

    delete this.templates[name];

    try {
      const filePath = join(this.templatesDir, `${name}.json`);
      if (existsSync(filePath)) {
        require('fs').unlinkSync(filePath);
      }
    } catch {
      // Ignore file deletion errors
    }

    this.emit('templateDeleted', name);
    return true;
  }

  /**
   * Check if template exists
   */
  has(name) {
    return name in this.templates;
  }

  /**
   * Get template count
   */
  get count() {
    return Object.keys(this.templates).length;
  }
}

export function createTemplateExpander(options) {
  return new TemplateExpander(options);
}

export default TemplateExpander;
