import ToolRegistry from '../../src/tool-registry.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Server Integration & Tool Loading', () => {
  const toolsDir = path.join(__dirname, '../../src/tools');

  test('ToolRegistry should load all tools from src/tools', async () => {
    await ToolRegistry.loadTools();
    const tools = ToolRegistry.getAllTools();
    
    // Check if we have tools
    expect(tools.length).toBeGreaterThan(0);
    
    // Check for specific tools created in previous blocks
    const names = tools.map(t => t.name);
    expect(names).toContain('read_file');       // Filesystem
    expect(names).toContain('run_shell_command'); // Shell
    expect(names).toContain('knowledge_add');   // Knowledge
    expect(names).toContain('hydra_swarm');     // Swarm Bridge
  });

  test('ToolRegistry should return tool executable', async () => {
    await ToolRegistry.loadTools();
    const tool = ToolRegistry.getTool('read_file');
    expect(tool).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  test('Filesystem tools should validate paths', async () => {
    await ToolRegistry.loadTools();
    const readFile = ToolRegistry.getTool('read_file');
    
    // Attempt to read outside root (should fail validation)
    try {
        await readFile.execute({ path: '../../windows/system32/drivers/etc/hosts' });
        fail('Should have thrown access denied error');
    } catch (e) {
        expect(e.message).toMatch(/Access denied/);
    }
  });
});