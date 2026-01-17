import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOLS } from '../src/tools.js';

describe('TOOLS schema', () => {
  it('defines unique tool names', () => {
    const names = TOOLS.map((tool) => tool.name);
    const unique = new Set(names);
    assert.equal(unique.size, names.length, 'Tool names must be unique');
  });

  it('ensures required fields exist in properties', () => {
    for (const tool of TOOLS) {
      const required = tool.inputSchema?.required || [];
      const properties = tool.inputSchema?.properties || {};
      for (const key of required) {
        assert.ok(
          properties[key],
          `Tool ${tool.name} missing schema for required field: ${key}`
        );
      }
    }
  });
});
