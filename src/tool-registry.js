import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.toolsPath = path.join(__dirname, 'tools');
  }

  async loadTools() {
    Logger.info('Loading tools...');
    
    if (!fs.existsSync(this.toolsPath)) {
      Logger.warn('Tools directory not found.');
      return;
    }

    const files = fs.readdirSync(this.toolsPath).filter(f => f.endsWith('.js'));
    
    for (const file of files) {
      try {
        const fullPath = path.join(this.toolsPath, file);
        const moduleUrl = pathToFileURL(fullPath).href;
        
        const toolModule = await import(moduleUrl);
        const tools = Array.isArray(toolModule.default) ? toolModule.default : [toolModule.default];
        
        tools.forEach(tool => {
          if (tool && tool.name && tool.execute) {
            this.tools.set(tool.name, tool);
            Logger.debug(`Registered tool: ${tool.name}`);
          }
        });
      } catch (error) {
        Logger.error(`Failed to load tools from ${file}`, { error: error.message });
      }
    }
    
    Logger.info(`Total tools loaded: ${this.tools.size}`);
  }

  getTool(name) {
    return this.tools.get(name);
  }

  getAllTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));
  }
}

export default new ToolRegistry();
